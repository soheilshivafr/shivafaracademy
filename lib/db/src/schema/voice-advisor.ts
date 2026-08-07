import { pgTable, serial, text, integer, real, timestamp, json } from "drizzle-orm/pg-core";

export type VoiceMessage = { role: "user" | "assistant"; content: string; ts: string };

export const voiceAdvisorLogsTable = pgTable("voice_advisor_logs", {
  id: serial("id").primaryKey(),
  sessionId: text("session_id").notNull().unique(),
  userId: integer("user_id").notNull(),
  userPhone: text("user_phone"),
  userName: text("user_name"),
  startedAt: timestamp("started_at").defaultNow().notNull(),
  lastActivityAt: timestamp("last_activity_at").defaultNow().notNull(),
  turnCount: integer("turn_count").notNull().default(0),
  gptInputTokens: integer("gpt_input_tokens").notNull().default(0),
  gptOutputTokens: integer("gpt_output_tokens").notNull().default(0),
  elevenlabsChars: integer("elevenlabs_chars").notNull().default(0),
  estimatedCostUsd: real("estimated_cost_usd").notNull().default(0),
  messages: json("messages").$type<VoiceMessage[]>().default([]),
});

export type VoiceAdvisorLog = typeof voiceAdvisorLogsTable.$inferSelect;
