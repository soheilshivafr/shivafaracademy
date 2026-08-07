import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const leaderboardCampaignsTable = pgTable("leaderboard_campaigns", {
  id: serial("id").primaryKey(),
  prizeTitle: text("prize_title").notNull(),
  awardAt: timestamp("award_at").notNull(),
  status: text("status").notNull().default("active"), // 'active' | 'ended'
  winnerTribeId: integer("winner_tribe_id"),
  winnerTribeName: text("winner_tribe_name"),
  winnerChiefName: text("winner_chief_name"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertCampaignSchema = createInsertSchema(leaderboardCampaignsTable).omit({
  id: true, createdAt: true, updatedAt: true, status: true,
  winnerTribeId: true, winnerTribeName: true, winnerChiefName: true,
});
export type InsertCampaign = z.infer<typeof insertCampaignSchema>;
export type Campaign = typeof leaderboardCampaignsTable.$inferSelect;
