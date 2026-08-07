import { pgTable, serial, integer, varchar, timestamp } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Per-user gating state for Sara voice calls.
 * Tier (A/B/C/D) is derived from the CRM lead score at the end of each call and
 * controls the cooldown before the next call + the weekly call cap.
 */
export const voiceCallGateTable = pgTable("voice_call_gate", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().unique().references(() => usersTable.id, { onDelete: "cascade" }),
  tier: varchar("tier", { length: 1 }).notNull().default("B"), // A | B | C | D
  score: integer("score").notNull().default(0),                 // last computed lead score (0-100)
  totalCalls: integer("total_calls").notNull().default(0),
  callsThisWeek: integer("calls_this_week").notNull().default(0),
  shortCallsForgiven: integer("short_calls_forgiven").notNull().default(0), // aborted short calls excused (grace)
  weekStartAt: timestamp("week_start_at").defaultNow().notNull(),
  lastCallAt: timestamp("last_call_at"),
  nextCallAllowedAt: timestamp("next_call_allowed_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type VoiceCallGate = typeof voiceCallGateTable.$inferSelect;
