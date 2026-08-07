import { staticAssetUrl } from "@/lib/static-assets";
import { useAuth } from "@/lib/auth";
import { useFloatOffset } from "@/lib/float-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGetUserCourses, useGetUserProducts, useUpdateProfile, User } from "@workspace/api-client-react";
import { useState, useEffect, useRef } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { toast } from "sonner";
import { LogOut, User as UserIcon, Edit2, Book, Box, ShieldCheck, Lock, Eye, EyeOff, ChevronDown, ChevronUp, LayoutDashboard, Crown, Wallet, ShoppingBag, Wrench, Clock, CheckCircle2, XCircle, Upload, Receipt, Loader2, X, WifiOff, Trash2, Phone, Mic, MessageCircle, Bot } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { formatPrice } from "@/lib/persian";
import { Link, useLocation } from "wouter";
import { useTheme } from "@/lib/theme-context";
import { getMediaCacheInfo, clearAllMediaCache, removeMediaCacheItem, type MediaCacheItem } from "@/hooks/use-media-cache";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function useIsAdmin(token: string | null) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [meUser, setMeUser] = useState<any>(() => {
    if (!token) return null;
    const payload = decodeJwtPayload(token);
    if (!payload) return null;
    return { id: payload.userId, phone: payload.phone, name: payload.name ?? null, avatar: payload.avatar ?? null, createdAt: payload.iat ? new Date((payload.iat as number) * 1000).toISOString() : "" };
  });
  const [tribeInfo, setTribeInfo] = useState<{ isMember: boolean; tribeName?: string; isChief: boolean } | null>(null);

  useEffect(() => {
    if (!token) return;
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d && d.id) {
          setIsAdmin(!!d.isAdmin);
          setMeUser(d);
        }
      })
      .catch(() => {});

    // Fetch tribe membership info for badge
    Promise.all([
      fetch(`${API}/api/tribe/me`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
      fetch(`${API}/api/tribe/my-membership`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null),
    ]).then(([myTribe, myMembership]) => {
      if (myTribe && myTribe.id) {
        setTribeInfo({ isChief: true, isMember: false, tribeName: myTribe.name });
      } else if (myMembership && myMembership.tribe) {
        setTribeInfo({ isChief: false, isMember: true, tribeName: myMembership.tribe?.name });
      } else {
        setTribeInfo({ isChief: false, isMember: false });
      }
    }).catch(() => {});
  }, [token]);

  return { isAdmin, meUser, tribeInfo };
}


// ─── Guest: Smart tools with Sara locked ────────────────────────────────
function GuestSmartToolsSection({ onRequireAuth }: { onRequireAuth: () => void }) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const tools = [
    {
      icon: staticAssetUrl.asset("icons/tool-sara.webp"),
      title: "تماس با سارا",
      subtitle: "مشاوره صوتی – شروع تماس",
      btnLabel: "نیاز به ثبت‌نام",
      href: null as string | null,
      locked: true,
      glow:   isDark ? "rgba(212,160,23,0.30)" : "rgba(212,160,23,0.18)",
      blob:   isDark ? "rgba(212,160,23,0.35)" : "rgba(212,160,23,0.22)",
      border: isDark ? "rgba(212,160,23,0.45)" : "rgba(212,160,23,0.32)",
      bg:     isDark ? "rgba(20,14,2,0.80)"    : "rgba(255,250,232,0.95)",
      btn:    "#999",
    },
    {
      icon: staticAssetUrl.asset("icons/tool-assistant.webp"),
      title: "دستیار هوشمند",
      subtitle: "مدیریت کارها، یادآوری و چت",
      btnLabel: "شروع گفتگو",
      href: "/assistant" as string | null,
      locked: false,
      glow:   isDark ? "rgba(109,40,217,0.32)" : "rgba(109,40,217,0.14)",
      blob:   isDark ? "rgba(109,40,217,0.38)" : "rgba(139,92,246,0.20)",
      border: isDark ? "rgba(139,92,246,0.45)" : "rgba(139,92,246,0.30)",
      bg:     isDark ? "rgba(10,4,22,0.82)"    : "rgba(245,240,255,0.95)",
      btn:    isDark ? "#7c3aed" : "#6d28d9",
    },
    {
      icon: staticAssetUrl.asset("icons/tool-finance.webp"),
      title: "مدیریت درآمد و هزینه",
      subtitle: "ابزار مالی هوشمند",
      btnLabel: "ورود به ابزار",
      href: "/tools/income-expense" as string | null,
      locked: false,
      glow:   isDark ? "rgba(34,197,94,0.25)"  : "rgba(34,197,94,0.14)",
      blob:   isDark ? "rgba(34,197,94,0.32)"  : "rgba(34,197,94,0.20)",
      border: isDark ? "rgba(34,197,94,0.42)"  : "rgba(34,197,94,0.28)",
      bg:     isDark ? "rgba(2,14,6,0.82)"     : "rgba(236,253,245,0.95)",
      btn:    isDark ? "#16a34a" : "#15803d",
    },
  ];

  return (
    <div className="mt-4" dir="rtl">
      <div className="flex items-center justify-start gap-2 mb-3">
        <span className="text-primary text-base">✦</span>
        <h2 className="text-sm font-black text-foreground">ابزارهای هوشمند</h2>
      </div>
      <div className="grid gap-2 grid-cols-3">
        {tools.map((tool) => {
          const inner = (
            <div
              className={`relative flex flex-col items-center rounded-2xl px-1.5 pt-3 pb-2.5 gap-1.5 transition-transform duration-150 overflow-hidden h-full ${tool.locked ? "cursor-pointer" : "active:scale-[0.97] cursor-pointer"}`}
              style={{ background: tool.bg, border: `1px solid ${tool.border}`, boxShadow: `0 4px 20px ${tool.glow}`, backdropFilter: "blur(12px)" }}
              onClick={tool.locked ? onRequireAuth : undefined}
            >
              {tool.locked && (
                <div className="absolute top-1.5 left-1.5 z-20 w-5 h-5 rounded-full bg-black/40 flex items-center justify-center">
                  <Lock className="w-3 h-3 text-white" />
                </div>
              )}
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full blur-2xl pointer-events-none" style={{ background: tool.blob, opacity: 0.7 }} />
              <div className="relative w-14 h-14 rounded-xl overflow-hidden shrink-0 shadow-lg z-10">
                <img src={tool.icon} alt={tool.title} width={56} height={56} className={`w-full h-full object-cover ${tool.locked ? "grayscale opacity-70" : ""}`} loading="eager" decoding="async" />
              </div>
              <div className="text-center flex-1 min-w-0 w-full z-10">
                <p className="text-[10px] font-black leading-snug text-foreground line-clamp-2">{tool.title}</p>
                <p className="text-[8px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{tool.subtitle}</p>
              </div>
              <button
                className="relative z-10 w-full rounded-lg py-1 text-[9px] font-black text-white transition-opacity shadow-sm flex items-center justify-center gap-1"
                style={{ background: tool.btn, color: '#fff', WebkitTextFillColor: '#fff' }}
                tabIndex={-1}
              >
                {tool.locked && <Lock className="w-2 h-2" />}
                {tool.btnLabel}
              </button>
            </div>
          );
          return tool.locked
            ? <div key={tool.title} className="min-w-0">{inner}</div>
            : <Link key={tool.title} href={tool.href!} className="min-w-0 block">{inner}</Link>;
        })}
      </div>
    </div>
  );
}

// ─── Guest: Public offers (no auth needed) ──────────────────────────────
function SpecialOffersPublic() {
  const API_URL = import.meta.env.VITE_API_BASE_URL ?? "";
  const [offers, setOffers] = useState<Array<{ id: number; title: string; image?: string | null; type: "course" | "product"; href: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch(`${API_URL}/api/courses`).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/products`).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([rawCourses, rawProducts]) => {
      const c = toArray(rawCourses).map((x: any) => ({ id: x.id, title: x.title, image: x.thumbnail ?? x.image, type: "course" as const, href: `/courses/${x.id}` }));
      const flatProducts: any[] = [
        ...(rawProducts?.uncategorized ?? []),
        ...(rawProducts?.categories ?? []).flatMap((cat: any) => cat.products ?? []),
      ];
      const p = flatProducts.map((x: any) => ({ id: x.id, title: x.title, image: x.image, type: "product" as const, href: `/product/${x.id}` }));
      setOffers(shuffleArray([...c, ...p]));
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="h-36 bg-card rounded-xl animate-pulse" />;
  if (offers.length === 0) return null;

  return (
    <div dir="rtl">
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ flexShrink: 0 }}>
          <circle cx="11" cy="11" r="9.5" stroke="#e8b800" strokeWidth="1" strokeDasharray="2.5 2" opacity="0.45"/>
          <circle cx="11" cy="11" r="7" fill="#e8b800" fillOpacity="0.12"/>
          <path d="M11 4.5 L12.1 9.9 L17.5 11 L12.1 12.1 L11 17.5 L9.9 12.1 L4.5 11 L9.9 9.9 Z" fill="#e8b800"/>
          <path d="M17 5 L17.4 6.2 L18.6 6.6 L17.4 7 L17 8.2 L16.6 7 L15.4 6.6 L16.6 6.2 Z" fill="#e8b800" opacity="0.7"/>
          <path d="M5 14.5 L5.3 15.4 L6.2 15.7 L5.3 16 L5 16.9 L4.7 16 L3.8 15.7 L4.7 15.4 Z" fill="#e8b800" opacity="0.5"/>
        </svg>
        پیشنهاد ویژه برای شما
      </h3>
      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6, scrollSnapType: "x mandatory", msOverflowStyle: "none", scrollbarWidth: "none" }} className="hide-scrollbar">
        {offers.map(item => (
          <Link key={`${item.type}-${item.id}`} href={item.href} style={{ scrollSnapAlign: "start", flexShrink: 0, width: 160 }}>
            <div className="rounded-2xl overflow-hidden active:scale-[0.97] transition-transform flex flex-col" style={{ width: 160, height: 260, background: "var(--card)", border: "1px solid rgba(232,184,0,0.22)", boxShadow: "0 4px 16px rgba(232,184,0,0.08)" }}>
              <div className="bg-muted relative shrink-0" style={{ width: 160, height: 160 }}>
                {item.image
                  ? <img src={item.image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-8 h-8 text-muted-foreground" /></div>
                }
                <div className="absolute top-1.5 right-1.5 bg-primary text-[10px] font-black px-1.5 py-0.5 rounded-md" style={{ color: '#07050a' }}>
                  {item.type === "course" ? "دوره" : "محصول"}
                </div>
              </div>
              <div className="p-2.5 flex flex-col justify-between" style={{ flex: 1 }}>
                <h4 className="font-bold text-xs line-clamp-2 leading-snug">{item.title}</h4>
                <div className="w-full text-center rounded-xl py-1.5 text-[11px] font-black mt-2" style={{ background: "linear-gradient(135deg,#e8b800,#c49200)", color: "#07050a" }}>
                  مشاهده ←
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ─── Guest: Blurred locked sections teaser ──────────────────────────────
function LockedSectionTeaser({ onRequireAuth }: { onRequireAuth: () => void }) {
  return (
    <div className="relative mt-2" dir="rtl" style={{ minHeight: 220 }}>
      {/* blurred skeleton preview */}
      <div className="pointer-events-none select-none" style={{ filter: "blur(5px)", opacity: 0.35 }}>
        <div>
          <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
            <Book className="w-5 h-5 text-primary" />
            دوره‌های من
          </h3>
          <div style={{ display: "flex", gap: 12 }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-card rounded-2xl overflow-hidden shrink-0" style={{ width: 156, height: 210 }}>
                <div className="bg-muted w-full" style={{ height: 156 }} />
                <div className="p-2.5 space-y-1.5">
                  <div className="h-3 bg-muted rounded w-4/5" />
                  <div className="h-3 bg-muted rounded w-3/5" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* lock overlay */}
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-background/95 border border-border shadow-lg flex items-center justify-center">
          <Lock className="w-7 h-7 text-primary" />
        </div>
        <p className="text-sm font-bold text-center px-6 leading-relaxed">
          دوره‌ها و محصولات خریداری‌شده<br />
          <span className="text-muted-foreground font-normal text-xs">پس از ورود به حساب نمایش داده می‌شود</span>
        </p>
        <button
          onClick={onRequireAuth}
          className="rounded-xl px-6 py-2.5 text-sm font-black shadow-lg active:scale-[0.97] transition-transform"
          style={{ background: "linear-gradient(135deg,#e8b800,#c49200)", color: "#07050a" }}
        >
          ثبت‌نام / ورود به حساب
        </button>
      </div>
    </div>
  );
}

// ─── Guest Profile page ─────────────────────────────────────────────────
function GuestProfileView() {
  const [, navigate] = useLocation();

  return (
    <div className="relative p-4 pt-4 pb-24 max-w-md mx-auto" dir="rtl">
      {/* Ambient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-10 -right-16 w-72 h-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(240,192,64,0.16), transparent 70%)" }} />
        <div className="absolute top-1/3 -left-24 w-80 h-80 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)" }} />
      </div>

      <div className="relative space-y-4">
        {/* Guest avatar card */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center ring-2 ring-primary/30 shrink-0">
                <UserIcon className="w-7 h-7 text-muted-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-base font-bold truncate">کاربر مهمان</h2>
                <p className="text-xs text-muted-foreground mt-0.5">برای دسترسی کامل ثبت‌نام کنید</p>
              </div>
            </div>
            <button
              onClick={() => navigate("/login")}
              className="mt-4 w-full rounded-xl py-2.5 text-sm font-black active:scale-[0.98] transition-transform shadow-md"
              style={{ background: "linear-gradient(135deg,#e8b800,#c49200)", color: "#07050a" }}
            >
              ثبت‌نام / ورود به حساب کاربری
            </button>
          </CardContent>
        </Card>

        {/* Smart tools (Sara locked) */}
        <GuestSmartToolsSection onRequireAuth={() => navigate("/login")} />

        {/* Quick links */}
        <div className="grid grid-cols-2 gap-3">
          <Link href="/podcasts">
            <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm hover:border-primary/40 transition-all active:scale-[0.98]">
              <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <Mic className="w-4 h-4 text-primary" />
              </span>
              <span>پادکست</span>
            </div>
          </Link>
          <button onClick={() => navigate("/login")} className="w-full text-right">
            <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm opacity-55">
              <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <Wallet className="w-4 h-4 text-primary" />
              </span>
              <span>کیف پول</span>
              <Lock className="w-3.5 h-3.5 text-muted-foreground mr-auto" />
            </div>
          </button>
          <Link href="/products">
            <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm hover:border-primary/40 transition-all active:scale-[0.98]">
              <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <ShoppingBag className="w-4 h-4 text-primary" />
              </span>
              <span>محصولات</span>
            </div>
          </Link>
          <Link href="/tools">
            <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm hover:border-primary/40 transition-all active:scale-[0.98]">
              <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
                <Wrench className="w-4 h-4 text-primary" />
              </span>
              <span>ابزارها</span>
            </div>
          </Link>
        </div>

        {/* Public courses & products carousel */}
        <SpecialOffersPublic />

        {/* Locked owned-content teaser */}
        <LockedSectionTeaser onRequireAuth={() => navigate("/login")} />
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, token, logout } = useAuth();
  const { isAdmin, meUser, tribeInfo } = useIsAdmin(token);
  const [, navigate] = useLocation();
  const [tribeBannerDismissed, setTribeBannerDismissed] = useState(
    () => localStorage.getItem("tribe_banner_dismissed") === "1"
  );
  const { setExtraBottom } = useFloatOffset();

  useEffect(() => {
    setExtraBottom(tribeBannerDismissed ? 0 : 60);
    return () => setExtraBottom(0);
  }, [tribeBannerDismissed, setExtraBottom]);

  const displayUser = user ?? meUser;
  const showTribeBanner = !tribeBannerDismissed;

  const [voiceCallEnabled, setVoiceCallEnabled] = useState(true);
  const [chatbotEnabled, setChatbotEnabled] = useState(true);
  useEffect(() => {
    if (!token) return;
    // بررسی فیلتر دوره + کلید کلی برای این کاربر
    fetch(`${API}/api/settings/features`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d) {
          if (d.voice_call !== undefined) setVoiceCallEnabled(d.voice_call);
          if (d.chatbot !== undefined) setChatbotEnabled(d.chatbot);
        }
      })
      .catch(() => {});
  }, [token]);

  if (!token) {
    return <GuestProfileView />;
  }

  return (
    <div className="relative p-4 pt-4 pb-24 max-w-md mx-auto">
      {/* Liquid ambient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -top-10 -right-16 w-72 h-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(240,192,64,0.16), transparent 70%)" }} />
        <div className="absolute top-1/3 -left-24 w-80 h-80 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(139,92,246,0.12), transparent 70%)" }} />
        <div className="absolute bottom-24 -right-10 w-72 h-72 rounded-full blur-3xl" style={{ background: "radial-gradient(circle, rgba(240,192,64,0.10), transparent 70%)" }} />
      </div>
      <div className="relative">
      {displayUser && <ProfileInfo user={displayUser} logout={logout} />}

      {/* Smart Tools Section */}
      <SmartToolsSection voiceCallEnabled={voiceCallEnabled} chatbotEnabled={chatbotEnabled} />


      {isAdmin && (
        <a
          href="/admin/login"
          className="mt-3 flex items-center gap-3 w-full bg-primary/10 border border-primary/30 text-primary rounded-xl px-4 py-3 font-bold hover:bg-primary/20 transition-all backdrop-blur-md shadow-[inset_0_1px_0_rgba(255,255,255,0.15)]"
        >
          <LayoutDashboard className="w-5 h-5 shrink-0" />
          ورود به پنل مدیریت
        </a>
      )}

      {/* Quick links grid */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Link href="/podcasts">
          <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm hover:border-primary/40 transition-all active:scale-[0.98]">
            <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <Mic className="w-4 h-4 text-primary" />
            </span>
            <span>پادکست</span>
          </div>
        </Link>
        <Link href="/wallet">
          <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm hover:border-primary/40 transition-all active:scale-[0.98]">
            <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <Wallet className="w-4 h-4 text-primary" />
            </span>
            <span>کیف پول</span>
            {meUser?.walletBalance > 0 && (
              <span className="mr-auto text-xs text-green-500 font-bold">{meUser.walletBalance.toLocaleString("fa")}</span>
            )}
          </div>
        </Link>
        <Link href="/products">
          <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm hover:border-primary/40 transition-all active:scale-[0.98]">
            <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <ShoppingBag className="w-4 h-4 text-primary" />
            </span>
            <span>محصولات</span>
          </div>
        </Link>
        <Link href="/tools">
          <div className="glass-card flex items-center gap-2.5 rounded-xl px-3.5 py-3 font-bold text-sm hover:border-primary/40 transition-all active:scale-[0.98]">
            <span className="w-8 h-8 rounded-lg bg-primary/15 border border-primary/25 flex items-center justify-center shrink-0 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <Wrench className="w-4 h-4 text-primary" />
            </span>
            <span>ابزارها</span>
          </div>
        </Link>


      </div>



      <div className="space-y-6 mt-8">
        <PendingOrders token={token} />
        <ProfileContentSections />
        <MediaCacheSection />
      </div>

      {showTribeBanner && (
        <div
          dir="rtl"
          style={{
            position: "fixed",
            bottom: "calc(5rem + env(safe-area-inset-bottom) + 10px)",
            left: 0, right: 0,
            zIndex: 50,
            padding: "0 12px",
          }}
        >
          <div
            className="rounded-2xl px-3 py-2.5 flex items-center gap-2 shadow-xl"
            style={{
              background: "linear-gradient(135deg, #3b1fa8 0%, #6d28d9 100%)",
              border: "1px solid rgba(167,139,250,0.35)",
              boxShadow: "0 8px 32px rgba(109,40,217,0.45)",
            }}
          >
            <button
              onClick={() => { localStorage.setItem("tribe_banner_dismissed", "1"); setTribeBannerDismissed(true); }}
              className="shrink-0 w-6 h-6 flex items-center justify-center rounded-full"
              style={{ background: "rgba(255,255,255,0.15)" }}
            >
              <X className="w-3 h-3 text-white" />
            </button>
            <Crown className="w-4 h-4 shrink-0 text-yellow-300" />
            <span className="flex-1 text-xs font-bold tribe-banner-text whitespace-nowrap overflow-hidden text-ellipsis">
              میخوای از ویژگی قبیله، درآمدزایی کنی؟
            </span>
            <button
              onClick={() => navigate("/tribe")}
              className="shrink-0 text-xs font-bold rounded-xl px-3 py-1.5 transition-colors whitespace-nowrap tribe-banner-text"
              style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)" }}
            >
              ورود به قبیله
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function SmartToolsSection({ voiceCallEnabled, chatbotEnabled }: { voiceCallEnabled: boolean; chatbotEnabled: boolean }) {
  const { resolved } = useTheme();
  const isDark = resolved === "dark";

  const tools = [
    {
      icon: staticAssetUrl.asset("icons/tool-sara.webp"),
      title: "تماس با سارا",
      subtitle: "مشاوره صوتی – شروع تماس",
      btnLabel: "تماس بگیرید",
      href: "/advisor",
      glow:   isDark ? "rgba(212,160,23,0.30)" : "rgba(212,160,23,0.18)",
      blob:   isDark ? "rgba(212,160,23,0.35)" : "rgba(212,160,23,0.22)",
      border: isDark ? "rgba(212,160,23,0.45)" : "rgba(212,160,23,0.32)",
      bg:     isDark ? "rgba(20,14,2,0.80)"    : "rgba(255,250,232,0.95)",
      btn:    isDark ? "#d4a017"                : "#a06c00",
      show: voiceCallEnabled,
    },
    {
      icon: staticAssetUrl.asset("icons/tool-assistant.webp"),
      title: "دستیار هوشمند",
      subtitle: "مدیریت کارها، یادآوری و چت",
      btnLabel: "شروع گفتگو",
      href: "/assistant",
      glow:   isDark ? "rgba(109,40,217,0.32)" : "rgba(109,40,217,0.14)",
      blob:   isDark ? "rgba(109,40,217,0.38)" : "rgba(139,92,246,0.20)",
      border: isDark ? "rgba(139,92,246,0.45)" : "rgba(139,92,246,0.30)",
      bg:     isDark ? "rgba(10,4,22,0.82)"    : "rgba(245,240,255,0.95)",
      btn:    isDark ? "#7c3aed"                : "#6d28d9",
      show: chatbotEnabled,
    },
    {
      icon: staticAssetUrl.asset("icons/tool-finance.webp"),
      title: "مدیریت درآمد و هزینه",
      subtitle: "ابزار مالی هوشمند",
      btnLabel: "ورود به ابزار",
      href: "/tools/income-expense",
      glow:   isDark ? "rgba(34,197,94,0.25)"  : "rgba(34,197,94,0.14)",
      blob:   isDark ? "rgba(34,197,94,0.32)"  : "rgba(34,197,94,0.20)",
      border: isDark ? "rgba(34,197,94,0.42)"  : "rgba(34,197,94,0.28)",
      bg:     isDark ? "rgba(2,14,6,0.82)"     : "rgba(236,253,245,0.95)",
      btn:    isDark ? "#16a34a"                : "#15803d",
      show: true,
    },
  ];

  const visible = tools.filter(t => t.show);
  if (visible.length === 0) return null;

  return (
    <div className="mt-4" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-start gap-2 mb-3">
        <span className="text-primary text-base">✦</span>
        <h2 className="text-sm font-black text-foreground">ابزارهای هوشمند</h2>
      </div>

      {/* Cards row */}
      <div
        className={`grid gap-2.5 ${
          visible.length === 3 ? "grid-cols-3" :
          visible.length === 2 ? "grid-cols-2" : "grid-cols-1"
        }`}
      >
        {visible.map((tool) => (
          <Link key={tool.href} href={tool.href}>
            <div
              className="relative flex flex-col items-center rounded-2xl px-2 pt-4 pb-3 gap-2 active:scale-[0.97] transition-transform duration-150 cursor-pointer overflow-hidden"
              style={{
                background: tool.bg,
                border: `1px solid ${tool.border}`,
                boxShadow: `0 4px 20px ${tool.glow}`,
                backdropFilter: "blur(12px)",
              }}
            >
              {/* Glow blob behind icon */}
              <div
                className="absolute -top-4 left-1/2 -translate-x-1/2 w-20 h-20 rounded-full blur-2xl pointer-events-none"
                style={{ background: tool.blob, opacity: 0.7 }}
              />

              {/* Icon */}
              <div className="relative w-20 h-20 rounded-2xl overflow-hidden shrink-0 shadow-lg z-10">
                <img
                  src={tool.icon}
                  alt={tool.title}
                  width={80}
                  height={80}
                  className="w-full h-full object-cover"
                  loading="eager"
                  decoding="async"
                  fetchPriority="high"
                />
              </div>

              {/* Text */}
              <div className="text-center flex-1 min-w-0 w-full z-10">
                <p className="text-[11px] font-black leading-snug text-foreground line-clamp-2">{tool.title}</p>
                <p className="text-[9px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">{tool.subtitle}</p>
              </div>

              {/* Button */}
              <button
                className="relative z-10 w-full rounded-xl py-1.5 text-[10px] font-black text-white transition-opacity hover:opacity-90 active:opacity-75 shadow-sm"
                style={{ background: tool.btn, color: '#fff', WebkitTextFillColor: '#fff' }}
                tabIndex={-1}
              >
                {tool.btnLabel}
              </button>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}


function ProfileInfo({ user, logout }: { user: User; logout: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [name, setName] = useState(user.name || "");
  const [showPasswordSection, setShowPasswordSection] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNew, setShowNew] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState(user.avatar || "");
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarUploadProgress, setAvatarUploadProgress] = useState(0);
  const updateProfile = useUpdateProfile();
  const { token } = useAuth();
  const API = import.meta.env.VITE_API_BASE_URL ?? "";
  const prevUserId = useRef(user.id);

  useEffect(() => {
    if (user.avatar && !uploadingAvatar) setAvatarUrl(user.avatar);
    if (user.name && user.id !== prevUserId.current) {
      setName(user.name);
      prevUserId.current = user.id;
    } else if (user.name && !name) {
      setName(user.name);
    }
  }, [user.avatar, user.name, user.id]);

  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    setAvatarUploadProgress(0);
    const formData = new FormData();
    formData.append("file", file);
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (ev) => {
      if (ev.lengthComputable) setAvatarUploadProgress(Math.round((ev.loaded / ev.total) * 100));
    };
    xhr.onload = () => {
      setUploadingAvatar(false);
      setAvatarUploadProgress(0);
      e.target.value = "";
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setAvatarUrl(data.url);
          toast.success("عکس پروفایل بروزرسانی شد");
        } else {
          toast.error(data.error ?? "خطا در آپلود عکس");
        }
      } catch {
        toast.error("خطا در آپلود عکس");
      }
    };
    xhr.onerror = () => {
      setUploadingAvatar(false);
      setAvatarUploadProgress(0);
      e.target.value = "";
      toast.error("خطا در آپلود عکس");
    };
    xhr.open("POST", `${API}/api/upload/avatar`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(formData);
  };

  const handleSave = () => {
    updateProfile.mutate(
      { data: { name } },
      {
        onSuccess: () => {
          toast.success("پروفایل با موفقیت بروزرسانی شد");
          setIsEditing(false);
        },
        onError: () => toast.error("خطا در بروزرسانی پروفایل"),
      }
    );
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) { toast.error("رمز جدید باید حداقل ۶ کاراکتر باشد"); return; }
    if (newPassword !== confirmPassword) { toast.error("تکرار رمز مطابقت ندارد"); return; }
    setChangingPassword(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ currentPassword: currentPassword || undefined, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("رمز عبور با موفقیت تغییر یافت");
      setShowPasswordSection(false);
      setCurrentPassword(""); setNewPassword(""); setConfirmPassword("");
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "خطا در تغییر رمز عبور");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-3.5 space-y-3.5">
        {/* Header row: avatar + name + verified */}
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <label className="relative w-14 h-14 rounded-full bg-secondary flex items-center justify-center cursor-pointer group overflow-hidden shrink-0 ring-2 ring-primary/25 ring-offset-2 ring-offset-card">
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={handleAvatarChange}
              disabled={uploadingAvatar}
            />
            {avatarUrl ? (
              <CachedImage src={avatarUrl} alt="پروفایل" className="w-full h-full object-cover" />
            ) : (
              <UserIcon className="w-7 h-7 text-muted-foreground" />
            )}
            {/* Overlay on hover / uploading */}
            <div className={`absolute inset-0 bg-black/50 flex flex-col items-center justify-center rounded-full transition-opacity ${uploadingAvatar ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
              {uploadingAvatar ? (
                <>
                  <span className="text-white text-[10px] font-bold leading-none">{avatarUploadProgress}٪</span>
                  <div className="w-7 bg-white/30 rounded-full h-1 mt-1">
                    <div className="bg-white h-1 rounded-full transition-all duration-200" style={{ width: `${avatarUploadProgress}%` }} />
                  </div>
                </>
              ) : (
                <Edit2 className="w-4 h-4 text-white" />
              )}
            </div>
          </label>

          {/* Name + phone */}
          <div className="flex-1 min-w-0">
            {isEditing ? (
              <div className="flex gap-2 items-center">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-sm" placeholder="نام خود را وارد کنید" />
                <Button size="sm" onClick={handleSave} className="h-8 shrink-0" disabled={updateProfile.isPending}>ثبت</Button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 min-w-0">
                <h2 className="text-base font-bold truncate">{user.name || "کاربر شیوافر"}</h2>
                <button onClick={() => setIsEditing(true)} className="text-muted-foreground hover:text-primary shrink-0">
                  <Edit2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-1">
              <span className="text-xs text-muted-foreground" dir="ltr">{user.phone}</span>
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 border border-primary/20 px-1.5 py-0.5 rounded-full shrink-0">
                <ShieldCheck className="w-3 h-3" />
                تایید شده
              </span>
            </div>
          </div>
        </div>

        {/* Change password toggle */}
        <button
          type="button"
          onClick={() => setShowPasswordSection(!showPasswordSection)}
          className="w-full flex items-center justify-between text-sm text-muted-foreground hover:text-foreground transition-colors border-t border-border pt-3"
        >
          <span className="flex items-center gap-2">
            <Lock className="w-4 h-4" />
            تغییر رمز عبور
          </span>
          {showPasswordSection ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {showPasswordSection && (
          <form onSubmit={handleChangePassword} className="space-y-3">
            <Input
              type="password"
              placeholder="رمز عبور فعلی (اگر دارید)"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              className="h-10 text-sm bg-secondary/50"
              dir="ltr"
            />
            <div className="relative">
              <Input
                type={showNew ? "text" : "password"}
                placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="h-10 text-sm bg-secondary/50 pl-10"
                dir="ltr"
              />
              <button type="button" onClick={() => setShowNew(!showNew)} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <Input
              type="password"
              placeholder="تکرار رمز عبور جدید"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="h-10 text-sm bg-secondary/50"
              dir="ltr"
            />
            <Button type="submit" className="w-full h-10" disabled={changingPassword || !newPassword}>
              {changingPassword ? "در حال ذخیره..." : "ذخیره رمز عبور"}
            </Button>
          </form>
        )}

        {/* Logout button */}
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 text-sm font-bold text-destructive/80 hover:text-destructive transition-colors border-t border-border pt-3 mt-1"
        >
          <LogOut className="w-4 h-4" />
          خروج از حساب کاربری
        </button>
      </CardContent>
    </Card>
  );
}

interface MyOrder {
  id: number;
  itemType: string;
  itemName: string;
  amount: number;
  status: string;
  trackingCode: string | null;
  receiptUrl: string | null;
  cancelReason: string | null;
  gateway: string | null;
  createdAt: string;
}

const CANCEL_REASONS = [
  "منصرف شدم از خرید",
  "اشتباه در مبلغ واریز",
  "تصمیم به تغییر محصول گرفتم",
  "مشکل فنی در آپلود رسید",
  "سایر دلایل",
];

function PendingOrders({ token }: { token: string | null }) {
  const [orders, setOrders] = useState<MyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelTarget, setCancelTarget] = useState<MyOrder | null>(null);
  const [selectedReason, setSelectedReason] = useState("");
  const [customReason, setCustomReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [uploadingFor, setUploadingFor] = useState<number | null>(null);
  const fileRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const fetchOrders = () => {
    if (!token) { setLoading(false); return; }
    fetch("/api/orders/my", { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.ok ? r.json() : [])
      .then((data) => setOrders(Array.isArray(data) ? data : []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchOrders(); }, [token]);

  const pending = orders.filter((o) => o.status === "pending");
  if (!loading && pending.length === 0) return null;

  const handleReceiptUpload = async (orderId: number, file: File) => {
    setUploadingFor(orderId);
    try {
      const form = new FormData();
      form.append("receipt", file);
      const res = await fetch(`/api/orders/${orderId}/receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (res.ok) {
        toast.success("رسید با موفقیت آپلود شد");
        fetchOrders();
      } else {
        toast.error("خطا در آپلود رسید");
      }
    } catch {
      toast.error("خطا در اتصال");
    } finally {
      setUploadingFor(null);
    }
  };

  const handleCancel = async () => {
    if (!cancelTarget) return;
    const reason = selectedReason === "سایر دلایل" ? customReason.trim() : selectedReason;
    if (!reason) { toast.error("لطفاً دلیل لغو را مشخص کنید"); return; }
    setCancelling(true);
    try {
      const res = await fetch(`/api/orders/${cancelTarget.id}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ reason }),
      });
      if (res.ok) {
        toast.success("سفارش با موفقیت لغو شد");
        setCancelTarget(null);
        setSelectedReason("");
        setCustomReason("");
        fetchOrders();
      } else {
        const d = await res.json().catch(() => ({}));
        toast.error((d as { error?: string }).error ?? "خطا در لغو سفارش");
      }
    } catch {
      toast.error("خطا در اتصال");
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div>
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <Receipt className="w-5 h-5 text-primary" />
        سفارش‌های در انتظار
      </h3>

      {loading ? (
        <div className="h-20 bg-card rounded-xl animate-pulse" />
      ) : (
        <div className="space-y-3">
          {pending.map((order) => (
            <div key={order.id} className="glass-card rounded-2xl p-4" dir="rtl">
              {/* Header */}
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm line-clamp-1">{order.itemName}</p>
                  {order.trackingCode && (
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono" dir="ltr">{order.trackingCode}</p>
                  )}
                </div>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-500 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5 shrink-0">
                  <Clock className="w-3 h-3" />در حال بررسی
                </span>
              </div>

              {/* Amount + receipt status */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-muted-foreground">
                  مبلغ: <span className="font-bold text-foreground">{formatPrice(order.amount)}</span>
                </span>
                {order.receiptUrl ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-medium">
                    <CheckCircle2 className="w-3 h-3" />رسید ارسال شد
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                    <Upload className="w-3 h-3" />رسید آپلود نشده
                  </span>
                )}
              </div>

              {/* Action buttons */}
              <div className="flex gap-2 border-t border-border/40 pt-3">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={(el) => { fileRefs.current[order.id] = el; }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleReceiptUpload(order.id, f);
                  }}
                />
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-border/60 bg-secondary/50 py-2 text-xs font-bold hover:bg-secondary transition-colors active:scale-[0.97] disabled:opacity-50"
                  onClick={() => fileRefs.current[order.id]?.click()}
                  disabled={uploadingFor === order.id}
                >
                  {uploadingFor === order.id
                    ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />در حال آپلود...</>
                    : <><Upload className="w-3.5 h-3.5" />{order.receiptUrl ? "ویرایش رسید" : "آپلود رسید"}</>
                  }
                </button>
                <button
                  type="button"
                  className="flex-1 flex items-center justify-center gap-1.5 rounded-xl border border-red-500/30 bg-red-500/10 py-2 text-xs font-bold text-red-500 hover:bg-red-500/20 transition-colors active:scale-[0.97]"
                  onClick={() => { setCancelTarget(order); setSelectedReason(""); setCustomReason(""); }}
                >
                  <XCircle className="w-3.5 h-3.5" />لغو سفارش
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cancel reason bottom sheet */}
      {cancelTarget && (
        <div className="fixed inset-0 z-50 flex flex-col" dir="rtl">
          <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={() => setCancelTarget(null)} />
          <div className="bg-background border-t border-border rounded-t-3xl p-5 space-y-4 overflow-y-auto"
            style={{ maxHeight: "calc(90vh - env(safe-area-inset-top, 0px))", paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}>
            <div className="flex items-center justify-between">
              <p className="font-bold text-base">لغو سفارش</p>
              <button type="button" onClick={() => setCancelTarget(null)}
                className="w-8 h-8 flex items-center justify-center rounded-full bg-secondary text-muted-foreground">
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              سفارش «<span className="font-bold text-foreground">{cancelTarget.itemName}</span>» لغو می‌شود. لطفاً دلیل را انتخاب کنید:
            </p>
            <div className="space-y-2">
              {CANCEL_REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  className={`w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-sm text-right transition-colors ${
                    selectedReason === r
                      ? "border-primary bg-primary/10 text-primary font-bold"
                      : "border-border/50 bg-secondary/30 text-foreground"
                  }`}
                  onClick={() => setSelectedReason(r)}
                >
                  <div className={`w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center ${
                    selectedReason === r ? "border-primary" : "border-muted-foreground/40"
                  }`}>
                    {selectedReason === r && <div className="w-2 h-2 rounded-full bg-primary" />}
                  </div>
                  {r}
                </button>
              ))}
              {selectedReason === "سایر دلایل" && (
                <textarea
                  className="w-full rounded-xl border border-border/60 bg-secondary/40 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-primary"
                  rows={2}
                  placeholder="توضیح بدهید..."
                  value={customReason}
                  onChange={(e) => setCustomReason(e.target.value)}
                />
              )}
            </div>
            <button
              type="button"
              className="w-full h-11 rounded-xl bg-red-500 text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
              disabled={!selectedReason || (selectedReason === "سایر دلایل" && !customReason.trim()) || cancelling}
              onClick={handleCancel}
            >
              {cancelling
                ? <><Loader2 className="w-4 h-4 animate-spin" />در حال لغو...</>
                : <><XCircle className="w-4 h-4" />تأیید لغو سفارش</>
              }
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function UserCourses() {
  const { data: courses, isLoading } = useGetUserCourses();

  return (
    <div>
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <Book className="w-5 h-5 text-primary" />
        دوره‌های من
      </h3>
      {isLoading ? (
        <div className="h-36 bg-card rounded-xl animate-pulse" />
      ) : courses && courses.length > 0 ? (
        <div
          style={{
            display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6,
            scrollSnapType: "x mandatory", msOverflowStyle: "none", scrollbarWidth: "none",
          }}
          className="hide-scrollbar"
        >
          {courses.map(course => (
            <Link key={course.id} href={`/courses/${course.id}`} style={{ scrollSnapAlign: "start", flexShrink: 0, width: 156 }}>
              <div className="glass-card rounded-2xl overflow-hidden active:scale-[0.97] transition-transform" style={{ width: 156 }}>
                <div className="bg-muted" style={{ height: 156 }}>
                  <CachedImage src={course.thumbnail ?? course.image} alt={course.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-2.5">
                  <h4 className="font-bold text-xs line-clamp-2 mb-1.5 leading-snug">{course.title}</h4>
                  <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-md font-bold">دسترسی کامل</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-secondary/50 border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
          شما هنوز دوره‌ای خریداری نکرده‌اید.
        </div>
      )}
    </div>
  );
}

function MediaCacheSection() {
  const [items, setItems] = useState<MediaCacheItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);
  const [removingUrl, setRemovingUrl] = useState<string | null>(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const info = await getMediaCacheInfo();
      setItems(info.items);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "MEDIA_CLEARED" || e.data?.type === "CACHE_COMPLETE" || e.data?.type === "CACHE_REMOVED") {
        refresh();
      }
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const handleClear = async () => {
    if (!confirm("تمام محتوای ذخیره‌شده برای آفلاین پاک شود؟")) return;
    setClearing(true);
    await clearAllMediaCache();
    setTimeout(() => { setClearing(false); refresh(); }, 800);
  };

  const handleRemove = async (url: string) => {
    setRemovingUrl(url);
    await removeMediaCacheItem(url);
    setTimeout(() => { setRemovingUrl(null); refresh(); }, 500);
  };

  const labels: Record<string, string> = {
    "/api/stream/reel/": "ریل",
    "/api/stream/lesson/": "جلسه دوره",
    "/api/uploads/audios/": "پادکست",
  };
  const labelFor = (url: string) => {
    for (const [prefix, label] of Object.entries(labels)) {
      if (url.includes(prefix)) return label;
    }
    return "رسانه";
  };
  const nameFor = (url: string) => url.split("/").pop() ?? url;

  if (!loading && items.length === 0) return null;

  return (
    <div>
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <WifiOff className="w-5 h-5 text-primary" />
        محتوای آفلاین
      </h3>
      {loading ? (
        <div className="h-20 bg-card rounded-xl animate-pulse" />
      ) : (
        <div className="glass-card rounded-xl p-4 space-y-3" dir="rtl">
          {/* Header — count + size + clear all */}
          <div className="flex items-center justify-between">
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-bold text-foreground">{items.length} فایل ذخیره‌شده</span>
            </div>
            <button
              onClick={handleClear}
              disabled={clearing}
              className="flex items-center gap-1.5 text-xs font-bold text-red-400 hover:text-red-300 disabled:opacity-50 transition-colors"
            >
              {clearing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              پاک کردن همه
            </button>
          </div>

          {/* Per-item list */}
          <div className="space-y-1 max-h-52 overflow-y-auto -mx-1 px-1">
            {items.map((item) => (
              <div
                key={item.url}
                className="flex items-center gap-2 py-2 px-2 rounded-lg hover:bg-secondary/40 transition-colors border border-transparent hover:border-border/30"
              >
                <WifiOff className="w-3 h-3 text-green-400 shrink-0" />
                <span className="px-1.5 py-0.5 rounded bg-primary/10 text-primary text-[10px] font-bold shrink-0">
                  {labelFor(item.url)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-foreground truncate font-medium">{nameFor(item.url)}</p>
                </div>
                <button
                  onClick={() => handleRemove(item.url)}
                  disabled={removingUrl === item.url}
                  className="w-6 h-6 flex items-center justify-center rounded-full bg-red-500/10 hover:bg-red-500/20 border border-red-500/20 shrink-0 transition-colors disabled:opacity-40"
                  title="حذف از حافظه"
                >
                  {removingUrl === item.url
                    ? <Loader2 className="w-3 h-3 text-red-400 animate-spin" />
                    : <X className="w-3 h-3 text-red-400" />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function UserProducts() {
  const { data: products, isLoading } = useGetUserProducts();

  return (
    <div>
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2">
        <Box className="w-5 h-5 text-primary" />
        محصولات من
      </h3>
      {isLoading ? (
        <div className="h-36 bg-card rounded-xl animate-pulse" />
      ) : products && products.length > 0 ? (
        <div
          style={{
            display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6,
            scrollSnapType: "x mandatory", msOverflowStyle: "none", scrollbarWidth: "none",
          }}
          className="hide-scrollbar"
        >
          {products.map(product => (
            <Link key={product.id} href={`/product/${product.id}`} style={{ scrollSnapAlign: "start", flexShrink: 0, width: 156 }}>
              <div className="glass-card rounded-2xl overflow-hidden active:scale-[0.97] transition-transform" style={{ width: 156 }}>
                <div className="bg-muted" style={{ height: 156 }}>
                  <CachedImage src={product.image} alt={product.title} className="w-full h-full object-cover" />
                </div>
                <div className="p-2.5">
                  <h4 className="font-bold text-xs line-clamp-2 mb-1.5 leading-snug">{product.title}</h4>
                  <span className="text-[10px] text-primary bg-primary/10 px-2 py-0.5 rounded-md font-bold">مشاهده محصول</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-secondary/50 border border-border rounded-xl p-6 text-center text-muted-foreground text-sm">
          شما هنوز محصولی خریداری نکرده‌اید.
        </div>
      )}
    </div>
  );
}

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function toArray(val: any): any[] {
  if (Array.isArray(val)) return val;
  if (val && Array.isArray(val.data)) return val.data;
  if (val && Array.isArray(val.items)) return val.items;
  return [];
}

function SpecialOffers() {
  const API_URL = import.meta.env.VITE_API_BASE_URL ?? "";
  const { token } = useAuth();
  const { data: userCourses } = useGetUserCourses();
  const { data: userProducts } = useGetUserProducts();
  const [offers, setOffers] = useState<Array<{ id: number; title: string; image?: string | null; type: "course" | "product"; href: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    const headers: HeadersInit = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/api/courses`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
      fetch(`${API_URL}/api/products`, { headers }).then(r => r.ok ? r.json() : []).catch(() => []),
    ]).then(([rawCourses, rawProducts]) => {
      const ownedCourseIds = new Set((userCourses ?? []).map((c: any) => c.id));
      const ownedProductIds = new Set((userProducts ?? []).map((p: any) => p.id));
      const c = toArray(rawCourses)
        .filter((x: any) => !ownedCourseIds.has(x.id))
        .map((x: any) => ({ id: x.id, title: x.title, image: x.thumbnail ?? x.image, type: "course" as const, href: `/courses/${x.id}` }));
      // /api/products returns { categories: [...], uncategorized: [...] } — flatten both
      const flatProducts: any[] = [
        ...(rawProducts?.uncategorized ?? []),
        ...(rawProducts?.categories ?? []).flatMap((cat: any) => cat.products ?? []),
      ];
      const p = flatProducts
        .filter((x: any) => !ownedProductIds.has(x.id))
        .map((x: any) => ({ id: x.id, title: x.title, image: x.image, type: "product" as const, href: `/product/${x.id}` }));
      // Shuffle fully so courses and products are mixed randomly on each visit
      setOffers(shuffleArray([...c, ...p]));
      setLoading(false);
    });
  }, [token, userCourses, userProducts]);

  if (loading) return <div className="h-36 bg-card rounded-xl animate-pulse" />;
  if (offers.length === 0) return null;

  return (
    <div>
      <h3 className="font-bold text-lg mb-3 flex items-center gap-2 justify-between" dir="rtl">
        <span className="flex items-center gap-2">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
            {/* outer glow ring */}
            <circle cx="11" cy="11" r="9.5" stroke="#e8b800" strokeWidth="1" strokeDasharray="2.5 2" opacity="0.45"/>
            {/* inner circle bg */}
            <circle cx="11" cy="11" r="7" fill="#e8b800" fillOpacity="0.12"/>
            {/* 4-pointed star */}
            <path
              d="M11 4.5 L12.1 9.9 L17.5 11 L12.1 12.1 L11 17.5 L9.9 12.1 L4.5 11 L9.9 9.9 Z"
              fill="#e8b800"
            />
            {/* small sparkle top-right */}
            <path d="M17 5 L17.4 6.2 L18.6 6.6 L17.4 7 L17 8.2 L16.6 7 L15.4 6.6 L16.6 6.2 Z" fill="#e8b800" opacity="0.7"/>
            {/* small sparkle bottom-left */}
            <path d="M5 14.5 L5.3 15.4 L6.2 15.7 L5.3 16 L5 16.9 L4.7 16 L3.8 15.7 L4.7 15.4 Z" fill="#e8b800" opacity="0.5"/>
          </svg>
          پیشنهاد ویژه برای شما
        </span>
      </h3>
      <div
        style={{
          display: "flex", gap: 12, overflowX: "auto", paddingBottom: 6,
          scrollSnapType: "x mandatory", msOverflowStyle: "none", scrollbarWidth: "none",
        }}
        className="hide-scrollbar"
      >
        {offers.map(item => (
          <Link key={`${item.type}-${item.id}`} href={item.href} style={{ scrollSnapAlign: "start", flexShrink: 0, width: 160 }}>
            <div
              className="rounded-2xl overflow-hidden active:scale-[0.97] transition-transform flex flex-col"
              style={{
                width: 160,
                height: 260,
                background: "var(--card)",
                border: "1px solid rgba(232,184,0,0.22)",
                boxShadow: "0 4px 16px rgba(232,184,0,0.08)",
              }}
            >
              {/* Cover — fixed square */}
              <div className="bg-muted relative shrink-0" style={{ width: 160, height: 160 }}>
                {item.image
                  ? <img src={item.image} alt={item.title} className="w-full h-full object-cover" loading="lazy" />
                  : <div className="w-full h-full flex items-center justify-center"><ShoppingBag className="w-8 h-8 text-muted-foreground" /></div>
                }
                <div className="absolute top-1.5 right-1.5 bg-primary text-[10px] font-black px-1.5 py-0.5 rounded-md" style={{ color: '#07050a' }}>
                  {item.type === "course" ? "دوره" : "محصول"}
                </div>
              </div>
              {/* Info — fixed height fills rest of card */}
              <div className="p-2.5 flex flex-col justify-between" style={{ flex: 1 }}>
                <h4 className="font-bold text-xs line-clamp-2 leading-snug">{item.title}</h4>
                <div
                  className="w-full text-center rounded-xl py-1.5 text-[11px] font-black mt-2"
                  style={{ background: "linear-gradient(135deg,#e8b800,#c49200)", color: "#07050a" }}
                >
                  مشاهده {item.type === "course" ? "دوره" : "محصول"} ←
                </div>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function ProfileContentSections() {
  const { data: userCourses, isLoading: loadingCourses } = useGetUserCourses();
  const { data: userProducts, isLoading: loadingProducts } = useGetUserProducts();
  const hasOwned = ((userCourses?.length ?? 0) + (userProducts?.length ?? 0)) > 0;
  const stillLoading = loadingCourses || loadingProducts;

  if (stillLoading) {
    return (
      <>
        <div className="h-36 bg-card rounded-xl animate-pulse" />
        <div className="h-36 bg-card rounded-xl animate-pulse" />
      </>
    );
  }

  if (!hasOwned) {
    return (
      <>
        <SpecialOffers />
        <UserCourses />
        <UserProducts />
      </>
    );
  }

  return (
    <>
      <UserCourses />
      <UserProducts />
      <SpecialOffers />
    </>
  );
}
