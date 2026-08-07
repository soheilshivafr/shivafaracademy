import { Router } from "express";
import { db } from "@workspace/db";
import {
  walletTransactionsTable,
  withdrawalRequestsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { requireUser } from "../middlewares/auth";
import { sendSimpleSms } from "../lib/sms";

const router = Router();

const MIN_WITHDRAWAL = 500_000; // Toman

// GET /wallet/me
router.get("/wallet/me", requireUser, async (req, res) => {
  const userId = req.user!.userId;

  const [user] = await db.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const transactions = await db
    .select()
    .from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, userId))
    .orderBy(sql`${walletTransactionsTable.createdAt} DESC`)
    .limit(50);

  const pendingWithdrawal = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(and(eq(withdrawalRequestsTable.userId, userId), eq(withdrawalRequestsTable.status, "pending")))
    .limit(1);

  res.json({
    balance: user?.walletBalance ?? 0,
    transactions,
    hasPendingWithdrawal: pendingWithdrawal.length > 0,
  });
});

// GET /wallet/kyc-status
router.get("/wallet/kyc-status", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const [req_] = await db
    .select({ kycVerified: withdrawalRequestsTable.kycVerified, status: withdrawalRequestsTable.status })
    .from(withdrawalRequestsTable)
    .where(eq(withdrawalRequestsTable.userId, userId))
    .orderBy(sql`${withdrawalRequestsTable.createdAt} DESC`)
    .limit(1);

  res.json({ kycVerified: req_?.kycVerified ?? "no" });
});

// POST /wallet/withdraw — request a withdrawal
router.post("/wallet/withdraw", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { amount } = req.body as { amount?: number };

  if (!amount || amount < MIN_WITHDRAWAL) {
    res.status(400).json({ error: `حداقل مبلغ برداشت ${MIN_WITHDRAWAL.toLocaleString("fa")} تومان است` });
    return;
  }

  const [user] = await db.select({ walletBalance: usersTable.walletBalance }).from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || user.walletBalance < amount) {
    res.status(400).json({ error: "موجودی کیف پول کافی نیست" });
    return;
  }

  const [pending] = await db
    .select({ id: withdrawalRequestsTable.id })
    .from(withdrawalRequestsTable)
    .where(and(eq(withdrawalRequestsTable.userId, userId), eq(withdrawalRequestsTable.status, "pending")))
    .limit(1);
  if (pending) {
    res.status(400).json({ error: "یک درخواست برداشت در حال بررسی است" });
    return;
  }

  // Check KYC
  const [kycReq] = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(and(eq(withdrawalRequestsTable.userId, userId), eq(withdrawalRequestsTable.kycVerified, "yes")))
    .limit(1);

  if (!kycReq) {
    res.status(403).json({ error: "kyc_required", message: "احراز هویت الزامی است" });
    return;
  }

  const [request] = await db.insert(withdrawalRequestsTable).values({
    userId,
    amount,
    status: "pending",
    kycVerified: "yes",
  }).returning();

  res.json(request);
});

// POST /kyc/submit — submit KYC documents
router.post("/kyc/submit", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { nationalIdImg, selfieImg } = req.body as { nationalIdImg?: string; selfieImg?: string };

  if (!nationalIdImg || !selfieImg) {
    res.status(400).json({ error: "تصویر کارت ملی و سلفی الزامی است" });
    return;
  }

  // Check if already verified
  const [verified] = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(and(eq(withdrawalRequestsTable.userId, userId), eq(withdrawalRequestsTable.kycVerified, "yes")))
    .limit(1);

  if (verified) {
    res.status(400).json({ error: "احراز هویت شما قبلاً تأیید شده است" });
    return;
  }

  // Check pending KYC
  const [pendingKyc] = await db
    .select()
    .from(withdrawalRequestsTable)
    .where(and(eq(withdrawalRequestsTable.userId, userId), eq(withdrawalRequestsTable.kycVerified, "no"), eq(withdrawalRequestsTable.status, "pending")))
    .limit(1);

  if (pendingKyc) {
    await db.update(withdrawalRequestsTable)
      .set({ kycNationalIdImg: nationalIdImg, kycSelfieImg: selfieImg, updatedAt: new Date() })
      .where(eq(withdrawalRequestsTable.id, pendingKyc.id));
    res.json({ message: "مدارک احراز هویت ارسال شد و در انتظار بررسی است" });
    return;
  }

  // Create a KYC-only withdrawal_request (amount=0, just for review)
  await db.insert(withdrawalRequestsTable).values({
    userId,
    amount: 0,
    status: "pending",
    kycNationalIdImg: nationalIdImg,
    kycSelfieImg: selfieImg,
    kycVerified: "no",
  });

  res.json({ message: "مدارک احراز هویت ارسال شد و در انتظار بررسی است" });
});

export default router;
