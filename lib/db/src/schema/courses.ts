import { pgTable, serial, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const coursesTable = pgTable("courses", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  image: text("image"),
  thumbnail: text("thumbnail"),
  audioUrl: text("audio_url"),
  price: integer("price").notNull().default(0),
  results: text("results").array(),
  isPublished: boolean("is_published").default(false).notNull(),
  isPhased: boolean("is_phased").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const coursePhasesTable = pgTable("course_phases", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  title: text("title").notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const courseFaqsTable = pgTable("course_faqs", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  question: text("question").notNull(),
  answer: text("answer").notNull(),
  order: integer("order").default(0).notNull(),
});

export const courseLessonsTable = pgTable("course_lessons", {
  id: serial("id").primaryKey(),
  courseId: integer("course_id").notNull(),
  phaseId: integer("phase_id"),
  title: text("title").notNull(),
  description: text("description"),
  videoUrl: text("video_url"),
  audioUrl: text("audio_url"),
  duration: integer("duration"),
  order: integer("order").default(0).notNull(),
  isFree: boolean("is_free").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const lessonAttachmentsTable = pgTable("lesson_attachments", {
  id: serial("id").primaryKey(),
  lessonId: integer("lesson_id").notNull(),
  title: text("title"),
  description: text("description"),
  category: text("category"),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type"),
  fileName: text("file_name"),
  fileSize: integer("file_size"),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const courseLicensesTable = pgTable("course_licenses", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  courseId: integer("course_id"),
  courseIds: integer("course_ids").array(),
  usedByUserId: integer("used_by_user_id"),
  usedAt: timestamp("used_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type CourseLicense = typeof courseLicensesTable.$inferSelect;

export const userCoursesTable = pgTable("user_courses", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  courseId: integer("course_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertCourseSchema = createInsertSchema(coursesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCourse = z.infer<typeof insertCourseSchema>;
export type Course = typeof coursesTable.$inferSelect;

export const insertCourseFaqSchema = createInsertSchema(courseFaqsTable).omit({ id: true });
export type InsertCourseFaq = z.infer<typeof insertCourseFaqSchema>;
export type CourseFaq = typeof courseFaqsTable.$inferSelect;

export const insertCourseLessonSchema = createInsertSchema(courseLessonsTable).omit({ id: true, createdAt: true });
export type InsertCourseLesson = z.infer<typeof insertCourseLessonSchema>;
export type CourseLesson = typeof courseLessonsTable.$inferSelect;

export const insertCoursePhaseSchema = createInsertSchema(coursePhasesTable).omit({ id: true, createdAt: true });
export type InsertCoursePhase = z.infer<typeof insertCoursePhaseSchema>;
export type CoursePhase = typeof coursePhasesTable.$inferSelect;

export const insertLessonAttachmentSchema = createInsertSchema(lessonAttachmentsTable).omit({ id: true, createdAt: true });
export type InsertLessonAttachment = z.infer<typeof insertLessonAttachmentSchema>;
export type LessonAttachment = typeof lessonAttachmentsTable.$inferSelect;
