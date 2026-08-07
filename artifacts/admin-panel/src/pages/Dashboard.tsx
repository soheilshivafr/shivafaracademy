import { useEffect, useState } from "react";
import { Link } from "wouter";
import { get } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  BookOpen, ShoppingBag, Users, Video, CreditCard, TrendingUp, UserCheck,
  Flame, AlertCircle, ArrowLeft, Target, ChevronDown, ChevronUp,
  Activity, Eye, Globe, UserPlus, Smartphone, Package,
} from "lucide-react";

interface BuyerRow { id: number; title: string; buyerCount: number; }

interface Stats {
  courses: number; products: number; users: number;
  reels: number; orders: number; revenue: number;
  usersWithPurchases: number;
  courseBuyers: BuyerRow[];
  productBuyers: BuyerRow[];
}
interface Order {
  id: number; userId: number; itemType: string; itemId: number;
  amount: number; status: string; createdAt: string;
}
interface HotLead {
  userId: number; userName: string | null; userPhone: string | null;
  lastInterestedProduct: string | null; updatedAt: string;
}
interface LeadStats {
  statusCounts: Record<string, number>;
  newAdvisorRequests: number;
  hotLeads: HotLead[];
  totalLeads: number;
  conversionRate: number;
}

type Period = "day" | "week" | "month" | "year";
interface PeriodStats { total: number; unique: number; }
interface CountStats { day: number; week: number; month: number; year: number; }

interface AnalyticsData {
  onlineUsers: number;
  pageviews: Record<Period, PeriodStats>;
  pwaInstalls: CountStats;
  apkInstalls: CountStats;
  newUsers: CountStats;
  pageStats: Record<string, Record<Period, PeriodStats>>;
}

function toPersianDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
}
function formatMoney(n: number) {
  return n.toLocaleString("fa-IR") + " تومان";
}
function pNum(n: number) { return n.toLocaleString("fa-IR"); }

const STAT_CARDS = [
  { key: "courses"            as const, label: "دوره‌ها",        icon: BookOpen,   color: "bg-blue-500",    permission: "courses"           },
  { key: "products"           as const, label: "محصولات",        icon: ShoppingBag, color: "bg-purple-500", permission: "products"          },
  { key: "users"              as const, label: "کل کاربران",     icon: Users,      color: "bg-green-500",   permission: "users"             },
  { key: "usersWithPurchases" as const, label: "کاربران خریدار", icon: UserCheck,  color: "bg-teal-500",    permission: "users"             },
  { key: "reels"              as const, label: "ریلز",           icon: Video,      color: "bg-pink-500",    permission: "reels"             },
  { key: "orders"             as const, label: "سفارشات",        icon: CreditCard, color: "bg-orange-500",  permission: "orders"            },
  { key: "revenue"            as const, label: "درآمد",          icon: TrendingUp, color: "bg-emerald-500", permission: "financial-reports" },
];

const FUNNEL_STAGES = [
  { key: "cold",       label: "سرد",      color: "bg-slate-100 text-slate-700",   bar: "bg-slate-400",   pct_color: "text-slate-500"  },
  { key: "warm",       label: "ولرم",     color: "bg-yellow-100 text-yellow-800", bar: "bg-yellow-400",  pct_color: "text-yellow-600" },
  { key: "hot",        label: "🔥 داغ",   color: "bg-orange-100 text-orange-800", bar: "bg-orange-500",  pct_color: "text-orange-600" },
  { key: "customer",   label: "مشتری",   color: "bg-green-100 text-green-800",   bar: "bg-green-500",   pct_color: "text-green-600"  },
  { key: "vip",        label: "⭐ VIP",   color: "bg-purple-100 text-purple-800", bar: "bg-purple-500",  pct_color: "text-purple-600" },
  { key: "ambassador", label: "👑 سفیر",  color: "bg-amber-100 text-amber-800",   bar: "bg-amber-500",   pct_color: "text-amber-600"  },
];

const PERIOD_LABELS: Record<Period, string> = {
  day: "روزانه", week: "هفتگی", month: "ماهیانه", year: "سالیانه",
};
const PERIODS: Period[] = ["day", "week", "month", "year"];

const PAGE_LABELS: Record<string, string> = {
  reels: "ریل",
  podcast: "پادکست",
  tools: "ابزارها",
  channel: "کانال",
  products: "محصولات",
  tribe: "قبیله",
  "my-courses": "دوره‌های من",
  "my-products": "محصولات من",
  courses: "دوره‌ها",
};

function BuyerTable({ rows, total, label }: { rows: BuyerRow[]; total: number; label: string }) {
  if (!rows.length) return (
    <p className="text-muted-foreground text-sm p-4 text-center">{label} یافت نشد</p>
  );
  return (
    <div className="divide-y divide-border">
      {rows.map((r) => {
        const pct = total > 0 ? Math.round((r.buyerCount / total) * 100) : 0;
        return (
          <div key={r.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.title}</p>
              <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden w-full">
                <div className="h-full bg-primary rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
            <div className="text-left shrink-0">
              <span className="text-base font-bold">{pNum(r.buyerCount)}</span>
              <span className="text-xs text-muted-foreground mr-1">نفر</span>
            </div>
            <span className="text-xs text-muted-foreground w-9 text-left shrink-0">{pct}٪</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Analytics Section ───────────────────────────────────────────────────────

/** ردیف بازدید صفحه — با قابلیت باز/بسته شدن برای محصولات و دوره‌ها */
function PageStatRow({
  slug, label, ps, period, expandable, items, itemsLoading,
}: {
  slug: string;
  label: string;
  ps: { total: number; unique: number } | undefined;
  period: Period;
  expandable?: boolean;
  items?: ItemStat[];
  itemsLoading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const total = ps?.total ?? 0;
  const unique = ps?.unique ?? 0;

  return (
    <div>
      <div
        className={`flex items-center justify-between px-4 py-2.5 transition-colors ${expandable ? "cursor-pointer hover:bg-muted/50 select-none" : "hover:bg-muted/30"}`}
        onClick={expandable ? () => setOpen(o => !o) : undefined}
      >
        <div className="flex items-center gap-1.5">
          {expandable && (
            <span className="text-muted-foreground transition-transform duration-200" style={{ display: "inline-block", transform: open ? "rotate(0deg)" : "rotate(-90deg)" }}>
              <ChevronDown size={14} />
            </span>
          )}
          <span className="text-sm font-medium">{label}</span>
          {expandable && items && items.length > 0 && (
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-medium">{items.length}</span>
          )}
        </div>
        <div className="flex items-center gap-4 text-xs">
          <span className="text-muted-foreground">کل: <span className="font-bold text-foreground">{pNum(total)}</span></span>
          <span className="text-muted-foreground">یکتا: <span className="font-bold text-foreground">{pNum(unique)}</span></span>
        </div>
      </div>

      {/* زیرسطرهای آیتم‌های جزئی */}
      {expandable && open && (
        <div className="bg-muted/20 border-t border-border/50">
          {itemsLoading && (
            <div className="flex items-center justify-center py-4 gap-2">
              <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
              <span className="text-xs text-muted-foreground">در حال بارگذاری...</span>
            </div>
          )}
          {!itemsLoading && (!items || items.length === 0) && (
            <p className="text-xs text-muted-foreground text-center py-4">داده‌ای یافت نشد</p>
          )}
          {!itemsLoading && items && items.length > 0 && (
            <div className="divide-y divide-border/40">
              {items.map((item, i) => (
                <div key={item.id ?? i} className="flex items-center justify-between px-6 py-2 hover:bg-muted/30 transition-colors">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs text-muted-foreground font-mono w-5 shrink-0">{i + 1}</span>
                    <span className="text-xs font-medium truncate max-w-[160px]" title={item.title}>{item.title}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs shrink-0">
                    <span className="text-muted-foreground">کل: <span className="font-bold text-foreground">{pNum(item.total)}</span></span>
                    <span className="text-muted-foreground">یکتا: <span className="font-bold text-foreground">{pNum(item.unique)}</span></span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AnalyticsSection() {
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<Period>("day");
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [itemsData, setItemsData] = useState<ItemsData | null>(null);
  const [itemsLoading, setItemsLoading] = useState(false);

  useEffect(() => {
    if (!open || data) return;
    setLoading(true);
    get<AnalyticsData>("/admin/analytics")
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, [open]);

  // بارگذاری آمار آیتم‌ها هر بار که بازه زمانی عوض می‌شه
  useEffect(() => {
    if (!open) return;
    setItemsLoading(true);
    setItemsData(null);
    get<ItemsData>(`/admin/analytics/items?period=${period}`)
      .then(setItemsData)
      .catch(() => {})
      .finally(() => setItemsLoading(false));
  }, [open, period]);

  const pv = data?.pageviews[period];

  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Activity size={16} className="text-primary" />
          <h2 className="font-bold text-sm">آمار و گزارشات</h2>
          {data && (
            <span className="bg-green-100 text-green-700 text-xs px-2 py-0.5 rounded-full font-medium">
              {pNum(data.onlineUsers)} آنلاین
            </span>
          )}
        </div>
        {open ? <ChevronUp size={16} className="text-muted-foreground" /> : <ChevronDown size={16} className="text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t border-border">
          {loading && (
            <div className="flex justify-center py-10">
              <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
          {error && (
            <p className="text-sm text-muted-foreground text-center py-6">خطا در دریافت آمار</p>
          )}
          {data && (
            <div className="p-4 space-y-5">
              {/* انتخاب بازه زمانی */}
              <div className="flex gap-1 bg-muted rounded-lg p-0.5 w-fit">
                {PERIODS.map(p => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${period === p ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>

              {/* کارت‌های خلاصه */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Globe size={14} className="text-green-600" />
                    <span className="text-xs text-green-700 font-medium">کاربران آنلاین</span>
                  </div>
                  <p className="text-2xl font-bold text-green-800">{pNum(data.onlineUsers)}</p>
                  <p className="text-xs text-green-600 mt-0.5">در ۵ دقیقه اخیر</p>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Eye size={14} className="text-blue-600" />
                    <span className="text-xs text-blue-700 font-medium">بازدید کل</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-800">{pNum(pv?.total ?? 0)}</p>
                  <p className="text-xs text-blue-600 mt-0.5">{PERIOD_LABELS[period]}</p>
                </div>
                <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users size={14} className="text-purple-600" />
                    <span className="text-xs text-purple-700 font-medium">بازدید یکتا</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-800">{pNum(pv?.unique ?? 0)}</p>
                  <p className="text-xs text-purple-600 mt-0.5">{PERIOD_LABELS[period]}</p>
                </div>
                <div className="bg-rose-50 border border-rose-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <UserPlus size={14} className="text-rose-600" />
                    <span className="text-xs text-rose-700 font-medium">کاربر جدید</span>
                  </div>
                  <p className="text-2xl font-bold text-rose-800">{pNum(data.newUsers[period] ?? 0)}</p>
                  <p className="text-xs text-rose-600 mt-0.5">{PERIOD_LABELS[period]}</p>
                </div>
                <div className="bg-sky-50 border border-sky-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Smartphone size={14} className="text-sky-600" />
                    <span className="text-xs text-sky-700 font-medium">نصب PWA</span>
                  </div>
                  <p className="text-2xl font-bold text-sky-800">{pNum(data.pwaInstalls[period] ?? 0)}</p>
                  <p className="text-xs text-sky-600 mt-0.5">{PERIOD_LABELS[period]}</p>
                </div>
                <div className="bg-orange-50 border border-orange-200 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Package size={14} className="text-orange-600" />
                    <span className="text-xs text-orange-700 font-medium">نصب APK</span>
                  </div>
                  <p className="text-2xl font-bold text-orange-800">{pNum(data.apkInstalls[period] ?? 0)}</p>
                  <p className="text-xs text-orange-600 mt-0.5">{PERIOD_LABELS[period]}</p>
                </div>
              </div>

              {/* بازدید هر صفحه — محصولات و دوره‌ها باز/بسته‌شونده هستن */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-2">بازدید هر صفحه — {PERIOD_LABELS[period]}</p>
                <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
                  {Object.entries(PAGE_LABELS).map(([slug, label]) => {
                    const ps = data.pageStats[slug]?.[period];
                    const isProducts = slug === "products";
                    const isCourses  = slug === "courses";
                    const expandable = isProducts || isCourses;
                    const items = isProducts
                      ? itemsData?.products
                      : isCourses
                      ? itemsData?.courses
                      : undefined;
                    return (
                      <PageStatRow
                        key={slug}
                        slug={slug}
                        label={label}
                        ps={ps}
                        period={period}
                        expandable={expandable}
                        items={items}
                        itemsLoading={expandable ? itemsLoading : false}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
export default function Dashboard() {
  const { isSuperAdmin, hasPermission, admin } = useAuth();
  const [stats, setStats]         = useState<Stats | null>(null);
  const [orders, setOrders]       = useState<Order[]>([]);
  const [leadStats, setLeadStats] = useState<LeadStats | null>(null);
  const [loading, setLoading]     = useState(true);
  const [buyersTab, setBuyersTab] = useState<"courses" | "products">("courses");

  const canSeeLeads   = hasPermission("advisor-requests") || hasPermission("chatbot");
  const canSeeOrders  = hasPermission("orders");
  const canSeeBuyers  = hasPermission("courses") || hasPermission("products");
  const visibleCards  = STAT_CARDS.filter(c => hasPermission(c.permission));

  useEffect(() => {
    const promises: Promise<unknown>[] = [get<Stats>("/admin/stats")];
    if (canSeeOrders) promises.push(get<Order[]>("/admin/orders"));
    if (canSeeLeads)  promises.push(get<LeadStats>("/admin/leads/stats").catch(() => null));

    Promise.allSettled(promises).then(results => {
      const s = (results[0] as PromiseFulfilledResult<Stats>).value;
      setStats(s ?? null);
      if (canSeeOrders && results[1]) {
        const o = (results[1] as PromiseFulfilledResult<Order[]>).value;
        setOrders((o ?? []).slice(0, 10));
      }
      if (canSeeLeads) {
        const lsIdx = canSeeOrders ? 2 : 1;
        if (results[lsIdx]) {
          const ls = (results[lsIdx] as PromiseFulfilledResult<LeadStats | null>).value;
          setLeadStats(ls);
        }
      }
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex justify-center py-20">
      <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );

  const buyerRows  = buyersTab === "courses" ? (stats?.courseBuyers ?? []) : (stats?.productBuyers ?? []);
  const buyerTotal = stats?.users ?? 0;
  const totalLeads = leadStats?.totalLeads ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">داشبورد</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {isSuperAdmin ? "خلاصه‌ای از وضعیت سایت" : `خوش آمدید، ${admin?.username}`}
        </p>
      </div>

      {canSeeLeads && leadStats && leadStats.newAdvisorRequests > 0 && (
        <Link href="/advisor-requests">
          <div className="bg-orange-50 border border-orange-200 rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer hover:bg-orange-100 transition-colors">
            <AlertCircle size={18} className="text-orange-500 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-orange-800">
                {pNum(leadStats.newAdvisorRequests)} درخواست مشاور جدید منتظر پیگیری
              </p>
              <p className="text-xs text-orange-600 mt-0.5">کاربران درخواست تماس با مشاور داده‌اند</p>
            </div>
            <ArrowLeft size={16} className="text-orange-400 shrink-0" />
          </div>
        </Link>
      )}

      {visibleCards.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {visibleCards.map(({ key, label, icon: Icon, color }) => (
            <div key={key} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-muted-foreground text-xs mb-1">{label}</p>
                <p className="text-2xl font-bold">
                  {key === "revenue"
                    ? formatMoney(stats?.revenue ?? 0)
                    : pNum((stats as Record<string, number> | null)?.[key] ?? 0)}
                </p>
                {key === "usersWithPurchases" && stats && (
                  <p className="text-xs text-muted-foreground mt-0.5">
                    از {pNum(stats.users)} کاربر ({stats.users > 0 ? Math.round((stats.usersWithPurchases / stats.users) * 100) : 0}٪)
                  </p>
                )}
              </div>
              <div className={`w-11 h-11 rounded-xl ${color} flex items-center justify-center text-white shrink-0`}>
                <Icon size={20} />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isSuperAdmin && visibleCards.length === 0 && (
        <div className="bg-card rounded-xl border border-border p-8 text-center">
          <p className="text-muted-foreground text-sm">از منوی سمت راست به بخش‌های مجاز دسترسی داشته باشید</p>
        </div>
      )}

      {isSuperAdmin && <AnalyticsSection />}

      {canSeeLeads && leadStats && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-primary" />
              <h2 className="font-bold text-sm">قیف فروش</h2>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{pNum(totalLeads)} lead</span>
              {leadStats.conversionRate > 0 && (
                <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">
                  نرخ تبدیل {leadStats.conversionRate}٪
                </span>
              )}
            </div>
          </div>

          {totalLeads === 0 ? (
            <p className="text-muted-foreground text-sm p-6 text-center">
              هنوز هیچ lead‌ای ثبت نشده — وقتی کاربران چت کنند، اینجا نمایش داده می‌شود
            </p>
          ) : (
            <div className="p-4 space-y-2.5">
              {FUNNEL_STAGES.map(({ key, label, color: stageBg, bar, pct_color }) => {
                const count = leadStats.statusCounts[key] ?? 0;
                const pct = totalLeads > 0 ? Math.round((count / totalLeads) * 100) : 0;
                return (
                  <Link key={key} href={`/users?stage=${key}`}>
                    <div className="flex items-center gap-3 -mx-1 px-1 py-0.5 rounded-lg hover:bg-muted/40 transition-colors cursor-pointer">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full w-20 text-center shrink-0 ${stageBg}`}>
                        {label}
                      </span>
                      <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-700 ${bar}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="text-sm font-bold w-8 text-left shrink-0">{pNum(count)}</span>
                      <span className={`text-xs w-9 text-left shrink-0 ${pct_color}`}>{pct}٪</span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}

          {leadStats.hotLeads.length > 0 && (
            <>
              <div className="px-4 pb-1 pt-1 border-t border-border flex items-center gap-2">
                <Flame size={14} className="text-orange-500" />
                <p className="text-xs font-semibold text-orange-700">leads داغ — نیاز به پیگیری</p>
              </div>
              <div className="divide-y divide-border">
                {leadStats.hotLeads.map(lead => (
                  <div key={lead.userId} className="flex items-center justify-between px-4 py-2.5">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{lead.userName ?? "بدون نام"}</p>
                      <p className="text-xs text-muted-foreground">{lead.userPhone}</p>
                      {lead.lastInterestedProduct && (
                        <p className="text-xs text-orange-600 mt-0.5">علاقه‌مند به: {lead.lastInterestedProduct}</p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0 mr-3">{toPersianDate(lead.updatedAt)}</span>
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t border-border">
                <Link href="/advisor-requests">
                  <span className="text-xs text-primary hover:underline cursor-pointer">مشاهده همه درخواست‌های مشاور ←</span>
                </Link>
              </div>
            </>
          )}
        </div>
      )}

      {canSeeBuyers && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border flex items-center justify-between gap-3">
            <h2 className="font-bold text-sm">تفکیک خریداران</h2>
            <div className="flex gap-1 bg-muted rounded-lg p-0.5">
              {hasPermission("courses") && (
                <button
                  onClick={() => setBuyersTab("courses")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${buyersTab === "courses" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  دوره‌ها
                </button>
              )}
              {hasPermission("products") && (
                <button
                  onClick={() => setBuyersTab("products")}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${buyersTab === "products" ? "bg-card shadow text-foreground" : "text-muted-foreground hover:text-foreground"}`}
                >
                  محصولات
                </button>
              )}
            </div>
          </div>
          <BuyerTable rows={buyerRows} total={buyerTotal} label={buyersTab === "courses" ? "دوره" : "محصول"} />
        </div>
      )}

      {canSeeOrders && (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <div className="px-4 py-3 border-b border-border">
            <h2 className="font-bold text-sm">سفارشات اخیر</h2>
          </div>
          {orders.length === 0 ? (
            <p className="text-muted-foreground text-sm p-6 text-center">سفارشی یافت نشد</p>
          ) : (
            <div className="divide-y divide-border">
              {orders.map(o => (
                <div key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
                  <div>
                    <span className="font-medium">سفارش #{o.id}</span>
                    <span className="text-muted-foreground mx-2">·</span>
                    <span className="text-muted-foreground">{o.itemType === "course" ? "دوره" : "محصول"} #{o.itemId}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs">{toPersianDate(o.createdAt)}</span>
                    <span className="font-medium">{formatMoney(o.amount)}</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      o.status === "paid" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
                    }`}>
                      {o.status === "paid" ? "پرداخت شده" : "در انتظار"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
