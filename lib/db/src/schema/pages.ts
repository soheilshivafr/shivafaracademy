import { pgTable, serial, text, integer, boolean, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

// Media items attached to a landing page (guarantee images, MTP audio/video, …).
export const pageMediaTable = pgTable("page_media", {
  id: serial("id").primaryKey(),
  page: text("page").notNull(), // slug: 'guarantee' | 'mtp' | …
  kind: text("kind").notNull(), // 'image' | 'audio' | 'video'
  url: text("url").notNull(),
  caption: text("caption"),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Student results / satisfaction items, supporting 4 formats.
export const studentResultsTable = pgTable("student_results", {
  id: serial("id").primaryKey(),
  type: text("type").notNull(), // 'audio' | 'video' | 'text' | 'screenshot'
  name: text("name"), // student name / label
  body: text("body"), // text-message content
  mediaUrl: text("media_url"), // audio / video / screenshot url
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// FAQ / Q&A entries attached to a landing page (currently the MTP business page).
export const pageFaqsTable = pgTable("page_faqs", {
  id: serial("id").primaryKey(),
  page: text("page").notNull(), // slug: 'mtp' | …
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  sortOrder: integer("sort_order").notNull().default(0),
  isPublished: boolean("is_published").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertPageMediaSchema = createInsertSchema(pageMediaTable).omit({ id: true, createdAt: true });
export type InsertPageMedia = z.infer<typeof insertPageMediaSchema>;
export type PageMedia = typeof pageMediaTable.$inferSelect;

export const insertStudentResultSchema = createInsertSchema(studentResultsTable).omit({ id: true, createdAt: true });
export type InsertStudentResult = z.infer<typeof insertStudentResultSchema>;
export type StudentResult = typeof studentResultsTable.$inferSelect;

export const insertPageFaqSchema = createInsertSchema(pageFaqsTable).omit({ id: true, createdAt: true });
export type InsertPageFaq = z.infer<typeof insertPageFaqSchema>;
export type PageFaq = typeof pageFaqsTable.$inferSelect;
