/**
 * Assessment Rules — v57
 *
 * Rules Engine داینامیک برای Tests & Assessments
 *
 * هر rule شامل:
 *  - conditions: آرایه‌ای از شروط (ANY یا ALL باید برقرار باشند)
 *  - actions: پیشنهادات و پیام‌هایی که در صورت match نمایش داده می‌شوند
 *
 * Condition types:
 *  - finalScore     — امتیاز نهایی ترکیبی (۰–۱۰۰)
 *  - indexScore     — امتیاز شاخص مشخص (indexId الزامی)
 *  - finalLevel     — برچسب سطح نهایی (مثلاً "متوسط")
 *  - indexLevel     — برچسب سطح یک شاخص (indexId الزامی)
 *  - answer         — پاسخ کاربر به سوال مشخص (questionId الزامی)
 *  - leadScore      — امتیاز lead فعلی کاربر
 *
 * Operators: eq, neq, gt, gte, lt, lte, in, between, contains
 */

import { pgTable, serial, text, boolean, integer, timestamp, jsonb, varchar } from "drizzle-orm/pg-core";
import { assessmentsTable } from "./assessments";

// ─── Condition types ──────────────────────────────────────────────────────────

export type RuleConditionType =
  | "finalScore"    // امتیاز نهایی ۰–۱۰۰
  | "indexScore"    // امتیاز یک شاخص (indexId لازم)
  | "finalLevel"    // برچسب سطح نهایی
  | "indexLevel"    // برچسب سطح یک شاخص (indexId لازم)
  | "answer"        // پاسخ کاربر به سوال (questionId لازم)
  | "leadScore";    // lead score کاربر

export type RuleOperator =
  | "eq"       // مساوی
  | "neq"      // نامساوی
  | "gt"       // بزرگتر
  | "gte"      // بزرگتر‌مساوی
  | "lt"       // کوچکتر
  | "lte"      // کوچکتر‌مساوی
  | "in"       // یکی از مقادیر (value: array)
  | "between"  // بین دو مقدار (value: [min, max])
  | "contains"; // شامل (برای پاسخ‌های multi_choice)

export interface RuleCondition {
  type: RuleConditionType;
  operator: RuleOperator;
  value: unknown;             // عدد، رشته، آرایه، یا [min,max]
  indexId?: number;           // برای indexScore / indexLevel
  questionId?: number;        // برای answer
}

// ─── Recommendation contract ────────────────────────────────────────────────

/**
 * The only target kinds the recommendation layer exposes.
 *
 * Target records and their content are never embedded in application code.
 * They are selected by Rules Engine actions and may be resolved from the
 * corresponding catalog by the API layer.
 */
export type RecommendationTargetType =
  | "Product"
  | "Course"
  | "Tool"
  | "Next Test"
  | "Next Action";

/** A recommendation authored inside a Rule action. */
export interface RecommendationAction {
  targetType: RecommendationTargetType;
  targetId?: number | string;
  targetSlug?: string;
  priority?: number;
  reason?: string;
  title?: string;
  description?: string;
  ctaLabel?: string;
  ctaUrl?: string;
  ctaRoute?: string;
}

/** The API-ready, normalized recommendation shape. */
export interface Recommendation extends Omit<RecommendationAction, "priority"> {
  priority: number;
  sourceRuleId: number;
  sourceRuleName: string;
}

// ─── Action types ─────────────────────────────────────────────────────────────

export interface RuleAction {
  /** Generic recommendations. This is the preferred action format. */
  recommendations?: RecommendationAction[];

  // ── پیشنهادات ──
  // Legacy fields remain readable so existing Rules Engine data keeps working.
  // New rules should use `recommendations` instead.
  /** شناسه محصولات پیشنهادی */
  suggestedProductIds?: number[];
  /** شناسه دوره‌های پیشنهادی */
  suggestedCourseIds?: number[];
  /** شناسه تست‌های بعدی پیشنهادی */
  suggestedAssessmentIds?: number[];

  // ── CTA ──
  /** متن دکمه CTA */
  ctaText?: string;
  /** لینک دکمه CTA */
  ctaUrl?: string;
  /** رنگ CTA: primary | success | warning | danger | info */
  ctaStyle?: "primary" | "success" | "warning" | "danger" | "info";

  // ── پیام‌ها ──
  /** عنوان پیام */
  messageTitle?: string;
  /** متن اصلی پیام */
  messageBody?: string;
  /** برچسب کوچک (badge) بالای پیام */
  messageBadge?: string;
  /** رنگ badge */
  messageBadgeColor?: string;
  /** آیکون emoji پیام */
  messageIcon?: string;
}

// ─── Rule schema ──────────────────────────────────────────────────────────────

export const assessmentRulesTable = pgTable("assessment_rules", {
  id: serial("id").primaryKey(),
  assessmentId: integer("assessment_id")
    .notNull()
    .references(() => assessmentsTable.id, { onDelete: "cascade" }),

  /** نام داخلی قانون (فقط ادمین می‌بیند) */
  name: text("name").notNull(),

  /** توضیح داخلی (اختیاری) */
  description: text("description"),

  /** آیا قانون فعال است */
  isActive: boolean("is_active").notNull().default(true),

  /** ترتیب اولویت — قانون با sortOrder کمتر اول بررسی می‌شود */
  sortOrder: integer("sort_order").notNull().default(0),

  /**
   * نحوه ترکیب شروط:
   *  - "all" (AND) — همه شروط باید برقرار باشند
   *  - "any" (OR)  — حداقل یک شرط باید برقرار باشد
   */
  conditionMode: varchar("condition_mode", { length: 3 }).notNull().default("all"),

  /** آرایه شروط */
  conditions: jsonb("conditions").$type<RuleCondition[]>().notNull().default([]),

  /** اقدامات در صورت تطابق */
  actions: jsonb("actions").$type<RuleAction>().notNull().default({}),

  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export type AssessmentRule = typeof assessmentRulesTable.$inferSelect;
export type InsertAssessmentRule = typeof assessmentRulesTable.$inferInsert;
