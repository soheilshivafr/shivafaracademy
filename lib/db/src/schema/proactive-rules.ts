import { pgTable, serial, text, boolean, integer, timestamp } from "drizzle-orm/pg-core";

export const proactiveRulesTable = pgTable("proactive_rules", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type ProactiveRule = typeof proactiveRulesTable.$inferSelect;
