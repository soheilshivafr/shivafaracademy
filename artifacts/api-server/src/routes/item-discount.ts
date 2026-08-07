import { Router } from "express";
import { requireUser, requireAdmin } from "../middlewares/auth";
import {
  getItemDiscountConfig,
  saveItemGlobalDiscount,
  saveItemWindows,
  getActiveItemDiscount,
  computeDiscountedPrice,
} from "../lib/item-discount";
import { getActiveGuestItemDiscount } from "../lib/guest-item-discount";

const router = Router();

const VALID_TYPES = ["course", "product"] as const;
function isValidType(t: string): t is "course" | "product" {
  return (VALID_TYPES as readonly string[]).includes(t);
}

// GET /discounts/:type/:id — active discount for current user
router.get("/discounts/:type/:id", requireUser, async (req, res) => {
  const { type, id: idStr } = req.params;
  const id = parseInt(idStr ?? "");
  if (!isValidType(type) || isNaN(id) || id <= 0) {
    res.status(400).json({ error: "پارامتر نامعتبر" });
    return;
  }
  const userId = req.user!.userId;
  const discount = await getActiveItemDiscount(userId, type, id);
  res.json(discount);
});

// GET /discounts/guest/:type/:id — تخفیف شخصی‌سازی‌شده برای کاربر مهمان (بدون لاگین)
// guestId از هدر X-Guest-Id دریافت می‌شود
router.get("/discounts/guest/:type/:id", async (req, res) => {
  const { type, id: idStr } = req.params;
  const id = parseInt(idStr ?? "");
  if (!isValidType(type) || isNaN(id) || id <= 0) {
    res.status(400).json({ error: "پارامتر نامعتبر" });
    return;
  }
  const guestId = (req.headers["x-guest-id"] as string) || (req.query.guestId as string);
  if (!guestId || guestId.trim().length < 8) {
    res.status(400).json({ error: "guestId الزامی است" });
    return;
  }
  const discount = await getActiveGuestItemDiscount(guestId.trim(), type, id);
  res.json(discount);
});

// GET /discounts/public/:type/:id — global discount info (no auth needed)
router.get("/discounts/public/:type/:id", async (req, res) => {
  const { type, id: idStr } = req.params;
  const id = parseInt(idStr ?? "");
  if (!isValidType(type) || isNaN(id) || id <= 0) {
    res.status(400).json({ error: "پارامتر نامعتبر" });
    return;
  }
  const cfg = await getItemDiscountConfig(type, id);
  res.json({
    active: cfg.global.active,
    percent: cfg.global.percent,
    endsAt: cfg.global.endsAt,
  });
});

// GET /admin/discounts/:type/:id — full config for admin
router.get("/admin/discounts/:type/:id", requireAdmin, async (req, res) => {
  const { type, id: idStr } = req.params;
  const id = parseInt(idStr ?? "");
  if (!isValidType(type) || isNaN(id) || id <= 0) {
    res.status(400).json({ error: "پارامتر نامعتبر" });
    return;
  }
  const cfg = await getItemDiscountConfig(type, id);
  res.json(cfg);
});

// PUT /admin/discounts/:type/:id/global — save global discount
router.put("/admin/discounts/:type/:id/global", requireAdmin, async (req, res) => {
  const { type, id: idStr } = req.params;
  const id = parseInt(idStr ?? "");
  if (!isValidType(type) || isNaN(id) || id <= 0) {
    res.status(400).json({ error: "پارامتر نامعتبر" });
    return;
  }
  const { enabled, percent, endsAt } = req.body as {
    enabled?: boolean;
    percent?: number;
    endsAt?: string | null;
  };
  await saveItemGlobalDiscount(type, id, !!enabled, Number(percent) || 0, endsAt ?? null);
  res.json({ success: true });
});

// PUT /admin/discounts/:type/:id/windows — save timing windows + percents
router.put("/admin/discounts/:type/:id/windows", requireAdmin, async (req, res) => {
  const { type, id: idStr } = req.params;
  const id = parseInt(idStr ?? "");
  if (!isValidType(type) || isNaN(id) || id <= 0) {
    res.status(400).json({ error: "پارامتر نامعتبر" });
    return;
  }
  const {
    windowsEnabled,
    firstWindowSec,
    recurringWindowSec,
    recurringMinDays,
    recurringMaxDays,
    firstWindowPercent,
    recurringMinPercent,
    recurringMaxPercent,
  } = req.body as {
    windowsEnabled?: boolean;
    firstWindowSec?: number;
    recurringWindowSec?: number;
    recurringMinDays?: number;
    recurringMaxDays?: number;
    firstWindowPercent?: number;
    recurringMinPercent?: number;
    recurringMaxPercent?: number;
  };
  await saveItemWindows(
    type,
    id,
    !!windowsEnabled,
    Number(firstWindowSec) || 156060,
    Number(recurringWindowSec) || 156060,
    Number(recurringMinDays) || 20,
    Number(recurringMaxDays) || 90,
    Number(firstWindowPercent) || 80,
    Number(recurringMinPercent) || 30,
    Number(recurringMaxPercent) || 80,
  );
  res.json({ success: true });
});

export default router;
