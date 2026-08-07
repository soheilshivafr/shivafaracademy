import { Router } from "express";
import { db } from "@workspace/db";
import {
  chatbotKnowledgeTable, siteSettingsTable,
  userLeadProfilesTable, advisorRequestsTable,
  pushSubscriptionsTable, aiChatMessagesTable,
  usersTable, coursesTable,
} from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

router.get("/admin/system/status", requireAdmin, async (_req, res) => {
  try {
    const [
      kbCount, leadCount, advisorCount, pushCount,
      chatMsgCount, userCount, courseCount,
      modelSetting,
    ] = await Promise.all([
      db.select({ n: count() }).from(chatbotKnowledgeTable),
      db.select({ n: count() }).from(userLeadProfilesTable),
      db.select({ n: count() }).from(advisorRequestsTable),
      db.select({ n: count() }).from(pushSubscriptionsTable),
      db.select({ n: count() }).from(aiChatMessagesTable),
      db.select({ n: count() }).from(usersTable),
      db.select({ n: count() }).from(coursesTable).where(eq(coursesTable.isPublished, true)),
      db.select({ value: siteSettingsTable.value }).from(siteSettingsTable)
        .where(eq(siteSettingsTable.key, "chatbot_model")).limit(1),
    ]);

    const env = {
      vapid: !!(process.env["VAPID_PUBLIC_KEY"] && process.env["VAPID_PRIVATE_KEY"]),
      elevenlabs: !!(process.env["ELEVENLABS_API_KEY"] || process.env["VOICE_GATEWAY_SECRET"]),
      openai: !!(process.env["AVALAI_API_KEY"] || process.env["OPENAI_API_KEY"]),
      zarinpal: !!(process.env["ZARINPAL_MERCHANT_ID"]),
      jwt: !!(process.env["JWT_SECRET"]),
      sms: !!(process.env["MODIRPAYAMAK_USERNAME"]),
      uploadDir: !!(process.env["UPLOAD_DIR"]),
    };

    res.json({
      stats: {
        knowledgeBase: kbCount[0]?.n ?? 0,
        leadProfiles: leadCount[0]?.n ?? 0,
        advisorRequests: advisorCount[0]?.n ?? 0,
        pushSubscriptions: pushCount[0]?.n ?? 0,
        chatMessages: chatMsgCount[0]?.n ?? 0,
        users: userCount[0]?.n ?? 0,
        publishedCourses: courseCount[0]?.n ?? 0,
        chatbotModel: modelSetting[0]?.value ?? "gpt-4o",
      },
      env,
    });
  } catch (err) {
    logger.error({ err }, "[SystemStatus] error");
    res.status(500).json({ error: "خطا در بارگذاری وضعیت سیستم" });
  }
});

export default router;
