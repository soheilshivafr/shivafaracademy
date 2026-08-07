import { pgTable, serial, text, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const channelPostsTable = pgTable("channel_posts", {
  id: serial("id").primaryKey(),
  content: text("content").notNull(),
  mediaUrl: text("media_url"),
  mediaType: text("media_type"), // "image" | "video" | null
  isPinned: boolean("is_pinned").default(false).notNull(),
  viewCount: integer("view_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertChannelPostSchema = createInsertSchema(channelPostsTable).omit({
  id: true,
  viewCount: true,
  createdAt: true,
});

export type InsertChannelPost = z.infer<typeof insertChannelPostSchema>;
export type ChannelPost = typeof channelPostsTable.$inferSelect;
