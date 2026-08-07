import { pgTable, serial, text, boolean, timestamp } from "drizzle-orm/pg-core";

export const proactiveMessagesTable = pgTable("proactive_messages", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type ProactiveMessage = typeof proactiveMessagesTable.$inferSelect;
