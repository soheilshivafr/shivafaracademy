import { pgTable, serial, integer, text, boolean, timestamp } from "drizzle-orm/pg-core";

// Audio podcast posts
export const audioPostsTable = pgTable("audio_posts", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  audioUrl: text("audio_url").notNull(),
  coverUrl: text("cover_url"),
  isPublished: boolean("is_published").notNull().default(true),
  fakeViewsTarget: integer("fake_views_target").notNull().default(0),
  fakeLikesTarget: integer("fake_likes_target").notNull().default(0),
  realViews: integer("real_views").notNull().default(0),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

// Likes on audio posts
export const audioLikesTable = pgTable("audio_likes", {
  id: serial("id").primaryKey(),
  audioPostId: integer("audio_post_id").notNull(),
  userId: integer("user_id").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Comments on audio posts (require moderation)
export const audioCommentsTable = pgTable("audio_comments", {
  id: serial("id").primaryKey(),
  audioPostId: integer("audio_post_id").notNull(),
  userId: integer("user_id").notNull(),
  content: text("content").notNull(),
  approved: boolean("approved").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type AudioPost = typeof audioPostsTable.$inferSelect;
export type AudioLike = typeof audioLikesTable.$inferSelect;
export type AudioComment = typeof audioCommentsTable.$inferSelect;
