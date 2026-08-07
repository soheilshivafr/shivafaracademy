import { Router } from "express";
import { db } from "@workspace/db";
import {
  leaderboardCampaignsTable,
  tribesTable,
  usersTable,
  tribeMembersTable,
  ordersTable,
} from "@workspace/db";
import { eq, desc, sql, and } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";

const router = Router();

async function getRank1Tribe() {
  const tribes = await db
    .select({
      id: tribesTable.id,
      name: tribesTable.name,
      chiefName: usersTable.name,
      createdAt: tribesTable.createdAt,
    })
    .from(tribesTable)
    .leftJoin(usersTable, eq(tribesTable.chiefUserId, usersTable.id));

  if (tribes.length === 0) return null;

  const stats = await Promise.all(
    tribes.map(async (tribe) => {
      const memberRows = await db
        .select({ userId: tribeMembersTable.userId })
        .from(tribeMembersTable)
        .where(eq(tribeMembersTable.tribeId, tribe.id));
      const memberCount = memberRows.length;
      const memberUserIds = memberRows.map((m) => m.userId);
      let totalPurchase = 0;
      if (memberUserIds.length > 0) {
        const rows = await db
          .select({ total: sql<number>`coalesce(sum(amount),0)::int` })
          .from(ordersTable)
          .where(
            and(
              sql`user_id = ANY(ARRAY[${sql.join(
                memberUserIds.map((id) => sql`${id}`),
                sql`, `
              )}]::int[])`,
              eq(ordersTable.status, "paid")
            )
          );
        totalPurchase = rows[0]?.total ?? 0;
      }
      return { ...tribe, memberCount, totalPurchase };
    })
  );

  const N = stats.length;
  function pct(values: number[], idx: number) {
    if (N === 1) return 100;
    const v = values[idx];
    return (values.filter((x, i) => i !== idx && x < v).length / (N - 1)) * 100;
  }
  const purchases = stats.map((s) => s.totalPurchase);
  const members = stats.map((s) => s.memberCount);
  const anyPurchase = purchases.some((p) => p > 0);

  const scored = stats.map((s, i) => ({
    ...s,
    score: anyPurchase
      ? pct(purchases, i) * 0.65 + pct(members, i) * 0.35
      : pct(members, i),
  }));
  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });
  return scored[0] ?? null;
}

// GET /api/leaderboard/campaign — public
router.get("/leaderboard/campaign", async (_req, res) => {
  const [campaign] = await db
    .select()
    .from(leaderboardCampaignsTable)
    .orderBy(desc(leaderboardCampaignsTable.createdAt))
    .limit(1);

  if (!campaign) { res.json(null); return; }

  // Auto-settle if awardAt passed and winner not recorded
  if (
    campaign.status === "active" &&
    new Date(campaign.awardAt) <= new Date() &&
    !campaign.winnerTribeId
  ) {
    const winner = await getRank1Tribe();
    const updated = await db
      .update(leaderboardCampaignsTable)
      .set({
        status: "ended",
        winnerTribeId: winner?.id ?? null,
        winnerTribeName: winner?.name ?? null,
        winnerChiefName: winner?.chiefName ?? null,
        updatedAt: new Date(),
      })
      .where(eq(leaderboardCampaignsTable.id, campaign.id))
      .returning();
    res.json(updated[0] ?? campaign);
    return;
  }

  res.json(campaign);
});

// GET /api/leaderboard/campaign/history — public
router.get("/leaderboard/campaign/history", async (_req, res) => {
  const rows = await db
    .select()
    .from(leaderboardCampaignsTable)
    .where(eq(leaderboardCampaignsTable.status, "ended"))
    .orderBy(desc(leaderboardCampaignsTable.awardAt));
  res.json(rows);
});

// POST /api/admin/leaderboard-campaigns — create new campaign (auto-ends active ones)
router.post("/admin/leaderboard-campaigns", requireAdmin, async (req, res) => {
  const { prizeTitle, awardAt } = req.body as { prizeTitle: string; awardAt: string };
  if (!prizeTitle || !awardAt) {
    res.status(400).json({ error: "عنوان جایزه و تاریخ الزامی است" }); return;
  }
  const awardDate = new Date(awardAt);
  if (isNaN(awardDate.getTime())) {
    res.status(400).json({ error: "تاریخ نامعتبر است" }); return;
  }

  // End all active campaigns
  const actives = await db
    .select()
    .from(leaderboardCampaignsTable)
    .where(eq(leaderboardCampaignsTable.status, "active"));

  for (const c of actives) {
    const winner = await getRank1Tribe();
    await db
      .update(leaderboardCampaignsTable)
      .set({
        status: "ended",
        winnerTribeId: winner?.id ?? null,
        winnerTribeName: winner?.name ?? null,
        winnerChiefName: winner?.chiefName ?? null,
        updatedAt: new Date(),
      })
      .where(eq(leaderboardCampaignsTable.id, c.id));
  }

  const [created] = await db
    .insert(leaderboardCampaignsTable)
    .values({ prizeTitle, awardAt: awardDate })
    .returning();
  res.json(created);
});

// GET /api/admin/leaderboard-campaigns — list all campaigns
router.get("/admin/leaderboard-campaigns", requireAdmin, async (_req, res) => {
  const rows = await db
    .select()
    .from(leaderboardCampaignsTable)
    .orderBy(desc(leaderboardCampaignsTable.createdAt));
  res.json(rows);
});

// DELETE /api/admin/leaderboard-campaigns/:id
router.delete("/admin/leaderboard-campaigns/:id", requireAdmin, async (req, res) => {
  const id = parseInt(req.params.id as string, 10);
  if (isNaN(id)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  await db.delete(leaderboardCampaignsTable).where(eq(leaderboardCampaignsTable.id, id));
  res.json({ ok: true });
});

export default router;
