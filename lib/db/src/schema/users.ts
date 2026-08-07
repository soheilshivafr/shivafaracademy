import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const usersTable = pgTable("users", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull().unique(),
  name: text("name"),
  avatar: text("avatar"),
  passwordHash: text("password_hash"),
  boundDeviceId: text("bound_device_id"),
  walletBalance: integer("wallet_balance").notNull().default(0),
  bankCard: text("bank_card"),
  sheba: text("sheba"),
  accountName: text("account_name"),
  assistantName: text("assistant_name"),
  assistantAvatar: text("assistant_avatar"),
  welcomeProactiveSent: boolean("welcome_proactive_sent").notNull().default(false),
  // Which advertising tracking link (if any) this user's signup is attributed to.
  signupTrackingLinkId: integer("signup_tracking_link_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const otpCodesTable = pgTable("otp_codes", {
  id: serial("id").primaryKey(),
  phone: text("phone").notNull(),
  code: text("code").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  used: boolean("used").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const adminUsersTable = pgTable("admin_users", {
  id: serial("id").primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  permissions: text("permissions").array().notNull().default([]),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;

export const insertOtpSchema = createInsertSchema(otpCodesTable).omit({ id: true, createdAt: true });
export type InsertOtp = z.infer<typeof insertOtpSchema>;

export const insertAdminSchema = createInsertSchema(adminUsersTable).omit({ id: true, createdAt: true });
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type AdminUser = typeof adminUsersTable.$inferSelect;
