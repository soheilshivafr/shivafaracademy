import crypto from "node:crypto";
import type { Request, Response } from "express";
import { db } from "@workspace/db";
import { trackingLinksTable, trackingAttributionsTable, usersTable, ordersTable } from "@workspace/db";
import { eq, and, gte, desc } from "drizzle-orm";

// ─── Shared helpers for the advertising tracking-link feature ─────────────

export const SLUG_RE = /^[a-z0-9-]{2,64}$/;

const KNOWN_INTERNAL_PATHS = [
  "/products",
  "/courses",
  "/podcasts",
  "/reels",
  "/tools",
  "/channel",
  "/tribe",
  "/my-courses",
  "/my-products",
];

const KNOWN_INTERNAL_PREFIXES = ["/product/", "/course/", "/f/"];

/** Prevents open-redirect: destination must be a same-site path starting with
 * "/" (no protocol-relative "//" and no backslash tricks) or a well-formed
 * http(s) URL. */
export function isSafeDestination(destination: string): boolean {
  const value = destination.trim();
  if (!value) return false;

  if (value.startsWith("/")) {
    // Reject protocol-relative URLs ("//evil.com") and backslash tricks.
    if (value.startsWith("//") || value.startsWith("/\\") || value.includes("\\")) return false;
    return true;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function isKnownInternalPath(path: string): boolean {
  if (KNOWN_INTERNAL_PATHS.includes(path)) return true;
  return KNOWN_INTERNAL_PREFIXES.some((p) => path.startsWith(p));
}

export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function randomSlug(): string {
  return crypto.randomBytes(4).toString("hex");
}

export function hashIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const pepper = process.env.JWT_SECRET ?? "tracking-links";
  return crypto.createHash("sha256").update(`${pepper}:${ip}`).digest("hex").slice(0, 32);
}

const BOT_UA_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|curl\/|wget\/|python-requests|headlesschrome/i;

export function isLikelyBot(userAgent: string | undefined): boolean {
  if (!userAgent) return true;
  return BOT_UA_RE.test(userAgent);
}

const SESSION_COOKIE = "tid_sid";
const ATTRIBUTION_COOKIE = "tid_attr";
export const ATTRIBUTION_WINDOW_DAYS = 30;

export function getOrCreateSessionId(req: Request, res: Response): string {
  const existing = req.cookies?.[SESSION_COOKIE] as string | undefined;
  if (existing) return existing;
  const sessionId = crypto.randomUUID();
  res.cookie(SESSION_COOKIE, sessionId, {
    maxAge: ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return sessionId;
}

export function setAttributionCookie(res: Response, slug: string) {
  res.cookie(ATTRIBUTION_COOKIE, slug, {
    maxAge: ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000,
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
}

export function getAttributionSlugFromCookie(req: Request): string | null {
  const value = req.cookies?.[ATTRIBUTION_COOKIE] as string | undefined;
  return value?.trim() || null;
}

export function getSessionIdFromCookie(req: Request): string | null {
  const value = req.cookies?.[SESSION_COOKIE] as string | undefined;
  return value?.trim() || null;
}

// ─── Very small in-memory sliding-window rate limiter ──────────────────────
// Good enough to blunt basic abuse of the public redirect/conversion
// endpoints without adding a new dependency or requiring Redis.
const rateBuckets = new Map<string, number[]>();

export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const hits = (rateBuckets.get(key) ?? []).filter((t) => now - t < windowMs);
  hits.push(now);
  rateBuckets.set(key, hits);
  // Opportunistic cleanup so the map doesn't grow unbounded.
  if (rateBuckets.size > 5000) {
    for (const [k, v] of rateBuckets) {
      if (v.every((t) => now - t > windowMs)) rateBuckets.delete(k);
    }
  }
  return hits.length > limit;
}

export function clientIp(req: Request): string | undefined {
  return req.ip;
}

/** Resolves the active last-click attribution (if any and not expired) for the
 * current visitor, based on the `tid_attr` cookie set by resolveTrackingLink. */
async function resolveActiveAttribution(req: Request) {
  const slug = getAttributionSlugFromCookie(req);
  if (!slug) return null;
  const [link] = await db.select().from(trackingLinksTable).where(eq(trackingLinksTable.slug, slug)).limit(1);
  return link ?? null;
}

/** Resolves the freshest (last-click, still within the 30-day window)
 * attribution recorded for a given user, regardless of which browser/cookie
 * is making the current request. This is the source of truth for
 * attributing actions that may not originate from the buyer's own browser
 * (e.g. an admin approving a card-to-card order on the buyer's behalf). */
async function resolveUserAttribution(userId: number) {
  const [row] = await db.select().from(trackingAttributionsTable)
    .where(and(eq(trackingAttributionsTable.userId, userId), gte(trackingAttributionsTable.expiresAt, new Date())))
    .orderBy(desc(trackingAttributionsTable.attributedAt))
    .limit(1);
  if (!row) return null;
  const [link] = await db.select().from(trackingLinksTable).where(eq(trackingLinksTable.id, row.trackingLinkId)).limit(1);
  return link ?? null;
}

/** Call once, right after a brand-new user account is created, so future
 * purchases/reports can be traced back to the campaign that brought them in. */
export async function attributeSignup(req: Request, res: Response, userId: number): Promise<void> {
  try {
    const link = await resolveActiveAttribution(req);
    if (!link) return;

    const sessionId = getOrCreateSessionId(req, res);
    await db.update(usersTable).set({ signupTrackingLinkId: link.id }).where(eq(usersTable.id, userId));
    await db.insert(trackingAttributionsTable).values({
      trackingLinkId: link.id,
      sessionId,
      userId,
      attributionType: "registration",
      expiresAt: new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    });
  } catch {
    // Attribution is best-effort — never block signup on it.
  }
}

/** Call once an order is confirmed "paid" so the revenue is attributed to the
 * campaign that most recently brought that user in (last-click, 30-day
 * window). `req`/`res` are only used to read/refresh the BUYER's own
 * attribution cookie — pass `null` when the confirming request is not the
 * buyer's browser (e.g. an admin approving a card-to-card order), so this
 * always falls back to the buyer's own last recorded attribution instead of
 * whatever cookie happens to be on the admin's request. */
export async function attributePurchase(
  req: Request | null,
  res: Response | null,
  orderId: number,
  userId: number,
  amount: number,
): Promise<void> {
  try {
    // Idempotency: never record more than one purchase attribution per order
    // (protects against retries/duplicate webhook deliveries).
    const [existing] = await db.select({ id: trackingAttributionsTable.id }).from(trackingAttributionsTable)
      .where(and(eq(trackingAttributionsTable.orderId, orderId), eq(trackingAttributionsTable.attributionType, "purchase")))
      .limit(1);
    if (existing) return;

    // Only trust the request's own attribution cookie when this really is
    // the buyer's browser (i.e. we have a live req/res to read/refresh it
    // from). Otherwise resolve purely from the buyer's own attribution
    // history, honoring the 30-day window.
    const link = req && res
      ? (await resolveActiveAttribution(req)) ?? (await resolveUserAttribution(userId))
      : await resolveUserAttribution(userId);
    if (!link) return;

    const sessionId = req && res ? getOrCreateSessionId(req, res) : `user:${userId}`;
    await db.update(ordersTable).set({ trackingLinkId: link.id }).where(eq(ordersTable.id, orderId));
    await db.insert(trackingAttributionsTable).values({
      trackingLinkId: link.id,
      sessionId,
      userId,
      attributionType: "purchase",
      orderId,
      amount,
      expiresAt: new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    });
  } catch {
    // Attribution is best-effort — never block payment confirmation on it.
  }
}
