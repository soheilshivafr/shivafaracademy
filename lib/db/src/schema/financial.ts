import { pgTable, serial, text, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const financialTransactionsTable = pgTable("financial_transactions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'income' | 'expense'
  amount: integer("amount").notNull(),
  categoryName: text("category_name").notNull(),
  date: text("date").notNull(), // YYYY-MM-DD
  time: text("time"),
  paymentMethod: text("payment_method"),
  receiptUrl: text("receipt_url"),
  isRecurring: boolean("is_recurring").default(false).notNull(),
  recurringType: text("recurring_type"), // daily/weekly/monthly/yearly
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const financialCategoriesTable = pgTable("financial_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  type: text("type").notNull(), // 'income' | 'expense'
  name: text("name").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const financialGoalsTable = pgTable("financial_goals", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  monthlyIncomeTarget: integer("monthly_income_target").notNull().default(0),
  monthlyExpenseCap: integer("monthly_expense_cap"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const insertFinancialTransactionSchema = createInsertSchema(financialTransactionsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertFinancialTransaction = z.infer<typeof insertFinancialTransactionSchema>;
export type FinancialTransaction = typeof financialTransactionsTable.$inferSelect;

export const insertFinancialCategorySchema = createInsertSchema(financialCategoriesTable).omit({
  id: true,
  createdAt: true,
});
export type FinancialCategory = typeof financialCategoriesTable.$inferSelect;

export const insertFinancialGoalSchema = createInsertSchema(financialGoalsTable).omit({ id: true });
export type FinancialGoal = typeof financialGoalsTable.$inferSelect;
