import { Router } from "express";
import { db } from "@workspace/db";
import { mtpVariantsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireUser, requireAdmin } from "../middlewares/auth";
import { getAdminSetting, setAdminSetting } from "../lib/settings";
import {
  getMtpPricing,
  getVariants,
  getWindowConfig,
  getGlobalDiscount,
  getMtpCourseIds,
  SETTINGS_KEYS as K,
} from "../lib/mtp-discount";

const router = Router();

// GET /mtp/pricing — variants + the current user's active discount
router.get("/mtp/pricing", requireUser, async (req, res) => {
  const pricing = await getMtpPricing(req.user!.userId);
  res.json(pricing);
});

// ─── Admin config ─────────────────────────────────────────────────────────────

// GET /admin/mtp/config
router.get("/admin/mtp/config", requireAdmin, async (_req, res) => {
  const [variants, windows, global, courseIds] = await Promise.all([
    getVariants(),
    getWindowConfig(),
    getGlobalDiscount(),
    getMtpCourseIds(),
  ]);
  res.json({
    courseId: courseIds[0] ?? null,
    courseId2: courseIds[1] ?? null,
    courseIds,
    variants: variants.map((v) => ({
      key: v.key, label: v.label, fullPrice: v.fullPrice, floorPrice: v.floorPrice, sortOrder: v.sortOrder,
    })),
    windows,
    global: { enabled: global.enabled, percent: global.percent, endsAt: global.endsAt },
  });
});

// PUT /admin/mtp/course — set MTP course(s); courseId = primary (خارجی), courseId2 = secondary (داخلی)
router.put("/admin/mtp/course", requireAdmin, async (req, res) => {
  const { courseId, courseId2 } = req.body as { courseId?: number; courseId2?: number | null };
  if (!courseId || courseId <= 0) { res.status(400).json({ error: "شناسه دوره اول نامعتبر است" }); return; }
  await setAdminSetting("mtp_course_id", String(courseId));
  await setAdminSetting("mtp_course_id_2", courseId2 && courseId2 > 0 ? String(courseId2) : "");
  res.json({ success: true });
});

// PUT /admin/mtp/variants — update full/floor prices and labels for each variant
router.put("/admin/mtp/variants", requireAdmin, async (req, res) => {
  const { variants } = req.body as {
    variants?: Array<{ key: string; label?: string; fullPrice?: number; floorPrice?: number }>;
  };
  if (!Array.isArray(variants) || variants.length === 0) {
    res.status(400).json({ error: "لیست واریانت‌ها نامعتبر است" }); return;
  }
  // Ensure rows exist before updating.
  await getVariants();
  for (const v of variants) {
    if (!v.key) continue;
    const set: Record<string, unknown> = {};
    if (v.label !== undefined) set.label = v.label;
    if (v.fullPrice !== undefined && Number.isFinite(v.fullPrice)) set.fullPrice = Math.max(0, Math.round(v.fullPrice));
    if (v.floorPrice !== undefined && Number.isFinite(v.floorPrice)) set.floorPrice = Math.max(0, Math.round(v.floorPrice));
    if (Object.keys(set).length === 0) continue;
    await db.update(mtpVariantsTable).set(set).where(eq(mtpVariantsTable.key, v.key));
  }
  res.json({ success: true });
});

// PUT /admin/mtp/global — global discount for everyone
router.put("/admin/mtp/global", requireAdmin, async (req, res) => {
  const { enabled, percent, endsAt } = req.body as { enabled?: boolean; percent?: number; endsAt?: string | null };
  await Promise.all([
    enabled !== undefined && setAdminSetting(K.globalEnabled, enabled ? "true" : "false"),
    percent !== undefined && setAdminSetting(K.globalPercent, String(Math.max(0, Math.min(100, Math.round(percent))))),
    endsAt !== undefined && setAdminSetting(K.globalEndsAt, endsAt ? new Date(endsAt).toISOString() : ""),
  ]);
  res.json({ success: true });
});

// PUT /admin/mtp/windows — durations for the per-user windows and recurring cadence
router.put("/admin/mtp/windows", requireAdmin, async (req, res) => {
  const { firstWindowSec, recurringWindowSec, recurringMinDays, recurringMaxDays } = req.body as {
    firstWindowSec?: number; recurringWindowSec?: number; recurringMinDays?: number; recurringMaxDays?: number;
  };
  await Promise.all([
    firstWindowSec !== undefined && setAdminSetting(K.firstWindowSec, String(Math.max(60, Math.round(firstWindowSec)))),
    recurringWindowSec !== undefined && setAdminSetting(K.recurringWindowSec, String(Math.max(60, Math.round(recurringWindowSec)))),
    recurringMinDays !== undefined && setAdminSetting(K.recurringMinDays, String(Math.max(1, Math.round(recurringMinDays)))),
    recurringMaxDays !== undefined && setAdminSetting(K.recurringMaxDays, String(Math.max(1, Math.round(recurringMaxDays)))),
  ]);
  res.json({ success: true });
});

export default router;
