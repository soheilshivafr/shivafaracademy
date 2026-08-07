import { Router } from "express";
import { db } from "@workspace/db";
import { siteSettingsTable } from "@workspace/db";
import { requireUser } from "../middlewares/auth";
import { checkCourseBlock, checkChatbotCourseAccess } from "../lib/voice-call-gate";

const router = Router();

const SETTINGS_KEYS = [
  "siteName",
  "logoUrl",
  "primaryColor",
  "heroTitle",
  "heroSubtitle",
  "aboutText",
  "footerText",
  "chatbot_enabled",
  "voice_call_enabled",
  "voice_call_blocked_course_ids",
  "voice_call_course_filter_mode",
  "voice_call_course_filter_ids",
  "chatbot_course_filter_mode",
  "chatbot_course_filter_ids",
  "site_url",
  "zarinpal_merchant_id",
  "zarinpal_sandbox",
  "sms_api_key",
  "sms_from",
  "sms_pattern_code",
  "ippanel_api_key",
  "channel_avatar",
  "channel_name",
  // Social Proof timing (seconds)
  "sp_first_delay_min",
  "sp_first_delay_max",
  "sp_interval_min",
  "sp_interval_max",
];

async function getSettingsMap(): Promise<Record<string, string | null>> {
  const rows = await db.select().from(siteSettingsTable);
  const map: Record<string, string | null> = {};
  for (const key of SETTINGS_KEYS) {
    map[key] = null;
  }
  for (const row of rows) {
    if (SETTINGS_KEYS.includes(row.key)) {
      map[row.key] = row.value ?? null;
    }
  }
  return map;
}

// GET /settings - public
router.get("/settings", async (_req, res) => {
  const map = await getSettingsMap();
  res.json(map);
});

// GET /settings/features - authenticated, per-user feature flags
// بررسی می‌کند که آیا چت‌بات و تماس صوتی برای این کاربر (با در نظر گرفتن فیلتر دوره) فعال است
router.get("/settings/features", requireUser, async (req, res) => {
  try {
    const userId = req.user!.userId;
    const map = await getSettingsMap();

    const globalChatbot = map["chatbot_enabled"] !== "false";
    const globalVoice = map["voice_call_enabled"] !== "false";

    // اگر به‌صورت کلی غیرفعال است، نیازی به بررسی فیلتر دوره نیست
    const [chatbotFilter, voiceFilter] = await Promise.all([
      globalChatbot ? checkChatbotCourseAccess(userId) : Promise.resolve({ blocked: true }),
      globalVoice   ? checkCourseBlock(userId)         : Promise.resolve({ blocked: true }),
    ]);

    res.json({
      chatbot:    globalChatbot && !chatbotFilter.blocked,
      voice_call: globalVoice   && !voiceFilter.blocked,
    });
  } catch {
    // در صورت خطا، دسترسی را می‌بندیم (fail-closed)
    res.json({ chatbot: false, voice_call: false });
  }
});

export { getSettingsMap };
export default router;
