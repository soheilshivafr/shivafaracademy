import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const ordersTable = pgTable("orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  itemType: text("item_type").notNull(), // 'course' | 'product'
  itemId: integer("item_id").notNull(),
  amount: integer("amount").notNull(),
  variantKey: text("variant_key"), // MTP course purchase variant, if applicable
  discountPercent: integer("discount_percent"), // applied discount % at purchase time
  status: text("status").notNull().default("pending"), // pending | paid | failed
  transactionId: text("transaction_id"),
  zarinpalAuthority: text("zarinpal_authority"),
  gateway: text("gateway"),
  receiptUrl: text("receipt_url"),
  cancelReason: text("cancel_reason"),
  // Which advertising tracking link (if any) this order's revenue is attributed to.
  trackingLinkId: integer("tracking_link_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertOrderSchema = createInsertSchema(ordersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertOrder = z.infer<typeof insertOrderSchema>;
export type Order = typeof ordersTable.$inferSelect;
