import { pgTable, bigserial, text, integer, timestamp } from "drizzle-orm/pg-core";

export const analyticsEventsTable = pgTable("analytics_events", {
  id: bigserial("id", { mode: "number" }).primaryKey(),
  eventType: text("event_type").notNull(),
  page: text("page"),
  sessionId: text("session_id").notNull(),
  userId: integer("user_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const onlineSessionsTable = pgTable("online_sessions", {
  sessionId: text("session_id").primaryKey(),
  userId: integer("user_id"),
  lastSeen: timestamp("last_seen").defaultNow().notNull(),
});

export type AnalyticsEvent = typeof analyticsEventsTable.$inferSelect;
export type OnlineSession = typeof onlineSessionsTable.$inferSelect;
