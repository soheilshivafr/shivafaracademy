import { Router } from "express";
import { db } from "@workspace/db";
import {
  financialTransactionsTable,
  financialCategoriesTable,
  financialGoalsTable,
  usersTable,
} from "@workspace/db";
import { eq, and, gte, lte, desc, sql, or, isNull } from "drizzle-orm";
import { requireUser, requireAdmin } from "../middlewares/auth";
import { logger } from "../lib/logger";

const router = Router();

// ─── DEFAULTS ──────────────────────────────────────────────────────────────

const DEFAULT_INCOME_CATEGORIES = [
  "فروش محصول / خدمات",
  "حقوق",
  "اجاره",
  "سرمایه‌گذاری",
  "سود بانکی",
  "هدیه / کمک مالی",
  "پروژه کاری",
  "کمیسیون / پورسانت",
  "درآمد اینترنتی",
  "فروش دارایی",
  "سایر درآمدها",
];

const DEFAULT_EXPENSE_CATEGORIES = [
  "خوراک و مواد غذایی",
  "رستوران و کافه",
  "اجاره خانه",
  "قبوض و شارژ",
  "حمل‌ونقل",
  "سوخت خودرو",
  "تعمیرات خودرو",
  "پوشاک",
  "خرید خانه",
  "درمان و دارو",
  "آموزش",
  "تبلیغات",
  "حقوق کارمند",
  "تفریح و سفر",
  "قسط و بدهی",
  "اینترنت و موبایل",
  "خانواده و فرزند",
  "سرمایه‌گذاری",
  "خیریه و کمک",
  "سایر هزینه‌ها",
];

// ─── HELPERS ────────────────────────────────────────────────────────────────

function todayStr(): string {
  return new Date().toISOString().split("T")[0];
}

function startOfMonthStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

function startOfYearStr(): string {
  return `${new Date().getFullYear()}-01-01`;
}

function startOfWeekStr(): string {
  const d = new Date();
  const day = d.getDay(); // 0=Sun
  const diff = (day === 0 ? -6 : 1) - day; // Monday-based
  d.setDate(d.getDate() + diff);
  return d.toISOString().split("T")[0];
}

function computeLevel(score: number): { level: number; title: string } {
  if (score >= 2000) return { level: 7, title: "استاد جریان پول" };
  if (score >= 1500) return { level: 6, title: "سرمایه‌گذار هوشمند" };
  if (score >= 1000) return { level: 5, title: "سازنده ثروت" };
  if (score >= 600) return { level: 4, title: "مدیر مالی شخصی" };
  if (score >= 300) return { level: 3, title: "کنترل‌گر پول" };
  if (score >= 100) return { level: 2, title: "منظم مالی" };
  return { level: 1, title: "شروع‌کننده مالی" };
}

function computeScore(
  txAll: { type: string; date: string; categoryName: string }[],
  monthIncome: number,
  monthExpense: number,
  goal: number,
  expenseCap: number | null
): number {
  let score = 0;
  const distinctDates = new Set(txAll.map((t) => t.date));
  score += distinctDates.size * 10;
  score += txAll.filter((t) => t.categoryName).length * 5;
  if (goal > 0 && monthIncome >= goal) score += 200;
  if (monthExpense > 0 && monthIncome > monthExpense) score += 100;
  if (expenseCap && monthExpense < expenseCap) score += 150;
  const weeks = Math.floor(distinctDates.size / 7);
  score += weeks * 50;
  return score;
}

// ─── USER: CATEGORIES ───────────────────────────────────────────────────────

router.get("/financial/categories", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const type = req.query.type as string | undefined;

  const customRows = await db
    .select()
    .from(financialCategoriesTable)
    .where(
      and(
        eq(financialCategoriesTable.userId, userId),
        type ? eq(financialCategoriesTable.type, type) : undefined
      )
    );

  const incomeDefaults = DEFAULT_INCOME_CATEGORIES.map((name) => ({
    id: 0,
    userId: 0,
    type: "income",
    name,
    isDefault: true,
    createdAt: new Date(),
  }));
  const expenseDefaults = DEFAULT_EXPENSE_CATEGORIES.map((name) => ({
    id: 0,
    userId: 0,
    type: "expense",
    name,
    isDefault: true,
    createdAt: new Date(),
  }));

  const defaults = type === "income"
    ? incomeDefaults
    : type === "expense"
    ? expenseDefaults
    : [...incomeDefaults, ...expenseDefaults];

  res.json({ defaults, custom: customRows });
});

router.post("/financial/categories", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { type, name } = req.body;
  if (!type || !name?.trim()) {
    res.status(400).json({ message: "نوع و نام الزامی است" });
    return;
  }
  const [row] = await db
    .insert(financialCategoriesTable)
    .values({ userId, type, name: name.trim() })
    .returning();
  res.json(row);
});

router.delete("/financial/categories/:id", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const id = parseInt(String(req.params.id));
  await db
    .delete(financialCategoriesTable)
    .where(
      and(
        eq(financialCategoriesTable.id, id),
        eq(financialCategoriesTable.userId, userId)
      )
    );
  res.json({ ok: true });
});

// ─── USER: GOALS ────────────────────────────────────────────────────────────

router.get("/financial/goals", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const [goal] = await db
    .select()
    .from(financialGoalsTable)
    .where(eq(financialGoalsTable.userId, userId))
    .limit(1);
  res.json(goal ?? { monthlyIncomeTarget: 0, monthlyExpenseCap: null });
});

router.put("/financial/goals", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { monthlyIncomeTarget, monthlyExpenseCap } = req.body;

  const [existing] = await db
    .select()
    .from(financialGoalsTable)
    .where(eq(financialGoalsTable.userId, userId))
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(financialGoalsTable)
      .set({
        monthlyIncomeTarget: monthlyIncomeTarget ?? 0,
        monthlyExpenseCap: monthlyExpenseCap ?? null,
        updatedAt: new Date(),
      })
      .where(eq(financialGoalsTable.userId, userId))
      .returning();
    res.json(row);
  } else {
    const [row] = await db
      .insert(financialGoalsTable)
      .values({
        userId,
        monthlyIncomeTarget: monthlyIncomeTarget ?? 0,
        monthlyExpenseCap: monthlyExpenseCap ?? null,
        updatedAt: new Date(),
      })
      .returning();
    res.json(row);
  }
});

// ─── USER: TRANSACTIONS ─────────────────────────────────────────────────────

router.get("/financial/transactions", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { from, to, type, search, limit: lim } = req.query as Record<string, string>;

  const conditions: any[] = [eq(financialTransactionsTable.userId, userId)];
  if (from) conditions.push(gte(financialTransactionsTable.date, from));
  if (to) conditions.push(lte(financialTransactionsTable.date, to));
  if (type && type !== "all") conditions.push(eq(financialTransactionsTable.type, type));

  const rows = await db
    .select()
    .from(financialTransactionsTable)
    .where(and(...conditions))
    .orderBy(desc(financialTransactionsTable.date), desc(financialTransactionsTable.createdAt))
    .limit(parseInt(lim ?? "200"));

  const filtered = search
    ? rows.filter(
        (r) =>
          r.categoryName?.includes(search) ||
          String(r.amount).includes(search)
      )
    : rows;

  res.json(filtered);
});

router.post("/financial/transactions", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { type, amount, categoryName, date, time, paymentMethod, isRecurring, recurringType } = req.body;

  if (!type || !amount || !categoryName) {
    res.status(400).json({ message: "نوع، مبلغ و دسته‌بندی الزامی است" });
    return;
  }

  const [row] = await db
    .insert(financialTransactionsTable)
    .values({
      userId,
      type,
      amount: parseInt(String(amount).replace(/[^0-9]/g, "")),
      categoryName,
      date: date ?? todayStr(),
      time: time ?? null,
      paymentMethod: paymentMethod ?? null,
      isRecurring: isRecurring ?? false,
      recurringType: recurringType ?? null,
    })
    .returning();

  res.json(row);
});

router.put("/financial/transactions/:id", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const id = parseInt(String(req.params.id));
  const { type, amount, categoryName, date, time, paymentMethod, isRecurring, recurringType } = req.body;

  const [row] = await db
    .update(financialTransactionsTable)
    .set({
      type,
      amount: parseInt(String(amount).replace(/[^0-9]/g, "")),
      categoryName,
      date,
      time: time ?? null,
      paymentMethod: paymentMethod ?? null,
      isRecurring: isRecurring ?? false,
      recurringType: recurringType ?? null,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(financialTransactionsTable.id, id),
        eq(financialTransactionsTable.userId, userId)
      )
    )
    .returning();

  if (!row) {
    res.status(404).json({ message: "تراکنش پیدا نشد" });
    return;
  }
  res.json(row);
});

router.delete("/financial/transactions/:id", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const id = parseInt(String(req.params.id));
  await db
    .delete(financialTransactionsTable)
    .where(
      and(
        eq(financialTransactionsTable.id, id),
        eq(financialTransactionsTable.userId, userId)
      )
    );
  res.json({ ok: true });
});

// ─── USER: SUMMARY ──────────────────────────────────────────────────────────

router.get("/financial/summary", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const td = todayStr();
  const ms = startOfMonthStr();
  const ws = startOfWeekStr();
  const ys = startOfYearStr();

  const allTx = await db
    .select()
    .from(financialTransactionsTable)
    .where(eq(financialTransactionsTable.userId, userId));

  const todayTx = allTx.filter((t) => t.date === td);
  const weekTx  = allTx.filter((t) => t.date >= ws && t.date <= td);
  const monthTx = allTx.filter((t) => t.date >= ms && t.date <= td);
  const yearTx  = allTx.filter((t) => t.date >= ys && t.date <= td);

  const sum = (arr: typeof allTx, type: string) =>
    arr.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

  const todayIncome = sum(todayTx, "income");
  const todayExpense = sum(todayTx, "expense");
  const monthIncome = sum(monthTx, "income");
  const monthExpense = sum(monthTx, "expense");
  const yearIncome = sum(yearTx, "income");
  const yearExpense = sum(yearTx, "expense");

  const [goal] = await db
    .select()
    .from(financialGoalsTable)
    .where(eq(financialGoalsTable.userId, userId))
    .limit(1);

  const monthlyTarget = goal?.monthlyIncomeTarget ?? 0;
  const expenseCap = goal?.monthlyExpenseCap ?? null;

  const score = computeScore(allTx, monthIncome, monthExpense, monthlyTarget, expenseCap);
  const levelInfo = computeLevel(score);

  const txCount = allTx.length;

  // Smart analysis messages
  const messages: string[] = [];
  if (monthIncome - monthExpense > 0) messages.push("مبلغ باقیمانده این ماه مثبت است ✅");
  if (monthlyTarget > 0) {
    const pct = Math.round((monthIncome / monthlyTarget) * 100);
    messages.push(`شما به ${pct}٪ هدف درآمد ماهانه خود رسیده‌اید`);
  }

  const expenseByCategory: Record<string, number> = {};
  monthTx.filter((t) => t.type === "expense").forEach((t) => {
    expenseByCategory[t.categoryName] = (expenseByCategory[t.categoryName] ?? 0) + t.amount;
  });
  const topExpenseCat = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0];
  if (topExpenseCat) {
    messages.push(`این ماه بیشترین هزینه شما مربوط به «${topExpenseCat[0]}» بوده`);
  }

  const incomeByCategory: Record<string, number> = {};
  monthTx.filter((t) => t.type === "income").forEach((t) => {
    incomeByCategory[t.categoryName] = (incomeByCategory[t.categoryName] ?? 0) + t.amount;
  });
  const topIncomeCat = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1])[0];
  if (topIncomeCat) {
    messages.push(`این ماه بیشترین درآمد شما از «${topIncomeCat[0]}» بوده`);
  }

  if (monthIncome === 0 && monthExpense === 0) {
    messages.push("هنوز تراکنشی ثبت نشده. اولین درآمد یا هزینه خود را وارد کنید!");
  }

  const weekIncome  = sum(weekTx, "income");
  const weekExpense = sum(weekTx, "expense");

  res.json({
    today: { income: todayIncome,  expense: todayExpense,  remaining: todayIncome  - todayExpense  },
    week:  { income: weekIncome,   expense: weekExpense,   remaining: weekIncome   - weekExpense   },
    month: { income: monthIncome,  expense: monthExpense,  remaining: monthIncome  - monthExpense  },
    year:  { income: yearIncome,   expense: yearExpense,   remaining: yearIncome   - yearExpense   },
    goal: { target: monthlyTarget, expenseCap, progress: monthlyTarget > 0 ? Math.min(100, Math.round((monthIncome / monthlyTarget) * 100)) : 0 },
    score,
    level: levelInfo,
    txCount,
    messages,
  });
});

// ─── USER: REPORTS ──────────────────────────────────────────────────────────

router.get("/financial/reports", requireUser, async (req, res) => {
  const userId = req.user!.userId;
  const { from, to } = req.query as Record<string, string>;

  const fromDate = from ?? startOfMonthStr();
  const toDate = to ?? todayStr();

  const tx = await db
    .select()
    .from(financialTransactionsTable)
    .where(
      and(
        eq(financialTransactionsTable.userId, userId),
        gte(financialTransactionsTable.date, fromDate),
        lte(financialTransactionsTable.date, toDate)
      )
    )
    .orderBy(financialTransactionsTable.date);

  // Daily breakdown
  const dailyMap: Record<string, { date: string; income: number; expense: number }> = {};
  tx.forEach((t) => {
    if (!dailyMap[t.date]) dailyMap[t.date] = { date: t.date, income: 0, expense: 0 };
    if (t.type === "income") dailyMap[t.date].income += t.amount;
    else dailyMap[t.date].expense += t.amount;
  });
  const daily = Object.values(dailyMap).map((d) => ({
    ...d,
    remaining: d.income - d.expense,
  }));

  // Category breakdown
  const incomeByCategory: Record<string, { amount: number; count: number }> = {};
  const expenseByCategory: Record<string, { amount: number; count: number }> = {};
  tx.forEach((t) => {
    const map = t.type === "income" ? incomeByCategory : expenseByCategory;
    if (!map[t.categoryName]) map[t.categoryName] = { amount: 0, count: 0 };
    map[t.categoryName].amount += t.amount;
    map[t.categoryName].count += 1;
  });

  const totalIncome = tx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = tx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);

  const incomeCategories = Object.entries(incomeByCategory)
    .map(([name, { amount, count }]) => ({
      name,
      amount,
      count,
      percent: totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  const expenseCategories = Object.entries(expenseByCategory)
    .map(([name, { amount, count }]) => ({
      name,
      amount,
      count,
      percent: totalExpense > 0 ? Math.round((amount / totalExpense) * 100) : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  res.json({ daily, incomeCategories, expenseCategories, totalIncome, totalExpense });
});

// ─── ADMIN: FINANCIAL REPORTS ────────────────────────────────────────────────

router.get("/admin/financial/summary", requireAdmin, async (req, res) => {
  const allTx = await db.select().from(financialTransactionsTable);
  const td = todayStr();

  const totalIncome = allTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalExpense = allTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const todayTx = allTx.filter((t) => t.date === td);
  const todayCount = todayTx.length;

  const activeUsers = new Set(allTx.map((t) => t.userId)).size;

  const expenseByCategory: Record<string, number> = {};
  const incomeByCategory: Record<string, number> = {};
  allTx.forEach((t) => {
    if (t.type === "expense") expenseByCategory[t.categoryName] = (expenseByCategory[t.categoryName] ?? 0) + t.amount;
    else incomeByCategory[t.categoryName] = (incomeByCategory[t.categoryName] ?? 0) + t.amount;
  });

  const topExpenseCat = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  const topIncomeCat = Object.entries(incomeByCategory).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

  res.json({
    activeUsers,
    totalIncome,
    totalExpense,
    totalRemaining: totalIncome - totalExpense,
    avgIncomePerUser: activeUsers > 0 ? Math.round(totalIncome / activeUsers) : 0,
    avgExpensePerUser: activeUsers > 0 ? Math.round(totalExpense / activeUsers) : 0,
    totalTransactions: allTx.length,
    todayTransactions: todayCount,
    topExpenseCategory: topExpenseCat,
    topIncomeCategory: topIncomeCat,
  });
});

router.get("/admin/financial/users", requireAdmin, async (req, res) => {
  const { from, to } = req.query as Record<string, string>;
  const fromDate = from ?? startOfMonthStr();
  const toDate = to ?? todayStr();

  const users = await db.select({ id: usersTable.id, name: usersTable.name, phone: usersTable.phone, createdAt: usersTable.createdAt }).from(usersTable);

  const allTx = await db
    .select()
    .from(financialTransactionsTable)
    .where(
      and(
        gte(financialTransactionsTable.date, fromDate),
        lte(financialTransactionsTable.date, toDate)
      )
    );

  const goals = await db.select().from(financialGoalsTable);

  const result = users
    .map((u) => {
      const userTx = allTx.filter((t) => t.userId === u.id);
      if (userTx.length === 0) return null;

      const income = userTx.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
      const expense = userTx.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
      const goal = goals.find((g) => g.userId === u.id);
      const target = goal?.monthlyIncomeTarget ?? 0;
      const progress = target > 0 ? Math.min(100, Math.round((income / target) * 100)) : 0;
      const score = computeScore(userTx, income, expense, target, goal?.monthlyExpenseCap ?? null);
      const level = computeLevel(score);
      const lastTx = userTx.sort((a, b) => b.date.localeCompare(a.date))[0];

      return {
        userId: u.id,
        name: u.name ?? "ناشناس",
        phone: u.phone,
        txCount: userTx.length,
        income,
        expense,
        remaining: income - expense,
        target,
        progress,
        score,
        level: level.level,
        levelTitle: level.title,
        lastActivity: lastTx?.date ?? null,
      };
    })
    .filter(Boolean);

  res.json(result);
});

router.get("/admin/financial/users/:userId", requireAdmin, async (req, res) => {
  const userId = parseInt(String(req.params.userId));

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user) {
    res.status(404).json({ message: "کاربر پیدا نشد" });
    return;
  }

  const allTx = await db
    .select()
    .from(financialTransactionsTable)
    .where(eq(financialTransactionsTable.userId, userId))
    .orderBy(desc(financialTransactionsTable.date));

  const td = todayStr();
  const ms = startOfMonthStr();
  const ys = startOfYearStr();
  const ws = startOfWeekStr();

  const todayTx = allTx.filter((t) => t.date === td);
  const weekTx  = allTx.filter((t) => t.date >= ws && t.date <= td);
  const monthTx = allTx.filter((t) => t.date >= ms && t.date <= td);
  const yearTx  = allTx.filter((t) => t.date >= ys && t.date <= td);

  const sum = (arr: typeof allTx, type: string) =>
    arr.filter((t) => t.type === type).reduce((s, t) => s + t.amount, 0);

  const [goal] = await db
    .select()
    .from(financialGoalsTable)
    .where(eq(financialGoalsTable.userId, userId))
    .limit(1);

  const monthIncome = sum(monthTx, "income");
  const monthExpense = sum(monthTx, "expense");
  const target = goal?.monthlyIncomeTarget ?? 0;
  const score = computeScore(allTx, monthIncome, monthExpense, target, goal?.monthlyExpenseCap ?? null);
  const level = computeLevel(score);

  // Daily breakdown for charts (last 30 days)
  const dailyMap: Record<string, { date: string; income: number; expense: number }> = {};
  monthTx.forEach((t) => {
    if (!dailyMap[t.date]) dailyMap[t.date] = { date: t.date, income: 0, expense: 0 };
    if (t.type === "income") dailyMap[t.date].income += t.amount;
    else dailyMap[t.date].expense += t.amount;
  });
  const daily = Object.values(dailyMap).map((d) => ({ ...d, remaining: d.income - d.expense }));

  // Category breakdown
  const expenseByCategory: Record<string, { amount: number; count: number }> = {};
  const incomeByCategory: Record<string, { amount: number; count: number }> = {};
  monthTx.forEach((t) => {
    const map = t.type === "income" ? incomeByCategory : expenseByCategory;
    if (!map[t.categoryName]) map[t.categoryName] = { amount: 0, count: 0 };
    map[t.categoryName].amount += t.amount;
    map[t.categoryName].count += 1;
  });

  const totalMonthIncome = sum(monthTx, "income");
  const totalMonthExpense = sum(monthTx, "expense");

  const incomeCategories = Object.entries(incomeByCategory)
    .map(([name, { amount, count }]) => ({ name, amount, count, percent: totalMonthIncome > 0 ? Math.round((amount / totalMonthIncome) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  const expenseCategories = Object.entries(expenseByCategory)
    .map(([name, { amount, count }]) => ({ name, amount, count, percent: totalMonthExpense > 0 ? Math.round((amount / totalMonthExpense) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);

  // Smart analysis
  const analysis: string[] = [];
  const daysSinceLastTx = allTx.length > 0
    ? Math.floor((Date.now() - new Date(allTx[0].date).getTime()) / 86400000)
    : -1;

  if (daysSinceLastTx > 5) analysis.push(`این کاربر ${daysSinceLastTx} روز است هیچ تراکنشی ثبت نکرده`);
  if (monthIncome - monthExpense > 0) analysis.push("این کاربر در این ماه مبلغ باقیمانده مثبت دارد");
  if (target > 0) analysis.push(`کاربر به ${Math.min(100, Math.round((monthIncome / target) * 100))}٪ هدف درآمد ماهانه خود رسیده است`);

  const topExpenseCat = Object.entries(expenseByCategory).sort((a, b) => b[1].amount - a[1].amount)[0];
  if (topExpenseCat) analysis.push(`بیشترین هزینه این کاربر مربوط به «${topExpenseCat[0]}» بوده`);

  res.json({
    user: { id: user.id, name: user.name, phone: user.phone, createdAt: user.createdAt },
    summary: {
      today: { income: sum(todayTx, "income"), expense: sum(todayTx, "expense"), remaining: sum(todayTx, "income") - sum(todayTx, "expense") },
      week:  { income: sum(weekTx,  "income"), expense: sum(weekTx,  "expense"), remaining: sum(weekTx,  "income") - sum(weekTx,  "expense") },
      month: { income: monthIncome, expense: monthExpense, remaining: monthIncome - monthExpense },
      year:  { income: sum(yearTx,  "income"), expense: sum(yearTx,  "expense"), remaining: sum(yearTx,  "income") - sum(yearTx,  "expense") },
      total: { income: sum(allTx,   "income"), expense: sum(allTx,   "expense"), remaining: sum(allTx,   "income") - sum(allTx,   "expense") },
    },
    goal: { target, progress: target > 0 ? Math.min(100, Math.round((monthIncome / target) * 100)) : 0 },
    score,
    level,
    transactions: allTx.slice(0, 100),
    daily,
    incomeCategories,
    expenseCategories,
    analysis,
    activeDays: new Set(allTx.map((t) => t.date)).size,
  });
});

export default router;
