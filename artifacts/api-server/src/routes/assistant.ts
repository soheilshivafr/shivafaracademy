import { Router } from "express";
import { db } from "@workspace/db";
import {
  usersTable,
  userTasksTable,
  assistantRemindersTable,
  avatarPurchasesTable,
  avatarOrdersTable,
  knowledgeBaseTable,
  assistantChatHistoryTable,
  siteSettingsTable,
} from "@workspace/db";
import { eq, and, lte, isNull, gt, gte, desc, isNotNull, sql } from "drizzle-orm";
import { requireUser, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";
import { getCardInfo, getAdminSetting } from "../lib/settings";
import { createZarinPalGateway } from "../lib/payment-gateway";
import { sendPurchaseNotificationEmail } from "../lib/purchase-notification";

const router = Router();

// ─── TASK CRUD ───────────────────────────────────────────────────────────────

router.get("/assistant/tasks", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const status = req.query.status as string | undefined;
  const conditions: any[] = [eq(userTasksTable.userId, userId)];
  if (status && status !== "all") conditions.push(eq(userTasksTable.status, status));
  const rows = await db.select().from(userTasksTable).where(and(...conditions)).orderBy(desc(userTasksTable.createdAt));
  const priorityOrder: Record<string, number> = { urgent: 0, important: 1, normal: 2 };
  const sorted = rows.sort((a, b) => (priorityOrder[a.priority ?? "normal"] ?? 2) - (priorityOrder[b.priority ?? "normal"] ?? 2));
  res.json(sorted);
});

router.post("/assistant/tasks", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { title, category, dueAt, priority, repeatType, repeatDays } = req.body;
  if (!title?.trim()) {
    res.status(400).json({ message: "عنوان الزامی است" });
    return;
  }
  const [task] = await db.insert(userTasksTable).values({
    userId,
    title: title.trim(),
    category: category || "personal",
    priority: priority || "normal",
    dueAt: dueAt ? new Date(dueAt) : null,
    repeatType: repeatType || "none",
    repeatDays: repeatDays || null,
  }).returning();
  res.json(task);
});

router.patch("/assistant/tasks/:id", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params["id"] as string);
  const { status } = req.body;
  const [task] = await db.update(userTasksTable).set({ status })
    .where(and(eq(userTasksTable.id, id), eq(userTasksTable.userId, userId))).returning();
  if (!task) { res.status(404).json({ message: "کار پیدا نشد" }); return; }
  res.json(task);
});

router.put("/assistant/tasks/:id", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params["id"] as string);
  const { title, category, dueAt, priority, repeatType, repeatDays } = req.body;
  const data: Record<string, unknown> = {};
  if (title !== undefined) data.title = title;
  if (category !== undefined) data.category = category;
  if (priority !== undefined) data.priority = priority;
  if (dueAt !== undefined) data.dueAt = dueAt ? new Date(dueAt) : null;
  if (repeatType !== undefined) data.repeatType = repeatType;
  if (repeatDays !== undefined) data.repeatDays = repeatDays || null;
  const [task] = await db.update(userTasksTable).set(data)
    .where(and(eq(userTasksTable.id, id), eq(userTasksTable.userId, userId))).returning();
  if (!task) { res.status(404).json({ message: "کار پیدا نشد" }); return; }
  res.json(task);
});

router.post("/assistant/tasks/:id/reschedule", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params["id"] as string);
  const { to } = req.body as { to: "today" | "tomorrow" | "next-week" };
  const now = new Date();
  let newDue: Date;
  if (to === "today") {
    newDue = new Date(now); newDue.setHours(23, 59, 0, 0);
  } else if (to === "tomorrow") {
    newDue = new Date(now); newDue.setDate(now.getDate() + 1); newDue.setHours(9, 0, 0, 0);
  } else {
    newDue = new Date(now); newDue.setDate(now.getDate() + 7); newDue.setHours(9, 0, 0, 0);
  }
  const [task] = await db.update(userTasksTable).set({ dueAt: newDue, remindedAt: null })
    .where(and(eq(userTasksTable.id, id), eq(userTasksTable.userId, userId))).returning();
  if (!task) { res.status(404).json({ message: "کار پیدا نشد" }); return; }
  res.json(task);
});

router.delete("/assistant/tasks/:id", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const id = parseInt(req.params["id"] as string);
  await db.delete(userTasksTable).where(and(eq(userTasksTable.id, id), eq(userTasksTable.userId, userId)));
  res.json({ success: true });
});

// ─── REMINDERS ───────────────────────────────────────────────────────────────

router.get("/assistant/reminders", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const now = new Date();
  const reminders = await db.select().from(assistantRemindersTable).where(and(
    eq(assistantRemindersTable.userId, userId),
    sql`(${assistantRemindersTable.expiresAt} IS NULL OR ${assistantRemindersTable.expiresAt} > ${now})`,
  )).orderBy(desc(assistantRemindersTable.firedAt));
  res.json(reminders);
});

router.get("/assistant/reminders/unread-count", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const [unreadRow] = await db.select({ count: sql<number>`count(*)::int` })
    .from(assistantRemindersTable)
    .where(and(eq(assistantRemindersTable.userId, userId), isNull(assistantRemindersTable.readAt)));
  const [latestRow] = await db.select({ latestFiredAt: sql<string | null>`max(fired_at)::text` })
    .from(assistantRemindersTable).where(eq(assistantRemindersTable.userId, userId));
  res.json({ count: unreadRow?.count ?? 0, latestFiredAt: latestRow?.latestFiredAt ?? null });
});

router.post("/assistant/reminders/read", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  await db.update(assistantRemindersTable).set({ readAt: new Date() })
    .where(and(eq(assistantRemindersTable.userId, userId), isNull(assistantRemindersTable.readAt)));
  res.json({ ok: true });
});

// ─── KNOWLEDGE BASE ──────────────────────────────────────────────────────────

router.get("/assistant/kb/faq-chips", requireUser, async (req, res) => {
  const dayIdx = Math.floor(Date.now() / 86_400_000);
  const all = await db.select({ id: knowledgeBaseTable.id, question: knowledgeBaseTable.question, category: knowledgeBaseTable.category })
    .from(knowledgeBaseTable).where(eq(knowledgeBaseTable.isActive, true)).orderBy(knowledgeBaseTable.sortOrder);
  if (all.length === 0) { res.json([]); return; }
  const categories = ["platform", "assistant", "productivity"];
  const chips = categories.map((cat, ci) => {
    const pool = all.filter(e => e.category === cat);
    if (pool.length === 0) return null;
    return pool[(dayIdx + ci) % pool.length];
  }).filter(Boolean).slice(0, 3);
  res.json(chips);
});

router.get("/assistant/kb/:id", requireUser, async (req, res) => {
  const id = Number(req.params.id);
  const [entry] = await db.select().from(knowledgeBaseTable)
    .where(and(eq(knowledgeBaseTable.id, id), eq(knowledgeBaseTable.isActive, true)));
  if (!entry) { res.status(404).json({ message: "یافت نشد" }); return; }
  res.json(entry);
});

// ─── CHAT HISTORY ────────────────────────────────────────────────────────────

router.get("/assistant/chat", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const msgs = await db.select().from(assistantChatHistoryTable)
    .where(eq(assistantChatHistoryTable.userId, userId))
    .orderBy(assistantChatHistoryTable.createdAt).limit(100);
  res.json(msgs);
});

router.post("/assistant/chat", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { message } = req.body as { message: string };
  if (!message?.trim()) { res.status(400).json({ message: "پیام خالی است" }); return; }

  await db.insert(assistantChatHistoryTable).values({ userId, role: "user", content: message.trim() });

  const q = message.trim().toLowerCase();
  const all = await db.select().from(knowledgeBaseTable)
    .where(eq(knowledgeBaseTable.isActive, true)).orderBy(knowledgeBaseTable.sortOrder);
  const scored = all.map(e => {
    let score = 0;
    if (e.question.toLowerCase().includes(q)) score += 3;
    if (e.answer.toLowerCase().includes(q)) score += 2;
    if (e.tags && e.tags.some((t: string) => q.includes(t) || t.includes(q))) score += 2;
    const words = q.split(/\s+/).filter((w: string) => w.length > 1);
    for (const w of words) {
      if (e.question.toLowerCase().includes(w)) score += 1;
      if (e.answer.toLowerCase().includes(w)) score += 0.5;
    }
    return { entry: e, score };
  }).filter(x => x.score > 0).sort((a, b) => b.score - a.score);

  let replyContent: string;
  let kbEntryId: number | null = null;

  const [avalaiKeySetting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "avalai_api_key")).limit(1);
  const avalaiKey = avalaiKeySetting?.value?.trim() || process.env.AVALAI_API_KEY;
  if (avalaiKey) {
    try {
      const history = await db.select().from(assistantChatHistoryTable)
        .where(eq(assistantChatHistoryTable.userId, userId))
        .orderBy(desc(assistantChatHistoryTable.createdAt)).limit(10);
      const recentMessages = history.reverse().slice(0, -1);

      const [topicsSetting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "chatbot_allowed_topics")).limit(1);
      const [modelSetting] = await db.select().from(siteSettingsTable).where(eq(siteSettingsTable.key, "chatbot_model")).limit(1);
      const allowedTopics = topicsSetting?.value?.trim() || "";
      const model = modelSetting?.value?.trim() || "gpt-4o";

      const contextEntries = scored.slice(0, 5).map(x => `س: ${x.entry.question}\nج: ${x.entry.answer}`).join("\n\n");

      const topicInstruction = allowedTopics
        ? `فقط در موضوعات زیر پاسخ بده: ${allowedTopics}. اگر سوال خارج از این موضوعات بود، مودبانه بگو که فقط در این زمینه‌ها می‌تونی کمک کنی.`
        : "";

      const systemPrompt = [
        "تو دستیار هوشمند پلتفرم آموزشی شیوافر آکادمی هستی. همیشه به فارسی پاسخ بده. مختصر، مفید و دوستانه باش.",
        topicInstruction,
        contextEntries ? `اطلاعات مرتبط:\n${contextEntries}` : "",
      ].filter(Boolean).join("\n\n");

      const messages = [
        { role: "system", content: systemPrompt },
        ...recentMessages.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        { role: "user", content: message.trim() },
      ];

      const response = await fetch("https://api.avalai.ir/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${avalaiKey}` },
        body: JSON.stringify({ model, messages, max_tokens: 700, temperature: 0.7 }),
        signal: AbortSignal.timeout(20000),
      });

      if (response.ok) {
        const data = await response.json() as { choices: Array<{ message: { content: string } }> };
        replyContent = data.choices[0]?.message?.content?.trim() || "پاسخی دریافت نشد.";
        if (scored.length > 0) kbEntryId = scored[0].entry.id;
      } else {
        throw new Error(`avalai status ${response.status}`);
      }
    } catch (err) {
      logger.warn({ err }, "[Assistant] avalai failed, falling back to KB");
      if (scored.length > 0) {
        kbEntryId = scored[0].entry.id;
        replyContent = scored[0].entry.answer;
      } else {
        replyContent = "متأسفم، الان نمی‌تونم پاسخ بدم. لطفاً دوباره تلاش کن. 🤔";
      }
    }
  } else {
    if (scored.length > 0) {
      kbEntryId = scored[0].entry.id;
      replyContent = scored[0].entry.answer;
    } else {
      replyContent = "متأسفم، جواب دقیقی پیدا نکردم. می‌تونی سؤالت رو با کلمات دیگه‌ای بنویسی؟ 🤔";
    }
  }

  const [saved] = await db.insert(assistantChatHistoryTable).values({
    userId, role: "assistant", content: replyContent, kbEntryId,
  }).returning();

  const kbEntry = kbEntryId ? scored[0]?.entry : null;
  res.json({
    message: saved,
    kbEntry: kbEntry ? { id: kbEntry.id, actionRoute: kbEntry.actionRoute, actionLabel: kbEntry.actionLabel } : null,
  });
});

router.delete("/assistant/chat", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  await db.delete(assistantChatHistoryTable).where(eq(assistantChatHistoryTable.userId, userId));
  res.json({ ok: true });
});

// ─── AVATAR & NAME ───────────────────────────────────────────────────────────

router.patch("/user/assistant-name", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { name } = req.body as { name?: string };
  const trimmed = name?.trim().slice(0, 50) || null;
  await db.update(usersTable).set({ assistantName: trimmed }).where(eq(usersTable.id, userId));
  res.json({ ok: true, name: trimmed });
});

router.get("/user/assistant-avatars", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const FREE_AVATAR_IDS = ["ruby", "aika"];
  const PAID_AVATAR_IDS = ["av1","av2","av3","av4","av5","av6","av7","av8","av9","av10","av11","am1","am2","am3","am4","am5","am6","am7","am8","am9"];

  const now = new Date();
  const purchases = await db.select({ avatarId: avatarPurchasesTable.avatarId, expiresAt: avatarPurchasesTable.expiresAt })
    .from(avatarPurchasesTable).where(and(eq(avatarPurchasesTable.userId, userId), gt(avatarPurchasesTable.expiresAt, now)));
  const activeMap: Record<string, Date> = {};
  for (const p of purchases) {
    if (!activeMap[p.avatarId] || (p.expiresAt && p.expiresAt > activeMap[p.avatarId]))
      activeMap[p.avatarId] = p.expiresAt!;
  }
  const owned = [...FREE_AVATAR_IDS, ...PAID_AVATAR_IDS.filter(id => id in activeMap)];
  res.json({ owned, hasPremium: false, activeSubscriptions: activeMap });
});

router.patch("/user/assistant-avatar", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { avatarId } = req.body as { avatarId?: string | null };
  await db.update(usersTable).set({ assistantAvatar: avatarId ?? null }).where(eq(usersTable.id, userId));
  res.json({ ok: true });
});

// ─── AVATAR PURCHASE (ZarinPal) ──────────────────────────────────────────────

router.post("/user/assistant-avatar/buy", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { avatarId } = req.body as { avatarId: string };
  if (!avatarId) { res.status(400).json({ message: "avatarId لازم است" }); return; }

  const AMOUNT = 99000;

  // Check not already owned
  const [alreadyOwned] = await db.select().from(avatarPurchasesTable)
    .where(and(eq(avatarPurchasesTable.userId, userId), eq(avatarPurchasesTable.avatarId, avatarId)))
    .limit(1);
  if (alreadyOwned) { res.status(400).json({ message: "این آواتار قبلاً خریداری شده است" }); return; }

  // Reuse existing pending ZarinPal order if any
  const [existing] = await db.select().from(avatarOrdersTable)
    .where(and(
      eq(avatarOrdersTable.userId, userId),
      eq(avatarOrdersTable.avatarId, avatarId),
      eq(avatarOrdersTable.status, "pending"),
      eq(avatarOrdersTable.gateway, "zarinpal"),
    ))
    .orderBy(desc(avatarOrdersTable.createdAt))
    .limit(1);
  if (existing?.gatewayAuthority) {
    const paymentUrl = `https://www.zarinpal.com/pg/StartPay/${existing.gatewayAuthority}`;
    res.json({ orderId: existing.id, paymentUrl });
    return;
  }

  const [order] = await db.insert(avatarOrdersTable).values({
    userId, avatarId, amount: AMOUNT, status: "pending", gateway: "zarinpal",
  }).returning();

  // Build callback URL
  const dbSiteUrl = await getAdminSetting("site_url");
  const rawHost = (req.get("host") || "").split(":")[0];
  const domain = dbSiteUrl?.trim() || rawHost || process.env.SITE_URL || "localhost";
  const callbackUrl = `https://${domain}/api/avatar-verify?avatarId=${encodeURIComponent(avatarId)}&orderId=${order.id}`;

  req.log.info({ callbackUrl }, "avatar zarinpal callback URL");

  const dbMerchantId = await getAdminSetting("zarinpal_merchant_id");
  const dbSandbox = (await getAdminSetting("zarinpal_sandbox")) === "true";
  const gateway = createZarinPalGateway(dbMerchantId, dbSandbox);
  const result = await gateway.initiatePayment(AMOUNT, `خرید آواتار — ${avatarId}`, callbackUrl, order.id);

  if (!result.success || !result.authority || !result.paymentUrl) {
    await db.update(avatarOrdersTable)
      .set({ status: "failed" })
      .where(eq(avatarOrdersTable.id, order.id));
    req.log.error({ orderId: order.id, error: result.error }, "avatar zarinpal initiate failed");
    res.status(502).json({ error: result.error || "خطا در ایجاد درگاه پرداخت" });
    return;
  }

  await db.update(avatarOrdersTable)
    .set({ gatewayAuthority: result.authority })
    .where(eq(avatarOrdersTable.id, order.id));

  req.log.info({ userId, orderId: order.id, avatarId }, "avatar zarinpal order created");
  res.json({ orderId: order.id, paymentUrl: result.paymentUrl });
});

// GET /assistant/avatar-verify — ZarinPal callback for avatar purchase
router.get("/avatar-verify", async (req, res) => {
  const { Authority, Status, avatarId, orderId } = req.query as {
    Authority?: string; Status?: string; avatarId?: string; orderId?: string;
  };

  const failRedirect = (msg: string) =>
    res.redirect(`/?avatarPayment=failed&message=${encodeURIComponent(msg)}`);

  if (Status !== "OK" || !Authority || !avatarId || !orderId) {
    return failRedirect("پرداخت لغو شد یا ناموفق بود");
  }

  const [order] = await db.select().from(avatarOrdersTable)
    .where(eq(avatarOrdersTable.id, Number(orderId)))
    .limit(1);

  if (!order) return failRedirect("سفارش یافت نشد");
  if (order.status === "paid") {
    return res.redirect(`/?avatarPayment=success&avatarId=${encodeURIComponent(avatarId)}`);
  }

  const vMerchantId = await getAdminSetting("zarinpal_merchant_id");
  const vSandbox = (await getAdminSetting("zarinpal_sandbox")) === "true";
  const verifyGateway = createZarinPalGateway(vMerchantId, vSandbox);
  const result = await verifyGateway.verifyPayment(Authority, order.amount);

  if (!result.success || !result.refId) {
    await db.update(avatarOrdersTable)
      .set({ status: "failed" })
      .where(eq(avatarOrdersTable.id, order.id));
    logger.warn({ orderId: order.id, error: result.error }, "avatar zarinpal verify failed");
    return failRedirect(result.error || "پرداخت تأیید نشد");
  }

  // Mark order paid and grant avatar
  await db.update(avatarOrdersTable)
    .set({ status: "paid", gatewayRefId: result.refId })
    .where(eq(avatarOrdersTable.id, order.id));

  await db.insert(avatarPurchasesTable).values({
    userId: order.userId, avatarId: order.avatarId, pricePaid: order.amount,
  }).onConflictDoNothing();

  sendPurchaseNotificationEmail({
    orderId: order.id,
    userId: order.userId,
    itemType: "avatar",
    itemId: order.avatarId,
    amount: order.amount,
    gateway: "zarinpal",
    transactionId: result.refId,
  }).catch(() => {});

  logger.info({ orderId: order.id, refId: result.refId, userId: order.userId }, "avatar zarinpal payment verified");
  return res.redirect(`/?avatarPayment=success&avatarId=${encodeURIComponent(avatarId)}`);
});

// POST /admin/avatar-orders/:orderId/approve — admin approves avatar card payment
router.post("/admin/avatar-orders/:orderId/approve", requireAdmin, async (req, res) => {
  const orderId = Number(req.params.orderId);
  const [order] = await db.select().from(avatarOrdersTable)
    .where(and(eq(avatarOrdersTable.id, orderId), eq(avatarOrdersTable.status, "pending")))
    .limit(1);
  if (!order) { res.status(404).json({ message: "سفارش یافت نشد" }); return; }

  await db.insert(avatarPurchasesTable).values({
    userId: order.userId, avatarId: order.avatarId, pricePaid: order.amount,
  });
  await db.update(avatarOrdersTable)
    .set({ status: "paid", gatewayRefId: "admin_approved" })
    .where(eq(avatarOrdersTable.id, orderId));

  sendPurchaseNotificationEmail({
    orderId: order.id,
    userId: order.userId,
    itemType: "avatar",
    itemId: order.avatarId,
    amount: order.amount,
    gateway: order.gateway,
    transactionId: "admin_approved",
  }).catch(() => {});

  req.log.info({ orderId }, "avatar order approved by admin");
  res.json({ success: true });
});

// GET /admin/avatar-orders — list pending avatar card orders
router.get("/admin/avatar-orders", requireAdmin, async (_req, res) => {
  const orders = await db.select().from(avatarOrdersTable)
    .where(and(eq(avatarOrdersTable.gateway, "card_to_card"), eq(avatarOrdersTable.status, "pending")));
  res.json(orders);
});

// ─── BACKGROUND JOBS ─────────────────────────────────────────────────────────

async function scheduleNextRecurrence(task: typeof userTasksTable.$inferSelect) {
  if (!task.dueAt || task.repeatType === "none") return;
  const next = new Date(task.dueAt);
  if (task.repeatType === "daily") {
    next.setDate(next.getDate() + 1);
  } else if (task.repeatType === "weekly") {
    next.setDate(next.getDate() + 7);
  } else if (task.repeatType === "monthly") {
    next.setMonth(next.getMonth() + 1);
  } else if (task.repeatType === "custom" && task.repeatDays) {
    const days = task.repeatDays.split(",").map(Number).filter(n => !isNaN(n));
    if (days.length === 0) return;
    const now = new Date();
    const today = now.getDay();
    const sorted = [...days].sort((a, b) => a - b);
    const nextDay = sorted.find(d => d > today) ?? sorted[0];
    const daysUntil = nextDay > today ? nextDay - today : 7 - today + nextDay;
    next.setTime(now.getTime());
    next.setDate(now.getDate() + daysUntil);
    const origDue = new Date(task.dueAt);
    next.setHours(origDue.getHours(), origDue.getMinutes(), 0, 0);
  } else return;
  await db.update(userTasksTable).set({ dueAt: next, remindedAt: null }).where(eq(userTasksTable.id, task.id));
}

export function startAssistantJobs() {
  setInterval(async () => {
    try {
      const dueTasks = await db.select().from(userTasksTable).where(and(
        lte(userTasksTable.dueAt, new Date()),
        isNull(userTasksTable.remindedAt),
        eq(userTasksTable.status, "pending"),
      ));
      for (const task of dueTasks) {
        await db.update(userTasksTable).set({ remindedAt: new Date() }).where(eq(userTasksTable.id, task.id));
        if (task.repeatType && task.repeatType !== "none") {
          await scheduleNextRecurrence(task);
        }
        // Prevent duplicate reminders (skip if same category sent in last 20h)
        const since20h = new Date(Date.now() - 20 * 60 * 60 * 1000);
        const [existing] = await db.select({ id: assistantRemindersTable.id })
          .from(assistantRemindersTable)
          .where(and(
            eq(assistantRemindersTable.userId, task.userId),
            eq(assistantRemindersTable.taskCategory, task.category),
            gte(assistantRemindersTable.firedAt, since20h),
          )).limit(1);
        if (!existing) {
          await db.insert(assistantRemindersTable).values({
            userId: task.userId, taskId: task.id, taskTitle: task.title, taskCategory: task.category, firedAt: new Date(),
          });
        }
      }
    } catch (err) { logger.error({ err }, "[Assistant] reminder job error"); }
  }, 60_000);

  // Clean expired reminders every hour
  setInterval(async () => {
    try {
      const now = new Date();
      await db.delete(assistantRemindersTable).where(and(
        isNotNull(assistantRemindersTable.expiresAt),
        lte(assistantRemindersTable.expiresAt, now),
      ));
    } catch { /* noop */ }
  }, 3_600_000);
}

export default router;
