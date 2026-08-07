import { Router } from "express";
import { db } from "@workspace/db";
import {
  ordersTable,
  coursesTable,
  productsTable,
  userCoursesTable,
  userProductsTable,
  tribesTable,
  tribeMembersTable,
  walletTransactionsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, inArray, desc, sql } from "drizzle-orm";
import { requireUser, requireAdmin } from "../middlewares/auth";
import { sendPatternSms } from "../lib/sms";
import { logger } from "../lib/logger";
import { getAdminSetting, setAdminSetting, getCardInfo } from "../lib/settings";
import { sendPushToUser, checkLeaderboardRankNotification } from "./push";
import { createZarinPalGateway } from "../lib/payment-gateway";
import { getMtpCourseId, priceForVariant, isValidGiftCode, applyGiftCode } from "../lib/mtp-discount";
import { getActiveItemDiscount, computeDiscountedPrice } from "../lib/item-discount";
import { sendPurchaseNotificationEmail } from "../lib/purchase-notification";
import { attributePurchase } from "../lib/tracking-links";
import multer from "multer";
import path from "path";
import { randomUUID } from "crypto";
import fs from "fs";
import { getStorageService, isStorageConfigured } from "../lib/storage/index";

const router = Router();

// ─── Receipt upload ───────────────────────────────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// Use memory storage — buffer goes straight to Object Storage (S3).
// Disk fallback is handled in the route handler when S3 is not configured.
const uploadReceipt = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (/\.(jpeg|jpg|png|webp)$/i.test(path.extname(file.originalname))) cb(null, true);
    else cb(new Error("فقط تصویر مجاز است"));
  },
});

// ─── Commission ───────────────────────────────────────────────────────────────
const COMMISSION_RATE = 0.10;
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

async function handleTribeCommission(order: typeof ordersTable.$inferSelect): Promise<void> {
  try {
    const [membership] = await db
      .select({ tribeId: tribeMembersTable.tribeId, joinedAt: tribeMembersTable.joinedAt })
      .from(tribeMembersTable)
      .where(eq(tribeMembersTable.userId, order.userId))
      .limit(1);

    if (!membership) return;

    const membershipAge = Date.now() - new Date(membership.joinedAt).getTime();
    if (membershipAge > ONE_YEAR_MS) return;

    const [tribe] = await db
      .select({ id: tribesTable.id, chiefUserId: tribesTable.chiefUserId, name: tribesTable.name })
      .from(tribesTable)
      .where(eq(tribesTable.id, membership.tribeId))
      .limit(1);

    if (!tribe) return;

    const commission = Math.floor(order.amount * COMMISSION_RATE);
    if (commission <= 0) return;

    const [alreadyCredited] = await db
      .select({ id: walletTransactionsTable.id })
      .from(walletTransactionsTable)
      .where(and(
        eq(walletTransactionsTable.referenceId, order.id),
        eq(walletTransactionsTable.type, "commission")
      ))
      .limit(1);

    if (alreadyCredited) return;

    await db.transaction(async (tx) => {
      await tx.update(usersTable)
        .set({ walletBalance: sql`${usersTable.walletBalance} + ${commission}` })
        .where(eq(usersTable.id, tribe.chiefUserId));

      await tx.insert(walletTransactionsTable).values({
        userId: tribe.chiefUserId,
        amount: commission,
        type: "commission",
        referenceId: order.id,
        description: `کمیسیون خرید عضو از قبیله ${tribe.name}`,
      });
    });

    const [chief] = await db
      .select({ phone: usersTable.phone, walletBalance: usersTable.walletBalance })
      .from(usersTable)
      .where(eq(usersTable.id, tribe.chiefUserId))
      .limit(1);

    if (chief) {
      sendPatternSms(chief.phone, "qya8j3lk5adkx4t", {
        tribe: tribe.name,
        amount: commission.toLocaleString("fa"),
      }).catch(() => {});
      sendPushToUser(tribe.chiefUserId, {
        title: `💰 کمیسیون جدید — قبیله ${tribe.name}`,
        body: `${commission.toLocaleString("fa")} تومان به کیف پول شما اضافه شد.`,
        icon: "/icon-192.png",
        url: "/tribe",
      }).catch(() => {});
      checkLeaderboardRankNotification(tribe.id, tribe.chiefUserId, tribe.name).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "commission error");
  }
}

// ─── Owner purchase notification SMS ─────────────────────────────────────────
const OWNER_PURCHASE_PATTERN = "ip7vot1lin24jet";

async function notifyOwnerOfPurchase(order: typeof ordersTable.$inferSelect): Promise<void> {
  try {
    const ownerPhone = process.env.OWNER_PHONE || await getAdminSetting("owner_phone");
    if (!ownerPhone) return;

    const [buyer] = await db
      .select({ phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, order.userId))
      .limit(1);

    let itemName = "";
    if (order.itemType === "course") {
      const [course] = await db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, order.itemId)).limit(1);
      itemName = course?.title ?? `دوره #${order.itemId}`;
    } else if (order.itemType === "product") {
      const [product] = await db.select({ title: productsTable.title }).from(productsTable).where(eq(productsTable.id, order.itemId)).limit(1);
      itemName = product?.title ?? `محصول #${order.itemId}`;
    } else if (order.itemType === "ai_report") {
      // itemId is sessionId → look up assessment title
      try {
        const { assessmentSessionsTable: sessTable, assessmentsTable: asmTable } = await import("@workspace/db");
        const [row] = await db
          .select({ title: asmTable.title })
          .from(sessTable)
          .innerJoin(asmTable, eq(sessTable.assessmentId, asmTable.id))
          .where(eq(sessTable.id, order.itemId))
          .limit(1);
        itemName = row?.title ? `گزارش AI: ${row.title}` : "گزارش AI";
      } catch {
        itemName = "گزارش AI";
      }
    } else {
      itemName = order.itemType;
    }

    await sendPatternSms(ownerPhone, OWNER_PURCHASE_PATTERN, {
      item: itemName,
      amount: order.amount.toLocaleString("fa"),
      buyer: buyer?.phone ?? "-",
    });
  } catch (err) {
    logger.error({ err }, "owner purchase notification SMS error");
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function grantOrderAccess(order: typeof ordersTable.$inferSelect): Promise<void> {
  if (order.itemType === "course") {
    const [exists] = await db.select({ id: userCoursesTable.id })
      .from(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, order.userId), eq(userCoursesTable.courseId, order.itemId)))
      .limit(1);
    if (!exists) await db.insert(userCoursesTable).values({ userId: order.userId, courseId: order.itemId });
  } else if (order.itemType === "ai_report") {
    // AI Report for assessment — delegate to assessments module
    const { grantAiReportAccess } = await import("./assessments");
    await grantAiReportAccess(order.id);
  } else {
    const [exists] = await db.select({ id: userProductsTable.id })
      .from(userProductsTable)
      .where(and(eq(userProductsTable.userId, order.userId), eq(userProductsTable.productId, order.itemId)))
      .limit(1);
    if (!exists) await db.insert(userProductsTable).values({ userId: order.userId, productId: order.itemId });
  }
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /payment/gateway-status
router.get("/payment/gateway-status", requireUser, async (_req, res) => {
  res.json({ available: true, cardToCardEnabled: false });
});

// GET /payment/card-info  (kept for admin panel compatibility)
router.get("/payment/card-info", requireUser, async (_req, res) => {
  const info = await getCardInfo();
  res.json(info);
});

// POST /payment/create — Zarinpal درگاه
router.post("/payment/create", requireUser, async (req, res) => {
  const { itemType, itemId, variantKey, giftCode } = req.body as { itemType: string; itemId: number; variantKey?: string; giftCode?: string };
  const userId = req.user!.userId;

  if (!["course", "product", "ai_report"].includes(itemType) || !itemId) {
    res.status(400).json({ error: "پارامترهای نامعتبر" });
    return;
  }

  // ─── AI Report shortcut ───────────────────────────────────────────────────
  if (itemType === "ai_report") {
    const { assessmentsTable: asmTable } = await import("@workspace/db");
    const { assessmentSessionsTable: sessTable } = await import("@workspace/db");
    const [session] = await db.select({ assessmentId: sessTable.assessmentId, aiReportPurchased: sessTable.aiReportPurchased })
      .from(sessTable).where(eq(sessTable.id, itemId)).limit(1);
    if (!session) { res.status(404).json({ error: "نشست یافت نشد" }); return; }
    if (session.aiReportPurchased) { res.status(400).json({ error: "گزارش قبلاً خریداری شده" }); return; }
    const [asm] = await db.select({ aiReportPrice: asmTable.aiReportPrice, title: asmTable.title })
      .from(asmTable).where(eq(asmTable.id, session.assessmentId)).limit(1);
    if (!asm) { res.status(404).json({ error: "تست یافت نشد" }); return; }
    const reportAmount = asm.aiReportPrice ?? 0;
    if (reportAmount === 0) { res.status(400).json({ error: "این گزارش رایگان است" }); return; }
    const [order] = await db.insert(ordersTable)
      .values({ userId, itemType: "ai_report", itemId, amount: reportAmount, status: "pending", gateway: "zarinpal" })
      .returning();
    const dbSiteUrl = await getAdminSetting("site_url");
    const rawHost = (req.get("host") || "").split(":")[0];
    const domain = dbSiteUrl?.trim() || rawHost || process.env.SITE_URL || "localhost";
    const callbackUrl = `https://${domain}/api/payment/verify`;
    const dbMerchantId = await getAdminSetting("zarinpal_merchant_id");
    const dbSandbox = (await getAdminSetting("zarinpal_sandbox")) === "true";
    const gateway = createZarinPalGateway(dbMerchantId, dbSandbox);
    const result = await gateway.initiatePayment(reportAmount, `گزارش AI: ${asm.title}`, callbackUrl, order.id);
    if (!result.success || !result.authority || !result.paymentUrl) {
      await db.update(ordersTable).set({ status: "failed", cancelReason: result.error ?? "خطای درگاه", updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
      res.status(502).json({ error: result.error ?? "خطا در اتصال به درگاه" }); return;
    }
    await db.update(ordersTable).set({ zarinpalAuthority: result.authority, updatedAt: new Date() }).where(eq(ordersTable.id, order.id));
    res.json({ orderId: order.id, paymentUrl: result.paymentUrl, cardToCard: false });
    return;
  }

  // Check for existing access
  if (itemType === "course") {
    const [existing] = await db.select().from(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, userId), eq(userCoursesTable.courseId, itemId)))
      .limit(1);
    if (existing) { res.status(400).json({ error: "شما قبلاً این دوره را خریداری کرده‌اید" }); return; }
  } else {
    const [existing] = await db.select().from(userProductsTable)
      .where(and(eq(userProductsTable.userId, userId), eq(userProductsTable.productId, itemId)))
      .limit(1);
    if (existing) { res.status(400).json({ error: "شما قبلاً این محصول را خریداری کرده‌اید" }); return; }
  }

  // ─── Compute authoritative price/variant SERVER-SIDE ─────────────────────────
  let amount = 0;
  let description = "";
  let appliedVariantKey: string | null = null;
  let appliedDiscountPercent: number | null = null;

  const mtpCourseId = await getMtpCourseId();
  const isMtpCourse = itemType === "course" && mtpCourseId != null && itemId === mtpCourseId;

  if (isMtpCourse) {
    if (!variantKey) { res.status(400).json({ error: "لطفاً یکی از گزینه‌های خرید را انتخاب کنید" }); return; }
    const priced = await priceForVariant(userId, variantKey);
    if (!priced) { res.status(400).json({ error: "گزینه خرید نامعتبر است" }); return; }
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, itemId)).limit(1);
    if (!course) { res.status(400).json({ error: "دوره یافت نشد" }); return; }
    amount = priced.finalPrice;
    appliedVariantKey = priced.variant.key;
    appliedDiscountPercent = priced.discountPercent;
    description = `خرید دوره ${course.title} (${priced.variant.label})`;
    // Hidden gift code: flat extra discount off the amount actually charged.
    if (isValidGiftCode(giftCode)) {
      amount = applyGiftCode(amount, giftCode);
      description += " - با کد هدیه";
    }
  } else if (itemType === "course") {
    const [course] = await db.select().from(coursesTable).where(eq(coursesTable.id, itemId)).limit(1);
    if (!course) { res.status(400).json({ error: "دوره یافت نشد" }); return; }
    const discount = await getActiveItemDiscount(userId, "course", itemId);
    amount = discount.active ? computeDiscountedPrice(course.price, discount.percent) : course.price;
    appliedDiscountPercent = discount.active ? discount.percent : null;
    description = `خرید دوره آموزشی: ${course.title}`;
  } else {
    const [product] = await db.select().from(productsTable).where(eq(productsTable.id, itemId)).limit(1);
    if (!product) { res.status(400).json({ error: "محصول یافت نشد" }); return; }
    const discount = await getActiveItemDiscount(userId, "product", itemId);
    amount = discount.active ? computeDiscountedPrice(product.price, discount.percent) : product.price;
    appliedDiscountPercent = discount.active ? discount.percent : null;
    description = `خرید محصول: ${product.title}`;
  }

  // If there's already a pending Zarinpal order with authority, reuse it only when
  // the amount and variant match — otherwise the user changed their selection.
  const [existingPending] = await db.select().from(ordersTable)
    .where(and(
      eq(ordersTable.userId, userId),
      eq(ordersTable.itemType, itemType),
      eq(ordersTable.itemId, itemId),
      inArray(ordersTable.status, ["pending"]),
      eq(ordersTable.gateway, "zarinpal"),
    )).limit(1);

  const pendingMatches = existingPending
    && existingPending.amount === amount
    && (existingPending.variantKey ?? null) === appliedVariantKey;

  if (existingPending?.zarinpalAuthority && pendingMatches) {
    const paymentUrl = `https://www.zarinpal.com/pg/StartPay/${existingPending.zarinpalAuthority}`;
    req.log.info({ orderId: existingPending.id }, "reusing existing zarinpal authority");
    res.json({ orderId: existingPending.id, paymentUrl, cardToCard: false });
    return;
  }

  // Cancel any stale pending order for this item (no authority, or selection changed)
  await db.update(ordersTable)
    .set({ status: "failed", cancelReason: "جایگزین با سفارش جدید", updatedAt: new Date() })
    .where(and(
      eq(ordersTable.userId, userId),
      eq(ordersTable.itemType, itemType),
      eq(ordersTable.itemId, itemId),
      inArray(ordersTable.status, ["pending"])
    ));

  // Create order
  const [order] = await db.insert(ordersTable)
    .values({ userId, itemType, itemId, amount, variantKey: appliedVariantKey, discountPercent: appliedDiscountPercent, status: "pending", gateway: "zarinpal" })
    .returning();

  // Build callback URL — اولویت: دیتابیس → Host header → env var
  const dbSiteUrl = await getAdminSetting("site_url");
  // req.get("host") = مقدار Host header خام (همیشه با دامنه واقعی کاربر مطابقت دارد)
  const rawHost = (req.get("host") || "").split(":")[0]; // strip port
  const domain =
    dbSiteUrl?.trim() ||
    rawHost ||
    process.env.SITE_URL ||
    "localhost";
  const callbackUrl = `https://${domain}/api/payment/verify`;
  req.log.info({ callbackUrl }, "zarinpal callback URL");

  // Request Zarinpal payment — merchant ID از دیتابیس یا env var
  const dbMerchantId = await getAdminSetting("zarinpal_merchant_id");
  const dbSandbox = (await getAdminSetting("zarinpal_sandbox")) === "true";
  const gateway = createZarinPalGateway(dbMerchantId, dbSandbox);
  const result = await gateway.initiatePayment(amount, description, callbackUrl, order.id);

  if (!result.success || !result.authority || !result.paymentUrl) {
    await db.update(ordersTable)
      .set({ status: "failed", cancelReason: result.error ?? "خطای درگاه", updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id));

    // If Zarinpal says active transaction exists (-35), look up the old authority from a recently failed order
    const isActiveTransaction = result.error && (
      result.error.includes("در حال انجام") ||
      result.error.includes("active") ||
      result.error.includes("-35")
    );
    if (isActiveTransaction) {
      const candidates = await db.select().from(ordersTable)
        .where(and(
          eq(ordersTable.userId, userId),
          eq(ordersTable.itemType, itemType),
          eq(ordersTable.itemId, itemId),
          eq(ordersTable.gateway, "zarinpal"),
        ))
        .orderBy(desc(ordersTable.createdAt))
        .limit(5);
      // Only reuse an old authority that matches the CURRENT checkout amount + variant
      // (amount already reflects any applied gift code), otherwise the user could be
      // sent to pay a stale, wrong amount.
      const oldOrder = candidates.find((o) =>
        o.zarinpalAuthority != null &&
        o.amount === amount &&
        (o.variantKey ?? null) === appliedVariantKey
      );
      if (oldOrder?.zarinpalAuthority) {
        // Reactivate that order as pending
        await db.update(ordersTable)
          .set({ status: "pending", cancelReason: null, updatedAt: new Date() })
          .where(eq(ordersTable.id, oldOrder.id));
        const paymentUrl = `https://www.zarinpal.com/pg/StartPay/${oldOrder.zarinpalAuthority}`;
        req.log.info({ orderId: oldOrder.id, authority: oldOrder.zarinpalAuthority }, "recovered zarinpal authority from old order");
        res.json({ orderId: oldOrder.id, paymentUrl, cardToCard: false });
        return;
      }
    }

    req.log.error({ orderId: order.id, error: result.error }, "zarinpal initiate failed");
    res.status(502).json({ error: result.error || "خطا در ایجاد درگاه پرداخت" });
    return;
  }

  await db.update(ordersTable)
    .set({ zarinpalAuthority: result.authority, updatedAt: new Date() })
    .where(eq(ordersTable.id, order.id));

  req.log.info({ userId, orderId: order.id, amount }, "zarinpal order created");

  res.json({ orderId: order.id, paymentUrl: result.paymentUrl, cardToCard: false });
});

// POST /orders/:orderId/receipt — upload receipt image
router.post("/orders/:orderId/receipt", requireUser, uploadReceipt.single("receipt"), async (req, res) => {
  const userId = req.user!.userId;
  const orderId = Number(req.params.orderId);
  if (!req.file) { res.status(400).json({ message: "لطفاً عکس رسید را آپلود کنید" }); return; }

  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId), eq(ordersTable.status, "pending")))
    .limit(1);
  if (!order) { res.status(404).json({ message: "سفارش یافت نشد" }); return; }

  let receiptUrl: string;

  if (isStorageConfigured()) {
    const ext = path.extname(req.file.originalname) || ".jpg";
    const key = `receipts/${randomUUID()}${ext}`;
    try {
      const storage = getStorageService();
      receiptUrl = await storage.upload(key, req.file.buffer, {
        contentType: req.file.mimetype,
        cacheControl: "private, max-age=86400",
      });
    } catch (uploadErr) {
      logger.error({ err: uploadErr }, "S3 upload failed for receipt");
      res.status(500).json({ message: "خطا در آپلود تصویر رسید" });
      return;
    }
  } else {
    // Fallback: write to disk
    const RECEIPTS_DIR = path.join(UPLOAD_DIR, "receipts");
    try { if (!fs.existsSync(RECEIPTS_DIR)) fs.mkdirSync(RECEIPTS_DIR, { recursive: true }); } catch { /* ignore */ }
    const filename = `${randomUUID()}${path.extname(req.file.originalname)}`;
    fs.writeFileSync(path.join(RECEIPTS_DIR, filename), req.file.buffer);
    receiptUrl = `/uploads/receipts/${filename}`;
  }

  await db.update(ordersTable).set({ receiptUrl, updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
  res.json({ success: true, receiptUrl });
});

// GET /orders/my — list current user's orders with item name
router.get("/orders/my", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const orders = await db
    .select({
      id: ordersTable.id,
      itemType: ordersTable.itemType,
      itemId: ordersTable.itemId,
      amount: ordersTable.amount,
      status: ordersTable.status,
      trackingCode: ordersTable.zarinpalAuthority,
      receiptUrl: ordersTable.receiptUrl,
      cancelReason: ordersTable.cancelReason,
      gateway: ordersTable.gateway,
      createdAt: ordersTable.createdAt,
      courseName: coursesTable.title,
      productName: productsTable.title,
    })
    .from(ordersTable)
    .leftJoin(coursesTable, and(eq(ordersTable.itemType, "course"), eq(ordersTable.itemId, coursesTable.id)))
    .leftJoin(productsTable, and(eq(ordersTable.itemType, "product"), eq(ordersTable.itemId, productsTable.id)))
    .where(eq(ordersTable.userId, userId))
    .orderBy(desc(ordersTable.createdAt))
    .limit(20);

  res.json(orders.map((o) => ({
    ...o,
    itemName: o.courseName ?? o.productName ?? (o.itemType === "avatar" ? "آواتار دستیار" : "—"),
  })));
});

// POST /orders/:orderId/cancel — user cancels their pending order
router.post("/orders/:orderId/cancel", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const orderId = Number(req.params.orderId);
  const { reason } = req.body as { reason?: string };
  if (!reason?.trim()) { res.status(400).json({ error: "دلیل لغو الزامی است" }); return; }

  const [order] = await db.select()
    .from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.userId, userId), eq(ordersTable.status, "pending")))
    .limit(1);
  if (!order) { res.status(404).json({ error: "سفارش یافت نشد یا قابل لغو نیست" }); return; }

  await db.update(ordersTable)
    .set({ status: "failed", cancelReason: reason.trim(), updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  res.json({ success: true });
});

// ─── Admin card-to-card routes ────────────────────────────────────────────────

// GET /admin/card-orders
router.get("/admin/card-orders", requireAdmin, async (_req, res) => {
  const orders = await db.select()
    .from(ordersTable)
    .where(and(eq(ordersTable.gateway, "card_to_card"), eq(ordersTable.status, "pending")))
    .orderBy(desc(ordersTable.createdAt));
  res.json(orders);
});

// POST /admin/card-orders/:orderId/approve
router.post("/admin/card-orders/:orderId/approve", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.gateway, "card_to_card"), eq(ordersTable.status, "pending")))
    .limit(1);
  if (!order) { res.status(404).json({ message: "سفارش یافت نشد" }); return; }

  const refId = `MANUAL-${Date.now().toString(36).toUpperCase()}`;
  await db.update(ordersTable)
    .set({ status: "paid", transactionId: refId, updatedAt: new Date() })
    .where(eq(ordersTable.id, orderId));

  await grantOrderAccess(order);
  handleTribeCommission({ ...order, status: "paid", transactionId: refId }).catch(() => {});
  notifyOwnerOfPurchase(order).catch(() => {});
  // This request is the ADMIN's browser, not the buyer's — never trust its
  // attribution cookie here. Resolve purely from the buyer's own attribution
  // history (last-click, 30-day window).
  attributePurchase(null, null, order.id, order.userId, order.amount).catch(() => {});
  sendPushToUser(order.userId, {
    title: "✅ خرید موفق",
    body: "پرداخت کارت به کارت شما تأیید شد. دسترسی فعال است.",
    url: order.itemType === "course" ? "/courses" : "/products",
  }).catch(() => {});
  sendPurchaseNotificationEmail({
    orderId: order.id,
    userId: order.userId,
    itemType: order.itemType,
    itemId: order.itemId,
    amount: order.amount,
    gateway: order.gateway,
    transactionId: refId,
    variantKey: order.variantKey,
  }).catch(() => {});

  req.log.info({ orderId, userId: order.userId }, "card order approved by admin");
  res.json({ success: true });
});

// POST /admin/card-orders/:orderId/reject
router.post("/admin/card-orders/:orderId/reject", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const [order] = await db.select().from(ordersTable)
    .where(and(eq(ordersTable.id, orderId), eq(ordersTable.gateway, "card_to_card"), eq(ordersTable.status, "pending")))
    .limit(1);
  if (!order) { res.status(404).json({ message: "سفارش یافت نشد" }); return; }

  await db.update(ordersTable).set({ status: "failed", updatedAt: new Date() }).where(eq(ordersTable.id, orderId));
  sendPushToUser(order.userId, {
    title: "❌ خرید ناموفق",
    body: "پرداخت کارت به کارت شما تأیید نشد. با پشتیبانی تماس بگیرید.",
  }).catch(() => {});
  req.log.info({ orderId }, "card order rejected by admin");
  res.json({ success: true });
});

// POST /admin/card-settings
router.post("/admin/card-settings", requireAdmin, async (req, res) => {
  const { cardNumber, cardHolder, bankName, shebaNumber, enabled } = req.body as {
    cardNumber?: string; cardHolder?: string; bankName?: string;
    shebaNumber?: string; enabled?: boolean;
  };
  await Promise.all([
    cardNumber !== undefined && setAdminSetting("card_to_card_number", cardNumber),
    cardHolder !== undefined && setAdminSetting("card_to_card_holder", cardHolder),
    bankName !== undefined && setAdminSetting("card_to_card_bank", bankName),
    shebaNumber !== undefined && setAdminSetting("card_to_card_sheba", shebaNumber),
    enabled !== undefined && setAdminSetting("card_to_card_enabled", enabled ? "true" : "false"),
  ]);
  req.log.info("card settings updated");
  res.json({ success: true });
});

// GET /admin/card-settings
router.get("/admin/card-settings", requireAdmin, async (_req, res) => {
  const info = await getCardInfo();
  const enabled = (await getAdminSetting("card_to_card_enabled")) !== "false";
  res.json({ ...info, enabled });
});

// GET /payment/verify — Zarinpal callback
router.get("/payment/verify", async (req, res) => {
  const { Authority, Status } = req.query as { Authority?: string; Status?: string };

  if (Status !== "OK" || !Authority) {
    return res.redirect(
      "/payment-result?status=failed&message=" + encodeURIComponent("پرداخت لغو شد یا ناموفق بود"),
    );
  }

  const [order] = await db
    .select()
    .from(ordersTable)
    .where(eq(ordersTable.zarinpalAuthority, Authority))
    .limit(1);

  if (!order) {
    return res.redirect(
      "/payment-result?status=failed&message=" + encodeURIComponent("سفارش یافت نشد"),
    );
  }

  // Already paid (duplicate callback)
  if (order.status === "paid") {
    return res.redirect(
      `/payment-result?status=success&refId=${order.transactionId}&orderId=${order.id}`,
    );
  }

  // Verify with Zarinpal — merchant ID از دیتابیس یا env var
  const vMerchantId = await getAdminSetting("zarinpal_merchant_id");
  const vSandbox = (await getAdminSetting("zarinpal_sandbox")) === "true";
  const verifyGateway = createZarinPalGateway(vMerchantId, vSandbox);
  const result = await verifyGateway.verifyPayment(Authority, order.amount);

  if (!result.success || !result.refId) {
    await db
      .update(ordersTable)
      .set({ status: "failed", updatedAt: new Date() })
      .where(eq(ordersTable.id, order.id));
    logger.warn({ orderId: order.id, error: result.error }, "zarinpal verify failed");
    return res.redirect(
      "/payment-result?status=failed&message=" + encodeURIComponent(result.error || "پرداخت تأیید نشد"),
    );
  }

  await db
    .update(ordersTable)
    .set({ status: "paid", transactionId: result.refId, updatedAt: new Date() })
    .where(eq(ordersTable.id, order.id));

  await grantOrderAccess(order);
  handleTribeCommission({ ...order, status: "paid", transactionId: result.refId }).catch(() => {});
  notifyOwnerOfPurchase(order).catch(() => {});
  attributePurchase(req, res, order.id, order.userId, order.amount).catch(() => {});

  const pushUrl =
    order.itemType === "course"
      ? "/courses"
      : order.itemType === "ai_report"
      ? `/tools` // user navigates to result from payment-result page
      : "/products";
  const pushBody =
    order.itemType === "ai_report"
      ? "گزارش AI شما آماده است! همین حالا مشاهده کنید."
      : "دسترسی شما فعال شد. از بخش دوره‌ها یا محصولات وارد شوید.";
  sendPushToUser(order.userId, {
    title: "✅ خرید موفق",
    body: pushBody,
    url: pushUrl,
  }).catch(() => {});

  sendPurchaseNotificationEmail({
    orderId: order.id,
    userId: order.userId,
    itemType: order.itemType,
    itemId: order.itemId,
    amount: order.amount,
    gateway: order.gateway,
    transactionId: result.refId,
    variantKey: order.variantKey,
  }).catch(() => {});

  logger.info({ orderId: order.id, refId: result.refId, userId: order.userId }, "zarinpal payment verified");

  // For ai_report: include sessionId so PWA can redirect back to result page
  const extraParams =
    order.itemType === "ai_report"
      ? `&itemType=ai_report&sessionId=${order.itemId}`
      : "";

  return res.redirect(
    `/payment-result?status=success&refId=${result.refId}&orderId=${order.id}${extraParams}`,
  );
});

export default router;
