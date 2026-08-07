import { Router } from "express";
import { db } from "@workspace/db";
import {
  tribesTable,
  tribeMembersTable,
  usersTable,
  ordersTable,
} from "@workspace/db";
import { eq, sql, and } from "drizzle-orm";

const router = Router();

// GET /leaderboard — ranked tribe list (true percentile-based scoring)
router.get("/leaderboard", async (_req, res) => {
  const tribes = await db
    .select({
      id: tribesTable.id,
      name: tribesTable.name,
      logo: tribesTable.logo,
      chiefUserId: tribesTable.chiefUserId,
      chiefName: usersTable.name,
      createdAt: tribesTable.createdAt,
    })
    .from(tribesTable)
    .leftJoin(usersTable, eq(tribesTable.chiefUserId, usersTable.id));

  if (tribes.length === 0) { res.json([]); return; }

  // Compute raw stats for each tribe
  const stats = await Promise.all(tribes.map(async (tribe) => {
    const memberRows = await db
      .select({ userId: tribeMembersTable.userId, joinedAt: tribeMembersTable.joinedAt })
      .from(tribeMembersTable)
      .where(eq(tribeMembersTable.tribeId, tribe.id));

    const memberCount = memberRows.length;
    const memberUserIds = memberRows.map(m => m.userId);

    let totalPurchase = 0;
    if (memberUserIds.length > 0) {
      const purchaseRows = await db
        .select({ total: sql<number>`coalesce(sum(amount), 0)::int` })
        .from(ordersTable)
        .where(
          and(
            sql`user_id = ANY(ARRAY[${sql.join(memberUserIds.map(id => sql`${id}`), sql`, `)}]::int[])`,
            eq(ordersTable.status, "paid")
          )
        );
      totalPurchase = purchaseRows[0]?.total ?? 0;
    }

    return { ...tribe, memberCount, totalPurchase, memberUserIds };
  }));

  const N = stats.length;

  // True percentile rank: for each tribe, count how many others have strictly lower value
  // percentile_rank = (tribes_with_lower_value / (N - 1)) * 100
  // Edge case: if N == 1, percentile = 100
  function percentileRank(values: number[], idx: number): number {
    if (N === 1) return 100;
    const myVal = values[idx];
    const lowerCount = values.filter((v, i) => i !== idx && v < myVal).length;
    return (lowerCount / (N - 1)) * 100;
  }

  const purchases = stats.map(s => s.totalPurchase);
  const members = stats.map(s => s.memberCount);
  const anyPurchase = purchases.some(p => p > 0);

  const scored = stats.map((s, i) => {
    const purchasePercentile = percentileRank(purchases, i);
    const memberPercentile = percentileRank(members, i);
    const score = anyPurchase
      ? (purchasePercentile * 0.65) + (memberPercentile * 0.35)
      : memberPercentile;
    return { ...s, purchasePercentile, memberPercentile, score: Math.round(score) };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    // Tiebreaker: oldest tribe first (ascending createdAt)
    return new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime();
  });

  const result = await Promise.all(scored.map(async (tribe, idx) => {
    const memberDetails = await db
      .select({ userId: tribeMembersTable.userId, name: usersTable.name, joinedAt: tribeMembersTable.joinedAt })
      .from(tribeMembersTable)
      .leftJoin(usersTable, eq(tribeMembersTable.userId, usersTable.id))
      .where(eq(tribeMembersTable.tribeId, tribe.id))
      .orderBy(tribeMembersTable.joinedAt);

    return {
      rank: idx + 1,
      id: tribe.id,
      name: tribe.name,
      logo: tribe.logo,
      chiefName: tribe.chiefName,
      memberCount: tribe.memberCount,
      totalPurchase: tribe.totalPurchase,
      score: tribe.score,
      members: memberDetails.map(m => ({ name: m.name ?? "کاربر", joinedAt: m.joinedAt })),
    };
  }));

  res.json(result);
});

export default router;
