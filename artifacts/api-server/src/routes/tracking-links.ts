import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import {
  trackingLinksTable,
  trackingClicksTable,
  trackingAttributionsTable,
  ordersTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gte, lte, sql, desc, inArray } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import {
  SLUG_RE,
  slugify,
  randomSlug,
  isSafeDestination,
  hashIp,
  isLikelyBot,
  getOrCreateSessionId,
  setAttributionCookie,
  getAttributionSlugFromCookie,
  ATTRIBUTION_WINDOW_DAYS,
  isRateLimited,
  clientIp,
} from "../lib/tracking-links";

const router: IRouter = Router();

const FRONTEND_BASE_URL = () =>
  (process.env.FRONTEND_BASE_URL?.replace(/\/+$/, "") ?? "https://shivafaracademy.ir");

// ─── Admin: CRUD ────────────────────────────────────────────────────────────

// GET /admin/tracking-links
router.get("/admin/tracking-links", requireAdmin, async (_req, res) => {
  const links = await db.select().from(trackingLinksTable).orderBy(desc(trackingLinksTable.createdAt));
  res.json(
    links.map((l) => ({ ...l, shortUrl: `${FRONTEND_BASE_URL()}/r/${l.slug}` })),
  );
});

// GET /admin/tracking-links/overview — compare all campaigns
// Uses a single set of grouped aggregate queries (one query per metric,
// covering every campaign at once) instead of looping computeLinkSummary()
// per link, so this stays fast regardless of how many campaigns exist.
router.get("/admin/tracking-links/overview", requireAdmin, async (_req, res) => {
  const links = await db.select().from(trackingLinksTable).orderBy(desc(trackingLinksTable.createdAt));

  const clicksResult = await db.execute(sql`
    SELECT tracking_link_id, count(*)::int AS total, count(*) FILTER (WHERE is_unique)::int AS unique_clicks
    FROM tracking_clicks WHERE is_bot = FALSE GROUP BY tracking_link_id
  `);
  const regResult = await db.execute(sql`
    SELECT signup_tracking_link_id AS tracking_link_id, count(*)::int AS registrations
    FROM users WHERE signup_tracking_link_id IS NOT NULL GROUP BY signup_tracking_link_id
  `);
  const orderResult = await db.execute(sql`
    SELECT tracking_link_id, count(*)::int AS purchases, coalesce(sum(amount), 0)::int AS revenue
    FROM orders WHERE tracking_link_id IS NOT NULL AND status = 'paid' GROUP BY tracking_link_id
  `);

  const clicksById = new Map((clicksResult.rows as unknown as { tracking_link_id: number; total: number; unique_clicks: number }[]).map((r) => [r.tracking_link_id, r]));
  const regById = new Map((regResult.rows as unknown as { tracking_link_id: number; registrations: number }[]).map((r) => [r.tracking_link_id, r]));
  const orderById = new Map((orderResult.rows as unknown as { tracking_link_id: number; purchases: number; revenue: number }[]).map((r) => [r.tracking_link_id, r]));

  res.json(
    links.map((l) => {
      const totalClicks = clicksById.get(l.id)?.total ?? 0;
      const uniqueClicks = clicksById.get(l.id)?.unique_clicks ?? 0;
      const newRegistrations = regById.get(l.id)?.registrations ?? 0;
      const purchases = orderById.get(l.id)?.purchases ?? 0;
      return {
        id: l.id,
        title: l.title,
        slug: l.slug,
        isActive: l.isActive,
        destinationUrl: l.destinationUrl,
        shortUrl: `${FRONTEND_BASE_URL()}/r/${l.slug}`,
        totalClicks,
        uniqueClicks,
        newRegistrations,
        purchases,
        revenue: orderById.get(l.id)?.revenue ?? 0,
        registrationConversionRate: uniqueClicks > 0 ? Number(((newRegistrations / uniqueClicks) * 100).toFixed(2)) : 0,
        purchaseConversionRate: uniqueClicks > 0 ? Number(((purchases / uniqueClicks) * 100).toFixed(2)) : 0,
      };
    }),
  );
});

// POST /admin/tracking-links
router.post("/admin/tracking-links", requireAdmin, async (req, res) => {
  const { title, destinationUrl, isActive, startsAt, expiresAt } = req.body ?? {};
  let { slug } = req.body ?? {};

  if (!title?.trim()) { res.status(400).json({ error: "عنوان کمپین الزامی است" }); return; }
  if (!destinationUrl?.trim() || !isSafeDestination(destinationUrl)) {
    res.status(400).json({ error: "مقصد لینک نامعتبر است" });
    return;
  }

  if (slug?.trim()) {
    slug = slugify(slug);
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ error: "کد کوتاه فقط می‌تواند شامل حروف انگلیسی کوچک، عدد و خط تیره باشد" });
      return;
    }
  } else {
    // Auto-generate, retrying on the rare collision.
    for (let i = 0; i < 5; i++) {
      const candidate = randomSlug();
      const [exists] = await db.select({ id: trackingLinksTable.id }).from(trackingLinksTable)
        .where(eq(trackingLinksTable.slug, candidate)).limit(1);
      if (!exists) { slug = candidate; break; }
    }
  }

  const [existing] = await db.select({ id: trackingLinksTable.id }).from(trackingLinksTable)
    .where(eq(trackingLinksTable.slug, slug)).limit(1);
  if (existing) { res.status(409).json({ error: "این کد کوتاه قبلاً استفاده شده است" }); return; }

  const [link] = await db.insert(trackingLinksTable).values({
    title: title.trim(),
    slug,
    destinationUrl: destinationUrl.trim(),
    isActive: isActive ?? true,
    startsAt: startsAt ? new Date(startsAt) : null,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    createdBy: req.admin?.adminId ?? null,
  }).returning();

  res.status(201).json({ ...link, shortUrl: `${FRONTEND_BASE_URL()}/r/${link.slug}` });
});

// GET /admin/tracking-links/:id
router.get("/admin/tracking-links/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [link] = await db.select().from(trackingLinksTable).where(eq(trackingLinksTable.id, id)).limit(1);
  if (!link) { res.status(404).json({ error: "لینک یافت نشد" }); return; }
  res.json({ ...link, shortUrl: `${FRONTEND_BASE_URL()}/r/${link.slug}` });
});

// PUT /admin/tracking-links/:id
router.put("/admin/tracking-links/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [current] = await db.select().from(trackingLinksTable).where(eq(trackingLinksTable.id, id)).limit(1);
  if (!current) { res.status(404).json({ error: "لینک یافت نشد" }); return; }

  const { title, destinationUrl, isActive, startsAt, expiresAt } = req.body ?? {};
  let { slug } = req.body ?? {};

  if (destinationUrl !== undefined && (!destinationUrl.trim() || !isSafeDestination(destinationUrl))) {
    res.status(400).json({ error: "مقصد لینک نامعتبر است" });
    return;
  }

  if (slug !== undefined && slug !== current.slug) {
    slug = slugify(slug);
    if (!SLUG_RE.test(slug)) {
      res.status(400).json({ error: "کد کوتاه فقط می‌تواند شامل حروف انگلیسی کوچک، عدد و خط تیره باشد" });
      return;
    }
    const [exists] = await db.select({ id: trackingLinksTable.id }).from(trackingLinksTable)
      .where(eq(trackingLinksTable.slug, slug)).limit(1);
    if (exists) { res.status(409).json({ error: "این کد کوتاه قبلاً استفاده شده است" }); return; }
  } else {
    slug = current.slug;
  }

  const [updated] = await db.update(trackingLinksTable).set({
    title: title?.trim() ?? current.title,
    slug,
    destinationUrl: destinationUrl?.trim() ?? current.destinationUrl,
    isActive: isActive ?? current.isActive,
    startsAt: startsAt !== undefined ? (startsAt ? new Date(startsAt) : null) : current.startsAt,
    expiresAt: expiresAt !== undefined ? (expiresAt ? new Date(expiresAt) : null) : current.expiresAt,
    updatedAt: new Date(),
  }).where(eq(trackingLinksTable.id, id)).returning();

  res.json({ ...updated, shortUrl: `${FRONTEND_BASE_URL()}/r/${updated.slug}` });
});

// DELETE /admin/tracking-links/:id
router.delete("/admin/tracking-links/:id", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  await db.delete(trackingLinksTable).where(eq(trackingLinksTable.id, id));
  res.json({ success: true });
});

// GET /admin/tracking-links/:id/stats?period=daily|weekly|monthly|yearly
router.get("/admin/tracking-links/:id/stats", requireAdmin, async (req, res) => {
  const id = Number(req.params.id);
  const [link] = await db.select().from(trackingLinksTable).where(eq(trackingLinksTable.id, id)).limit(1);
  if (!link) { res.status(404).json({ error: "لینک یافت نشد" }); return; }

  const period = (req.query.period as string) === "yearly" ? "year"
    : (req.query.period as string) === "monthly" ? "month"
    : (req.query.period as string) === "weekly" ? "week"
    : "day";

  const summary = await computeLinkSummary(id);

  const trend = await db.execute(sql`
    SELECT date_trunc(${period}, clicked_at)::text AS bucket,
           count(*)::int AS clicks,
           count(*) FILTER (WHERE is_unique)::int AS unique_clicks
    FROM tracking_clicks
    WHERE tracking_link_id = ${id} AND is_bot = FALSE
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  const conversionTrend = await db.execute(sql`
    SELECT date_trunc(${period}, attributed_at)::text AS bucket,
           count(*) FILTER (WHERE attribution_type = 'registration')::int AS registrations,
           count(*) FILTER (WHERE attribution_type = 'purchase')::int AS purchases,
           coalesce(sum(amount) FILTER (WHERE attribution_type = 'purchase'), 0)::int AS revenue
    FROM tracking_attributions
    WHERE tracking_link_id = ${id}
    GROUP BY bucket
    ORDER BY bucket ASC
  `);

  const recentClicks = await db.select({
    sessionId: trackingClicksTable.sessionId,
    userId: trackingClicksTable.userId,
    referrer: trackingClicksTable.referrer,
    isUnique: trackingClicksTable.isUnique,
    isBot: trackingClicksTable.isBot,
    clickedAt: trackingClicksTable.clickedAt,
  }).from(trackingClicksTable)
    .where(eq(trackingClicksTable.trackingLinkId, id))
    .orderBy(desc(trackingClicksTable.clickedAt))
    .limit(20);

  res.json({
    link: { ...link, shortUrl: `${FRONTEND_BASE_URL()}/r/${link.slug}` },
    ...summary,
    trend: trend.rows,
    conversionTrend: conversionTrend.rows,
    recentClicks,
  });
});

async function computeLinkSummary(trackingLinkId: number) {
  const clickResult = await db.execute(sql`
    SELECT count(*)::int AS total, count(*) FILTER (WHERE is_unique)::int AS unique_clicks
    FROM tracking_clicks WHERE tracking_link_id = ${trackingLinkId} AND is_bot = FALSE
  `);
  const [clickRow] = clickResult.rows as unknown as { total: number; unique_clicks: number }[];

  const onlineResult = await db.execute(sql`
    SELECT count(DISTINCT session_id)::int AS online
    FROM tracking_clicks
    WHERE tracking_link_id = ${trackingLinkId} AND clicked_at > now() - interval '5 minutes'
  `);
  const [onlineRow] = onlineResult.rows as unknown as { online: number }[];

  const regResult = await db.execute(sql`
    SELECT count(*)::int AS registrations FROM users WHERE signup_tracking_link_id = ${trackingLinkId}
  `);
  const [regRow] = regResult.rows as unknown as { registrations: number }[];

  const loginResult = await db.execute(sql`
    SELECT count(DISTINCT user_id)::int AS logged_in
    FROM tracking_attributions
    WHERE tracking_link_id = ${trackingLinkId} AND user_id IS NOT NULL
  `);
  const [loginRow] = loginResult.rows as unknown as { logged_in: number }[];

  const orderResult = await db.execute(sql`
    SELECT count(*)::int AS purchases, coalesce(sum(amount), 0)::int AS revenue
    FROM orders WHERE tracking_link_id = ${trackingLinkId} AND status = 'paid'
  `);
  const [orderRow] = orderResult.rows as unknown as { purchases: number; revenue: number }[];

  const totalClicks = clickRow?.total ?? 0;
  const uniqueClicks = clickRow?.unique_clicks ?? 0;
  const registrations = regRow?.registrations ?? 0;
  const purchases = orderRow?.purchases ?? 0;

  return {
    totalClicks,
    uniqueClicks,
    onlineNow: onlineRow?.online ?? 0,
    newRegistrations: registrations,
    loggedInUsers: loginRow?.logged_in ?? 0,
    purchases,
    revenue: orderRow?.revenue ?? 0,
    registrationConversionRate: uniqueClicks > 0 ? Number(((registrations / uniqueClicks) * 100).toFixed(2)) : 0,
    purchaseConversionRate: uniqueClicks > 0 ? Number(((purchases / uniqueClicks) * 100).toFixed(2)) : 0,
  };
}

// ─── Public: resolve + conversion (used by the frontend and the /r/:slug redirect) ──

// GET /tracking/resolve/:slug — used by the top-level redirect handler in app.ts
router.get("/tracking/resolve/:slug", async (req: Request, res: Response) => {
  const slug = String(req.params.slug).toLowerCase().trim();
  const result = await resolveTrackingLink(req, res, slug);
  if (result.status !== "ok") { res.status(404).json({ error: "لینک یافت نشد یا غیرفعال است" }); return; }
  res.json({ destinationUrl: result.link.destinationUrl });
});

// POST /tracking/conversion — optional explicit conversion signal from the client
// (e.g. a lead form submit) beyond the automatic registration/purchase hooks.
router.post("/tracking/conversion", async (req: Request, res: Response) => {
  const ip = clientIp(req);
  if (isRateLimited(`conv:${ip}`, 30, 60_000)) { res.status(429).json({ error: "درخواست بیش از حد" }); return; }

  const { attributionType } = req.body ?? {};
  if (!["registration", "purchase", "lead"].includes(attributionType)) {
    res.status(400).json({ error: "نوع تبدیل نامعتبر است" });
    return;
  }

  const slug = getAttributionSlugFromCookie(req);
  if (!slug) { res.json({ attributed: false }); return; }

  const [link] = await db.select().from(trackingLinksTable).where(eq(trackingLinksTable.slug, slug)).limit(1);
  if (!link) { res.json({ attributed: false }); return; }

  const sessionId = getOrCreateSessionId(req, res);
  await db.insert(trackingAttributionsTable).values({
    trackingLinkId: link.id,
    sessionId,
    userId: req.user?.userId ?? null,
    attributionType,
    expiresAt: new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
  });

  res.json({ attributed: true });
});

export type ResolveTrackingLinkResult =
  | { status: "not_found" } // no tracking link with this slug exists at all — safe to fall back to legacy behaviour
  | { status: "blocked" } // slug exists but is inactive/expired/rate-limited — must NOT fall back to legacy behaviour
  | { status: "ok"; link: typeof trackingLinksTable.$inferSelect };

/** Resolves a slug to its destination, validates the window/active flag,
 * records a click, and refreshes the last-click attribution cookie.
 * Distinguishes "no such slug" (safe to fall back to the legacy referral
 * flow) from "slug exists but is currently blocked" (must NOT fall back —
 * falling back would let an inactive campaign slug hijack a real legacy
 * referral code, or let rate-limited abuse traffic through as a referral). */
export async function resolveTrackingLink(req: Request, res: Response, rawSlug: string): Promise<ResolveTrackingLinkResult> {
  const slug = rawSlug.toLowerCase().trim();
  if (!SLUG_RE.test(slug)) return { status: "not_found" };

  const [link] = await db.select().from(trackingLinksTable).where(eq(trackingLinksTable.slug, slug)).limit(1);
  if (!link) return { status: "not_found" };

  const now = new Date();
  if (!link.isActive) return { status: "blocked" };
  if (link.startsAt && link.startsAt > now) return { status: "blocked" };
  if (link.expiresAt && link.expiresAt < now) return { status: "blocked" };

  const ip = clientIp(req);
  if (isRateLimited(`redirect:${ip}`, 60, 60_000)) return { status: "blocked" };

  const sessionId = getOrCreateSessionId(req, res);
  const userAgent = req.headers["user-agent"] as string | undefined;
  const isBot = isLikelyBot(userAgent);

  // A click from the same session for the same link within 30 minutes is not
  // counted as a new "unique" click (still logged as a raw click for audit).
  const [recent] = await db.select({ id: trackingClicksTable.id }).from(trackingClicksTable)
    .where(and(
      eq(trackingClicksTable.trackingLinkId, link.id),
      eq(trackingClicksTable.sessionId, sessionId),
      gte(trackingClicksTable.clickedAt, new Date(Date.now() - 30 * 60 * 1000)),
    )).limit(1);

  await db.insert(trackingClicksTable).values({
    trackingLinkId: link.id,
    sessionId,
    userId: req.user?.userId ?? null,
    referrer: (req.headers["referer"] as string | undefined) ?? null,
    userAgent: userAgent ?? null,
    ipHash: hashIp(ip),
    isUnique: !recent,
    isBot,
  });

  if (!isBot) {
    // Last-click attribution: this becomes the new source of truth for this session.
    await db.insert(trackingAttributionsTable).values({
      trackingLinkId: link.id,
      sessionId,
      userId: req.user?.userId ?? null,
      attributionType: "click",
      expiresAt: new Date(Date.now() + ATTRIBUTION_WINDOW_DAYS * 24 * 60 * 60 * 1000),
    });
    setAttributionCookie(res, slug);
  }

  return { status: "ok", link };
}

export default router;
