import { useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CalendarDays,
  Check,
  CheckSquare,
  ChevronLeft,
  ClipboardCheck,
  ListChecks,
  RotateCcw,
  Share2,
  ShoppingBag,
  Target,
  Lightbulb,
} from "lucide-react";

function authFetch(token: string | null, url: string): Promise<Response> {
  return fetch(url, {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
}

interface IndexLevel {
  label: string;
  minPct: number;
  maxPct: number;
  description: string;
  suggestion: string;
}

interface IndexWithLevel {
  id: number;
  name: string;
  description?: string;
  weight?: number | null;
  minScore?: number | null;
  maxScore?: number | null;
  score?: number | null;
  level?: IndexLevel | null;
  levels?: IndexLevel[];
}

interface ResultData {
  sessionId: number;
  finalScore?: number | null;
  finalLevel?: {
    label: string;
    minPct: number;
    maxPct: number;
    description?: string;
    suggestion?: string;
  } | null;
  assessment: {
    id: number;
    title: string;
    slug: string;
    endText?: string | null;
    productId?: number;
    productTitle?: string;
    productImage?: string;
  };
  indicesWithLevel?: IndexWithLevel[] | null;
  growthRoadmap?: GrowthRoadmap | null;
}

interface GrowthRoadmap {
  priorities: Array<{
    rank: number;
    indexId: number | null;
    title: string;
    score: number | null;
    gap: number;
    reason: string;
  }>;
  suggestedSteps: Array<{
    id: string;
    priorityRank: number;
    title: string;
    description: string;
    indexId: number | null;
    source: "assessment" | "recommendation";
    targetType?: string;
    targetId?: number | string;
    targetSlug?: string;
    ctaLabel?: string;
    ctaUrl?: string;
    ctaRoute?: string;
  }>;
  weeklyPlan: Array<{
    week: number;
    title: string;
    focus: string;
    actions: string[];
    expectedOutcome: string;
  }>;
  nextAction: {
    title: string;
    description: string;
    priorityRank: number;
    indexId: number | null;
    ctaLabel: string;
  };
  checklist: Array<{
    id: string;
    label: string;
    priorityRank: number;
    indexId: number | null;
  }>;
}

const clampScore = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value)
    ? Math.min(100, Math.max(0, Math.round(value)))
    : null;

const formatPercent = (value: number | null) =>
  value === null ? "—" : `${value.toLocaleString("fa-IR")}٪`;

function shareResult(title: string) {
  if (navigator.share) {
    navigator.share({ title: `نتیجه ارزیابی ${title}`, url: window.location.href }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(window.location.href).catch(() => {});
}

function getScoreTone(score: number | null) {
  if (score === null) return "text-muted-foreground";
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 40) return "text-primary";
  return "text-rose-600 dark:text-rose-400";
}

function getScoreLabel(score: number | null) {
  if (score === null) return "امتیاز هنوز ثبت نشده";
  if (score >= 70) return "پایه‌ای محکم برای ادامه مسیر";
  if (score >= 40) return "در مسیر رشد و شناخت بیشتر";
  return "فرصتی خوب برای شروعی تازه";
}

function getIndexBand(score: number | null) {
  if (score === null) return "بدون امتیاز";
  if (score >= 70) return "نقطه قوت";
  if (score < 50) return "نیازمند توجه";
  return "قابل تقویت";
}

function ScoreRing({ score }: { score: number | null }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = score === null ? circumference : circumference * (1 - score / 100);

  return (
    <div className="relative h-36 w-36 shrink-0 sm:h-44 sm:w-44" data-testid="chart-overall-score">
      <svg viewBox="0 0 128 128" className="h-full w-full -rotate-90" aria-hidden="true">
        <circle cx="64" cy="64" r={radius} fill="none" stroke="hsl(var(--muted))" strokeWidth="9" />
        <motion.circle
          cx="64"
          cy="64"
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-black tracking-tight ${getScoreTone(score)}`}>
          {formatPercent(score)}
        </span>
        <span className="mt-1 text-[11px] text-muted-foreground">امتیاز نهایی</span>
      </div>
    </div>
  );
}

function PerformanceChart({ items }: { items: IndexWithLevel[] }) {
  const width = 620;
  const height = 220;
  const padding = { top: 22, right: 22, bottom: 48, left: 22 };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const points = items.map((item, index) => {
    const score = clampScore(item.score);
    const x = padding.left + (items.length === 1 ? plotWidth / 2 : (index * plotWidth) / (items.length - 1));
    const y = padding.top + plotHeight * (1 - (score ?? 0) / 100);
    return { ...item, score, x, y };
  });
  const path = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`).join(" ");

  return (
    <div className="w-full overflow-hidden" data-testid="chart-performance">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-foreground">نمودار عملکرد</p>
          <p className="mt-1 text-xs text-muted-foreground">مقایسه شاخص‌های اصلی این ارزیابی</p>
        </div>
        <BarChart3 className="h-5 w-5 text-primary" />
      </div>
      <div className="rounded-2xl border border-border/70 bg-background/40 px-2 py-3 sm:px-4">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full" role="img" aria-label="نمودار عملکرد شاخص‌ها">
          {[0, 25, 50, 75, 100].map((value) => {
            const y = padding.top + plotHeight * (1 - value / 100);
            return (
              <g key={value}>
                <line x1={padding.left} x2={width - padding.right} y1={y} y2={y} stroke="hsl(var(--border))" strokeDasharray="3 7" />
                <text x={width - padding.right} y={y - 5} textAnchor="end" className="fill-muted-foreground text-[10px]">
                  {value}٪
                </text>
              </g>
            );
          })}
          {points.length > 1 && (
            <motion.path
              d={path}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="4"
              strokeLinecap="round"
              strokeLinejoin="round"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 1.1, ease: "easeOut" }}
            />
          )}
          {points.map((point) => (
            <g key={point.id}>
              <circle cx={point.x} cy={point.y} r="7" fill="hsl(var(--card))" stroke="hsl(var(--primary))" strokeWidth="3" />
              <text x={point.x} y={height - 17} textAnchor="middle" className="fill-foreground text-[11px] font-bold">
                {point.name.length > 12 ? `${point.name.slice(0, 12)}…` : point.name}
              </text>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}

function ResultSkeleton() {
  return (
    <div dir="rtl" className="mx-auto min-h-[100dvh] max-w-5xl animate-pulse px-5 py-8 sm:px-8">
      <div className="h-5 w-28 rounded-full bg-muted" />
      <div className="mt-4 h-10 w-3/4 rounded-xl bg-muted" />
      <div className="mt-8 h-56 rounded-[2rem] bg-muted" />
      <div className="mt-6 h-52 rounded-3xl bg-muted" />
    </div>
  );
}

function GrowthRoadmapSection({ roadmap, sessionId }: { roadmap: GrowthRoadmap; sessionId: number }) {
  const storageKey = `assessment-roadmap:${sessionId}`;
  const [completed, setCompleted] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(storageKey) || "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  const toggleChecklist = (id: string) => {
    const next = { ...completed, [id]: !completed[id] };
    setCompleted(next);
    localStorage.setItem(storageKey, JSON.stringify(next));
  };

  const completionCount = roadmap.checklist.filter((item) => completed[item.id]).length;

  return (
    <section className="mt-6 space-y-5" data-testid="section-growth-roadmap">
      <div className="overflow-hidden rounded-3xl border border-primary/20 bg-card p-5 sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold tracking-wide text-primary">
              <Target className="h-4 w-4" />
              Growth Roadmap
            </div>
            <h2 className="mt-2 text-xl font-black text-foreground">نقشه رشد اختصاصی شما</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">
              این مسیر مستقیماً از امتیازها و پیشنهادهای همین نتیجه ساخته شده و با هر ارزیابی می‌تواند تغییر کند.
            </p>
          </div>
          <div className="shrink-0 rounded-2xl bg-primary/10 px-3 py-2 text-center">
            <div className="text-lg font-black text-primary">{completionCount.toLocaleString("fa-IR")}/{roadmap.checklist.length.toLocaleString("fa-IR")}</div>
            <div className="text-[11px] font-bold text-muted-foreground">انجام‌شده</div>
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1.1fr_.9fr]">
        <div className="rounded-3xl border border-border bg-card p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-black text-foreground">اولویت‌ها</h3>
          </div>
          <div className="mt-5 space-y-3">
            {roadmap.priorities.length ? roadmap.priorities.map((item) => (
              <div key={`${item.indexId}-${item.rank}`} className="rounded-2xl border border-border/80 bg-background/40 p-4">
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-primary-foreground">{item.rank.toLocaleString("fa-IR")}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <strong className="text-sm text-foreground">{item.title}</strong>
                      <span className="text-xs font-black text-primary">{item.score === null ? "—" : `${item.score.toLocaleString("fa-IR")}٪`}</span>
                    </div>
                    <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.reason}</p>
                  </div>
                </div>
              </div>
            )) : <p className="rounded-2xl bg-muted/50 p-4 text-sm leading-7 text-muted-foreground">برای این نتیجه اولویت جداگانه‌ای ثبت نشده است.</p>}
          </div>
        </div>

        <div className="rounded-3xl border border-primary/20 bg-primary/[0.06] p-5 sm:p-7">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-primary" />
            <h3 className="text-lg font-black text-foreground">Next Action</h3>
          </div>
          <h4 className="mt-5 text-lg font-black text-foreground">{roadmap.nextAction.title}</h4>
          <p className="mt-3 text-sm leading-8 text-muted-foreground">{roadmap.nextAction.description}</p>
          <button type="button" onClick={() => roadmap.checklist[0] && toggleChecklist(roadmap.checklist[0].id)} className="mt-5 inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90">
            <Check className="h-4 w-4" />
            {roadmap.nextAction.ctaLabel}
          </button>
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-black text-foreground">گام‌های پیشنهادی</h3>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-2">
          {roadmap.suggestedSteps.map((step) => (
            <div key={step.id} className="rounded-2xl border border-border/80 bg-background/40 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 rounded-lg bg-primary/10 px-2 py-1 text-[11px] font-bold text-primary">گام {step.priorityRank.toLocaleString("fa-IR")}</span>
                <div className="min-w-0">
                  <h4 className="text-sm font-black text-foreground">{step.title}</h4>
                  <p className="mt-2 text-xs leading-6 text-muted-foreground">{step.description}</p>
                  {step.ctaRoute && <button type="button" onClick={() => { window.location.href = step.ctaRoute!; }} className="mt-3 text-xs font-bold text-primary hover:underline">{step.ctaLabel || "مشاهده پیشنهاد"} ←</button>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-black text-foreground">برنامه هفتگی</h3>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {roadmap.weeklyPlan.map((week) => (
            <div key={week.week} className="rounded-2xl border border-border/80 bg-background/40 p-4">
              <h4 className="text-sm font-black text-foreground">{week.title}</h4>
              <p className="mt-2 text-xs font-bold text-primary">{week.focus}</p>
              <ul className="mt-3 space-y-2 text-xs leading-6 text-muted-foreground">
                {week.actions.map((action) => <li key={action} className="flex gap-2"><span className="text-primary">•</span>{action}</li>)}
              </ul>
              <p className="mt-3 border-t border-border/60 pt-3 text-xs leading-6 text-foreground/70"><strong>خروجی:</strong> {week.expectedOutcome}</p>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-3xl border border-border bg-card p-5 sm:p-7">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <h3 className="text-lg font-black text-foreground">چک‌لیست رشد</h3>
        </div>
        <div className="mt-5 space-y-2">
          {roadmap.checklist.map((item) => (
            <label key={item.id} className={`flex cursor-pointer items-center gap-3 rounded-2xl border p-3 transition-colors ${completed[item.id] ? "border-emerald-500/30 bg-emerald-500/[0.06]" : "border-border/80 bg-background/40"}`}>
              <input type="checkbox" checked={!!completed[item.id]} onChange={() => toggleChecklist(item.id)} className="h-4 w-4 accent-primary" />
              <span className={`text-sm leading-7 ${completed[item.id] ? "text-muted-foreground line-through" : "text-foreground"}`}>{item.label}</span>
            </label>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function AssessmentResult() {
  const { sessionId: rawSid } = useParams<{ slug: string; sessionId: string }>();
  const sid = Number.parseInt(rawSid ?? "0", 10);
  const [, setLocation] = useLocation();
  const { token } = useAuth();

  const query = useQuery<ResultData>({
    queryKey: ["/api/assessments/result", sid],
    queryFn: async () => {
      const response = await authFetch(token, `/api/assessments/result/${sid}`);
      if (!response.ok) throw new Error("نتیجه یافت نشد");
      return response.json() as Promise<ResultData>;
    },
    enabled: sid > 0,
  });

  const items = useMemo(
    () => (query.data?.indicesWithLevel ?? []).filter((item) => item && typeof item.id !== "undefined"),
    [query.data?.indicesWithLevel],
  );
  const overallScore = clampScore(query.data?.finalScore ?? null);
  const fallbackScore =
    overallScore === null && items.length
      ? clampScore(items.reduce((sum, item) => sum + (clampScore(item.score) ?? 0), 0) / items.length)
      : overallScore;
  const level = query.data?.finalLevel?.label?.trim() || null;
  const levelDescription = query.data?.finalLevel?.description?.trim() || null;
  const levelSuggestion = query.data?.finalLevel?.suggestion?.trim() || null;
  const analysis = useMemo(() => {
    const scored = items.map((item) => {
      const score = clampScore(item.score);
      const weight = typeof item.weight === "number" && Number.isFinite(item.weight) && item.weight > 0 ? item.weight : 1;
      const gap = score === null ? 100 : 100 - score;
      return { item, score, weight, gap, priorityScore: gap * weight };
    });
    return {
      strengths: scored.filter(({ score }) => score !== null && score >= 70).sort((a, b) => b.priorityScore - a.priorityScore),
      improvements: scored.filter(({ score }) => score !== null && score < 70).sort((a, b) => b.priorityScore - a.priorityScore),
      priorities: scored.filter(({ score }) => score !== null).sort((a, b) => b.priorityScore - a.priorityScore),
    };
  }, [items]);

  if (query.isLoading) return <ResultSkeleton />;

  if (query.isError || !query.data) {
    return (
      <main dir="rtl" className="flex min-h-[100dvh] items-center justify-center px-5">
        <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 text-center shadow-sm" data-testid="status-result-error">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <AlertCircle className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-black text-foreground">نتیجه در دسترس نیست</h1>
          <p className="mt-2 text-sm leading-7 text-muted-foreground">دریافت نتیجه با مشکل روبه‌رو شد. دوباره تلاش کنید.</p>
          <Button className="mt-6 w-full" onClick={() => query.refetch()} data-testid="button-retry-result">
            <RotateCcw className="h-4 w-4" />
            تلاش دوباره
          </Button>
        </div>
      </main>
    );
  }

  const { assessment } = query.data;
  return (
    <main dir="rtl" className="relative min-h-[100dvh] overflow-hidden pb-28">
      <div className="pointer-events-none absolute -top-36 left-[-12%] h-80 w-80 rounded-full bg-primary/10 blur-3xl" />
      <div className="pointer-events-none absolute right-[-18%] top-64 h-96 w-96 rounded-full bg-amber-500/10 blur-3xl" />
      <div className="relative mx-auto w-full max-w-5xl px-5 pt-7 sm:px-8 sm:pt-10">
        <header className="flex items-start justify-between gap-4">
          <div>
            <div className="mb-3 flex items-center gap-2 text-xs font-bold tracking-wide text-primary">
              <ClipboardCheck className="h-4 w-4" />
              نتیجه ارزیابی
            </div>
            <h1 className="max-w-2xl text-2xl font-black leading-[1.45] text-foreground sm:text-4xl" data-testid="text-assessment-title">
              {assessment.title}
            </h1>
            <p className="mt-3 text-sm text-muted-foreground">این نتیجه، تصویری از نقطه‌ای است که امروز در آن ایستاده‌اید.</p>
          </div>
          <button
            type="button"
            onClick={() => shareResult(assessment.title)}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-border bg-card text-muted-foreground transition-colors hover:text-foreground"
            aria-label="اشتراک‌گذاری نتیجه"
            data-testid="button-share-result"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </header>

        <motion.section
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-8 overflow-hidden rounded-[2rem] border border-primary/20 bg-card shadow-[0_18px_60px_-28px_hsl(var(--primary)/.45)]"
          data-testid="card-result-summary"
        >
          <div className="grid items-center gap-7 p-6 sm:grid-cols-[auto_1fr] sm:p-9">
            <ScoreRing score={fallbackScore} />
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-primary">خلاصه نتیجه شما</p>
              <h2 className={`mt-2 text-2xl font-black ${getScoreTone(fallbackScore)}`} data-testid="text-result-score-label">
                {getScoreLabel(fallbackScore)}
              </h2>
              <p className="mt-3 max-w-2xl text-sm leading-8 text-muted-foreground" data-testid="text-result-explanation">
                {assessment.endText || "این نتیجه فرصتی است برای شناخت بهتر توانمندی‌ها و انتخاب آگاهانه قدم بعدی."}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                <div className="rounded-xl bg-muted/70 px-4 py-2 text-sm">
                  <span className="text-muted-foreground">سطح شما: </span>
                  <strong className="text-foreground" data-testid="text-result-level">{level || "در حال تکمیل"}</strong>
                </div>
                <div className="rounded-xl bg-muted/70 px-4 py-2 text-sm">
                  <span className="text-muted-foreground">شاخص‌ها: </span>
                  <strong className="text-foreground">{items.length.toLocaleString("fa-IR")}</strong>
                </div>
              </div>
              {(levelDescription || levelSuggestion) && (
                <div className="mt-4 rounded-2xl border border-primary/15 bg-primary/[0.045] px-4 py-3">
                  {levelDescription && <p className="text-sm leading-7 text-foreground/80">{levelDescription}</p>}
                  {levelSuggestion && <p className="mt-2 text-xs leading-6 text-primary">{levelSuggestion}</p>}
                </div>
              )}
            </div>
          </div>
          <div className="flex items-center gap-3 border-t border-border/70 bg-primary/[0.035] px-6 py-4 text-xs leading-6 text-muted-foreground sm:px-9">
             <Lightbulb className="h-4 w-4 shrink-0 text-primary" />
            نتیجه خوب، پایان مسیر نیست؛ نشانه‌ای است برای انتخاب قدم بعدی متناسب با خودتان.
          </div>
        </motion.section>

         {items.length > 0 ? (
           <section className="mt-6 space-y-6">
             <div className="grid gap-6 lg:grid-cols-[1.1fr_.9fr]">
            <div className="rounded-3xl border border-border bg-card p-5 sm:p-7">
              <PerformanceChart items={items} />
            </div>
            <div className="rounded-3xl border border-border bg-card p-5 sm:p-7" data-testid="section-index-results">
              <div className="mb-5 flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-black text-foreground">جزئیات شاخص‌ها</h2>
                  <p className="mt-1 text-xs text-muted-foreground">هر شاخص، یک سرنخ برای رشد شماست.</p>
                </div>
                <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{items.length.toLocaleString("fa-IR")} شاخص</span>
              </div>
               <div className="space-y-4">
                {items.map((item, index) => {
                  const score = clampScore(item.score);
                  return (
                    <motion.div key={item.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.06 }} data-testid={`card-index-result-${item.id}`}>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="text-sm font-bold text-foreground">{item.name}</span>
                        <span className={`text-sm font-black ${getScoreTone(score)}`}>{formatPercent(score)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-muted">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${score ?? 0}%` }}
                          transition={{ duration: 0.8, delay: index * 0.06 }}
                          className={`h-full rounded-full ${score !== null && score >= 70 ? "bg-emerald-500" : score !== null && score >= 40 ? "bg-primary" : "bg-rose-400"}`}
                        />
                      </div>
                       <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                         <span className="text-xs text-muted-foreground">{item.level?.label || getIndexBand(score)}</span>
                         {item.weight != null && <span className="text-[11px] text-muted-foreground">وزن شاخص: {item.weight.toLocaleString("fa-IR")}</span>}
                       </div>
                        {item.description && <p className="mt-3 text-xs leading-6 text-muted-foreground">{item.description}</p>}
                        {item.level?.description && <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-6 text-foreground/70">{item.level.description}</p>}
                        {item.level?.suggestion && <p className="mt-2 text-xs leading-6 text-primary">{item.level.suggestion}</p>}
                    </motion.div>
                  );
                })}
              </div>
            </div>
             </div>

             <div className="grid gap-6 md:grid-cols-2">
               <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="rounded-3xl border border-emerald-500/20 bg-emerald-500/[0.055] p-5 sm:p-7" data-testid="section-strengths">
                 <div className="flex items-start justify-between gap-4">
                   <div>
                     <p className="text-xs font-bold tracking-wide text-emerald-700 dark:text-emerald-400">آنچه در شما پررنگ است</p>
                     <h2 className="mt-2 text-xl font-black text-foreground">نقاط قوت</h2>
                   </div>
                   <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"><Check className="h-5 w-5" /></div>
                 </div>
                 {analysis.strengths.length ? (
                   <div className="mt-5 space-y-3">
                     {analysis.strengths.map(({ item, score }) => (
                       <div key={item.id} className="rounded-2xl border border-emerald-500/15 bg-card/60 p-4" data-testid={`strength-index-${item.id}`}>
                         <div className="flex items-center justify-between gap-3"><strong className="text-sm text-foreground">{item.name}</strong><span className="text-sm font-black text-emerald-700 dark:text-emerald-400">{formatPercent(score)}</span></div>
                         {item.description && <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.description}</p>}
                         {item.level?.description && <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-6 text-foreground/75">{item.level.description}</p>}
                       </div>
                     ))}
                   </div>
                 ) : <p className="mt-5 rounded-2xl bg-card/60 p-4 text-sm leading-7 text-muted-foreground">در این نتیجه، شاخصی با امتیاز بالا ثبت نشده است؛ همین شناخت، نقطه شروع ارزشمندی برای رشد است.</p>}
               </motion.section>

               <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }} className="rounded-3xl border border-amber-500/25 bg-amber-500/[0.055] p-5 sm:p-7" data-testid="section-improvements">
                 <div className="flex items-start justify-between gap-4">
                   <div>
                     <p className="text-xs font-bold tracking-wide text-amber-700 dark:text-amber-400">جایی برای یک قدم کوچک</p>
                     <h2 className="mt-2 text-xl font-black text-foreground">حوزه‌های قابل بهبود</h2>
                   </div>
                   <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-500/15 text-amber-700 dark:text-amber-400"><Lightbulb className="h-5 w-5" /></div>
                 </div>
                 {analysis.improvements.length ? (
                   <div className="mt-5 space-y-3">
                     {analysis.improvements.map(({ item, score }) => (
                       <div key={item.id} className="rounded-2xl border border-amber-500/15 bg-card/60 p-4" data-testid={`improvement-index-${item.id}`}>
                         <div className="flex items-center justify-between gap-3"><strong className="text-sm text-foreground">{item.name}</strong><span className={`text-sm font-black ${getScoreTone(score)}`}>{formatPercent(score)}</span></div>
                         {item.description && <p className="mt-2 text-xs leading-6 text-muted-foreground">{item.description}</p>}
                         {(item.level?.suggestion || item.level?.description) && <p className="mt-2 border-t border-border/60 pt-2 text-xs leading-6 text-amber-800 dark:text-amber-300">{item.level.suggestion || item.level.description}</p>}
                       </div>
                     ))}
                   </div>
                 ) : <p className="mt-5 rounded-2xl bg-card/60 p-4 text-sm leading-7 text-muted-foreground">شاخصی برای تقویت فوری دیده نمی‌شود. حفظ این تعادل، خودش بخشی از مسیر شماست.</p>}
               </motion.section>
             </div>

             <section className="rounded-3xl border border-primary/20 bg-card p-5 sm:p-7" data-testid="section-priority-plan">
               <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                 <div><p className="text-xs font-bold tracking-wide text-primary">ترتیب پیشنهادی تمرکز</p><h2 className="mt-2 text-xl font-black text-foreground">برنامه رشد شما</h2><p className="mt-2 max-w-2xl text-sm leading-7 text-muted-foreground">این ترتیب از فاصله هر امتیاز تا سقف، با درنظرگرفتن وزن همان شاخص ساخته شده است.</p></div>
                 <span className="rounded-full bg-primary/10 px-3 py-1 text-xs font-bold text-primary">{analysis.priorities.length.toLocaleString("fa-IR")} اولویت</span>
               </div>
               <div className="mt-6 grid gap-3 md:grid-cols-2">
                 {analysis.priorities.map(({ item, score }, index) => (
                   <motion.div key={item.id} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: index * 0.05 }} className="relative overflow-hidden rounded-2xl border border-border/80 bg-background/45 p-4" data-testid={`priority-index-${item.id}`}>
                     <div className="flex items-start gap-3">
                       <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-xs font-black text-primary-foreground">{(index + 1).toLocaleString("fa-IR")}</span>
                       <div className="min-w-0 flex-1"><div className="flex items-center justify-between gap-3"><strong className="truncate text-sm text-foreground">{item.name}</strong><span className={`text-sm font-black ${getScoreTone(score)}`}>{formatPercent(score)}</span></div><p className="mt-2 text-xs leading-6 text-muted-foreground">{item.level?.suggestion || item.level?.description || item.description || "با توجه منظم و قدم‌های کوچک، این شاخص را دنبال کنید."}</p></div>
                     </div>
                   </motion.div>
                 ))}
               </div>
             </section>
           </section>
        ) : (
          <section className="mt-6 rounded-3xl border border-dashed border-border bg-card p-8 text-center" data-testid="status-empty-indices">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted"><Check className="h-5 w-5 text-primary" /></div>
            <h2 className="mt-4 font-black text-foreground">نتیجه شما ثبت شد</h2>
            <p className="mt-2 text-sm leading-7 text-muted-foreground">جزئیات شاخص‌ها برای این ارزیابی موجود نیست، اما پیام پایانی شما را راهنمایی می‌کند.</p>
          </section>
        )}

        {query.data.growthRoadmap && <GrowthRoadmapSection roadmap={query.data.growthRoadmap} sessionId={sid} />}

        {assessment.productId && (
          <section className="mt-6 overflow-hidden rounded-3xl border border-primary/20 bg-primary/[0.06]" data-testid="card-recommended-product">
            <div className="grid items-center gap-5 p-5 sm:grid-cols-[120px_1fr_auto] sm:p-6">
              {assessment.productImage ? <img src={assessment.productImage} alt={assessment.productTitle ?? "محصول پیشنهادی"} className="h-24 w-full rounded-2xl object-cover sm:h-20" /> : <div className="flex h-20 items-center justify-center rounded-2xl bg-primary/10"><ShoppingBag className="h-7 w-7 text-primary" /></div>}
              <div>
                <p className="text-xs font-bold text-primary">قدم پیشنهادی بعدی</p>
                <h2 className="mt-1 font-black text-foreground">{assessment.productTitle || "مسیر یادگیری پیشنهادی"}</h2>
              </div>
              <Button onClick={() => setLocation(`/product/${assessment.productId}`)} data-testid="button-view-product">
                مشاهده مسیر
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </div>
          </section>
        )}

        <div className="mt-8 flex flex-col gap-3 sm:flex-row-reverse">
          <Button className="h-12 flex-1" onClick={() => setLocation("/tools")} data-testid="button-back-to-tools">
            بازگشت به ابزارها
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-12 flex-1" onClick={() => setLocation(`/assessment/${assessment.slug}`)} data-testid="button-retake-assessment">
            انجام دوباره ارزیابی
            <RotateCcw className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </main>
  );
}