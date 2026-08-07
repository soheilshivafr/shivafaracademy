import { db, voiceCallGateTable, userLeadProfilesTable, leadEventsTable, siteSettingsTable, userCoursesTable, coursesTable } from "@workspace/db";
import type { VoiceCallGate } from "@workspace/db";
import { eq, desc, sql, and, inArray } from "drizzle-orm";

/**
 * Smart voice-call gating for Sara.
 *
 * Cost control: voice calls are expensive, so not every user gets unlimited
 * access. The first call is free for everyone. After each call ends we derive a
 * tier (A/B/C/D) from the shared CRM lead score, which sets a cooldown before
 * the next call and a weekly cap. High-intent buyers (tier A) get the most
 * access; tyre-kickers / off-topic users (tier D) get the least.
 */

export type Tier = "A" | "B" | "C" | "D";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

// Grace for short, aborted calls: a brand-new user who hangs up almost
// immediately (interrupted, changed their mind, lost connection, got a phone
// call) shouldn't be locked out by the tier cooldown. Calls shorter than this
// threshold — for the user's first few calls — are forgiven: no cooldown and
// the start-of-call quota increment is refunded. Both values are tunable.
const MIN_MEANINGFUL_CALL_MS = 60 * 1000; // calls shorter than this can be forgiven
const MAX_FORGIVEN_SHORT_CALLS = 5;       // lifetime cap of forgiven short calls per user

export const TIER_RULES: Record<Tier, { cooldownMs: number; maxPerWeek: number; label: string }> = {
  A: { cooldownMs: 4 * HOUR, maxPerWeek: 20, label: "مشتری داغ" },
  B: { cooldownMs: 12 * HOUR, maxPerWeek: 10, label: "مشتری نیمه‌گرم" },
  C: { cooldownMs: 48 * HOUR, maxPerWeek: 4, label: "مشتری سرد" },
  D: { cooldownMs: 10 * DAY, maxPerWeek: 1, label: "کاربر غیرهدف" },
};

export function tierFromScore(score: number): Tier {
  if (score >= 80) return "A";
  if (score >= 60) return "B";
  if (score >= 30) return "C";
  return "D";
}

// Events / statuses that instantly promote the user to tier A regardless of score
// (filled the registration form, entered the sales flow, talked to an advisor, or paid).
const PRIORITY_EVENTS = new Set(["purchase", "purchase_intent", "purchase_link_sent", "advisor_request"]);
const PRIORITY_STATUS = new Set(["customer", "vip", "ambassador"]);

/** Derive the voice tier from the user's CRM profile + recent events. */
export async function computeVoiceTier(userId: number): Promise<{ tier: Tier; score: number }> {
  const [profile] = await db
    .select({
      leadScore: userLeadProfilesTable.leadScore,
      leadStatus: userLeadProfilesTable.leadStatus,
    })
    .from(userLeadProfilesTable)
    .where(eq(userLeadProfilesTable.userId, userId))
    .limit(1);

  const score = profile?.leadScore ?? 0;

  if (profile && PRIORITY_STATUS.has(profile.leadStatus)) {
    return { tier: "A", score: Math.max(score, 80) };
  }

  const events = await db
    .select({ eventType: leadEventsTable.eventType })
    .from(leadEventsTable)
    .where(eq(leadEventsTable.userId, userId))
    .orderBy(desc(leadEventsTable.createdAt))
    .limit(50);

  if (events.some(e => PRIORITY_EVENTS.has(e.eventType))) {
    return { tier: "A", score: Math.max(score, 80) };
  }

  return { tier: tierFromScore(score), score };
}

export async function getOrCreateGate(userId: number): Promise<VoiceCallGate> {
  const [existing] = await db
    .select().from(voiceCallGateTable)
    .where(eq(voiceCallGateTable.userId, userId)).limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(voiceCallGateTable)
    .values({ userId })
    .onConflictDoNothing()
    .returning();
  if (created) return created;

  // Lost an insert race — read the row the other writer created.
  const [again] = await db
    .select().from(voiceCallGateTable)
    .where(eq(voiceCallGateTable.userId, userId)).limit(1);
  return again!;
}

/** Reset the weekly counter once a 7-day window has elapsed. */
async function maybeResetWeek(gate: VoiceCallGate): Promise<VoiceCallGate> {
  if (Date.now() - new Date(gate.weekStartAt).getTime() >= WEEK) {
    const now = new Date();
    await db
      .update(voiceCallGateTable)
      .set({ callsThisWeek: 0, weekStartAt: now, updatedAt: now })
      .where(eq(voiceCallGateTable.userId, gate.userId));
    return { ...gate, callsThisWeek: 0, weekStartAt: now };
  }
  return gate;
}

export type GateStatus = {
  allowed: boolean;
  isFirstCall: boolean;
  tier: Tier;
  tierLabel: string;
  callsThisWeek: number;
  maxPerWeek: number;
  reason: "ok" | "first_call" | "cooldown" | "weekly_limit" | "course_blocked";
  nextCallAllowedAt: string | null;
  remainingMs: number;
  message: string;
};

function fa(n: number): string {
  return String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}

/** Human-friendly Persian "time remaining" string (e.g. «۳ ساعت و ۴۲ دقیقه»). */
export function formatRemaining(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${fa(days)} روز و ${fa(hours)} ساعت` : `${fa(days)} روز`;
  if (hours > 0) return mins > 0 ? `${fa(hours)} ساعت و ${fa(mins)} دقیقه` : `${fa(hours)} ساعت`;
  return `${fa(mins)} دقیقه`;
}

function blockedMessage(remainingMs: number): string {
  return [
    "من خیلی مشتاقم باهات صحبت کنم 😊",
    `ولی بر اساس سطح فعلی حسابت، تماس بعدی‌ات تا ${formatRemaining(remainingMs)} دیگه در دسترس نیست.`,
    "اگه سوال فوری دربارهٔ ثبت‌نام، دوره‌ها یا همکاری داری، همین حالا توی چت ازم بپرس — همون‌جا کامل کمکت می‌کنم.",
  ].join(" ");
}

/**
 * Evaluate whether the user may start a voice call right now (read-mostly:
 * only writes when a weekly window has elapsed). Never throws to the caller's
 * decision logic — callers should default-allow on error.
 */
export async function evaluateGate(userId: number): Promise<GateStatus> {
  let gate = await getOrCreateGate(userId);
  gate = await maybeResetWeek(gate);

  const tier: Tier = (gate.tier in TIER_RULES ? gate.tier : "B") as Tier;
  const rules = TIER_RULES[tier];

  const base = {
    tier,
    tierLabel: rules.label,
    callsThisWeek: gate.callsThisWeek,
    maxPerWeek: rules.maxPerWeek,
  };

  // First call is free for everyone.
  if (gate.totalCalls === 0) {
    return { ...base, allowed: true, isFirstCall: true, reason: "first_call", nextCallAllowedAt: null, remainingMs: 0, message: "" };
  }

  const now = Date.now();

  // Collect every active blocker, then surface the strictest one (the latest
  // unlock time) so the remaining-time message reflects the real earliest call.
  const blockers: { reason: "cooldown" | "weekly_limit"; at: number }[] = [];

  if (gate.callsThisWeek >= rules.maxPerWeek) {
    blockers.push({ reason: "weekly_limit", at: new Date(gate.weekStartAt).getTime() + WEEK });
  }
  if (gate.nextCallAllowedAt) {
    const nextAt = new Date(gate.nextCallAllowedAt).getTime();
    if (now < nextAt) blockers.push({ reason: "cooldown", at: nextAt });
  }

  if (blockers.length > 0) {
    const strict = blockers.reduce((a, b) => (b.at > a.at ? b : a));
    const remainingMs = Math.max(0, strict.at - now);
    return {
      ...base, allowed: false, isFirstCall: false, reason: strict.reason,
      nextCallAllowedAt: new Date(strict.at).toISOString(), remainingMs, message: blockedMessage(remainingMs),
    };
  }

  return { ...base, allowed: true, isFirstCall: false, reason: "ok", nextCallAllowedAt: null, remainingMs: 0, message: "" };
}

/**
 * Count a call against the user's quota (called when a call actually starts).
 * Done as a single atomic UPDATE — with the weekly-window reset folded in — so
 * concurrent starts (double-tap, multi-device, retries) can't lose increments
 * and overshoot the cap.
 */
export async function registerCallStart(userId: number): Promise<void> {
  await getOrCreateGate(userId); // ensure the row exists
  const weekElapsed = sql`${voiceCallGateTable.weekStartAt} <= NOW() - INTERVAL '7 days'`;
  await db
    .update(voiceCallGateTable)
    .set({
      totalCalls: sql`${voiceCallGateTable.totalCalls} + 1`,
      callsThisWeek: sql`CASE WHEN ${weekElapsed} THEN 1 ELSE ${voiceCallGateTable.callsThisWeek} + 1 END`,
      weekStartAt: sql`CASE WHEN ${weekElapsed} THEN NOW() ELSE ${voiceCallGateTable.weekStartAt} END`,
      lastCallAt: sql`NOW()`,
      updatedAt: sql`NOW()`,
    })
    .where(eq(voiceCallGateTable.userId, userId));
}

/**
 * Called when a call ends: re-score the user, store the resulting tier, and set
 * the next-call cooldown. Returns the fresh gate status so the UI can show the
 * countdown to the next allowed call.
 */
export async function finalizeCall(userId: number): Promise<GateStatus> {
  const gate = await getOrCreateGate(userId);

  // Forgive very short, aborted calls for new users. Duration is measured
  // server-side from the stored call-start time (set by registerCallStart) so
  // it can't be gamed by the client. When forgiven: clear any cooldown and
  // refund the quota increments this call consumed at start — so the call is as
  // if it never happened (free first-call status + weekly quota preserved).
  const startedAt = gate.lastCallAt ? new Date(gate.lastCallAt).getTime() : 0;
  const durationMs = startedAt ? Date.now() - startedAt : Number.MAX_SAFE_INTEGER;
  const isShortCall = durationMs < MIN_MEANINGFUL_CALL_MS;
  const withinGrace = gate.shortCallsForgiven < MAX_FORGIVEN_SHORT_CALLS;

  if (isShortCall && withinGrace) {
    await db
      .update(voiceCallGateTable)
      .set({
        totalCalls: sql`GREATEST(${voiceCallGateTable.totalCalls} - 1, 0)`,
        callsThisWeek: sql`GREATEST(${voiceCallGateTable.callsThisWeek} - 1, 0)`,
        shortCallsForgiven: sql`${voiceCallGateTable.shortCallsForgiven} + 1`,
        nextCallAllowedAt: null, // no cooldown — let them call right back
        updatedAt: new Date(),
      })
      .where(eq(voiceCallGateTable.userId, userId));
    return evaluateGate(userId);
  }

  const { tier, score } = await computeVoiceTier(userId);
  const rules = TIER_RULES[tier];
  const nextAt = new Date(Date.now() + rules.cooldownMs);
  await db
    .update(voiceCallGateTable)
    .set({ tier, score, nextCallAllowedAt: nextAt, updatedAt: new Date() })
    .where(eq(voiceCallGateTable.userId, userId));
  return evaluateGate(userId);
}

// ─── Course-based voice call filter ──────────────────────────────────────────

/**
 * Check voice call access based on admin course filter settings.
 * Supports three modes:
 *   "block" — users enrolled in listed courses are BLOCKED
 *   "allow" — only users enrolled in at least one listed course are ALLOWED
 *   "off"   — no course filter (everyone allowed, subject to other gates)
 * Falls back to legacy "voice_call_blocked_course_ids" if new settings not set.
 * Fails open on any DB error.
 */
export async function checkCourseBlock(
  userId: number,
): Promise<{ blocked: boolean; courseTitle?: string }> {
  try {
    // Read new unified filter settings
    const settings = await db
      .select({ key: siteSettingsTable.key, value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(inArray(siteSettingsTable.key, [
        "voice_call_course_filter_mode",
        "voice_call_course_filter_ids",
        "voice_call_blocked_course_ids", // legacy
      ]));

    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value ?? "";

    const mode = map["voice_call_course_filter_mode"] || "off";

    // Resolve course IDs — new key takes priority over legacy
    let courseIds: number[] = [];
    const idsRaw = map["voice_call_course_filter_ids"] || map["voice_call_blocked_course_ids"] || "[]";
    try {
      const parsed = JSON.parse(idsRaw);
      if (Array.isArray(parsed)) courseIds = parsed.filter((x): x is number => typeof x === "number");
    } catch { /* ignore */ }

    if (courseIds.length === 0) return { blocked: false };

    // Get user's enrolled course IDs
    const enrolled = await db
      .select({ courseId: userCoursesTable.courseId })
      .from(userCoursesTable)
      .where(eq(userCoursesTable.userId, userId));
    const enrolledIds = new Set(enrolled.map(e => e.courseId));

    if (mode === "block") {
      // عدم نمایش: فقط کاربرانی که دوره مسدود را دارند پنهان می‌شوند
      // کاربران بدون دوره (مثل کاربر جدید) ویجت را می‌بینند
      const hasBlockedCourse = courseIds.some(id => enrolledIds.has(id));
      if (!hasBlockedCourse) return { blocked: false };
      return { blocked: true, hideOnly: true };
    }

    if (mode === "off" && map["voice_call_blocked_course_ids"]) {
      // legacy block mode
      const blockedCourseId = courseIds.find(id => enrolledIds.has(id));
      if (blockedCourseId === undefined) return { blocked: false };
      const [course] = await db.select({ title: coursesTable.title }).from(coursesTable)
        .where(eq(coursesTable.id, blockedCourseId)).limit(1);
      return { blocked: true, courseTitle: course?.title };
    }

    if (mode === "allow") {
      // ALLOW mode: user blocked if NOT enrolled in ANY of the listed courses
      const hasAllowed = courseIds.some(id => enrolledIds.has(id));
      if (hasAllowed) return { blocked: false };
      // Find a course title to show in message
      const [course] = await db.select({ title: coursesTable.title }).from(coursesTable)
        .where(inArray(coursesTable.id, courseIds)).limit(1);
      return { blocked: true, courseTitle: course?.title };
    }

    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}

/**
 * Check chatbot access based on admin course filter settings.
 * Same modes as voice call: "block" | "allow" | "off"
 * Fails open on any DB error.
 */
export async function checkChatbotCourseAccess(
  userId: number,
): Promise<{ blocked: boolean; message?: string }> {
  try {
    const settings = await db
      .select({ key: siteSettingsTable.key, value: siteSettingsTable.value })
      .from(siteSettingsTable)
      .where(inArray(siteSettingsTable.key, [
        "chatbot_course_filter_mode",
        "chatbot_course_filter_ids",
      ]));

    const map: Record<string, string> = {};
    for (const s of settings) map[s.key] = s.value ?? "";

    const mode = map["chatbot_course_filter_mode"] || "off";
    if (mode === "off") return { blocked: false };

    let courseIds: number[] = [];
    try {
      const parsed = JSON.parse(map["chatbot_course_filter_ids"] || "[]");
      if (Array.isArray(parsed)) courseIds = parsed.filter((x): x is number => typeof x === "number");
    } catch { /* ignore */ }

    if (courseIds.length === 0) return { blocked: false };

    const enrolled = await db
      .select({ courseId: userCoursesTable.courseId })
      .from(userCoursesTable)
      .where(eq(userCoursesTable.userId, userId));
    const enrolledIds = new Set(enrolled.map(e => e.courseId));

    if (mode === "block") {
      // عدم نمایش: فقط کاربرانی که دوره مسدود را دارند پنهان می‌شوند
      // کاربران بدون دوره (مثل کاربر جدید) چت‌بات را می‌بینند
      const hasBlockedCourse = courseIds.some(id => enrolledIds.has(id));
      if (!hasBlockedCourse) return { blocked: false };
      return { blocked: true, hideOnly: true };
    }

    if (mode === "allow") {
      const hasAccess = courseIds.some(id => enrolledIds.has(id));
      return hasAccess
        ? { blocked: false }
        : { blocked: true, message: "چت‌بات فقط برای دارندگان دوره‌های خاص فعال است." };
    }

    return { blocked: false };
  } catch {
    return { blocked: false };
  }
}
