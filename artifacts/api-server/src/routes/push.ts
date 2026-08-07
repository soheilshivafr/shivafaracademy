import { Router } from "express";
import webpush from "web-push";
import { db } from "@workspace/db";
import { pushSubscriptionsTable, tribesTable, tribeMembersTable, ordersTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireUser, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY!;
const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY!;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@shivafar.com";

if (VAPID_PUBLIC && VAPID_PRIVATE) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
}

// GET /push/vapid-public-key
router.get("/push/vapid-public-key", (_req, res) => {
  res.json({ publicKey: VAPID_PUBLIC ?? "" });
});

// POST /push/subscribe
router.post("/push/subscribe", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { endpoint, keys } = req.body;
  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    res.status(400).json({ error: "اشتراک ناقص است" });
    return;
  }
  try {
    await db.insert(pushSubscriptionsTable)
      .values({ userId, endpoint, keys })
      .onConflictDoUpdate({ target: pushSubscriptionsTable.endpoint, set: { userId, keys } });
    res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "push subscribe error");
    res.status(500).json({ error: "خطا در ثبت اشتراک" });
  }
});

// DELETE /push/unsubscribe
router.delete("/push/unsubscribe", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { endpoint } = req.body;
  if (!endpoint) { res.status(400).json({ error: "endpoint required" }); return; }
  await db.delete(pushSubscriptionsTable)
    .where(and(eq(pushSubscriptionsTable.userId, userId), eq(pushSubscriptionsTable.endpoint, endpoint)));
  res.json({ ok: true });
});

// ── Utility: send push to a single user ──────────────────────────────────────
export async function sendPushToUser(userId: number, payload: { title: string; body: string; icon?: string; url?: string }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const subs = await db.select().from(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.userId, userId));
    await Promise.allSettled(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
        }
      }
    }));
  } catch (err) {
    logger.error({ err }, "sendPushToUser error");
  }
}

// ── Leaderboard rank computation ──────────────────────────────────────────────
async function getTribeRank(tribeId: number): Promise<number | null> {
  const tribes = await db.select({ id: tribesTable.id }).from(tribesTable);
  if (tribes.length === 0) return null;
  const N = tribes.length;

  const memberRows = await db
    .select({ tribeId: tribeMembersTable.tribeId, cnt: sql<number>`count(*)::int` })
    .from(tribeMembersTable)
    .groupBy(tribeMembersTable.tribeId);
  const memberMap = new Map(memberRows.map(r => [r.tribeId, r.cnt]));

  const memberTribeRows = await db
    .select({ userId: tribeMembersTable.userId, tribeId: tribeMembersTable.tribeId })
    .from(tribeMembersTable);
  const userToTribe = new Map(memberTribeRows.map(r => [r.userId, r.tribeId]));

  const paidOrders = await db
    .select({ userId: ordersTable.userId, amount: ordersTable.amount })
    .from(ordersTable)
    .where(eq(ordersTable.status, "paid"));

  const purchaseMap = new Map<number, number>();
  for (const o of paidOrders) {
    const tid = userToTribe.get(o.userId);
    if (tid !== undefined) purchaseMap.set(tid, (purchaseMap.get(tid) ?? 0) + o.amount);
  }

  const allMembers = tribes.map(t => memberMap.get(t.id) ?? 0);
  const allPurchases = tribes.map(t => purchaseMap.get(t.id) ?? 0);
  const anyPurchase = allPurchases.some(p => p > 0);

  function percentileRank(values: number[], idx: number): number {
    if (N === 1) return 100;
    const myVal = values[idx];
    return (values.filter((v, i) => i !== idx && v < myVal).length / (N - 1)) * 100;
  }

  const scored = tribes.map((t, i) => {
    const pp = percentileRank(allPurchases, i);
    const mp = percentileRank(allMembers, i);
    return { id: t.id, score: anyPurchase ? pp * 0.65 + mp * 0.35 : mp };
  });
  scored.sort((a, b) => b.score - a.score);
  const rank = scored.findIndex(s => s.id === tribeId) + 1;
  return rank > 0 ? rank : null;
}

export async function checkLeaderboardRankNotification(tribeId: number, chiefUserId: number, tribeName: string) {
  try {
    const rank = await getTribeRank(tribeId);
    if (!rank) return;

    const [tribe] = await db.select({ lastLeaderboardRank: tribesTable.lastLeaderboardRank })
      .from(tribesTable).where(eq(tribesTable.id, tribeId)).limit(1);
    if (!tribe) return;

    await db.update(tribesTable).set({ lastLeaderboardRank: rank }).where(eq(tribesTable.id, tribeId));

    const prev = tribe.lastLeaderboardRank;
    if (rank <= 10 && (prev === null || prev > 10)) {
      sendPushToUser(chiefUserId, {
        title: "🏆 ورود به لیدربورد!",
        body: `قبیله ${tribeName} در رتبه ${rank} لیدربورد قرار گرفت!`,
        url: "/leaderboard",
      }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "checkLeaderboardRankNotification error");
  }
}

// ── Admin: send direct push to a specific user ────────────────────────────────
router.post("/admin/push/send", requireAdmin, async (req, res) => {
  const { userId, title, body, url } = req.body as {
    userId?: number; title?: string; body?: string; url?: string;
  };
  if (!userId || !title || !body) {
    res.status(400).json({ error: "userId، title و body الزامی هستند" });
    return;
  }
  await sendPushToUser(userId, { title, body, url });
  res.json({ ok: true });
});

// ── Utility: broadcast push to all subscribed users ───────────────────────────
export async function sendPushToAll(payload: { title: string; body: string; icon?: string; url?: string }) {
  if (!VAPID_PUBLIC || !VAPID_PRIVATE) return;
  try {
    const subs = await db.select().from(pushSubscriptionsTable);
    await Promise.allSettled(subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys as { p256dh: string; auth: string } },
          JSON.stringify(payload)
        );
      } catch (err: any) {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await db.delete(pushSubscriptionsTable).where(eq(pushSubscriptionsTable.endpoint, sub.endpoint));
        }
      }
    }));
  } catch (err) {
    logger.error({ err }, "sendPushToAll error");
  }
}

export default router;
