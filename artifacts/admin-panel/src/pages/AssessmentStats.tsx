import { useState } from "react";
import { useParams } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { get } from "@/lib/api";
import { Link } from "wouter";
import {
  ChevronRight, Brain, Users, UserX, Target, TrendingUp, Loader2,
  PhoneCall, Download, Sparkles, BarChart2, CheckCircle2, AlertCircle,
  CalendarDays, DollarSign,
} from "lucide-react";
import { Button } from "@/components/ui/button";

function apiGet(path: string) { return get(path); }

// ─── Types ───────────────────────────────────────────────────────────────────
interface Stats {
  total: number;
  completed: number;
  abandoned: number;
  completionRate: number;
  leadCount: number;
  aiReportsPurchased: number;
  aiRevenue: number;
  participantCount: number;
  indexAverages: { indexId: number; name: string; avgScore: number; respondents: number }[];
  scoreDistribution: { bucket: string; count: number; pct: number }[];
  dailyTrend: { date: string; count: number }[];
  answerFrequency: {
    questionId: number;
    title: string;
    options: { label: string; count: number; pct: number }[];
  }[];
}

interface Session {
  id: number;
  userId?: number;
  userName?: string;
  userPhone?: string;
  guestPhone?: string;
  startedAt: string;
  completedAt?: string;
  aiReportPurchased: boolean;
  totalLeadScoreImpact: number;
}

interface Lead {
  id: number;
  name: string;
  phone: string;
  createdAt: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
function StatCard({
  label, value, sub, icon: Icon, color = "text-foreground",
}: {
  label: string; value: string | number; sub?: string;
  icon?: React.FC<{ className?: string }>;
  color?: string;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex items-start justify-between mb-1">
        <p className="text-xs text-muted-foreground">{label}</p>
        {Icon && <Icon className="w-4 h-4 text-muted-foreground opacity-60" />}
      </div>
      <p className={`text-2xl font-black ${color}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

function ScoreBar({ name, score }: { name: string; score: number }) {
  const color =
    score >= 70 ? "bg-green-500" : score >= 40 ? "bg-primary" : "bg-red-500";
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1">
        <span className="text-sm text-foreground">{name}</span>
        <span className="text-sm font-bold">{score}٪</span>
      </div>
      <div className="h-2 bg-muted rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${color} transition-all duration-700`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}

function MiniBar({ count, max, label, pct }: { count: number; max: number; label: string; pct: number }) {
  return (
    <div className="flex items-center gap-3 mb-2">
      <span className="text-xs text-muted-foreground w-16 text-left flex-shrink-0">{label}</span>
      <div className="flex-1 h-5 bg-muted rounded overflow-hidden relative">
        <div
          className="h-full bg-primary/70 transition-all duration-700 rounded"
          style={{ width: max > 0 ? `${(count / max) * 100}%` : "0%" }}
        />
        <span className="absolute inset-0 flex items-center pr-2 text-xs font-medium text-foreground">
          {count > 0 ? `${count} (${pct}٪)` : ""}
        </span>
      </div>
    </div>
  );
}

// ─── Persian date helper ──────────────────────────────────────────────────────
function toJalaliShort(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("fa-IR", { month: "2-digit", day: "2-digit" });
  } catch { return iso.slice(5, 10); }
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function AssessmentStats() {
  const { id: rawId } = useParams<{ id: string }>();
  const id = parseInt(rawId ?? "0");

  const [tab, setTab] = useState<"overview" | "sessions" | "leads" | "answers">("overview");

  const { data: stats, isLoading } = useQuery<Stats>({
    queryKey: ["/admin/assessments/stats", id],
    queryFn: () => apiGet(`/admin/assessments/${id}/stats`),
    enabled: !isNaN(id),
  });

  const { data: sessions = [] } = useQuery<Session[]>({
    queryKey: ["/admin/assessments/sessions", id],
    queryFn: () => apiGet(`/admin/assessments/${id}/sessions`),
    enabled: !isNaN(id) && tab === "sessions",
  });

  const { data: leads = [] } = useQuery<Lead[]>({
    queryKey: ["/admin/assessments/leads", id],
    queryFn: () => apiGet(`/admin/assessments/${id}/leads`),
    enabled: !isNaN(id) && tab === "leads",
  });

  function exportLeads() {
    window.open(`/api/admin/assessments/${id}/leads/export`, "_blank");
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const s = stats;
  const maxDaily = Math.max(...(s?.dailyTrend ?? []).map((d) => d.count), 1);

  return (
    <div dir="rtl" className="max-w-4xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/assessments">
          <button className="p-2 rounded-lg hover:bg-muted transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </Link>
        <div>
          <h1 className="text-xl font-black flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            آمار تست
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">شناسه: #{id}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/50 rounded-xl p-1 mb-6 w-fit">
        {([
          { key: "overview", label: "مرور کلی" },
          { key: "answers",  label: "تحلیل پاسخ‌ها" },
          { key: "sessions", label: "جلسات" },
          { key: "leads",    label: `لیدها (${s?.leadCount ?? 0})` },
        ] as const).map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
              tab === key
                ? "bg-card shadow text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── Overview Tab ── */}
      {tab === "overview" && (
        <div className="space-y-6">
          {/* Primary stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="کل بازدیدکنندگان"
              value={(s?.total ?? 0).toLocaleString("fa")}
              icon={Users}
            />
            <StatCard
              label="تکمیل‌شده"
              value={(s?.completed ?? 0).toLocaleString("fa")}
              sub={`${s?.completionRate ?? 0}٪ نرخ تکمیل`}
              icon={CheckCircle2}
              color="text-green-400"
            />
            <StatCard
              label="رها شده"
              value={(s?.abandoned ?? 0).toLocaleString("fa")}
              icon={UserX}
              color="text-red-400"
            />
            <StatCard
              label="لیدهای جمع‌آوری‌شده"
              value={(s?.leadCount ?? 0).toLocaleString("fa")}
              icon={PhoneCall}
              color="text-primary"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="گزارش AI فروخته‌شده"
              value={(s?.aiReportsPurchased ?? 0).toLocaleString("fa")}
              icon={Sparkles}
              color="text-violet-400"
            />
            <StatCard
              label="درآمد گزارش AI"
              value={`${(s?.aiRevenue ?? 0).toLocaleString("fa")} ت`}
              icon={DollarSign}
              color="text-emerald-400"
            />
            <StatCard
              label="نرخ تکمیل"
              value={`${s?.completionRate ?? 0}٪`}
              icon={Target}
              color={
                (s?.completionRate ?? 0) >= 70
                  ? "text-green-400"
                  : (s?.completionRate ?? 0) >= 40
                  ? "text-amber-400"
                  : "text-red-400"
              }
            />
            <StatCard
              label="کل شرکت‌کنندگان"
              value={(s?.participantCount ?? 0).toLocaleString("fa")}
              icon={BarChart2}
            />
          </div>

          {/* Daily trend */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-primary" />
              تکمیل روزانه — ۱۴ روز اخیر
            </h2>
            <div className="flex items-end gap-1.5 h-24">
              {(s?.dailyTrend ?? []).map((d) => (
                <div key={d.date} className="flex-1 flex flex-col items-center gap-1">
                  <span className="text-[10px] text-muted-foreground">
                    {d.count > 0 ? d.count : ""}
                  </span>
                  <div
                    className="w-full rounded-t bg-primary/70 transition-all duration-500 min-h-[2px]"
                    style={{ height: `${maxDaily > 0 ? Math.max(4, (d.count / maxDaily) * 80) : 4}px` }}
                    title={`${d.date}: ${d.count}`}
                  />
                  <span className="text-[9px] text-muted-foreground hidden sm:block">
                    {toJalaliShort(d.date)}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Score distribution */}
          {(s?.scoreDistribution ?? []).some((b) => b.count > 0) && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <BarChart2 className="w-4 h-4 text-primary" />
                توزیع امتیاز کلی
              </h2>
              {(s?.scoreDistribution ?? []).map((b) => (
                <MiniBar
                  key={b.bucket}
                  label={b.bucket + "٪"}
                  count={b.count}
                  max={s?.completed ?? 1}
                  pct={b.pct}
                />
              ))}
            </div>
          )}

          {/* Index averages */}
          {(s?.indexAverages ?? []).length > 0 && (
            <div className="bg-card border border-border rounded-xl p-5">
              <h2 className="text-sm font-bold text-foreground mb-4 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
                میانگین شاخص‌ها
              </h2>
              {(s?.indexAverages ?? []).map((idx) => (
                <ScoreBar key={idx.indexId} name={idx.name} score={idx.avgScore} />
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Answers Tab ── */}
      {tab === "answers" && (
        <div className="space-y-4">
          {(s?.answerFrequency ?? []).length === 0 ? (
            <div className="text-center py-16 text-muted-foreground">
              <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p>داده‌ای برای نمایش وجود ندارد</p>
            </div>
          ) : (
            (s?.answerFrequency ?? []).map((q) => {
              const maxCount = Math.max(...q.options.map((o) => o.count), 1);
              return (
                <div key={q.questionId} className="bg-card border border-border rounded-xl p-5">
                  <p className="text-sm font-bold text-foreground mb-4 leading-relaxed">
                    {q.title}
                  </p>
                  {q.options.map((opt) => (
                    <div key={opt.label} className="mb-2">
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-foreground">{opt.label}</span>
                        <span className="text-xs text-muted-foreground font-medium">
                          {opt.count} ({opt.pct}٪)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary/70 rounded-full"
                          style={{
                            width: `${maxCount > 0 ? (opt.count / maxCount) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Sessions Tab ── */}
      {tab === "sessions" && (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <h2 className="text-sm font-bold text-foreground">
              جلسات ({sessions.length})
            </h2>
          </div>
          {sessions.length === 0 ? (
            <div className="py-12 text-center text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-right p-3 text-muted-foreground font-medium">کاربر</th>
                    <th className="text-right p-3 text-muted-foreground font-medium">وضعیت</th>
                    <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">Lead Score</th>
                    <th className="text-right p-3 text-muted-foreground font-medium hidden md:table-cell">تاریخ</th>
                  </tr>
                </thead>
                <tbody>
                  {sessions.map((s) => (
                    <tr key={s.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                      <td className="p-3 font-medium">
                        {s.userName || s.userPhone || s.guestPhone || (
                          <span className="text-muted-foreground text-xs">ناشناس</span>
                        )}
                      </td>
                      <td className="p-3">
                        {s.completedAt ? (
                          <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            تکمیل
                            {s.aiReportPurchased && (
                              <span className="bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded text-xs mr-1">
                                AI
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-red-400 text-xs">
                            <UserX className="w-3.5 h-3.5" />
                            رها
                          </span>
                        )}
                      </td>
                      <td className="p-3 hidden md:table-cell">
                        {(s.totalLeadScoreImpact ?? 0) !== 0 && (
                          <span
                            className={`flex items-center gap-1 text-xs font-bold ${
                              (s.totalLeadScoreImpact ?? 0) > 0 ? "text-green-400" : "text-red-400"
                            }`}
                          >
                            <TrendingUp className="w-3 h-3" />
                            {(s.totalLeadScoreImpact ?? 0) > 0 ? "+" : ""}
                            {s.totalLeadScoreImpact}
                          </span>
                        )}
                      </td>
                      <td className="p-3 text-muted-foreground text-xs hidden md:table-cell">
                        {new Date(s.startedAt).toLocaleDateString("fa-IR")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Leads Tab ── */}
      {tab === "leads" && (
        <div>
          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <h2 className="text-sm font-bold text-foreground">
                لیدها ({leads.length})
              </h2>
              {leads.length > 0 && (
                <Button variant="outline" size="sm" onClick={exportLeads} className="flex items-center gap-2">
                  <Download className="w-4 h-4" />
                  خروجی CSV
                </Button>
              )}
            </div>

            {leads.length === 0 ? (
              <div className="py-12 text-center text-muted-foreground">
                <PhoneCall className="w-8 h-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">هنوز لیدی جمع‌آوری نشده</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-right p-3 text-muted-foreground font-medium">نام</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">موبایل</th>
                      <th className="text-right p-3 text-muted-foreground font-medium">تاریخ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} className="border-b border-border last:border-0 hover:bg-muted/50">
                        <td className="p-3 font-medium">{l.name}</td>
                        <td className="p-3 font-mono text-sm" dir="ltr">{l.phone}</td>
                        <td className="p-3 text-muted-foreground text-xs">
                          {new Date(l.createdAt).toLocaleDateString("fa-IR")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
