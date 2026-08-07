import { db } from "@workspace/db";
import { userItemDiscountsTable } from "@workspace/db";
import { and, eq } from "drizzle-orm";
import { getAdminSetting, setAdminSetting } from "./settings";

const DEFAULT_FIRST_WINDOW_SEC = 1 * 86400 + 19 * 3600 + 21 * 60;
const DEFAULT_RECURRING_WINDOW_SEC = DEFAULT_FIRST_WINDOW_SEC;
const DEFAULT_MIN_DAYS = 20;
const DEFAULT_MAX_DAYS = 90;
const DEFAULT_FIRST_PERCENT = 80;
const DEFAULT_RECURRING_MIN_PERCENT = 30;
const DEFAULT_RECURRING_MAX_PERCENT = 80;
// ⚠️ پنجره‌های شخصی فقط وقتی فعال می‌شوند که ادمین صریحاً enable کرده باشد
const DEFAULT_WINDOWS_ENABLED = false;

function key(type: string, id: number, suffix: string) {
  return `disc_${type}_${id}_${suffix}`;
}

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPercent(min: number, max: number) {
  return Math.round(min + (max - min) * Math.pow(Math.random(), 0.45));
}

async function getNum(k: string, fallback: number): Promise<number> {
  const raw = await getAdminSetting(k);
  const n = raw != null ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getItemDiscountConfig(type: string, id: number) {
  const [
    enabledRaw, percentRaw, endsAtRaw,
    windowsEnabledRaw,
    firstSec, recurSec, minDays, maxDays,
    firstPercent, recurMinPercent, recurMaxPercent,
  ] = await Promise.all([
    getAdminSetting(key(type, id, "global_enabled")),
    getAdminSetting(key(type, id, "global_percent")),
    getAdminSetting(key(type, id, "global_ends_at")),
    getAdminSetting(key(type, id, "windows_enabled")),
    getNum(key(type, id, "first_window_sec"), DEFAULT_FIRST_WINDOW_SEC),
    getNum(key(type, id, "recurring_window_sec"), DEFAULT_RECURRING_WINDOW_SEC),
    getNum(key(type, id, "recurring_min_days"), DEFAULT_MIN_DAYS),
    getNum(key(type, id, "recurring_max_days"), DEFAULT_MAX_DAYS),
    getNum(key(type, id, "first_window_percent"), DEFAULT_FIRST_PERCENT),
    getNum(key(type, id, "recurring_min_percent"), DEFAULT_RECURRING_MIN_PERCENT),
    getNum(key(type, id, "recurring_max_percent"), DEFAULT_RECURRING_MAX_PERCENT),
  ]);
  const enabled = enabledRaw === "true";
  const percent = Math.max(0, Math.min(100, Number(percentRaw) || 0));
  const endsAt = endsAtRaw ? new Date(endsAtRaw) : null;
  const notExpired = !endsAt || endsAt.getTime() > Date.now();
  const globalActive = enabled && percent > 0 && notExpired;
  // windowsEnabled فقط وقتی true است که ادمین صریحاً آن را فعال کرده باشد
  const windowsEnabled = windowsEnabledRaw === "true" ? true : DEFAULT_WINDOWS_ENABLED;
  return {
    global: { enabled, percent, endsAt, active: globalActive },
    windows: {
      enabled: windowsEnabled,
      firstWindowSec: firstSec,
      recurringWindowSec: recurSec,
      recurringMinDays: minDays,
      recurringMaxDays: maxDays,
      firstWindowPercent: Math.max(1, Math.min(100, Math.round(firstPercent))),
      recurringMinPercent: Math.max(1, Math.min(100, Math.round(recurMinPercent))),
      recurringMaxPercent: Math.max(1, Math.min(100, Math.round(recurMaxPercent))),
    },
  };
}

export async function saveItemGlobalDiscount(
  type: string,
  id: number,
  enabled: boolean,
  percent: number,
  endsAt: string | null,
) {
  await Promise.all([
    setAdminSetting(key(type, id, "global_enabled"), enabled ? "true" : "false"),
    setAdminSetting(key(type, id, "global_percent"), String(Math.max(0, Math.min(100, Math.round(percent))))),
    setAdminSetting(key(type, id, "global_ends_at"), endsAt ? new Date(endsAt).toISOString() : ""),
  ]);
}

export async function saveItemWindows(
  type: string,
  id: number,
  windowsEnabled: boolean,
  firstWindowSec: number,
  recurringWindowSec: number,
  recurringMinDays: number,
  recurringMaxDays: number,
  firstWindowPercent: number,
  recurringMinPercent: number,
  recurringMaxPercent: number,
) {
  await Promise.all([
    setAdminSetting(key(type, id, "windows_enabled"), windowsEnabled ? "true" : "false"),
    setAdminSetting(key(type, id, "first_window_sec"), String(Math.max(60, Math.round(firstWindowSec)))),
    setAdminSetting(key(type, id, "recurring_window_sec"), String(Math.max(60, Math.round(recurringWindowSec)))),
    setAdminSetting(key(type, id, "recurring_min_days"), String(Math.max(1, Math.round(recurringMinDays)))),
    setAdminSetting(key(type, id, "recurring_max_days"), String(Math.max(1, Math.round(recurringMaxDays)))),
    setAdminSetting(key(type, id, "first_window_percent"), String(Math.max(1, Math.min(100, Math.round(firstWindowPercent))))),
    setAdminSetting(key(type, id, "recurring_min_percent"), String(Math.max(1, Math.min(100, Math.round(recurringMinPercent))))),
    setAdminSetting(key(type, id, "recurring_max_percent"), String(Math.max(1, Math.min(100, Math.round(recurringMaxPercent))))),
  ]);
}

export type ActiveItemDiscount = {
  active: boolean;
  percent: number;
  source: "first_login" | "recurring" | "global" | "none";
  endsAt: Date | null;
  remainingSeconds: number;
};

async function maintainUserItemDiscount(
  userId: number,
  type: string,
  id: number,
  cfg: Awaited<ReturnType<typeof getItemDiscountConfig>>,
): Promise<ActiveItemDiscount> {
  const { windows } = cfg;
  // اگر پنجره‌های شخصی توسط ادمین فعال نشده باشد، هیچ تخفیفی اعمال نمی‌شود
  if (!windows.enabled) {
    return { active: false, percent: 0, source: "none", endsAt: null, remainingSeconds: 0 };
  }
  const now = Date.now();

  const [existing] = await db
    .select()
    .from(userItemDiscountsTable)
    .where(
      and(
        eq(userItemDiscountsTable.userId, userId),
        eq(userItemDiscountsTable.itemType, type),
        eq(userItemDiscountsTable.itemId, id),
      ),
    )
    .limit(1);

  if (!existing) {
    const start = new Date(now);
    const end = new Date(now + windows.firstWindowSec * 1000);
    const nextOffer = new Date(end.getTime() + randomInt(windows.recurringMinDays, windows.recurringMaxDays) * 86400 * 1000);
    const pct = windows.firstWindowPercent;
    await db.insert(userItemDiscountsTable).values({
      userId,
      itemType: type,
      itemId: id,
      discountPercent: pct,
      windowStartsAt: start,
      windowEndsAt: end,
      source: "first_login",
      nextOfferAt: nextOffer,
    });
    return { active: true, percent: pct, source: "first_login", endsAt: end, remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now) / 1000)) };
  }

  if (existing.windowEndsAt.getTime() > now) {
    return {
      active: true,
      percent: existing.discountPercent,
      source: existing.source === "first_login" ? "first_login" : "recurring",
      endsAt: existing.windowEndsAt,
      remainingSeconds: Math.max(0, Math.ceil((existing.windowEndsAt.getTime() - now) / 1000)),
    };
  }

  if (existing.nextOfferAt.getTime() <= now) {
    const percent = weightedPercent(windows.recurringMinPercent, windows.recurringMaxPercent);
    const start = new Date(now);
    const end = new Date(now + windows.recurringWindowSec * 1000);
    const nextOffer = new Date(end.getTime() + randomInt(windows.recurringMinDays, windows.recurringMaxDays) * 86400 * 1000);
    await db.update(userItemDiscountsTable)
      .set({ discountPercent: percent, windowStartsAt: start, windowEndsAt: end, source: "recurring", nextOfferAt: nextOffer, updatedAt: new Date() })
      .where(and(eq(userItemDiscountsTable.userId, userId), eq(userItemDiscountsTable.itemType, type), eq(userItemDiscountsTable.itemId, id)));
    return { active: true, percent, source: "recurring", endsAt: end, remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now) / 1000)) };
  }

  return { active: false, percent: 0, source: "none", endsAt: null, remainingSeconds: 0 };
}

export async function getActiveItemDiscount(userId: number, type: string, id: number): Promise<ActiveItemDiscount> {
  const cfg = await getItemDiscountConfig(type, id);
  const { global } = cfg;

  if (global.active) {
    const remaining = global.endsAt ? Math.max(0, Math.ceil((global.endsAt.getTime() - Date.now()) / 1000)) : 0;
    return { active: true, percent: global.percent, source: "global", endsAt: global.endsAt, remainingSeconds: remaining };
  }

  return maintainUserItemDiscount(userId, type, id, cfg);
}

export function computeDiscountedPrice(basePrice: number, percent: number): number {
  if (percent <= 0) return basePrice;
  const raw = basePrice * (1 - percent / 100);
  return Math.round(raw / 1000) * 1000;
}
