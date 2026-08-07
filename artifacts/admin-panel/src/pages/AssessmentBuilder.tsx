import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, put, del, uploadFile, normalizeImageUrl } from "@/lib/api";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  ChevronRight, Plus, Trash2, Save, Loader2,
  Brain, ListChecks, Target, Pencil, ChevronUp, ChevronDown,
  AlertCircle, CheckCircle2, Info, Upload, ImageIcon, X,
  Eye, EyeOff, Weight, Tag, Lightbulb, BarChart3,
  Zap, GitBranch, ShoppingBag, BookOpen, FlaskConical, ChevronsUpDown, GripVertical,
} from "lucide-react";
import { Link } from "wouter";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AssessmentForm {
  title: string;
  slug: string;
  shortDescription: string;
  description: string;
  coverImage: string;
  productId: string;
  category: string;
  estimatedMinutes: number;
  startText: string;
  endText: string;
  isPublished: boolean;
  sortOrder: number;
  requiresAuth: boolean;
  collectContactInfo: boolean;
  hasAiReport: boolean;
  aiReportPrice: number;
  disclaimer: string;
}

/**
 * QuestionOption — v54
 * indexScores: per-index score map (new system, takes priority in scoring engine)
 * indexIds + score: backward compat (old system)
 */
interface QuestionOption {
  id: string;
  label: string;
  score: number;
  weight: number;
  leadScore: number;
  indexIds: number[];
  indexScores?: Record<string, number>; // v54: { "indexId": score }
}

interface ConditionalLogic {
  questionId: number;
  operator: "eq" | "neq" | "gte" | "lte" | "in";
  value: unknown;
}

interface Question {
  id: number;
  type: string;
  title: string;
  description: string;
  image: string;
  sortOrder: number;
  isRequired: boolean;
  isActive: boolean;
  // v54 new fields
  questionWeight: number;
  questionCategory: string;
  questionGoal: string;
  // existing
  indexIds: number[];
  options: QuestionOption[];
  conditionalLogic: ConditionalLogic | null;
  specialMessage: string;
  answerLabel: string;
  scaleMinLabel: string;
  scaleMaxLabel: string;
}

interface IndexItem {
  id: number;
  name: string;
  description: string;
  weight: number;
  minScore: number;
  maxScore: number;
  sortOrder: number;
  levels: Array<{
    label: string;
    minPct: number;
    maxPct: number;
    description: string;
    suggestion: string;
  }>;
}


// ─── Rules Engine Types (v57) ─────────────────────────────────────────────────

type RuleConditionType = "finalScore" | "indexScore" | "finalLevel" | "indexLevel" | "answer" | "leadScore";
type RuleOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "between" | "contains";
type RuleConditionMode = "all" | "any";
type CtaStyle = "primary" | "success" | "warning" | "danger" | "info";

interface RuleCondition {
  type: RuleConditionType;
  operator: RuleOperator;
  value: unknown;
  indexId?: number;
  questionId?: number;
}

interface RuleAction {
  suggestedProductIds?: number[];
  suggestedCourseIds?: number[];
  suggestedAssessmentIds?: number[];
  ctaText?: string;
  ctaUrl?: string;
  ctaStyle?: CtaStyle;
  messageTitle?: string;
  messageBody?: string;
  messageBadge?: string;
  messageBadgeColor?: string;
  messageIcon?: string;
}

interface AssessmentRule {
  id: number;
  assessmentId: number;
  name: string;
  description?: string;
  isActive: boolean;
  sortOrder: number;
  conditionMode: RuleConditionMode;
  conditions: RuleCondition[];
  actions: RuleAction;
  createdAt: string;
  updatedAt: string;
}

interface SimpleItem { id: number; title: string; }

// ─── Constants ────────────────────────────────────────────────────────────────

const QUESTION_TYPES = [
  { value: "single_choice",  label: "تک انتخابی",     icon: "◉", hasOptions: true,  hasScale: false },
  { value: "multi_choice",   label: "چند انتخابی",    icon: "☑",  hasOptions: true,  hasScale: false },
  { value: "yes_no",         label: "بله / خیر",      icon: "⇄",  hasOptions: true,  hasScale: false },
  { value: "dropdown",       label: "Dropdown",        icon: "▾",  hasOptions: true,  hasScale: false },
  { value: "scale_5",        label: "طیف ۱ تا ۵",    icon: "⭐",  hasOptions: false, hasScale: true  },
  { value: "scale_10",       label: "طیف ۱ تا ۱۰",  icon: "📊", hasOptions: false, hasScale: true  },
  { value: "short_text",     label: "متن کوتاه",      icon: "✏",  hasOptions: false, hasScale: false },
  { value: "long_text",      label: "متن بلند",       icon: "📝", hasOptions: false, hasScale: false },
  { value: "number",         label: "عدد",            icon: "🔢", hasOptions: false, hasScale: false },
  { value: "info_section",   label: "بخش توضیحی",    icon: "ℹ",  hasOptions: false, hasScale: false },
] as const;

// v54: question content categories (independent of answer type)
const QUESTION_CATEGORIES = [
  { value: "behavioral",      label: "رفتاری",         desc: "ارزیابی رفتارهای واقعی فرد" },
  { value: "knowledge",       label: "دانشی",          desc: "سنجش اطلاعات و دانش" },
  { value: "attitude",        label: "نگرشی",          desc: "سنجش باور و نگرش" },
  { value: "situational",     label: "موقعیتی",        desc: "پاسخ به سناریوی فرضی" },
  { value: "self_assessment", label: "خودارزیابی",     desc: "ادراک فرد از خود" },
  { value: "demographic",     label: "جمعیت‌شناختی",  desc: "اطلاعات زمینه‌ای" },
] as const;

function qTypeMeta(type: string) {
  return QUESTION_TYPES.find((t) => t.value === type) ?? QUESTION_TYPES[0];
}

function genId() {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
}

// ─── Scoring Preview Component ────────────────────────────────────────────────

function ScoringPreview({
  options,
  indices,
}: {
  options: QuestionOption[];
  indices: IndexItem[];
}) {
  if (!options.length || !indices.length) return null;

  const filledOptions = options.filter((o) => o.label.trim());
  if (!filledOptions.length) return null;

  // Check if any option has indexScores
  const hasAnyScores = filledOptions.some((o) =>
    o.indexScores && Object.keys(o.indexScores).length > 0
  );
  if (!hasAnyScores) return null;

  return (
    <div className="border border-border/60 rounded-xl overflow-hidden">
      <div className="bg-muted/40 px-3 py-2 flex items-center gap-2 border-b border-border/60">
        <BarChart3 className="w-3.5 h-3.5 text-primary" />
        <span className="text-xs font-semibold text-foreground">پیش‌نمایش امتیازدهی</span>
        <span className="text-xs text-muted-foreground mr-auto">
          هر سلول = امتیاز اضافه‌شده به شاخص در صورت انتخاب آن گزینه
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs border-collapse" dir="rtl">
          <thead>
            <tr className="bg-muted/20">
              <th className="text-right px-3 py-2 font-medium text-muted-foreground border-b border-border/40 min-w-[120px]">
                گزینه
              </th>
              {indices.map((idx) => (
                <th
                  key={idx.id}
                  className="text-center px-2 py-2 font-medium text-muted-foreground border-b border-border/40 min-w-[80px] whitespace-nowrap"
                >
                  {idx.name}
                </th>
              ))}
              <th className="text-center px-2 py-2 font-medium text-muted-foreground border-b border-border/40 min-w-[60px]">
                Lead
              </th>
            </tr>
          </thead>
          <tbody>
            {filledOptions.map((opt, i) => (
              <tr
                key={opt.id}
                className={i % 2 === 0 ? "bg-background" : "bg-muted/10"}
              >
                <td className="px-3 py-2 text-foreground border-b border-border/20 max-w-[150px] truncate">
                  {opt.label}
                </td>
                {indices.map((idx) => {
                  const score = opt.indexScores?.[String(idx.id)] ?? 0;
                  return (
                    <td
                      key={idx.id}
                      className={`text-center px-2 py-2 border-b border-border/20 font-mono text-xs ${
                        score > 0
                          ? "text-green-400 font-semibold"
                          : score < 0
                          ? "text-red-400 font-semibold"
                          : "text-muted-foreground/40"
                      }`}
                    >
                      {score !== 0 ? (score > 0 ? `+${score}` : score) : "—"}
                    </td>
                  );
                })}
                <td
                  className={`text-center px-2 py-2 border-b border-border/20 font-mono text-xs ${
                    (opt.leadScore ?? 0) > 0
                      ? "text-blue-400"
                      : (opt.leadScore ?? 0) < 0
                      ? "text-orange-400"
                      : "text-muted-foreground/40"
                  }`}
                >
                  {(opt.leadScore ?? 0) !== 0
                    ? (opt.leadScore ?? 0) > 0
                      ? `+${opt.leadScore}`
                      : opt.leadScore
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Question Editor Dialog ────────────────────────────────────────────────────

function QuestionDialog({
  question,
  indices,
  allQuestions,
  onSave,
  onClose,
  isSaving,
}: {
  question: Partial<Question> | null;
  indices: IndexItem[];
  allQuestions: Question[];
  onSave: (q: Partial<Question>) => void;
  onClose: () => void;
  isSaving?: boolean;
}) {
  const [form, setForm] = useState<Partial<Question>>(
    question ?? {
      type: "single_choice",
      title: "",
      description: "",
      image: "",
      isRequired: true,
      isActive: true,
      questionWeight: 1,
      questionCategory: "",
      questionGoal: "",
      indexIds: [],
      options: [],
      conditionalLogic: null,
      specialMessage: "",
      answerLabel: "",
      scaleMinLabel: "",
      scaleMaxLabel: "",
    }
  );
  const [showPreview, setShowPreview] = useState(false);
  const [showGoal, setShowGoal] = useState(false);

  function set(k: keyof Question, v: unknown) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  // ── Option management ──────────────────────────────────────────────────────

  function addOption() {
    // Build default indexScores (0 for all current indices)
    const defaultIndexScores: Record<string, number> = {};
    for (const idx of indices) defaultIndexScores[String(idx.id)] = 0;

    setForm((p) => ({
      ...p,
      options: [
        ...(p.options ?? []),
        {
          id: genId(),
          label: "",
          score: 0,
          weight: 1,
          leadScore: 0,
          indexIds: [],
          indexScores: defaultIndexScores,
        },
      ],
    }));
  }

  function updateOption(idx: number, k: keyof QuestionOption, v: unknown) {
    setForm((p) => ({
      ...p,
      options: (p.options ?? []).map((o, i) => (i === idx ? { ...o, [k]: v } : o)),
    }));
  }

  /**
   * Update a single index score for an option (v54 new per-index scoring)
   */
  function updateOptionIndexScore(optIdx: number, indexId: number, score: number) {
    setForm((p) => ({
      ...p,
      options: (p.options ?? []).map((o, i) => {
        if (i !== optIdx) return o;
        const newIndexScores = { ...(o.indexScores ?? {}), [String(indexId)]: score };
        // Also sync legacy fields for backward compat
        const nonZeroIds = Object.entries(newIndexScores)
          .filter(([, s]) => s !== 0)
          .map(([id]) => parseInt(id));
        return { ...o, indexScores: newIndexScores, indexIds: nonZeroIds };
      }),
    }));
  }

  function moveOption(idx: number, dir: -1 | 1) {
    setForm((p) => {
      const opts = [...(p.options ?? [])];
      const to = idx + dir;
      if (to < 0 || to >= opts.length) return p;
      [opts[idx], opts[to]] = [opts[to], opts[idx]];
      return { ...p, options: opts };
    });
  }

  function removeOption(idx: number) {
    setForm((p) => ({ ...p, options: (p.options ?? []).filter((_, i) => i !== idx) }));
  }

  // When a new index is added after options already exist, init its score to 0
  // (handled by parent via indices prop — no action needed here)

  const meta = qTypeMeta(form.type ?? "single_choice");
  const hasOptions = meta.hasOptions;
  const hasScale = meta.hasScale;

  const isValid = !!form.title?.trim() && (
    !hasOptions || (form.options ?? []).length > 0
  );

  const catLabel = QUESTION_CATEGORIES.find(c => c.value === form.questionCategory)?.label;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {question?.id ? (
              <><Pencil className="w-4 h-4 text-primary" /> ویرایش سوال</>
            ) : (
              <><Plus className="w-4 h-4 text-primary" /> سوال جدید</>
            )}
            {/* badges */}
            <div className="flex gap-1.5 mr-auto">
              {form.questionWeight && form.questionWeight > 1 && (
                <Badge className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/30">
                  وزن ×{form.questionWeight}
                </Badge>
              )}
              {catLabel && (
                <Badge variant="outline" className="text-xs">{catLabel}</Badge>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">

          {/* ── 1. Answer type selector ── */}
          <div>
            <label className="text-xs font-semibold mb-2 block text-muted-foreground uppercase tracking-wider">
              نوع پاسخ
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {QUESTION_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => { set("type", t.value); if (!t.hasOptions) set("options", []); }}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-all ${
                    form.type === t.value
                      ? "bg-primary text-primary-foreground border-primary font-semibold"
                      : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  <span className="text-base leading-none">{t.icon}</span>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── 2. Question text ── */}
          <div>
            <label className="text-sm font-semibold mb-1.5 block text-foreground">
              متن سوال <span className="text-red-400">*</span>
            </label>
            <Textarea
              value={form.title ?? ""}
              onChange={(e) => set("title", e.target.value)}
              placeholder="متن سوال را بنویسید..."
              rows={2}
              className={!form.title?.trim() ? "border-red-500/50" : ""}
            />
          </div>

          {/* ── 3. Description ── */}
          <div>
            <label className="text-sm font-semibold mb-1.5 block text-foreground">توضیح (اختیاری)</label>
            <Input
              value={form.description ?? ""}
              onChange={(e) => set("description", e.target.value)}
              placeholder="راهنمایی اضافه برای کاربر..."
            />
          </div>

          {/* ── 4. v54 Metadata card ── */}
          <div className="bg-primary/5 border border-primary/20 rounded-xl p-4 space-y-4">
            <p className="text-xs font-semibold text-primary flex items-center gap-1.5">
              <Tag className="w-3.5 h-3.5" />
              ویژگی‌های سوال (مرحله ۱ — v54)
            </p>

            <div className="grid grid-cols-2 gap-3">
              {/* Question Weight */}
              <div>
                <label className="text-xs font-medium mb-1.5 block text-foreground flex items-center gap-1">
                  <Weight className="w-3 h-3 text-muted-foreground" />
                  وزن سوال
                  <span className="text-muted-foreground font-normal mr-1">(۱–۱۰)</span>
                </label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    max={10}
                    value={form.questionWeight ?? 1}
                    onChange={(e) => set("questionWeight", Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
                    className="h-9 w-20 text-center font-mono"
                  />
                  <div className="flex gap-1">
                    {[1,2,3,5].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => set("questionWeight", w)}
                        className={`px-2 py-1 rounded text-xs border transition-all ${
                          form.questionWeight === w
                            ? "bg-primary text-primary-foreground border-primary"
                            : "border-border text-muted-foreground hover:border-primary/40"
                        }`}
                      >
                        {w}×
                      </button>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  تأثیر این سوال در scoring نسبت به سوالات دیگر
                </p>
              </div>

              {/* Question Category */}
              <div>
                <label className="text-xs font-medium mb-1.5 block text-foreground flex items-center gap-1">
                  <Tag className="w-3 h-3 text-muted-foreground" />
                  دسته‌بندی محتوایی
                </label>
                <Select
                  value={form.questionCategory ?? ""}
                  onValueChange={(v) => set("questionCategory", v === "_none" ? "" : v)}
                >
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="انتخاب دسته..." />
                  </SelectTrigger>
                  <SelectContent dir="rtl">
                    <SelectItem value="_none">
                      <span className="text-muted-foreground">— بدون دسته‌بندی —</span>
                    </SelectItem>
                    {QUESTION_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        <div>
                          <span className="font-medium">{c.label}</span>
                          <span className="text-muted-foreground text-xs mr-2">{c.desc}</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  نوع محتوایی — مستقل از نوع پاسخ
                </p>
              </div>
            </div>

            {/* Question Goal (admin-only) */}
            <div>
              <button
                type="button"
                onClick={() => setShowGoal(g => !g)}
                className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
              >
                <Lightbulb className="w-3.5 h-3.5" />
                هدف داخلی سوال (فقط برای ادمین)
                {showGoal ? <ChevronUp className="w-3 h-3 mr-1" /> : <ChevronDown className="w-3 h-3 mr-1" />}
              </button>
              {showGoal && (
                <div className="mt-2">
                  <Textarea
                    value={form.questionGoal ?? ""}
                    onChange={(e) => set("questionGoal", e.target.value)}
                    placeholder="چرا این سوال طراحی شده؟ چه اطلاعاتی باید کسب کند؟ (هرگز به کاربر نشان داده نمی‌شود)"
                    rows={2}
                    className="text-xs bg-background/60"
                  />
                </div>
              )}
            </div>
          </div>

          {/* ── 5. Required / Active ── */}
          <div className="flex gap-6 bg-muted/30 rounded-lg p-3">
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.isRequired ?? true} onCheckedChange={(v) => set("isRequired", v)} />
              <span className="text-sm font-medium">اجباری</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={form.isActive ?? true} onCheckedChange={(v) => set("isActive", v)} />
              <span className="text-sm font-medium">فعال</span>
            </label>
          </div>

          {/* ── 6. Scale labels ── */}
          {hasScale && (
            <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-3">
              <p className="text-xs font-semibold text-blue-400 mb-2">برچسب‌های طیف</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">برچسب کم (ابتدا)</label>
                  <Input value={form.scaleMinLabel ?? ""} onChange={(e) => set("scaleMinLabel", e.target.value)} placeholder="مثلاً: خیلی کم" className="h-8" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">برچسب زیاد (انتها)</label>
                  <Input value={form.scaleMaxLabel ?? ""} onChange={(e) => set("scaleMaxLabel", e.target.value)} placeholder="مثلاً: خیلی زیاد" className="h-8" />
                </div>
              </div>
              {/* Scale → index links */}
              {indices.length > 0 && (
                <div>
                  <label className="text-xs text-muted-foreground mb-1.5 block">شاخص‌های مرتبط با این طیف</label>
                  <div className="flex flex-wrap gap-1.5">
                    {indices.map((idx) => {
                      const sel = (form.indexIds ?? []).includes(idx.id);
                      return (
                        <button
                          key={idx.id}
                          type="button"
                          onClick={() =>
                            set("indexIds", sel
                              ? (form.indexIds ?? []).filter((i) => i !== idx.id)
                              : [...(form.indexIds ?? []), idx.id])
                          }
                          className={`px-2.5 py-1 rounded-full text-xs border transition-all ${
                            sel ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                          }`}
                        >
                          {idx.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── 7. Index links for non-option/non-scale questions ── */}
          {!hasOptions && !hasScale && indices.length > 0 && (
            <div>
              <label className="text-sm font-semibold mb-1.5 block text-foreground">شاخص‌های مرتبط</label>
              <div className="flex flex-wrap gap-2">
                {indices.map((idx) => {
                  const sel = (form.indexIds ?? []).includes(idx.id);
                  return (
                    <button
                      key={idx.id}
                      type="button"
                      onClick={() =>
                        set("indexIds", sel
                          ? (form.indexIds ?? []).filter((i) => i !== idx.id)
                          : [...(form.indexIds ?? []), idx.id])
                      }
                      className={`px-3 py-1 rounded-full text-xs border transition-all ${
                        sel ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary/50"
                      }`}
                    >
                      {idx.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* ── 8. Options with per-index scoring (v54) ── */}
          {hasOptions && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div>
                  <label className="text-sm font-semibold text-foreground">
                    گزینه‌ها <span className="text-red-400">*</span>
                    {(form.options ?? []).length > 0 && (
                      <span className="text-muted-foreground font-normal text-xs mr-1">({(form.options ?? []).length})</span>
                    )}
                  </label>
                  {indices.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      برای هر گزینه امتیاز مستقل به هر شاخص بدهید
                    </p>
                  )}
                </div>
                <Button size="sm" variant="outline" onClick={addOption} type="button">
                  <Plus className="w-3.5 h-3.5 ml-1" /> افزودن گزینه
                </Button>
              </div>

              {(form.options ?? []).length === 0 ? (
                <div className="text-center py-6 border-2 border-dashed border-red-500/30 rounded-xl bg-red-500/5">
                  <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-1.5" />
                  <p className="text-xs text-red-400">حداقل یک گزینه اضافه کنید</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {(form.options ?? []).map((opt, i) => (
                    <div key={opt.id} className="bg-muted/30 border border-border/60 rounded-xl p-3 space-y-3">

                      {/* Row 1: move + label + lead score + delete */}
                      <div className="flex gap-2 items-center">
                        <div className="flex flex-col gap-0.5 flex-shrink-0">
                          <button type="button" onClick={() => moveOption(i, -1)} disabled={i === 0} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                            <ChevronUp className="w-3 h-3 text-muted-foreground" />
                          </button>
                          <button type="button" onClick={() => moveOption(i, 1)} disabled={i === (form.options ?? []).length - 1} className="p-0.5 rounded hover:bg-muted disabled:opacity-30">
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          </button>
                        </div>

                        <span className="text-xs text-muted-foreground font-mono w-5 flex-shrink-0 text-center">{i + 1}</span>

                        <Input
                          className="flex-1 h-8"
                          placeholder="متن گزینه..."
                          value={opt.label}
                          onChange={(e) => updateOption(i, "label", e.target.value)}
                        />

                        <div className="flex-shrink-0 w-24">
                          <div className="flex items-center gap-1">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Lead:</span>
                            <Input
                              type="number"
                              min={-10}
                              max={10}
                              value={opt.leadScore}
                              onChange={(e) => updateOption(i, "leadScore", Number(e.target.value))}
                              className="h-8 text-sm text-center w-16"
                              title="تأثیر روی امتیاز Lead کاربر (−10 تا +10)"
                            />
                          </div>
                        </div>

                        <button type="button" onClick={() => removeOption(i)} className="text-red-400 hover:text-red-300 p-1 flex-shrink-0">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Row 2: per-index scores (v54 new system) */}
                      {indices.length > 0 && (
                        <div className="pr-7 pl-2">
                          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                            <BarChart3 className="w-3 h-3" />
                            امتیاز به ازای هر شاخص
                            <span className="text-muted-foreground/60 font-normal">
                              (مثبت = تقویت شاخص، صفر = بی‌تأثیر، منفی = کاهش)
                            </span>
                          </p>
                          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${Math.min(indices.length, 3)}, 1fr)` }}>
                            {indices.map((idx) => {
                              const score = opt.indexScores?.[String(idx.id)] ?? 0;
                              return (
                                <div key={idx.id} className="flex items-center gap-1.5 bg-background/60 rounded-lg px-2 py-1.5">
                                  <span
                                    className="text-xs text-muted-foreground truncate flex-1"
                                    title={idx.name}
                                  >
                                    {idx.name}
                                  </span>
                                  <Input
                                    type="number"
                                    value={score}
                                    onChange={(e) => updateOptionIndexScore(i, idx.id, Number(e.target.value))}
                                    className={`h-7 w-16 text-center text-xs font-mono flex-shrink-0 ${
                                      score > 0 ? "text-green-400 border-green-500/30" :
                                      score < 0 ? "text-red-400 border-red-500/30" : ""
                                    }`}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Scoring preview toggle */}
              {(form.options ?? []).length > 0 && indices.length > 0 && (
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setShowPreview(v => !v)}
                    className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPreview ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showPreview ? "پنهان کردن پیش‌نمایش" : "نمایش پیش‌نمایش امتیازدهی"}
                  </button>
                  {showPreview && (
                    <div className="mt-2">
                      <ScoringPreview options={form.options ?? []} indices={indices} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── 9. Conditional Logic ── */}
          {(() => {
            const prevQuestions = allQuestions.filter(
              (q) => q.id !== form.id && q.sortOrder < (form.sortOrder ?? 999)
            );
            const hasCondition = !!form.conditionalLogic;
            const condQ = prevQuestions.find((q) => q.id === form.conditionalLogic?.questionId);
            const condQOpts = condQ ? (condQ.options ?? []) : [];
            const isChoiceCondQ = condQ && ["single_choice", "yes_no", "dropdown"].includes(condQ.type);
            const isScaleCondQ = condQ && ["scale_5", "scale_10"].includes(condQ.type);

            return prevQuestions.length > 0 ? (
              <div className="border border-dashed border-border rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold text-foreground flex items-center gap-2">
                    <span>🔀</span> نمایش مشروط
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <Switch
                      checked={hasCondition}
                      onCheckedChange={(v) =>
                        set("conditionalLogic", v
                          ? { questionId: prevQuestions[0].id, operator: "eq", value: "" }
                          : null)
                      }
                    />
                    <span className="text-xs text-muted-foreground">{hasCondition ? "فعال" : "غیرفعال"}</span>
                  </label>
                </div>

                {hasCondition && form.conditionalLogic && (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 block">این سوال فقط نمایش داده شود اگر…</label>
                      <select
                        className="w-full h-9 rounded-lg border border-border bg-background px-3 text-sm text-foreground"
                        value={form.conditionalLogic.questionId}
                        onChange={(e) =>
                          set("conditionalLogic", {
                            ...form.conditionalLogic!,
                            questionId: parseInt(e.target.value),
                            value: "",
                          })
                        }
                      >
                        {prevQuestions.map((q) => (
                          <option key={q.id} value={q.id}>
                            سوال {q.sortOrder + 1}: {q.title.slice(0, 50)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="flex gap-2">
                      {(isChoiceCondQ
                        ? [{ v: "eq", label: "برابر است با" }, { v: "neq", label: "برابر نیست با" }]
                        : isScaleCondQ
                        ? [{ v: "eq", label: "=" }, { v: "gte", label: "≥" }, { v: "lte", label: "≤" }]
                        : [{ v: "eq", label: "برابر" }, { v: "neq", label: "نابرابر" }]
                      ).map(({ v, label }) => (
                        <button
                          key={v}
                          type="button"
                          onClick={() => set("conditionalLogic", { ...form.conditionalLogic!, operator: v as ConditionalLogic["operator"] })}
                          className={`flex-1 h-8 rounded-lg border text-xs font-medium transition-all ${
                            form.conditionalLogic.operator === v
                              ? "bg-primary text-primary-foreground border-primary"
                              : "border-border text-muted-foreground hover:border-primary/40"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>

                    {isChoiceCondQ && condQOpts.length > 0 ? (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">گزینه</label>
                        <div className="flex flex-wrap gap-1.5">
                          {condQOpts.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => set("conditionalLogic", { ...form.conditionalLogic!, value: opt.id })}
                              className={`px-2.5 py-1 rounded-full border text-xs transition-all ${
                                form.conditionalLogic.value === opt.id
                                  ? "bg-primary text-primary-foreground border-primary"
                                  : "border-border text-muted-foreground hover:border-primary/40"
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : isScaleCondQ ? (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">مقدار عددی</label>
                        <Input
                          type="number"
                          min={1}
                          max={condQ?.type === "scale_5" ? 5 : 10}
                          value={typeof form.conditionalLogic.value === "number" ? form.conditionalLogic.value : ""}
                          onChange={(e) => set("conditionalLogic", { ...form.conditionalLogic!, value: parseInt(e.target.value) || "" })}
                          className="h-8 w-28"
                          placeholder="عدد"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="text-xs text-muted-foreground mb-1.5 block">مقدار</label>
                        <Input
                          value={typeof form.conditionalLogic.value === "string" ? form.conditionalLogic.value : ""}
                          onChange={(e) => set("conditionalLogic", { ...form.conditionalLogic!, value: e.target.value })}
                          className="h-8"
                          placeholder="مقدار مورد انتظار..."
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : null;
          })()}

          {/* ── 10. Special message ── */}
          <div>
            <label className="text-sm font-semibold mb-1.5 block text-foreground">پیام ویژه (اختیاری)</label>
            <Input
              value={form.specialMessage ?? ""}
              onChange={(e) => set("specialMessage", e.target.value)}
              placeholder="بعد از پاسخ دادن به این سوال نمایش داده می‌شود..."
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose} type="button">انصراف</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!isValid || isSaving}
            type="button"
          >
            {isSaving
              ? <Loader2 className="w-4 h-4 animate-spin ml-1" />
              : <Save className="w-4 h-4 ml-1" />}
            ذخیره سوال
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Index Editor Dialog ───────────────────────────────────────────────────────

function IndexDialog({
  index,
  onSave,
  onClose,
  isSaving,
}: {
  index: Partial<IndexItem> | null;
  onSave: (idx: Partial<IndexItem>) => void;
  onClose: () => void;
  isSaving?: boolean;
}) {
  const [form, setForm] = useState<Partial<IndexItem>>(
    index ?? { name: "", description: "", weight: 1, minScore: 0, maxScore: 100, levels: [] }
  );

  function set(k: keyof IndexItem, v: unknown) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function addLevel() {
    const lastMax = (form.levels ?? []).at(-1)?.maxPct ?? 0;
    setForm((p) => ({
      ...p,
      levels: [
        ...(p.levels ?? []),
        { label: "", minPct: lastMax, maxPct: Math.min(lastMax + 33, 100), description: "", suggestion: "" },
      ],
    }));
  }

  function updateLevel(i: number, k: string, v: unknown) {
    setForm((p) => ({
      ...p,
      levels: (p.levels ?? []).map((l, li) => (li === i ? { ...l, [k]: v } : l)),
    }));
  }

  function removeLevel(i: number) {
    setForm((p) => ({ ...p, levels: (p.levels ?? []).filter((_, li) => li !== i) }));
  }

  const levelColors = [
    "bg-red-500/10 border-red-500/30",
    "bg-yellow-500/10 border-yellow-500/30",
    "bg-green-500/10 border-green-500/30",
    "bg-blue-500/10 border-blue-500/30",
    "bg-purple-500/10 border-purple-500/30",
  ];

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {index?.id
              ? <><Pencil className="w-4 h-4 text-primary" /> ویرایش شاخص</>
              : <><Plus className="w-4 h-4 text-primary" /> شاخص جدید</>}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-sm font-semibold mb-1.5 block">نام شاخص <span className="text-red-400">*</span></label>
              <Input value={form.name ?? ""} onChange={(e) => set("name", e.target.value)} placeholder="مثلاً: مهارت فروش" />
            </div>
            <div>
              <label className="text-sm font-semibold mb-1.5 block">وزن شاخص</label>
              <Input type="number" min={1} max={10} value={form.weight ?? 1} onChange={(e) => set("weight", Number(e.target.value))} />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold mb-1.5 block">توضیح</label>
            <Textarea value={form.description ?? ""} onChange={(e) => set("description", e.target.value)} rows={2} placeholder="این شاخص چه چیزی را می‌سنجد؟" />
          </div>

          <div className="flex items-start gap-2 bg-blue-500/5 border border-blue-500/20 rounded-lg p-3">
            <Info className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300">
              سطوح را به ترتیب از کم به زیاد تعریف کنید. بازه‌ها بر اساس درصد امتیاز (۰–۱۰۰٪) هستند.
            </p>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-semibold">
                سطوح نتیجه
                {(form.levels ?? []).length > 0 && (
                  <span className="text-muted-foreground font-normal text-xs mr-1">({(form.levels ?? []).length})</span>
                )}
              </label>
              <Button size="sm" variant="outline" onClick={addLevel} type="button">
                <Plus className="w-3.5 h-3.5 ml-1" /> افزودن سطح
              </Button>
            </div>
            <div className="space-y-3">
              {(form.levels ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-4 border border-dashed border-border rounded-lg">
                  هنوز سطحی اضافه نشده — حداقل یک سطح توصیه می‌شود
                </p>
              )}
              {(form.levels ?? []).map((level, i) => (
                <div key={i} className={`border rounded-xl p-3 space-y-2.5 ${levelColors[i % levelColors.length]}`}>
                  <div className="flex gap-2 items-center">
                    <span className="text-xs font-mono bg-background/60 px-1.5 py-0.5 rounded text-muted-foreground">سطح {i + 1}</span>
                    <Input
                      className="flex-1 h-8 bg-background/60"
                      placeholder="نام سطح (مثلاً: پایین / متوسط / عالی)"
                      value={level.label}
                      onChange={(e) => updateLevel(i, "label", e.target.value)}
                    />
                    <button type="button" onClick={() => removeLevel(i)} className="text-red-400 hover:text-red-300 p-1 flex-shrink-0">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">از (٪)</label>
                      <Input type="number" min={0} max={100} value={level.minPct} onChange={(e) => updateLevel(i, "minPct", Number(e.target.value))} className="h-8 text-sm bg-background/60" />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground mb-1 block">تا (٪)</label>
                      <Input type="number" min={0} max={100} value={level.maxPct} onChange={(e) => updateLevel(i, "maxPct", Number(e.target.value))} className="h-8 text-sm bg-background/60" />
                    </div>
                  </div>
                  <Textarea
                    placeholder="توضیح این سطح برای کاربر..."
                    value={level.description}
                    onChange={(e) => updateLevel(i, "description", e.target.value)}
                    rows={2}
                    className="text-sm bg-background/60"
                  />
                  <Textarea
                    placeholder="پیشنهاد و راهکار برای این سطح..."
                    value={level.suggestion}
                    onChange={(e) => updateLevel(i, "suggestion", e.target.value)}
                    rows={2}
                    className="text-sm bg-background/60"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} type="button">انصراف</Button>
          <Button
            onClick={() => onSave(form)}
            disabled={!form.name?.trim() || isSaving}
            type="button"
          >
            {isSaving
              ? <Loader2 className="w-4 h-4 animate-spin ml-1" />
              : <Save className="w-4 h-4 ml-1" />}
            ذخیره شاخص
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Builder ─────────────────────────────────────────────────────────────

const EMPTY_FORM: AssessmentForm = {
  title: "", slug: "", shortDescription: "", description: "",
  coverImage: "", productId: "", category: "", estimatedMinutes: 10,
  startText: "", endText: "", isPublished: false, sortOrder: 0,
  requiresAuth: false, collectContactInfo: false,
  hasAiReport: false, aiReportPrice: 0, disclaimer: "",
};


// ─── RulesTab Component (v57) ─────────────────────────────────────────────────

const CONDITION_TYPES: { value: string; label: string; needsIndex?: boolean; needsQuestion?: boolean }[] = [
  { value: "finalScore",  label: "امتیاز نهایی ترکیبی (۰–۱۰۰)" },
  { value: "indexScore",  label: "امتیاز شاخص (۰–۱۰۰)", needsIndex: true },
  { value: "finalLevel",  label: "سطح نهایی (label)" },
  { value: "indexLevel",  label: "سطح شاخص (label)", needsIndex: true },
  { value: "answer",      label: "پاسخ سوال", needsQuestion: true },
  { value: "leadScore",   label: "Lead Score کاربر" },
];

const OPERATORS: { value: string; label: string }[] = [
  { value: "eq",      label: "مساوی" },
  { value: "neq",     label: "نامساوی" },
  { value: "gte",     label: "بزرگتر‌مساوی (≥)" },
  { value: "gt",      label: "بزرگتر (>)" },
  { value: "lte",     label: "کوچکتر‌مساوی (≤)" },
  { value: "lt",      label: "کوچکتر (<)" },
  { value: "between", label: "بین (min,max)" },
  { value: "in",      label: "یکی از (...)" },
  { value: "contains",label: "شامل" },
];

const CTA_STYLES: { value: string; label: string; color: string }[] = [
  { value: "primary", label: "طلایی (اصلی)", color: "bg-yellow-500" },
  { value: "success", label: "سبز (موفق)",  color: "bg-green-500" },
  { value: "warning", label: "نارنجی (هشدار)", color: "bg-orange-500" },
  { value: "danger",  label: "قرمز (خطر)",  color: "bg-red-500" },
  { value: "info",    label: "آبی (اطلاع)", color: "bg-blue-500" },
];

function emptyRule(): Omit<AssessmentRule, "id" | "assessmentId" | "createdAt" | "updatedAt"> {
  return {
    name: "",
    description: "",
    isActive: true,
    sortOrder: 0,
    conditionMode: "all",
    conditions: [],
    actions: {},
  };
}

function emptyCondition(): RuleCondition {
  return { type: "finalScore", operator: "gte", value: 70 };
}

function RulesTab({ assessmentId, indices }: { assessmentId: number; indices: IndexItem[] }) {
  const qc = useQueryClient();
  const [editRule, setEditRule] = useState<AssessmentRule | Partial<AssessmentRule> | null>(null);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  // Lists for suggestions
  const { data: products = [] } = useQuery<SimpleItem[]>({
    queryKey: ["/admin/products-simple"],
    queryFn: async () => {
      const res = await get<{ categories: Array<{ products: SimpleItem[] }>; uncategorized: SimpleItem[] }>("/admin/products");
      const all: SimpleItem[] = [];
      (res.categories ?? []).forEach((c) => all.push(...(c.products ?? [])));
      all.push(...(res.uncategorized ?? []));
      return all.map((p) => ({ id: p.id, title: (p as any).title }));
    },
  });

  const { data: courses = [] } = useQuery<SimpleItem[]>({
    queryKey: ["/admin/courses-simple"],
    queryFn: async () => {
      const res = await get<SimpleItem[]>("/admin/courses");
      return (res as any[]).map((c) => ({ id: c.id, title: c.title }));
    },
  });

  const { data: assessments = [] } = useQuery<SimpleItem[]>({
    queryKey: ["/admin/assessments-simple"],
    queryFn: async () => {
      const res = await get<SimpleItem[]>("/admin/assessments");
      return (res as any[]).map((a) => ({ id: a.id, title: a.title }));
    },
  });

  const { data: rules = [], isLoading } = useQuery<AssessmentRule[]>({
    queryKey: [`/admin/assessments/${assessmentId}/rules`],
    queryFn: () => get(`/admin/assessments/${assessmentId}/rules`),
    enabled: !!assessmentId,
  });

  const saveMutation = useMutation({
    mutationFn: (rule: Partial<AssessmentRule>) => {
      if (rule.id) {
        return put(`/admin/assessments/rules/${rule.id}`, rule);
      }
      return post(`/admin/assessments/${assessmentId}/rules`, rule);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/admin/assessments/${assessmentId}/rules`] });
      setEditRule(null);
      toast.success("قانون ذخیره شد");
    },
    onError: (err: Error) => toast.error(err.message ?? "خطا"),
  });

  const toggleMutation = useMutation({
    mutationFn: (rule: AssessmentRule) =>
      put(`/admin/assessments/rules/${rule.id}`, { isActive: !rule.isActive }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/admin/assessments/${assessmentId}/rules`] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => del(`/admin/assessments/rules/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [`/admin/assessments/${assessmentId}/rules`] });
      setDeleteId(null);
    },
  });

  const reorderMutation = useMutation({
    mutationFn: (orderedIds: number[]) =>
      put(`/admin/assessments/${assessmentId}/rules/reorder`, { orderedIds }),
    onSuccess: () => qc.invalidateQueries({ queryKey: [`/admin/assessments/${assessmentId}/rules`] }),
  });

  if (isLoading) return <div className="flex items-center justify-center h-40"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>;

  return (
    <div dir="rtl" className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" /> Rules Engine
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            قوانین داینامیک برای پیشنهاد محصول، دوره، تست و پیام‌های شخصی‌سازی‌شده
          </p>
        </div>
        <Button size="sm" onClick={() => setEditRule({ ...emptyRule(), sortOrder: rules.length })}>
          <Plus className="w-4 h-4 ml-1" /> قانون جدید
        </Button>
      </div>

      {rules.length === 0 && (
        <div className="bg-muted/30 border border-dashed border-border rounded-xl p-10 text-center">
          <GitBranch className="w-8 h-8 text-muted-foreground mx-auto mb-2 opacity-40" />
          <p className="text-sm text-muted-foreground">هیچ قانونی تعریف نشده است</p>
          <p className="text-xs text-muted-foreground/60 mt-1">با کلیک روی «قانون جدید» شروع کنید</p>
        </div>
      )}

      <div className="space-y-2">
        {rules.map((rule, idx) => (
          <div
            key={rule.id}
            className={`border rounded-xl overflow-hidden transition-opacity ${rule.isActive ? "border-border" : "border-border/40 opacity-60"}`}
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-card">
              <button
                className="cursor-grab text-muted-foreground/40 hover:text-muted-foreground"
                title="جابجایی"
                onClick={() => {
                  if (idx > 0) {
                    const ids = rules.map((r) => r.id);
                    [ids[idx - 1], ids[idx]] = [ids[idx], ids[idx - 1]];
                    reorderMutation.mutate(ids);
                  }
                }}
              >
                <GripVertical className="w-4 h-4" />
              </button>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-semibold text-foreground truncate">{rule.name}</span>
                  <Badge variant="outline" className={`text-xs ${rule.conditionMode === "all" ? "border-blue-400/40 text-blue-400" : "border-purple-400/40 text-purple-400"}`}>
                    {rule.conditionMode === "all" ? "همه شروط (AND)" : "هر شرط (OR)"}
                  </Badge>
                  <Badge variant="outline" className="text-xs border-border/40 text-muted-foreground">
                    {rule.conditions.length} شرط
                  </Badge>
                </div>
                {rule.description && (
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">{rule.description}</p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-1.5">
                  {(rule.actions.suggestedProductIds ?? []).length > 0 && (
                    <span className="text-xs bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                      <ShoppingBag className="w-3 h-3" /> {rule.actions.suggestedProductIds!.length} محصول
                    </span>
                  )}
                  {(rule.actions.suggestedCourseIds ?? []).length > 0 && (
                    <span className="text-xs bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                      <BookOpen className="w-3 h-3" /> {rule.actions.suggestedCourseIds!.length} دوره
                    </span>
                  )}
                  {(rule.actions.suggestedAssessmentIds ?? []).length > 0 && (
                    <span className="text-xs bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-full px-2 py-0.5 flex items-center gap-1">
                      <FlaskConical className="w-3 h-3" /> {rule.actions.suggestedAssessmentIds!.length} تست
                    </span>
                  )}
                  {rule.actions.ctaText && (
                    <span className="text-xs bg-yellow-500/10 text-yellow-400 border border-yellow-500/20 rounded-full px-2 py-0.5">
                      CTA: {rule.actions.ctaText}
                    </span>
                  )}
                  {rule.actions.messageTitle && (
                    <span className="text-xs bg-primary/10 text-primary border border-primary/20 rounded-full px-2 py-0.5">
                      پیام: {rule.actions.messageTitle}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  onClick={() => toggleMutation.mutate(rule)}
                  title={rule.isActive ? "غیرفعال" : "فعال"}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                >
                  {rule.isActive
                    ? <Eye className="w-4 h-4 text-green-400" />
                    : <EyeOff className="w-4 h-4 text-muted-foreground" />}
                </button>
                <button
                  onClick={() => setEditRule(rule)}
                  className="p-1.5 rounded hover:bg-muted transition-colors"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
                <button
                  onClick={() => setDeleteId(rule.id)}
                  className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4 text-red-400" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Rule Dialog ── */}
      {editRule !== null && (
        <RuleDialog
          rule={editRule as AssessmentRule}
          indices={indices}
          products={products}
          courses={courses}
          assessments={assessments}
          onSave={(r) => saveMutation.mutate(r)}
          onClose={() => setEditRule(null)}
          isSaving={saveMutation.isPending}
        />
      )}

      {/* ── Delete Dialog ── */}
      <AlertDialog open={deleteId !== null} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف قانون</AlertDialogTitle>
            <AlertDialogDescription>این قانون برای همیشه حذف می‌شود.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>انصراف</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId && deleteMutation.mutate(deleteId)}
              className="bg-red-500 hover:bg-red-600"
            >
              {deleteMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "حذف"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── RuleDialog Component ─────────────────────────────────────────────────────

function RuleDialog({
  rule,
  indices,
  products,
  courses,
  assessments: allAssessments,
  onSave,
  onClose,
  isSaving,
}: {
  rule: AssessmentRule | Partial<AssessmentRule>;
  indices: IndexItem[];
  products: SimpleItem[];
  courses: SimpleItem[];
  assessments: SimpleItem[];
  onSave: (r: Partial<AssessmentRule>) => void;
  onClose: () => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(rule.name ?? "");
  const [description, setDescription] = useState(rule.description ?? "");
  const [isActive, setIsActive] = useState(rule.isActive ?? true);
  const [conditionMode, setConditionMode] = useState<RuleConditionMode>(rule.conditionMode ?? "all");
  const [conditions, setConditions] = useState<RuleCondition[]>(
    Array.isArray(rule.conditions) ? rule.conditions : []
  );
  const [actions, setActions] = useState<RuleAction>(
    (rule.actions as RuleAction) ?? {}
  );

  const [productSearch, setProductSearch] = useState("");
  const [courseSearch, setCourseSearch] = useState("");
  const [assessmentSearch, setAssessmentSearch] = useState("");

  const selectedProducts = (actions.suggestedProductIds ?? []);
  const selectedCourses = (actions.suggestedCourseIds ?? []);
  const selectedAssessments = (actions.suggestedAssessmentIds ?? []);

  function addCondition() {
    setConditions((prev) => [...prev, emptyCondition()]);
  }

  function updateCondition(idx: number, patch: Partial<RuleCondition>) {
    setConditions((prev) => prev.map((c, i) => i === idx ? { ...c, ...patch } : c));
  }

  function removeCondition(idx: number) {
    setConditions((prev) => prev.filter((_, i) => i !== idx));
  }

  function toggleProduct(id: number) {
    setActions((prev) => {
      const ids = prev.suggestedProductIds ?? [];
      return {
        ...prev,
        suggestedProductIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      };
    });
  }

  function toggleCourse(id: number) {
    setActions((prev) => {
      const ids = prev.suggestedCourseIds ?? [];
      return {
        ...prev,
        suggestedCourseIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      };
    });
  }

  function toggleAssessment(id: number) {
    setActions((prev) => {
      const ids = prev.suggestedAssessmentIds ?? [];
      return {
        ...prev,
        suggestedAssessmentIds: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id],
      };
    });
  }

  function handleSave() {
    if (!name.trim()) { toast.error("نام قانون الزامی است"); return; }
    onSave({
      ...rule,
      name: name.trim(),
      description: description.trim() || undefined,
      isActive,
      conditionMode,
      conditions,
      actions,
    });
  }

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-yellow-400" />
            {(rule as AssessmentRule).id ? "ویرایش قانون" : "قانون جدید"}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* ── نام و فعال/غیرفعال ── */}
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <label className="text-xs font-semibold mb-1 block">نام داخلی قانون <span className="text-red-400">*</span></label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="مثلاً: امتیاز بالا ← پیشنهاد دوره پیشرفته" />
            </div>
            <div className="flex items-center gap-2 mt-5">
              <span className="text-xs text-muted-foreground">فعال</span>
              <Switch checked={isActive} onCheckedChange={setIsActive} />
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold mb-1 block">توضیح (اختیاری)</label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="یادداشت داخلی..." />
          </div>

          {/* ══ شروط ══ */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 flex items-center gap-3 border-b border-border">
              <GitBranch className="w-4 h-4 text-primary" />
              <span className="text-sm font-semibold">شروط (Conditions)</span>
              <div className="mr-auto flex items-center gap-2">
                <span className="text-xs text-muted-foreground">حالت:</span>
                <Select value={conditionMode} onValueChange={(v) => setConditionMode(v as RuleConditionMode)}>
                  <SelectTrigger className="h-7 w-32 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">همه (AND)</SelectItem>
                    <SelectItem value="any">هر کدام (OR)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="p-3 space-y-2">
              {conditions.length === 0 && (
                <p className="text-xs text-muted-foreground text-center py-3">شرطی تعریف نشده — این قانون هیچگاه فعال نمی‌شود</p>
              )}
              {conditions.map((cond, idx) => {
                const typeMeta = CONDITION_TYPES.find((t) => t.value === cond.type);
                return (
                  <div key={idx} className="border border-border/60 rounded-lg p-3 space-y-2 bg-background/50">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-muted-foreground w-5">{idx + 1}.</span>
                      <Select value={cond.type} onValueChange={(v) => updateCondition(idx, { type: v as RuleConditionType, indexId: undefined, questionId: undefined })}>
                        <SelectTrigger className="h-8 text-xs flex-1">
                          <SelectValue placeholder="نوع شرط" />
                        </SelectTrigger>
                        <SelectContent>
                          {CONDITION_TYPES.map((t) => (
                            <SelectItem key={t.value} value={t.value} className="text-xs">{t.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <button onClick={() => removeCondition(idx)} className="p-1 rounded hover:bg-red-500/10 text-red-400">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="flex items-center gap-2 pr-5">
                      {typeMeta?.needsIndex && (
                        <Select value={cond.indexId ? String(cond.indexId) : ""} onValueChange={(v) => updateCondition(idx, { indexId: Number(v) })}>
                          <SelectTrigger className="h-7 text-xs flex-1">
                            <SelectValue placeholder="انتخاب شاخص" />
                          </SelectTrigger>
                          <SelectContent>
                            {indices.map((ix) => (
                              <SelectItem key={ix.id} value={String(ix.id)} className="text-xs">{ix.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                      <Select value={cond.operator} onValueChange={(v) => updateCondition(idx, { operator: v as RuleOperator })}>
                        <SelectTrigger className="h-7 text-xs w-36">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {OPERATORS.map((op) => (
                            <SelectItem key={op.value} value={op.value} className="text-xs">{op.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        className="h-7 text-xs flex-1"
                        placeholder={cond.operator === "between" ? "مثلاً: 40,70" : cond.operator === "in" ? "مثلاً: a,b,c" : "مقدار"}
                        value={
                          Array.isArray(cond.value)
                            ? (cond.value as unknown[]).join(",")
                            : String(cond.value ?? "")
                        }
                        onChange={(e) => {
                          const raw = e.target.value;
                          if (cond.operator === "between" || cond.operator === "in") {
                            const parts = raw.split(",").map((s) => s.trim());
                            updateCondition(idx, { value: cond.operator === "between" ? parts.map(Number) : parts });
                          } else {
                            updateCondition(idx, { value: isNaN(Number(raw)) ? raw : Number(raw) });
                          }
                        }}
                      />
                    </div>
                  </div>
                );
              })}
              <button
                onClick={addCondition}
                className="w-full text-xs text-primary border border-dashed border-primary/40 rounded-lg py-2 hover:bg-primary/5 transition-colors flex items-center justify-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" /> افزودن شرط
              </button>
            </div>
          </div>

          {/* ══ اقدامات ══ */}
          <div className="border border-border rounded-xl overflow-hidden">
            <div className="bg-muted/30 px-4 py-3 border-b border-border flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" />
              <span className="text-sm font-semibold">اقدامات (Actions)</span>
            </div>

            <div className="p-4 space-y-5">
              {/* ─ محصولات ─ */}
              <div>
                <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <ShoppingBag className="w-3.5 h-3.5 text-emerald-400" /> محصولات پیشنهادی
                  {selectedProducts.length > 0 && <Badge className="text-xs h-4 px-1.5 bg-emerald-500/20 text-emerald-400 border-0">{selectedProducts.length}</Badge>}
                </label>
                <Input
                  className="h-7 text-xs mb-2"
                  placeholder="جستجوی محصول..."
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                />
                <div className="max-h-32 overflow-y-auto space-y-1 border border-border/40 rounded-lg p-2">
                  {products.filter((p) => p.title.toLowerCase().includes(productSearch.toLowerCase())).map((p) => (
                    <label key={p.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedProducts.includes(p.id)}
                        onChange={() => toggleProduct(p.id)}
                        className="accent-primary"
                      />
                      <span>{p.title}</span>
                    </label>
                  ))}
                  {products.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">محصولی یافت نشد</p>}
                </div>
              </div>

              {/* ─ دوره‌ها ─ */}
              <div>
                <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <BookOpen className="w-3.5 h-3.5 text-blue-400" /> دوره‌های پیشنهادی
                  {selectedCourses.length > 0 && <Badge className="text-xs h-4 px-1.5 bg-blue-500/20 text-blue-400 border-0">{selectedCourses.length}</Badge>}
                </label>
                <Input
                  className="h-7 text-xs mb-2"
                  placeholder="جستجوی دوره..."
                  value={courseSearch}
                  onChange={(e) => setCourseSearch(e.target.value)}
                />
                <div className="max-h-32 overflow-y-auto space-y-1 border border-border/40 rounded-lg p-2">
                  {courses.filter((c) => c.title.toLowerCase().includes(courseSearch.toLowerCase())).map((c) => (
                    <label key={c.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedCourses.includes(c.id)}
                        onChange={() => toggleCourse(c.id)}
                        className="accent-primary"
                      />
                      <span>{c.title}</span>
                    </label>
                  ))}
                  {courses.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">دوره‌ای یافت نشد</p>}
                </div>
              </div>

              {/* ─ تست‌های بعدی ─ */}
              <div>
                <label className="text-xs font-semibold mb-2 flex items-center gap-1.5">
                  <FlaskConical className="w-3.5 h-3.5 text-purple-400" /> تست‌های پیشنهادی
                  {selectedAssessments.length > 0 && <Badge className="text-xs h-4 px-1.5 bg-purple-500/20 text-purple-400 border-0">{selectedAssessments.length}</Badge>}
                </label>
                <Input
                  className="h-7 text-xs mb-2"
                  placeholder="جستجوی تست..."
                  value={assessmentSearch}
                  onChange={(e) => setAssessmentSearch(e.target.value)}
                />
                <div className="max-h-32 overflow-y-auto space-y-1 border border-border/40 rounded-lg p-2">
                  {allAssessments.filter((a) => a.title.toLowerCase().includes(assessmentSearch.toLowerCase())).map((a) => (
                    <label key={a.id} className="flex items-center gap-2 text-xs cursor-pointer hover:bg-muted/40 px-2 py-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedAssessments.includes(a.id)}
                        onChange={() => toggleAssessment(a.id)}
                        className="accent-primary"
                      />
                      <span>{a.title}</span>
                    </label>
                  ))}
                  {allAssessments.length === 0 && <p className="text-xs text-muted-foreground text-center py-2">تستی یافت نشد</p>}
                </div>
              </div>

              {/* ─ CTA ─ */}
              <div className="border border-border/40 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Call to Action (CTA)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">متن دکمه</label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="مثلاً: همین الان ثبت‌نام کن"
                      value={actions.ctaText ?? ""}
                      onChange={(e) => setActions((prev) => ({ ...prev, ctaText: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">لینک</label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="مثلاً: /courses/123"
                      value={actions.ctaUrl ?? ""}
                      onChange={(e) => setActions((prev) => ({ ...prev, ctaUrl: e.target.value || undefined }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">رنگ دکمه</label>
                  <div className="flex flex-wrap gap-2">
                    {CTA_STYLES.map((s) => (
                      <button
                        key={s.value}
                        onClick={() => setActions((prev) => ({ ...prev, ctaStyle: s.value as CtaStyle }))}
                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border transition-all ${
                          actions.ctaStyle === s.value
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground hover:border-border/80"
                        }`}
                      >
                        <div className={`w-2 h-2 rounded-full ${s.color}`} />
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ─ پیام ─ */}
              <div className="border border-border/40 rounded-xl p-3 space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">پیام شخصی‌سازی‌شده</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-medium mb-1 block">آیکون (emoji)</label>
                    <Input
                      className="h-8 text-sm"
                      placeholder="مثلاً: 🎯"
                      value={actions.messageIcon ?? ""}
                      onChange={(e) => setActions((prev) => ({ ...prev, messageIcon: e.target.value || undefined }))}
                    />
                  </div>
                  <div>
                    <label className="text-xs font-medium mb-1 block">برچسب (badge)</label>
                    <Input
                      className="h-8 text-xs"
                      placeholder="مثلاً: توصیه ویژه"
                      value={actions.messageBadge ?? ""}
                      onChange={(e) => setActions((prev) => ({ ...prev, messageBadge: e.target.value || undefined }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">عنوان پیام</label>
                  <Input
                    className="h-8 text-xs"
                    placeholder="مثلاً: مسیر رشد شما آماده است!"
                    value={actions.messageTitle ?? ""}
                    onChange={(e) => setActions((prev) => ({ ...prev, messageTitle: e.target.value || undefined }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium mb-1 block">متن پیام</label>
                  <Textarea
                    className="text-xs resize-none"
                    rows={3}
                    placeholder="متنی که در صفحه نتیجه به کاربر نمایش داده می‌شود..."
                    value={actions.messageBody ?? ""}
                    onChange={(e) => setActions((prev) => ({ ...prev, messageBody: e.target.value || undefined }))}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={isSaving}>انصراف</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
            ذخیره قانون
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AssessmentBuilder() {
  const { id: rawId } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const qc = useQueryClient();
  const isNew = !rawId || rawId === "new";
  const asmId = isNew ? null : parseInt(rawId ?? "0");

  const [form, setForm] = useState<AssessmentForm>(EMPTY_FORM);
  const [activeTab, setActiveTab] = useState("info");
  const [editQuestion, setEditQuestion] = useState<Partial<Question> | null | false>(false);
  const [editIndex, setEditIndex] = useState<Partial<IndexItem> | null | false>(false);
  const [coverUploading, setCoverUploading] = useState(false);

  const { data: existing, isLoading: loadingAsm } = useQuery<AssessmentForm & { id: number; productId?: number | null }>({
    queryKey: ["/admin/assessments", asmId],
    queryFn: () => get(`/admin/assessments/${asmId}`),
    enabled: !isNew && !!asmId,
  });

  useEffect(() => {
    if (existing) {
      setForm({
        title: existing.title ?? "",
        slug: existing.slug ?? "",
        shortDescription: (existing as Record<string, string>).shortDescription ?? "",
        description: existing.description ?? "",
        coverImage: existing.coverImage ?? "",
        productId: existing.productId ? String(existing.productId) : "",
        category: existing.category ?? "",
        estimatedMinutes: (existing as Record<string, number>).estimatedMinutes ?? 10,
        startText: (existing as Record<string, string>).startText ?? "",
        endText: (existing as Record<string, string>).endText ?? "",
        isPublished: existing.isPublished ?? false,
        sortOrder: existing.sortOrder ?? 0,
        requiresAuth: existing.requiresAuth ?? false,
        collectContactInfo: existing.collectContactInfo ?? false,
        hasAiReport: existing.hasAiReport ?? false,
        aiReportPrice: existing.aiReportPrice ?? 0,
        disclaimer: existing.disclaimer ?? "",
      });
    }
  }, [existing]);

  const { data: questions = [] } = useQuery<Question[]>({
    queryKey: ["/admin/assessments/questions", asmId],
    queryFn: () => get(`/admin/assessments/${asmId}/questions`),
    enabled: !isNew && !!asmId,
  });

  const { data: indices = [] } = useQuery<IndexItem[]>({
    queryKey: ["/admin/assessments/indices", asmId],
    queryFn: () => get(`/admin/assessments/${asmId}/indices`),
    enabled: !isNew && !!asmId,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────

  const saveMutation = useMutation({
    mutationFn: async () => {
      const body = { ...form, productId: form.productId ? parseInt(form.productId) : null };
      if (isNew) return post<{ id: number }>("/admin/assessments", body);
      return put<{ id: number }>(`/admin/assessments/${asmId}`, body);
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["/admin/assessments"] });
      toast.success(isNew ? "تست ایجاد شد" : "تست ذخیره شد");
      if (isNew) setLocation(`/assessments/${data.id}/edit`);
    },
    onError: (err: Error) => toast.error(err.message ?? "خطا در ذخیره"),
  });

  const saveQuestionMutation = useMutation({
    mutationFn: (q: Partial<Question>) => {
      if (q.id) return put(`/admin/assessments/questions/${q.id}`, q);
      return post(`/admin/assessments/${asmId}/questions`, q);
    },
    onSuccess: (_, q) => {
      qc.invalidateQueries({ queryKey: ["/admin/assessments/questions", asmId] });
      setEditQuestion(false);
      toast.success(q.id ? "سوال ویرایش شد" : "سوال اضافه شد");
    },
    onError: (err: Error) => toast.error(err.message ?? "خطا در ذخیره سوال"),
  });

  const deleteQuestionMutation = useMutation({
    mutationFn: (qid: number) => del(`/admin/assessments/questions/${qid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/assessments/questions", asmId] });
      toast.success("سوال حذف شد");
    },
    onError: (err: Error) => toast.error(err.message ?? "خطا"),
  });

  const reorderMutation = useMutation({
    mutationFn: (ids: number[]) => put(`/admin/assessments/${asmId}/questions/reorder`, { ids }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/admin/assessments/questions", asmId] }),
  });

  const saveIndexMutation = useMutation({
    mutationFn: (idx: Partial<IndexItem>) => {
      if (idx.id) return put(`/admin/assessments/indices/${idx.id}`, idx);
      return post(`/admin/assessments/${asmId}/indices`, idx);
    },
    onSuccess: (_, idx) => {
      qc.invalidateQueries({ queryKey: ["/admin/assessments/indices", asmId] });
      setEditIndex(false);
      toast.success(idx.id ? "شاخص ویرایش شد" : "شاخص اضافه شد");
    },
    onError: (err: Error) => toast.error(err.message ?? "خطا در ذخیره شاخص"),
  });

  const deleteIndexMutation = useMutation({
    mutationFn: (iid: number) => del(`/admin/assessments/indices/${iid}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/admin/assessments/indices", asmId] });
      toast.success("شاخص حذف شد");
    },
    onError: (err: Error) => toast.error(err.message ?? "خطا"),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  function setF(k: keyof AssessmentForm, v: unknown) {
    setForm((p) => ({ ...p, [k]: v }));
  }

  function autoSlug(title: string) {
    const slug = title
      .toLowerCase()
      .replace(/[\u0600-\u06FF\s]+/g, "-")
      .replace(/[^a-z0-9\-]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 60);
    setF("slug", slug || title.replace(/\s+/g, "-").slice(0, 60));
  }

  function moveQuestion(index: number, dir: -1 | 1) {
    const sorted = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);
    const to = index + dir;
    if (to < 0 || to >= sorted.length) return;
    [sorted[index], sorted[to]] = [sorted[to], sorted[index]];
    reorderMutation.mutate(sorted.map((q) => q.id));
  }

  const sortedQuestions = [...questions].sort((a, b) => a.sortOrder - b.sortOrder);

  if (!isNew && loadingAsm) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div dir="rtl">
      {/* ── Header ── */}
      <div className="flex items-center gap-3 mb-6">
        <Link href="/assessments">
          <button className="p-2 rounded-lg hover:bg-muted transition-colors" title="بازگشت">
            <ChevronRight className="w-5 h-5" />
          </button>
        </Link>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-black flex items-center gap-2 text-foreground">
            <Brain className="w-5 h-5 text-primary flex-shrink-0" />
            <span className="truncate">{isNew ? "تست جدید" : (form.title || "ویرایش تست")}</span>
          </h1>
          {!isNew && (
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">/{form.slug}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {!isNew && (
            <Badge variant={form.isPublished ? "default" : "outline"} className="text-xs">
              {form.isPublished ? "منتشر شده" : "پیش‌نویس"}
            </Badge>
          )}
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !form.title.trim()}
          >
            {saveMutation.isPending
              ? <Loader2 className="w-4 h-4 animate-spin ml-1" />
              : <Save className="w-4 h-4 ml-1" />}
            ذخیره
          </Button>
        </div>
      </div>

      {saveMutation.isError && (
        <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-lg p-3 mb-4 text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {(saveMutation.error as Error).message}
        </div>
      )}

      {isNew && (
        <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-400 rounded-lg p-3 mb-4 text-sm">
          <Info className="w-4 h-4 flex-shrink-0" />
          ابتدا اطلاعات تست را ذخیره کنید تا بتوانید سوال و شاخص اضافه کنید.
        </div>
      )}

      <Tabs value={activeTab} onValueChange={setActiveTab} dir="rtl">
        <TabsList className="mb-6">
          <TabsTrigger value="info" className="gap-2">
            <Brain className="w-4 h-4" /> اطلاعات تست
          </TabsTrigger>
          <TabsTrigger value="questions" className="gap-2" disabled={isNew}>
            <ListChecks className="w-4 h-4" />
            سوالات
            {questions.length > 0 && (
              <Badge className="text-xs h-4 px-1.5 bg-primary/20 text-primary border-primary/30">{questions.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="indices" className="gap-2" disabled={isNew}>
            <Target className="w-4 h-4" />
            شاخص‌ها
            {indices.length > 0 && (
              <Badge className="text-xs h-4 px-1.5 bg-primary/20 text-primary border-primary/30">{indices.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="rules" className="gap-2" disabled={isNew}>
            <Zap className="w-4 h-4" />
            قوانین
          </TabsTrigger>
        </TabsList>

        {/* ══ INFO TAB ══ */}
        <TabsContent value="info">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-5">
              <div>
                <label className="text-sm font-semibold mb-1.5 block">عنوان تست <span className="text-red-400">*</span></label>
                <Input
                  value={form.title}
                  onChange={(e) => { setF("title", e.target.value); if (isNew) autoSlug(e.target.value); }}
                  placeholder="عنوان تست..."
                />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">Slug (آدرس) <span className="text-red-400">*</span></label>
                <Input
                  value={form.slug}
                  onChange={(e) => setF("slug", e.target.value)}
                  placeholder="test-slug"
                  dir="ltr"
                />
                {form.slug && <p className="text-xs text-muted-foreground mt-1">آدرس: /assessment/{form.slug}</p>}
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">توضیح کوتاه</label>
                <Textarea value={form.shortDescription} onChange={(e) => setF("shortDescription", e.target.value)} rows={2} placeholder="یک جمله توضیح که در کارت تست نمایش داده می‌شود..." />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">توضیح کامل</label>
                <Textarea value={form.description} onChange={(e) => setF("description", e.target.value)} rows={4} placeholder="توضیح جامع تست برای صفحه شروع..." />
              </div>

              {/* Cover Image */}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">تصویر کاور</label>
                <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
                  <Info className="w-3 h-3 flex-shrink-0" />
                  ابعاد توصیه‌شده: <span className="font-mono font-medium text-foreground">۱۲۰۰ × ۶۳۰</span> — حداکثر ۵ مگابایت
                </p>
                {form.coverImage ? (
                  <div className="relative rounded-xl overflow-hidden border border-border bg-muted/30">
                    <img src={normalizeImageUrl(form.coverImage)} alt="cover" className="w-full h-36 object-cover" onError={(e) => (e.currentTarget.style.display = "none")} />
                    <button type="button" onClick={() => setF("coverImage", "")} className="absolute top-2 left-2 bg-black/60 hover:bg-black/80 text-white rounded-full p-1 transition-colors">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-6 cursor-pointer transition-colors ${coverUploading ? "border-primary/50 bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}`}>
                    <input type="file" accept="image/*" className="hidden" disabled={coverUploading}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 5 * 1024 * 1024) { toast.error("حجم تصویر نباید بیشتر از ۵ مگابایت باشد"); return; }
                        setCoverUploading(true);
                        try {
                          const { url } = await uploadFile("/upload/image", file);
                          setF("coverImage", url);
                          toast.success("تصویر کاور آپلود شد");
                        } catch (err: unknown) {
                          toast.error((err as Error).message ?? "خطا در آپلود تصویر");
                        } finally { setCoverUploading(false); e.target.value = ""; }
                      }}
                    />
                    {coverUploading ? (
                      <><Loader2 className="w-7 h-7 text-primary animate-spin" /><p className="text-sm text-primary font-medium">در حال آپلود...</p></>
                    ) : (
                      <><div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center"><ImageIcon className="w-5 h-5 text-primary" /></div><div className="text-center"><p className="text-sm font-medium text-foreground">انتخاب از گالری</p><p className="text-xs text-muted-foreground mt-0.5">PNG، JPG، WebP — حداکثر ۵MB</p></div></>
                    )}
                  </label>
                )}
              </div>
            </div>

            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">دسته‌بندی</label>
                  <Input value={form.category} onChange={(e) => setF("category", e.target.value)} placeholder="مثلاً: شخصیت‌شناسی" />
                </div>
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">زمان (دقیقه)</label>
                  <Input type="number" min={1} value={form.estimatedMinutes} onChange={(e) => setF("estimatedMinutes", Number(e.target.value))} />
                </div>
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">متن صفحه شروع</label>
                <Textarea value={form.startText} onChange={(e) => setF("startText", e.target.value)} rows={3} placeholder="متنی که قبل از شروع تست نمایش داده می‌شود..." />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">متن صفحه پایان</label>
                <Textarea value={form.endText} onChange={(e) => setF("endText", e.target.value)} rows={3} placeholder="متنی که در صفحه نتیجه نمایش داده می‌شود..." />
              </div>
              <div>
                <label className="text-sm font-semibold mb-1.5 block">ترتیب نمایش</label>
                <Input type="number" min={0} value={form.sortOrder} onChange={(e) => setF("sortOrder", Number(e.target.value))} />
              </div>

              <div className="bg-card border border-border rounded-xl p-4 space-y-4">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">تنظیمات</p>
                {[
                  { key: "isPublished",       label: "منتشر شده",              desc: "نمایش در صفحه ابزارها" },
                  { key: "requiresAuth",       label: "نیاز به ورود",           desc: "کاربر باید لاگین باشد" },
                  { key: "collectContactInfo", label: "جمع‌آوری اطلاعات تماس", desc: "فرم نام و موبایل" },
                  { key: "hasAiReport",        label: "گزارش AI",               desc: "گزارش شخصی‌سازی‌شده GPT" },
                ].map(({ key, label, desc }) => (
                  <div key={key} className="flex items-center justify-between">
                    <div><p className="text-sm font-medium">{label}</p><p className="text-xs text-muted-foreground">{desc}</p></div>
                    <Switch checked={form[key as keyof AssessmentForm] as boolean} onCheckedChange={(v) => setF(key as keyof AssessmentForm, v)} />
                  </div>
                ))}
              </div>

              {form.hasAiReport && (
                <div>
                  <label className="text-sm font-semibold mb-1.5 block">قیمت گزارش AI (تومان — صفر = رایگان)</label>
                  <Input type="number" min={0} step={10000} value={form.aiReportPrice} onChange={(e) => setF("aiReportPrice", Number(e.target.value))} />
                </div>
              )}
              <div>
                <label className="text-sm font-semibold mb-1.5 block">سلب مسئولیت (اختیاری)</label>
                <Textarea value={form.disclaimer} onChange={(e) => setF("disclaimer", e.target.value)} rows={2} placeholder="متن سلب مسئولیت..." />
              </div>
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-border flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {!form.title.trim() && <span className="text-red-400">عنوان اجباری است</span>}
              {!form.slug.trim() && form.title.trim() && <span className="text-red-400">Slug اجباری است</span>}
            </p>
            <Button
              onClick={() => { saveMutation.mutate(); if (!isNew) setActiveTab("questions"); }}
              disabled={saveMutation.isPending || !form.title.trim() || !form.slug.trim()}
              size="lg"
            >
              {saveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin ml-1" /> : <Save className="w-4 h-4 ml-1" />}
              {isNew ? "ذخیره و رفتن به سوالات ←" : "ذخیره تغییرات"}
            </Button>
          </div>
        </TabsContent>

        {/* ══ QUESTIONS TAB ══ */}
        <TabsContent value="questions">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{questions.length} سوال</p>
              {indices.length === 0 && (
                <p className="text-xs text-amber-400 mt-0.5">
                  💡 ابتدا شاخص‌ها را در تب «شاخص‌ها» تعریف کنید تا بتوانید به سوالات لینک دهید
                </p>
              )}
            </div>
            <Button size="sm" onClick={() => setEditQuestion(null)}>
              <Plus className="w-4 h-4 ml-1" /> سوال جدید
            </Button>
          </div>

          {sortedQuestions.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl text-muted-foreground">
              <ListChecks className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="mb-4 text-sm">هنوز سوالی اضافه نشده</p>
              <Button size="sm" onClick={() => setEditQuestion(null)}>اولین سوال را بساز</Button>
            </div>
          ) : (
            <div className="space-y-2">
              {sortedQuestions.map((q, idx) => {
                const meta = qTypeMeta(q.type);
                const catLabel = QUESTION_CATEGORIES.find(c => c.value === q.questionCategory)?.label;
                // Count options with any indexScores set
                const scoredOptions = (q.options ?? []).filter(o =>
                  o.indexScores && Object.values(o.indexScores).some(s => s !== 0)
                ).length;
                return (
                  <div
                    key={q.id}
                    className={`bg-card border rounded-xl p-4 flex items-start gap-3 transition-all ${
                      q.isActive ? "border-border" : "border-border/40 opacity-60"
                    }`}
                  >
                    <div className="flex flex-col gap-0.5 mt-1 flex-shrink-0">
                      <button onClick={() => moveQuestion(idx, -1)} disabled={idx === 0 || reorderMutation.isPending} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-20">
                        <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => moveQuestion(idx, 1)} disabled={idx === sortedQuestions.length - 1 || reorderMutation.isPending} className="p-1 rounded hover:bg-muted transition-colors disabled:opacity-20">
                        <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground font-mono">#{idx + 1}</span>
                        <Badge variant="outline" className="text-xs gap-1">
                          <span>{meta.icon}</span> {meta.label}
                        </Badge>
                        {!q.isActive && <Badge variant="outline" className="text-xs text-muted-foreground">غیرفعال</Badge>}
                        {q.isRequired && <Badge className="text-xs bg-primary/15 text-primary border-primary/30">اجباری</Badge>}
                        {/* v54 badges */}
                        {(q.questionWeight ?? 1) > 1 && (
                          <Badge className="text-xs bg-amber-500/15 text-amber-400 border-amber-500/30">وزن ×{q.questionWeight}</Badge>
                        )}
                        {catLabel && (
                          <Badge variant="outline" className="text-xs border-blue-500/30 text-blue-400">{catLabel}</Badge>
                        )}
                        {q.options?.length > 0 && (
                          <span className="text-xs text-muted-foreground">{q.options.length} گزینه</span>
                        )}
                        {scoredOptions > 0 && (
                          <span className="text-xs text-green-400 flex items-center gap-0.5">
                            <BarChart3 className="w-3 h-3" /> {scoredOptions} گزینه امتیازدهی‌شده
                          </span>
                        )}
                      </div>
                      <p className="text-sm font-medium text-foreground line-clamp-2">{q.title}</p>
                      {q.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{q.description}</p>}
                      {q.questionGoal && (
                        <p className="text-xs text-muted-foreground/60 mt-0.5 flex items-center gap-1">
                          <Lightbulb className="w-3 h-3 flex-shrink-0" />
                          <span className="line-clamp-1 italic">{q.questionGoal}</span>
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => setEditQuestion(q)} className="p-1.5 rounded hover:bg-muted transition-colors" title="ویرایش">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => { if (confirm("این سوال حذف شود؟")) deleteQuestionMutation.mutate(q.id); }}
                        className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                        title="حذف"
                        disabled={deleteQuestionMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {sortedQuestions.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Button variant="outline" size="sm" onClick={() => setEditQuestion(null)}>
                <Plus className="w-4 h-4 ml-1" /> افزودن سوال
              </Button>
            </div>
          )}
        </TabsContent>

        {/* ══ INDICES TAB ══ */}
        <TabsContent value="indices">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-semibold text-foreground">{indices.length} شاخص</p>
              <p className="text-xs text-muted-foreground mt-0.5">شاخص‌ها ابعاد مختلف ارزیابی را تعریف می‌کنند</p>
            </div>
            <Button size="sm" onClick={() => setEditIndex(null)}>
              <Plus className="w-4 h-4 ml-1" /> شاخص جدید
            </Button>
          </div>

          {indices.length === 0 ? (
            <div className="text-center py-12 border-2 border-dashed border-border rounded-xl text-muted-foreground">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-40" />
              <p className="mb-2 text-sm">هنوز شاخصی تعریف نشده</p>
              <p className="text-xs mb-4 max-w-xs mx-auto">شاخص‌ها ابعادی هستند که سوالات به آن‌ها امتیاز می‌دهند — مثلاً «مهارت فروش» یا «مدیریت زمان»</p>
              <Button size="sm" onClick={() => setEditIndex(null)}>اولین شاخص را بساز</Button>
            </div>
          ) : (
            <div className="space-y-3">
              {indices.map((idx, i) => (
                <div key={idx.id} className="bg-card border border-border rounded-xl p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-xs text-muted-foreground font-mono">#{i + 1}</span>
                        <h3 className="font-semibold text-foreground">{idx.name}</h3>
                      </div>
                      {idx.description && <p className="text-xs text-muted-foreground">{idx.description}</p>}
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <Badge variant="outline" className="text-xs">وزن: {idx.weight}</Badge>
                        <Badge variant="outline" className="text-xs">{idx.levels?.length ?? 0} سطح</Badge>
                        {(idx.levels ?? []).length > 0 && (
                          <div className="flex gap-1">
                            {idx.levels.map((l, li) => (
                              <span key={li} className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                                {l.label || `سطح ${li + 1}`}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 mr-2">
                      <button onClick={() => setEditIndex(idx)} className="p-1.5 rounded hover:bg-muted transition-colors" title="ویرایش">
                        <Pencil className="w-4 h-4 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => { if (confirm("این شاخص حذف شود؟")) deleteIndexMutation.mutate(idx.id); }}
                        className="p-1.5 rounded hover:bg-red-500/10 transition-colors"
                        title="حذف"
                        disabled={deleteIndexMutation.isPending}
                      >
                        <Trash2 className="w-4 h-4 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {indices.length > 0 && (
            <div className="mt-6 bg-green-500/5 border border-green-500/20 rounded-xl p-4">
              <p className="text-sm font-semibold text-green-400 mb-2 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> وضعیت تست
              </p>
              <ul className="space-y-1.5">
                {[
                  { done: !!form.title, text: "عنوان تست" },
                  { done: !!form.slug,  text: "Slug" },
                  { done: questions.length > 0, text: `سوالات (${questions.length})` },
                  { done: indices.length > 0,   text: `شاخص‌ها (${indices.length})` },
                  { done: form.isPublished,      text: "منتشر شده" },
                ].map(({ done, text }) => (
                  <li key={text} className={`text-xs flex items-center gap-2 ${done ? "text-green-400" : "text-muted-foreground"}`}>
                    {done ? <CheckCircle2 className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5 opacity-40" />}
                    {text}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </TabsContent>

        {/* ══ RULES TAB ══ */}
        <TabsContent value="rules">
          {asmId && <RulesTab assessmentId={asmId} indices={indices} />}
        </TabsContent>

      </Tabs>

      {/* ── Dialogs ── */}
      {editQuestion !== false && (
        <QuestionDialog
          question={editQuestion}
          indices={indices}
          allQuestions={sortedQuestions}
          onSave={(q) => saveQuestionMutation.mutate(q)}
          onClose={() => setEditQuestion(false)}
          isSaving={saveQuestionMutation.isPending}
        />
      )}
      {editIndex !== false && (
        <IndexDialog
          index={editIndex}
          onSave={(idx) => saveIndexMutation.mutate(idx)}
          onClose={() => setEditIndex(false)}
          isSaving={saveIndexMutation.isPending}
        />
      )}
    </div>
  );
}
