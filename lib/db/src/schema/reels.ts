import { pgTable, serial, text, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const reelsTable = pgTable("reels", {
  id: serial("id").primaryKey(),
  title: text("title"),
  videoUrl: text("video_url").notNull(),
  order: integer("order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertReelSchema = createInsertSchema(reelsTable).omit({ id: true, createdAt: true });
export type InsertReel = z.infer<typeof insertReelSchema>;
export type Reel = typeof reelsTable.$inferSelect;
