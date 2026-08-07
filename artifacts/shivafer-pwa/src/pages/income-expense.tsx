import { useState, useMemo, useCallback } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { formatPrice, formatNumber } from "@/lib/persian";
import * as jalaali from "jalaali-js";
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Wallet, Target, Star,
  Trash2, Edit2, X, BarChart2, List, LayoutDashboard,
  PlusCircle, Plus, ChevronRight, Search, Settings2, Check,
  ShoppingBag, Briefcase, Home, Landmark, Gift, FolderOpen,
  Percent, Globe, Tag, DollarSign, ShoppingCart, Coffee,
  Zap, Car, Droplets, Wrench, BookOpen, Megaphone, Users,
  Plane, CreditCard, Wifi, Heart, MoreHorizontal, Building2,
  Baby, Shirt, Fuel,
} from "lucide-react";
import { Link, Redirect } from "wouter";

// ─── HELPERS ────────────────────────────────────────────────────────────────

function toJalali(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  const j = jalaali.toJalaali(y, m, d);
  return `${j.jy}/${String(j.jm).padStart(2, "0")}/${String(j.jd).padStart(2, "0")}`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0];
}

const DEFAULT_INCOME_CATS = [
  "فروش محصول / خدمات", "حقوق", "اجاره", "سرمایه‌گذاری", "سود بانکی",
  "هدیه / کمک مالی", "پروژه کاری", "کمیسیون / پورسانت", "درآمد اینترنتی",
  "فروش دارایی", "سایر درآمدها",
];

const DEFAULT_EXPENSE_CATS = [
  "خوراک و مواد غذایی", "رستوران و کافه", "اجاره خانه", "قبوض و شارژ",
  "حمل‌ونقل", "سوخت خودرو", "تعمیرات خودرو", "پوشاک", "خرید خانه",
  "درمان و دارو", "آموزش", "تبلیغات", "حقوق کارمند", "تفریح و سفر",
  "قسط و بدهی", "اینترنت و موبایل", "خانواده و فرزند", "سرمایه‌گذاری",
  "خیریه و کمک", "سایر هزینه‌ها",
];

// ─── CATEGORY ICONS ─────────────────────────────────────────────────────────

type IconComp = React.FC<{ className?: string }>;

const CATEGORY_ICONS: Record<string, IconComp> = {
  // Income
  "فروش محصول / خدمات": ShoppingBag,
  "حقوق":               Briefcase,
  "اجاره":              Home,
  "سرمایه‌گذاری":       TrendingUp,
  "سود بانکی":          Landmark,
  "هدیه / کمک مالی":   Gift,
  "پروژه کاری":         FolderOpen,
  "کمیسیون / پورسانت": Percent,
  "درآمد اینترنتی":     Globe,
  "فروش دارایی":        Tag,
  "سایر درآمدها":       DollarSign,
  // Expense
  "خوراک و مواد غذایی": ShoppingCart,
  "رستوران و کافه":      Coffee,
  "اجاره خانه":          Home,
  "قبوض و شارژ":         Zap,
  "حمل‌ونقل":            Car,
  "سوخت خودرو":          Fuel,
  "تعمیرات خودرو":       Wrench,
  "پوشاک":               Shirt,
  "خرید خانه":           Building2,
  "درمان و دارو":        Heart,
  "آموزش":               BookOpen,
  "تبلیغات":             Megaphone,
  "حقوق کارمند":         Users,
  "تفریح و سفر":         Plane,
  "قسط و بدهی":          CreditCard,
  "اینترنت و موبایل":    Wifi,
  "خانواده و فرزند":     Baby,
  "خیریه و کمک":         Droplets,
  "سایر هزینه‌ها":        MoreHorizontal,
};

const ALL_DEFAULT_CATS = new Set([...DEFAULT_INCOME_CATS, ...DEFAULT_EXPENSE_CATS]);

// ─── FALLBACK ICONS FOR CUSTOM CATEGORIES ────────────────────────────────────

const FALLBACK_ICON_POOL: IconComp[] = [
  Tag, Star, FolderOpen, Globe, DollarSign, MoreHorizontal,
  Briefcase, ShoppingBag, Gift, Zap, Heart, BookOpen,
  Users, CreditCard, Landmark, Percent, Building2, Wrench,
];

function getCatIcon(name: string): IconComp {
  if (CATEGORY_ICONS[name]) return CATEGORY_ICONS[name];
  // Deterministic icon based on name hash so it's stable across renders
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0x7fffffff;
  return FALLBACK_ICON_POOL[hash % FALLBACK_ICON_POOL.length];
}

const CHART_COLORS = ["#a78bfa", "#f59e0b", "#34d399", "#f87171", "#60a5fa", "#e8b800", "#a3e635", "#e879f9"];

const LEVELS = [
  { min: 0, title: "شروع‌کننده مالی", color: "text-gray-400" },
  { min: 100, title: "منظم مالی", color: "text-blue-400" },
  { min: 300, title: "کنترل‌گر پول", color: "text-green-400" },
  { min: 600, title: "مدیر مالی شخصی", color: "text-yellow-400" },
  { min: 1000, title: "سازنده ثروت", color: "text-amber-400" },
  { min: 1500, title: "سرمایه‌گذار هوشمند", color: "text-purple-400" },
  { min: 2000, title: "استاد جریان پول", color: "text-yellow-300" },
];

function getLevelInfo(score: number) {
  let info = LEVELS[0];
  for (const l of LEVELS) if (score >= l.min) info = l;
  const idx = LEVELS.indexOf(info);
  const next = LEVELS[idx + 1];
  return { ...info, next };
}

// ─── API FETCH ───────────────────────────────────────────────────────────────

function useFinancialFetch(token: string | null) {
  return useCallback(
    async (url: string, options?: RequestInit) => {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options?.headers ?? {}),
        },
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    [token]
  );
}

// ─── PERIOD FILTER ───────────────────────────────────────────────────────────

type Period = "today" | "week" | "month" | "year" | "custom";

function getPeriodDates(period: Period, customFrom?: string, customTo?: string): { from: string; to: string } {
  const now = new Date();
  const td = now.toISOString().split("T")[0];
  if (period === "today") return { from: td, to: td };
  if (period === "week") {
    const d = new Date(now);
    d.setDate(d.getDate() - 6);
    return { from: d.toISOString().split("T")[0], to: td };
  }
  if (period === "month") {
    return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: td };
  }
  if (period === "year") {
    return { from: `${now.getFullYear()}-01-01`, to: td };
  }
  return { from: customFrom ?? td, to: customTo ?? td };
}

// ─── SMALL COMPONENTS ────────────────────────────────────────────────────────

function SummaryCard({
  label, amount, type, small,
}: {
  label: string; amount: number; type: "income" | "expense" | "remaining"; small?: boolean;
}) {
  const isPositive = amount >= 0;

  const cfg = type === "income"
    ? {
        icon: TrendingUp,
        accent: "#10b981",       // emerald-500
        glow:   "rgba(16,185,129,0.35)",
        dimGlow:"rgba(16,185,129,0.12)",
        grad:   "linear-gradient(145deg, rgba(6,78,59,0.95) 0%, rgba(4,47,46,0.85) 100%)",
        border: "rgba(16,185,129,0.45)",
        shine:  "rgba(16,185,129,0.15)",
        label:  "text-emerald-300",
        value:  "text-emerald-200",
        dot:    "#34d399",
      }
    : type === "expense"
    ? {
        icon: TrendingDown,
        accent: "#ef4444",
        glow:   "rgba(239,68,68,0.35)",
        dimGlow:"rgba(239,68,68,0.12)",
        grad:   "linear-gradient(145deg, rgba(127,29,29,0.95) 0%, rgba(69,10,10,0.85) 100%)",
        border: "rgba(239,68,68,0.45)",
        shine:  "rgba(239,68,68,0.15)",
        label:  "text-red-300",
        value:  "text-red-200",
        dot:    "#f87171",
      }
    : isPositive
    ? {
        icon: Wallet,
        accent: "#10b981",
        glow:   "rgba(16,185,129,0.35)",
        dimGlow:"rgba(16,185,129,0.12)",
        grad:   "linear-gradient(145deg, rgba(6,78,59,0.90) 0%, rgba(3,57,50,0.82) 100%)",
        border: "rgba(16,185,129,0.40)",
        shine:  "rgba(16,185,129,0.12)",
        label:  "text-emerald-300",
        value:  "text-emerald-200",
        dot:    "#34d399",
      }
    : {
        icon: Wallet,
        accent: "#ef4444",
        glow:   "rgba(239,68,68,0.35)",
        dimGlow:"rgba(239,68,68,0.12)",
        grad:   "linear-gradient(145deg, rgba(127,29,29,0.90) 0%, rgba(69,10,10,0.82) 100%)",
        border: "rgba(239,68,68,0.40)",
        shine:  "rgba(239,68,68,0.12)",
        label:  "text-red-300",
        value:  "text-red-200",
        dot:    "#f87171",
      };

  const Icon = cfg.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.34, 1.56, 0.64, 1] }}
      className="relative rounded-2xl overflow-hidden flex flex-col items-center"
      style={{
        background: cfg.grad,
        border: `1px solid ${cfg.border}`,
        boxShadow: `0 4px 24px ${cfg.glow}, 0 1px 0 ${cfg.shine} inset, 0 0 0 1px ${cfg.dimGlow} inset`,
        padding: small ? "10px 10px 10px" : "12px 12px 12px",
      }}
    >
      {/* Top shine line */}
      <div
        className="absolute top-0 left-0 right-0 h-px"
        style={{ background: `linear-gradient(90deg, transparent, ${cfg.accent}60, transparent)` }}
      />
      {/* Radial glow blob */}
      <div
        className="absolute -top-4 -right-4 w-16 h-16 rounded-full pointer-events-none"
        style={{ background: cfg.dimGlow, filter: "blur(12px)" }}
      />

      {/* Icon badge */}
      <div
        className="w-7 h-7 rounded-xl flex items-center justify-center mb-2 shrink-0"
        style={{
          background: `${cfg.accent}22`,
          border: `1px solid ${cfg.accent}44`,
          boxShadow: `0 0 8px ${cfg.glow}`,
        }}
      >
        <Icon className="w-3.5 h-3.5" style={{ color: cfg.accent }} />
      </div>

      {/* Label */}
      <p className={`text-[13px] font-bold tracking-wide mb-1 text-center ${cfg.label}`}>{label}</p>

      {/* Amount */}
      <p
        className={`font-black leading-none text-center ${cfg.value}`}
        style={{ fontSize: small ? "16px" : "19px" }}
      >
        {amount < 0 && <span className="opacity-70 mr-0.5 text-[13px]">−</span>}
        {formatNumber(Math.abs(amount))}
      </p>
      <p className={`text-[12px] font-bold mt-0.5 opacity-70 text-center ${cfg.value}`}>تومان</p>

      {/* Bottom dot indicator — line • dot • line */}
      <div className="flex items-center gap-1 mt-2 w-full">
        <div className="flex-1 h-px" style={{ background: `linear-gradient(270deg, ${cfg.accent}50, transparent)` }} />
        <div
          className="w-2 h-2 rounded-full shrink-0"
          style={{ background: cfg.dot, boxShadow: `0 0 6px ${cfg.dot}` }}
        />
        <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${cfg.accent}50, transparent)` }} />
      </div>
    </motion.div>
  );
}

function TransactionRow({
  tx, onEdit, onDelete,
}: {
  tx: any; onEdit: (tx: any) => void; onDelete: (id: number) => void;
}) {
  const isIncome = tx.type === "income";
  return (
    <div className="flex items-center gap-3 py-3 border-b border-border last:border-0">
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${isIncome ? "bg-emerald-500/15" : "bg-red-500/15"}`}>
        {isIncome ? <TrendingUp className="w-4 h-4 text-emerald-400" /> : <TrendingDown className="w-4 h-4 text-red-400" />}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">{tx.categoryName}</p>
        <p className="text-xs text-muted-foreground">{toJalali(tx.date)}</p>
      </div>
      <div className="text-right">
        <p className={`font-bold text-sm ${isIncome ? "text-emerald-400" : "text-red-400"}`}>
          {isIncome ? "+" : "-"}{formatNumber(tx.amount)}
        </p>
        <p className="text-xs text-muted-foreground">تومان</p>
      </div>
      <div className="flex gap-1">
        <button onClick={() => onEdit(tx)} className="p-1.5 rounded-lg hover:bg-white/10 text-muted-foreground">
          <Edit2 className="w-3.5 h-3.5" />
        </button>
        <button onClick={() => onDelete(tx.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-red-400">
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ─── ADD / EDIT FORM ─────────────────────────────────────────────────────────

function toEnglishDigits(str: string): string {
  return str
    .replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function formatAmountInput(raw: string): string {
  const digits = toEnglishDigits(raw).replace(/[^0-9]/g, "");
  if (!digits) return "";
  return Number(digits).toLocaleString("en-US");
}

function parseAmountInput(formatted: string): string {
  return toEnglishDigits(formatted).replace(/[^0-9]/g, "");
}

const JALALI_MONTHS = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];

function isoToJalali(iso: string): { jy: number; jm: number; jd: number } {
  const [y, m, d] = iso.split("-").map(Number);
  return jalaali.toJalaali(y, m, d);
}

function jalaliToIso(jy: number, jm: number, jd: number): string {
  const { gy, gm, gd } = jalaali.toGregorian(jy, jm, jd);
  return `${gy}-${String(gm).padStart(2,"0")}-${String(gd).padStart(2,"0")}`;
}

function TransactionForm({
  initial, onClose, onSave, apiFetch,
}: {
  initial?: any; onClose: () => void; onSave: () => void; apiFetch: (url: string, opts?: RequestInit) => Promise<any>;
}) {
  const [type, setType] = useState<"income" | "expense">(initial?.type ?? "income");
  const [amountDisplay, setAmountDisplay] = useState(
    initial?.amount ? Number(initial.amount).toLocaleString("en-US") : ""
  );
  const [categoryName, setCategoryName] = useState(initial?.categoryName ?? "");
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [customCats, setCustomCats] = useState<string[]>([]);
  const [catOpen, setCatOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);
  const [hiddenTick, setHiddenTick] = useState(0);

  // Jalali date state
  const initJ = useMemo(() => isoToJalali(initial?.date ?? todayIso()), []);
  const [jYear,  setJYear]  = useState(initJ.jy);
  const [jMonth, setJMonth] = useState(initJ.jm);
  const [jDay,   setJDay]   = useState(initJ.jd);

  // "امروز" badge: نشان می‌دهد آیا تاریخ انتخاب‌شده همان امروز است
  const todayJ = useMemo(() => isoToJalali(todayIso()), []);
  const isDateToday = jYear === todayJ.jy && jMonth === todayJ.jm && jDay === todayJ.jd;

  const daysInMonth = jalaali.jalaaliMonthLength(jYear, jMonth);
  const isoDate = jalaliToIso(jYear, jMonth, Math.min(jDay, daysInMonth));

  // Year range: 5 years back to 1 year ahead
  const jYears = useMemo(() => {
    const cur = isoToJalali(todayIso()).jy;
    return Array.from({ length: 7 }, (_, i) => cur - 5 + i);
  }, []);

  const { data: categoriesData } = useQuery({
    queryKey: ["/api/financial/categories", type],
    queryFn: () => apiFetch(`/api/financial/categories?type=${type}`),
  });

  const getHidden = (t: string) => {
    try { return JSON.parse(localStorage.getItem(`shivafer_hidden_${t}_cats`) ?? "[]") as string[]; }
    catch { return [] as string[]; }
  };

  // Map of custom category name → API id (for deletion)
  const customCatIds = useMemo(() => {
    const map: Record<string, number> = {};
    for (const c of (categoriesData?.custom ?? [])) map[c.name] = c.id;
    return map;
  }, [categoriesData]);

  const confirmDelete = async (cat: string) => {
    if (ALL_DEFAULT_CATS.has(cat)) {
      // Default category → hide in localStorage
      const key = `shivafer_hidden_${type}_cats`;
      const hidden = getHidden(type);
      localStorage.setItem(key, JSON.stringify([...hidden, cat]));
      setHiddenTick(t => t + 1);
    } else if (customCatIds[cat] !== undefined) {
      // API custom category → delete from server
      try {
        await apiFetch(`/api/financial/categories/${customCatIds[cat]}`, { method: "DELETE" });
        qc.invalidateQueries({ queryKey: ["/api/financial/categories", type] });
      } catch {
        // fallback: hide locally
        const key = `shivafer_hidden_${type}_cats`;
        const hidden = getHidden(type);
        localStorage.setItem(key, JSON.stringify([...hidden, cat]));
        setHiddenTick(t => t + 1);
      }
    } else {
      // Local-only custom category (not yet persisted)
      setCustomCats(p => p.filter(c => c !== cat));
    }
    if (categoryName === cat) setCategoryName("");
    setPendingDelete(null);
  };

  const allCats = useMemo(() => {
    const hidden = getHidden(type);
    const defaults = (type === "income" ? DEFAULT_INCOME_CATS : DEFAULT_EXPENSE_CATS).filter(c => !hidden.includes(c));
    const custom = (categoriesData?.custom ?? []).map((c: any) => c.name);
    return [...defaults, ...custom, ...customCats];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type, categoriesData, customCats, hiddenTick]);

  const rawAmount = parseAmountInput(amountDisplay);

  const handleSubmit = async () => {
    if (!rawAmount || !categoryName) return;
    setLoading(true);
    try {
      const body = { type, amount: parseInt(rawAmount), categoryName, date: isoDate };
      if (initial?.id) {
        await apiFetch(`/api/financial/transactions/${initial.id}`, { method: "PUT", body: JSON.stringify(body) });
      } else {
        await apiFetch("/api/financial/transactions", { method: "POST", body: JSON.stringify(body) });
      }
      onSave();
    } finally {
      setLoading(false);
    }
  };

  const qc = useQueryClient();

  const addCustomCat = async () => {
    const trimmed = newCat.trim();
    if (!trimmed) return;
    setCategoryName(trimmed);
    setNewCat("");
    setCatOpen(false);
    if (!allCats.includes(trimmed)) {
      try {
        await apiFetch("/api/financial/categories", {
          method: "POST",
          body: JSON.stringify({ type, name: trimmed }),
        });
        qc.invalidateQueries({ queryKey: ["/api/financial/categories", type] });
      } catch {
        setCustomCats((p) => [...p, trimmed]);
      }
    }
  };

  const goNext = () => {
    if (step === 1 && rawAmount) setStep(2);
    else if (step === 2 && categoryName) setStep(3);
  };

  const goBack = () => {
    if (step > 1) setStep((current) => current - 1);
    else onClose();
  };

  const selectCls = "flex-1 bg-background border border-border rounded-xl px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-center";

  return (
    <motion.div
      initial={{ opacity: 0, y: 32, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 32, scale: 0.98 }}
      transition={{ type: "spring", damping: 28, stiffness: 320 }}
      className="fixed inset-0 z-50 flex items-center justify-center px-4"
      dir="rtl"
    >
      {/* Backdrop — click outside to close */}
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />

      <div
        className="relative z-10 flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-2xl"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
        onClick={(e) => e.stopPropagation()}
      >

      {/* ── Header (fixed) ── */}
      <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
        <h2 className="text-base font-black">{initial ? "ویرایش تراکنش" : "ثبت تراکنش"}</h2>
        <button onClick={onClose} className="p-2 rounded-lg hover:bg-muted/60 text-muted-foreground"><X className="w-4 h-4" /></button>
      </div>

      {/* ── Wizard progress ── */}
      <div className="px-5 pb-3">
        <div className="flex items-center gap-2" aria-label="مراحل ثبت تراکنش">
          {[
            { number: 1, label: "مبلغ" },
            { number: 2, label: "دسته‌بندی" },
            { number: 3, label: "تاریخ" },
          ].map((item, index) => (
            <div key={item.number} className="flex items-center gap-2 flex-1 last:flex-none">
              <div className={`flex items-center gap-1.5 ${step >= item.number ? "text-primary" : "text-muted-foreground"}`}>
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-black border ${step >= item.number ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>
                  {step > item.number ? <Check className="w-3.5 h-3.5" /> : item.number}
                </span>
                <span className="text-[11px] font-bold whitespace-nowrap">{item.label}</span>
              </div>
              {index < 2 && <div className={`h-px flex-1 ${step > item.number ? "bg-primary" : "bg-border"}`} />}
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto px-5 pb-4">

        {step === 1 && (
          <motion.div key="amount" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className="flex rounded-xl overflow-hidden border border-border">
              <button
                className={`flex-1 py-3 text-sm font-bold transition-colors ${type === "income" ? "bg-emerald-500 text-white" : "text-muted-foreground hover:bg-muted/50"}`}
                onClick={() => { setType("income"); setCategoryName(""); }}
              >
                + درآمد
              </button>
              <button
                className={`flex-1 py-3 text-sm font-bold transition-colors ${type === "expense" ? "bg-red-500 text-white" : "text-muted-foreground hover:bg-muted/50"}`}
                onClick={() => { setType("expense"); setCategoryName(""); }}
              >
                − هزینه
              </button>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">مبلغ (تومان) *</label>
              <input
                type="text"
                inputMode="numeric"
                value={amountDisplay}
                onChange={(e) => setAmountDisplay(formatAmountInput(e.target.value))}
                onKeyDown={(e) => { if (e.key === "Enter" && rawAmount) goNext(); }}
                placeholder="مثال: 5,000,000"
                className="w-full bg-background border border-border rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-primary/50"
                style={{ direction: "ltr", textAlign: "right" }}
              />
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div key="category" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} className="space-y-3">
            <div className="rounded-xl bg-muted/30 border border-border px-4 py-3 flex items-center justify-between">
              <span className="text-xs text-muted-foreground">مبلغ</span>
              <span className="font-black text-sm">{Number(rawAmount).toLocaleString("fa-IR")} تومان</span>
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">دسته‌بندی *</label>
              <button
                type="button"
                onClick={() => setCatOpen((v) => !v)}
                className={`w-full bg-background border rounded-xl px-4 py-3 text-sm text-right flex items-center justify-between focus:outline-none ${catOpen ? "border-primary/60 ring-2 ring-primary/40 rounded-b-none" : "border-border"}`}
              >
                <span className="text-muted-foreground text-xs">{catOpen ? "▲" : "▼"}</span>
                <span className={categoryName ? "text-foreground font-bold" : "text-muted-foreground"}>
                  {categoryName || "انتخاب کنید..."}
                </span>
              </button>
              {catOpen && (
                <div className="border border-t-0 border-primary/60 rounded-b-xl overflow-hidden bg-background max-h-[42dvh] overflow-y-auto">
                  {allCats.map((c) => {
                    const Icon = getCatIcon(c);
                    const isConfirming = pendingDelete === c;
                    return (
                      <div key={c} className="border-b border-border/40 last:border-0">
                        {isConfirming ? (
                          <div className="flex items-center gap-2 px-4 py-2.5 bg-red-500/10">
                            <span className="text-xs text-red-400 flex-1">حذف «{c}»؟</span>
                            <button type="button" onClick={() => confirmDelete(c)} className="px-2.5 py-1 bg-red-500/20 text-red-400 rounded-lg text-xs font-bold">بله، حذف</button>
                            <button type="button" onClick={() => setPendingDelete(null)} className="px-2.5 py-1 bg-white/10 text-muted-foreground rounded-lg text-xs">خیر</button>
                          </div>
                        ) : (
                          <div className="flex items-center">
                            <button
                              type="button"
                              onClick={() => { setCategoryName(c); setCatOpen(false); setPendingDelete(null); }}
                              className={`flex-1 flex items-center gap-2.5 px-4 py-2.5 text-sm text-right transition-colors ${categoryName === c ? "bg-primary/15 text-primary font-bold" : "text-foreground hover:bg-white/5"}`}
                            >
                              <Icon className={`w-3.5 h-3.5 shrink-0 ${categoryName === c ? "text-primary" : "text-muted-foreground"}`} />
                              <span>{c}</span>
                            </button>
                            {/* همه دسته‌بندی‌ها (پیشفرض و سفارشی) دکمه حذف دارند */}
                            <button type="button" onClick={() => setPendingDelete(c)} className="p-2.5 text-muted-foreground hover:text-red-400 transition-colors shrink-0"><X className="w-3.5 h-3.5" /></button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                  <div className="border-t border-border bg-card/60 p-2 flex gap-2">
                    <input
                      value={newCat}
                      onChange={(e) => setNewCat(e.target.value)}
                      placeholder="افزودن دسته‌بندی جدید..."
                      className="flex-1 bg-background border border-border rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
                      onKeyDown={(e) => { e.stopPropagation(); if (e.key === "Enter") addCustomCat(); }}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <button type="button" onClick={addCustomCat} className="px-3 py-1.5 bg-primary/20 text-primary rounded-lg text-xs font-bold whitespace-nowrap">افزودن</button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}

        {step === 3 && (
          <motion.div key="date" initial={{ opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
            <div className={`rounded-xl border px-4 py-4 ${type === "income" ? "border-emerald-500/30 bg-emerald-500/10" : "border-red-500/30 bg-red-500/10"}`}>
              <p className="text-xs text-muted-foreground mb-1">{type === "income" ? "درآمد" : "هزینه"} · {categoryName}</p>
              <p className="text-xl font-black">{Number(rawAmount).toLocaleString("fa-IR")} <span className="text-xs font-normal">تومان</span></p>
            </div>
            <div>
              <label className="text-sm font-bold text-muted-foreground mb-2 flex items-center gap-2.5">
                تاریخ (شمسی) *
                {isDateToday && (
                  <span
                    className="text-sm font-black px-3 py-1 rounded-full"
                    style={{
                      background: "linear-gradient(135deg, rgba(232,184,0,0.28) 0%, rgba(196,154,0,0.18) 100%)",
                      color: "#e8b800",
                      border: "1.5px solid rgba(232,184,0,0.55)",
                      boxShadow: "0 2px 8px rgba(232,184,0,0.20)",
                      letterSpacing: "0.02em",
                    }}
                  >
                    امروز
                  </span>
                )}
              </label>
              <div className="flex gap-2">
                <select value={jYear} onChange={(e) => setJYear(Number(e.target.value))} className={selectCls}>
                  {jYears.map((y) => <option key={y} value={y}>{y}</option>)}
                </select>
                <select value={jMonth} onChange={(e) => setJMonth(Number(e.target.value))} className={selectCls}>
                  {JALALI_MONTHS.map((name, i) => <option key={i+1} value={i+1}>{name}</option>)}
                </select>
                <select value={Math.min(jDay, daysInMonth)} onChange={(e) => setJDay(Number(e.target.value))} className={selectCls}>
                  {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            </div>
          </motion.div>
        )}

      </div>

      {/* ── Wizard navigation (fixed bottom) ── */}
      <div className="px-5 pt-2 pb-3 shrink-0 border-t border-border/40">
        <div className="flex gap-2">
          {step > 1 && (
            <button onClick={goBack} disabled={loading} className="px-4 py-3 rounded-xl border border-border text-sm font-bold hover:bg-muted/50 disabled:opacity-50">
              مرحله قبل
            </button>
          )}
          {step < 3 ? (
            <button
              onClick={goNext}
              disabled={(step === 1 ? !rawAmount : !categoryName) || loading}
              className={`flex-1 py-3 rounded-xl font-black text-sm text-white transition-colors ${type === "income" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"} disabled:opacity-50`}
            >
              ادامه
              <ChevronRight className="inline-block w-4 h-4 mr-1 align-middle" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!rawAmount || !categoryName || loading}
              className={`flex-1 py-3 rounded-xl font-black text-sm text-white transition-colors ${type === "income" ? "bg-emerald-500 hover:bg-emerald-600" : "bg-red-500 hover:bg-red-600"} disabled:opacity-50`}
            >
              {loading ? "در حال ذخیره..." : initial ? "ذخیره تغییرات" : type === "income" ? "ثبت درآمد" : "ثبت هزینه"}
            </button>
          )}
        </div>
      </div>
      </div>
    </motion.div>
  );
}

// ─── GOAL FORM ───────────────────────────────────────────────────────────────

function GoalForm({ current, onClose, apiFetch }: { current: any; onClose: () => void; apiFetch: any }) {
  const [target, setTarget] = useState(
    current?.monthlyIncomeTarget ? Number(current.monthlyIncomeTarget).toLocaleString("en-US") : ""
  );
  const [cap, setCap] = useState(
    current?.monthlyExpenseCap ? Number(current.monthlyExpenseCap).toLocaleString("en-US") : ""
  );
  const [loading, setLoading] = useState(false);
  const qc = useQueryClient();

  const save = async () => {
    setLoading(true);
    try {
      await apiFetch("/api/financial/goals", {
        method: "PUT",
        body: JSON.stringify({
          monthlyIncomeTarget: parseInt(parseAmountInput(target)) || 0,
          monthlyExpenseCap: cap ? parseInt(parseAmountInput(cap)) : null,
        }),
      });
      qc.invalidateQueries({ queryKey: ["/api/financial/summary"] });
      qc.invalidateQueries({ queryKey: ["/api/financial/goals"] });
      onClose();
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 40 }}
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60"
      dir="rtl"
      onClick={onClose}
    >
      <div
        className="bg-card border border-border rounded-t-3xl w-full max-w-md p-5"
        style={{ paddingBottom: "calc(1.75rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-black">تعیین هدف ماهانه</h2>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/10"><X className="w-4 h-4" /></button>
        </div>
        <div className="mb-3">
          <label className="text-xs text-muted-foreground mb-1 block">هدف درآمد ماهانه (تومان)</label>
          <input
            type="text"
            inputMode="numeric"
            value={target}
            onChange={(e) => setTarget(formatAmountInput(e.target.value))}
            placeholder="مثال: ۱۰۰,۰۰۰,۰۰۰"
            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            style={{ direction: "ltr", textAlign: "right" }}
          />
        </div>
        <div className="mb-5">
          <label className="text-xs text-muted-foreground mb-1 block">سقف هزینه ماهانه (تومان - اختیاری)</label>
          <input
            type="text"
            inputMode="numeric"
            value={cap}
            onChange={(e) => setCap(formatAmountInput(e.target.value))}
            placeholder="مثال: ۵۰,۰۰۰,۰۰۰"
            className="w-full bg-background border border-border rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            style={{ direction: "ltr", textAlign: "right" }}
          />
        </div>
        <button onClick={save} disabled={loading}
          className="w-full py-3 rounded-xl font-black text-sm disabled:opacity-50" style={{ background: "#e8b800", color: "#08060a" }}>
          {loading ? "در حال ذخیره..." : "ذخیره هدف"}
        </button>
      </div>
    </motion.div>
  );
}

// ─── PERIOD SUMMARY SECTION ─────────────────────────────────────────────────

type PeriodKey = "today" | "week" | "month";
const PERIOD_TABS: { key: PeriodKey; label: string }[] = [
  { key: "today", label: "امروز" },
  { key: "week",  label: "این هفته" },
  { key: "month", label: "این ماه" },
];

function PeriodSummarySection({ summary }: { summary: any }) {
  const [active, setActive] = useState<PeriodKey>("today");
  const data = summary?.[active];
  if (!data) return null;

  return (
    <div className="bg-card rounded-2xl border border-border overflow-hidden">
      {/* Tab strip */}
      <div className="flex border-b border-border">
        {PERIOD_TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActive(key)}
            className={`flex-1 py-2.5 text-xs font-bold transition-colors ${
              active === key
                ? "text-primary border-b-2 border-primary bg-primary/5"
                : "text-muted-foreground border-b-2 border-transparent"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      {/* Cards */}
      <div className="grid grid-cols-3 gap-2 p-3">
        <SummaryCard label="درآمد"     amount={data.income}    type="income"    />
        <SummaryCard label="هزینه"      amount={data.expense}   type="expense"   />
        <SummaryCard label="باقیمانده" amount={data.remaining}  type="remaining" />
      </div>
    </div>
  );
}

// ─── MAIN PAGE ───────────────────────────────────────────────────────────────

type Tab = "dashboard" | "add" | "list" | "reports";

const PERIOD_LABELS: Record<string, string> = {
  today: "امروز", week: "این هفته", month: "این ماه", year: "امسال", custom: "دلخواه",
};

export default function IncomeExpensePage() {
  const { token } = useAuth();
  const qc = useQueryClient();
  const apiFetch = useFinancialFetch(token);

  const [tab, setTab] = useState<Tab>("dashboard");
  const [showForm, setShowForm] = useState(false);
  const [editTx, setEditTx] = useState<any>(null);
  const [showGoal, setShowGoal] = useState(false);
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "income" | "expense">("all");
  const [period, setPeriod] = useState<Period>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  const { from, to } = useMemo(() => getPeriodDates(period, customFrom, customTo), [period, customFrom, customTo]);

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ["/api/financial/summary"],
    queryFn: () => apiFetch("/api/financial/summary"),
    enabled: !!token,
    refetchOnWindowFocus: true,
  });

  const { data: transactions = [], isLoading: txLoading } = useQuery<any[]>({
    queryKey: ["/api/financial/transactions", from, to, filterType],
    queryFn: () => apiFetch(`/api/financial/transactions?from=${from}&to=${to}&type=${filterType}`),
    enabled: !!token,
  });

  const { data: goals } = useQuery({
    queryKey: ["/api/financial/goals"],
    queryFn: () => apiFetch("/api/financial/goals"),
    enabled: !!token,
  });

  const { data: reports } = useQuery({
    queryKey: ["/api/financial/reports", from, to],
    queryFn: () => apiFetch(`/api/financial/reports?from=${from}&to=${to}`),
    enabled: !!token && tab === "reports",
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/financial/transactions/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/financial/transactions"] });
      qc.invalidateQueries({ queryKey: ["/api/financial/summary"] });
    },
  });

  const filteredTx = useMemo(() => {
    if (!search) return transactions;
    const s = search.toLowerCase();
    return transactions.filter(
      (t: any) => t.categoryName?.toLowerCase().includes(s) || String(t.amount).includes(s)
    );
  }, [transactions, search]);

  const afterSave = () => {
    setShowForm(false);
    setEditTx(null);
    qc.invalidateQueries({ queryKey: ["/api/financial/transactions"] });
    qc.invalidateQueries({ queryKey: ["/api/financial/summary"] });
    qc.invalidateQueries({ queryKey: ["/api/financial/reports"] });
  };

  const levelInfo = summary ? getLevelInfo(summary.score) : null;

  if (!token) return <Redirect to="/login" />;

  return (
    <div
      className="fixed inset-0 bg-background flex flex-col"
      dir="rtl"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      {/* Header */}
      <div className="shrink-0 bg-background/95 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3">
        <Link href="/tools">
          <button className="p-2 rounded-xl hover:bg-white/10"><ChevronRight className="w-5 h-5" /></button>
        </Link>
        <div>
          <h1 className="text-base font-black leading-tight">مدیریت درآمد و هزینه</h1>
          <p className="text-xs text-muted-foreground">ابزار مالی هوشمند</p>
        </div>
        <div className="mr-auto flex gap-2">
          <button onClick={() => setShowGoal(true)} className="p-2 rounded-xl hover:bg-white/10 text-muted-foreground">
            <Settings2 className="w-4.5 h-4.5" />
          </button>
          <button
            onClick={() => { setEditTx(null); setShowForm(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold" style={{ background: "#e8b800", color: "#08060a" }}
          >
            <PlusCircle className="w-4 h-4" />
            ثبت
          </button>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="shrink-0 flex border-b border-border bg-background">
        {([
          { id: "dashboard", label: "داشبورد", icon: LayoutDashboard },
          { id: "list", label: "لیست", icon: List },
          { id: "reports", label: "گزارش", icon: BarChart2 },
        ] as { id: Tab; label: string; icon: any }[]).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 text-xs font-bold transition-colors border-b-2 ${
              tab === id ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto" style={{ WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
      <div className="pb-24 max-w-md mx-auto">
        {/* ── DASHBOARD TAB ── */}
        <AnimatePresence mode="wait">
          {tab === "dashboard" && (
            <motion.div key="dashboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-4">
              {summaryLoading ? (
                <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : summary ? (
                <>
                  {/* Period selector + stats */}
                  <PeriodSummarySection summary={summary} />

                  {/* Goal */}
                  {summary.goal.target > 0 && (
                    <div className="bg-card rounded-2xl border border-border p-4">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Target className="w-4 h-4 text-amber-400" />
                          <p className="text-sm font-bold">هدف درآمد ماهانه</p>
                        </div>
                        <p className="text-xs text-muted-foreground">{formatNumber(summary.month.income)} / {formatNumber(summary.goal.target)} ت</p>
                      </div>
                      <div className="h-2.5 bg-background rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${summary.goal.progress}%` }}
                          transition={{ duration: 0.8, ease: "easeOut" }}
                          className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full"
                        />
                      </div>
                      <p className="text-xs text-amber-400 font-bold mt-1.5">{summary.goal.progress}٪ تکمیل شده</p>
                    </div>
                  )}

                  {/* Expense Cap Card */}
                  {summary.goal.expenseCap > 0 && (() => {
                    const cap: number = summary.goal.expenseCap;
                    const spent: number = summary.month.expense;
                    const pct = Math.min(100, Math.round((spent / cap) * 100));
                    const over = spent > cap;
                    const danger  = pct >= 90;
                    const warning = pct >= 75 && pct < 90;
                    const caution = pct >= 50 && pct < 75;

                    const barColor = over || danger
                      ? "from-red-600 to-red-400"
                      : warning
                      ? "from-amber-500 to-amber-400"
                      : caution
                      ? "from-yellow-500 to-yellow-300"
                      : "from-emerald-500 to-green-400";

                    const borderColor = over || danger
                      ? "border-red-500/40"
                      : warning
                      ? "border-yellow-600/30"
                      : caution
                      ? "border-yellow-500/30"
                      : "border-border";

                    const bgColor = over || danger
                      ? "bg-red-950/40"
                      : warning
                      ? "bg-yellow-950/20"
                      : caution
                      ? "bg-yellow-950/20"
                      : "bg-card";

                    const labelColor = over || danger
                      ? "text-red-400"
                      : warning
                      ? "text-yellow-600"
                      : caution
                      ? "text-yellow-400"
                      : "text-emerald-400";

                    const statusText = over
                      ? `⚠ ${formatNumber(spent - cap)} ت از سقف عبور کردی!`
                      : danger
                      ? `خطر — فقط ${formatNumber(cap - spent)} ت مانده`
                      : warning
                      ? `احتیاط — ${formatNumber(cap - spent)} ت مانده`
                      : caution
                      ? `${formatNumber(cap - spent)} ت فاصله تا سقف`
                      : `${pct}٪ از سقف هزینه`;

                    return (
                      <div className={`rounded-2xl border p-4 transition-all ${bgColor} ${borderColor} ${(over || danger) ? "ring-1 ring-red-500/30" : ""}`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <TrendingDown className={`w-4 h-4 ${labelColor}`} />
                            <p className="text-sm font-bold">سقف هزینه ماهانه</p>
                            {(over || danger) && (
                              <span className="text-[10px] font-black bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded-full animate-pulse">هشدار</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{formatNumber(spent)} / {formatNumber(cap)} ت</p>
                        </div>
                        <div className="h-2.5 bg-background rounded-full overflow-hidden mb-1.5">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${pct}%` }}
                            transition={{ duration: 0.8, ease: "easeOut" }}
                            className={`h-full bg-gradient-to-r ${barColor} rounded-full`}
                          />
                        </div>
                        <p className={`text-xs font-bold ${labelColor}`}>{statusText}</p>
                      </div>
                    );
                  })()}

                  {/* Score & Level */}
                  {levelInfo && (
                    <div
                      className="score-level-card rounded-xl px-3 py-2 flex items-center gap-2"
                      style={{
                        background: "var(--score-card-bg)",
                        border: "1px solid var(--score-card-border)",
                        boxShadow: "0 2px 10px rgba(109,40,217,0.08)",
                      }}
                    >
                      {/* آیکون فشرده */}
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                        style={{ background: "var(--score-card-icon-bg)", boxShadow: "0 1px 4px rgba(139,92,246,0.15)" }}
                      >
                        <Star className="w-3.5 h-3.5" style={{ color: "#eab308", filter: "drop-shadow(0 0 3px rgba(234,179,8,0.5))" }} />
                      </div>
                      {/* اطلاعات */}
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold leading-none mb-0.5" style={{ color: "var(--score-card-label-color)" }}>امتیاز مالی شما</p>
                        <p className="font-black text-sm leading-none" style={{ color: "var(--score-card-level-color)" }}>{levelInfo.title}</p>
                      </div>
                      {/* امتیاز + بعدی */}
                      <div className="text-right shrink-0">
                        <p className="text-[10px] font-bold leading-none" style={{ color: "var(--score-card-score-color)" }}>{formatNumber(summary.score)} امتیاز</p>
                        {levelInfo.next && (
                          <p className="text-[10px] leading-none mt-0.5" style={{ color: "var(--score-card-label-color)" }}>
                            بعدی: <span className="font-bold" style={{ color: "var(--score-card-next-color)" }}>{levelInfo.next.title}</span>
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Smart Analysis — Glassy Liquid Card */}
                  {summary.messages?.length > 0 && (
                    <div
                      className="smart-analysis-card relative rounded-2xl overflow-hidden"
                      style={{
                        background: "linear-gradient(135deg, rgba(99,102,241,0.18) 0%, rgba(168,85,247,0.14) 40%, rgba(59,130,246,0.12) 100%)",
                        border: "1px solid rgba(168,85,247,0.30)",
                        boxShadow: "0 8px 32px rgba(99,102,241,0.18), 0 1px 0 rgba(255,255,255,0.12) inset",
                        backdropFilter: "blur(16px)",
                        WebkitBackdropFilter: "blur(16px)",
                      }}
                    >
                      {/* Liquid blobs */}
                      <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(168,85,247,0.35) 0%, transparent 70%)", filter: "blur(12px)" }} />
                      <div className="absolute -bottom-4 -left-4 w-20 h-20 rounded-full pointer-events-none" style={{ background: "radial-gradient(circle, rgba(99,102,241,0.30) 0%, transparent 70%)", filter: "blur(10px)" }} />
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-32 h-10 rounded-full pointer-events-none" style={{ background: "radial-gradient(ellipse, rgba(59,130,246,0.15) 0%, transparent 70%)", filter: "blur(8px)" }} />
                      {/* Top shimmer line */}
                      <div className="absolute top-0 left-0 right-0 h-px" style={{ background: "linear-gradient(90deg, transparent, rgba(168,85,247,0.6), rgba(99,102,241,0.6), transparent)" }} />

                      <div className="relative p-4">
                        {/* Header */}
                        <div className="flex items-center gap-2 mb-3">
                          <div
                            className="w-7 h-7 rounded-xl flex items-center justify-center shrink-0"
                            style={{
                              background: "linear-gradient(135deg, rgba(168,85,247,0.35), rgba(99,102,241,0.25))",
                              border: "1px solid rgba(168,85,247,0.40)",
                              boxShadow: "0 2px 8px rgba(168,85,247,0.25)",
                            }}
                          >
                            <span style={{ fontSize: 14 }}>🧠</span>
                          </div>
                          <p
                            className="text-base font-black tracking-wide"
                            style={{
                              background: "linear-gradient(135deg, #c084fc 0%, #818cf8 50%, #60a5fa 100%)",
                              WebkitBackgroundClip: "text",
                              WebkitTextFillColor: "transparent",
                              backgroundClip: "text",
                              filter: "drop-shadow(0 0 8px rgba(168,85,247,0.40))",
                            }}
                          >
                            تحلیل هوشمند
                          </p>
                        </div>

                        {/* Messages */}
                        <div className="space-y-2">
                          {summary.messages.map((msg: string, i: number) => (
                            <div
                              key={i}
                              className="smart-analysis-msg-row flex gap-2.5 items-start rounded-xl px-3 py-2"
                              style={{
                                background: "rgba(255,255,255,0.06)",
                                border: "1px solid rgba(255,255,255,0.08)",
                              }}
                            >
                              <span
                                className="mt-0.5 shrink-0 text-xs font-black"
                                style={{ color: i % 2 === 0 ? "#c084fc" : "#60a5fa" }}
                              >◆</span>
                              <p className="text-sm leading-relaxed" style={{ color: "rgba(255,255,255,0.88)" }}>{msg}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Recent Transactions */}
                  <div className="bg-card rounded-2xl border border-border p-4">
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-sm font-bold">آخرین تراکنش‌ها</p>
                      <button onClick={() => setTab("list")} className="text-xs text-primary">مشاهده همه</button>
                    </div>
                    {txLoading ? (
                      <p className="text-xs text-muted-foreground text-center py-4">در حال بارگذاری...</p>
                    ) : transactions.length === 0 ? (
                      <div className="text-center py-6">
                        <p className="text-muted-foreground text-sm">هنوز تراکنشی ثبت نشده</p>
                        <button onClick={() => setShowForm(true)} className="mt-2 text-primary text-sm font-bold">ثبت اولین تراکنش ←</button>
                      </div>
                    ) : (
                      <div>
                        {transactions.slice(0, 5).map((tx: any) => (
                          <TransactionRow key={tx.id} tx={tx} onEdit={(t) => { setEditTx(t); setShowForm(true); }} onDelete={(id) => deleteMutation.mutate(id)} />
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : null}
            </motion.div>
          )}

          {/* ── LIST TAB ── */}
          {tab === "list" && (
            <motion.div key="list" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-3">
              {/* Period filter */}
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(["today", "week", "month", "year"] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${period === p ? "text-[#08060a]" : "bg-card border border-border text-muted-foreground"}`} style={period === p ? { background: "#e8b800" } : {}}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
              </div>

              {/* Type filter */}
              <div className="flex rounded-xl overflow-hidden border border-border">
                {(["all", "income", "expense"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`flex-1 py-2 text-xs font-bold transition-colors ${filterType === t ? "bg-primary/20 text-primary" : "text-muted-foreground"}`}
                  >
                    {t === "all" ? "همه" : t === "income" ? "درآمد" : "هزینه"}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="جستجو..."
                  className="w-full bg-card border border-border rounded-xl pr-10 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
              </div>

              {/* Transaction list */}
              <div className="bg-card rounded-2xl border border-border p-4">
                {txLoading ? (
                  <div className="flex justify-center py-8"><div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
                ) : filteredTx.length === 0 ? (
                  <p className="text-center text-muted-foreground text-sm py-8">تراکنشی یافت نشد</p>
                ) : (
                  <div>
                    {filteredTx.map((tx: any) => (
                      <TransactionRow key={tx.id} tx={tx} onEdit={(t) => { setEditTx(t); setShowForm(true); }} onDelete={(id) => deleteMutation.mutate(id)} />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* ── REPORTS TAB ── */}
          {tab === "reports" && (
            <motion.div key="reports" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="p-4 space-y-4">
              {/* Period filter */}
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {(["week", "month", "year"] as Period[]).map((p) => (
                  <button
                    key={p}
                    onClick={() => setPeriod(p)}
                    className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${period === p ? "text-[#08060a]" : "bg-card border border-border text-muted-foreground"}`} style={period === p ? { background: "#e8b800" } : {}}
                  >
                    {PERIOD_LABELS[p]}
                  </button>
                ))}
                <button
                  onClick={() => setPeriod("custom")}
                  className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${period === "custom" ? "text-[#08060a]" : "bg-card border border-border text-muted-foreground"}`} style={period === "custom" ? { background: "#e8b800" } : {}}
                >
                  دلخواه
                </button>
              </div>

              {period === "custom" && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">از</label>
                    <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs focus:outline-none" />
                  </div>
                  <div className="flex-1">
                    <label className="text-xs text-muted-foreground">تا</label>
                    <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full bg-card border border-border rounded-xl px-3 py-2 text-xs focus:outline-none" />
                  </div>
                </div>
              )}

              {!reports ? (
                <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" /></div>
              ) : (
                <>
                  {/* Summary cards */}
                  <div className="grid grid-cols-3 gap-2">
                    <SummaryCard label="کل درآمد" amount={reports.totalIncome} type="income" small />
                    <SummaryCard label="کل هزینه" amount={reports.totalExpense} type="expense" small />
                    <SummaryCard label="باقیمانده" amount={reports.totalIncome - reports.totalExpense} type="remaining" small />
                  </div>

                  {/* Line Chart */}
                  {reports.daily?.length > 0 && (
                    <div className="bg-card rounded-2xl border border-border p-4">
                      <p className="text-sm font-bold mb-3">روند درآمد و هزینه</p>
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={reports.daily}>
                          <XAxis dataKey="date" tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v) => v.split("-").slice(1).join("/")} />
                          <YAxis tick={{ fontSize: 9, fill: "#888" }} tickFormatter={(v) => `${Math.round(v / 1_000_000)}M`} />
                          <Tooltip formatter={(v: any) => formatPrice(v)} labelFormatter={(l) => toJalali(l)} contentStyle={{ background: "#1a1228", border: "1px solid #333", borderRadius: 8, fontSize: 11 }} />
                          <Line type="monotone" dataKey="income" stroke="#34d399" strokeWidth={2} dot={false} name="درآمد" />
                          <Line type="monotone" dataKey="expense" stroke="#f87171" strokeWidth={2} dot={false} name="هزینه" />
                          <Line type="monotone" dataKey="remaining" stroke="#a78bfa" strokeWidth={1.5} dot={false} name="باقیمانده" strokeDasharray="4 2" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Pie Charts */}
                  <div className="grid grid-cols-2 gap-3">
                    {reports.incomeCategories?.length > 0 && (
                      <div className="bg-card rounded-2xl border border-border p-3">
                        <p className="text-xs font-bold text-emerald-400 mb-2">سهم درآمدها</p>
                        <ResponsiveContainer width="100%" height={120}>
                          <PieChart>
                            <Pie data={reports.incomeCategories.slice(0, 6)} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={50} strokeWidth={0}>
                              {reports.incomeCategories.slice(0, 6).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: any) => formatPrice(v)} contentStyle={{ background: "#1a1228", border: "1px solid #333", borderRadius: 8, fontSize: 10 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                    {reports.expenseCategories?.length > 0 && (
                      <div className="bg-card rounded-2xl border border-border p-3">
                        <p className="text-xs font-bold text-red-400 mb-2">سهم هزینه‌ها</p>
                        <ResponsiveContainer width="100%" height={120}>
                          <PieChart>
                            <Pie data={reports.expenseCategories.slice(0, 6)} dataKey="amount" nameKey="name" cx="50%" cy="50%" outerRadius={50} strokeWidth={0}>
                              {reports.expenseCategories.slice(0, 6).map((_: any, i: number) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: any) => formatPrice(v)} contentStyle={{ background: "#1a1228", border: "1px solid #333", borderRadius: 8, fontSize: 10 }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>

                  {/* Expense by category list */}
                  {reports.expenseCategories?.length > 0 && (
                    <div className="bg-card rounded-2xl border border-border p-4">
                      <p className="text-sm font-bold mb-3 text-red-400">هزینه‌ها بر اساس دسته</p>
                      <div className="space-y-2">
                        {reports.expenseCategories.slice(0, 8).map((cat: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <p className="text-xs text-foreground/80 flex-1 truncate">{cat.name}</p>
                            <p className="text-xs font-bold">{cat.percent}٪</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(cat.amount)} ت</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Income by category list */}
                  {reports.incomeCategories?.length > 0 && (
                    <div className="bg-card rounded-2xl border border-border p-4">
                      <p className="text-sm font-bold mb-3 text-emerald-400">درآمدها بر اساس دسته</p>
                      <div className="space-y-2">
                        {reports.incomeCategories.slice(0, 8).map((cat: any, i: number) => (
                          <div key={i} className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                            <p className="text-xs text-foreground/80 flex-1 truncate">{cat.name}</p>
                            <p className="text-xs font-bold">{cat.percent}٪</p>
                            <p className="text-xs text-muted-foreground">{formatNumber(cat.amount)} ت</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      </div>

      {/* دکمه ثبت تراکنش — وسط‌چین */}
      <div
        className="fixed left-0 right-0 z-30 flex justify-center"
        style={{ bottom: "calc(3.25rem + env(safe-area-inset-bottom))", padding: "0 24px" }}
      >
        <motion.button
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.03 }}
          onClick={() => { setEditTx(null); setShowForm(true); }}
          style={{
            background: "linear-gradient(135deg, #e8b800 0%, #c49200 100%)",
            boxShadow: "0 8px 28px rgba(232,184,0,0.50), 0 2px 8px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.25)",
            borderRadius: 18,
            padding: "14px 48px",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: 10,
            color: "#07050a",
            fontSize: 16,
            fontWeight: 800,
            letterSpacing: "0.01em",
          }}
          aria-label="ثبت تراکنش"
        >
          <Plus className="w-5 h-5" style={{ color: "#07050a" }} />
          ثبت تراکنش
        </motion.button>
      </div>

      {/* Modals */}
      <AnimatePresence>
        {(showForm || editTx) && (
          <TransactionForm
            initial={editTx}
            onClose={() => { setShowForm(false); setEditTx(null); }}
            onSave={afterSave}
            apiFetch={apiFetch}
          />
        )}
        {showGoal && (
          <GoalForm current={goals} onClose={() => setShowGoal(false)} apiFetch={apiFetch} />
        )}
      </AnimatePresence>
    </div>
  );
}
