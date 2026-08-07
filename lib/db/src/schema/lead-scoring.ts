import { pgTable, serial, text, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const userLeadProfilesTable = pgTable("user_lead_profiles", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  // Basic status (kept for backward compat)
  leadStatus: varchar("lead_status", { length: 20 }).notNull().default("cold"),
  // Section 12: Customer Lifecycle (granular stage)
  lifecycleStage: varchar("lifecycle_stage", { length: 30 }).notNull().default("visitor"),
  // Section 17: Lead Score (0-100)
  leadScore: integer("lead_score").notNull().default(0),
  // Section 13: Qualification Score (0-100)
  qualificationScore: integer("qualification_score").notNull().default(0),
  // Buyer Intent Score (0-100) — purchase-readiness, independent of leadScore
  buyerIntentScore: integer("buyer_intent_score").notNull().default(0),
  // Section 11/15: Memory fields (stored as JSON text)
  goals: text("goals"),            // JSON array of goal strings
  motivations: text("motivations"), // primary motivation
  pains: text("pains"),            // user's stated pains/struggles (free text, captured once)
  pleasures: text("pleasures"),    // user's stated desires/joys (free text, captured once)
  objections: text("objections"),  // JSON array of objection types
  financialPersonality: varchar("financial_personality", { length: 20 }), // risk_taker/price_sensitive/etc
  readinessScore: integer("readiness_score"),     // 1-10 self-reported
  conversationStage: varchar("conversation_stage", { length: 20 }), // discovery/presentation/closing
  // Structured qualification fields (collected mainly by Maryam, captured write-once)
  maritalStatus: varchar("marital_status", { length: 20 }),       // single/married
  currentIncome: varchar("current_income", { length: 20 }),       // income band key
  jobStatus: varchar("job_status", { length: 20 }),               // employee/freelancer/business_owner/student/unemployed
  investmentCapacity: varchar("investment_capacity", { length: 20 }), // none/upto5/5to20/above20/will_provide
  // Existing fields
  favoriteProduct: text("favorite_product"),
  lastInterestedProduct: text("last_interested_product"),
  vipStatus: boolean("vip_status").notNull().default(false),
  ambassadorStatus: boolean("ambassador_status").notNull().default(false),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type UserLeadProfile = typeof userLeadProfilesTable.$inferSelect;

export const leadEventsTable = pgTable("lead_events", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  eventType: varchar("event_type", { length: 50 }).notNull(),
  productName: text("product_name"),
  metadata: text("metadata"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type LeadEvent = typeof leadEventsTable.$inferSelect;

export const advisorRequestsTable = pgTable("advisor_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").references(() => usersTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  phone: text("phone").notNull(),
  interestedProduct: text("interested_product"),
  source: varchar("source", { length: 20 }).notNull().default("chatbot"),
  status: varchar("status", { length: 20 }).notNull().default("new"),
  notes: text("notes"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
export type AdvisorRequest = typeof advisorRequestsTable.$inferSelect;
