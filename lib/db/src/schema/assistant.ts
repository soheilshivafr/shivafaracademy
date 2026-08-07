import { pgTable, serial, text, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userTasksTable = pgTable("user_tasks", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  category: varchar("category", { length: 30 }).notNull().default("personal"),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  priority: varchar("priority", { length: 20 }).notNull().default("normal"),
  dueAt: timestamp("due_at"),
  remindedAt: timestamp("reminded_at"),
  repeatType: varchar("repeat_type", { length: 20 }).notNull().default("none"),
  repeatDays: text("repeat_days"),
  createdAt: timestamp("created_at").defaultNow(),
});
export type UserTask = typeof userTasksTable.$inferSelect;

export const assistantRemindersTable = pgTable("assistant_reminders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  taskId: integer("task_id"),
  taskTitle: text("task_title").notNull(),
  taskCategory: varchar("task_category", { length: 30 }).notNull().default("personal"),
  firedAt: timestamp("fired_at").defaultNow(),
  readAt: timestamp("read_at"),
  expiresAt: timestamp("expires_at"),
});
export type AssistantReminder = typeof assistantRemindersTable.$inferSelect;

export const avatarPurchasesTable = pgTable("avatar_purchases", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  avatarId: varchar("avatar_id", { length: 30 }).notNull(),
  pricePaid: integer("price_paid").notNull().default(199000),
  purchasedAt: timestamp("purchased_at").defaultNow(),
  expiresAt: timestamp("expires_at"),
});
export type AvatarPurchase = typeof avatarPurchasesTable.$inferSelect;

export const avatarOrdersTable = pgTable("avatar_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  avatarId: varchar("avatar_id", { length: 30 }).notNull(),
  amount: integer("amount").notNull().default(199000),
  status: varchar("status", { length: 20 }).notNull().default("pending"),
  gateway: varchar("gateway", { length: 30 }),
  gatewayAuthority: varchar("gateway_authority", { length: 200 }),
  gatewayRefId: varchar("gateway_ref_id", { length: 100 }),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AvatarOrder = typeof avatarOrdersTable.$inferSelect;

export const knowledgeBaseTable = pgTable("knowledge_base", {
  id: serial("id").primaryKey(),
  category: varchar("category", { length: 40 }).notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  actionRoute: varchar("action_route", { length: 200 }),
  actionLabel: varchar("action_label", { length: 60 }),
  tags: text("tags").array(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
export type KnowledgeBaseEntry = typeof knowledgeBaseTable.$inferSelect;

export const assistantChatHistoryTable = pgTable("assistant_chat_history", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 10 }).notNull(),
  content: text("content").notNull(),
  kbEntryId: integer("kb_entry_id").references(() => knowledgeBaseTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow(),
});
export type AssistantChatMessage = typeof assistantChatHistoryTable.$inferSelect;
