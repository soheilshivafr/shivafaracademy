import { Router } from "express";
import { db } from "@workspace/db";
import {
  userLeadProfilesTable, leadEventsTable, advisorRequestsTable,
  usersTable, aiChatMessagesTable,
} from "@workspace/db";
import { eq, desc, and, lt } from "drizzle-orm";
import { requireUser, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { sendPushToUser } from "./push";

// In-memory dedup: track last nudge time per user (reset on restart)
const lastNudgeSent = new Map<number, number>();
const MIN_NUDGE_INTERVAL_MS = 72 * 60 * 60 * 1000; // 72h between nudges per user

const router = Router();

const LEAD_STATUS_WEIGHTS: Record<string, number> = {
  cold: 0, warm: 1, hot: 2, customer: 3, vip: 4, ambassador: 5,
};

function higherStatus(a: string, b: string): string {
  return (LEAD_STATUS_WEIGHTS[a] ?? 0) >= (LEAD_STATUS_WEIGHTS[b] ?? 0) ? a : b;
}

export async function getOrCreateLeadProfile(userId: number) {
  const [existing] = await db
    .select().from(userLeadProfilesTable)
    .where(eq(userLeadProfilesTable.userId, userId)).limit(1);
  if (existing) return existing;
  const [created] = await db.insert(userLeadProfilesTable)
    .values({ userId, leadStatus: "cold" }).returning();
  return created;
}

export async function upgradeLeadStatus(userId: number, toStatus: string) {
  const profile = await getOrCreateLeadProfile(userId);
  const better = higherStatus(toStatus, profile.leadStatus);
  if (better !== profile.leadStatus) {
    await db.update(userLeadProfilesTable)
      .set({ leadStatus: better, updatedAt: new Date() })
      .where(eq(userLeadProfilesTable.userId, userId));
  }
}

export async function recordLeadEvent(
  userId: number,
  eventType: string,
  productName?: string,
  metadata?: Record<string, unknown>,
) {
  await db.insert(leadEventsTable).values({
    userId,
    eventType,
    productName: productName ?? null,
    metadata: metadata ? JSON.stringify(metadata) : null,
  });
}

// ── Section 17: Multi-Dimensional Lead Scoring Engine ────────────────────────

// Point values per event type
const EVENT_SCORE: Record<string, number> = {
  chat_started: 3,
  product_view: 5,
  advisor_request: 25,
  price_asked: 12,
  guarantee_asked: 12,
  loan_asked: 12,
  sara_requested: 20,
  purchase_intent: 35,
  purchase_link_sent: 20,
  readiness_high: 20,    // self-reported 7-10/10
  readiness_medium: 8,   // self-reported 4-6/10
  objection_raised: -5,  // raised objection (overcome-able but shows friction)
  sara_session: 15,      // completed a voice call with Sara
  purchase: 50,          // self-reported completed purchase/registration
};

// Message intent patterns for scoring incoming text
const HIGH_INTENT_RE = /می‌خوام ثبت‌نام|لینک خرید|چطور پرداخت|شرایط ثبت‌نام|می‌خوام بخرم|خرید کنم|ثبت‌نام کنم|پرداخت کنم/;
const MEDIUM_INTENT_RE = /قیمت|هزینه|شرایط|ضمانت|گارانتی|وام|اقساط|چقدره|چند تومن/;
const SARA_RE = /سارا|مشاور صوتی|تماس صوتی|صحبت صوتی/;
const NEGATIVE_RE = /فعلاً قصد ندارم|بعداً|فرصت ندارم|نمی‌خوام|علاقه ندارم/;

/**
 * Section 17: Compute lead score (0-100) from events + current message,
 * then persist the score and lifecycle stage to the profile.
 * Returns the computed score.
 */
export async function computeAndSaveLeadScore(
  userId: number,
  currentMessage?: string,
): Promise<number> {
  const [profile, events] = await Promise.all([
    getOrCreateLeadProfile(userId),
    db.select({ eventType: leadEventsTable.eventType })
      .from(leadEventsTable)
      .where(eq(leadEventsTable.userId, userId))
      .orderBy(desc(leadEventsTable.createdAt))
      .limit(50),
  ]);

  let score = 0;

  // 1. Historical events
  for (const ev of events) {
    score += EVENT_SCORE[ev.eventType] ?? 0;
  }

  // 2. Current message intent
  if (currentMessage) {
    if (HIGH_INTENT_RE.test(currentMessage)) score += 35;
    else if (MEDIUM_INTENT_RE.test(currentMessage)) score += 10;
    if (SARA_RE.test(currentMessage)) score += 15;
    if (NEGATIVE_RE.test(currentMessage)) score -= 20;
  }

  // 3. Lead status baseline (ensures consistency with manual updates)
  const statusBonus: Record<string, number> = {
    cold: 0, warm: 15, hot: 40, customer: 70, vip: 85, ambassador: 95,
  };
  const baselineFromStatus = statusBonus[profile.leadStatus] ?? 0;
  // Use max of event-based score and status baseline so manual upgrades are reflected
  score = Math.max(score, baselineFromStatus);

  // 4. Clamp
  const finalScore = Math.min(100, Math.max(0, score));

  // 5. Derive Section 12 lifecycle stage
  let lifecycleStage: string;
  if (profile.leadStatus === "ambassador") lifecycleStage = "ambassador";
  else if (profile.leadStatus === "vip") lifecycleStage = "vip_student";
  else if (profile.leadStatus === "customer") lifecycleStage = "active_student";
  else if (finalScore >= 90) lifecycleStage = "very_hot_lead";
  else if (finalScore >= 70) lifecycleStage = "hot_lead";
  else if (finalScore >= 40) lifecycleStage = "warm_lead";
  else if (finalScore >= 5) lifecycleStage = "lead";
  else lifecycleStage = "visitor";

  // 6. Persist (fire-and-forget safe)
  await db
    .update(userLeadProfilesTable)
    .set({ leadScore: finalScore, lifecycleStage, updatedAt: new Date() })
    .where(eq(userLeadProfilesTable.userId, userId));

  return finalScore;
}

// ── Buyer Intent Score (0-100) — purchase-readiness, separate from leadScore ──

// Purchase-readiness weights (distinct from EVENT_SCORE which measures general engagement)
const BUYER_INTENT_EVENT: Record<string, number> = {
  purchase: 60,
  purchase_intent: 40,
  purchase_link_sent: 25,
  advisor_request: 25,
  readiness_high: 20,
  sara_requested: 15,
  price_asked: 15,
  guarantee_asked: 12,
  loan_asked: 12,
  readiness_medium: 8,
  product_view: 4,
  chat_started: 1,
  objection_raised: -6,
};

// Strong registration/purchase questions (heaviest current-message signal)
const REGISTRATION_RE = /می‌خوام ثبت‌نام|چطور ثبت‌نام|چجوری ثبت‌نام|لینک ثبت‌نام|لینک خرید|چطور پرداخت|چجوری پرداخت|شرایط ثبت‌نام|می‌خوام بخرم|خرید کنم|ثبت‌نام کنم|پرداخت کنم|کارت به کارت|شماره کارت/;
// Off-topic / time-wasting / pure curiosity signals (penalize buyer intent)
const OFFTOPIC_RE = /فقط می‌پرسم|همینجوری پرسیدم|کنجکاو بودم|شوخی|جوک|بیخیال|ولش کن|چیزی نمی‌خوام|فقط نگاه می‌کنم|فقط دارم می‌بینم/;

/**
 * Compute a Buyer Intent Score (0-100) measuring likelihood-to-purchase.
 * This is intentionally separate from (and weighted differently than) leadScore.
 * Signals: purchase-readiness events, self-reported seriousness, registration/price
 * questions, info completeness, engagement/return depth — minus curiosity/off-topic.
 * Persists buyer_intent_score and returns it.
 */
export async function computeAndSaveBuyerIntentScore(
  userId: number,
  currentMessage?: string,
): Promise<number> {
  const [profile, events] = await Promise.all([
    getOrCreateLeadProfile(userId),
    db
      .select({ eventType: leadEventsTable.eventType })
      .from(leadEventsTable)
      .where(eq(leadEventsTable.userId, userId))
      .orderBy(desc(leadEventsTable.createdAt))
      .limit(60),
  ]);

  let score = 0;

  // 1. Purchase-readiness events
  for (const ev of events) {
    score += BUYER_INTENT_EVENT[ev.eventType] ?? 0;
  }

  // 2. Self-reported seriousness (میزان جدیت) — heavy weight
  const r = profile.readinessScore;
  if (r !== null && r !== undefined) {
    if (r >= 9) score += 25;
    else if (r >= 7) score += 18;
    else if (r >= 5) score += 8;
    else score -= 5; // explicitly not serious
  }

  // 3. Current-message intent (strongest live signal)
  if (currentMessage) {
    if (REGISTRATION_RE.test(currentMessage)) score += 30;
    else if (MEDIUM_INTENT_RE.test(currentMessage)) score += 8;
    if (NEGATIVE_RE.test(currentMessage)) score -= 18;
    if (OFFTOPIC_RE.test(currentMessage)) score -= 12;
  }

  // 4. Info completeness (تکمیل کامل اطلاعات) — up to +15
  const completionFields = [
    profile.jobStatus, profile.currentIncome, profile.maritalStatus,
    profile.investmentCapacity, profile.goals, profile.motivations,
  ];
  const filled = completionFields.filter(v => v !== null && v !== undefined && v !== "").length;
  score += Math.min(15, filled * 3);

  // 5. Engagement / return depth (تعامل + دفعات بازگشت) — up to +10
  score += Math.min(10, Math.floor(events.length * 0.8));

  // 6. Status floor for proven buyers
  if (profile.leadStatus === "customer" || profile.leadStatus === "vip" || profile.leadStatus === "ambassador") {
    score = Math.max(score, 85);
  }

  const finalScore = Math.min(100, Math.max(0, score));

  await db
    .update(userLeadProfilesTable)
    .set({ buyerIntentScore: finalScore, updatedAt: new Date() })
    .where(eq(userLeadProfilesTable.userId, userId));

  return finalScore;
}

// ── Section 11/15: Lead Memory Update Helper ────────────────────────────────

/**
 * Persist memory fields (goals, motivations, objections, financialPersonality,
 * readinessScore, conversationStage) onto the lead profile.
 * Only writes a field when the new value is non-empty AND the profile field is
 * not already set — so earlier (higher-quality) observations are preserved.
 * objections is treated as a JSON string[] and merged additively.
 */
export async function updateLeadMemory(
  userId: number,
  updates: {
    goals?: string;
    motivations?: string;
    pains?: string;
    pleasures?: string;
    objections?: string;
    financialPersonality?: string;
    readinessScore?: number;
    conversationStage?: string;
    maritalStatus?: string;
    currentIncome?: string;
    jobStatus?: string;
    investmentCapacity?: string;
  },
): Promise<void> {
  if (Object.keys(updates).length === 0) return;
  const profile = await getOrCreateLeadProfile(userId);
  const patch: Record<string, unknown> = { updatedAt: new Date() };

  if (updates.goals && !profile.goals) patch.goals = updates.goals;
  if (updates.motivations && !profile.motivations) patch.motivations = updates.motivations;
  if (updates.pains && !profile.pains) patch.pains = updates.pains;
  if (updates.pleasures && !profile.pleasures) patch.pleasures = updates.pleasures;

  if (updates.objections) {
    const prev: string[] = profile.objections
      ? (JSON.parse(profile.objections) as string[])
      : [];
    const incoming: string[] = JSON.parse(updates.objections) as string[];
    const merged = [...new Set([...prev, ...incoming])];
    if (merged.length !== prev.length) patch.objections = JSON.stringify(merged);
  }

  if (updates.financialPersonality && !profile.financialPersonality) {
    patch.financialPersonality = updates.financialPersonality;
  }

  if (
    updates.readinessScore !== undefined &&
    (profile.readinessScore === null || profile.readinessScore === undefined)
  ) {
    patch.readinessScore = updates.readinessScore;
  }

  if (updates.conversationStage) patch.conversationStage = updates.conversationStage;

  if (updates.maritalStatus && !profile.maritalStatus) patch.maritalStatus = updates.maritalStatus;
  if (updates.currentIncome && !profile.currentIncome) patch.currentIncome = updates.currentIncome;
  if (updates.jobStatus && !profile.jobStatus) patch.jobStatus = updates.jobStatus;
  if (updates.investmentCapacity && !profile.investmentCapacity) patch.investmentCapacity = updates.investmentCapacity;

  if (Object.keys(patch).length <= 1) return;
  await db
    .update(userLeadProfilesTable)
    .set(patch)
    .where(eq(userLeadProfilesTable.userId, userId));
}

// ── Section 13: Qualification Engine (5-Pillar Score) ──────────────────────

/**
 * Section 13: Compute and persist a qualification score (0–100) from five pillars:
 *   Pillar 1 · Need      (0–20) — clear pain/problem
 *   Pillar 2 · Goal      (0–20) — specific income/business target
 *   Pillar 3 · Motivation(0–20) — strong "why"
 *   Pillar 4 · Readiness (0–20) — self-reported Q7 or inferred
 *   Pillar 5 · Engagement(0–20) — message depth + event breadth
 */
export async function computeAndSaveQualificationScore(userId: number): Promise<number> {
  const [profile, events, recentMessages] = await Promise.all([
    getOrCreateLeadProfile(userId),
    db
      .select({ eventType: leadEventsTable.eventType })
      .from(leadEventsTable)
      .where(eq(leadEventsTable.userId, userId))
      .orderBy(desc(leadEventsTable.createdAt))
      .limit(60),
    db
      .select({ role: aiChatMessagesTable.role, content: aiChatMessagesTable.content })
      .from(aiChatMessagesTable)
      .where(eq(aiChatMessagesTable.userId, userId))
      .orderBy(desc(aiChatMessagesTable.createdAt))
      .limit(30),
  ]);

  const eventTypes = new Set(events.map(e => e.eventType));
  const userText = recentMessages
    .filter(m => m.role === "user")
    .map(m => m.content)
    .join(" ");

  // Pillar 1 · Need (0–20)
  let needScore = 0;
  if (eventTypes.has("product_view") || eventTypes.has("price_asked")) needScore += 8;
  if (eventTypes.has("advisor_request") || eventTypes.has("sara_requested")) needScore += 6;
  if (/ناراضی|مشکل|کافی نیست|کم‌درآمد|بیکار|کنارگذاشتم|تغییر شغل/i.test(userText)) needScore += 6;

  // Pillar 2 · Goal (0–20)
  let goalScore = 0;
  if (profile.goals) goalScore += 10;
  if (/میلیون|تومن|درآمد.*می‌خوام|هدفم|دوست دارم.*درآمد/i.test(userText)) goalScore += 6;
  if (/ماهانه|ماهی|ماه دیگه|سال آینده|یه سال/i.test(userText)) goalScore += 4;

  // Pillar 3 · Motivation (0–20)
  let motivationScore = 0;
  if (profile.motivations) motivationScore += 8;
  if (/خانواده|بچه|فرزند|همسر/i.test(userText)) motivationScore += 12;
  else if (/آزادی|استقلال|جایگزین شغل|کارم.*رو ول/i.test(userText)) motivationScore += 10;
  else if (/امنیت|آینده|بازنشستگی/i.test(userText)) motivationScore += 8;
  else if (/ثروت|پول|درآمد بیشتر/i.test(userText)) motivationScore += 6;
  motivationScore = Math.min(20, motivationScore);

  // Pillar 4 · Readiness (0–20)
  let readinessScore = 0;
  const savedR = profile.readinessScore;
  if (savedR !== null && savedR !== undefined) {
    if (savedR >= 8) readinessScore = 20;
    else if (savedR >= 6) readinessScore = 14;
    else if (savedR >= 4) readinessScore = 8;
    else readinessScore = 3;
  } else if (eventTypes.has("purchase_intent")) readinessScore = 20;
  else if (eventTypes.has("readiness_high")) readinessScore = 18;
  else if (eventTypes.has("purchase_link_sent")) readinessScore = 16;
  else if (eventTypes.has("readiness_medium")) readinessScore = 10;

  // Pillar 5 · Engagement (0–20)
  const userMsgCount = recentMessages.filter(m => m.role === "user").length;
  const engagementScore = Math.min(20, Math.floor(userMsgCount * 1.2 + events.length * 1.5));

  const total = Math.min(100, needScore + goalScore + motivationScore + readinessScore + engagementScore);

  await db
    .update(userLeadProfilesTable)
    .set({ qualificationScore: total, updatedAt: new Date() })
    .where(eq(userLeadProfilesTable.userId, userId));

  return total;
}

// ── Shared CRM memory block (used by both text chat & voice advisor) ─────────

const MOTIVATION_LABELS: Record<string, string> = {
  family: "خانواده",
  freedom: "آزادی و استقلال شغلی",
  security: "امنیت و آیندهٔ مالی",
  wealth: "ثروت و درآمد بیشتر",
};
const OBJECTION_LABELS: Record<string, string> = {
  price: "قیمت / بودجه",
  time: "کمبود وقت",
  thinking: "نیاز به فکر کردن",
  family_approval: "نیاز به مشورت با خانواده",
  trust: "بی‌اعتمادی یا تجربهٔ بد قبلی",
};
const PERSONALITY_LABELS: Record<string, string> = {
  risk_taker: "ریسک‌پذیر",
  value_driven: "ارزش‌محور",
  risk_avoider: "محتاط / ریسک‌گریز",
  price_sensitive: "حساس به قیمت",
};
const STAGE_LABELS: Record<string, string> = {
  discovery: "کشف نیاز",
  presentation: "معرفی محصول",
  closing: "بستن فروش",
};

type LeadMemoryInput = {
  goals?: string | null;
  motivations?: string | null;
  pains?: string | null;
  pleasures?: string | null;
  objections?: string | null;
  financialPersonality?: string | null;
  readinessScore?: number | null;
  conversationStage?: string | null;
  lastInterestedProduct?: string | null;
  favoriteProduct?: string | null;
  maritalStatus?: string | null;
  currentIncome?: string | null;
  jobStatus?: string | null;
  investmentCapacity?: string | null;
};

const JOB_STATUS_LABELS: Record<string, string> = {
  employee: "کارمند",
  freelancer: "شغل آزاد",
  business_owner: "صاحب کسب‌وکار",
  student: "دانشجو",
  unemployed: "بیکار",
  other: "سایر",
};
const INCOME_LABELS: Record<string, string> = {
  under10: "کمتر از ۱۰ میلیون",
  "10to20": "۱۰ تا ۲۰ میلیون",
  "20to50": "۲۰ تا ۵۰ میلیون",
  "50to100": "۵۰ تا ۱۰۰ میلیون",
  above100: "بالاتر از ۱۰۰ میلیون",
};
const MARITAL_LABELS: Record<string, string> = {
  single: "مجرد",
  married: "متأهل",
};
const INVESTMENT_LABELS: Record<string, string> = {
  none: "فعلاً هیچ مبلغی",
  upto5: "تا ۵ میلیون",
  "5to20": "۵ تا ۲۰ میلیون",
  above20: "بالای ۲۰ میلیون",
  will_provide: "در صورت مناسب بودن مسیر تأمین می‌کند",
};

/**
 * Build a Persian "CRM memory" block from a lead profile, to be injected into
 * the system prompt of BOTH the text chatbot and the voice advisor so the
 * assistant remembers persona/goals/objections across sessions and channels.
 * Returns "" when there is nothing meaningful to remember.
 */
export function buildLeadMemoryBlock(profile: LeadMemoryInput): string {
  const lines: string[] = [];

  if (profile.goals) {
    let goalsText = profile.goals;
    try {
      const parsed = JSON.parse(profile.goals);
      if (Array.isArray(parsed)) goalsText = parsed.join("، ");
    } catch { /* plain string */ }
    if (goalsText.trim()) lines.push(`هدف درآمدیِ کاربر (قبلاً گفته — دوباره نپرس): ${goalsText}`);
  }

  if (profile.motivations) {
    lines.push(`انگیزهٔ اصلی: ${MOTIVATION_LABELS[profile.motivations] ?? profile.motivations}`);
  }

  if (profile.pains?.trim()) {
    lines.push(`رنج‌ها و دردهای کاربر (قبلاً گفته — دوباره نپرس): ${profile.pains.trim()}`);
  }

  if (profile.pleasures?.trim()) {
    lines.push(`لذت‌ها و خواسته‌های کاربر (قبلاً گفته — دوباره نپرس): ${profile.pleasures.trim()}`);
  }

  if (profile.objections) {
    try {
      const arr = JSON.parse(profile.objections) as string[];
      if (Array.isArray(arr) && arr.length > 0) {
        const labels = arr.map(o => OBJECTION_LABELS[o] ?? o);
        lines.push(`اعتراض‌هایی که قبلاً مطرح کرده: ${labels.join("، ")}`);
      }
    } catch { /* ignore */ }
  }

  if (profile.financialPersonality) {
    lines.push(`تیپ مالی: ${PERSONALITY_LABELS[profile.financialPersonality] ?? profile.financialPersonality}`);
  }

  if (profile.readinessScore !== null && profile.readinessScore !== undefined) {
    lines.push(`میزان آمادگی برای شروع (خودگفته): ${profile.readinessScore} از ۱۰`);
  }

  if (profile.jobStatus) {
    lines.push(`وضعیت شغلی (قبلاً گفته — دوباره نپرس): ${JOB_STATUS_LABELS[profile.jobStatus] ?? profile.jobStatus}`);
  }
  if (profile.currentIncome) {
    lines.push(`بازهٔ درآمد فعلی (قبلاً گفته — دوباره نپرس): ${INCOME_LABELS[profile.currentIncome] ?? profile.currentIncome}`);
  }
  if (profile.maritalStatus) {
    lines.push(`وضعیت تأهل (قبلاً گفته — دوباره نپرس): ${MARITAL_LABELS[profile.maritalStatus] ?? profile.maritalStatus}`);
  }
  if (profile.investmentCapacity) {
    lines.push(`توان سرمایه‌گذاری فعلی (قبلاً گفته — دوباره نپرس): ${INVESTMENT_LABELS[profile.investmentCapacity] ?? profile.investmentCapacity}`);
  }

  if (profile.conversationStage) {
    lines.push(`مرحلهٔ گفتگوی قبلی: ${STAGE_LABELS[profile.conversationStage] ?? profile.conversationStage}`);
  }

  const interestedProduct = profile.lastInterestedProduct || profile.favoriteProduct;
  if (interestedProduct) {
    lines.push(`محصولی که قبلاً بهش علاقه نشون داده: ${interestedProduct}`);
  }

  if (lines.length === 0) return "";

  return [
    "[حافظهٔ CRM دربارهٔ این کاربر — از گفتگوهای قبلی. فقط برای شخصی‌سازی استفاده کن و عیناً به کاربر نشون نده]:",
    ...lines.map(l => `- ${l}`),
    "به این اطلاعات توجه کن: چیزهایی که قبلاً گفته رو دوباره نپرس، به هدف و انگیزه‌اش ارجاع بده، و گفتگو رو از همون‌جایی که متوقف شده ادامه بده.",
  ].join("\n");
}

export async function autoCreateAdvisorRequest(
  userId: number,
  source: string,
  interestedProduct?: string,
) {
  const [user] = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user?.phone) return;

  const existing = await db
    .select({ id: advisorRequestsTable.id })
    .from(advisorRequestsTable)
    .where(
      and(
        eq(advisorRequestsTable.userId, userId),
        eq(advisorRequestsTable.status, "new"),
      ),
    ).limit(1);
  if (existing.length > 0) return;

  await db.insert(advisorRequestsTable).values({
    userId,
    name: user.name ?? "بدون نام",
    phone: user.phone,
    interestedProduct: interestedProduct ?? null,
    source,
    status: "new",
  });
  logger.info({ userId, source }, "[LeadScoring] auto advisor request created");

  // Confirm to user that their advisor request was received
  void sendPushToUser(userId, {
    title: "✅ درخواست مشاور ثبت شد",
    body: "آقای باقری در اسرع وقت با شما تماس می‌گیرد 🙏",
    url: "/ai-chat",
  });
}

// ── Admin: lead funnel stats ──────────────────────────────────────────────────

router.get("/admin/leads/stats", requireAdmin, async (req, res) => {
  const [profiles, newRequests] = await Promise.all([
    db.select({
      userId: userLeadProfilesTable.userId,
      leadStatus: userLeadProfilesTable.leadStatus,
      lastInterestedProduct: userLeadProfilesTable.lastInterestedProduct,
      updatedAt: userLeadProfilesTable.updatedAt,
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(userLeadProfilesTable)
    .leftJoin(usersTable, eq(userLeadProfilesTable.userId, usersTable.id))
    .orderBy(desc(userLeadProfilesTable.updatedAt)),

    db.select({ id: advisorRequestsTable.id })
    .from(advisorRequestsTable)
    .where(eq(advisorRequestsTable.status, "new")),
  ]);

  const statusCounts: Record<string, number> = {
    cold: 0, warm: 0, hot: 0, customer: 0, vip: 0, ambassador: 0,
  };
  for (const p of profiles) {
    statusCounts[p.leadStatus] = (statusCounts[p.leadStatus] ?? 0) + 1;
  }

  const hotLeads = profiles
    .filter(p => p.leadStatus === "hot")
    .slice(0, 6);

  const totalLeads = profiles.length;
  const converted = (statusCounts.customer ?? 0) + (statusCounts.vip ?? 0) + (statusCounts.ambassador ?? 0);
  const conversionRate = totalLeads > 0 ? Math.round((converted / totalLeads) * 100 * 10) / 10 : 0;

  res.json({ statusCounts, newAdvisorRequests: newRequests.length, hotLeads, totalLeads, conversionRate });
});

// ── Admin: lead profiles ─────────────────────────────────────────────────────

router.get("/admin/leads", requireAdmin, async (req, res) => {
  const status = req.query["status"] as string | undefined;

  const profiles = await db
    .select({
      id: userLeadProfilesTable.id,
      userId: userLeadProfilesTable.userId,
      leadStatus: userLeadProfilesTable.leadStatus,
      leadScore: userLeadProfilesTable.leadScore,
      qualificationScore: userLeadProfilesTable.qualificationScore,
      buyerIntentScore: userLeadProfilesTable.buyerIntentScore,
      lifecycleStage: userLeadProfilesTable.lifecycleStage,
      jobStatus: userLeadProfilesTable.jobStatus,
      currentIncome: userLeadProfilesTable.currentIncome,
      maritalStatus: userLeadProfilesTable.maritalStatus,
      investmentCapacity: userLeadProfilesTable.investmentCapacity,
      favoriteProduct: userLeadProfilesTable.favoriteProduct,
      lastInterestedProduct: userLeadProfilesTable.lastInterestedProduct,
      vipStatus: userLeadProfilesTable.vipStatus,
      ambassadorStatus: userLeadProfilesTable.ambassadorStatus,
      notes: userLeadProfilesTable.notes,
      updatedAt: userLeadProfilesTable.updatedAt,
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(userLeadProfilesTable)
    .leftJoin(usersTable, eq(userLeadProfilesTable.userId, usersTable.id))
    .orderBy(desc(userLeadProfilesTable.buyerIntentScore), desc(userLeadProfilesTable.updatedAt));

  const filtered = status
    ? profiles.filter(p => p.leadStatus === status)
    : profiles;

  res.json(filtered);
});

router.patch("/admin/leads/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(req.params["userId"] as string);
  const { leadStatus, favoriteProduct, vipStatus, ambassadorStatus, notes } =
    req.body as {
      leadStatus?: string;
      favoriteProduct?: string;
      vipStatus?: boolean;
      ambassadorStatus?: boolean;
      notes?: string;
    };

  const profile = await getOrCreateLeadProfile(userId);
  const updates: Partial<typeof userLeadProfilesTable.$inferInsert> = { updatedAt: new Date() };
  if (leadStatus !== undefined) updates.leadStatus = leadStatus;
  if (favoriteProduct !== undefined) updates.favoriteProduct = favoriteProduct;
  if (vipStatus !== undefined) updates.vipStatus = vipStatus;
  if (ambassadorStatus !== undefined) updates.ambassadorStatus = ambassadorStatus;
  if (notes !== undefined) updates.notes = notes;

  const [updated] = await db
    .update(userLeadProfilesTable).set(updates)
    .where(eq(userLeadProfilesTable.id, profile.id)).returning();
  res.json(updated);
});

// ── Admin: advisor requests ───────────────────────────────────────────────────

router.get("/admin/advisor-requests", requireAdmin, async (req, res) => {
  const status = req.query["status"] as string | undefined;

  const rows = await db
    .select({
      id: advisorRequestsTable.id,
      userId: advisorRequestsTable.userId,
      name: advisorRequestsTable.name,
      phone: advisorRequestsTable.phone,
      interestedProduct: advisorRequestsTable.interestedProduct,
      source: advisorRequestsTable.source,
      status: advisorRequestsTable.status,
      notes: advisorRequestsTable.notes,
      createdAt: advisorRequestsTable.createdAt,
      updatedAt: advisorRequestsTable.updatedAt,
    })
    .from(advisorRequestsTable)
    .orderBy(desc(advisorRequestsTable.createdAt));

  const filtered = status ? rows.filter(r => r.status === status) : rows;
  res.json(filtered);
});

router.patch("/admin/advisor-requests/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  const { status, notes } = req.body as { status?: string; notes?: string };
  const updates: Partial<typeof advisorRequestsTable.$inferInsert> = { updatedAt: new Date() };
  if (status !== undefined) updates.status = status;
  if (notes !== undefined) updates.notes = notes;
  const [updated] = await db
    .update(advisorRequestsTable).set(updates)
    .where(eq(advisorRequestsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ error: "درخواست یافت نشد" }); return; }
  res.json(updated);
});

router.delete("/admin/advisor-requests/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params["id"] as string);
  await db.delete(advisorRequestsTable).where(eq(advisorRequestsTable.id, id));
  res.json({ ok: true });
});

// ── User: submit advisor request manually ────────────────────────────────────

router.post("/advisor-request", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { name, phone, interestedProduct, source } = req.body as {
    name?: string; phone?: string; interestedProduct?: string; source?: string;
  };

  const [user] = await db
    .select({ name: usersTable.name, phone: usersTable.phone })
    .from(usersTable).where(eq(usersTable.id, userId)).limit(1);

  const finalName = name?.trim() || user?.name || "بدون نام";
  const finalPhone = phone?.trim() || user?.phone || "";
  if (!finalPhone) { res.status(400).json({ error: "شماره تلفن الزامی است" }); return; }

  const [created] = await db.insert(advisorRequestsTable).values({
    userId,
    name: finalName,
    phone: finalPhone,
    interestedProduct: interestedProduct ?? null,
    source: source ?? "chatbot",
    status: "new",
  }).returning();

  await upgradeLeadStatus(userId, "hot");
  await recordLeadEvent(userId, "advisor_request", interestedProduct);

  // Confirm receipt to user
  void sendPushToUser(userId, {
    title: "✅ درخواست مشاور ثبت شد",
    body: "آقای باقری در اسرع وقت با شما تماس می‌گیرد 🙏",
    url: "/ai-chat",
  });

  res.json(created);
});

// ── User: get own lead profile ────────────────────────────────────────────────

router.get("/lead-profile", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const profile = await getOrCreateLeadProfile(userId);
  res.json(profile);
});

// ── Section 3: Auto Follow-up Engine ─────────────────────────────────────────

async function runFollowUpCycle() {
  const now = Date.now();
  const cutoff48h = new Date(now - 48 * 60 * 60 * 1000);
  const cutoff24h = new Date(now - 24 * 60 * 60 * 1000);

  // ── 1. Warm leads with no chat in 48h → gentle nudge ──────────────────────
  const warmProfiles = await db
    .select({ userId: userLeadProfilesTable.userId })
    .from(userLeadProfilesTable)
    .where(eq(userLeadProfilesTable.leadStatus, "warm"));

  let nudgedWarm = 0;
  for (const p of warmProfiles) {
    const lastSent = lastNudgeSent.get(p.userId) ?? 0;
    if (now - lastSent < MIN_NUDGE_INTERVAL_MS) continue;

    const [lastMsg] = await db
      .select({ createdAt: aiChatMessagesTable.createdAt })
      .from(aiChatMessagesTable)
      .where(eq(aiChatMessagesTable.userId, p.userId))
      .orderBy(desc(aiChatMessagesTable.createdAt))
      .limit(1);

    if (!lastMsg || lastMsg.createdAt < cutoff48h) {
      void sendPushToUser(p.userId, {
        title: "👋 می‌تونم کمکت کنم؟",
        body: "یه سوالی درباره دوره‌ها یا درآمدزایی داری؟ سارا اینجاست 😊",
        url: "/ai-chat",
      });
      lastNudgeSent.set(p.userId, now);
      nudgedWarm++;
    }
  }

  // ── 2. Hot leads with advisor_request still "new" after 24h → follow-up ───
  const hotProfiles = await db
    .select({ userId: userLeadProfilesTable.userId })
    .from(userLeadProfilesTable)
    .where(eq(userLeadProfilesTable.leadStatus, "hot"));

  let nudgedHot = 0;
  for (const p of hotProfiles) {
    const lastSent = lastNudgeSent.get(p.userId) ?? 0;
    if (now - lastSent < MIN_NUDGE_INTERVAL_MS) continue;

    const [staleReq] = await db
      .select({ id: advisorRequestsTable.id })
      .from(advisorRequestsTable)
      .where(
        and(
          eq(advisorRequestsTable.userId, p.userId),
          eq(advisorRequestsTable.status, "new"),
          lt(advisorRequestsTable.createdAt, cutoff24h),
        ),
      )
      .limit(1);

    if (staleReq) {
      void sendPushToUser(p.userId, {
        title: "📞 پیگیری درخواست مشاور",
        body: "تیم آکادمی به زودی با شما تماس می‌گیرد. در صورت نیاز فوری پیام دهید.",
        url: "/ai-chat",
      });
      lastNudgeSent.set(p.userId, now);
      nudgedHot++;
    }
  }

  logger.info(
    { warmNudges: nudgedWarm, hotNudges: nudgedHot },
    "[FollowUp] cycle complete",
  );
}

export function startFollowUpJobs() {
  const SIX_HOURS = 6 * 60 * 60 * 1000;

  // First run after 90s (let server fully boot)
  setTimeout(
    () => runFollowUpCycle().catch(err => logger.error({ err }, "[FollowUp] startup run error")),
    90_000,
  );

  setInterval(async () => {
    try {
      await runFollowUpCycle();
    } catch (err) {
      logger.error({ err }, "[FollowUp] job error");
    }
  }, SIX_HOURS);
}

export default router;
