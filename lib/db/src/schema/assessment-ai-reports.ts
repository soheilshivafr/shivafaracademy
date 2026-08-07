import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { ordersTable } from "./orders";
import { usersTable } from "./users";
import { assessmentsTable, assessmentSessionsTable } from "./assessments";

export interface ProfessionalReportContent {
  summary: string;
  strengths: string[];
  improvements: string[];
  recommendations: Array<{
    title: string;
    description: string;
  }>;
  roadmap: Array<{
    title: string;
    description: string;
  }>;
  closing: string;
}

export interface ProfessionalReportTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/**
 * Per-assessment configuration for the future paid professional report.
 *
 * The existing assessments.hasAiReport and assessments.aiReportPrice fields
 * remain in place for backward compatibility. New code reads this table first
 * and falls back to those legacy fields when no row exists.
 */
export const assessmentAiReportConfigsTable = pgTable(
  "assessment_ai_report_configs",
  {
    id: serial("id").primaryKey(),
    assessmentId: integer("assessment_id")
      .notNull()
      .references(() => assessmentsTable.id, { onDelete: "cascade" }),
    isEnabled: boolean("is_enabled").notNull().default(false),
    title: text("title").notNull().default("گزارش حرفه‌ای AI"),
    salesDescription: text("sales_description").notNull().default(""),
    valueDescription: text("value_description").notNull().default(""),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    price: integer("price").notNull().default(0),
    prompt: text("prompt").notNull().default(""),
    model: varchar("model", { length: 100 }).notNull().default("gpt-4o-mini"),
    maxTokens: integer("max_tokens").notNull().default(1500),
    temperature: numeric("temperature", { precision: 3, scale: 2, mode: "number" })
      .notNull()
      .default(0.7),
    tone: varchar("tone", { length: 40 }).notNull().default("professional"),
    language: varchar("language", { length: 20 }).notNull().default("fa"),
    promptVersion: varchar("prompt_version", { length: 50 }).notNull().default("v1"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (table) => ({
    assessmentUnique: uniqueIndex("assessment_ai_report_configs_assessment_unique").on(
      table.assessmentId,
    ),
  }),
);

export type AssessmentAiReportConfig = typeof assessmentAiReportConfigsTable.$inferSelect;
export type InsertAssessmentAiReportConfig = typeof assessmentAiReportConfigsTable.$inferInsert;

/**
 * Durable report record. attemptId is the existing assessment session id.
 * One row per attempt prevents duplicate report generation and gives the
 * eventual payment/generation flow an idempotent persistence boundary.
 */
export const aiAssessmentReportsTable = pgTable(
  "ai_assessment_reports",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
    assessmentId: integer("assessment_id")
      .notNull()
      .references(() => assessmentsTable.id, { onDelete: "cascade" }),
    attemptId: integer("attempt_id")
      .notNull()
      .references(() => assessmentSessionsTable.id, { onDelete: "cascade" }),
    paymentId: integer("payment_id").references(() => ordersTable.id, { onDelete: "set null" }),
    status: varchar("status", { length: 20 }).notNull().default("pending"),
    model: varchar("model", { length: 100 }).notNull(),
    promptVersion: varchar("prompt_version", { length: 50 }).notNull(),
    generatedContent: jsonb("generated_content").$type<ProfessionalReportContent | null>(),
    tokenUsage: jsonb("token_usage").$type<ProfessionalReportTokenUsage | null>(),
    estimatedCost: numeric("estimated_cost", {
      precision: 12,
      scale: 6,
      mode: "number",
    }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    completedAt: timestamp("completed_at"),
    error: text("error"),
  },
  (table) => ({
    attemptUnique: uniqueIndex("ai_assessment_reports_attempt_unique").on(table.attemptId),
  }),
);

export type AiAssessmentReport = typeof aiAssessmentReportsTable.$inferSelect;
export type InsertAiAssessmentReport = typeof aiAssessmentReportsTable.$inferInsert;