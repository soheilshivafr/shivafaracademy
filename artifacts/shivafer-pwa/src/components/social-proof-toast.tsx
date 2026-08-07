import { useState, useEffect, useRef, useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { useGetUserCourses, useGetUserProducts } from "@workspace/api-client-react";
import { motion, AnimatePresence, useMotionValue, useTransform } from "framer-motion";
import { X, ShoppingBag } from "lucide-react";
import { Link } from "wouter";
import { getAudioCtx } from "@/lib/audio-unlock";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

interface ShopItem {
  id: number;
  title: string;
  image?: string | null;
  thumbnail?: string | null;
  type: "course" | "product";
  href: string;
}

interface SpTiming {
  firstDelayMin: number; // seconds
  firstDelayMax: number;
  intervalMin: number;
  intervalMax: number;
}

const DEFAULT_TIMING: SpTiming = {
  firstDelayMin: 90,
  firstDelayMax: 180,
  intervalMin: 60,
  intervalMax: 600,
};

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const PERSIAN_DIGITS = ["۱","۲","۳","۴","۵","۶","۷","۸","۹"];

// ── صدای اعلان فروش — همان pattern چیم پیش‌گیرانه، صدای متفاوت ──────────
// سه نت صعودی با oscillator نوع triangle (رنگ فلزی/سکه) — G5, C6, E6
function playSocialProofSound() {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.20, now + 0.015);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.75);
    master.connect(ctx.destination);

    // G5 → C6 → E6 — حس سکه/فروش، متفاوت از دینگ-دینگ چت‌بات
    const notes = [
      { freq: 783.99, start: 0,    dur: 0.14 }, // G5
      { freq: 1046.5, start: 0.11, dur: 0.14 }, // C6
      { freq: 1318.5, start: 0.23, dur: 0.32 }, // E6 — بلندتر و طولانی‌تر
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g   = ctx.createGain();
      osc.type = "triangle"; // رنگ فلزی‌تر از sine
      osc.frequency.setValueAtTime(n.freq, now + n.start);
      g.gain.setValueAtTime(0.0001, now + n.start);
      g.gain.exponentialRampToValueAtTime(1, now + n.start + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.start + n.dur);
      osc.connect(g);
      g.connect(master);
      osc.start(now + n.start);
      osc.stop(now + n.start + n.dur + 0.05);
    }
  } catch { /* صداهای خودکار ممکن است توسط مرورگر مسدود شوند */ }
}

export function SocialProofToast() {
  const { token } = useAuth();
  const { data: userCourses } = useGetUserCourses();
  const { data: userProducts } = useGetUserProducts();

  const [allItems, setAllItems] = useState<ShopItem[]>([]);
  const [visible, setVisible] = useState<ShopItem | null>(null);
  const [count, setCount] = useState(1);
  const [timing, setTiming] = useState<SpTiming>(DEFAULT_TIMING);

  const indexRef = useRef(0);
  const autoCloseRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRef  = useRef<ReturnType<typeof setTimeout> | null>(null);

  // بار اول: fetch تنظیمات بازه زمانی از API
  useEffect(() => {
    fetch(`${API}/api/settings`)
      .then(r => r.ok ? r.json() : null)
      .then((d: Record<string, string | null> | null) => {
        if (!d) return;
        const parse = (key: string, fallback: number) => {
          const v = parseInt(d[key] ?? "");
          return isNaN(v) || v <= 0 ? fallback : v;
        };
        setTiming({
          firstDelayMin: parse("sp_first_delay_min", DEFAULT_TIMING.firstDelayMin),
          firstDelayMax: parse("sp_first_delay_max", DEFAULT_TIMING.firstDelayMax),
          intervalMin:   parse("sp_interval_min",    DEFAULT_TIMING.intervalMin),
          intervalMax:   parse("sp_interval_max",    DEFAULT_TIMING.intervalMax),
        });
      })
      .catch(() => {});
  }, []);

  // Fetch all courses + products once
  // FIX مورد ۳: /api/products یک object {categories, uncategorized} برمیگردونه، نه array
  useEffect(() => {
    if (!token) return;
    Promise.all([
      fetch(`${API}/api/courses`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API}/api/products`).then(r => r.ok ? r.json() : {}).catch(() => ({})),
    ]).then(([courses, rawProducts]) => {
      const c: ShopItem[] = (Array.isArray(courses) ? courses : []).map((x: any) => ({
        id: x.id, title: x.title, image: x.thumbnail ?? x.image,
        type: "course", href: `/courses/${x.id}`,
      }));
      // استخراج products از ساختار {categories:[{products:[]}], uncategorized:[]}
      const productsPayload = rawProducts as {
        categories?: Array<{ products?: any[] }>;
        uncategorized?: any[];
      };
      const productList: any[] = Array.isArray(rawProducts)
        ? rawProducts
        : [
            ...(productsPayload.categories ?? []).flatMap(cat => cat.products ?? []),
            ...(productsPayload.uncategorized ?? []),
          ];
      const p: ShopItem[] = productList.map((x: any) => ({
        id: x.id, title: x.title, image: x.image,
        type: "product", href: `/product/${x.id}`,
      }));
      const combined = [...c, ...p].sort(() => Math.random() - 0.5);
      setAllItems(combined);
    });
  }, [token]);

  // نمایش آیتم بعدی — فقط auto-close timer رو ست می‌کنه
  const showNext = useCallback(() => {
    if (allItems.length === 0) return;

    const ownedCourseIds  = new Set((userCourses  ?? []).map((c: any) => c.id));
    const ownedProductIds = new Set((userProducts ?? []).map((p: any) => p.id));

    const unowned = allItems.filter(item =>
      item.type === "course" ? !ownedCourseIds.has(item.id) : !ownedProductIds.has(item.id)
    );
    if (unowned.length === 0) return;

    const item = unowned[indexRef.current % unowned.length];
    indexRef.current++;
    setCount(randInt(1, 9));
    setVisible(item);
    playSocialProofSound(); // مورد ۲: صدای اعلان فروش

    // auto-close بعد از ۱۵ ثانیه — مورد ۱: تایم افزایش یافت از ۸ به ۱۵ ثانیه
    if (autoCloseRef.current) clearTimeout(autoCloseRef.current);
    autoCloseRef.current = setTimeout(() => setVisible(null), 15000);
  }, [allItems, userCourses, userProducts]);

  // ─── FIX: نگه داشتن آخرین نسخه showNext در یک ref ───────────────────────
  // این باعث می‌شه scheduleNext به showNext وابسته نباشه و تایمر ریست نشه
  const showNextRef = useRef(showNext);
  useEffect(() => {
    showNextRef.current = showNext;
  }, [showNext]);
  // ─────────────────────────────────────────────────────────────────────────

  // برنامه‌ریزی نمایش بعدی — حالا پایدار است (deps خالی)
  // از showNextRef استفاده می‌کند نه showNext مستقیم
  const scheduleNext = useCallback((t: SpTiming) => {
    if (scheduleRef.current) clearTimeout(scheduleRef.current);
    const delayMs = randInt(t.intervalMin, t.intervalMax) * 1000;
    scheduleRef.current = setTimeout(() => {
      showNextRef.current();
      scheduleNext(t);
    }, delayMs);
  }, []); // عمداً deps خالی — از ref استفاده می‌کند تا تایمر ریست نشود

  // راه‌اندازی چرخه — فقط وقتی token، allItems یا timing تغییر کنند
  // (نه userCourses/userProducts که باعث ریست ناخواسته می‌شدند)
  useEffect(() => {
    if (!token || allItems.length === 0) return;

    const firstDelayMs = randInt(timing.firstDelayMin, timing.firstDelayMax) * 1000;

    const firstTimer = setTimeout(() => {
      showNextRef.current();
      scheduleNext(timing);
    }, firstDelayMs);

    return () => {
      clearTimeout(firstTimer);
      if (autoCloseRef.current)  clearTimeout(autoCloseRef.current);
      if (scheduleRef.current)   clearTimeout(scheduleRef.current);
    };
  }, [token, allItems, timing, scheduleNext]);

  // dismiss: فقط auto-close رو کنسل می‌کنه — چرخه برنامه‌ریزی ادامه دارد
  const dismiss = useCallback(() => {
    if (autoCloseRef.current) {
      clearTimeout(autoCloseRef.current);
      autoCloseRef.current = null;
    }
    setVisible(null);
  }, []);

  if (!token) return null;

  return (
    <AnimatePresence>
      {visible && (
        <SocialProofCard
          item={visible}
          count={count}
          onDismiss={dismiss}
        />
      )}
    </AnimatePresence>
  );
}

function SocialProofCard({ item, count, onDismiss }: {
  item: ShopItem; count: number; onDismiss: () => void;
}) {
  const y = useMotionValue(0);
  const opacity = useTransform(y, [-80, 0], [0, 1]);

  const persianCount = PERSIAN_DIGITS[count - 1] ?? "۱";
  const typeLabel = item.type === "course" ? "دوره" : "محصول";

  return (
    <motion.div
      key={item.id}
      drag="y"
      dragConstraints={{ top: -200, bottom: 10 }}
      dragElastic={0.3}
      onDragEnd={(_, info) => { if (info.offset.y < -40) onDismiss(); }}
      initial={{ opacity: 0, y: 80 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 80, transition: { duration: 0.25 } }}
      transition={{ type: "spring", stiffness: 260, damping: 22 }}
      className="fixed z-50 select-none"
      dir="rtl"
      aria-live="polite"
      aria-label={`social proof: ${item.title}`}
      style={{
        bottom: 90,
        right: 16,
        left: 16,
        maxWidth: 340,
        margin: "0 auto",
        y,
        opacity,
        touchAction: "none",
      } as any}
    >
      {/* Card */}
      <div
        style={{
          background: "linear-gradient(135deg, #1a0e00 0%, #2a1500 60%, #1a0e00 100%)",
          borderRadius: 20,
          padding: "14px 15px 12px",
          border: "1px solid rgba(232,184,0,0.22)",
          boxShadow: "0 8px 40px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.04)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Glow */}
        <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: "radial-gradient(circle, rgba(232,184,0,0.10) 0%, transparent 70%)", pointerEvents: "none" }} />

        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {/* Pulse dot */}
            <div style={{ position: "relative", width: 10, height: 10 }}>
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e", animation: "sp-pulse 1.5s ease-out infinite" }} />
              <div style={{ position: "absolute", inset: 0, borderRadius: "50%", background: "#22c55e" }} />
            </div>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", letterSpacing: 0.3 }}>فروش اخیر</span>
          </div>
          <button
            onClick={onDismiss}
            aria-label="بستن"
            style={{ background: "rgba(255,255,255,0.06)", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.35)", width: 24, height: 24, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}
          >
            <X size={13} />
          </button>
        </div>

        {/* Body */}
        <div style={{ display: "flex", alignItems: "center", gap: 11, marginBottom: 12 }}>
          {/* Thumbnail */}
          <div style={{ width: 52, height: 52, borderRadius: 14, overflow: "hidden", flexShrink: 0, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(232,184,0,0.18)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {item.image ? (
              <img src={item.image} alt={item.title} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <ShoppingBag size={22} style={{ color: "rgba(232,184,0,0.5)" }} />
            )}
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.65)", lineHeight: 1.6, marginBottom: 3 }}>
              در لحظات اخیر{" "}
              <span style={{ color: "#e8b800", fontWeight: 800, fontSize: 13 }}>{persianCount} نفر</span>{" "}
              از کاربران آکادمی
            </p>
            <p style={{ margin: 0, fontSize: 12.5, color: "#fff", fontWeight: 700, lineHeight: 1.4, marginBottom: 2 }} className="line-clamp-1">
              «{item.title}»
            </p>
            <p style={{ margin: 0, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              را خریداری کردند
            </p>
          </div>
        </div>

        {/* CTA */}
        <Link href={item.href} onClick={onDismiss}>
          <div
            style={{
              marginTop: 12,
              background: "linear-gradient(135deg, #e8b800 0%, #a87c10 100%)",
              borderRadius: 12,
              padding: "9px 16px",
              textAlign: "center",
              cursor: "pointer",
              boxShadow: "0 4px 16px rgba(232,184,0,0.35)",
            }}
          >
            <span style={{ color: "#0a0600", fontSize: 13, fontWeight: 800 }}>
              مشاهده {typeLabel} ←
            </span>
          </div>
        </Link>
      </div>

      {/* Swipe hint */}
      <div style={{ textAlign: "center", marginTop: 6 }}>
        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.25)" }}>برای بستن، به بالا بکشید</span>
      </div>

      <style>{`
        @keyframes sp-pulse {
          0% { transform: scale(1); opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0; }
        }
      `}</style>
    </motion.div>
  );
}
