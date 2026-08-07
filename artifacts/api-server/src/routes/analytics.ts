import { Router } from "express";
import { db } from "@workspace/db";
import { analyticsEventsTable, onlineSessionsTable, usersTable } from "@workspace/db";
import { eq, sql, and, gte, count, like, inArray } from "drizzle-orm";
import { productsTable, coursesTable } from "@workspace/db";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

// In-memory online session store
const ONLINE_TTL_MS = 5 * 60 * 1000;

// POST /api/analytics/event — track a pageview, pwa_install, apk_install
router.post("/analytics/event", async (req, res) => {
  try {
    const { eventType, page, sessionId, userId } = req.body as {
      eventType: string;
      page?: string;
      sessionId: string;
      userId?: number;
    };
    if (!eventType || !sessionId) {
      res.status(400).json({ error: "eventType and sessionId required" });
      return;
    }
    await db.insert(analyticsEventsTable).values({
      eventType,
      page: page ?? null,
      sessionId,
      userId: userId ?? null,
    });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "failed to track event" });
  }
});

// POST /api/analytics/ping — heartbeat for online presence
router.post("/analytics/ping", async (req, res) => {
  try {
    const { sessionId, userId } = req.body as { sessionId: string; userId?: number };
    if (!sessionId) { res.status(400).json({ error: "sessionId required" }); return; }
    await db
      .insert(onlineSessionsTable)
      .values({ sessionId, userId: userId ?? null, lastSeen: new Date() })
      .onConflictDoUpdate({
        target: onlineSessionsTable.sessionId,
        set: { lastSeen: new Date(), userId: userId ?? null },
      });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "ping failed" });
  }
});

// GET /api/admin/analytics — admin-only analytics summary
router.get("/admin/analytics", requireAdmin, async (_req, res) => {
  try {
    const now = new Date();
    const thresholds = {
      day:   new Date(now.getTime() - 24 * 60 * 60 * 1000),
      week:  new Date(now.getTime() - 7  * 24 * 60 * 60 * 1000),
      month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
      year:  new Date(now.getTime() - 365* 24 * 60 * 60 * 1000),
    };
    const onlineThreshold = new Date(now.getTime() - ONLINE_TTL_MS);

    const periods = ["day", "week", "month", "year"] as const;
    type Period = typeof periods[number];

    // Online users
    const [onlineResult] = await db
      .select({ cnt: count() })
      .from(onlineSessionsTable)
      .where(gte(onlineSessionsTable.lastSeen, onlineThreshold));
    const onlineUsers = Number(onlineResult?.cnt ?? 0);

    // Helper: build aggregated stats for event rows grouped by period
    async function getEventStats(eventType: string, page?: string) {
      const result: Record<Period, { total: number; unique: number }> = {
        day: { total: 0, unique: 0 }, week: { total: 0, unique: 0 },
        month: { total: 0, unique: 0 }, year: { total: 0, unique: 0 },
      };
      for (const period of periods) {
        const cond = page
          ? and(
              eq(analyticsEventsTable.eventType, eventType),
              eq(analyticsEventsTable.page, page),
              gte(analyticsEventsTable.createdAt, thresholds[period]),
            )
          : and(
              eq(analyticsEventsTable.eventType, eventType),
              gte(analyticsEventsTable.createdAt, thresholds[period]),
            );
        const [row] = await db
          .select({
            total: count(),
            unique: sql<string>`count(distinct session_id)`,
          })
          .from(analyticsEventsTable)
          .where(cond);
        result[period] = { total: Number(row?.total ?? 0), unique: Number(row?.unique ?? 0) };
      }
      return result;
    }

    // Helper: simple count stats (no unique)
    async function getCountStats(eventType: string) {
      const result: Record<Period, number> = { day: 0, week: 0, month: 0, year: 0 };
      for (const period of periods) {
        const [row] = await db
          .select({ cnt: count() })
          .from(analyticsEventsTable)
          .where(and(
            eq(analyticsEventsTable.eventType, eventType),
            gte(analyticsEventsTable.createdAt, thresholds[period]),
          ));
        result[period] = Number(row?.cnt ?? 0);
      }
      return result;
    }

    // New user registrations
    async function getNewUsers() {
      const result: Record<Period, number> = { day: 0, week: 0, month: 0, year: 0 };
      for (const period of periods) {
        const [row] = await db
          .select({ cnt: count() })
          .from(usersTable)
          .where(gte(usersTable.createdAt, thresholds[period]));
        result[period] = Number(row?.cnt ?? 0);
      }
      return result;
    }

    const PAGE_SLUGS = ["reels", "podcast", "tools", "channel", "products", "tribe", "my-courses", "my-products", "courses"];

    const [
      pageviews,
      pwaInstalls,
      apkInstalls,
      newUsers,
      ...pageStatsList
    ] = await Promise.all([
      getEventStats("pageview"),
      getCountStats("pwa_install"),
      getCountStats("apk_install"),
      getNewUsers(),
      ...PAGE_SLUGS.map(p => getEventStats("pageview", p)),
    ]);

    const pageStats: Record<string, ReturnType<typeof getEventStats> extends Promise<infer T> ? T : never> = {};
    PAGE_SLUGS.forEach((slug, i) => {
      pageStats[slug] = pageStatsList[i] as ReturnType<typeof getEventStats> extends Promise<infer T> ? T : never;
    });

    res.json({ onlineUsers, pageviews, pwaInstalls, apkInstalls, newUsers, pageStats });
  } catch (err) {
    console.error("analytics error", err);
    res.status(500).json({ error: "analytics query failed" });
  }
});

// GET /api/admin/analytics/items — بازدید به تفکیک هر محصول و هر دوره (همه — حتی صفر بازدید)
router.get("/admin/analytics/items", requireAdmin, async (req, res) => {
  try {
    const periodStr = (req.query.period as string) || "week";
    const now = new Date();
    const thresholds: Record<string, Date> = {
      day:   new Date(now.getTime() - 24  * 60 * 60 * 1000),
      week:  new Date(now.getTime() - 7   * 24 * 60 * 60 * 1000),
      month: new Date(now.getTime() - 30  * 24 * 60 * 60 * 1000),
      year:  new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
    };
    const threshold = thresholds[periodStr] ?? thresholds.week;

    // ── همه محصولات از DB ──
    const allProducts = await db.select({ id: productsTable.id, title: productsTable.title })
      .from(productsTable);

    // ── بازدیدهای محصولات در بازه ──
    const productEventRows = await db
      .select({
        page: analyticsEventsTable.page,
        total: count(),
        unique: sql`count(distinct ${analyticsEventsTable.sessionId})`,
      })
      .from(analyticsEventsTable)
      .where(and(
        eq(analyticsEventsTable.eventType, "pageview"),
        like(analyticsEventsTable.page, "product/%"),
        gte(analyticsEventsTable.createdAt, threshold),
      ))
      .groupBy(analyticsEventsTable.page);

    const productViewMap = new Map<number, { total: number; unique: number }>();
    for (const r of productEventRows) {
      const id = parseInt(r.page?.split("/")?.[1] ?? "");
      if (!isNaN(id) && id > 0) {
        productViewMap.set(id, { total: Number(r.total), unique: Number(r.unique) });
      }
    }

    const products = allProducts
      .map(p => ({
        id: p.id,
        title: p.title,
        total:  productViewMap.get(p.id)?.total  ?? 0,
        unique: productViewMap.get(p.id)?.unique ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    // ── همه دوره‌ها از DB ──
    const allCourses = await db.select({ id: coursesTable.id, title: coursesTable.title })
      .from(coursesTable);

    // ── بازدیدهای دوره‌ها در بازه ──
    const courseEventRows = await db
      .select({
        page: analyticsEventsTable.page,
        total: count(),
        unique: sql`count(distinct ${analyticsEventsTable.sessionId})`,
      })
      .from(analyticsEventsTable)
      .where(and(
        eq(analyticsEventsTable.eventType, "pageview"),
        like(analyticsEventsTable.page, "courses/%"),
        gte(analyticsEventsTable.createdAt, threshold),
      ))
      .groupBy(analyticsEventsTable.page);

    const courseViewMap = new Map<number, { total: number; unique: number }>();
    for (const r of courseEventRows) {
      const id = parseInt(r.page?.split("/")?.[1] ?? "");
      if (!isNaN(id) && id > 0) {
        courseViewMap.set(id, { total: Number(r.total), unique: Number(r.unique) });
      }
    }

    const courses = allCourses
      .map(c => ({
        id: c.id,
        title: c.title,
        total:  courseViewMap.get(c.id)?.total  ?? 0,
        unique: courseViewMap.get(c.id)?.unique ?? 0,
      }))
      .sort((a, b) => b.total - a.total);

    res.json({ products, courses });
  } catch (err) {
    console.error("analytics items error", err);
    res.status(500).json({ error: "analytics items query failed" });
  }
});;

export default router;
