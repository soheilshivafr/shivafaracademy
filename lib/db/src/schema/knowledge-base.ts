import { pgTable, serial, text, integer, boolean, timestamp, varchar } from "drizzle-orm/pg-core";

// ── Section 23: FAQ Bank ──────────────────────────────────────────────────────
export const kbFaqsTable = pgTable("kb_faqs", {
  id: serial("id").primaryKey(),
  question: text("question").notNull(),
  shortAnswer: text("short_answer").notNull(),
  detailedAnswer: text("detailed_answer"),
  category: varchar("category", { length: 50 }).notNull().default("general"),
  // general | sales | pricing | guarantee | loan | product | student | technical
  product: varchar("product", { length: 100 }),
  intent: varchar("intent", { length: 100 }),
  keywords: text("keywords"),
  tags: text("tags"),
  relatedFaqs: text("related_faqs"),
  accessLevel: varchar("access_level", { length: 20 }).notNull().default("sales"),
  // sales | support | admin
  priority: varchar("priority", { length: 10 }).notNull().default("medium"),
  // high | medium | low
  isPublished: boolean("is_published").notNull().default(false),
  shownCount: integer("shown_count").notNull().default(0),
  usedCount: integer("used_count").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type KbFaq = typeof kbFaqsTable.$inferSelect;

// ── Section 19.2 Cat 3: Objection Handling ───────────────────────────────────
export const kbObjectionsTable = pgTable("kb_objections", {
  id: serial("id").primaryKey(),
  objectionName: text("objection_name").notNull(),
  objectionType: varchar("objection_type", { length: 50 }).notNull(),
  // price | trust | saturation | time | spouse | risk | bad_experience | no_capital | no_skill
  discoveryQuestion: text("discovery_question"),
  responseFramework: text("response_framework").notNull(),
  proofAssets: text("proof_assets"),
  escalationRule: text("escalation_rule"),
  product: varchar("product", { length: 100 }),
  accessLevel: varchar("access_level", { length: 20 }).notNull().default("sales"),
  isPublished: boolean("is_published").notNull().default(false),
  usedCount: integer("used_count").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type KbObjection = typeof kbObjectionsTable.$inferSelect;

// ── Section 19.4 + 24: Proof Center ─────────────────────────────────────────
export const kbProofAssetsTable = pgTable("kb_proof_assets", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  proofType: varchar("proof_type", { length: 30 }).notNull(),
  // video_testimonial | voice_testimonial | income_proof | success_story | social_proof | guarantee_proof
  product: varchar("product", { length: 100 }),
  description: text("description"),
  resultType: varchar("result_type", { length: 50 }),
  // first_income | first_customer | sales_growth | business_growth | career_change | student_success
  tags: text("tags"),
  objectionTags: text("objection_tags"),
  // JSON array: trust | price | risk | guarantee | saturation
  priority: integer("priority").notNull().default(5),
  // 1 (highest) – 10 (lowest); video=1, voice=2, guarantee=3, income=4, screenshot=5
  visibility: varchar("visibility", { length: 20 }).notNull().default("sales"),
  // sales | support | internal
  fileUrl: text("file_url"),
  isPublished: boolean("is_published").notNull().default(false),
  shownCount: integer("shown_count").notNull().default(0),
  usedCount: integer("used_count").notNull().default(0),
  conversionImpact: integer("conversion_impact").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type KbProofAsset = typeof kbProofAssetsTable.$inferSelect;

// ── Section 24: Success Stories ──────────────────────────────────────────────
export const kbSuccessStoriesTable = pgTable("kb_success_stories", {
  id: serial("id").primaryKey(),
  studentName: text("student_name").notNull(),
  product: varchar("product", { length: 100 }),
  beforeState: text("before_state"),
  challenges: text("challenges"),
  actions: text("actions"),
  results: text("results").notNull(),
  proofAssetIds: text("proof_asset_ids"),
  resultType: varchar("result_type", { length: 50 }),
  // first_income | first_customer | sales_growth | income_growth | business_growth | career_change | lifestyle_change
  tags: text("tags"),
  // JSON: beginner | employee | business_owner | student | instagram | mtp
  objectionTags: text("objection_tags"),
  // JSON: trust | price | risk | saturation | time
  successScore: integer("success_score").notNull().default(0),
  proofQuality: varchar("proof_quality", { length: 10 }).notNull().default("bronze"),
  // platinum | gold | silver | bronze
  isVerified: boolean("is_verified").notNull().default(false),
  isPublished: boolean("is_published").notNull().default(false),
  shownCount: integer("shown_count").notNull().default(0),
  conversionImpact: integer("conversion_impact").notNull().default(0),
  storyDate: timestamp("story_date"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type KbSuccessStory = typeof kbSuccessStoriesTable.$inferSelect;

// ── Section 19.2: General Knowledge Items (all categories) ───────────────────
export const kbKnowledgeItemsTable = pgTable("kb_knowledge_items", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  category: varchar("category", { length: 50 }).notNull(),
  // academy_intro | sara_persona | about_soheil | sales_techniques | communication_style | product_kb
  subCategory: varchar("sub_category", { length: 100 }),
  content: text("content").notNull(),
  product: varchar("product", { length: 100 }),
  intent: varchar("intent", { length: 100 }),
  keywords: text("keywords"),
  tags: text("tags"),
  accessLevel: varchar("access_level", { length: 20 }).notNull().default("sales"),
  // sales | support | admin
  priority: integer("priority").notNull().default(5),
  isPublished: boolean("is_published").notNull().default(false),
  shownCount: integer("shown_count").notNull().default(0),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});
export type KbKnowledgeItem = typeof kbKnowledgeItemsTable.$inferSelect;
