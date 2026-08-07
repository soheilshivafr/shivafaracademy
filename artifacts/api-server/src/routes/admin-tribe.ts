import { Router } from "express";
import { db } from "@workspace/db";
import {
  tribesTable,
  tribeMembersTable,
  withdrawalRequestsTable,
  walletTransactionsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql, gte } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { sendSimpleSms } from "../lib/sms";
import { sendPushToUser } from "./push";

const router = Router();

// GET /admin/tribes — list all tribes with stats
router.get("/admin/tribes", requireAdmin, async (_req, res) => {
  const tribes = await db
    .select({
      id: tribesTable.id,
      name: tribesTable.name,
      logo: tribesTable.logo,
      referralCode: tribesTable.referralCode,
      chiefUserId: tribesTable.chiefUserId,
      chiefName: usersTable.name,
      chiefPhone: usersTable.phone,
      createdAt: tribesTable.createdAt,
    })
    .from(tribesTable)
    .leftJoin(usersTable, eq(tribesTable.chiefUserId, usersTable.id))
    .orderBy(sql`${tribesTable.createdAt} DESC`);

  const result = await Promise.all(tribes.map(async (t) => {
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(tribeMembersTable)
      .where(eq(tribeMembersTable.tribeId, t.id));
    return { ...t, memberCount: count ?? 0 };
  }));

  res.json(result);
});

// GET /admin/tribes/:id/members
router.get("/admin/tribes/:id/members", requireAdmin, async (req, res) => {
  const tribeId = parseInt(req.params.id as string);
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
    .where(eq(tribeMembersTable.tribeId, tribeId))
    .orderBy(tribeMembersTable.joinedAt);
  res.json(members);
});

// GET /admin/withdrawals — all withdrawal requests
router.get("/admin/withdrawals", requireAdmin, async (_req, res) => {
  const requests = await db
    .select({
      id: withdrawalRequestsTable.id,
      userId: withdrawalRequestsTable.userId,
      amount: withdrawalRequestsTable.amount,
      status: withdrawalRequestsTable.status,
      kycVerified: withdrawalRequestsTable.kycVerified,
      kycNationalIdImg: withdrawalRequestsTable.kycNationalIdImg,
      kycSelfieImg: withdrawalRequestsTable.kycSelfieImg,
      adminNote: withdrawalRequestsTable.adminNote,
      createdAt: withdrawalRequestsTable.createdAt,
      updatedAt: withdrawalRequestsTable.updatedAt,
      userName: usersTable.name,
      userPhone: usersTable.phone,
    })
    .from(withdrawalRequestsTable)
    .leftJoin(usersTable, eq(withdrawalRequestsTable.userId, usersTable.id))
    .orderBy(sql`${withdrawalRequestsTable.createdAt} DESC`);

  res.json(requests);
});

// POST /admin/withdrawals/:id/approve — approve and deduct wallet (atomic)
router.post("/admin/withdrawals/:id/approve", requireAdmin, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  const { adminNote } = req.body as { adminNote?: string };

  const [request] = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.id, requestId))
    .limit(1);

  if (!request) { res.status(404).json({ error: "درخواست یافت نشد" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: "این درخواست قابل تغییر نیست" }); return; }

  let user: { phone: string; name: string | null } | undefined;

  try {
    await db.transaction(async (tx) => {
      // Mark request as approved first (idempotency guard — prevents double approval)
      const [updated] = await tx.update(withdrawalRequestsTable)
        .set({ status: "approved", adminNote: adminNote ?? null, updatedAt: new Date() })
        .where(and(eq(withdrawalRequestsTable.id, requestId), eq(withdrawalRequestsTable.status, "pending")))
        .returning();

      if (!updated) {
        throw new Error("ALREADY_PROCESSED");
      }

      // Deduct wallet balance with balance guard (only if amount > 0)
      if (request.amount > 0) {
        const [deducted] = await tx.update(usersTable)
          .set({ walletBalance: sql`${usersTable.walletBalance} - ${request.amount}` })
          .where(and(eq(usersTable.id, request.userId), gte(usersTable.walletBalance, request.amount)))
          .returning({ walletBalance: usersTable.walletBalance });

        if (!deducted) {
          throw new Error("INSUFFICIENT_BALANCE");
        }

        await tx.insert(walletTransactionsTable).values({
          userId: request.userId,
          amount: -request.amount,
          type: "withdrawal",
          referenceId: request.id,
          description: "برداشت از کیف پول",
        });
      }

      const [u] = await tx.select({ phone: usersTable.phone, name: usersTable.name })
        .from(usersTable).where(eq(usersTable.id, request.userId)).limit(1);
      user = u;
    });
  } catch (err: any) {
    if (err?.message === "ALREADY_PROCESSED") {
      res.status(409).json({ error: "این درخواست قبلاً پردازش شده است" });
      return;
    }
    if (err?.message === "INSUFFICIENT_BALANCE") {
      res.status(400).json({ error: "موجودی کیف پول کاربر کافی نیست" });
      return;
    }
    console.error("[Withdrawal Approve] Error:", err);
    res.status(500).json({ error: "خطا در پردازش درخواست" });
    return;
  }

  // Notify user via SMS (outside transaction — non-critical)
  if (user && request.amount > 0) {
    const msg = `سلام ${user.name ?? "کاربر گرامی"}!\nدرخواست برداشت ${request.amount.toLocaleString("fa")} تومان شما تأیید شد.\nمبلغ به حساب بانکی شما واریز خواهد شد.`;
    sendSimpleSms(user.phone, msg).catch(() => {});
  }
  sendPushToUser(request.userId, {
    title: "✅ برداشت تأیید شد",
    body: `مبلغ ${request.amount.toLocaleString("fa")} تومان از کیف پول شما برداشت خواهد شد.`,
    url: "/wallet",
  }).catch(() => {});

  res.json({ message: "درخواست تأیید شد" });
});

// POST /admin/withdrawals/:id/reject
router.post("/admin/withdrawals/:id/reject", requireAdmin, async (req, res) => {
  const requestId = parseInt(req.params.id as string);
  const { adminNote } = req.body as { adminNote?: string };

  const [request] = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.id, requestId))
    .limit(1);

  if (!request) { res.status(404).json({ error: "درخواست یافت نشد" }); return; }
  if (request.status !== "pending") { res.status(400).json({ error: "این درخواست قابل تغییر نیست" }); return; }

  await db.update(withdrawalRequestsTable)
    .set({ status: "rejected", adminNote: adminNote ?? null, updatedAt: new Date() })
    .where(eq(withdrawalRequestsTable.id, requestId));

  // Notify user via SMS
  const [user] = await db.select({ phone: usersTable.phone, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, request.userId)).limit(1);
  if (user) {
    const msg = `سلام ${user.name ?? "کاربر گرامی"}!\nمتأسفانه درخواست برداشت شما رد شد.${adminNote ? `\nدلیل: ${adminNote}` : ""}`;
    sendSimpleSms(user.phone, msg).catch(() => {});
  }
  sendPushToUser(request.userId, {
    title: "❌ برداشت رد شد",
    body: adminNote ? `دلیل: ${adminNote}` : "درخواست برداشت شما رد شد.",
    url: "/wallet",
  }).catch(() => {});

  res.json({ message: "درخواست رد شد" });
});

// POST /admin/kyc/:id/verify — verify KYC
router.post("/admin/kyc/:id/verify", requireAdmin, async (req, res) => {
  const requestId = parseInt(req.params.id as string);

  const [request] = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.id, requestId))
    .limit(1);

  if (!request) { res.status(404).json({ error: "درخواست یافت نشد" }); return; }

  await db.update(withdrawalRequestsTable)
    .set({ kycVerified: "yes", updatedAt: new Date() })
    .where(eq(withdrawalRequestsTable.id, requestId));

  // Mark all KYC requests of this user as verified
  await db.update(withdrawalRequestsTable)
    .set({ kycVerified: "yes", updatedAt: new Date() })
    .where(and(eq(withdrawalRequestsTable.userId, request.userId)));

  const [user] = await db.select({ phone: usersTable.phone, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, request.userId)).limit(1);
  if (user) {
    const msg = `سلام ${user.name ?? "کاربر گرامی"}!\nاحراز هویت شما با موفقیت تأیید شد. اکنون می‌توانید از کیف پول برداشت کنید.`;
    sendSimpleSms(user.phone, msg).catch(() => {});
  }

  res.json({ message: "احراز هویت تأیید شد" });
});

export default router;
