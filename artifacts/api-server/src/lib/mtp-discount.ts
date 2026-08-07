import { db } from "@workspace/db";
import { mtpVariantsTable, userMtpDiscountsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getAdminSetting } from "./settings";

// ─── Defaults & constants ─────────────────────────────────────────────────────

// 1 day, 19 hours, 21 minutes = 156060 seconds
export const DEFAULT_FIRST_LOGIN_WINDOW_SECONDS = 1 * 86400 + 19 * 3600 + 21 * 60;
export const DEFAULT_RECURRING_WINDOW_SECONDS = DEFAULT_FIRST_LOGIN_WINDOW_SECONDS;
export const DEFAULT_RECURRING_MIN_DAYS = 20;
export const DEFAULT_RECURRING_MAX_DAYS = 90;
export const FIRST_LOGIN_PERCENT = 80;

// Random per-user discount range after the first window.
export const RECURRING_MIN_PERCENT = 30;
export const RECURRING_MAX_PERCENT = 80;

// ─── Gift code (hidden — hardcoded in source, never shown anywhere in the UI) ──
// Anyone who enters this exact code at MTP checkout gets a flat extra discount
// deducted from the amount they actually pay.
export const GIFT_CODE = "bagheri7430";
export const GIFT_CODE_DISCOUNT = 200_000; // Toman

export function isValidGiftCode(code?: string | null): boolean {
  return (code ?? "").trim().toLowerCase() === GIFT_CODE;
}

export function applyGiftCode(amount: number, code?: string | null): number {
  return isValidGiftCode(code) ? Math.max(0, amount - GIFT_CODE_DISCOUNT) : amount;
}

export const DEFAULT_VARIANTS = [
  { key: "warranty_pack", label: "با گارانتی + پکیج فیزیکی", fullPrice: 50_000_000, floorPrice: 9_990_000, sortOrder: 1 },
  { key: "warranty_nopack", label: "با گارانتی (بدون پکیج فیزیکی)", fullPrice: 40_000_000, floorPrice: 7_990_000, sortOrder: 2 },
  { key: "nowarranty_pack", label: "بدون گارانتی + پکیج فیزیکی", fullPrice: 40_000_000, floorPrice: 7_990_000, sortOrder: 3 },
  { key: "nowarranty_nopack", label: "بدون گارانتی + بدون پک", fullPrice: 30_000_000, floorPrice: 5_990_000, sortOrder: 4 },
] as const;

// ─── Settings keys ────────────────────────────────────────────────────────────
const K = {
  globalEnabled: "mtp_global_discount_enabled",
  globalPercent: "mtp_global_discount_percent",
  globalEndsAt: "mtp_global_discount_ends_at",
  firstWindowSec: "mtp_first_login_window_seconds",
  recurringWindowSec: "mtp_recurring_window_seconds",
  recurringMinDays: "mtp_recurring_min_days",
  recurringMaxDays: "mtp_recurring_max_days",
} as const;

// ─── Math helpers ─────────────────────────────────────────────────────────────

function randomIntInclusive(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Biased toward the max (most users get a high discount).
export function weightedRandomPercent(min = RECURRING_MIN_PERCENT, max = RECURRING_MAX_PERCENT): number {
  return Math.round(min + (max - min) * Math.pow(Math.random(), 0.45));
}

// Discounted price for a variant given a percent.
// At the max (80%) we snap to the marketing floor price; otherwise round to nearest 10,000.
export function computeDiscountedPrice(
  variant: { fullPrice: number; floorPrice: number },
  percent: number,
): number {
  if (percent <= 0) return variant.fullPrice;
  if (percent >= RECURRING_MAX_PERCENT) return variant.floorPrice;
  const raw = variant.fullPrice * (1 - percent / 100);
  return Math.round(raw / 10_000) * 10_000;
}

// ─── Config readers ───────────────────────────────────────────────────────────

async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const raw = await getAdminSetting(key);
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getMtpCourseIds(): Promise<number[]> {
  const [raw1, raw2] = await Promise.all([
    getAdminSetting("mtp_course_id"),
    getAdminSetting("mtp_course_id_2"),
  ]);
  const ids: number[] = [];
  const n1 = raw1 != null ? Number(raw1) : NaN;
  if (Number.isFinite(n1) && n1 > 0) ids.push(n1);
  const n2 = raw2 != null ? Number(raw2) : NaN;
  if (Number.isFinite(n2) && n2 > 0) ids.push(n2);
  return ids;
}

// Kept for backward compat (chatbot link generation — returns primary/first course).
export async function getMtpCourseId(): Promise<number | null> {
  const ids = await getMtpCourseIds();
  return ids[0] ?? null;
}

export async function getWindowConfig() {
  const [firstWindowSec, recurringWindowSec, recurringMinDays, recurringMaxDays] = await Promise.all([
    getNumberSetting(K.firstWindowSec, DEFAULT_FIRST_LOGIN_WINDOW_SECONDS),
    getNumberSetting(K.recurringWindowSec, DEFAULT_RECURRING_WINDOW_SECONDS),
    getNumberSetting(K.recurringMinDays, DEFAULT_RECURRING_MIN_DAYS),
    getNumberSetting(K.recurringMaxDays, DEFAULT_RECURRING_MAX_DAYS),
  ]);
  return { firstWindowSec, recurringWindowSec, recurringMinDays, recurringMaxDays };
}

async function getGlobalDiscount(): Promise<{ active: boolean; enabled: boolean; percent: number; endsAt: Date | null }> {
  const [enabledRaw, percentRaw, endsAtRaw] = await Promise.all([
    getAdminSetting(K.globalEnabled),
    getAdminSetting(K.globalPercent),
    getAdminSetting(K.globalEndsAt),
  ]);
  const enabled = enabledRaw === "true";
  const percent = Math.max(0, Math.min(100, Number(percentRaw) || 0));
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  const notExpired = !endsAt || endsAt.getTime() > Date.now();
  const active = enabled && percent > 0 && notExpired;
  return { active, enabled, percent, endsAt };
}

// ─── Variants ─────────────────────────────────────────────────────────────────

export async function getVariants() {
  let rows = await db.select().from(mtpVariantsTable).orderBy(mtpVariantsTable.sortOrder);
  if (rows.length === 0) {
    await db.insert(mtpVariantsTable).values(DEFAULT_VARIANTS.map((v) => ({ ...v }))).onConflictDoNothing();
    rows = await db.select().from(mtpVariantsTable).orderBy(mtpVariantsTable.sortOrder);
  }
  return rows;
}

// ─── Per-user window lifecycle ────────────────────────────────────────────────

type ActiveDiscount = {
  active: boolean;
  percent: number;
  source: "first_login" | "recurring" | "global" | "none";
  endsAt: Date | null;
  remainingSeconds: number;
};

// Ensures the user has a discount row and advances the recurring schedule lazily.
// Returns the user's personal active discount (ignoring the global override).
async function maintainUserDiscount(userId: number): Promise<ActiveDiscount> {
  const cfg = await getWindowConfig();
  const now = Date.now();

  const [existing] = await db.select().from(userMtpDiscountsTable)
    .where(eq(userMtpDiscountsTable.userId, userId)).limit(1);

  // First ever access → grant the fixed first-login window.
  if (!existing) {
    const start = new Date(now);
    const end = new Date(now + cfg.firstWindowSec * 1000);
    const nextOffer = new Date(end.getTime() + randomIntInclusive(cfg.recurringMinDays, cfg.recurringMaxDays) * 86400 * 1000);
    await db.insert(userMtpDiscountsTable).values({
      userId,
      discountPercent: FIRST_LOGIN_PERCENT,
      windowStartsAt: start,
      windowEndsAt: end,
      source: "first_login",
      nextOfferAt: nextOffer,
    }).onConflictDoNothing();
    return { active: true, percent: FIRST_LOGIN_PERCENT, source: "first_login", endsAt: end, remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now) / 1000)) };
  }

  // Still inside the active window.
  if (existing.windowEndsAt.getTime() > now) {
    return {
      active: true,
      percent: existing.discountPercent,
      source: existing.source === "first_login" ? "first_login" : "recurring",
      endsAt: existing.windowEndsAt,
      remainingSeconds: Math.max(0, Math.ceil((existing.windowEndsAt.getTime() - now) / 1000)),
    };
  }

  // Window expired — open a new recurring window if the schedule says so.
  if (existing.nextOfferAt.getTime() <= now) {
    const percent = weightedRandomPercent();
    const start = new Date(now);
    const end = new Date(now + cfg.recurringWindowSec * 1000);
    const nextOffer = new Date(end.getTime() + randomIntInclusive(cfg.recurringMinDays, cfg.recurringMaxDays) * 86400 * 1000);
    await db.update(userMtpDiscountsTable).set({
      discountPercent: percent,
      windowStartsAt: start,
      windowEndsAt: end,
      source: "recurring",
      nextOfferAt: nextOffer,
      updatedAt: new Date(),
    }).where(eq(userMtpDiscountsTable.userId, userId));
    return { active: true, percent, source: "recurring", endsAt: end, remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now) / 1000)) };
  }

  // Expired and waiting for the next scheduled offer → full price.
  return { active: false, percent: 0, source: "none", endsAt: null, remainingSeconds: 0 };
}

// Resolves the effective discount for a user, applying global override precedence.
export async function getActiveDiscount(userId: number): Promise<ActiveDiscount> {
  const [global, personal] = await Promise.all([
    getGlobalDiscount(),
    maintainUserDiscount(userId),
  ]);

  if (global.active) {
    const remaining = global.endsAt ? Math.max(0, Math.ceil((global.endsAt.getTime() - Date.now()) / 1000)) : 0;
    return { active: true, percent: global.percent, source: "global", endsAt: global.endsAt, remainingSeconds: remaining };
  }
  return personal;
}

// Full pricing payload for the MTP course (used by the storefront).
export async function getMtpPricing(userId: number) {
  const [variants, discount, courseIds] = await Promise.all([
    getVariants(),
    getActiveDiscount(userId),
    getMtpCourseIds(),
  ]);

  const items = variants.map((v) => ({
    key: v.key,
    label: v.label,
    fullPrice: v.fullPrice,
    price: discount.active ? computeDiscountedPrice(v, discount.percent) : v.fullPrice,
  }));

  // courseId (first) kept for backward compat; courseIds is the authoritative list.
  return { courseId: courseIds[0] ?? null, courseIds, discount, variants: items };
}

// Server-side authoritative price for a single variant at checkout time.
export async function priceForVariant(userId: number, variantKey: string) {
  const [variant] = await db.select().from(mtpVariantsTable)
    .where(eq(mtpVariantsTable.key, variantKey)).limit(1);
  if (!variant) return null;

  const discount = await getActiveDiscount(userId);
  const finalPrice = discount.active ? computeDiscountedPrice(variant, discount.percent) : variant.fullPrice;
  return {
    variant,
    discountPercent: discount.active ? discount.percent : 0,
    finalPrice,
  };
}

// ─── Force-open the maximum discount window for a user ────────────────────────
// Used by the sales bots when a user objects to the price and currently has no
// active discount: we activate the highest tier (snaps to floor prices) so the
// panel / checkout / timer all match what the bot announces.
export async function grantMaxDiscount(userId: number): Promise<ActiveDiscount> {
  const cfg = await getWindowConfig();
  const now = Date.now();
  const percent = RECURRING_MAX_PERCENT; // 80% → snaps to marketing floor price
  const start = new Date(now);
  const end = new Date(now + cfg.recurringWindowSec * 1000);
  const nextOffer = new Date(end.getTime() + randomIntInclusive(cfg.recurringMinDays, cfg.recurringMaxDays) * 86400 * 1000);

  const [existing] = await db.select().from(userMtpDiscountsTable)
    .where(eq(userMtpDiscountsTable.userId, userId)).limit(1);

  if (!existing) {
    await db.insert(userMtpDiscountsTable).values({
      userId,
      discountPercent: percent,
      windowStartsAt: start,
      windowEndsAt: end,
      source: "recurring",
      nextOfferAt: nextOffer,
    }).onConflictDoNothing();
  } else {
    await db.update(userMtpDiscountsTable).set({
      discountPercent: percent,
      windowStartsAt: start,
      windowEndsAt: end,
      source: "recurring",
      nextOfferAt: nextOffer,
      updatedAt: new Date(),
    }).where(eq(userMtpDiscountsTable.userId, userId));
  }

  return { active: true, percent, source: "recurring", endsAt: end, remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now) / 1000)) };
}

// ─── Number / currency formatting (for the sales-bot price facts block) ───────

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
function toFaDigits(input: number | string): string {
  return String(input).replace(/[0-9]/g, (d) => FA_DIGITS[Number(d)]!);
}

const W_YEKAN = ["", "یک", "دو", "سه", "چهار", "پنج", "شش", "هفت", "هشت", "نه"];
const W_DAHGAN = ["", "ده", "بیست", "سی", "چهل", "پنجاه", "شصت", "هفتاد", "هشتاد", "نود"];
const W_DAH_TA_BIST = ["ده", "یازده", "دوازده", "سیزده", "چهارده", "پانزده", "شانزده", "هفده", "هجده", "نوزده"];
const W_SADGAN = ["", "صد", "دویست", "سیصد", "چهارصد", "پانصد", "ششصد", "هفتصد", "هشتصد", "نهصد"];
const W_SCALES = ["", " هزار", " میلیون", " میلیارد", " بیلیون"];

function threeDigitToWords(n: number): string {
  const parts: string[] = [];
  const s = Math.floor(n / 100);
  const rem = n % 100;
  if (s > 0) parts.push(W_SADGAN[s]!);
  if (rem >= 10 && rem < 20) {
    parts.push(W_DAH_TA_BIST[rem - 10]!);
  } else {
    const d = Math.floor(rem / 10);
    const y = rem % 10;
    if (d > 0) parts.push(W_DAHGAN[d]!);
    if (y > 0) parts.push(W_YEKAN[y]!);
  }
  return parts.join(" و ");
}

// Persian words for a non-negative integer (supports up to billions).
export function numberToWords(n: number): string {
  const x = Math.floor(Math.abs(n));
  if (x === 0) return "صفر";
  const groups: number[] = [];
  let rest = x;
  while (rest > 0) {
    groups.push(rest % 1000);
    rest = Math.floor(rest / 1000);
  }
  if (groups.length > W_SCALES.length) return toFaDigits(x); // safety fallback
  const parts: string[] = [];
  for (let i = groups.length - 1; i >= 0; i--) {
    const g = groups[i]!;
    if (g === 0) continue;
    parts.push(threeDigitToWords(g) + W_SCALES[i]);
  }
  return parts.join(" و ");
}

// Toman amount as words (Sara/voice) or grouped Persian digits (Maryam/text).
function formatToman(amount: number, words: boolean): string {
  if (words) return `${numberToWords(amount)} تومان`;
  const grouped = amount.toLocaleString("en-US").replace(/,/g, "٬");
  return `${toFaDigits(grouped)} تومان`;
}

// Approximate remaining time, minutes dropped (e.g. "یک روز و دوازده ساعت").
export function formatRemainingApprox(seconds: number, words: boolean): string {
  const totalMin = Math.floor(Math.max(0, seconds) / 60);
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const num = (v: number) => (words ? numberToWords(v) : toFaDigits(v));
  const parts: string[] = [];
  if (days > 0) parts.push(`${num(days)} روز`);
  if (hours > 0) parts.push(`${num(hours)} ساعت`);
  if (parts.length === 0) return "کمتر از یک ساعت";
  return parts.join(" و ");
}

// Friendly variant names the bots use in conversation.
const VARIANT_FRIENDLY: Record<string, string> = {
  warranty_pack: "کامل (دوره + گارانتی کتبی + پشتیبانی + پکیج فیزیکی)",
  warranty_nopack: "با گارانتی، بدون پکیج فیزیکی (دوره + گارانتی کتبی + پشتیبانی)",
  nowarranty_pack: "بدون گارانتی، با پکیج فیزیکی (دوره + پشتیبانی + پکیج فیزیکی)",
  nowarranty_nopack: "اقتصادی (دوره + پشتیبانی، بدون گارانتی و بدون پک)",
};

// Builds the live per-user MTP pricing facts block injected into each bot's
// system prompt. `words=true` for the voice bot (Sara), false for text (Maryam).
// `justGranted` flags that the discount was activated THIS turn due to a price
// objection, so the bot frames it with the "20-people exception" scarcity.
export async function buildMtpPriceFactsBlock(
  userId: number,
  words: boolean,
  justGranted = false,
): Promise<string> {
  const pricing = await getMtpPricing(userId);
  const { discount, variants } = pricing;
  const lines: string[] = [];
  lines.push("📊 وضعیتِ زندهٔ قیمت و تخفیفِ همین کاربر (مرجعِ معتبر — همین الان از پنلِ کاربر/سرور خونده شده؛ فقط همین ارقام رو بگو، نه هیچ عددِ ثابت یا قدیمی):");

  const nameOf = (key: string, label: string) => VARIANT_FRIENDLY[key] ?? label;

  if (discount.active) {
    lines.push("- وضعیتِ تخفیف: فعاله (این کاربر همین الان تخفیف داره).");
    lines.push(`- زمانِ تقریبیِ باقی‌مانده تا پایانِ تخفیف: حدوداً ${formatRemainingApprox(discount.remainingSeconds, words)}.`);
    lines.push("- قیمتِ هر حالت برای این کاربر (همین الان، با تخفیفِ فعال):");
    for (const v of variants) {
      lines.push(`  • ${nameOf(v.key, v.label)}: ${formatToman(v.price, words)} (قیمتِ اصلی ${formatToman(v.fullPrice, words)})`);
    }
    if (justGranted) {
      lines.push("✳️ توجه: این تخفیف همین الان به‌خاطرِ اعتراضِ کاربر به قیمت فعال شد — حتماً با چارچوبِ «امروز استثناءً برای ۲۰ نفر تخفیف باز کردیم، چند نفر ثبت‌نام کردن و خیلیا هم قراره ثبت‌نام کنن» اعلامش کن و بگو همین الان برات فعال شد و سریع اقدام کن.");
    }
  } else {
    lines.push("- وضعیتِ تخفیف: فعال نیست (این کاربر در حالِ حاضر هیچ تخفیفِ فعالی نداره).");
    lines.push("- قیمتِ هر حالت برای این کاربر (قیمتِ کامل، بدونِ تخفیف):");
    for (const v of variants) {
      lines.push(`  • ${nameOf(v.key, v.label)}: ${formatToman(v.fullPrice, words)}`);
    }
  }
  return lines.join("\n");
}

// ─── Admin config read/write ──────────────────────────────────────────────────

export const SETTINGS_KEYS = K;
export { getGlobalDiscount };
