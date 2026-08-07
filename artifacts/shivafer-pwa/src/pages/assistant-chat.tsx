import { useState, useEffect, useRef, useMemo } from "react";
import { useLocation, useSearch } from "wouter";
import { useAuth } from "@/lib/auth";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ChevronRight, ChevronLeft, Bot, Plus, List, Bell, CheckCircle2,
  Briefcase, User, ShoppingCart, Dumbbell, BookOpen,
  MoreHorizontal, Trash2, Clock, CheckCheck,
  CalendarDays, AlarmClock, Sparkles, X, Pencil, RotateCcw, SlidersHorizontal, ChevronUp, LayoutList,
  Pen, AlarmClockCheck, Repeat2, Send, Sun, Sunset,
  Lock, Crown, MessageCircle, ExternalLink,
} from "lucide-react";
import * as jalaali from "jalaali-js";
import { AVATARS, AvatarSvg } from "@/lib/assistant-avatars";

const API = "";

function authFetch(token: string | null, url: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(API + url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers as Record<string, string> ?? {}),
    },
  });
}

type TaskStatus = "pending" | "done";
type TaskCategory = "work" | "personal" | "shopping" | "sport" | "study" | "other";
type View = "home" | "new-task" | "edit-task";

interface AssistantReminder {
  id: number;
  taskId: number | null;
  taskTitle: string;
  taskCategory: string;
  firedAt: string;
  readAt: string | null;
}

type TaskPriority = "urgent" | "important" | "normal";
type RepeatType = "none" | "daily" | "weekly" | "monthly" | "custom";

interface Task {
  id: number;
  title: string;
  category: TaskCategory;
  status: TaskStatus;
  priority: TaskPriority;
  dueAt: string | null;
  repeatType: RepeatType;
  repeatDays: string | null;
  createdAt: string;
}

const PRIORITIES: { key: TaskPriority; label: string; icon: string; bg: string; border: string; color: string }[] = [
  { key: "urgent",    label: "فوری",    icon: "🚨", bg: "bg-red-500/20",    border: "border-red-500/70",    color: "text-red-600" },
  { key: "important", label: "مهم",     icon: "⚡", bg: "bg-yellow-600/20", border: "border-yellow-600/70", color: "text-yellow-700" },
  { key: "normal",    label: "عادی",    icon: "●",  bg: "bg-gray-500/15",   border: "border-gray-500/60",   color: "text-gray-600" },
];

const REPEAT_TYPES: { key: RepeatType; label: string }[] = [
  { key: "none",    label: "بدون تکرار" },
  { key: "daily",   label: "روزانه" },
  { key: "weekly",  label: "هفتگی" },
  { key: "monthly", label: "ماهانه" },
  { key: "custom",  label: "روزهای خاص" },
];

const WEEKDAYS: { key: number; label: string }[] = [
  { key: 6, label: "ش" }, { key: 0, label: "ی" }, { key: 1, label: "د" },
  { key: 2, label: "س" }, { key: 3, label: "چ" }, { key: 4, label: "پ" }, { key: 5, label: "ج" },
];

function getTimeGreeting(): string {
  const h = new Date().getHours();
  if (h >= 5  && h < 12) return "صبح بخیر";
  if (h >= 12 && h < 17) return "بعد از ظهر بخیر";
  if (h >= 17 && h < 21) return "عصر بخیر";
  return "شب بخیر";
}

const CATEGORIES: { key: TaskCategory; label: string; icon: typeof Briefcase; color: string; bg: string; border: string }[] = [
  { key: "work",     label: "کاری",   icon: Briefcase,     color: "text-blue-500",   bg: "bg-blue-500/10",   border: "border-blue-500/30" },
  { key: "personal", label: "شخصی",   icon: User,           color: "text-purple-500", bg: "bg-purple-500/10", border: "border-purple-500/30" },
  { key: "shopping", label: "خرید",   icon: ShoppingCart,   color: "text-green-500",  bg: "bg-green-500/10",  border: "border-green-500/30" },
  { key: "sport",    label: "ورزش",   icon: Dumbbell,       color: "text-sky-500",    bg: "bg-sky-500/10",    border: "border-sky-500/30" },
  { key: "study",    label: "تحصیل",  icon: BookOpen,       color: "text-yellow-500", bg: "bg-yellow-500/10", border: "border-yellow-500/30" },
  { key: "other",    label: "سایر",   icon: MoreHorizontal, color: "text-gray-400",   bg: "bg-gray-500/10",   border: "border-gray-500/30" },
];

function getCat(key: string) {
  return CATEGORIES.find(c => c.key === key) ?? CATEGORIES[5];
}

const J_MONTH_NAMES = ["فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور","مهر","آبان","آذر","دی","بهمن","اسفند"];
const J_DAYS = ["ش","ی","د","س","چ","پ","ج"];
const TIME_SLOTS = ["07:00","08:00","09:00","10:00","12:00","14:00","16:00","18:00","19:00","20:00","21:00","22:00"];

function toPersianDigits(n: number): string {
  return n.toString().replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[+d]);
}
function formatPersian(dateStr: string | null) {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return null;
  try {
    const j = jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate());
    const day = toPersianDigits(j.jd);
    const month = J_MONTH_NAMES[j.jm - 1];
    const year = toPersianDigits(j.jy);
    const hour = toPersianDigits(d.getHours()).padStart(2, "۰");
    const min = toPersianDigits(d.getMinutes()).padStart(2, "۰");
    return `${day} ${month} ${year}، ساعت ${hour}:${min}`;
  } catch {
    return dateStr;
  }
}

function isToday(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr).toDateString() === new Date().toDateString();
}
function isTomorrow(dateStr: string | null) {
  if (!dateStr) return false;
  const tom = new Date(); tom.setDate(tom.getDate() + 1);
  return new Date(dateStr).toDateString() === tom.toDateString();
}
function isSameDay(dateStr: string | null, target: string) {
  if (!dateStr || !target) return false;
  return new Date(dateStr).toDateString() === new Date(target).toDateString();
}
function isPast(dateStr: string | null) {
  if (!dateStr) return false;
  return new Date(dateStr) < new Date();
}
function formatOverdueDuration(dateStr: string | null): string | null {
  if (!dateStr) return null;
  const diff = Date.now() - new Date(dateStr).getTime();
  if (diff <= 0) return null;
  const mins  = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days  = Math.floor(diff / 86_400_000);
  if (days >= 1)  return `${days} روز تأخیر`;
  if (hours >= 1) return `${hours} ساعت تأخیر`;
  if (mins  >= 1) return `${mins} دقیقه تأخیر`;
  return "چند ثانیه تأخیر";
}

// ── Bot Message Bubble ────────────────────────────────────────────────────────
function BotBubble({ text, delay = 0, action }: { text: string; delay?: number; action?: { label: string; icon?: typeof Plus; onClick: () => void } }) {
  const now = new Date();
  const timeStr = now.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
  return (
    <motion.div dir="ltr" initial={{ opacity: 0, y: 8, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay, duration: 0.3 }} className="flex items-end gap-2 max-w-[85%]" style={{ marginRight: "auto", marginLeft: 0 }}>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0 shadow-lg">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="flex flex-col gap-2">
        <div dir="rtl" className="bg-muted/80 border border-border/40 rounded-2xl rounded-bl-sm text-sm leading-relaxed shadow-sm text-right overflow-hidden">
          <div className="px-4 py-2.5">{text}</div>
          {action && (
            <div className="border-t border-border/40 px-3 py-2">
              <button onClick={action.onClick} dir="rtl"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-violet-600 text-white hover:bg-violet-700 transition-all active:scale-95">
                {action.icon && <action.icon className="w-3 h-3" />}
                {action.label}
              </button>
            </div>
          )}
        </div>
        <span className="text-[10px] text-muted-foreground px-1">{timeStr}</span>
      </div>
    </motion.div>
  );
}

// ── Typing Indicator ──────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div dir="ltr" className="flex items-end gap-2 max-w-[85%]" style={{ marginRight: "auto", marginLeft: 0 }}>
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center shrink-0 shadow-lg">
        <Bot className="w-4 h-4 text-white" />
      </div>
      <div className="bg-muted/80 border border-border/40 rounded-2xl rounded-bl-sm px-5 py-3.5 shadow-sm flex items-center gap-1.5">
        {[0, 1, 2].map(i => (
          <motion.div key={i} className="w-2 h-2 rounded-full bg-violet-500/70"
            animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 1.2, repeat: Infinity, delay: i * 0.22 }} />
        ))}
      </div>
    </div>
  );
}


// ── Card Particles ─────────────────────────────────────────────────────────────
function CardParticles({ accent }: { accent: string }) {
  const particles = React.useMemo(() => [
    { id:0, x:8,  y:12, s:2.0, delay:0.0, dur:4.0, dx:6,  dy:-18 },
    { id:1, x:22, y:70, s:1.5, delay:0.7, dur:3.5, dx:-4, dy:-22 },
    { id:2, x:38, y:35, s:2.5, delay:1.2, dur:5.0, dx:8,  dy:-16 },
    { id:3, x:55, y:80, s:1.8, delay:0.3, dur:4.5, dx:-6, dy:-20 },
    { id:4, x:70, y:20, s:2.2, delay:1.8, dur:3.8, dx:4,  dy:-24 },
    { id:5, x:82, y:55, s:1.5, delay:0.9, dur:4.2, dx:-8, dy:-18 },
    { id:6, x:15, y:88, s:2.0, delay:2.1, dur:5.2, dx:5,  dy:-20 },
    { id:7, x:92, y:75, s:1.6, delay:1.5, dur:3.6, dx:-3, dy:-22 },
    { id:8, x:48, y:10, s:2.3, delay:0.5, dur:4.8, dx:7,  dy:-16 },
    { id:9, x:65, y:92, s:1.7, delay:2.5, dur:4.0, dx:-5, dy:-20 },
  ], []);
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none rounded-2xl">
      {particles.map(p => (
        <motion.div key={p.id}
          className="absolute rounded-full"
          style={{ left: `${p.x}%`, top: `${p.y}%`, width: p.s, height: p.s, backgroundColor: accent }}
          animate={{ opacity: [0, 0.55, 0], y: [0, p.dy], x: [0, p.dx] }}
          transition={{ duration: p.dur, delay: p.delay, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.5 }}
        />
      ))}
    </div>
  );
}

// ── Task Card ─────────────────────────────────────────────────────────────────
function TaskCard({ task, onToggle, onDelete, onEdit, onReschedule }: {
  task: Task; onToggle: () => void; onDelete: () => void; onEdit: () => void;
  onReschedule: (to: "today" | "tomorrow" | "next-week") => void;
}) {
  const cat = getCat(task.category);
  const Icon = cat.icon;
  const due = task.dueAt;
  const past = isPast(due) && task.status === "pending";
  const done = task.status === "done";
  const overdueDuration = past ? formatOverdueDuration(due) : null;

  // Per-category visual theme — light & dark compatible
  const CARD_THEMES: Record<string, {
    card: string; icon: string; accent: string; badge: string;
  }> = {
    work:     { card: "bg-blue-50 dark:bg-blue-950/60 border-blue-200 dark:border-blue-800/50",       icon: "from-blue-500 to-blue-700",     accent: "#3b82f6", badge: "bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700/60" },
    personal: { card: "bg-purple-50 dark:bg-purple-950/60 border-purple-200 dark:border-purple-800/50", icon: "from-purple-500 to-purple-700", accent: "#a855f7", badge: "bg-purple-100 dark:bg-purple-900/60 text-purple-700 dark:text-purple-300 border-purple-300 dark:border-purple-700/60" },
    shopping: { card: "bg-emerald-50 dark:bg-emerald-950/60 border-emerald-200 dark:border-emerald-800/50", icon: "from-emerald-500 to-emerald-700", accent: "#22c55e", badge: "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700/60" },
    sport:    { card: "bg-sky-50 dark:bg-sky-950/60 border-sky-200 dark:border-sky-800/50",           icon: "from-sky-400 to-blue-600",      accent: "#0ea5e9", badge: "bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-700/60" },
    study:    { card: "bg-orange-50 dark:bg-orange-950/60 border-orange-200 dark:border-orange-800/50", icon: "from-orange-500 to-red-600",   accent: "#f97316", badge: "bg-orange-100 dark:bg-orange-900/60 text-orange-700 dark:text-orange-300 border-orange-300 dark:border-orange-700/60" },
    other:    { card: "bg-slate-100 dark:bg-slate-900/60 border-slate-300 dark:border-slate-700/60",   icon: "from-slate-400 to-slate-600",  accent: "#64748b", badge: "bg-slate-200 dark:bg-slate-800/60 text-slate-600 dark:text-slate-400 border-slate-400 dark:border-slate-600/60" },
  };
  const theme = CARD_THEMES[task.category] ?? CARD_THEMES.other;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
      layout
      className={cn(
        "task-card-wrap rounded-2xl border-2 transition-all w-full min-w-0 overflow-hidden relative shadow-sm",
        done
          ? "opacity-50 grayscale-[40%] border-border/30 bg-muted/30 dark:bg-muted/20"
          : past
            ? "border-red-400 dark:border-red-700/70 bg-red-50 dark:bg-red-950/50"
            : theme.card,
      )}
      dir="rtl">

      {/* Top accent gradient bar */}
      {!done && (
        <div className="h-[5px] w-full"
          style={{ background: past ? "linear-gradient(90deg,#ef4444,#dc2626)" : `linear-gradient(90deg,${theme.accent}ee,${theme.accent}66)` }} />
      )}

      {/* Background decorative orbs + particles */}
      {!done && <>
        {/* Primary orb — top-left */}
        <div className="absolute -top-8 -left-8 w-36 h-36 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${past ? "#ef444450" : theme.accent + "40"}, transparent 65%)` }} />
        {/* Secondary orb — bottom-right */}
        <div className="absolute -bottom-10 -right-10 w-32 h-32 rounded-full pointer-events-none"
          style={{ background: `radial-gradient(circle, ${past ? "#ef444428" : theme.accent + "28"}, transparent 60%)` }} />
        {/* Floating dust particles */}
        <CardParticles accent={past ? "#ef4444" : theme.accent} />
      </>}

      <div className="p-4 relative">

        {/* Header: icon + title + badges */}
        <div className="flex items-start gap-3">
          {/* Gradient category icon */}
          <div className={cn(
            "w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-lg bg-gradient-to-br",
            done ? "from-gray-400 to-gray-500" : past ? "from-red-500 to-red-700" : theme.icon
          )}>
            <Icon className="w-5 h-5 text-white drop-shadow" />
          </div>

          <div className="flex-1 min-w-0">
            <p className={cn(
              "text-[15px] font-black leading-snug",
              done ? "line-through text-muted-foreground" : "text-foreground"
            )}>{task.title}</p>

            {/* Badges row */}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border", done ? "bg-muted text-muted-foreground border-border" : theme.badge)}>
                {cat.label}
              </span>
              {task.priority && task.priority !== "normal" && (
                <span className={cn("text-[10px] font-bold px-2.5 py-0.5 rounded-full border",
                  task.priority === "urgent"
                    ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700"
                    : "bg-yellow-50 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700"
                )}>
                  {task.priority === "urgent" ? "🚨 فوری" : "⚡ مهم"}
                </span>
              )}
              {task.repeatType && task.repeatType !== "none" && (
                <span className="inline-flex items-center gap-1 text-[10px] px-2.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 text-violet-700 dark:text-violet-400 border border-violet-300 dark:border-violet-700 font-bold">
                  <Repeat2 className="w-3 h-3 shrink-0" />
                  {REPEAT_TYPES.find(r => r.key === task.repeatType)?.label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Due date & overdue */}
        {due && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            <span className={cn("inline-flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-xl font-semibold border",
              past
                ? "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700"
                : isToday(due)
                  ? "bg-amber-50 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400 border-amber-300 dark:border-amber-700"
                  : "bg-violet-50 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-700"
            )}>
              <Bell className="w-3 h-3 shrink-0" />
              {formatPersian(due)}
            </span>
            {overdueDuration && (
              <motion.span initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                className="inline-flex items-center gap-1.5 text-[11px] px-3 py-1 rounded-xl font-bold bg-red-100 dark:bg-red-900/60 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700">
                <Clock className="w-3 h-3 shrink-0" />{overdueDuration}
              </motion.span>
            )}
          </div>
        )}

        {/* Reschedule for overdue */}
        {past && (
          <div className="flex items-center gap-2 mt-2.5 flex-wrap">
            <span className="text-[10px] font-bold text-red-600 dark:text-red-400">جابجا کن:</span>
            {(["today", "tomorrow", "next-week"] as const).map((to, i) => {
              const labels = ["📅 امروز", "🌅 فردا", "📆 هفته بعد"];
              const btnClasses = [
                "task-reschedule-today",
                "task-reschedule-tomorrow",
                "task-reschedule-next-week",
              ];
              return (
                <motion.button key={to} whileTap={{ scale: 0.92 }} onClick={() => onReschedule(to)}
                  className={cn("task-reschedule-btn px-3 py-1.5 rounded-xl text-[10px] font-bold border shadow-sm transition-all", btnClasses[i])}>
                  {labels[i]}
                </motion.button>
              );
            })}
          </div>
        )}

        {/* Divider */}
        <div className="h-px bg-black/8 dark:bg-white/8 mt-3.5 mb-3" />

        {/* Action buttons */}
        <div className="flex gap-2">
          <motion.button whileTap={{ scale: 0.94 }} onClick={onToggle}
            className={cn(
              "flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border transition-all",
              done
                ? "border-border/60 text-muted-foreground bg-muted/60 hover:bg-muted"
                : "border-emerald-300 dark:border-emerald-700 bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-200 dark:hover:bg-emerald-900/80"
            )}>
            {done ? <RotateCcw className="w-3.5 h-3.5" /> : <CheckCheck className="w-3.5 h-3.5" />}
            {done ? "بازگردانی" : "انجام شد"}
          </motion.button>
          <motion.button whileTap={{ scale: 0.94 }} onClick={onEdit}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border border-blue-300 dark:border-blue-700 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/80 transition-all">
            <Pencil className="w-3.5 h-3.5" />ویرایش
          </motion.button>
          <motion.button whileTap={{ scale: 0.94 }} onClick={onDelete}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold border border-red-300 dark:border-red-700 bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400 hover:bg-red-200 dark:hover:bg-red-900/80 transition-all">
            <Trash2 className="w-3.5 h-3.5" />حذف
          </motion.button>
        </div>
      </div>
    </motion.div>
  );
}

// ── DuePicker ─────────────────────────────────────────────────────────────────
type DueStep = "options" | "calendar" | "time";

function DuePicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [step, setStep] = useState<DueStep>("options");
  const [pickedDate, setPickedDate] = useState<Date | null>(null);
  const todayJ = useMemo(() => { const d = new Date(); return jalaali.toJalaali(d.getFullYear(), d.getMonth() + 1, d.getDate()); }, []);
  const [navJy, setNavJy] = useState(todayJ.jy);
  const [navJm, setNavJm] = useState(todayJ.jm);

  function goToTime(d: Date) { setPickedDate(d); setStep("time"); }
  function clear() { onChange(""); setPickedDate(null); setStep("options"); }
  function pickTime(t: string) {
    if (!pickedDate) return;
    const [h, m] = t.split(":").map(Number);
    const dt = new Date(pickedDate); dt.setHours(h, m, 0, 0);
    onChange(dt.toISOString()); setStep("options");
  }
  function calendarPrevMonth() { if (navJm === 1) { setNavJy(y => y - 1); setNavJm(12); } else setNavJm(m => m - 1); }
  function calendarNextMonth() { if (navJm === 12) { setNavJy(y => y + 1); setNavJm(1); } else setNavJm(m => m + 1); }
  function selectCalDay(jd: number) {
    const { gy, gm, gd } = jalaali.toGregorian(navJy, navJm, jd);
    goToTime(new Date(gy, gm - 1, gd));
  }

  if (value) {
    return (
      <div className="flex items-center justify-between bg-violet-500/10 border border-violet-500/30 rounded-xl px-3 py-2.5">
        <div className="flex items-center gap-2 text-sm text-violet-500"><Bell className="w-3.5 h-3.5 shrink-0" /><span>{formatPersian(new Date(value).toISOString())}</span></div>
        <button onClick={clear} className="text-muted-foreground hover:text-red-400 transition-colors p-0.5"><X className="w-3.5 h-3.5" /></button>
      </div>
    );
  }

  if (step === "options") {
    const today = new Date();
    const tomorrow = new Date(); tomorrow.setDate(today.getDate() + 1);
    // Custom SVG icons for each option
    const SunIcon = () => (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <circle cx="14" cy="14" r="6" fill="white" fillOpacity="0.95"/>
        {[0,45,90,135,180,225,270,315].map((deg,i)=>{
          const r=Math.PI*deg/180, x1=14+9.5*Math.cos(r), y1=14+9.5*Math.sin(r), x2=14+12.5*Math.cos(r), y2=14+12.5*Math.sin(r);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="white" strokeWidth="2" strokeLinecap="round"/>;
        })}
      </svg>
    );
    const MoonIcon = () => (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <path d="M20 15.5A8 8 0 0 1 10.5 6 8.5 8.5 0 1 0 20 15.5Z" fill="white" fillOpacity="0.95"/>
        <circle cx="20" cy="7" r="1.2" fill="white" fillOpacity="0.7"/>
        <circle cx="23" cy="11" r="0.8" fill="white" fillOpacity="0.5"/>
        <circle cx="22" cy="5" r="0.9" fill="white" fillOpacity="0.6"/>
      </svg>
    );
    const CalIcon = () => (
      <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
        <rect x="4" y="6" width="20" height="18" rx="3" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.5"/>
        <rect x="4" y="6" width="20" height="7" rx="3" fill="white" fillOpacity="0.35"/>
        <line x1="9" y1="4" x2="9" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <line x1="19" y1="4" x2="19" y2="9" stroke="white" strokeWidth="2" strokeLinecap="round"/>
        <rect x="8" y="17" width="3" height="3" rx="0.8" fill="white" fillOpacity="0.8"/>
        <rect x="12.5" y="17" width="3" height="3" rx="0.8" fill="white" fillOpacity="0.8"/>
        <rect x="17" y="17" width="3" height="3" rx="0.8" fill="white" fillOpacity="0.8"/>
      </svg>
    );
    const reminderOptions = [
      { Icon: SunIcon,  label: "برای امروز", sub: "یادآور امروز",     d: today,     bg: "from-amber-400 to-orange-500", shadow: "shadow-amber-300/50 dark:shadow-amber-800/40", onClick: () => goToTime(today) },
      { Icon: MoonIcon, label: "برای فردا",  sub: "یادآور فردا",      d: tomorrow,  bg: "from-indigo-500 to-blue-600",  shadow: "shadow-indigo-300/50 dark:shadow-indigo-800/40", onClick: () => goToTime(tomorrow) },
      { Icon: CalIcon,  label: "از تقویم",   sub: "انتخاب روز دلخواه", d: null,      bg: "from-violet-500 to-purple-600", shadow: "shadow-violet-300/50 dark:shadow-violet-800/40", onClick: () => setStep("calendar") },
    ];
    return (
      <div className="grid grid-cols-3 gap-2.5">
        {reminderOptions.map(({ Icon, label, sub, bg, shadow, onClick }) => (
          <motion.button key={label} whileTap={{ scale: 0.94 }} onClick={onClick}
            className={cn(
              "relative flex flex-col items-center gap-2 py-4 px-2 rounded-2xl transition-all overflow-hidden shadow-lg",
              "bg-gradient-to-br", bg, shadow
            )}>
            {/* Decorative orb */}
            <div className="absolute -top-3 -right-3 w-14 h-14 rounded-full bg-white/10 pointer-events-none" />
            <div className="relative z-10"><Icon /></div>
            <div className="relative z-10 text-center">
              <p className="text-[11px] font-black text-white leading-tight">{label}</p>
              <p className="text-[9px] text-white/70 mt-0.5 leading-tight">{sub}</p>
            </div>
          </motion.button>
        ))}
      </div>
    );
  }

  if (step === "calendar") {
    const monthLen = jalaali.jalaaliMonthLength(navJy, navJm);
    const firstDow = (() => { const { gy, gm, gd } = jalaali.toGregorian(navJy, navJm, 1); return (new Date(gy, gm - 1, gd).getDay() + 1) % 7; })();
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        className="bg-background border border-border rounded-2xl p-4 space-y-3" dir="rtl">
        <div className="flex items-center justify-between">
          <button type="button" onClick={calendarPrevMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ChevronRight className="w-4 h-4" /></button>
          <span className="text-sm font-bold">{J_MONTH_NAMES[navJm - 1]} {navJy}</span>
          <button type="button" onClick={calendarNextMonth} className="p-1.5 rounded-lg hover:bg-muted transition-colors"><ChevronLeft className="w-4 h-4" /></button>
        </div>
        <div className="grid grid-cols-7 text-center">
          {J_DAYS.map(d => <div key={d} className="text-[11px] font-semibold text-muted-foreground py-1">{d}</div>)}
        </div>
        <div className="grid grid-cols-7 text-center gap-y-1">
          {Array.from({ length: firstDow }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: monthLen }, (_, i) => i + 1).map(d => {
            const g = jalaali.toGregorian(navJy, navJm, d);
            const isPastDay = new Date(g.gy, g.gm - 1, g.gd) < new Date(new Date().toDateString());
            const isTodayDay = navJy === todayJ.jy && navJm === todayJ.jm && d === todayJ.jd;
            return (
              <button key={d} type="button" disabled={isPastDay} onClick={() => selectCalDay(d)}
                className={cn("mx-auto w-8 h-8 rounded-full text-xs font-medium transition-all flex items-center justify-center",
                  isPastDay ? "text-muted-foreground/40 cursor-not-allowed" : "hover:bg-muted",
                  isTodayDay && "bg-violet-600 text-white border-0 shadow-sm shadow-violet-400/40"
                )}>{d}</button>
            );
          })}
        </div>
        <button type="button" onClick={() => setStep("options")}
          className="w-full py-2 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors text-center">↩ برگشت</button>
      </motion.div>
    );
  }

  if (step === "time" && pickedDate) {
    const j = jalaali.toJalaali(pickedDate.getFullYear(), pickedDate.getMonth() + 1, pickedDate.getDate());
    const dateLabel = `${J_MONTH_NAMES[j.jm - 1]} ${j.jd}، ${j.jy}`;
    const now = new Date();
    const isTodays = pickedDate.toDateString() === now.toDateString();
    const slots = isTodays ? TIME_SLOTS.filter(t => {
      const [h, m] = t.split(":").map(Number);
      return h > now.getHours() || (h === now.getHours() && m > now.getMinutes());
    }) : TIME_SLOTS;

    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
        <div className="due-date-header text-center text-sm font-bold rounded-xl py-2 px-3">📅 {dateLabel}</div>
        <p className="text-xs text-muted-foreground text-center">ساعت یادآوری را انتخاب کنید:</p>
        <div className="grid grid-cols-4 gap-2">
          {slots.length > 0 ? slots.map(t => (
            <motion.button key={t} whileTap={{ scale: 0.92 }} onClick={() => pickTime(t)}
              className="due-time-slot-btn py-2.5 rounded-xl text-xs font-mono font-bold shadow-sm transition-all">{t}</motion.button>
          )) : (
            <p className="col-span-4 text-center text-xs text-muted-foreground py-3">ساعت‌های پیشنهادی تمام شده</p>
          )}
        </div>
        <div className="flex gap-2 items-center">
          <label className="due-time-input flex-1 rounded-xl px-3 py-2.5 text-sm font-bold text-white text-center cursor-pointer relative flex items-center justify-center gap-2">
            <span className="pointer-events-none select-none">انتخاب ساعت دلخواه</span>
            <input type="time" onBlur={e => { if (e.target.value) pickTime(e.target.value); }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" />
          </label>
        </div>
        <button type="button" onClick={() => setStep("options")}
          className="w-full py-2 text-xs font-semibold text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 transition-colors text-center">↩ برگشت</button>
      </motion.div>
    );
  }

  return null;
}

// ── statusLabels / timeLabels ──────────────────────────────────────────────────
const statusLabels: Record<string, string> = { pending: "در انتظار", done: "انجام شد", today: "امروز", tomorrow: "فردا", "custom-date": "تاریخ خاص" };
const timeLabels: Record<string, string> = { "has-due": "دارند", "no-due": "ندارند", past: "گذشته", today: "امروز", future: "آینده" };

// ── Feature flags ─────────────────────────────────────────────────────────────
// برای فعال‌سازی تب چت، این مقدار را به true تغییر دهید:
const CHAT_TAB_ENABLED = false;

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function AssistantChat() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const qc = useQueryClient();
  const { user, token } = useAuth();
  const userName = (user as any)?.name as string | null | undefined;
  const firstName = userName?.split(" ")[0] ?? "";

  const namePicks = useMemo(() => {
    if (!firstName) return Array(15).fill(null);
    const forms = [`${firstName} عزیز`, `${firstName} جان`, `${firstName}`, `${firstName}`];
    return Array.from({ length: 15 }, () =>
      Math.random() < 0.6 ? forms[Math.floor(Math.random() * forms.length)] : null
    );
  }, [firstName]);

  const urlParams = new URLSearchParams(search);
  const initTab = urlParams.get("tab") === "tasks" ? "tasks" : "messages";
  const initFilter = urlParams.get("filter") as "all" | "pending" | "done" | "today" | "tomorrow" | "custom-date" | null;
  const initTimeFilter = urlParams.get("time") as "all" | "has-due" | "no-due" | "past" | "today" | "future" | null;

  const [view, setView] = useState<View>("home");
  const [mainTab, setMainTab] = useState<"messages" | "tasks" | "chat">(initTab as any);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskCategory, setTaskCategory] = useState<TaskCategory>("personal");
  const [taskPriority, setTaskPriority] = useState<TaskPriority>("normal");
  const [taskRepeatType, setTaskRepeatType] = useState<RepeatType>("none");
  const [taskRepeatDays, setTaskRepeatDays] = useState<string>("");
  const [taskDue, setTaskDue] = useState("");
  const [taskSearch, setTaskSearch] = useState("");
  const [quickInputText, setQuickInputText] = useState("");
  const [showTyping, setShowTyping] = useState(true);
  const [listFilter, setListFilter] = useState<"all" | "pending" | "done" | "today" | "tomorrow" | "custom-date">(initFilter ?? "all");
  const [customFilterDate, setCustomFilterDate] = useState("");
  const [catFilter, setCatFilter] = useState<"all" | TaskCategory>("all");
  const [timeFilter, setTimeFilter] = useState<"all" | "has-due" | "no-due" | "past" | "today" | "future">(initTimeFilter ?? "all");
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [fabOpen, setFabOpen] = useState(false);
  const [highlightTarget, setHighlightTarget] = useState<"tasks" | "messages" | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [showNameDialog, setShowNameDialog] = useState(false);
  const [newAssistantName, setNewAssistantName] = useState("");
  const [showAvatarDialog, setShowAvatarDialog] = useState(false);
  const [purchaseConfirmId, setPurchaseConfirmId] = useState<string | null>(null);
  const [previewAvatarId, setPreviewAvatarId] = useState<string | null>(null);
  const avatarDialogScrollRef = useRef<HTMLDivElement>(null);
  const [avatarGender, setAvatarGender] = useState<"female" | "male">("female");
  const [showCustomizeHints, setShowCustomizeHints] = useState(false);
  const [avatarBuyLoading, setAvatarBuyLoading] = useState(false);


  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatTyping, setChatTyping] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ id?: number; role: "user" | "assistant"; content: string; actions?: Array<{ route: string; label: string }> }>>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  const goToTasks = (filter: "all" | "pending" | "today" | "tomorrow" = "all") => {
    setListFilter(filter); setView("home"); setMainTab("tasks"); setFabOpen(false);
    setHighlightTarget("tasks"); setTimeout(() => setHighlightTarget(null), 2000);
  };
  const goToMessages = () => {
    setView("home"); setMainTab("messages"); setFabOpen(false);
    setHighlightTarget("messages"); setTimeout(() => setHighlightTarget(null), 2000);
  };

  // ── Queries ───────────────────────────────────────────────────────────────────
  const { data: tasks = [], isLoading: tasksLoading } = useQuery<Task[]>({
    queryKey: ["/api/assistant/tasks"],
    queryFn: async () => {
      const res = await authFetch(token, "/api/assistant/tasks");
      if (!res.ok) throw new Error("خطا");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: reminders = [] } = useQuery<AssistantReminder[]>({
    queryKey: ["/api/assistant/reminders"],
    queryFn: async () => {
      const res = await authFetch(token, "/api/assistant/reminders");
      if (!res.ok) throw new Error("خطا");
      return res.json();
    },
    enabled: !!user,
  });

  const { data: chatHistory = [] } = useQuery<Array<{ id: number; role: string; content: string; kbEntryId?: number; createdAt: string }>>({
    queryKey: ["/api/assistant/chat"],
    queryFn: async () => {
      const res = await authFetch(token, "/api/assistant/chat");
      if (!res.ok) throw new Error("خطا");
      return res.json();
    },
    enabled: mainTab === "chat" && !!user,
  });

  const { data: faqChips = [] } = useQuery<Array<{ id: number; question: string; category: string }>>({
    queryKey: ["/api/assistant/kb/faq-chips"],
    queryFn: async () => {
      const res = await authFetch(token, "/api/assistant/kb/faq-chips");
      if (!res.ok) throw new Error("خطا");
      return res.json();
    },
    enabled: mainTab === "chat" && !!user,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: avatarData } = useQuery<{ owned: string[]; hasPremium: boolean; activeSubscriptions: Record<string, string> }>({
    queryKey: ["/api/user/assistant-avatars"],
    queryFn: async () => {
      const res = await authFetch(token, "/api/user/assistant-avatars");
      if (!res.ok) throw new Error("خطا");
      return res.json();
    },
    enabled: !!user,
    staleTime: 30000,
  });

  // ── Chat chips ────────────────────────────────────────────────────────────────
  const [shownChipIds, setShownChipIds] = useState<number[]>([]);
  const clickedIdsRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (faqChips.length > 0 && shownChipIds.length === 0) {
      const c3 = faqChips.slice(0, 3) as any[];
      const c2 = faqChips.slice(0, 2) as any[];
      const total3 = c3.reduce((s: number, c: any) => s + c.question.length, 0);
      const total2 = c2.reduce((s: number, c: any) => s + c.question.length, 0);
      const n = c3.length === 3 && total3 <= 52 ? 3 : c2.length >= 2 && total2 <= 42 ? 2 : 1;
      setShownChipIds(faqChips.slice(0, n).map((c: any) => c.id));
    }
  }, [faqChips]);

  const visibleChips = useMemo(() =>
    shownChipIds.map(id => faqChips.find((c: any) => c.id === id)).filter(Boolean) as any[]
  , [shownChipIds, faqChips]);

  const handleChipClick = (chip: { id: number; question: string }) => {
    clickedIdsRef.current.add(chip.id);
    setShownChipIds(prev => {
      const remaining = prev.filter(id => id !== chip.id);
      const next = (faqChips as any[]).find(c => !prev.includes(c.id) && !clickedIdsRef.current.has(c.id));
      if (next) return [...remaining, next.id];
      return remaining;
    });
    sendChatMessage(chip.question);
  };

  useEffect(() => {
    if (chatHistory.length > 0 && chatMessages.length === 0) {
      setChatMessages(chatHistory.map((m: any) => ({ id: m.id, role: m.role as "user" | "assistant", content: m.content })));
    }
  }, [chatHistory]);

  const scrollChatToBottom = () => setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);

  const sendChatMessage = async (text?: string) => {
    const msg = (text || chatInput).trim();
    if (!msg || chatTyping) return;
    setChatInput("");
    setChatMessages(prev => [...prev, { role: "user", content: msg }]);
    scrollChatToBottom();
    const typingDelay = Math.min(400 + msg.length * 20, 2200);
    setChatTyping(true);
    try {
      const res = await authFetch(token, "/api/assistant/chat", {
        method: "POST",
        body: JSON.stringify({ message: msg }),
      });
      const data = await res.json();
      await new Promise(r => setTimeout(r, typingDelay));
      setChatTyping(false);
      // Backend sends { message, actions: [{route, label}] }
      // actions includes both markdown links from AI text and KB-matched action buttons
      const actions: Array<{ route: string; label: string }> = Array.isArray(data.actions) ? data.actions : [];
      setChatMessages(prev => [...prev, { role: "assistant", content: data.message.content, actions }]);
      scrollChatToBottom();
    } catch {
      setChatTyping(false);
      setChatMessages(prev => [...prev, { role: "assistant", content: "یه مشکل پیش اومد. دوباره امتحان کن." }]);
    }
  };

  // ── Typing indicator on messages tab ─────────────────────────────────────────
  useEffect(() => {
    if (mainTab !== "messages") return;
    setShowTyping(true);
    const t = setTimeout(() => setShowTyping(false), 1600);
    return () => clearTimeout(t);
  }, [mainTab]);

  // ── Customization hints ───────────────────────────────────────────────────────
  useEffect(() => {
    const userId = (user as any)?.id;
    if (!userId) return;
    const key = `assistant_customize_hints_${userId}`;
    if (localStorage.getItem(key)) return;
    const timer = setTimeout(() => {
      setShowCustomizeHints(true);
      localStorage.setItem(key, "1");
    }, 60000);
    return () => clearTimeout(timer);
  }, [(user as any)?.id]);

  // ── Mutations ─────────────────────────────────────────────────────────────────
  const resetTaskForm = () => {
    setTaskTitle(""); setTaskDue(""); setTaskCategory("personal");
    setTaskPriority("normal"); setTaskRepeatType("none"); setTaskRepeatDays("");
  };

  const createTask = useMutation({
    mutationFn: async () => {
      if (!taskTitle.trim()) throw new Error("عنوان کار را وارد کنید");
      const res = await authFetch(token, "/api/assistant/tasks", {
        method: "POST",
        body: JSON.stringify({ title: taskTitle.trim(), category: taskCategory, priority: taskPriority, dueAt: taskDue ? new Date(taskDue).toISOString() : undefined, repeatType: taskRepeatType, repeatDays: taskRepeatDays || undefined }),
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assistant/tasks"] }); resetTaskForm(); setView("home"); },
  });

  const toggleStatus = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: TaskStatus }) => {
      const res = await authFetch(token, `/api/assistant/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ status }) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["/api/assistant/tasks"] });
      const prev = qc.getQueryData(["/api/assistant/tasks"]);
      qc.setQueryData(["/api/assistant/tasks"], (old: Task[] | undefined) =>
        (old ?? []).map(t => t.id === id ? { ...t, status } : t)
      );
      return { prev };
    },
    onError: (_err: unknown, _vars: unknown, ctx: { prev: unknown } | undefined) => {
      if (ctx?.prev) qc.setQueryData(["/api/assistant/tasks"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["/api/assistant/tasks"] }),
  });

  const deleteTask = useMutation({
    mutationFn: async (id: number) => { await authFetch(token, `/api/assistant/tasks/${id}`, { method: "DELETE" }); },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/assistant/tasks"] }),
  });

  const editTask = useMutation({
    mutationFn: async ({ id, title, category, priority, dueAt, repeatType, repeatDays }: { id: number; title: string; category: string; priority?: string; dueAt?: string; repeatType?: string; repeatDays?: string }) => {
      const res = await authFetch(token, `/api/assistant/tasks/${id}`, {
        method: "PUT",
        body: JSON.stringify({ title: title.trim(), category, priority: priority ?? "normal", dueAt: dueAt ? new Date(dueAt).toISOString() : null, repeatType: repeatType ?? "none", repeatDays: repeatDays || null }),
      });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/assistant/tasks"] }); setEditingTask(null); resetTaskForm(); setView("home"); setMainTab("tasks"); },
  });

  const rescheduleTask = useMutation({
    mutationFn: async ({ id, to }: { id: number; to: "today" | "tomorrow" | "next-week" }) => {
      const res = await authFetch(token, `/api/assistant/tasks/${id}/reschedule`, { method: "POST", body: JSON.stringify({ to }) });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/assistant/tasks"] }),
  });

  const handleEditTask = (task: Task) => {
    setEditingTask(task); setTaskTitle(task.title); setTaskCategory(task.category as TaskCategory);
    setTaskPriority((task.priority as TaskPriority) ?? "normal"); setTaskRepeatType((task.repeatType as RepeatType) ?? "none");
    setTaskRepeatDays(task.repeatDays ?? ""); setTaskDue(task.dueAt ? new Date(task.dueAt).toISOString().slice(0, 16) : "");
    setView("edit-task");
  };

  const markRemindersRead = useMutation({
    mutationFn: async () => {
      await authFetch(token, "/api/assistant/reminders/read", { method: "POST" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/assistant/reminders"] }),
  });

  useEffect(() => {
    if (mainTab === "messages" && view === "home") markRemindersRead.mutate();
  }, [mainTab, view]);

  const assistantName = (user as any)?.assistantName as string | null | undefined;
  const assistantAvatar = (user as any)?.assistantAvatar as string | null | undefined;

  const setAssistantNameMutation = useMutation({
    mutationFn: async (name: string | null) => {
      const res = await authFetch(token, "/api/user/assistant-name", { method: "PATCH", body: JSON.stringify({ name }) });
      return res.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/auth/me"] }); setShowNameDialog(false); },
  });

  const setAvatarMutation = useMutation({
    mutationFn: async (avatarId: string | null) => {
      const res = await authFetch(token, "/api/user/assistant-avatar", { method: "PATCH", body: JSON.stringify({ avatarId }) });
      return res.json();
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/auth/me"] }),
  });

  const handleAvatarPurchase = async (avatarId: string) => {
    setAvatarBuyLoading(true);
    try {
      const res = await authFetch(token, "/api/user/assistant-avatar/buy", { method: "POST", body: JSON.stringify({ avatarId }) });
      const data = await res.json();
      if (!res.ok) { alert(data.message || data.error || "خطا در ثبت سفارش"); return; }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      } else {
        alert("خطا: درگاه پرداخت در دسترس نیست. لطفاً دوباره تلاش کنید.");
      }
    } catch { alert("خطا در اتصال به سرور"); }
    finally { setAvatarBuyLoading(false); }
  };

  // Handle return from ZarinPal (avatarPayment=success/failed)
  useEffect(() => {
    const status = urlParams.get("avatarPayment");
    const paidAvatarId = urlParams.get("avatarId");
    if (status === "success" && paidAvatarId) {
      qc.invalidateQueries({ queryKey: ["/api/user/assistant-avatars"] });
      setAvatarMutation.mutate(paidAvatarId);
      setShowAvatarDialog(true);
    } else if (status === "cancelled" || status === "failed") {
      setShowAvatarDialog(true);
    }
  }, []);

  useEffect(() => { chatScrollRef.current?.scrollTo({ top: 0, behavior: "instant" }); }, [view]);
  useEffect(() => { if (view === "new-task") setWizardStep(1); }, [view]);

  // Scroll dialog to top when purchase confirm panel opens
  useEffect(() => {
    if (purchaseConfirmId) setTimeout(() => avatarDialogScrollRef.current?.scrollTo({ top: 0, behavior: "smooth" }), 50);
  }, [purchaseConfirmId]);

  const unreadCount = reminders.filter(r => !r.readAt).length;
  const initialUnreadIdsRef = useRef<Set<number> | null>(null);
  useEffect(() => {
    if (reminders.length > 0 && initialUnreadIdsRef.current === null)
      initialUnreadIdsRef.current = new Set(reminders.filter(r => !r.readAt).map(r => r.id));
  }, [reminders]);

  const pendingCount = tasks.filter(t => t.status === "pending").length;
  const todayCount = tasks.filter(t => t.status === "pending" && isToday(t.dueAt)).length;
  const tomorrowCount = tasks.filter(t => t.status === "pending" && isTomorrow(t.dueAt)).length;

  const filteredTasks = tasks.filter(t => {
    if (taskSearch.trim() && !t.title.includes(taskSearch.trim())) return false;
    if (listFilter === "pending" && t.status !== "pending") return false;
    if (listFilter === "done" && t.status !== "done") return false;
    if (listFilter === "today" && !(isToday(t.dueAt) && t.status === "pending")) return false;
    if (listFilter === "tomorrow" && !(isTomorrow(t.dueAt) && t.status === "pending")) return false;
    if (listFilter === "custom-date" && !isSameDay(t.dueAt, customFilterDate)) return false;
    if (catFilter !== "all" && t.category !== catFilter) return false;
    if (timeFilter === "has-due" && !t.dueAt) return false;
    if (timeFilter === "no-due" && t.dueAt) return false;
    if (timeFilter === "past" && !isPast(t.dueAt)) return false;
    if (timeFilter === "today" && !isToday(t.dueAt)) return false;
    if (timeFilter === "future" && (isPast(t.dueAt) || isToday(t.dueAt) || !t.dueAt)) return false;
    return true;
  });

  const activeFilterCount = [listFilter !== "all", catFilter !== "all", timeFilter !== "all"].filter(Boolean).length;

  // ── Wizard step renderers (hook-free closures, called as WizardStepN()) ──────
  const WIZARD_STEPS = ["دسته‌بندی", "عنوان", "اولویت", "یادآوری", "تکرار", "بررسی"];

  const WizardStep1 = () => (
    <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
      <p className="text-sm font-bold">دسته‌بندی را انتخاب کنید</p>
      <div className="grid grid-cols-3 gap-2">
        {CATEGORIES.map(cat => { const Icon = cat.icon; const selected = taskCategory === cat.key; return (
          <motion.button key={cat.key} whileTap={{ scale: 0.94 }} onClick={() => setTaskCategory(cat.key)}
            className={cn("flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all text-xs font-medium",
              selected ? "bg-violet-600 text-white border-violet-600 shadow-md" : "border-border/40 bg-background/60 text-muted-foreground hover:border-border"
            )}><Icon className="w-5 h-5" />{cat.label}</motion.button>
        ); })}
      </div>
    </div>
  );

  const WizardStep2 = () => (
    <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
      <p className="text-sm font-bold">عنوان کار را بنویسید</p>
      <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)}
        placeholder="مثلاً: جلسه با مشتری، خرید شیر..." maxLength={200}
        className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 placeholder:text-muted-foreground"
        style={{ fontSize: 16 }} autoFocus />
    </div>
  );

  const WizardStep3 = () => (
    <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
      <p className="text-sm font-bold">اولویت</p>
      <div className="grid grid-cols-3 gap-2">
        {PRIORITIES.map(p => (
          <motion.button key={p.key} whileTap={{ scale: 0.94 }} onClick={() => setTaskPriority(p.key)}
            className={cn("flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all text-xs font-semibold",
              taskPriority === p.key ? `${p.bg} ${p.border} ${p.color} border-opacity-100` : "border-border/40 bg-background/60 text-muted-foreground hover:border-border"
            )}><span className="text-lg leading-none">{p.icon}</span>{p.label}</motion.button>
        ))}
      </div>
    </div>
  );

  const WizardStep4 = () => (
    <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
      <p className="text-sm font-bold">زمان یادآوری <span className="text-xs text-muted-foreground font-normal">(اختیاری)</span></p>
      <DuePicker value={taskDue} onChange={setTaskDue} />
    </div>
  );

  const WizardStep5 = () => (
    <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
      <p className="text-sm font-bold">تکرار <span className="text-xs text-muted-foreground font-normal">(اختیاری)</span></p>
      <div className="flex flex-wrap gap-2">
        {REPEAT_TYPES.map(r => (
          <button key={r.key} onClick={() => setTaskRepeatType(r.key)}
            className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
              taskRepeatType === r.key ? "bg-violet-600 text-white border-violet-600" : "border-border/40 text-muted-foreground hover:border-border"
            )}>{r.label}</button>
        ))}
      </div>
      {taskRepeatType === "custom" && (
        <div className="flex flex-wrap gap-2 pt-1">
          {WEEKDAYS.map(d => {
            const sel = taskRepeatDays.split(",").filter(Boolean).includes(d.key.toString());
            return (
              <button key={d.key} onClick={() => {
                const days = taskRepeatDays.split(",").filter(Boolean);
                const ks = d.key.toString();
                setTaskRepeatDays(sel ? days.filter(x => x !== ks).join(",") : [...days, ks].join(","));
              }} className={cn("w-9 h-9 rounded-full text-xs font-bold border transition-all",
                sel ? "bg-violet-600 text-white border-violet-600" : "border-border/40 text-muted-foreground hover:border-border"
              )}>{d.label}</button>
            );
          })}
        </div>
      )}
    </div>
  );

  const catInfo = CATEGORIES.find(c => c.key === taskCategory);
  const priInfo = PRIORITIES.find(p => p.key === taskPriority);
  const repInfo = REPEAT_TYPES.find(r => r.key === taskRepeatType);

  const WizardStep6 = () => (
    <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
      <p className="text-sm font-bold text-center">بررسی نهایی</p>
      <div className="space-y-2">
        {[
          { emoji: catInfo?.icon ? undefined : "📌", Icon: catInfo?.icon, label: "دسته‌بندی", value: catInfo?.label ?? taskCategory },
          { emoji: "📝", label: "عنوان", value: taskTitle || "—" },
          { emoji: priInfo?.icon, label: "اولویت", value: priInfo?.label ?? taskPriority },
          ...(taskDue ? [{ emoji: "⏰", label: "یادآوری", value: new Date(taskDue).toLocaleString("fa-IR", { dateStyle: "short", timeStyle: "short" }) }] : []),
          ...(taskRepeatType !== "none" ? [{ emoji: "🔁", label: "تکرار", value: repInfo?.label ?? taskRepeatType }] : []),
        ].map((row, i) => {
          const IconComp = row.Icon;
          return (
            <div key={i} className="flex items-center gap-3 p-2.5 bg-background/60 rounded-xl border border-border/40">
              <div className="w-7 h-7 flex items-center justify-center shrink-0">
                {IconComp ? <IconComp className="w-4 h-4 text-violet-500" /> : <span className="text-lg leading-none">{row.emoji}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">{row.label}</p>
                <p className="text-sm font-bold truncate">{row.value}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );

  // ── Task form shared UI ────────────────────────────────────────────────────────
  // NOTE: Called as {TaskFormFields()} (function call, not <TaskFormFields />) to avoid
  // re-mounting on parent re-renders (which would close the iOS keyboard on each keystroke).
  // Must remain hook-free — closures over parent state only.
  const TaskFormFields = () => (
    <>
      <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
        <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center"><span className="text-xs font-bold text-violet-500">۱</span></div><p className="text-sm font-bold">دسته‌بندی را انتخاب کنید</p></div>
        <div className="grid grid-cols-3 gap-2">
          {CATEGORIES.map(cat => { const Icon = cat.icon; const selected = taskCategory === cat.key; return (
            <motion.button key={cat.key} whileTap={{ scale: 0.94 }} onClick={() => setTaskCategory(cat.key)}
              className={cn("flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all text-xs font-medium",
                selected ? "bg-violet-600 text-white border-violet-600 shadow-md" : "border-border/40 bg-background/60 text-muted-foreground hover:border-border"
              )}><Icon className="w-5 h-5" />{cat.label}</motion.button>
          ); })}
        </div>
      </div>
      <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
        <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center"><span className="text-xs font-bold text-violet-500">۲</span></div><p className="text-sm font-bold">عنوان کار را بنویسید</p></div>
        <input type="text" value={taskTitle} onChange={e => setTaskTitle(e.target.value)} placeholder="مثلاً: جلسه با مشتری، خرید شیر..." maxLength={200}
          className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 placeholder:text-muted-foreground"
          style={{ fontSize: 16 }} />
      </div>
      <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
        <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center"><span className="text-xs font-bold text-violet-500">۳</span></div><p className="text-sm font-bold">اولویت</p></div>
        <div className="grid grid-cols-3 gap-2">
          {PRIORITIES.map(p => (
            <motion.button key={p.key} whileTap={{ scale: 0.94 }} onClick={() => setTaskPriority(p.key)}
              className={cn("flex flex-col items-center gap-1.5 p-2.5 rounded-xl border-2 transition-all text-xs font-semibold",
                taskPriority === p.key ? "bg-violet-600 text-white border-violet-600 shadow-md" : "border-border/40 bg-background/60 text-muted-foreground hover:border-border"
              )}><span className="text-lg leading-none">{p.icon}</span>{p.label}</motion.button>
          ))}
        </div>
      </div>
      <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
        <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center"><span className="text-xs font-bold text-violet-500">۴</span></div><p className="text-sm font-bold">زمان یادآوری (اختیاری)</p></div>
        <DuePicker value={taskDue} onChange={setTaskDue} />
      </div>
      <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-3">
        <div className="flex items-center gap-2"><div className="w-6 h-6 rounded-full bg-violet-500/20 flex items-center justify-center"><span className="text-xs font-bold text-violet-500">۵</span></div><p className="text-sm font-bold">تکرار (اختیاری)</p></div>
        <div className="flex flex-wrap gap-2">
          {REPEAT_TYPES.map(r => (
            <button key={r.key} onClick={() => setTaskRepeatType(r.key)}
              className={cn("px-3 py-1.5 rounded-full text-xs font-semibold border transition-all",
                taskRepeatType === r.key ? "bg-violet-600 text-white border-violet-600" : "border-border/40 text-muted-foreground hover:border-border"
              )}>{r.label}</button>
          ))}
        </div>
        {taskRepeatType === "custom" && (
          <div className="flex flex-wrap gap-2 pt-1">
            {WEEKDAYS.map(d => {
              const selected = taskRepeatDays.split(",").filter(Boolean).includes(d.key.toString());
              return (
                <button key={d.key} onClick={() => {
                  const days = taskRepeatDays.split(",").filter(Boolean);
                  const ks = d.key.toString();
                  setTaskRepeatDays(selected ? days.filter(x => x !== ks).join(",") : [...days, ks].join(","));
                }} className={cn("w-9 h-9 rounded-full text-xs font-bold border transition-all",
                  selected ? "bg-violet-600 text-white border-violet-600" : "border-border/40 text-muted-foreground hover:border-border"
                )}>{d.label}</button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-background flex flex-col overflow-x-hidden" dir="rtl" style={{ maxWidth: '100vw' }}>
      {/* ── Sticky header + tab bar ─────────────────────────────────────────── */}
      <div className="sticky top-0 z-50 bg-background">
        {/* Header */}
        <div className="bg-background/95 backdrop-blur border-b border-border px-4 flex items-center gap-3"
          style={{ paddingTop: "calc(0.75rem + env(safe-area-inset-top, 0px))", paddingBottom: "0.75rem" }}>
          <Button variant="ghost" size="icon" className="rounded-full shrink-0"
            onClick={() => { if (view !== "home") setView("home"); else navigate("/tools"); }}>
            <ChevronRight className="w-5 h-5" />
          </Button>
          <div className="flex items-center gap-2.5 flex-1">
            <div className="relative">
              <button onClick={() => setShowAvatarDialog(true)}
                className="w-9 h-9 rounded-full overflow-hidden shadow-md active:scale-95 transition-transform">
                {assistantAvatar
                  ? <AvatarSvg id={assistantAvatar} size={36} />
                  : <div className="w-9 h-9 bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center"><Bot className="w-5 h-5 text-white" /></div>
                }
              </button>
              <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full bg-green-500 border-2 border-background" />
            </div>
            <div>
              <button className="flex items-center gap-1 group"
                onClick={() => { setNewAssistantName(assistantName ?? ""); setShowNameDialog(true); }}>
                <p className="text-sm font-bold leading-none truncate max-w-[180px]">{assistantName ? `${assistantName} - دستیار شخصی` : "دستیار شخصی"}</p>
                <Pen className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <p className="text-xs text-muted-foreground mt-0.5">
                {pendingCount > 0 ? `${pendingCount} کار در انتظار` : "آماده به کار"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="rounded-full"
            onClick={() => { setView("home"); setMainTab("tasks"); }}>
            <List className="w-5 h-5" />
          </Button>
        </div>
        {/* Tab bar */}
        <div className="bg-background border-b border-border/40 px-4 py-2">
          <div className="flex gap-1 bg-muted/40 p-1 rounded-2xl border border-border/40">
            {/* Messages tab */}
            <div className="relative flex-1">
              {highlightTarget === "messages" && (<><span className="absolute inset-0 rounded-xl bg-violet-500/30 animate-ping z-0" /><span className="absolute inset-0 rounded-xl ring-2 ring-violet-400 z-0" /></>)}
              <button onClick={() => { setMainTab("messages"); setView("home"); }}
                className={cn("relative z-10 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                  mainTab === "messages" ? "bg-violet-600 text-white shadow-md" : "text-muted-foreground hover:text-foreground"
                )}>
                <Bot className="w-4 h-4" />پیام‌ها
                {unreadCount > 0 && (
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                    mainTab === "messages" ? "bg-white/25 text-white" : "bg-red-500/20 text-red-500"
                  )}>{unreadCount > 9 ? "9+" : unreadCount}</span>
                )}
              </button>
            </div>
            {/* Tasks tab */}
            <div className="relative flex-1">
              {highlightTarget === "tasks" && (<><span className="absolute inset-0 rounded-xl bg-violet-500/30 animate-ping z-0" /><span className="absolute inset-0 rounded-xl ring-2 ring-violet-400 z-0" /></>)}
              <button onClick={() => { setMainTab("tasks"); setView("home"); }}
                className={cn("relative z-10 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                  mainTab === "tasks" ? "bg-violet-600 text-white shadow-md" : "text-muted-foreground hover:text-foreground"
                )}>
                <LayoutList className="w-4 h-4" />کارها
                {pendingCount > 0 && (
                  <span className={cn("text-[10px] font-bold px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                    mainTab === "tasks" ? "bg-white/25 text-white" : "bg-violet-500/20 text-violet-500"
                  )}>{pendingCount}</span>
                )}
              </button>
            </div>
            {/* Chat tab — hidden until CHAT_TAB_ENABLED = true */}
            {CHAT_TAB_ENABLED && (
              <div className="relative flex-1">
                <button onClick={() => { setMainTab("chat"); setView("home"); }}
                  className={cn("relative z-10 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition-all",
                    mainTab === "chat" ? "bg-violet-600 text-white shadow-md" : "text-muted-foreground hover:text-foreground"
                  )}>
                  <MessageCircle className="w-4 h-4" />چت
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Main body ──────────────────────────────────────────────────────────── */}
      <div ref={chatScrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4"
        style={{ paddingBottom: "calc(10rem + env(safe-area-inset-bottom, 0px))" }}>
        <AnimatePresence mode="wait">

          {/* ── HOME ─────────────────────────────────────────────────────────── */}
          {view === "home" && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">

              {/* MESSAGES TAB */}
              <AnimatePresence mode="wait">
                {mainTab === "messages" && (
                  <motion.div key="tab-messages" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }} className="space-y-4">
                    <AnimatePresence>
                      {showTyping && (
                        <motion.div key="typing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.9 }}>
                          <TypingIndicator />
                        </motion.div>
                      )}
                    </AnimatePresence>
                    {!showTyping && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                        <BotBubble text={namePicks[0] ? `${getTimeGreeting()} ${namePicks[0]}! من ${assistantName || "دستیار شخصی"} - دستیار شخصی شما هستم 👋` : `${getTimeGreeting()}! من ${assistantName || "دستیار شخصی"} - دستیار شخصی شما هستم 👋`} delay={0} />
                        {new Date().getHours() < 13 && todayCount > 0 && (
                          <BotBubble text={namePicks[1] ? `☀️ ${namePicks[1]}، امروز ${todayCount} کار داری.` : `☀️ امروز ${todayCount} کار داری.`} delay={0.1}
                            action={{ label: "کارهای امروز", icon: Sun, onClick: () => goToTasks("today") }} />
                        )}
                        {new Date().getHours() >= 18 && pendingCount > 0 && (
                          <BotBubble text={namePicks[2] ? `🌙 ${namePicks[2]}، هنوز ${pendingCount} کار انجام‌نشده داری.` : `🌙 هنوز ${pendingCount} کار انجام‌نشده داری.`} delay={0.12}
                            action={{ label: "بررسی کارها", icon: Sunset, onClick: () => goToTasks("pending") }} />
                        )}
                        {reminders.filter(r => !r.readAt).length > 0 && (
                          <BotBubble text={`📬 ${reminders.filter(r => !r.readAt).length} یادآوری خوانده‌نشده داری.`} delay={0.14} />
                        )}
                        {tasks.length === 0 && !tasksLoading && (
                          <BotBubble text={namePicks[3] ? `${namePicks[3]}، هنوز هیچ کاری ثبت نشده. اولین کارتون رو اضافه کنید! 📝` : "هنوز هیچ کاری ثبت نشده. اولین کارتون رو اضافه کنید! 📝"} delay={0.16}
                            action={{ label: "ثبت کار جدید", icon: Plus, onClick: () => setView("new-task") }} />
                        )}
                        {tasks.length > 0 && pendingCount === 0 && (
                          <BotBubble text={namePicks[4] ? `آفرین ${namePicks[4]}! همه کارها انجام شدن 🎉` : "آفرین! همه کارها انجام شدن 🎉"} delay={0.16}
                            action={{ label: "مشاهده همه کارها", icon: LayoutList, onClick: () => goToTasks("all") }} />
                        )}
                        {tasks.filter(t => t.status === "pending" && isPast(t.dueAt)).length > 0 && (
                          <BotBubble text={namePicks[5]
                            ? `${namePicks[5]}، ⚠️ ${tasks.filter(t => t.status === "pending" && isPast(t.dueAt)).length} کار از موعدشون گذشته.`
                            : `⚠️ ${tasks.filter(t => t.status === "pending" && isPast(t.dueAt)).length} کار از موعدشون گذشته.`}
                            delay={0.18}
                            action={{ label: "مشاهده کارهای عقب‌افتاده", icon: Clock, onClick: () => { setTimeFilter("past"); goToTasks("pending"); } }} />
                        )}
                        {showCustomizeHints && !assistantName && (
                          <BotBubble text="✨ می‌دونستی می‌تونی برای من یه اسم شخصی انتخاب کنی؟" delay={0}
                            action={{ label: "انتخاب اسم برای دستیار", icon: Pen, onClick: () => { setNewAssistantName(""); setShowNameDialog(true); } }} />
                        )}
                        {showCustomizeHints && !assistantAvatar && (
                          <BotBubble text="🎨 می‌تونی یه عکس پروفایل جذاب هم برام انتخاب کنی 😊" delay={showCustomizeHints && !assistantName ? 0.3 : 0}
                            action={{ label: "انتخاب آواتار برای دستیار", icon: Sparkles, onClick: () => setShowAvatarDialog(true) }} />
                        )}
                        {/* Reminders */}
                        {reminders.length > 0 && (
                          <div className="space-y-3 pt-2">
                            <div className="flex items-center gap-2 px-1">
                              <div className="flex-1 h-px bg-border/40" />
                              <span className="text-[11px] text-muted-foreground font-medium">یادآوری‌ها</span>
                              <div className="flex-1 h-px bg-border/40" />
                            </div>
                            {reminders.map((r, i) => {
                              const wasUnread = initialUnreadIdsRef.current?.has(r.id) ?? false;
                              const bubbleCls = r.readAt ? "bg-muted/50 border-border/30 text-muted-foreground" : "bg-violet-500/10 border-violet-500/30";
                              return (
                                <motion.div key={r.id} dir="ltr" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                                  transition={{ delay: i * 0.03 }} className="flex items-end gap-2 max-w-[92%]" style={{ marginRight: "auto", marginLeft: 0 }}>
                                  <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0 shadow", r.readAt ? "bg-muted" : "bg-gradient-to-br from-violet-500 to-purple-700")}>
                                    <AlarmClockCheck className={cn("w-4 h-4", r.readAt ? "text-muted-foreground" : "text-white")} />
                                  </div>
                                  <div className="flex flex-col gap-1.5 flex-1 min-w-0">
                                    <div className={cn("rounded-2xl rounded-bl-sm px-4 py-2.5 text-sm leading-relaxed shadow-sm border", bubbleCls, wasUnread && "ring-1 ring-violet-400/50")}>
                                      <div className="flex items-center gap-1.5 mb-1">
                                        <AlarmClock className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                                        <span className="text-[11px] font-bold text-violet-400">یادآوری کار</span>
                                        {!r.readAt && <span className="mr-auto w-2 h-2 rounded-full bg-violet-500" />}
                                      </div>
                                      <p dir="rtl" className="text-right font-medium">{r.taskTitle}</p>
                                      <p dir="rtl" className="text-[11px] mt-0.5 text-right text-muted-foreground">{formatPersian(r.firedAt)}</p>
                                    </div>
                                  </div>
                                </motion.div>
                              );
                            })}
                          </div>
                        )}
                      </motion.div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* TASKS TAB */}
              <AnimatePresence mode="wait">
                {mainTab === "tasks" && (
                  <motion.div key="tab-tasks" initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="space-y-3">
                    {/* Search */}
                    <div className="relative">
                      <input type="text" value={taskSearch} onChange={e => setTaskSearch(e.target.value)} placeholder="جستجوی کار..."
                        className="w-full bg-muted/40 border border-border/50 rounded-2xl pr-4 pl-10 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/20 placeholder:text-muted-foreground" style={{ fontSize: 16 }} />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg></span>
                    </div>
                    {/* Filters bar */}
                    {(() => {
                      return (
                        <div className="space-y-3">
                          <div className="flex items-center gap-2">
                            <button onClick={() => setFiltersOpen(o => !o)}
                              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all shrink-0",
                                activeFilterCount > 0 ? "bg-violet-600 text-white border-violet-600" : "bg-muted/40 border-border/50 text-muted-foreground"
                              )}>
                              <SlidersHorizontal className="w-3.5 h-3.5" />فیلتر
                              {activeFilterCount > 0 && <span className="bg-white/30 rounded-full w-4 h-4 flex items-center justify-center text-[10px] font-bold">{activeFilterCount}</span>}
                            </button>
                            <div className="flex gap-1.5 flex-wrap flex-1">
                              {listFilter !== "all" && <button onClick={() => setListFilter("all")} className="shrink-0 flex items-center gap-1 bg-violet-500/15 border border-violet-500/40 text-violet-400 text-xs font-semibold px-2.5 py-1 rounded-full">{statusLabels[listFilter]} <X className="w-2.5 h-2.5 mr-0.5" /></button>}
                              {catFilter !== "all" && (() => { const cat = getCat(catFilter); return (<button onClick={() => setCatFilter("all")} className={cn("shrink-0 flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border", cat.bg, cat.border, cat.color)}>{cat.label} <X className="w-2.5 h-2.5 mr-0.5" /></button>); })()}
                              {timeFilter !== "all" && <button onClick={() => setTimeFilter("all")} className="shrink-0 flex items-center gap-1 bg-yellow-600/15 border border-yellow-600/40 text-yellow-600 text-xs font-semibold px-2.5 py-1 rounded-full">{timeLabels[timeFilter]} <X className="w-2.5 h-2.5 mr-0.5" /></button>}
                              {activeFilterCount === 0 && <span className="text-xs text-muted-foreground py-1 px-1">بدون فیلتر</span>}
                            </div>
                          </div>
                          <AnimatePresence>
                            {filtersOpen && (
                              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden">
                                <div className="bg-muted/30 rounded-2xl p-4 border border-border/40 space-y-4">
                                  <div className="flex justify-center -mt-1 -mb-1">
                                    <button onClick={() => setFiltersOpen(false)} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors py-1 px-3 rounded-full hover:bg-muted/60">
                                      <ChevronUp className="w-4 h-4" />جمع کردن
                                    </button>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-muted-foreground mb-2">وضعیت</p>
                                    <div className="grid grid-cols-2 gap-1.5">
                                      {([
                                        { key: "all", label: "همه", count: tasks.length },
                                        { key: "pending", label: "در انتظار", count: pendingCount },
                                        { key: "today", label: "امروز", count: todayCount },
                                        { key: "tomorrow", label: "فردا", count: tomorrowCount },
                                        { key: "done", label: "انجام شد", count: tasks.filter(t => t.status === "done").length },
                                      ] as { key: "all"|"pending"|"done"|"today"|"tomorrow"; label: string; count: number }[]).map(f => (
                                        <button key={f.key} onClick={() => setListFilter(f.key)}
                                          className={cn("flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
                                            listFilter === f.key ? "bg-violet-600 text-white border-violet-600" : "bg-background/60 border-border/40 text-muted-foreground"
                                          )}><span>{f.label}</span><span className={cn("text-[10px] rounded-full px-1.5 py-0.5", listFilter === f.key ? "bg-white/20" : "bg-muted/60")}>{f.count}</span></button>
                                      ))}
                                      <button onClick={() => setListFilter(listFilter === "custom-date" ? "all" : "custom-date")}
                                        className={cn("col-span-2 flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold border transition-all",
                                          listFilter === "custom-date" ? "bg-violet-600 text-white border-violet-600" : "bg-background/60 border-border/40 text-muted-foreground"
                                        )}><CalendarDays className="w-3.5 h-3.5" />انتخاب تاریخ
                                        {listFilter === "custom-date" && customFilterDate && <span className="mr-auto bg-white/20 rounded-full px-2 py-0.5 text-[10px]">{new Date(customFilterDate).toLocaleDateString("fa-IR")}</span>}
                                      </button>
                                    </div>
                                    {listFilter === "custom-date" && (
                                      <div className="mt-2">
                                        <input type="date" value={customFilterDate} onChange={e => setCustomFilterDate(e.target.value)}
                                          className="w-full bg-background border border-border/60 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 text-muted-foreground" />
                                      </div>
                                    )}
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-muted-foreground mb-2">دسته‌بندی</p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      <button onClick={() => setCatFilter("all")} className={cn("px-2 py-2 rounded-xl text-xs font-semibold border transition-all", catFilter === "all" ? "bg-violet-600 text-white border-violet-600" : "bg-background/60 border-border/40 text-muted-foreground")}>همه</button>
                                      {CATEGORIES.map(cat => { const Icon = cat.icon; return (
                                        <button key={cat.key} onClick={() => setCatFilter(cat.key)} className={cn("flex items-center justify-center gap-1 px-2 py-2 rounded-xl text-xs font-semibold border transition-all", catFilter === cat.key ? `${cat.bg} ${cat.border} ${cat.color}` : "bg-background/60 border-border/40 text-muted-foreground")}>
                                          <Icon className="w-3 h-3" />{cat.label}
                                        </button>
                                      ); })}
                                    </div>
                                  </div>
                                  <div>
                                    <p className="text-[11px] font-bold text-muted-foreground mb-2">یادآوری</p>
                                    <div className="grid grid-cols-3 gap-1.5">
                                      {([
                                        { key: "all",     label: "همه",    cls: "bg-violet-600 text-white border-violet-600" },
                                        { key: "has-due", label: "دارند",  cls: "bg-blue-600 text-white border-blue-600" },
                                        { key: "no-due",  label: "ندارند", cls: "bg-gray-600 text-white border-gray-600" },
                                        { key: "past",    label: "گذشته",  cls: "bg-red-600 text-white border-red-600" },
                                        { key: "today",   label: "امروز",  cls: "bg-yellow-600 text-white border-yellow-600" },
                                        { key: "future",  label: "آینده",  cls: "bg-green-600 text-white border-green-600" },
                                      ] as { key: "all"|"has-due"|"no-due"|"past"|"today"|"future"; label: string; cls: string }[]).map(f => (
                                        <button key={f.key} onClick={() => setTimeFilter(f.key)} className={cn("px-2 py-2 rounded-xl text-xs font-semibold border transition-all", timeFilter === f.key ? f.cls : "bg-background/60 border-border/40 text-muted-foreground")}>{f.label}</button>
                                      ))}
                                    </div>
                                  </div>
                                  {activeFilterCount > 0 && (
                                    <button onClick={() => { setListFilter("all"); setCatFilter("all"); setTimeFilter("all"); }}
                                      className="w-full text-xs text-muted-foreground py-2 border border-border/40 rounded-xl hover:bg-muted/40 transition-all">حذف همه فیلترها</button>
                                  )}
                                </div>
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </div>
                      );
                    })()}
                    {/* Add button */}
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => setView("new-task")}
                      className="task-add-btn w-full flex items-center gap-3 px-5 py-3.5 rounded-2xl transition-all shadow-md
                        bg-gradient-to-l from-violet-600 to-purple-500
                        hover:from-violet-700 hover:to-purple-600
                        text-white border-0">
                      <div className="w-8 h-8 rounded-xl bg-white/20 flex items-center justify-center shrink-0 shadow-inner">
                        <Plus className="w-5 h-5 text-white" />
                      </div>
                      <span className="text-sm font-bold tracking-wide">کار جدید اضافه کنید</span>
                      <div className="mr-auto opacity-60">
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M6 12L10 8L6 4" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      </div>
                    </motion.button>
                    {/* Task list */}
                    {tasksLoading ? (
                      <div className="space-y-2">{[1, 2, 3].map(i => <div key={i} className="h-16 rounded-2xl bg-muted/40 animate-pulse" />)}</div>
                    ) : filteredTasks.length === 0 ? (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-10 space-y-2">
                        <div className="w-14 h-14 rounded-full bg-muted/50 flex items-center justify-center mx-auto"><CheckCircle2 className="w-7 h-7 text-muted-foreground" /></div>
                        <p className="text-muted-foreground text-sm">هیچ کاری در این بخش نیست</p>
                        <Button variant="ghost" size="sm" className="text-violet-500" onClick={() => setView("new-task")}>+ کار جدید ثبت کنید</Button>
                      </motion.div>
                    ) : (
                      <div className="space-y-2">
                        <AnimatePresence>
                          {filteredTasks.map(task => (
                            <TaskCard key={task.id} task={task}
                              onToggle={() => toggleStatus.mutate({ id: task.id, status: task.status === "done" ? "pending" : "done" })}
                              onDelete={() => deleteTask.mutate(task.id)}
                              onEdit={() => handleEditTask(task)}
                              onReschedule={(to) => rescheduleTask.mutate({ id: task.id, to })} />
                          ))}
                        </AnimatePresence>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CHAT TAB — hidden until CHAT_TAB_ENABLED = true */}
              {CHAT_TAB_ENABLED && mainTab === "chat" && (
                <motion.div key="tab-chat" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.2 }} className="flex flex-col gap-3 min-h-full">
                  {chatMessages.length === 0 && !chatTyping && (
                    <BotBubble text={`سلام${firstName ? " " + firstName + "!" : "!"} من ${assistantName || "دستیار"} شما هستم. هر سوالی درباره پلتفرم داری بپرس 💬`} delay={0} />
                  )}
                  {chatMessages.map((msg, i) => (
                    <div key={i} className={cn("flex flex-col", msg.role === "user" ? "items-start" : "items-end")}>
                      <div className={cn("max-w-[80%] rounded-2xl text-sm leading-relaxed overflow-hidden",
                        msg.role === "user" ? "bg-muted/60 text-foreground rounded-br-sm px-4 py-2.5" : "bg-gradient-to-br from-violet-600 to-purple-700 text-white rounded-bl-sm"
                      )}>
                        <p className={msg.role === "user" ? "" : "px-4 py-2.5"}>{msg.content}</p>
                        {/* Action buttons inside the assistant bubble */}
                        {msg.role === "assistant" && msg.actions && msg.actions.length > 0 && (
                          <div dir="rtl" className="flex flex-wrap gap-2 px-3 pb-3 border-t border-white/20 pt-2">
                            {msg.actions.map((act, ai) => (
                              <button key={ai} onClick={() => navigate(act.route)} dir="rtl"
                                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 hover:bg-white/30 active:scale-95 text-white shadow-sm transition-all">
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                {act.label}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  {chatTyping && (
                    <div className="flex justify-end">
                      <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl rounded-bl-sm px-4 py-3">
                        <div className="flex items-center gap-1">
                          {[0, 1, 2].map(i => (
                            <motion.span key={i} className="w-1.5 h-1.5 rounded-full bg-white"
                              animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
                              transition={{ duration: 0.8, delay: i * 0.2, repeat: Infinity }} />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                  <div ref={chatEndRef} />
                </motion.div>
              )}

            </motion.div>
          )}

          {/* ── NEW TASK (Wizard) ────────────────────────────────────────── */}
          {view === "new-task" && (
            <motion.div key="new-task" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
              <BotBubble text={namePicks[8] ? `${namePicks[8]}، بریم یه کار جدید ثبت کنیم!` : "بریم یه کار جدید ثبت کنیم!"} />

              {/* Progress bar */}
              <div className="flex items-center gap-2.5 px-1">
                <div className="flex gap-1 flex-1">
                  {WIZARD_STEPS.map((_, i) => (
                    <div key={i} className={cn("flex-1 h-1.5 rounded-full transition-all duration-300",
                      i < wizardStep ? "bg-violet-500" : "bg-border/40"
                    )} />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground font-medium shrink-0 tabular-nums">
                  {["۱","۲","۳","۴","۵","۶"][wizardStep - 1]} از ۶
                </span>
              </div>

              {/* Step label */}
              <div className="text-center">
                <span className="text-xs font-semibold text-violet-500 bg-violet-500/10 px-3 py-1 rounded-full border border-violet-500/20">
                  مرحله {["۱","۲","۳","۴","۵","۶"][wizardStep - 1]}: {WIZARD_STEPS[wizardStep - 1]}
                </span>
              </div>

              {/* Step content with animation */}
              <AnimatePresence mode="wait">
                <motion.div key={wizardStep}
                  initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                  transition={{ duration: 0.18 }}>
                  {wizardStep === 1 && WizardStep1()}
                  {wizardStep === 2 && WizardStep2()}
                  {wizardStep === 3 && WizardStep3()}
                  {wizardStep === 4 && WizardStep4()}
                  {wizardStep === 5 && WizardStep5()}
                  {wizardStep === 6 && WizardStep6()}
                </motion.div>
              </AnimatePresence>

              {/* Navigation buttons */}
              <div className="flex gap-3">
                {wizardStep > 1 && (
                  <Button variant="outline" className="flex-1 h-12 rounded-2xl font-bold border-border/60"
                    onClick={() => setWizardStep(s => s - 1)}>
                    <ChevronRight className="w-4 h-4 ml-1" />
                    قبلی
                  </Button>
                )}
                {wizardStep < 6 ? (
                  <Button
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-l from-violet-600 to-purple-500 hover:from-violet-700 hover:to-purple-600 text-white font-bold shadow-md"
                    disabled={wizardStep === 2 && !taskTitle.trim()}
                    onClick={() => setWizardStep(s => s + 1)}>
                    بعدی
                    <ChevronLeft className="w-4 h-4 mr-1" />
                  </Button>
                ) : (
                  <Button
                    className="flex-1 h-12 rounded-2xl bg-gradient-to-l from-violet-600 to-purple-500 hover:from-violet-700 hover:to-purple-600 text-white font-bold shadow-lg text-base"
                    disabled={!taskTitle.trim() || createTask.isPending}
                    onClick={() => createTask.mutate()}>
                    {createTask.isPending ? "در حال ذخیره..." : "✅ ثبت کار"}
                  </Button>
                )}
              </div>
            </motion.div>
          )}

          {/* ── EDIT TASK ───────────────────────────────────────────────────── */}
          {view === "edit-task" && editingTask && (
            <motion.div key="edit-task" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -16 }} className="space-y-5">
              <BotBubble text={namePicks[9] ? `${namePicks[9]}، کار رو ویرایش کنید:` : "کار رو ویرایش کنید:"} />
              {TaskFormFields()}
              <Button className="w-full h-12 rounded-2xl bg-gradient-to-l from-blue-600 to-blue-500 hover:from-blue-700 hover:to-blue-600 text-white font-bold shadow-lg text-base"
                disabled={!taskTitle.trim() || editTask.isPending}
                onClick={() => editTask.mutate({ id: editingTask.id, title: taskTitle, category: taskCategory, priority: taskPriority, dueAt: taskDue || undefined, repeatType: taskRepeatType, repeatDays: taskRepeatDays || undefined })}>
                {editTask.isPending ? "در حال ذخیره..." : "✏️ ذخیره تغییرات"}
              </Button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── FAB backdrop ────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {fabOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => setFabOpen(false)} />
        )}
      </AnimatePresence>

      {/* ── Bottom bar (tasks tab) ───────────────────────────────────────────── */}
      {view === "home" && mainTab === "tasks" && (
        <div className="sticky bg-background border-t border-border px-4 py-3"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
          <Button className="w-full h-11 rounded-2xl bg-gradient-to-l from-violet-600 to-purple-500 hover:from-violet-700 hover:to-purple-600 text-white font-semibold shadow-md" onClick={() => setView("new-task")}>
            <Plus className="w-4 h-4 ml-1.5" />ثبت کار جدید
          </Button>
        </div>
      )}

      {/* ── Chat input bar — hidden until CHAT_TAB_ENABLED = true ──────────── */}
      {CHAT_TAB_ENABLED && view === "home" && mainTab === "chat" && (
        <div className="sticky bg-background border-t border-border/50 px-4 py-3"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}>
          {visibleChips.length > 0 && !chatTyping && (
            <div className="flex gap-2 mb-2.5 flex-nowrap overflow-x-auto pb-0.5 scrollbar-hide" dir="rtl">
              {visibleChips.map((chip: any) => (
                <button key={chip.id} onClick={() => handleChipClick(chip)}
                  className="flex-shrink-0 text-xs font-semibold px-3 py-1.5 rounded-xl bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20 active:bg-violet-500/20 transition-colors text-right whitespace-nowrap">
                  {chip.question}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-end gap-2">
            <div className="flex-1 relative">
              <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); } }}
                placeholder="سوالت رو بپرس..." rows={1} disabled={chatTyping}
                className="w-full resize-none bg-muted/40 border border-border/50 rounded-2xl px-4 py-3 text-sm text-right placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-violet-500/30 disabled:opacity-50 max-h-28 overflow-auto"
                style={{ lineHeight: "1.5", fontSize: 16 }} />
            </div>
            <button onClick={() => sendChatMessage()} disabled={!chatInput.trim() || chatTyping}
              className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-600 to-purple-700 text-white flex items-center justify-center shadow-md disabled:opacity-40 hover:from-violet-700 hover:to-purple-800 transition-all shrink-0">
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Quick input bar (messages tab) ──────────────────────────────────── */}
      <AnimatePresence>
        {view === "home" && mainTab === "messages" && (
          <motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 60, opacity: 0 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="fixed inset-x-0 z-40 bg-background border-t border-border px-4 pt-3 pb-3"
            style={{ bottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }}
            dir="rtl">
            <div className="flex items-center gap-2 max-w-lg mx-auto">
              <div className="flex-1">
                <input value={quickInputText} onChange={e => setQuickInputText(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter" && quickInputText.trim()) { setTaskTitle(quickInputText.trim()); setQuickInputText(""); setView("new-task"); } }}
                  placeholder="چه کاری میخوای اضافه کنی؟"
                  className="w-full bg-muted/60 border border-border/60 rounded-2xl pr-4 pl-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 placeholder:text-muted-foreground"
                  style={{ fontSize: 16 }} />
              </div>
              <motion.button whileTap={{ scale: 0.88 }} disabled={!quickInputText.trim()}
                onClick={() => { if (quickInputText.trim()) { setTaskTitle(quickInputText.trim()); setQuickInputText(""); setView("new-task"); } }}
                className="w-10 h-10 rounded-2xl bg-violet-600 flex items-center justify-center text-white disabled:opacity-40 disabled:cursor-not-allowed transition-all shrink-0 shadow-md">
                <Send className="w-4 h-4" />
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB items ────────────────────────────────────────────────────────── */}
      <div className="fixed right-4 z-50 flex flex-col items-end gap-3"
        style={{ bottom: "calc(14rem + env(safe-area-inset-bottom, 0px))" }}>
        <AnimatePresence>
          {fabOpen && (
            <>
              {[
                { icon: Bot,  label: "خانه",         color: "bg-violet-600",  action: () => goToMessages() },
                { icon: Plus,  label: "کار جدید",    color: "bg-green-600",   action: () => { setView("new-task"); setFabOpen(false); } },
                { icon: List,  label: "لیست کارها",  color: "bg-blue-600",    action: () => goToTasks("all") },
                { icon: Bell,  label: "کارهای امروز",color: "bg-yellow-600",  action: () => goToTasks("today") },
              ].map((item, i) => (
                <motion.div key={item.label} initial={{ opacity: 0, y: 16, scale: 0.85 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.85 }}
                  transition={{ delay: i * 0.05, type: "spring", stiffness: 420, damping: 30 }}
                  className="flex items-center gap-3 cursor-pointer" onClick={item.action}>
                  <span className="bg-background text-foreground text-sm font-bold px-4 py-2 rounded-2xl shadow-xl border border-border/60 whitespace-nowrap select-none">{item.label}</span>
                  <div className={cn("w-12 h-12 rounded-full flex items-center justify-center shadow-xl text-white shrink-0", item.color)}><item.icon className="w-5 h-5" /></div>
                </motion.div>
              ))}
            </>
          )}
        </AnimatePresence>
      </div>

      {/* Main FAB */}
      <div className="fixed right-4 z-50"
        style={{ bottom: "calc(10rem + env(safe-area-inset-bottom, 0px))" }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={() => setFabOpen(o => !o)}
          className={cn("w-14 h-14 rounded-full shadow-2xl flex items-center justify-center transition-colors duration-200",
            fabOpen ? "bg-white text-gray-900" : "bg-gradient-to-br from-violet-600 to-purple-500 text-white"
          )}>
          <motion.div animate={{ rotate: fabOpen ? 45 : 0 }} transition={{ duration: 0.2 }}><Plus className="w-6 h-6" /></motion.div>
        </motion.button>
      </div>

      {/* ── Assistant Name Dialog ─────────────────────────────────────────────── */}
      <AnimatePresence>
        {showNameDialog && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm" onClick={() => setShowNameDialog(false)} />
            <motion.div initial={{ opacity: 0, y: 80, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 80, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              className="fixed bottom-0 inset-x-0 z-[61] bg-background border-t border-border rounded-t-3xl p-6 flex flex-col gap-5"
              style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))" }} dir="rtl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center"><Bot className="w-5 h-5 text-white" /></div>
                  <div><p className="text-sm font-bold">اسم دستیارت رو انتخاب کن</p><p className="text-xs text-muted-foreground">این اسم فقط پیش خودت می‌مونه</p></div>
                </div>
                <button onClick={() => setShowNameDialog(false)} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              <div className="flex flex-wrap gap-2">
                {["آریا", "آیدا", "سینا", "نیکا", "آوا", "رضا", "مهرسا", "الکسا", "سام"].map(name => (
                  <button key={name} onClick={() => setNewAssistantName(name)}
                    className={cn("px-3 py-1.5 rounded-full text-sm border transition-all",
                      newAssistantName === name ? "bg-violet-600 text-white border-violet-600" : "border-border/60 text-muted-foreground hover:border-violet-500/60"
                    )}>{name}</button>
                ))}
              </div>
              <input type="text" value={newAssistantName} onChange={e => setNewAssistantName(e.target.value.slice(0, 40))}
                placeholder="اسم دلخواه..."
                className="w-full bg-muted/50 border border-border/60 rounded-2xl px-4 py-3 text-sm outline-none focus:border-violet-500/60 transition-colors" style={{ fontSize: 16 }} />
              <div className="flex gap-2">
                {assistantName && (
                  <Button variant="outline" className="flex-1 rounded-2xl" onClick={() => setAssistantNameMutation.mutate(null)}>حذف اسم</Button>
                )}
                <Button className="flex-1 rounded-2xl bg-violet-600 hover:bg-violet-700"
                  disabled={!newAssistantName.trim() || setAssistantNameMutation.isPending}
                  onClick={() => { const n = newAssistantName.trim(); if (n) setAssistantNameMutation.mutate(n); }}>
                  {setAssistantNameMutation.isPending ? "در حال ذخیره..." : "ذخیره"}
                </Button>
              </div>
            </motion.div>
          </>
        )}

        {/* ── Avatar Picker Dialog ──────────────────────────────────────────── */}
        {showAvatarDialog && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
              onClick={() => { setShowAvatarDialog(false); setPurchaseConfirmId(null); }} />
            <motion.div initial={{ opacity: 0, y: 80, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 80, scale: 0.95 }}
              transition={{ type: "spring", damping: 25, stiffness: 300 }}
              ref={avatarDialogScrollRef}
              className="fixed bottom-0 inset-x-0 z-[61] bg-background border-t border-border rounded-t-3xl p-5 flex flex-col gap-4 overflow-y-auto"
              style={{
                maxHeight: "calc(85vh - env(safe-area-inset-top, 0px))",
                paddingTop: "max(1.25rem, env(safe-area-inset-top, 0px))",
                paddingBottom: "calc(5rem + env(safe-area-inset-bottom, 0px))",
              }} dir="rtl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-9 h-9 rounded-full bg-gradient-to-br from-violet-500 to-purple-700 flex items-center justify-center"><Sparkles className="w-5 h-5 text-white" /></div>
                  <div><p className="text-sm font-bold">عکس پروفایل دستیار</p><p className="text-xs text-muted-foreground">آواتار دلخواهت رو انتخاب کن</p></div>
                </div>
                <button onClick={() => { setShowAvatarDialog(false); setPurchaseConfirmId(null); }} className="text-muted-foreground hover:text-foreground"><X className="w-5 h-5" /></button>
              </div>
              {avatarData?.hasPremium && (
                <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-2xl px-3 py-2">
                  <Crown className="w-4 h-4 text-amber-500" />
                  <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">اشتراک پریمیوم — همه آواتارها رایگان</p>
                </div>
              )}
              {/* Confirm purchase */}
              {purchaseConfirmId && (() => {
                const av = AVATARS.find(a => a.id === purchaseConfirmId);
                if (!av) return null;
                return (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="bg-muted/60 border border-border/60 rounded-2xl p-4 flex flex-col gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-14 h-14 rounded-full overflow-hidden shrink-0"><AvatarSvg id={av.id} size={56} /></div>
                      <div>
                        <p className="font-bold text-sm">خرید آواتار «{av.name}»</p>
                        <p className="text-xs text-muted-foreground">۹۹,۰۰۰ تومان — خرید یک‌بار برای همیشه</p>
                        <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-0.5 flex items-center gap-1">
                          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M10 3L5 9L2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          پرداخت امن از طریق درگاه زرین‌پال
                        </p>
                      </div>
                    </div>
                    <div className="bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800/50 rounded-xl px-3 py-2 text-xs text-violet-700 dark:text-violet-300 text-right">
                      پس از کلیک روی دکمه زیر، به درگاه امن زرین‌پال منتقل می‌شوید.
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1 rounded-xl" onClick={() => setPurchaseConfirmId(null)}>انصراف</Button>
                      <Button size="sm" className="flex-1 rounded-xl bg-gradient-to-l from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 border-0 text-white"
                        disabled={avatarBuyLoading} onClick={() => handleAvatarPurchase(purchaseConfirmId)}>
                        {avatarBuyLoading
                          ? <span className="flex items-center gap-1.5"><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />در حال انتقال...</span>
                          : <span className="flex items-center gap-1.5">
                              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="3" width="12" height="9" rx="2" stroke="white" strokeWidth="1.3"/><path d="M1 6h12" stroke="white" strokeWidth="1.3"/><rect x="3" y="8.5" width="3" height="1.5" rx="0.5" fill="white"/></svg>
                              پرداخت — ۹۹,۰۰۰ تومان
                            </span>
                        }
                      </Button>
                    </div>
                  </motion.div>
                );
              })()}
              {/* Avatar preview overlay */}
              {previewAvatarId && (() => {
                const pav = AVATARS.find(a => a.id === previewAvatarId)!;
                const pOwned = avatarData?.owned?.includes(pav.id) ?? pav.free;
                const pLocked = !pOwned;
                return (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
                    className="fixed inset-0 z-[70] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm"
                    onClick={() => setPreviewAvatarId(null)}>
                    <div className="flex flex-col items-center gap-5 p-6" onClick={e => e.stopPropagation()}>
                      <div className="w-64 h-64 rounded-full overflow-hidden border-4 border-violet-500 shadow-2xl shadow-violet-500/40"><AvatarSvg id={pav.id} size={256} /></div>
                      <div className="flex flex-col items-center gap-1">
                        <span className="text-white text-xl font-bold">{pav.name}</span>
                        {pav.free ? <span className="text-green-400 text-sm font-bold">رایگان</span>
                          : pLocked ? <span className="text-amber-400 text-sm">۹۹ هزار تومان · یک‌بار</span>
                          : <span className="text-violet-400 text-sm">✓ خریداری شده</span>}
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => setPreviewAvatarId(null)} className="px-5 py-2.5 rounded-2xl bg-white/10 text-white text-sm border border-white/20">بستن</button>
                        {pLocked ? (
                          <button onClick={() => { setPreviewAvatarId(null); setPurchaseConfirmId(pav.id); }} className="px-5 py-2.5 rounded-2xl bg-amber-500 text-white text-sm font-bold">خرید یک‌بار</button>
                        ) : (
                          <button onClick={() => { setAvatarMutation.mutate(pav.id); setShowAvatarDialog(false); setPreviewAvatarId(null); }} className="px-5 py-2.5 rounded-2xl bg-violet-600 text-white text-sm font-bold">انتخاب این آواتار</button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}
              {/* Gender tabs */}
              <div className="flex rounded-2xl bg-muted/50 p-1 gap-1">
                <button onClick={() => setAvatarGender("female")} className={cn("flex-1 py-2 rounded-xl text-sm font-bold transition-all", avatarGender === "female" ? "bg-pink-500 text-white shadow-sm" : "text-muted-foreground")}>چهره خانم</button>
                <button onClick={() => setAvatarGender("male")} className={cn("flex-1 py-2 rounded-xl text-sm font-bold transition-all", avatarGender === "male" ? "bg-blue-500 text-white shadow-sm" : "text-muted-foreground")}>چهره آقا</button>
              </div>
              {/* Avatar grid */}
              <div className="grid grid-cols-3 gap-4">
                {avatarGender === "female" && (
                  <div className="flex flex-col items-center gap-2">
                    <button onClick={() => { setAvatarMutation.mutate(null); setShowAvatarDialog(false); }}
                      className={cn("w-24 h-24 rounded-full border-2 flex items-center justify-center transition-all active:scale-95 bg-muted/50",
                        !assistantAvatar ? "border-violet-500 ring-2 ring-violet-500/30" : "border-border/50"
                      )}><Bot className="w-10 h-10 text-muted-foreground" /></button>
                    <span className="text-xs text-muted-foreground">پیش‌فرض</span>
                  </div>
                )}
                {AVATARS.filter(av => av.gender === avatarGender).map(av => {
                  const owned = avatarData?.owned?.includes(av.id) ?? av.free;
                  const isSelected = assistantAvatar === av.id;
                  const isLocked = !owned;
                  return (
                    <div key={av.id} className="flex flex-col items-center gap-2">
                      <button onClick={() => setPreviewAvatarId(av.id)}
                        className={cn("relative w-24 h-24 rounded-full overflow-visible border-2 transition-all active:scale-95",
                          isSelected ? "border-violet-500 ring-2 ring-violet-500/30" : "border-violet-300/40 dark:border-violet-700/40"
                        )}>
                        <div className="w-full h-full rounded-full overflow-hidden"><AvatarSvg id={av.id} size={96} /></div>
                        {isLocked && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-amber-500 rounded-full flex items-center justify-center border-2 border-background z-10">
                            <Lock className="w-3 h-3 text-white" />
                          </div>
                        )}
                        {isSelected && !isLocked && (
                          <div className="absolute -bottom-1 -right-1 w-6 h-6 bg-violet-600 rounded-full flex items-center justify-center border-2 border-background z-10">
                            <CheckCheck className="w-3.5 h-3.5 text-white" />
                          </div>
                        )}
                      </button>
                      <div className="flex flex-col items-center gap-0.5">
                        <span className="text-xs font-medium">{av.name}</span>
                        {av.free ? <span className="text-[10px] text-green-500 font-bold">رایگان</span>
                          : isLocked ? <span className="text-[10px] text-amber-500">۹۹ هزار تومان · یک‌بار</span>
                          : <span className="text-[10px] text-violet-500">✓ خریداری شده</span>}
                      </div>
                    </div>
                  );
                })}
              </div>

            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
