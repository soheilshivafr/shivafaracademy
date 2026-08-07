import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";
import {
  LineChart, Line,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  Users, TrendingUp, TrendingDown, Wallet, ArrowRight, Star,
  Search, ChevronLeft, Phone, User,
} from "lucide-react";

// ─── HELPERS ────────────────────────────────────────────────────────────────

function formatNum(n: number) {
  return (n ?? 0).toLocaleString("fa-IR");
}
function formatPrice(n: number) {
  return formatNum(n) + " ت";
}

const CHART_COLORS = ["#a78bfa", "#f59e0b", "#34d399", "#f87171", "#60a5fa", "#fb923c", "#a3e635", "#e879f9"];

const LEVEL_TITLES: Record<number, string> = {
  1: "شروع‌کننده مالی", 2: "منظم مالی", 3: "کنترل‌گر پول",
  4: "مدیر مالی شخصی", 5: "سازنده ثروت", 6: "سرمایه‌گذار هوشمند", 7: "استاد جریان پول",
};

type Period = "today" | "week" | "month" | "year";

const PERIOD_LABELS: Record<Period, string> = {
  today: "امروز",
  week: "این هفته",
  month: "این ماه",
  year: "این سال",
};

function getPeriodDates(p: Period): { from: string; to: string } {
  const today = new Date();
  const td = today.toISOString().split("T")[0];
  if (p === "today") return { from: td, to: td };
  if (p === "week") {
    const d = new Date(today);
    const day = d.getDay();
    const diff = (day === 0 ? -6 : 1) - day;
    d.setDate(d.getDate() + diff);
    return { from: d.toISOString().split("T")[0], to: td };
  }
  if (p === "month") {
    const d = new Date(today);
    return { from: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`, to: td };
  }
  // year
  return { from: `${today.getFullYear()}-01-01`, to: td };
}

function authFetch(token: string | null, url: string, opts?: RequestInit) {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  }).then((r) => r.json());
}

// ─── SUMMARY CARDS ───────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex items-start gap-3">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="font-black text-sm text-foreground">{value}</p>
      </div>
    </div>
  );
}

// ─── PERIOD TAB BAR ──────────────────────────────────────────────────────────

function PeriodTabs({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex gap-1 bg-muted/30 rounded-xl p-1 w-fit">
      {(["today", "week", "month", "year"] as Period[]).map((p) => (
        <button
          key={p}
          onClick={() => onChange(p)}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
            value === p
              ? "bg-primary text-primary-foreground shadow"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {PERIOD_LABELS[p]}
        </button>
      ))}
    </div>
  );
}

// ─── USER DETAIL ─────────────────────────────────────────────────────────────

function UserDetail({ userId, token, onBack }: { userId: number; token: string | null; onBack: () => void }) {
  const [detailPeriod, setDetailPeriod] = useState<Period>("month");

  const { data, isLoading } = useQuery({
    queryKey: ["/api/admin/financial/users", userId],
    queryFn: () => authFetch(token, `/api/admin/financial/users/${userId}`),
    enabled: !!token,
  });

  if (isLoading || !data) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const { user, summary, goal, score, level, transactions, daily, incomeCategories, expenseCategories, analysis, activeDays } = data;

  // Pick the period data
  const periodData = summary?.[detailPeriod === "today" ? "today" : detailPeriod === "week" ? "week" : detailPeriod === "year" ? "year" : "month"];
  const totalData = summary?.total;

  return (
    <div dir="rtl" className="space-y-4">
      {/* Back + user header */}
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="p-2 rounded-xl hover:bg-white/10 border border-border">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1 min-w-0">
          <h2 className="font-black text-base truncate">{user.name ?? "ناشناس"}</h2>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Phone className="w-3 h-3" />
            <span dir="ltr">{user.phone}</span>
          </div>
        </div>
        <div className="text-left shrink-0">
          <p className="text-xs text-muted-foreground">سطح {level?.level}</p>
          <p className="text-xs font-bold text-violet-400">{level?.title}</p>
          <p className="text-xs text-muted-foreground">{formatNum(score)} امتیاز</p>
        </div>
      </div>

      {/* Period tabs */}
      <PeriodTabs value={detailPeriod} onChange={setDetailPeriod} />

      {/* Period summary cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-emerald-500/10 border-emerald-500/20 p-2.5">
          <p className="text-xs text-muted-foreground mb-1">درآمد {PERIOD_LABELS[detailPeriod]}</p>
          <p className="font-black text-sm text-emerald-400">{formatNum(periodData?.income ?? 0)}<span className="text-xs font-normal mr-0.5">ت</span></p>
        </div>
        <div className="rounded-xl border bg-red-500/10 border-red-500/20 p-2.5">
          <p className="text-xs text-muted-foreground mb-1">هزینه {PERIOD_LABELS[detailPeriod]}</p>
          <p className="font-black text-sm text-red-400">{formatNum(periodData?.expense ?? 0)}<span className="text-xs font-normal mr-0.5">ت</span></p>
        </div>
        <div className={`rounded-xl border p-2.5 ${(periodData?.remaining ?? 0) >= 0 ? "bg-emerald-500/10 border-emerald-500/20" : "bg-red-500/10 border-red-500/20"}`}>
          <p className="text-xs text-muted-foreground mb-1">باقیمانده</p>
          <p className={`font-black text-sm ${(periodData?.remaining ?? 0) >= 0 ? "text-emerald-400" : "text-red-400"}`}>{formatNum(periodData?.remaining ?? 0)}<span className="text-xs font-normal mr-0.5">ت</span></p>
        </div>
      </div>

      {/* All-time stats row */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border bg-card border-border p-2.5">
          <p className="text-xs text-muted-foreground mb-1">درآمد کل</p>
          <p className="font-black text-sm text-foreground">{formatNum(totalData?.income ?? 0)}<span className="text-xs font-normal mr-0.5">ت</span></p>
        </div>
        <div className="rounded-xl border bg-card border-border p-2.5">
          <p className="text-xs text-muted-foreground mb-1">هزینه کل</p>
          <p className="font-black text-sm text-foreground">{formatNum(totalData?.expense ?? 0)}<span className="text-xs font-normal mr-0.5">ت</span></p>
        </div>
        <div className="rounded-xl border bg-card border-border p-2.5">
          <p className="text-xs text-muted-foreground mb-1">روزهای فعال</p>
          <p className="font-black text-sm text-foreground">{formatNum(activeDays)}</p>
        </div>
      </div>

      {/* Goal progress */}
      {goal?.target > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-xs text-muted-foreground mb-1">هدف درآمد ماهانه</p>
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span>{formatPrice(summary?.month?.income ?? 0)}</span>
            <span className="text-muted-foreground">از {formatPrice(goal.target)}</span>
          </div>
          <div className="h-2 bg-background rounded-full overflow-hidden">
            <div className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full" style={{ width: `${goal.progress}%` }} />
          </div>
          <p className="text-xs text-amber-400 mt-1">{goal.progress}٪</p>
        </div>
      )}

      {/* Line chart — monthly trend */}
      {daily?.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm font-bold mb-3">روند این ماه</p>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={daily}>
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v) => v.split("-").slice(2).join("")} />
              <YAxis tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
              <Tooltip formatter={(v: any) => formatPrice(v)} contentStyle={{ background: "#1a1228", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
              <Line type="monotone" dataKey="income" stroke="#34d399" strokeWidth={2} dot={false} name="درآمد" />
              <Line type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={2} dot={false} name="هزینه" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Category breakdown */}
      <div className="grid grid-cols-2 gap-3">
        {expenseCategories?.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-3">
            <p className="text-xs font-bold text-red-400 mb-2">هزینه‌ها (این ماه)</p>
            <div className="space-y-1.5">
              {expenseCategories.slice(0, 5).map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % 8] }} />
                  <p className="text-xs truncate flex-1">{c.name}</p>
                  <p className="text-xs font-bold">{c.percent}٪</p>
                </div>
              ))}
            </div>
          </div>
        )}
        {incomeCategories?.length > 0 && (
          <div className="bg-card rounded-xl border border-border p-3">
            <p className="text-xs font-bold text-emerald-400 mb-2">درآمدها (این ماه)</p>
            <div className="space-y-1.5">
              {incomeCategories.slice(0, 5).map((c: any, i: number) => (
                <div key={i} className="flex items-center gap-1.5">
                  <div className="w-2 h-2 rounded-full shrink-0" style={{ background: CHART_COLORS[i % 8] }} />
                  <p className="text-xs truncate flex-1">{c.name}</p>
                  <p className="text-xs font-bold">{c.percent}٪</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Smart analysis */}
      {analysis?.length > 0 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <p className="text-sm font-bold mb-2">تحلیل هوشمند</p>
          <div className="space-y-1.5">
            {analysis.map((msg: string, i: number) => (
              <p key={i} className="text-xs text-foreground/80 flex gap-2">
                <span className="text-primary">•</span> {msg}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Transactions table */}
      <div className="bg-card rounded-xl border border-border p-4">
        <p className="text-sm font-bold mb-3">ریز تراکنش‌ها ({transactions?.length ?? 0})</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-right pb-2">نوع</th>
                <th className="text-right pb-2">مبلغ</th>
                <th className="text-right pb-2">دسته</th>
                <th className="text-right pb-2">تاریخ</th>
              </tr>
            </thead>
            <tbody>
              {(transactions ?? []).slice(0, 100).map((tx: any) => (
                <tr key={tx.id} className="border-b border-border/50">
                  <td className="py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${tx.type === "income" ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                      {tx.type === "income" ? "درآمد" : "هزینه"}
                    </span>
                  </td>
                  <td className="py-1.5 font-bold">{formatNum(tx.amount)}</td>
                  <td className="py-1.5">{tx.categoryName}</td>
                  <td className="py-1.5 text-muted-foreground">{tx.date}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

export default function FinancialReports() {
  const { token } = useAuth();
  const [search, setSearch] = useState("");
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [sortBy, setSortBy] = useState<"income" | "expense" | "remaining" | "txCount">("income");
  const [period, setPeriod] = useState<Period>("month");

  const periodDates = useMemo(() => getPeriodDates(period), [period]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/admin/financial/summary"],
    queryFn: () => authFetch(token, "/api/admin/financial/summary"),
    enabled: !!token,
  });

  const { data: users = [], isLoading: usersLoading } = useQuery<any[]>({
    queryKey: ["/api/admin/financial/users", periodDates.from, periodDates.to],
    queryFn: () =>
      authFetch(token, `/api/admin/financial/users?from=${periodDates.from}&to=${periodDates.to}`),
    enabled: !!token,
  });

  const filtered = useMemo(() => {
    let list = [...(users ?? [])];
    if (search) {
      list = list.filter((u) => u.name?.includes(search) || u.phone?.includes(search));
    }
    list.sort((a, b) => (b[sortBy] ?? 0) - (a[sortBy] ?? 0));
    return list;
  }, [users, search, sortBy]);

  if (selectedUserId !== null) {
    return (
      <div className="p-4">
        <UserDetail userId={selectedUserId} token={token} onBack={() => setSelectedUserId(null)} />
      </div>
    );
  }

  return (
    <div dir="rtl" className="p-4 space-y-4">
      <div>
        <h1 className="text-xl font-black">گزارش درآمد و هزینه کاربران</h1>
        <p className="text-sm text-muted-foreground">تحلیل مالی کلیه کاربران</p>
      </div>

      {/* Global summary cards (all-time) */}
      {summaryLoading ? (
        <div className="flex justify-center py-6">
          <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <StatCard label="کاربران فعال" value={formatNum(summary.activeUsers)} icon={Users} color="bg-blue-500/20 text-blue-400" />
          <StatCard label="کل تراکنش‌ها" value={formatNum(summary.totalTransactions)} icon={Wallet} color="bg-violet-500/20 text-violet-400" />
          <StatCard label="مجموع درآمد" value={formatPrice(summary.totalIncome)} icon={TrendingUp} color="bg-emerald-500/20 text-emerald-400" />
          <StatCard label="مجموع هزینه" value={formatPrice(summary.totalExpense)} icon={TrendingDown} color="bg-red-500/20 text-red-400" />
          <StatCard label="مجموع باقیمانده" value={formatPrice(summary.totalRemaining)} icon={Star} color={summary.totalRemaining >= 0 ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"} />
          <StatCard label="میانگین درآمد/کاربر" value={formatPrice(summary.avgIncomePerUser)} icon={TrendingUp} color="bg-amber-500/20 text-amber-400" />
          <StatCard label="امروز تراکنش" value={formatNum(summary.todayTransactions)} icon={Wallet} color="bg-purple-500/20 text-purple-400" />
          <StatCard label="پرهزینه‌ترین دسته" value={summary.topExpenseCategory || "—"} icon={TrendingDown} color="bg-red-500/20 text-red-400" />
        </div>
      )}

      {/* Period filter + Search + Sort */}
      <div className="space-y-2">
        {/* Period tabs */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <PeriodTabs value={period} onChange={(p) => { setPeriod(p); setSortBy("income"); }} />
          <p className="text-xs text-muted-foreground">
            نمایش داده‌های <span className="font-bold text-primary">{PERIOD_LABELS[period]}</span>
          </p>
        </div>

        {/* Search + sort */}
        <div className="flex gap-2 flex-wrap">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="جستجو نام یا موبایل..."
              className="w-full bg-card border border-border rounded-xl pr-10 pl-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="bg-card border border-border rounded-xl px-3 py-2 text-sm focus:outline-none"
          >
            <option value="income">مرتب: درآمد</option>
            <option value="expense">مرتب: هزینه</option>
            <option value="remaining">مرتب: باقیمانده</option>
            <option value="txCount">مرتب: تعداد تراکنش</option>
          </select>
        </div>
      </div>

      {/* Users table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {usersLoading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-center text-muted-foreground py-12 text-sm">
            {search ? "کاربری با این مشخصات پیدا نشد" : `در بازه «${PERIOD_LABELS[period]}» هیچ تراکنشی ثبت نشده`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/30">
                <tr className="border-b border-border text-muted-foreground text-xs">
                  <th className="text-right px-3 py-2.5">کاربر</th>
                  <th className="text-right px-3 py-2.5">تراکنش</th>
                  <th className="text-right px-3 py-2.5">
                    درآمد <span className="text-primary/70">({PERIOD_LABELS[period]})</span>
                  </th>
                  <th className="text-right px-3 py-2.5">
                    هزینه <span className="text-primary/70">({PERIOD_LABELS[period]})</span>
                  </th>
                  <th className="text-right px-3 py-2.5">
                    باقیمانده <span className="text-primary/70">({PERIOD_LABELS[period]})</span>
                  </th>
                  <th className="text-right px-3 py-2.5">سطح</th>
                  <th className="text-right px-3 py-2.5">آخرین فعالیت</th>
                  <th className="px-3 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((u: any) => (
                  <tr key={u.userId} className="border-b border-border/50 hover:bg-muted/20 transition-colors">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                        <div>
                          <p className="font-medium text-sm">{u.name}</p>
                          <div className="flex items-center gap-1 text-xs text-muted-foreground">
                            <Phone className="w-3 h-3" />
                            <span dir="ltr">{u.phone}</span>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-xs">{formatNum(u.txCount)}</td>
                    <td className="px-3 py-2.5 text-emerald-400 font-bold text-xs">{formatPrice(u.income)}</td>
                    <td className="px-3 py-2.5 text-red-400 font-bold text-xs">{formatPrice(u.expense)}</td>
                    <td className={`px-3 py-2.5 font-bold text-xs ${u.remaining >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                      {formatPrice(u.remaining)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="text-xs text-violet-400 font-bold">{LEVEL_TITLES[u.level] ?? "—"}</span>
                    </td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{u.lastActivity ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => setSelectedUserId(u.userId)}
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-primary/15 text-primary text-xs font-bold hover:bg-primary/25 transition-colors"
                      >
                        جزئیات
                        <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
