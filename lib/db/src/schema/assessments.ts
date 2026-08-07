import {
  pgTable, serial, text, integer, boolean, timestamp, jsonb, varchar,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { productsTable } from "./products";
import { ordersTable } from "./orders";

// ─── Assessment ───────────────────────────────────────────────────────────────

export const assessmentsTable = pgTable("assessments", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  shortDescription: text("short_description"),
  description: text("description"),
  coverImage: text("cover_image"),
  productId: integer("product_id").references(() => productsTable.id, { onDelete: "set null" }),
  category: text("category"),
  estimatedMinutes: integer("estimated_minutes").default(10),
  startText: text("start_text"),
  endText: text("end_text"),
  isPublished: boolean("is_published").notNull().default(false),
  sortOrder: integer("sort_order").notNull().default(0),
  requiresAuth: boolean("requires_auth").notNull().default(false),
  collectContactInfo: boolean("collect_contact_info").notNull().default(false),
  hasAiReport: boolean("has_ai_report").notNull().default(false),
  aiReportPrice: integer("ai_report_price").default(0),
  disclaimer: text("disclaimer"),
  // v56: سطح‌های کلی تست — برای تعیین سطح نهایی کاربر بر اساس امتیاز ترکیبی
  // ساختار: [{ label, minPct, maxPct, description, suggestion }]
  globalLevels: jsonb("global_levels").$type<Array<{
    label: string;
    minPct: number;
    maxPct: number;
    description: string;
    suggestion: string;
  }>>().default([]),
  participantCount: integer("participant_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type Assessment = typeof assessmentsTable.$inferSelect;

// ─── Assessment Indices (شاخص‌های امتیازدهی) ─────────────────────────────────

export const assessmentIndicesTable = pgTable("assessment_indices", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  weight: integer("weight").notNull().default(1), // relative weight
  minScore: integer("min_score").notNull().default(0),
  maxScore: integer("max_score").notNull().default(100),
  // levels: [{ label, minPct, maxPct, description, suggestion }]
  levels: jsonb("levels").$type<Array<{
    label: string;
    minPct: number;
    maxPct: number;
    description: string;
    suggestion: string;
  }>>().default([]),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AssessmentIndex = typeof assessmentIndicesTable.$inferSelect;

// ─── Assessment Questions ─────────────────────────────────────────────────────

// Question types supported (نوع پاسخ)
export type QuestionType =
  | "single_choice"
  | "multi_choice"
  | "yes_no"
  | "scale_5"
  | "scale_10"
  | "short_text"
  | "long_text"
  | "number"
  | "number_range"
  | "dropdown"
  | "conditional"
  | "info_section";

// Question content categories (نوع محتوایی سوال — مستقل از نوع پاسخ) — v54+
export type QuestionCategory =
  | "behavioral"      // رفتاری — ارزیابی رفتارهای واقعی
  | "knowledge"       // دانشی — سنجش اطلاعات و دانش
  | "attitude"        // نگرشی — سنجش باور و نگرش
  | "situational"     // موقعیتی — پاسخ به سناریوی فرضی
  | "self_assessment" // خودارزیابی — ادراک فرد از خود
  | "demographic";    // جمعیت‌شناختی — اطلاعات زمینه‌ای

/**
 * QuestionOption — v54
 *
 * Backward-compatible: old options still have score+indexIds.
 * New options (v54+) also carry indexScores which takes priority in the scoring engine.
 *
 * Scoring priority (backend):
 *   1. If indexScores has at least one entry → use indexScores (new system)
 *   2. Otherwise fall back to score + indexIds (old system)
 */
export interface QuestionOption {
  id: string;
  label: string;
  score: number;        // backward compat: global raw score
  weight: number;       // backward compat: weight for weighted avg
  leadScore: number;    // impact on user lead score (-10 to +10)
  indexIds: number[];   // backward compat: which indices this option contributes to
  // v54+: per-index score map { "indexId": score }
  // When present and non-empty, supersedes score+indexIds in the scoring engine
  indexScores?: Record<string, number>;
}

export interface ConditionalLogic {
  // Show this question only if answer to questionId matches value(s)
  questionId: number;
  operator: "eq" | "neq" | "in" | "gte" | "lte";
  value: string | number | string[];
}

export const assessmentQuestionsTable = pgTable("assessment_questions", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
  type: varchar("type", { length: 30 }).notNull(),
  title: text("title").notNull(),
  description: text("description"),
  image: text("image"),
  sortOrder: integer("sort_order").notNull().default(0),
  isRequired: boolean("is_required").notNull().default(true),
  isActive: boolean("is_active").notNull().default(true),

  // ── v54 NEW: Question metadata ────────────────────────────────────────────
  // وزن سوال — اعمال در scoring engine روی امتیاز نهایی شاخص‌ها
  questionWeight: integer("question_weight").notNull().default(1),
  // دسته‌بندی محتوایی سوال — مستقل از نوع پاسخ
  questionCategory: varchar("question_category", { length: 30 }),
  // هدف داخلی سوال — فقط برای ادمین، هرگز به کاربر ارسال نمی‌شود
  questionGoal: text("question_goal"),
  // ─────────────────────────────────────────────────────────────────────────

  // Which indices does this question affect (for non-option questions)
  indexIds: jsonb("index_ids").$type<number[]>().default([]),
  // Options for choice-based questions
  // v54: options now support indexScores (per-index score map) in addition to old score+indexIds
  options: jsonb("options").$type<QuestionOption[]>().default([]),
  // Show/hide logic based on previous answers
  conditionalLogic: jsonb("conditional_logic").$type<ConditionalLogic | null>().default(null),
  // Special message shown after answering (optional)
  specialMessage: text("special_message"),
  // Answer label for text/number responses
  answerLabel: text("answer_label"),
  // For scale questions: min/max labels
  scaleMinLabel: text("scale_min_label"),
  scaleMaxLabel: text("scale_max_label"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AssessmentQuestion = typeof assessmentQuestionsTable.$inferSelect;

// ─── Assessment Sessions ──────────────────────────────────────────────────────

export const assessmentSessionsTable = pgTable("assessment_sessions", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  guestPhone: text("guest_phone"),
  deviceFingerprint: text("device_fingerprint"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  completedAt: timestamp("completed_at"),
  // Answers: { questionId: value }
  answers: jsonb("answers").$type<Record<string, unknown>>().default({}),
  // Final index scores: { indexId: score (0-100) }
  indexScores: jsonb("index_scores").$type<Record<string, number>>().default({}),
  // Total lead score delta applied to user profile
  totalLeadScoreImpact: integer("total_lead_score_impact").default(0),
  // AI report
  aiReportPurchased: boolean("ai_report_purchased").notNull().default(false),
  aiReportOrderId: integer("ai_report_order_id").references(() => ordersTable.id, { onDelete: "set null" }),
  aiReport: text("ai_report"),
  aiReportGeneratedAt: timestamp("ai_report_generated_at"),
  ipAddress: text("ip_address"),
  // v56: نتایج موتور امتیازدهی حرفه‌ای
  /** امتیاز نهایی ترکیبی ۰–۱۰۰ (میانگین وزن‌دار شاخص‌ها) */
  finalScore: integer("final_score"),
  /** نسخهٔ موتور امتیازدهی — برای ردیابی و debug */
  scoringVersion: varchar("scoring_version", { length: 10 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AssessmentSession = typeof assessmentSessionsTable.$inferSelect;

// ─── Assessment Contact Leads ─────────────────────────────────────────────────

export const assessmentContactLeadsTable = pgTable("assessment_contact_leads", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id").notNull().references(() => assessmentsTable.id, { onDelete: "cascade" }),
  sessionId: integer("session_id").references(() => assessmentSessionsTable.id, { onDelete: "set null" }),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  interestedProductId: integer("interested_product_id").references(() => productsTable.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AssessmentContactLead = typeof assessmentContactLeadsTable.$inferSelect;
