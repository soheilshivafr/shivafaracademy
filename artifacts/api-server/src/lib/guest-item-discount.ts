/**
 * سیستم تخفیف برای کاربران مهمان (بدون نیاز به لاگین)
 *
 * منطق:
 * - هر کاربر مهمان یک guestId در localStorage دارد
 * - هنگام بازدید از صفحه محصول/دوره، تخفیف شخصی‌سازی‌شده دریافت می‌کند
 * - همان پنجره‌های تخفیف userItemDiscounts اعمال می‌شود
 * - بعد از ثبت‌نام/لاگین، تخفیف مهمان به کاربر واقعی منتقل می‌شود
 */

import { db } from "@workspace/db";
import { guestItemDiscountsTable, userItemDiscountsTable } from "@workspace/db";
import { and, eq, isNull } from "drizzle-orm";
import { getItemDiscountConfig, ActiveItemDiscount } from "./item-discount";

function randomInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedPercent(min: number, max: number) {
  return Math.round(min + (max - min) * Math.pow(Math.random(), 0.45));
}

/**
 * تخفیف فعال برای کاربر مهمان را برمی‌گرداند (یا ایجاد می‌کند)
 * منطق مشابه maintainUserItemDiscount است اما با guestId به جای userId
 */
export async function getActiveGuestItemDiscount(
  guestId: string,
  type: string,
  id: number,
): Promise<ActiveItemDiscount> {
  if (!guestId || guestId.trim().length < 8) {
    return { active: false, percent: 0, source: "none", endsAt: null, remainingSeconds: 0 };
  }

  const cfg = await getItemDiscountConfig(type, id);
  const { global, windows } = cfg;

  // ابتدا تخفیف عمومی را چک کن — اگر فعال باشد برای همه (از جمله مهمان) نشان داده می‌شود
  if (global.active) {
    const remaining = global.endsAt
      ? Math.max(0, Math.ceil((global.endsAt.getTime() - Date.now()) / 1000))
      : 0;
    return {
      active: true,
      percent: global.percent,
      source: "global",
      endsAt: global.endsAt,
      remainingSeconds: remaining,
    };
  }

  // اگر پنجره‌های شخصی توسط ادمین فعال نشده باشد، هیچ تخفیفی نمایش نده
  if (!windows.enabled) {
    return { active: false, percent: 0, source: "none", endsAt: null, remainingSeconds: 0 };
  }

  const now = Date.now();

  // رکورد موجود را پیدا کن
  const [existing] = await db
    .select()
    .from(guestItemDiscountsTable)
    .where(
      and(
        eq(guestItemDiscountsTable.guestId, guestId),
        eq(guestItemDiscountsTable.itemType, type),
        eq(guestItemDiscountsTable.itemId, id),
        isNull(guestItemDiscountsTable.migratedToUserId), // فقط تخفیف‌های مهاجرت‌نشده
      ),
    )
    .limit(1);

  if (!existing) {
    // اولین بازدید — پنجره تخفیف اول را ایجاد کن
    const start = new Date(now);
    const end = new Date(now + windows.firstWindowSec * 1000);
    const nextOffer = new Date(
      end.getTime() +
        randomInt(windows.recurringMinDays, windows.recurringMaxDays) * 86400 * 1000,
    );
    const pct = windows.firstWindowPercent;

    await db.insert(guestItemDiscountsTable).values({
      guestId,
      itemType: type,
      itemId: id,
      discountPercent: pct,
      windowStartsAt: start,
      windowEndsAt: end,
      source: "first_visit",
      nextOfferAt: nextOffer,
    });

    return {
      active: true,
      percent: pct,
      source: "first_login",
      endsAt: end,
      remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now) / 1000)),
    };
  }

  // پنجره هنوز فعال است
  if (existing.windowEndsAt.getTime() > now) {
    return {
      active: true,
      percent: existing.discountPercent,
      source: existing.source === "first_visit" ? "first_login" : "recurring",
      endsAt: existing.windowEndsAt,
      remainingSeconds: Math.max(0, Math.ceil((existing.windowEndsAt.getTime() - now) / 1000)),
    };
  }

  // پنجره منقضی شده؛ آیا وقت پنجره بعدی رسیده؟
  if (existing.nextOfferAt.getTime() <= now) {
    const percent = weightedPercent(windows.recurringMinPercent, windows.recurringMaxPercent);
    const start = new Date(now);
    const end = new Date(now + windows.recurringWindowSec * 1000);
    const nextOffer = new Date(
      end.getTime() +
        randomInt(windows.recurringMinDays, windows.recurringMaxDays) * 86400 * 1000,
    );

    await db
      .update(guestItemDiscountsTable)
      .set({
        discountPercent: percent,
        windowStartsAt: start,
        windowEndsAt: end,
        source: "recurring",
        nextOfferAt: nextOffer,
        updatedAt: new Date(),
      })
      .where(eq(guestItemDiscountsTable.id, existing.id));

    return {
      active: true,
      percent,
      source: "recurring",
      endsAt: end,
      remainingSeconds: Math.max(0, Math.ceil((end.getTime() - now) / 1000)),
    };
  }

  return { active: false, percent: 0, source: "none", endsAt: null, remainingSeconds: 0 };
}

/**
 * بعد از لاگین/ثبت‌نام، تخفیف‌های مهمان را به کاربر واقعی منتقل می‌کند
 *
 * منطق: اگر کاربر تخفیف مهمان فعالی دارد و هنوز تخفیف کاربری ندارد،
 * یک رکورد userItemDiscount با همان مقدار و پنجره ایجاد می‌شود.
 */
export async function migrateGuestDiscountsToUser(
  guestId: string,
  userId: number,
): Promise<void> {
  if (!guestId || !userId) return;

  // همه تخفیف‌های فعال مهمان که هنوز مهاجرت نشده‌اند
  const now = new Date();
  const guestDiscounts = await db
    .select()
    .from(guestItemDiscountsTable)
    .where(
      and(
        eq(guestItemDiscountsTable.guestId, guestId),
        isNull(guestItemDiscountsTable.migratedToUserId),
      ),
    );

  for (const gd of guestDiscounts) {
    // فقط تخفیف‌هایی که هنوز پنجره‌شان باز است
    if (gd.windowEndsAt.getTime() <= Date.now()) continue;

    // آیا کاربر قبلاً تخفیف برای این آیتم دارد؟
    const [existingUser] = await db
      .select()
      .from(userItemDiscountsTable)
      .where(
        and(
          eq(userItemDiscountsTable.userId, userId),
          eq(userItemDiscountsTable.itemType, gd.itemType),
          eq(userItemDiscountsTable.itemId, gd.itemId),
        ),
      )
      .limit(1);

    if (!existingUser) {
      // ایجاد رکورد userItemDiscount با همان مقادیر مهمان
      await db.insert(userItemDiscountsTable).values({
        userId,
        itemType: gd.itemType,
        itemId: gd.itemId,
        discountPercent: gd.discountPercent,
        windowStartsAt: gd.windowStartsAt,
        windowEndsAt: gd.windowEndsAt,
        source: gd.source === "first_visit" ? "first_login" : "recurring",
        nextOfferAt: gd.nextOfferAt,
      });
    } else if (
      existingUser.windowEndsAt.getTime() <= Date.now() &&
      gd.windowEndsAt.getTime() > Date.now()
    ) {
      // کاربر تخفیف داشته ولی منقضی شده؛ مهمان تخفیف فعال دارد → بروزرسانی
      await db
        .update(userItemDiscountsTable)
        .set({
          discountPercent: gd.discountPercent,
          windowStartsAt: gd.windowStartsAt,
          windowEndsAt: gd.windowEndsAt,
          source: gd.source === "first_visit" ? "first_login" : "recurring",
          nextOfferAt: gd.nextOfferAt,
          updatedAt: now,
        })
        .where(eq(userItemDiscountsTable.id, existingUser.id));
    }

    // علامت‌گذاری که این تخفیف مهمان مهاجرت شده
    await db
      .update(guestItemDiscountsTable)
      .set({ migratedToUserId: userId, updatedAt: now })
      .where(eq(guestItemDiscountsTable.id, gd.id));
  }
}
