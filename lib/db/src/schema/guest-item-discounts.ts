import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";

// تخفیف‌های شخصی‌سازی‌شده برای کاربران مهمان (بدون نیاز به لاگین)
// guestId = یک UUID تصادفی که در localStorage مرورگر ذخیره می‌شود
export const guestItemDiscountsTable = pgTable("guest_item_discounts", {
  id: serial("id").primaryKey(),
  guestId: text("guest_id").notNull(),
  itemType: text("item_type").notNull(),        // "course" | "product"
  itemId: integer("item_id").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  windowStartsAt: timestamp("window_starts_at").notNull(),
  windowEndsAt: timestamp("window_ends_at").notNull(),
  source: text("source").notNull(),             // "first_visit" | "recurring"
  nextOfferAt: timestamp("next_offer_at").notNull(),
  migratedToUserId: integer("migrated_to_user_id"),  // بعد از ثبت‌نام پر می‌شود
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type GuestItemDiscount = typeof guestItemDiscountsTable.$inferSelect;
