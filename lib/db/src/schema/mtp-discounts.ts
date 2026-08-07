import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

// The 4 purchase variants shown for the MTP course (dropdown).
export const mtpVariantsTable = pgTable("mtp_variants", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  label: text("label").notNull(),
  fullPrice: integer("full_price").notNull(),
  floorPrice: integer("floor_price").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Per-user discount window state for the MTP course.
export const userMtpDiscountsTable = pgTable("user_mtp_discounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique(),
  discountPercent: integer("discount_percent").notNull(),
  windowStartsAt: timestamp("window_starts_at").notNull(),
  windowEndsAt: timestamp("window_ends_at").notNull(),
  source: text("source").notNull(), // 'first_login' | 'recurring'
  nextOfferAt: timestamp("next_offer_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type MtpVariant = typeof mtpVariantsTable.$inferSelect;
export type UserMtpDiscount = typeof userMtpDiscountsTable.$inferSelect;
