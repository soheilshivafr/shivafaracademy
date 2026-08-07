import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const siteSettingsTable = pgTable("site_settings", {
  id: serial("id").primaryKey(),
  key: text("key").notNull().unique(),
  value: text("value"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const chatbotKnowledgeTable = pgTable("chatbot_knowledge", {
  id: serial("id").primaryKey(),
  category: text("category").notNull(), // 'general' | 'sales' | 'support'
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  courseId: text("course_id"), // if null => applies to all, else course-specific
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertSiteSettingSchema = createInsertSchema(siteSettingsTable).omit({ id: true, updatedAt: true });
export type InsertSiteSetting = z.infer<typeof insertSiteSettingSchema>;
export type SiteSetting = typeof siteSettingsTable.$inferSelect;

export const insertChatbotKnowledgeSchema = createInsertSchema(chatbotKnowledgeTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertChatbotKnowledge = z.infer<typeof insertChatbotKnowledgeSchema>;
export type ChatbotKnowledge = typeof chatbotKnowledgeTable.$inferSelect;
