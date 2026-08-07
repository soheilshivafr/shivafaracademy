import { pgTable, serial, text, timestamp, integer, bigint, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const tribesTable = pgTable("tribes", {
  id: serial("id").primaryKey(),
  chiefUserId: integer("chief_user_id").notNull().unique(),
  name: text("name").notNull(),
  logo: text("logo"),
  referralCode: text("referral_code").notNull().unique(),
  bankCard: text("bank_card"),
  sheba: text("sheba"),
  lastLeaderboardRank: integer("last_leaderboard_rank"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const tribeMembersTable = pgTable("tribe_members", {
  id: serial("id").primaryKey(),
  tribeId: integer("tribe_id").notNull(),
  userId: integer("user_id").notNull().unique(), // one user can only be in one tribe
  joinedAt: timestamp("joined_at").defaultNow().notNull(),
});

export const walletTransactionsTable = pgTable("wallet_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(), // in Toman, positive=credit, negative=debit
  type: text("type").notNull(), // 'commission' | 'withdrawal'
  referenceId: integer("reference_id"), // orderId for commission
  description: text("description").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const withdrawalRequestsTable = pgTable("withdrawal_requests", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  amount: integer("amount").notNull(),
  status: text("status").notNull().default("pending"), // pending | approved | rejected
  kycNationalIdImg: text("kyc_national_id_img"),
  kycSelfieImg: text("kyc_selfie_img"),
  kycVerified: text("kyc_verified").default("no"), // no | yes
  adminNote: text("admin_note"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertTribeSchema = createInsertSchema(tribesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTribe = z.infer<typeof insertTribeSchema>;
export type Tribe = typeof tribesTable.$inferSelect;

export const insertTribeMemberSchema = createInsertSchema(tribeMembersTable).omit({ id: true, joinedAt: true });
export type InsertTribeMember = z.infer<typeof insertTribeMemberSchema>;
export type TribeMember = typeof tribeMembersTable.$inferSelect;

export const insertWalletTransactionSchema = createInsertSchema(walletTransactionsTable).omit({ id: true, createdAt: true });
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
export type WalletTransaction = typeof walletTransactionsTable.$inferSelect;

export const insertWithdrawalRequestSchema = createInsertSchema(withdrawalRequestsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertWithdrawalRequest = z.infer<typeof insertWithdrawalRequestSchema>;
export type WithdrawalRequest = typeof withdrawalRequestsTable.$inferSelect;

export const pushSubscriptionsTable = pgTable("push_subscriptions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  endpoint: text("endpoint").notNull().unique(),
  keys: jsonb("keys").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
