import { useState, useEffect } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { CachedImage } from "@/components/ui/cached-image";
import { formatPrice, toPersianDigits } from "@/lib/persian";
import { motion } from "framer-motion";
import { ShoppingBag, RefreshCw, AlertCircle, CheckCircle2, GraduationCap, PlayCircle, Flame } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useLocation, Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "@/lib/theme-context";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

interface ProductFile { url: string; name: string; size?: number; }
interface Product {
  id: number; title: string; description?: string | null;
  image?: string | null; price: number; isPublished: boolean;
  categoryId?: number | null; productType: string; files?: ProductFile[];
  metadata?: Record<string, unknown>;
}
interface Category { id: number; name: string; slug: string; sortOrder: number; products: Product[]; }
interface ProductsResponse { categories: Category[]; uncategorized: Product[]; }
interface Course {
  id: number; title: string; description?: string | null;
  image?: string | null; thumbnail?: string | null; price: number; isPublished: boolean;
}

// ── Category metadata ────────────────────────────────────────────────────────
const CATEGORY_META: Record<string, { color: string; bg: string; border: string; gradient: string; label: string }> = {
  "physical":       { label: "کالای فیزیکی",              color: "#f59e0b", bg: "rgba(245,158,11,0.13)", border: "rgba(245,158,11,0.35)", gradient: "linear-gradient(135deg,rgba(245,158,11,0.18),rgba(234,88,12,0.08))" },
  "ebook":          { label: "کتاب الکترونیکی",            color: "#60a5fa", bg: "rgba(96,165,250,0.13)", border: "rgba(96,165,250,0.35)", gradient: "linear-gradient(135deg,rgba(96,165,250,0.18),rgba(37,99,235,0.08))" },
  "printed-book":   { label: "کتاب چاپی",                 color: "#34d399", bg: "rgba(52,211,153,0.13)", border: "rgba(52,211,153,0.35)", gradient: "linear-gradient(135deg,rgba(52,211,153,0.18),rgba(5,150,105,0.08))" },
  "premium-tools":  { label: "ابزارهای پرمیوم",            color: "#a78bfa", bg: "rgba(167,139,250,0.13)", border: "rgba(167,139,250,0.35)", gradient: "linear-gradient(135deg,rgba(167,139,250,0.18),rgba(109,40,217,0.08))" },
  "seminar":        { label: "سمینار",                     color: "var(--gold-primary)", bg: "var(--gold-bg)", border: "var(--gold-border)", gradient: "linear-gradient(135deg,var(--gold-bg),rgba(194,65,12,0.08))" },
  "services":       { label: "خدمات",                     color: "#22d3ee", bg: "rgba(34,211,238,0.13)", border: "rgba(34,211,238,0.35)", gradient: "linear-gradient(135deg,rgba(34,211,238,0.18),rgba(8,145,178,0.08))" },
  "consulting":     { label: "مشاوره",                    color: "#f472b6", bg: "rgba(244,114,182,0.13)", border: "rgba(244,114,182,0.35)", gradient: "linear-gradient(135deg,rgba(244,114,182,0.18),rgba(219,39,119,0.08))" },
  "digital-files":  { label: "فایل‌های دیجیتال",           color: "#818cf8", bg: "rgba(129,140,248,0.13)", border: "rgba(129,140,248,0.35)", gradient: "linear-gradient(135deg,rgba(129,140,248,0.18),rgba(67,56,202,0.08))" },
  "vip-membership": { label: "عضویت VIP",                 color: "#fbbf24", bg: "rgba(251,191,36,0.15)", border: "rgba(251,191,36,0.4)",  gradient: "linear-gradient(135deg,rgba(251,191,36,0.2),rgba(217,119,6,0.1))" },
  "hypnotherapy":   { label: "هیپنوتراپی",                color: "#c084fc", bg: "rgba(192,132,252,0.13)", border: "rgba(192,132,252,0.35)", gradient: "linear-gradient(135deg,rgba(192,132,252,0.18),rgba(126,34,206,0.08))" },
  "coaching":       { label: "کوچینگ",                    color: "#f87171", bg: "rgba(248,113,113,0.13)", border: "rgba(248,113,113,0.35)", gradient: "linear-gradient(135deg,rgba(248,113,113,0.18),rgba(185,28,28,0.08))" },
};
const DEFAULT_META = { color: "#9ca3af", bg: "rgba(156,163,175,0.13)", border: "rgba(156,163,175,0.3)", gradient: "linear-gradient(135deg,rgba(156,163,175,0.13),transparent)" };
const getCatMeta = (slug?: string) => CATEGORY_META[slug ?? ""] ?? DEFAULT_META;

// ── Category SVG icon ─────────────────────────────────────────────────────────
function CategorySVGIcon({ slug, size = 18 }: { slug: string; size?: number }) {
  const w = "1.8";
  const icons: Record<string, React.ReactNode> = {
    "physical": <><path d="M21 10V8l-9-4.5L3 8v2l9 4.5 9-4.5z" strokeWidth={w}/><path d="M3 10l9 4.5L21 10" strokeWidth={w}/><path d="M12 14.5V20" strokeWidth={w}/><path d="M21 8v7M3 8v7" strokeWidth={w}/></>,
    "ebook": <><rect x="5" y="3" width="13" height="18" rx="2" strokeWidth={w}/><path d="M9 8h6M9 12h6M9 16h4" strokeWidth={w}/><circle cx="17" cy="17" r="1.3" fill="currentColor" stroke="none"/></>,
    "printed-book": <><path d="M12 6.5v13M12 6.5C10.8 5.5 9.3 5 7.5 5S4.2 5.5 3 6.5v13C4.2 18.5 5.7 18 7.5 18s3.3.5 4.5 1.5M12 6.5c1.2-1 2.7-1.5 4.5-1.5S19.8 5.5 21 6.5v13C19.8 18.5 18.3 18 16.5 18S13.2 18.5 12 19.5" strokeWidth={w}/></>,
    "premium-tools": <><path d="M6 3h12l4 6-10 12L2 9z" strokeWidth={w}/><path d="M2 9h20M12 3 8.5 9 12 21l3.5-12L12 3" strokeWidth={w}/></>,
    "seminar": <><rect x="9" y="2" width="6" height="11" rx="3" strokeWidth={w}/><path d="M5 10a7 7 0 0 0 14 0" strokeWidth={w}/><path d="M12 19v3M8 22h8" strokeWidth={w}/></>,
    "services": <><circle cx="12" cy="12" r="3" strokeWidth={w}/><path d="M12 2v2M12 20v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M2 12h2M20 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" strokeWidth={w}/></>,
    "consulting": <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeWidth={w}/><path d="M8 10h8M8 14h5" strokeWidth={w}/></>,
    "digital-files": <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" strokeWidth={w}/><polyline points="7 10 12 15 17 10" strokeWidth={w}/><line x1="12" y1="15" x2="12" y2="3" strokeWidth={w}/></>,
    "vip-membership": <><path d="M3 18h18M3 6l4.5 6.5L12 4l4.5 8.5L21 6v12H3V6z" strokeWidth={w}/></>,
    "hypnotherapy": <><path d="M12 2a8 8 0 1 0 0 16A8 8 0 0 0 12 2z" strokeWidth={w}/><path d="M12 6a4 4 0 1 0 0 8 4 4 0 0 0 0-8z" strokeWidth={w}/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><path d="M12 18v4M8 22h8" strokeWidth={w}/></>,
    "coaching": <><path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6M18 9h1.5a2.5 2.5 0 0 0 0-5H18M4 22h16M10 14.7V17a1 1 0 0 1-.6.9C7.9 18.8 7 20.2 7 22M14 14.7V17c0 .4.2.7.6.9C16.1 18.8 17 20.2 17 22M18 2H6v7a6 6 0 0 0 12 0V2z" strokeWidth={w}/></>,
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeLinecap="round" strokeLinejoin="round">
      {icons[slug] ?? <><circle cx="12" cy="12" r="9" strokeWidth={w}/><path d="M12 8v4M12 16h.01" strokeWidth={w}/></>}
    </svg>
  );
}

// ── MTP discount pricing ──────────────────────────────────────────────────────
type MtpVariant = { key: string; label: string; fullPrice: number; price: number };
type MtpDiscount = {
  active: boolean;
  percent: number;
  source: "first_login" | "recurring" | "global" | "none";
  endsAt: string | null;
  remainingSeconds: number;
};
type MtpPricing = { courseId: number | null; courseIds?: number[]; discount: MtpDiscount; variants: MtpVariant[] };

function useMtpPricing(token: string | null) {
  return useQuery<MtpPricing | null>({
    queryKey: ["mtp-pricing", token],
    enabled: !!token,
    queryFn: async () => {
      const r = await fetch(`${API}/api/mtp/pricing`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      return r.json();
    },
  });
}

// compact countdown for product tiles (presentational — seconds owned by parent)
function MiniCountdown({ seconds }: { seconds: number }) {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const fmt = (n: number) => toPersianDigits(String(n).padStart(2, "0"));
  const Chip = ({ v }: { v: number }) => (
    <span className="px-1 py-0.5 rounded-md text-[11px] font-black tabular-nums leading-none"
      style={{ background: "rgba(0,0,0,0.28)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.25)", color: "#ffffff" }}>
      {fmt(v)}
    </span>
  );
  const Colon = () => <span className="font-black text-[11px] leading-none" style={{ color: "rgba(255,255,255,0.9)" }}>:</span>;
  return (
    <motion.div
      animate={{ boxShadow: ["0 0 0 0 rgba(239,68,68,0.55)", "0 0 0 6px rgba(239,68,68,0)"] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: "easeOut" }}
      className="flex items-center justify-center gap-1 w-full px-1.5 py-1 rounded-lg dark-surface"
      style={{ background: "var(--gold-gradient)", border: "1px solid rgba(255,255,255,0.35)" }}>
      <motion.span animate={{ scale: [1, 1.25, 1] }} transition={{ duration: 1, repeat: Infinity }} className="shrink-0 flex">
        <Flame className="w-3.5 h-3.5" style={{ color: "#fff8e1" }} fill="#ffd24a" />
      </motion.span>
      <span className="flex items-center gap-0.5" dir="ltr">
        {d > 0 && <><Chip v={d} /><span className="text-[10px] font-black px-0.5" style={{ color: "rgba(255,255,255,0.9)" }}>روز</span></>}
        <Chip v={h} /><Colon /><Chip v={m} /><Colon /><Chip v={s} />
      </span>
    </motion.div>
  );
}

// ── Item discount type ────────────────────────────────────────────────────────
interface ActiveItemDiscount {
  active: boolean;
  percent: number;
  source: "first_login" | "recurring" | "global" | "none";
  endsAt: string | null;
  remainingSeconds: number;
}

function useItemDiscount(type: "course" | "product", id: number, token: string | null, owned: boolean) {
  return useQuery<ActiveItemDiscount | null>({
    queryKey: ["item-discount", type, id, token],
    enabled: !!token && !owned,
    staleTime: 30_000,
    queryFn: async () => {
      const r = await fetch(`${API}/api/discounts/${type}/${id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return null;
      const d: ActiveItemDiscount = await r.json();
      return d.active && d.percent > 0 ? d : null;
    },
  });
}

// ── Course card ───────────────────────────────────────────────────────────────
function CourseCard({ course, owned, pricing, token }: { course: Course; owned: boolean; pricing?: MtpPricing | null; token?: string | null }) {
  const { resolved: _crsTheme } = useTheme();
  const isLightTheme = _crsTheme === 'light';
  const mtpIds = pricing?.courseIds ?? (pricing?.courseId ? [pricing.courseId] : []);
  const mtp = !owned && pricing && mtpIds.includes(course.id) && pricing.discount.active ? pricing : null;

  const { data: itemDiscount } = useItemDiscount("course", course.id, token ?? null, owned);
  const activeDiscount = mtp ? null : (itemDiscount ?? null);

  const finiteWindow = !!mtp && mtp.discount.remainingSeconds > 0;
  const [seconds, setSeconds] = useState(mtp?.discount.remainingSeconds ?? activeDiscount?.remainingSeconds ?? 0);
  useEffect(() => {
    setSeconds(mtp?.discount.remainingSeconds ?? activeDiscount?.remainingSeconds ?? 0);
  }, [mtp?.discount.remainingSeconds, activeDiscount?.remainingSeconds]);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds <= 0]);

  const discountedPrice = (() => {
    if (mtp) {
      const exact = mtp.variants.find(v => v.fullPrice === course.price && v.price < v.fullPrice);
      if (exact) return exact.price;
      const cheapest = [...mtp.variants].filter(v => v.price < v.fullPrice).sort((a, b) => a.price - b.price)[0];
      return cheapest?.price ?? null;
    }
    if (activeDiscount) {
      return Math.round(course.price * (1 - activeDiscount.percent / 100) / 1000) * 1000;
    }
    return null;
  })();

  const discountPercent = mtp ? mtp.discount.percent : (activeDiscount?.percent ?? 0);
  const itemFinite = !!activeDiscount && activeDiscount.remainingSeconds > 0;
  const live = mtp ? (finiteWindow ? seconds > 0 : true) : (activeDiscount ? (itemFinite ? seconds > 0 : true) : false);
  const hasDiscount = live && discountedPrice != null;
  const showCountdown = live && (mtp ? finiteWindow : itemFinite);
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden flex flex-col h-full"
      style={{ background: "var(--card-glass-bg)", border: `1px solid ${hasDiscount ? "var(--gold-border)" : "var(--card-glass-border)"}`, boxShadow: hasDiscount ? "0 2px 20px rgba(232,184,0,0.18)" : "0 2px 16px rgba(0,0,0,.3)" }}>
      <Link href={`/courses/${course.id}`}>
        <div className="aspect-square w-full overflow-hidden relative" style={{ background: "var(--color-secondary)", color: "var(--color-muted-foreground)" }}>
          <CachedImage
            src={course.thumbnail ?? course.image}
            alt={course.title}
            className="w-full h-full object-cover"
            fallback={<div className="w-full h-full flex items-center justify-center"><GraduationCap className="w-10 h-10 opacity-20" style={{ color: "var(--gold-primary)" }} /></div>}
          />
          {showCountdown && (
            <div className="absolute bottom-1.5 inset-x-1.5">
              <MiniCountdown seconds={seconds} />
            </div>
          )}
        </div>
      </Link>
      <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5 flex-wrap">
        <span className="course-type-badge flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={isLightTheme
            ? { background: '#8a5200', color: '#ffffff', border: '1.5px solid #7a4800' }
            : { background: "var(--gold-bg)", color: "var(--gold-primary)", border: "1px solid var(--gold-border)" }}>
          <PlayCircle className="w-3 h-3" /> دوره آموزشی
        </span>
        {owned && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "#16a34a", color: "#fff", border: "1px solid #15803d" }}>
            <CheckCircle2 className="w-3 h-3" /> دارید
          </span>
        )}
        {!owned && hasDiscount && (
          <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
            className="discount-badge-pill flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
            style={{ background: "var(--gold-gradient)", color: "#fff", boxShadow: "0 2px 10px var(--gold-glow)" }}>
            {toPersianDigits(String(discountPercent))}٪ تخفیف
          </motion.span>
        )}
      </div>
      <div className="p-3 pt-1.5 flex flex-col gap-2 flex-1">
        <Link href={`/courses/${course.id}`}>
          <h3 className="text-sm font-bold leading-snug line-clamp-2" style={{ color: "var(--color-card-foreground)" }}>{course.title}</h3>
        </Link>
        <div className="mt-auto flex items-end justify-between gap-2">
          {owned ? (
            <Link href={`/courses/${course.id}`} className="w-full">
              <button className="w-full text-xs font-black rounded-xl px-3 py-2 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", border: "1px solid #15803d" }}>
                <PlayCircle className="w-3.5 h-3.5" /> ادامه آموزش
              </button>
            </Link>
          ) : (
            <>
              {hasDiscount ? (
                <div className="flex flex-col leading-snug gap-0.5">
                  <span className="text-sm font-bold line-through" style={{ color: "color-mix(in srgb, var(--color-foreground) 60%, transparent)" }}>{course.price.toLocaleString("fa-IR")}</span>
                  <span className="font-black text-sm" style={{ color: "var(--gold-primary)" }}>{formatPrice(discountedPrice!)}</span>
                </div>
              ) : (
                <span className="font-black text-sm" style={{ color: "var(--gold-primary)" }}>
                  {course.price === 0 ? "رایگان" : formatPrice(course.price)}
                </span>
              )}
              <Link href={`/courses/${course.id}`}><button className="shrink-0 text-xs font-bold rounded-xl px-3 py-1.5 transition-colors" style={isLightTheme ? { background: '#8a5200', color: '#ffffff', border: '1.5px solid #7a4800' } : { background: "var(--gold-bg)", color: "var(--gold-primary)", border: "1px solid var(--gold-border)" }}>ثبت‌نام</button></Link>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Product card ──────────────────────────────────────────────────────────────
function ProductCard({ product, owned, onBuy, catSlug, token }: { product: Product; owned: boolean; onBuy: () => void; catSlug?: string; token?: string | null }) {
  const meta = getCatMeta(catSlug);
  const { resolved: _prdTheme } = useTheme();
  const isLightTheme = _prdTheme === 'light';
  const { data: itemDiscount } = useItemDiscount("product", product.id, token ?? null, owned);

  const hasDiscount = !!itemDiscount && itemDiscount.active && itemDiscount.percent > 0 && product.price > 0;
  const discountedPrice = hasDiscount ? Math.round(product.price * (1 - itemDiscount!.percent / 100) / 1000) * 1000 : null;
  const hasCountdown = hasDiscount && itemDiscount!.remainingSeconds > 0;

  const [seconds, setSeconds] = useState(itemDiscount?.remainingSeconds ?? 0);
  useEffect(() => { setSeconds(itemDiscount?.remainingSeconds ?? 0); }, [itemDiscount?.remainingSeconds]);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds <= 0]);

  const showCountdown = hasCountdown && seconds > 0;
  const liveDiscount = hasDiscount && (hasCountdown ? seconds > 0 : true);

  const ownedCta = (() => {
    switch (catSlug) {
      case "hypnotherapy":
      case "digital-files":
      case "premium-tools":   return { label: "ادامه استفاده",  icon: <PlayCircle className="w-3.5 h-3.5" /> };
      case "ebook":           return { label: "مطالعه کتاب",    icon: <PlayCircle className="w-3.5 h-3.5" /> };
      case "printed-book":
      case "physical":        return { label: "مشاهده سفارش",  icon: <PlayCircle className="w-3.5 h-3.5" /> };
      case "consulting":      return { label: "رزرو جلسه",      icon: <PlayCircle className="w-3.5 h-3.5" /> };
      case "seminar":         return { label: "ورود به سمینار", icon: <PlayCircle className="w-3.5 h-3.5" /> };
      default:                return { label: "ورود به محصول",  icon: <PlayCircle className="w-3.5 h-3.5" /> };
    }
  })();

  const cardBorder = owned
    ? "1px solid rgba(34,197,94,0.35)"
    : liveDiscount ? "var(--gold-border)" : "var(--card-glass-border)";
  const cardShadow = owned
    ? "0 2px 16px rgba(34,197,94,0.12)"
    : liveDiscount ? "0 2px 20px rgba(232,184,0,0.18)" : "0 2px 16px rgba(0,0,0,.3)";

  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden flex flex-col h-full"
      style={{ background: owned ? "rgba(34,197,94,0.04)" : "var(--color-card)", border: cardBorder, boxShadow: cardShadow }}>
      <Link href={`/product/${product.id}`}>
        <div className="aspect-square w-full overflow-hidden relative" style={{ background: "var(--color-secondary)", color: "var(--color-muted-foreground)" }}>
          <CachedImage
            src={product.image}
            alt={product.title}
            className="w-full h-full object-cover"
            fallback={
              <div className="w-full h-full flex items-center justify-center" style={{ color: meta.color }}>
                <div className="opacity-20"><CategorySVGIcon slug={catSlug ?? ""} size={36} /></div>
              </div>
            }
          />
          {!owned && showCountdown && (
            <div className="absolute bottom-1.5 inset-x-1.5">
              <MiniCountdown seconds={seconds} />
            </div>
          )}
        </div>
      </Link>
      <div className="px-3 pt-2 pb-0.5 flex items-center gap-1.5 flex-wrap">
        {catSlug && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={isLightTheme
              ? { background: meta.color, color: '#ffffff', border: `1.5px solid ${meta.color}` }
              : { background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>
            <span className="inline-flex" style={{ color: isLightTheme ? '#ffffff' : meta.color }}><CategorySVGIcon slug={catSlug} size={10} /></span>
            {CATEGORY_META[catSlug]?.label ?? catSlug}
          </span>
        )}
        {owned && (
          <span className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: "#16a34a", color: "#fff", border: "1px solid #15803d" }}>
            <CheckCircle2 className="w-3 h-3" /> خریداری شده
          </span>
        )}
        {!owned && liveDiscount && (
          <motion.span animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 1.6, repeat: Infinity }}
            className="flex items-center gap-1 text-[10px] font-black px-2 py-0.5 rounded-full"
            style={{ background: "var(--gold-gradient)", color: "#fff", boxShadow: "0 2px 10px var(--gold-glow)" }}>
            {toPersianDigits(String(itemDiscount!.percent))}٪ تخفیف
          </motion.span>
        )}
      </div>
      <div className="p-3 pt-1.5 flex flex-col gap-2 flex-1">
        <Link href={`/product/${product.id}`}>
          <h3 className="text-sm font-bold leading-snug line-clamp-2" style={{ color: "var(--color-card-foreground)" }}>{product.title}</h3>
        </Link>
        <div className="mt-auto">
          {owned ? (
            <Link href={`/product/${product.id}`} className="w-full">
              <button className="w-full text-xs font-black rounded-xl px-3 py-2 flex items-center justify-center gap-1.5 transition-all active:scale-95"
                style={{ background: "linear-gradient(135deg,#16a34a,#15803d)", color: "#fff", border: "1px solid #15803d" }}>
                {ownedCta.icon} {ownedCta.label}
              </button>
            </Link>
          ) : (
            <div className="flex items-end justify-between gap-2">
              {liveDiscount && discountedPrice != null ? (
                <div className="flex flex-col leading-snug gap-0.5">
                  <span className="text-sm font-bold line-through" style={{ color: "color-mix(in srgb, var(--color-foreground) 60%, transparent)" }}>{product.price.toLocaleString("fa-IR")}</span>
                  <span className="font-black text-sm" style={{ color: "var(--gold-primary)" }}>{formatPrice(discountedPrice)}</span>
                </div>
              ) : (
                <span className="font-black text-sm" style={{ color: meta.color }}>
                  {product.price === 0 ? "رایگان" : formatPrice(product.price)}
                </span>
              )}
              <button onClick={onBuy} className="shrink-0 text-xs font-bold rounded-xl px-3 py-1.5 transition-all active:scale-95"
                style={liveDiscount
                  ? { background: "var(--gold-gradient)", color: "#fff", border: "none" }
                  : isLightTheme
                    ? { background: meta.color, color: '#ffffff', border: `1.5px solid ${meta.color}` }
                    : { background: meta.bg, color: meta.color, border: `1px solid ${meta.border}` }}>خرید</button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ── Horizontal scroll row ─────────────────────────────────────────────────────
function HScrollRow({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 overflow-x-auto pb-2 px-4"
      style={{ scrollbarWidth: "none", WebkitOverflowScrolling: "touch" }}>
      {children}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({
  icon, title, count, countBg, countColor, onViewAll
}: {
  icon: React.ReactNode; title: string; count: number;
  countBg: string; countColor: string; onViewAll?: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-3 px-4">
      <div className="flex items-center gap-2.5">
        {icon}
        <h2 className="text-[15px] font-black store-section-title" style={{ color: "var(--color-foreground)" }}>{title}</h2>
        <span className="text-[11px] px-2 py-0.5 rounded-full font-bold" style={{ background: countBg, color: countColor }}>{count}</span>
      </div>
      {onViewAll && (
        <button onClick={onViewAll}
          className="flex items-center gap-1 text-xs font-bold px-3 py-1.5 rounded-xl transition-all active:scale-95"
          style={{ background: countBg, color: countColor, border: `1px solid ${countColor}33` }}>
          مشاهده همه
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M15 18l-6-6 6-6"/></svg>
        </button>
      )}
    </div>
  );
}

// ── Category section ──────────────────────────────────────────────────────────
function CategorySection({ category, ownedIds, onBuy, onViewAll, expanded, token }: {
  category: Category; ownedIds: Set<number>;
  onBuy: (id: number) => void; onViewAll: () => void; expanded?: boolean; token?: string | null;
}) {
  if (category.products.length === 0) return null;
  const meta = getCatMeta(category.slug);
  return (
    <section className="mb-8">
      <SectionHeader
        icon={
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: meta.gradient, border: `1px solid ${meta.border}`, color: meta.color }}>
            <CategorySVGIcon slug={category.slug} size={16} />
          </div>
        }
        title={category.name}
        count={category.products.length}
        countBg={meta.bg}
        countColor={meta.color}
        onViewAll={expanded ? undefined : onViewAll}
      />
      {expanded ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {category.products.map(p => (
            <ProductCard key={p.id} product={p} owned={ownedIds.has(p.id)} onBuy={() => onBuy(p.id)} catSlug={category.slug} token={token} />
          ))}
        </div>
      ) : (
        <HScrollRow>
          {category.products.map(p => (
            <div key={p.id} style={{ minWidth: 160, maxWidth: 160 }}>
              <ProductCard product={p} owned={ownedIds.has(p.id)} onBuy={() => onBuy(p.id)} catSlug={category.slug} token={token} />
            </div>
          ))}
        </HScrollRow>
      )}
    </section>
  );
}

// ── Courses section ───────────────────────────────────────────────────────────
function CoursesSection({ courses, ownedIds, onViewAll, expanded, pricing, token }: {
  courses: Course[]; ownedIds: Set<number>; onViewAll: () => void; expanded?: boolean; pricing?: MtpPricing | null; token?: string | null;
}) {
  if (courses.length === 0) return null;
  return (
    <section className="mb-8">
      <SectionHeader
        icon={
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: "var(--gold-bg)", border: "1px solid var(--gold-border)", color: "var(--gold-primary)" }}>
            <GraduationCap className="w-4 h-4" />
          </div>
        }
        title="دوره‌های آموزشی"
        count={courses.length}
        countBg="var(--gold-bg)"
        countColor="var(--gold-primary)"
        onViewAll={expanded ? undefined : onViewAll}
      />
      {expanded ? (
        <div className="px-4 grid grid-cols-2 gap-3">
          {courses.map(c => <CourseCard key={c.id} course={c} owned={ownedIds.has(c.id)} pricing={pricing} token={token} />)}
        </div>
      ) : (
        <HScrollRow>
          {courses.map(c => (
            <div key={c.id} style={{ minWidth: 160, maxWidth: 160 }}>
              <CourseCard course={c} owned={ownedIds.has(c.id)} pricing={pricing} token={token} />
            </div>
          ))}
        </HScrollRow>
      )}
    </section>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function Products() {
  const { token } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<number | "all" | "courses" | "uncategorized">("all");
  const { resolved: themeResolved } = useTheme();
  const isLightTheme = themeResolved === "light";

  const STALE = 5 * 60 * 1000;

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery<ProductsResponse>({
    queryKey: ["products-grouped"],
    staleTime: STALE,
    queryFn: async () => {
      const r = await fetch(`${API}/api/products`);
      if (!r.ok) throw new Error("خطا در بارگذاری");
      return r.json();
    },
  });

  const { data: userProducts } = useQuery<Product[]>({
    queryKey: ["user-products"], enabled: !!token,
    staleTime: STALE,
    queryFn: async () => {
      const r = await fetch(`${API}/api/user/products`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: courses, isLoading: coursesLoading } = useQuery<Course[]>({
    queryKey: ["public-courses"],
    staleTime: STALE,
    queryFn: async () => {
      const r = await fetch(`${API}/api/courses`);
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: userCourses } = useQuery<Course[]>({
    queryKey: ["user-courses"], enabled: !!token,
    staleTime: STALE,
    queryFn: async () => {
      const r = await fetch(`${API}/api/user/courses`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) return [];
      return r.json();
    },
  });

  const { data: mtpPricing } = useMtpPricing(token ?? null);

  const ownedProductIds = new Set((userProducts ?? []).map(p => p.id));
  const ownedCourseIds = new Set((userCourses ?? []).map(c => c.id));

  const handleBuy = (productId: number) => {
    if (!token) { navigate("/profile"); return; }
    navigate(`/order-summary?type=product&id=${productId}`);
  };

  const categories = (data?.categories ?? []).filter(c => c.products.length > 0);
  const uncategorized = data?.uncategorized ?? [];
  const allCourses = courses ?? [];
  const hasCourses = allCourses.length > 0;

  const tabs = [
    { id: "all" as const, label: "همه", count: categories.reduce((s, c) => s + c.products.length, 0) + uncategorized.length + allCourses.length, slug: undefined as string | undefined },
    ...(hasCourses ? [{ id: "courses" as const, label: "دوره‌ها", count: allCourses.length, slug: undefined }] : []),
    ...categories.map(c => ({ id: c.id as number, label: c.name, count: c.products.length, slug: c.slug })),
    ...(uncategorized.length > 0 ? [{ id: "uncategorized" as const, label: "سایر", count: uncategorized.length, slug: undefined }] : []),
  ];

  const showCourses = activeTab === "all" || activeTab === "courses";
  const visibleCategories = activeTab === "all" ? categories : activeTab === "courses" || activeTab === "uncategorized" ? [] : categories.filter(c => c.id === activeTab);
  const visibleUncategorized = activeTab === "all" || activeTab === "uncategorized" ? uncategorized : [];

  return (
    <div className="pb-6" dir="rtl" style={{ minHeight: "100%", background: "var(--app-body-bg)" }}>

      {/* ── Header ── */}
      <div className="px-4 pt-6 pb-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-black flex items-center gap-2" style={{ color: "var(--color-foreground)" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "var(--gold-bg)", border: "1px solid var(--gold-border)" }}>
                <ShoppingBag className="w-4 h-4" style={{ color: "var(--gold-primary)" }} />
              </div>
              فروشگاه
            </h1>
            <p className="text-xs mt-0.5" style={{ color: "var(--color-muted-foreground)" }}>محصولات آموزشی آکادمی شیوافر</p>
          </div>
          <button onClick={() => refetch()} disabled={isFetching} className="p-2 rounded-xl transition-colors" style={{ color: "var(--color-muted-foreground)", background: "var(--color-secondary)", border: "1px solid var(--color-border)" }}>
            <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Category tabs — only after products data is ready ── */}
      {!isLoading && tabs.length > 1 && (
        <div className="flex gap-2 pb-4 px-4 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {tabs.map(tab => {
            const active = activeTab === tab.id;
            const meta = tab.slug ? getCatMeta(tab.slug) : null;
            // Light: 'همه' (all) gets neutral dark so it's visually distinct from gold 'دوره‌ها'
            const chipColor = meta ? meta.color
              : (isLightTheme && tab.id === 'all') ? '#374151'
              : 'var(--gold-primary)';
            // Light theme: filled chips using the category's brand color as a
            // solid background with white text, for both active and inactive
            // states, instead of the low-opacity outline look. Dark theme is
            // untouched.
            const style = isLightTheme
              ? (active
                  ? { background: chipColor, color: "#ffffff", border: `1.5px solid ${chipColor}` }
                  : { background: chipColor, color: "#ffffff", opacity: 0.82, border: `1px solid ${chipColor}` })
              : (active
                  ? { background: meta ? meta.gradient : "var(--gold-bg)", color: chipColor, border: `1.5px solid ${meta ? meta.border : "var(--gold-border)"}` }
                  : { background: "var(--color-secondary)", color: "var(--color-muted-foreground)", border: "1px solid var(--color-border)" });
            return (
              <button key={String(tab.id)} onClick={() => setActiveTab(tab.id)}
                className="shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold transition-all"
                style={style}>
                {tab.slug && (
                  <span style={{ color: isLightTheme ? "#ffffff" : (active ? getCatMeta(tab.slug).color : "var(--color-muted-foreground)") }}>
                    <CategorySVGIcon slug={tab.slug} size={12} />
                  </span>
                )}
                {!tab.slug && tab.id === "courses" && <GraduationCap className="w-3 h-3" />}
                {tab.label}
                <span className="text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: isLightTheme ? "rgba(255,255,255,0.28)" : (active ? "rgba(255,255,255,0.2)" : "var(--tag-inactive-bg)"), color: "inherit" }}>{tab.count}</span>
              </button>
            );
          })}
        </div>
      )}

      <div>
        {isLoading ? (
          <div className="space-y-6 px-4">
            {[1, 2, 3].map(s => (
              <div key={s}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2"><Skeleton className="w-8 h-8 rounded-xl" /><Skeleton className="w-28 h-4 rounded" /></div>
                  <Skeleton className="w-20 h-7 rounded-xl" />
                </div>
                <div className="flex gap-3 overflow-hidden">
                  {[1,2,3].map(i => <Skeleton key={i} className="rounded-2xl shrink-0" style={{ width:160, height:200, background:"var(--skeleton-bg)" }} />)}
                </div>
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4 px-4">
            <AlertCircle className="w-12 h-12 opacity-40" style={{ color: "#f87171" }} />
            <p className="text-sm" style={{ color: "#f87171" }}>{(error as { message?: string })?.message ?? "خطای ناشناخته"}</p>
            <button className="text-xs px-4 py-2 rounded-xl font-bold" style={{ background: "var(--icon-btn-bg)", color: "var(--color-muted-foreground)" }} onClick={() => refetch()}>
              <RefreshCw className="w-3 h-3 inline-block ml-1" />تلاش مجدد
            </button>
          </div>
        ) : (
          <>
            {showCourses && (coursesLoading ? (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-3 px-4">
                  <div className="flex items-center gap-2"><Skeleton className="w-8 h-8 rounded-xl" /><Skeleton className="w-28 h-4 rounded" /></div>
                  <Skeleton className="w-20 h-7 rounded-xl" />
                </div>
                <div className="flex gap-3 px-4 overflow-hidden">
                  {[1,2,3].map(i => <Skeleton key={i} className="rounded-2xl shrink-0" style={{ width:160, height:200, background:"var(--skeleton-bg)" }} />)}
                </div>
              </div>
            ) : hasCourses ? (
              <CoursesSection courses={allCourses} ownedIds={ownedCourseIds} onViewAll={() => setActiveTab("courses")} expanded={activeTab === "courses"} pricing={mtpPricing} token={token} />
            ) : null)}
            {visibleCategories.map(cat => (
              <CategorySection key={cat.id} category={cat} ownedIds={ownedProductIds} onBuy={handleBuy} onViewAll={() => setActiveTab(cat.id)} expanded={activeTab === cat.id} token={token} />
            ))}
            {visibleUncategorized.length > 0 && (
              <section className="mb-8">
                <SectionHeader
                  icon={<div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: DEFAULT_META.bg, border: `1px solid ${DEFAULT_META.border}` }}><ShoppingBag className="w-4 h-4" style={{ color: DEFAULT_META.color }} /></div>}
                  title="سایر محصولات"
                  count={visibleUncategorized.length}
                  countBg={DEFAULT_META.bg}
                  countColor={DEFAULT_META.color}
                />
                <HScrollRow>
                  {visibleUncategorized.map(p => (
                    <div key={p.id} style={{ minWidth: 160, maxWidth: 160 }}>
                      <ProductCard product={p} owned={ownedProductIds.has(p.id)} onBuy={() => handleBuy(p.id)} token={token} />
                    </div>
                  ))}
                </HScrollRow>
              </section>
            )}
            {!hasCourses && categories.length === 0 && uncategorized.length === 0 && (
              <div className="flex flex-col items-center justify-center py-24 gap-4 px-4">
                <ShoppingBag className="w-16 h-16 opacity-10" style={{ color: "var(--gold-primary)" }} />
                <p className="text-sm" style={{ color: "var(--color-muted-foreground)" }}>هیچ محصولی موجود نیست</p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
