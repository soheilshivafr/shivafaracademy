import { pgTable, serial, integer, text, timestamp } from "drizzle-orm/pg-core";

export const userItemDiscountsTable = pgTable("user_item_discounts", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  itemType: text("item_type").notNull(),
  itemId: integer("item_id").notNull(),
  discountPercent: integer("discount_percent").notNull(),
  windowStartsAt: timestamp("window_starts_at").notNull(),
  windowEndsAt: timestamp("window_ends_at").notNull(),
  source: text("source").notNull(),
  nextOfferAt: timestamp("next_offer_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type UserItemDiscount = typeof userItemDiscountsTable.$inferSelect;
