import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// ─── لینک‌های تبلیغاتی (Tracking Links) ────────────────────────────────────

export const trackingLinksTable = pgTable("tracking_links", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  destinationUrl: text("destination_url").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  startsAt: timestamp("starts_at"),
  expiresAt: timestamp("expires_at"),
  createdBy: integer("created_by"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTrackingLinkSchema = createInsertSchema(trackingLinksTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  createdBy: true,
});
export type InsertTrackingLink = z.infer<typeof insertTrackingLinkSchema>;
export type TrackingLink = typeof trackingLinksTable.$inferSelect;

export const trackingClicksTable = pgTable("tracking_clicks", {
  id: serial("id").primaryKey(),
  trackingLinkId: integer("tracking_link_id").notNull(),
  sessionId: text("session_id").notNull(),
  userId: integer("user_id"),
  referrer: text("referrer"),
  userAgent: text("user_agent"),
  ipHash: text("ip_hash"),
  isUnique: boolean("is_unique").notNull().default(false),
  isBot: boolean("is_bot").notNull().default(false),
  clickedAt: timestamp("clicked_at").defaultNow().notNull(),
});

export type TrackingClick = typeof trackingClicksTable.$inferSelect;

// attribution_type: 'click' | 'registration' | 'purchase'
export const trackingAttributionsTable = pgTable("tracking_attributions", {
  id: serial("id").primaryKey(),
  trackingLinkId: integer("tracking_link_id").notNull(),
  sessionId: text("session_id").notNull(),
  userId: integer("user_id"),
  attributionType: text("attribution_type").notNull(),
  orderId: integer("order_id"),
  amount: integer("amount"),
  attributedAt: timestamp("attributed_at").defaultNow().notNull(),
  expiresAt: timestamp("expires_at").notNull(),
});

export type TrackingAttribution = typeof trackingAttributionsTable.$inferSelect;
