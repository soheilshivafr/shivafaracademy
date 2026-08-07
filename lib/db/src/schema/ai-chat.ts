import { pgTable, serial, text, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const supportAgentsTable = pgTable("support_agents", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  avatarUrl: text("avatar_url"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type SupportAgent = typeof supportAgentsTable.$inferSelect;

export const aiChatMessagesTable = pgTable("ai_chat_messages", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  sessionId: varchar("session_id", { length: 64 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type AiChatMessage = typeof aiChatMessagesTable.$inferSelect;
