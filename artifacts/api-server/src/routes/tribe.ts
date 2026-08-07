import { Router } from "express";
import { db } from "@workspace/db";
import {
  tribesTable,
  tribeMembersTable,
  walletTransactionsTable,
  usersTable,
  ordersTable,
  coursesTable,
  productsTable,
} from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { requireUser } from "../middlewares/auth";

const router = Router();

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

async function uniqueReferralCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = generateReferralCode();
    const [existing] = await db.select({ id: tribesTable.id }).from(tribesTable).where(eq(tribesTable.referralCode, code)).limit(1);
    if (!existing) return code;
  }
  throw new Error("Could not generate unique referral code");
}

// GET /tribe/me — get the tribe led by current user
router.get("/tribe/me", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const [tribe] = await db.select().from(tribesTable).where(eq(tribesTable.chiefUserId, userId)).limit(1);
  if (!tribe) { res.json(null); return; }

  const members = await db.select().from(tribeMembersTable).where(eq(tribeMembersTable.tribeId, tribe.id));
  res.json({ ...tribe, memberCount: members.length });
});

// POST /tribe/create
router.post("/tribe/create", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { name, logo, bankCard, sheba } = req.body as { name?: string; logo?: string; bankCard?: string; sheba?: string };

  if (!name || name.trim().length < 2) {
    res.status(400).json({ error: "نام قبیله باید حداقل ۲ کاراکتر باشد" });
    return;
  }

  const [existing] = await db.select({ id: tribesTable.id }).from(tribesTable).where(eq(tribesTable.chiefUserId, userId)).limit(1);
  if (existing) { res.status(400).json({ error: "شما قبلاً قبیله ساخته‌اید" }); return; }

  const referralCode = await uniqueReferralCode();
  const [tribe] = await db.insert(tribesTable).values({
    chiefUserId: userId,
    name: name.trim(),
    logo: logo ?? null,
    referralCode,
    bankCard: bankCard ?? null,
    sheba: sheba ?? null,
  }).returning();

  res.json(tribe);
});

// PATCH /tribe/update — update name and/or logo of MY tribe
router.patch("/tribe/update", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { name, logo } = req.body as { name?: string; logo?: string };

  const [tribe] = await db.select({ id: tribesTable.id }).from(tribesTable).where(eq(tribesTable.chiefUserId, userId)).limit(1);
  if (!tribe) { res.status(404).json({ error: "شما قبیله‌ای ندارید" }); return; }

  if (name !== undefined && name.trim().length < 2) {
    res.status(400).json({ error: "نام قبیله باید حداقل ۲ کاراکتر باشد" });
    return;
  }

  const updates: Record<string, unknown> = {};
  if (name !== undefined) updates.name = name.trim();
  if (logo !== undefined) updates.logo = logo || null;

  const [updated] = await db.update(tribesTable).set(updates).where(eq(tribesTable.id, tribe.id)).returning();
  res.json(updated);
});

// GET /tribe/members — members of MY tribe
router.get("/tribe/members", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const [tribe] = await db.select().from(tribesTable).where(eq(tribesTable.chiefUserId, userId)).limit(1);
  if (!tribe) { res.status(404).json({ error: "شما قبیله‌ای ندارید" }); return; }

  const members = await db
    .select({
      id: tribeMembersTable.id,
      userId: tribeMembersTable.userId,
      joinedAt: tribeMembersTable.joinedAt,
      name: usersTable.name,
      phone: usersTable.phone,
    })
    .from(tribeMembersTable)
    .leftJoin(usersTable, eq(tribeMembersTable.userId, usersTable.id))
    .where(eq(tribeMembersTable.tribeId, tribe.id))
    .orderBy(tribeMembersTable.joinedAt);

  res.json(members);
});

// GET /tribe/earnings — commission history for MY tribe
router.get("/tribe/earnings", requireUser, async (req, res) => {
  const userId = req.user!.userId;

  const earnings = await db
    .select()
    .from(walletTransactionsTable)
    .where(and(eq(walletTransactionsTable.userId, userId), eq(walletTransactionsTable.type, "commission")))
    .orderBy(sql`${walletTransactionsTable.createdAt} DESC`);

  // Enrich with order/item info
  const enriched = await Promise.all(earnings.map(async (e) => {
    if (!e.referenceId) return { ...e, itemTitle: null, buyerName: null };
    const [order] = await db.select().from(ordersTable).where(eq(ordersTable.id, e.referenceId)).limit(1);
    if (!order) return { ...e, itemTitle: null, buyerName: null };
    const [buyer] = await db.select({ name: usersTable.name, phone: usersTable.phone }).from(usersTable).where(eq(usersTable.id, order.userId)).limit(1);
    let itemTitle = "";
    if (order.itemType === "course") {
      const [c] = await db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, order.itemId)).limit(1);
      itemTitle = c?.title ?? "";
    } else {
      const [p] = await db.select({ title: productsTable.title }).from(productsTable).where(eq(productsTable.id, order.itemId)).limit(1);
      itemTitle = p?.title ?? "";
    }
    return {
      ...e,
      orderAmount: order.amount,
      itemType: order.itemType,
      itemTitle,
      buyerName: buyer?.name ?? buyer?.phone ?? "کاربر",
    };
  }));

  res.json(enriched);
});

// GET /tribe/my-membership — which tribe am I a member of
router.get("/tribe/my-membership", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const [membership] = await db
    .select({ tribeId: tribeMembersTable.tribeId, joinedAt: tribeMembersTable.joinedAt })
    .from(tribeMembersTable)
    .where(eq(tribeMembersTable.userId, userId))
    .limit(1);

  if (!membership) { res.json(null); return; }

  const [tribe] = await db.select({ id: tribesTable.id, name: tribesTable.name, logo: tribesTable.logo, chiefUserId: tribesTable.chiefUserId })
    .from(tribesTable).where(eq(tribesTable.id, membership.tribeId)).limit(1);

  if (!tribe) { res.json(null); return; }

  const [chief] = await db.select({ name: usersTable.name }).from(usersTable).where(eq(usersTable.id, tribe.chiefUserId)).limit(1);

  res.json({ ...membership, tribe: { ...tribe, chiefName: chief?.name ?? "" } });
});

// GET /r/:code — referral redirect (sets cookie and redirects to register)
router.get("/r/:code", async (req, res) => {
  const { code } = req.params;
  const FRONTEND = process.env.FRONTEND_BASE_URL?.replace(/\/+$/, "") ?? "https://shivafaracademy.ir";
  res.cookie("referral_code", code.toUpperCase(), { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: "lax" });
  res.redirect(`${FRONTEND}/register?ref=${code.toUpperCase()}`);
});

export default router;
