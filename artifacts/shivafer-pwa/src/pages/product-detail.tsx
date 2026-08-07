import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useState, useEffect, useRef } from "react";
import { getOrCreateGuestId } from "@/lib/guest-id";
import { toast } from "sonner";
import { AudioDescriptionPlayer } from "@/components/audio-description-player";
import { CachedImage } from "@/components/ui/cached-image";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight, ShoppingBag, CheckCircle2, Tag, AlertCircle,
  Sparkles, MessageCircle, Phone, PlayCircle, Music2, ChevronDown,
  Clock, Globe, Target, Layers, Zap, Calendar, BookOpen, Package,
  Headphones, Star, Award, Users, Play, Pause
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatPrice } from "@/lib/persian";
import { useAuth } from "@/lib/auth";
import type { Product } from "@workspace/api-client-react";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

interface ProductFile {
  url: string; name: string; size?: number;
  fileType?: string; title?: string; description?: string;
}
interface CategoryInfo { id: number; name: string; slug: string; }

const CATEGORY_META: Record<string, { color: string; glow: string; gradient: string; label: string; icon: string }> = {
  "physical":       { label: "کالای فیزیکی",    color: "#f59e0b", glow: "rgba(245,158,11,0.3)",  gradient: "linear-gradient(135deg,rgba(245,158,11,0.2),rgba(245,158,11,0.05))", icon: "📦" },
  "ebook":          { label: "کتاب الکترونیکی",  color: "#60a5fa", glow: "rgba(96,165,250,0.3)",  gradient: "linear-gradient(135deg,rgba(96,165,250,0.2),rgba(96,165,250,0.05))",  icon: "📖" },
  "printed-book":   { label: "کتاب چاپی",        color: "#34d399", glow: "rgba(52,211,153,0.3)",  gradient: "linear-gradient(135deg,rgba(52,211,153,0.2),rgba(52,211,153,0.05))",  icon: "📚" },
  "premium-tools":  { label: "ابزارهای پرمیوم",  color: "#a78bfa", glow: "rgba(167,139,250,0.3)", gradient: "linear-gradient(135deg,rgba(167,139,250,0.2),rgba(167,139,250,0.05))", icon: "⚡" },
  "seminar":        { label: "سمینار",            color: "var(--gold-primary)", glow: "var(--gold-glow)",  gradient: "linear-gradient(135deg,rgba(232,184,0,0.15),rgba(232,184,0,0.04))",  icon: "🎤" },
  "services":       { label: "خدمات",            color: "#22d3ee", glow: "rgba(34,211,238,0.3)",  gradient: "linear-gradient(135deg,rgba(34,211,238,0.2),rgba(34,211,238,0.05))",  icon: "🛠️" },
  "consulting":     { label: "مشاوره",           color: "#f472b6", glow: "rgba(244,114,182,0.3)", gradient: "linear-gradient(135deg,rgba(244,114,182,0.2),rgba(244,114,182,0.05))", icon: "💬" },
  "digital-files":  { label: "فایل‌های دیجیتال", color: "#818cf8", glow: "rgba(129,140,248,0.3)", gradient: "linear-gradient(135deg,rgba(129,140,248,0.2),rgba(129,140,248,0.05))", icon: "💾" },
  "vip-membership": { label: "عضویت ویژه",       color: "#fbbf24", glow: "rgba(251,191,36,0.35)", gradient: "linear-gradient(135deg,rgba(251,191,36,0.22),rgba(251,191,36,0.05))", icon: "👑" },
  "hypnotherapy":   { label: "هیپنوتراپی",       color: "#c084fc", glow: "rgba(192,132,252,0.35)", gradient: "linear-gradient(135deg,rgba(192,132,252,0.2),rgba(192,132,252,0.05))", icon: "🎧" },
  "coaching":       { label: "کوچینگ",           color: "#f87171", glow: "rgba(248,113,113,0.3)", gradient: "linear-gradient(135deg,rgba(248,113,113,0.2),rgba(248,113,113,0.05))", icon: "🎯" },
};
const DEFAULT_META = { color: "#9ca3af", glow: "rgba(156,163,175,0.25)", gradient: "linear-gradient(135deg,rgba(156,163,175,0.15),rgba(156,163,175,0.04))", label: "محصول", icon: "📌" };

const META_LABELS: Record<string, { label: string; icon: React.ReactNode }> = {
  weight:         { label: "وزن",             icon: <Package className="w-4 h-4" /> },
  dimensions:     { label: "ابعاد",           icon: <Layers className="w-4 h-4" /> },
  stock:          { label: "موجودی",          icon: <Zap className="w-4 h-4" /> },
  pageCount:      { label: "تعداد صفحه",      icon: <BookOpen className="w-4 h-4" /> },
  format:         { label: "فرمت",            icon: <Tag className="w-4 h-4" /> },
  sessionCount:   { label: "تعداد جلسه",      icon: <Calendar className="w-4 h-4" /> },
  sessionDuration:{ label: "مدت هر جلسه",      icon: <Clock className="w-4 h-4" /> },
  duration:       { label: "مدت زمان",        icon: <Clock className="w-4 h-4" /> },
  toolType:       { label: "نوع ابزار",       icon: <Zap className="w-4 h-4" /> },
  accessPeriod:   { label: "دوره دسترسی",     icon: <Clock className="w-4 h-4" /> },
  language:       { label: "زبان",            icon: <Globe className="w-4 h-4" /> },
  level:          { label: "سطح",             icon: <Award className="w-4 h-4" /> },
  goal:           { label: "هدف درمانی",      icon: <Target className="w-4 h-4" /> },
  medium:         { label: "روش ارائه",       icon: <Globe className="w-4 h-4" /> },
  technique:      { label: "تکنیک‌های مورد استفاده", icon: <Star className="w-4 h-4" /> },
  instructor:     { label: "مدرس",            icon: <Users className="w-4 h-4" /> },
  capacity:       { label: "ظرفیت",           icon: <Users className="w-4 h-4" /> },
  location:       { label: "مکان",            icon: <Globe className="w-4 h-4" /> },
  date:           { label: "تاریخ",           icon: <Calendar className="w-4 h-4" /> },
};

function GlassCard({ children, className = "", style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties }) {
  return (
    <div
      className={`rounded-2xl border border-black/10 dark:border-white/10 bg-black/[0.03] dark:bg-white/[0.04] backdrop-blur-md ${className}`}
      style={{
        WebkitBackdropFilter: "blur(12px)",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function DescriptionSection({ text, color, audioUrl }: { text: string; color: string; audioUrl?: string }) {
  const [open, setOpen] = useState(false);
  const [peekOpen, setPeekOpen] = useState(false);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const peekTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const paragraphs = text.split(/\n+/).filter(Boolean);

  // ── Peek animation: هر ۳.۵ ثانیه کمی باز می‌شه ──────────────────────────
  useEffect(() => {
    if (open) {
      setPeekOpen(false);
      if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
      return;
    }
    const runPeek = () => {
      setPeekOpen(true);
      peekTimeoutRef.current = setTimeout(() => setPeekOpen(false), 2500);
    };
    const firstId = setTimeout(runPeek, 1800);
    const intervalId = setInterval(runPeek, 3800);
    return () => {
      clearTimeout(firstId);
      clearInterval(intervalId);
      if (peekTimeoutRef.current) clearTimeout(peekTimeoutRef.current);
    };
  }, [open]);

  // ── Audio play/pause ──────────────────────────────────────────────────────
  const toggleAudio = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current || !audioUrl) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play().catch(() => {});
      setPlaying(true);
    }
  };

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        border: `1px solid ${open ? color + "55" : color + "30"}`,
        background: "var(--glass-card-bg, rgba(0,0,0,0.03))",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
      }}
      animate={
        !open
          ? { boxShadow: [`0 0 0px ${color}00`, `0 0 18px ${color}55`, `0 0 4px ${color}22`, `0 0 18px ${color}55`, `0 0 0px ${color}00`] }
          : { boxShadow: `0 0 20px ${color}33` }
      }
      transition={
        !open
          ? { boxShadow: { duration: 2.4, repeat: Infinity, ease: "easeInOut" } }
          : { boxShadow: { duration: 0.3 } }
      }
    >
      {/* ── دکمه باز/بسته ── */}
      <button
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-5 py-4 gap-3"
        style={{ direction: "rtl" }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <motion.div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: `${color}20`, border: `1.5px solid ${color}50` }}
            animate={!open ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={!open ? { duration: 1.8, repeat: Infinity, ease: "easeInOut" } : {}}
          >
            <BookOpen className="w-4 h-4" style={{ color }} />
          </motion.div>
          <div className="flex flex-col items-start gap-0.5 min-w-0">
            <span className="text-sm font-black text-foreground">توضیحات محصول</span>
            <AnimatePresence>
              {!open && (
                <motion.span
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ opacity: { duration: 1.6, repeat: Infinity }, exit: { duration: 0.2 } }}
                  className="text-[11px] text-muted-foreground font-medium"
                >
                  برای مشاهده لمس کنید
                </motion.span>
              )}
            </AnimatePresence>
          </div>
        </div>

        <motion.div
          className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
          style={{
            background: `${color}${open ? "30" : "18"}`,
            border: `1.5px solid ${color}${open ? "60" : "40"}`,
            boxShadow: open ? `0 0 12px ${color}55` : `0 0 6px ${color}30`,
          }}
          animate={open ? { rotate: 180, y: 0 } : { rotate: 0, y: [0, 4, 0] }}
          transition={
            open
              ? { rotate: { duration: 0.35, ease: [0.34, 1.56, 0.64, 1] }, y: { duration: 0 } }
              : { rotate: { duration: 0.35 }, y: { duration: 1.0, repeat: Infinity, ease: "easeInOut" } }
          }
        >
          <ChevronDown className="w-4 h-4" style={{ color }} />
        </motion.div>
      </button>

      {/* ── Peek — پیش‌نمایش جزئی هر چند ثانیه ── */}
      <AnimatePresence>
        {!open && peekOpen && (
          <motion.div
            key="peek"
            variants={{
              hidden: {
                height: 0,
                opacity: 0,
                transition: {
                  height: { duration: 0.8, ease: [0.4, 0, 0.2, 1] },
                  opacity: { duration: 0.6 },
                },
              },
              visible: {
                height: 78,
                opacity: 1,
                transition: {
                  height: { duration: 0.9, ease: [0.34, 1.2, 0.64, 1] },
                  opacity: { duration: 0.5 },
                },
              },
            }}
            initial="hidden"
            animate="visible"
            exit="hidden"
            style={{ overflow: "hidden", position: "relative" }}
          >
            <div className="px-5 pt-2 pb-1 space-y-1.5" style={{ direction: "rtl" }}>
              {paragraphs.slice(0, 3).map((p, i) => (
                <p key={i} className="text-xs leading-relaxed text-foreground/70 line-clamp-1">{p}</p>
              ))}
            </div>
            {/* فید محو در پایین */}
            <div style={{
              position: "absolute", bottom: 0, left: 0, right: 0, height: 36,
              background: `linear-gradient(to top, var(--glass-card-bg, rgba(0,0,0,0.06)) 30%, transparent)`,
              pointerEvents: "none",
            }} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── محتوای کامل (وقتی باز است) ── */}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="desc-content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ height: { duration: 0.4, ease: [0.4, 0, 0.2, 1] }, opacity: { duration: 0.3 } }}
            style={{ overflow: "hidden" }}
          >
            <div className="px-5 pb-5 space-y-3" style={{ direction: "rtl" }}>
              <div className="w-full h-px" style={{ background: `linear-gradient(90deg, ${color}55, ${color}10, transparent)` }} />

              {/* ── دکمه پخش صدای توضیحات ── */}
              {audioUrl && (
                <div>
                  <audio
                    ref={audioRef}
                    src={audioUrl}
                    onEnded={() => setPlaying(false)}
                    className="hidden"
                  />
                  <motion.button
                    onClick={toggleAudio}
                    whileTap={{ scale: 0.97 }}
                    className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all"
                    style={{
                      background: playing
                        ? `linear-gradient(135deg, ${color}35, ${color}18)`
                        : `linear-gradient(135deg, ${color}22, ${color}0e)`,
                      border: `1.5px solid ${color}${playing ? "60" : "40"}`,
                      color,
                      boxShadow: playing ? `0 0 20px ${color}40, inset 0 1px 0 ${color}20` : `0 0 8px ${color}18`,
                      direction: "rtl",
                    }}
                  >
                    {/* آیکون پخش/توقف */}
                    <motion.div
                      className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: `${color}25`, border: `1.5px solid ${color}45` }}
                      animate={playing ? { scale: [1, 1.06, 1] } : { scale: 1 }}
                      transition={playing ? { duration: 1.2, repeat: Infinity, ease: "easeInOut" } : {}}
                    >
                      {playing
                        ? <Pause className="w-4 h-4" />
                        : <Play className="w-4 h-4" style={{ marginRight: -1 }} />
                      }
                    </motion.div>

                    {/* متن */}
                    <div className="flex-1 text-right min-w-0">
                      <div className="text-sm font-black">
                        {playing ? "در حال پخش توضیحات صوتی..." : "گوش دادن به توضیحات صوتی"}
                      </div>
                      <div className="text-[11px] font-normal opacity-60 mt-0.5">
                        {playing ? "برای توقف دوباره بزنید" : "بدون نیاز به خواندن"}
                      </div>
                    </div>

                    {/* نوار‌های متحرک هنگام پخش */}
                    {playing && (
                      <div className="flex gap-0.5 items-end h-5 flex-shrink-0">
                        {[3, 5, 4, 7, 3, 6, 4].map((h, i) => (
                          <motion.div
                            key={i}
                            className="w-[3px] rounded-full"
                            style={{ background: color }}
                            animate={{ height: [`${h * 2}px`, `${h * 4}px`, `${h * 2}px`] }}
                            transition={{ duration: 0.7, repeat: Infinity, delay: i * 0.1, ease: "easeInOut" }}
                          />
                        ))}
                      </div>
                    )}
                  </motion.button>
                </div>
              )}

              {/* ── متن توضیحات ── */}
              {paragraphs.map((p, i) => (
                <motion.p
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05, duration: 0.3 }}
                  className="text-sm leading-loose text-foreground/80"
                >
                  {p}
                </motion.p>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

interface DiscountInfo {
  active: boolean;
  percent: number;
  source: string;
  endsAt: string | null;
  remainingSeconds: number;
}

function formatCountdown(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}روز ${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

export default function ProductDetail() {
  const [, navigate] = useLocation();
  const smartBack = () => navigate('/products');
  const { token } = useAuth();
  const [, params] = useRoute("/product/:id");
  const productId = params?.id ? parseInt(params.id) : 0;

  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [discountSec, setDiscountSec] = useState(0);

  const { data: product, isLoading, isError } = useQuery<Product>({
    queryKey: ["product", productId],
    queryFn: async () => {
      const r = await fetch(`${API}/api/products/${productId}`);
      if (!r.ok) throw new Error("محصول یافت نشد");
      return r.json();
    },
    enabled: !!productId,
  });

  const { data: categories } = useQuery<CategoryInfo[]>({
    queryKey: ["product-categories"],
    queryFn: async () => {
      const r = await fetch(`${API}/api/product-categories`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: userProducts } = useQuery<Product[]>({
    queryKey: ["user-products"], enabled: !!token,
    queryFn: async () => {
      const r = await fetch(`${API}/api/user/products`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const owned = (userProducts ?? []).some(p => p.id === productId);

  useEffect(() => {
    if (!productId || owned) return;
    if (token) {
      // کاربر لاگین‌کرده — endpoint معمولی
      if (userProducts === undefined) return;
      fetch(`${API}/api/discounts/product/${productId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then((d: DiscountInfo | null) => {
          if (d?.active && d.percent > 0) {
            setDiscountInfo(d);
            setDiscountSec(Math.max(0, d.remainingSeconds ?? 0));
            const key = `disc_shown_product_${productId}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              toast.success(`🏷️ ${d.percent}٪ تخفیف ویژه برای این محصول فعال است!`, { duration: 6000, position: "top-center" });
            }
          }
        })
        .catch(() => {});
    } else {
      // کاربر مهمان — از endpoint مهمان استفاده کن
      const guestId = getOrCreateGuestId();
      fetch(`${API}/api/discounts/guest/product/${productId}`, { headers: { "x-guest-id": guestId } })
        .then(r => r.ok ? r.json() : null)
        .then((d: DiscountInfo | null) => {
          if (d?.active && d.percent > 0) {
            setDiscountInfo(d);
            setDiscountSec(Math.max(0, d.remainingSeconds ?? 0));
            const key = `disc_shown_product_guest_${productId}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              toast.success(`🏷️ ${d.percent}٪ تخفیف ویژه برای این محصول فعال است!`, { duration: 6000, position: "top-center" });
            }
          }
        })
        .catch(() => {});
    }
  }, [token, productId, userProducts, owned]);

  useEffect(() => {
    if (discountSec <= 0) return;
    const t = setInterval(() => setDiscountSec(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [discountSec > 0]);

  const catSlug = product?.categoryId
    ? (categories ?? []).find(c => c.id === product.categoryId)?.slug
    : undefined;
  const meta = catSlug ? (CATEGORY_META[catSlug] ?? DEFAULT_META) : DEFAULT_META;
  const catLabel = catSlug ? (CATEGORY_META[catSlug]?.label ?? catSlug) : null;

  const handleBuy = () => {
    if (!token) { navigate("/profile"); return; }
    navigate(`/order-summary?type=product&id=${productId}`);
  };

  if (isLoading) return (
    <div className="min-h-screen pb-24" style={{ background: "var(--app-body-bg)" }} dir="rtl">
      <div className="flex items-center gap-3 px-4 pt-5 pb-4">
        <Skeleton className="w-9 h-9 rounded-xl" />
        <Skeleton className="h-5 w-44 rounded-lg" />
      </div>
      <Skeleton className="w-full aspect-square" />
      <div className="p-4 space-y-3 mt-2">
        <Skeleton className="h-8 w-3/4 rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    </div>
  );

  if (isError || !product) return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-5 p-8"
      style={{ background: "var(--app-body-bg)" }} dir="rtl">
      <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
        style={{ background: "rgba(248,113,113,0.12)", border: "1px solid rgba(248,113,113,0.25)" }}>
        <AlertCircle className="w-8 h-8 text-red-400" />
      </div>
      <p className="text-center text-sm" style={{color:"var(--color-muted-foreground)"}}>محصول یافت نشد</p>
      <button onClick={() => navigate("/products")}
        className="px-6 py-2.5 rounded-xl font-bold text-sm"
        style={{ background: "var(--color-secondary)", color: "var(--color-muted-foreground)", border: "1px solid var(--color-border)" }}>
        بازگشت به فروشگاه
      </button>
    </div>
  );

  const metadata = product.metadata ?? {};
  const hasMetadata = Object.keys(metadata).length > 0;

  return (
    <div className="min-h-screen pb-36"
      style={{ background: "var(--app-body-bg)" }} dir="rtl">

      {/* ── هدر ── */}
      <div className="flex items-center gap-3 px-4 pt-5 pb-3">
        <button onClick={smartBack}
          className="w-9 h-9 rounded-xl flex items-center justify-center transition-all active:scale-90 flex-shrink-0"
          style={{ background: "var(--icon-btn-bg)", border: "1px solid var(--card-glass-border)" }}>
          <ChevronRight className="w-4 h-4" style={{ color: "var(--icon-btn-color)" }} />
        </button>
        <h1 className="text-sm font-black line-clamp-1" style={{ color: "var(--color-foreground)" }}>{product.title}</h1>
      </div>

      {/* ── تصویر ── */}
      <div className="relative w-full overflow-hidden" style={{ aspectRatio: "1/1" }}>
        <CachedImage
          src={product.image}
          alt={product.title}
          className="w-full h-full object-cover"
          fallback={
            <div className="w-full h-full flex items-center justify-center"
              style={{ background: "rgba(255,255,255,0.03)" }}>
              <ShoppingBag className="w-24 h-24 opacity-10 text-white" />
            </div>
          }
        />
        {owned && (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-full"
            style={{ background: "rgba(34,197,94,0.85)", color: "#fff", backdropFilter: "blur(8px)" }}>
            <CheckCircle2 className="w-3.5 h-3.5" /> خریداری شده
          </span>
        )}
      </div>

      {/* ── بدنه اصلی ── */}
      <div className="px-4 pt-5 space-y-4">

        {/* ── عنوان ── */}
        <div>
          <h2 className="text-2xl font-black leading-snug text-white"
            style={{ textShadow: `0 0 30px ${meta.color}44` }}>
            {product.title}
          </h2>
          {catLabel && (
            <span className="inline-flex items-center gap-1.5 mt-2 text-xs font-bold px-2.5 py-1 rounded-lg"
              style={{ background: `${meta.color}18`, color: meta.color, border: `1px solid ${meta.color}33` }}>
              {catLabel}
            </span>
          )}
        </div>

        {/* ── محتوای دیجیتال برای خریداران — اول از همه نمایش داده می‌شود ── */}
        {owned && product.files && product.files.length > 0 && (() => {
          const isHypno = catSlug === "hypnotherapy";
          const videos = product.files!.filter(f => f.fileType === "video");
          const audios = product.files!.filter(f => f.fileType === "audio");
          const others = product.files!.filter(f => !f.fileType || (f.fileType !== "video" && f.fileType !== "audio"));

          return (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                  style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}44` }}>
                  <PlayCircle className="w-4 h-4" style={{ color: meta.color }} />
                </div>
                <h3 className="text-sm font-black text-white/90">محتوای محصول شما</h3>
              </div>

              {isHypno ? (
                <div className="space-y-4">
                  {Array.from({ length: Math.max(videos.length, audios.length) }, (_, i) => {
                    const vid = videos[i];
                    const aud = audios[i];
                    const title = vid?.title || aud?.title || `پارت ${i + 1}`;
                    const desc = vid?.description || aud?.description;
                    return (
                      <GlassCard key={i} style={{ overflow: "hidden" }}>
                        <div className="px-4 pt-4 pb-3 border-b border-white/[0.07]">
                          <div className="flex items-center gap-2">
                            <span className="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-black flex-shrink-0"
                              style={{ background: `${meta.color}22`, color: meta.color, border: `1px solid ${meta.color}33` }}>
                              {i + 1}
                            </span>
                            <p className="text-sm font-black text-white/90">{title}</p>
                          </div>
                          {desc && <p className="text-xs text-white/50 mt-2 leading-relaxed pr-8">{desc}</p>}
                        </div>
                        <div className="p-4 space-y-4">
                          {vid && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <PlayCircle className="w-3.5 h-3.5" style={{ color: meta.color }} />
                                <p className="text-xs text-white/50 font-bold">نسخه تصویری</p>
                              </div>
                              <video
                                src={vid.url}
                                controls
                                controlsList="nodownload"
                                onContextMenu={e => e.preventDefault()}
                                className="w-full rounded-xl"
                                style={{ maxHeight: 220, background: "#000" }}
                              />
                            </div>
                          )}
                          {aud && (
                            <div>
                              <div className="flex items-center gap-1.5 mb-2">
                                <Headphones className="w-3.5 h-3.5" style={{ color: meta.color }} />
                                <p className="text-xs text-white/50 font-bold">نسخه صوتی</p>
                              </div>
                              <div className="rounded-xl p-3" style={{ background: "rgba(0,0,0,0.3)" }}>
                                <audio
                                  src={aud.url}
                                  controls
                                  controlsList="nodownload"
                                  onContextMenu={e => e.preventDefault()}
                                  className="w-full"
                                  style={{ filter: "invert(0.85) hue-rotate(180deg)" }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      </GlassCard>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  {[...videos, ...audios, ...others].map((f, i) => (
                    <GlassCard key={i}>
                      <div className="p-4">
                        {f.title && <p className="text-sm font-black text-white/90 mb-1">{f.title}</p>}
                        {f.description && <p className="text-xs text-white/50 mb-3 leading-relaxed">{f.description}</p>}
                        {(f.fileType === "video" || f.url?.match(/\.(mp4|webm|mov|avi)$/i)) ? (
                          <video
                            src={f.url}
                            controls
                            controlsList="nodownload"
                            onContextMenu={e => e.preventDefault()}
                            className="w-full rounded-xl"
                            style={{ maxHeight: 220, background: "#000" }}
                          />
                        ) : (f.fileType === "audio" || f.url?.match(/\.(mp3|wav|ogg|m4a|aac)$/i)) ? (
                          <div className="rounded-xl p-3" style={{ background: "rgba(0,0,0,0.3)" }}>
                            <audio
                              src={f.url}
                              controls
                              controlsList="nodownload"
                              onContextMenu={e => e.preventDefault()}
                              className="w-full"
                              style={{ filter: "invert(0.85) hue-rotate(180deg)" }}
                            />
                          </div>
                        ) : (
                          <p className="text-xs text-muted-foreground/70 flex items-center gap-1.5">
                            <Package className="w-3.5 h-3.5" /> {f.name}
                          </p>
                        )}
                      </div>
                    </GlassCard>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* ── توضیحات (جمع‌شونده) ── */}
        {product.description && (
          <DescriptionSection text={product.description} color={meta.color} audioUrl={product.audioUrl ?? undefined} />
        )}

        {/* ── مشخصات ── */}
        {hasMetadata && (
          <GlassCard>
            <div className="px-5 pt-4 pb-2 flex items-center gap-3 border-b border-black/[0.08] dark:border-white/[0.07]">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: `${meta.color}22`, border: `1px solid ${meta.color}44` }}>
                <Layers className="w-4 h-4" style={{ color: meta.color }} />
              </div>
              <span className="text-sm font-black text-foreground/90">مشخصات محصول</span>
            </div>
            <div className="p-4 space-y-0 divide-y divide-black/[0.07] dark:divide-white/[0.06]">
              {Object.entries(metadata).filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== "").map(([k, v]) => {
                const info = META_LABELS[k];
                const label = info?.label ?? k;
                const icon = info?.icon ?? <Package className="w-4 h-4" />;
                return (
                  <div key={k} className="flex items-start gap-3 py-3.5" dir="rtl">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 bg-black/5 dark:bg-white/[0.06]"
                      style={{ color: meta.color }}>
                      {icon}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-muted-foreground mb-0.5 font-medium">{label}</p>
                      <p className="text-sm text-foreground/85 leading-relaxed font-medium">{String(v)}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </GlassCard>
        )}

        {/* ── قیمت + تخفیف — فقط برای کاربرانی که محصول را ندارند ── */}
        {!owned && (
          discountInfo?.active && discountInfo.percent > 0 && product.price > 0 ? (
            <GlassCard className="product-price-card" style={{ background: "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.06))", border: "1px solid rgba(239,68,68,0.35)" }}>
              <div className="px-5 pt-4 pb-3 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold" style={{ color: "var(--color-muted-foreground)" }}>قیمت محصول</span>
                  <span className="flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full"
                    style={{ background: "rgba(239,68,68,0.2)", color: "#dc2626", border: "1px solid rgba(239,68,68,0.5)" }}>
                    <Tag className="w-3 h-3" />
                    {discountInfo.percent}٪ تخفیف
                  </span>
                </div>
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <div className="text-muted-foreground/60 text-sm line-through mb-0.5">{formatPrice(product.price)} تومان</div>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black text-red-500" style={{ textShadow: "0 0 20px rgba(239,68,68,0.5)" }}>
                        {formatPrice(Math.round(product.price * (1 - discountInfo.percent / 100) / 1000) * 1000)}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">تومان</span>
                    </div>
                  </div>
                  {discountSec > 0 && (
                    <div className="text-left">
                      <div className="text-xs text-muted-foreground mb-0.5">اتمام تخفیف</div>
                      <div className="font-black text-red-500 text-base tabular-nums" dir="ltr">
                        {formatCountdown(discountSec)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          ) : (
            <GlassCard className="product-price-card" style={{ background: meta.gradient, border: `1px solid ${meta.color}33` }}>
              <div className="px-5 py-4 flex items-center justify-between">
                <span className="text-sm font-bold" style={{ color: "var(--color-muted-foreground)" }}>قیمت محصول</span>
                <div className="text-left">
                  {product.price === 0 ? (
                    <span className="text-xl font-black" style={{ color: "#4ade80" }}>رایگان</span>
                  ) : (
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-2xl font-black" style={{ color: meta.color,
                        textShadow: `0 0 20px ${meta.color}66` }}>
                        {formatPrice(product.price)}
                      </span>
                      <span className="text-xs text-muted-foreground font-medium">تومان</span>
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          )
        )}

        {/* ── بخش سارا (فقط برای محصولات نخریده‌شده) ── */}
        {!owned && (
        <div className="rounded-2xl overflow-hidden" style={{
          background: "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(79,70,229,0.08) 100%)",
          border: "1px solid rgba(124,58,237,0.3)",
          backdropFilter: "blur(12px)",
        }}>
          <div className="px-5 py-4">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                style={{ background: "rgba(196,181,253,0.15)", border: "1px solid rgba(196,181,253,0.25)" }}>
                <Sparkles className="w-4 h-4 text-violet-300" />
              </div>
              <h3 className="text-sm font-black text-foreground/95">سوالی درباره این محصول دارید؟</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-4 leading-relaxed pr-1">
              می‌توانید سوال‌تان را از طریق گفتگوی متنی یا تماس صوتی با سارا بپرسید.
            </p>
            <div className="flex gap-2.5">
              <button
                onClick={() => {
                  try { localStorage.setItem("coursePrefill", JSON.stringify({ title: product.title })); } catch { /* ignore */ }
                  navigate("/ai-chat");
                }}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm active:scale-[0.97] transition-transform"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 4px 15px rgba(124,58,237,0.35)", color: "#ffffff" }}
              >
                <MessageCircle className="w-4 h-4" />
                گفتگوی متنی
              </button>
              <button
                onClick={() => navigate("/advisor")}
                className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm active:scale-[0.97] transition-transform"
                style={{ border: "1px solid rgba(124,58,237,0.5)", background: "rgba(124,58,237,0.25)", color: "#ffffff" }}
              >
                <Phone className="w-4 h-4" />
                تماس با سارا
              </button>
            </div>
          </div>
        </div>
        )}

      </div>

      {/* ── پلیر توضیحات صوتی (فقط برای غیرخریداران) ── */}
      {!owned && product.audioUrl && (
        <AudioDescriptionPlayer
          audioUrl={product.audioUrl}
          title={product.title}
          color={meta.color}
          itemType="product"
        />
      )}

      {/* ── دکمه خرید ثابت پایین ── */}
      <div className="fixed bottom-0 right-0 left-0 px-4 z-30 pb-[84px] pt-4"
        style={{ background: "linear-gradient(to top, var(--app-body-bg) 60%, transparent)" }}>
        <motion.div initial={false} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2, type: "spring", stiffness: 300 }}>
          {owned ? (
            <div className="product-owned-btn w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 font-black text-base"
              style={{
                background: "linear-gradient(135deg, rgba(34,197,94,0.2), rgba(34,197,94,0.1))",
                border: "1px solid rgba(34,197,94,0.4)",
                color: "#4ade80",
              }}>
              <CheckCircle2 className="w-5 h-5" />
              این محصول را دارید
            </div>
          ) : (
            <button onClick={handleBuy}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-2.5 font-black text-base transition-all active:scale-[0.97]"
              style={discountInfo?.active && discountInfo.percent > 0 && product.price > 0
                ? { background: "linear-gradient(135deg,#dc2626,#b91c1c)", color: "#fff", boxShadow: "0 6px 28px rgba(220,38,38,0.45), 0 2px 8px rgba(0,0,0,0.4)" }
                : { background: `linear-gradient(135deg, ${meta.color}, ${meta.color}bb)`, color: "#08060a", boxShadow: `0 6px 28px ${meta.glow}, 0 2px 8px rgba(0,0,0,0.4)` }
              }>
              <ShoppingBag className="w-5 h-5" />
              {product.price === 0
                ? "دریافت رایگان"
                : discountInfo?.active && discountInfo.percent > 0
                  ? `ثبت سفارش — ${formatPrice(Math.round(product.price * (1 - discountInfo.percent / 100) / 1000) * 1000)} تومان`
                  : `ثبت سفارش — ${formatPrice(product.price)} تومان`
              }
            </button>
          )}
        </motion.div>
      </div>
    </div>
  );
}
