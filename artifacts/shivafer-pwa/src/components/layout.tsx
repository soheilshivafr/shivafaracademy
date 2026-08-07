import { staticAssetUrl } from "@/lib/static-assets";
import { Link, useLocation } from "wouter";
import { Film, ShoppingBag, GraduationCap, User, Crown, Headphones, Megaphone } from "lucide-react";
import { cn } from "@/lib/utils";
import { Header } from "./header";
import { usePlayer } from "@/lib/player-context";
import { useAuth } from "@/lib/auth";
import { useGetUserCourses, getGetUserCoursesQueryKey } from "@workspace/api-client-react";
import { useFloatOffset } from "@/lib/float-context";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { getAudioCtx } from "@/lib/audio-unlock";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// ── چت‌بات: وضعیت از طریق /api/settings کنترل می‌شود ──

// صدای کوتاهِ اعلان هنگام ظاهر شدنِ حبابِ پیامِ پیش‌قدمِ چت‌بات.
// با Web Audio ساخته می‌شود تا نیازی به فایل صوتی نباشد.
function playProactiveChime() {
  try {
    const ctx = getAudioCtx();
    if (!ctx || ctx.state !== "running") return;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.18, now + 0.02);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 0.5);
    master.connect(ctx.destination);

    // دو نتِ کوتاه و ملایم (دینگ-دینگ)
    const notes = [
      { freq: 880, start: 0, dur: 0.18 },
      { freq: 1174.7, start: 0.12, dur: 0.28 },
    ];
    for (const n of notes) {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "sine";
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

export function Layout({ children }: { children: React.ReactNode }) {
  const [location, navigate] = useLocation();
  const { isPlayerOpen } = usePlayer();
  const { extraBottom } = useFloatOffset();
  const { token, user } = useAuth();

  const [proactiveData, setProactiveData] = useState<{ id: number; content: string; agentName?: string | null; agentAvatarUrl?: string | null } | null>(null);
  const [proactiveDismissed, setProactiveDismissed] = useState(true);
  const [chatbotEnabled, setChatbotEnabled] = useState(false);

  useEffect(() => {
    if (token) {
      // کاربر لاگین‌شده: بررسی فیلتر دوره + کلید کلی
      fetch(`${API}/api/settings/features`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.chatbot !== undefined) setChatbotEnabled(d.chatbot); })
        .catch(() => {});
    } else {
      // کاربر مهمان: فقط کلید کلی
      fetch(`${API}/api/settings`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d && d.chatbot_enabled !== undefined) setChatbotEnabled(d.chatbot_enabled !== "false"); })
        .catch(() => {});
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;

    // rand(a, b) — milliseconds
    const rand = (minMs: number, maxMs: number) => minMs + Math.random() * (maxMs - minMs);

    async function fetchProactive(welcomeMtp = false) {
      // Never interrupt Sara (voice advisor page)
      if (window.location.pathname.startsWith("/advisor")) return;
      // Minimum 5-min cooldown to avoid double-show on remount (skipped for the
      // one-time post-registration welcome message)
      if (!welcomeMtp) {
        const lastShown = parseInt(localStorage.getItem("proactiveLastShown") || "0");
        if (Date.now() - lastShown < 5 * 60 * 1000) return;
      }
      try {
        const url = welcomeMtp
          ? "/api/ai-chat/proactive-ai?variant=welcome-mtp"
          : "/api/ai-chat/proactive-ai";
        const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
        if (res.ok) {
          const data = await res.json();
          if (data?.content && !window.location.pathname.startsWith("/ai-chat") && !window.location.pathname.startsWith("/advisor")) {
            localStorage.setItem("proactiveLastShown", String(Date.now()));
            setProactiveData(data);
            setProactiveDismissed(false);
            playProactiveChime();
          }
        }
      } catch { /* ignore */ }
    }

    // One-time post-registration welcome: the very first message after a user
    // creates their account (15 s later) is MTP/finance-focused. The flag is
    // cleared when it fires, so every later message follows the normal rule.
    const justRegistered = localStorage.getItem("firstAccountProactive") === "1";

    // First visit = never shown before → 15 s delay
    // Return visit = random 25 s – 5 min delay
    const isFirstVisit = !localStorage.getItem("proactiveLastShown");
    const initialDelay = (justRegistered || isFirstVisit) ? 15_000 : rand(25_000, 5 * 60_000);

    const initial = setTimeout(() => {
      const welcomeMtp = localStorage.getItem("firstAccountProactive") === "1";
      if (welcomeMtp) localStorage.removeItem("firstAccountProactive");
      fetchProactive(welcomeMtp);
    }, initialDelay);

    // Long-session interval: random 20–40 min, re-randomised each cycle
    let inSessionTimer: ReturnType<typeof setTimeout>;
    function scheduleNext() {
      const next = rand(20 * 60_000, 40 * 60_000);
      inSessionTimer = setTimeout(() => {
        setProactiveDismissed(true);
        fetchProactive();
        scheduleNext();
      }, next);
    }
    // Start the recurring cycle after the first message fires
    const kickoff = setTimeout(scheduleNext, initialDelay + 1000);

    return () => {
      clearTimeout(initial);
      clearTimeout(kickoff);
      clearTimeout(inSessionTimer);
    };
  }, [token]);

  // Auto-dismiss after 12 seconds
  useEffect(() => {
    if (proactiveDismissed || !proactiveData) return;
    const t = setTimeout(() => setProactiveDismissed(true), 12000);
    return () => clearTimeout(t);
  }, [proactiveDismissed, proactiveData]);

  function handleBubbleClick() {
    if (!proactiveData) return;
    localStorage.setItem("proactivePending", JSON.stringify({ content: proactiveData.content }));
    localStorage.setItem("proactiveLastShown", String(Date.now()));
    setProactiveDismissed(true);
    navigate("/ai-chat");
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation();
    localStorage.setItem("proactiveLastShown", String(Date.now()));
    setProactiveDismissed(true);
  }

  const onAdvisorPage = location.startsWith("/advisor");
  const showBubble = !proactiveDismissed && !!proactiveData && !location.startsWith("/ai-chat") && !onAdvisorPage && location !== "/assistant";

  const { data: userCourses } = useGetUserCourses({
    query: { queryKey: getGetUserCoursesQueryKey(), enabled: !!token, retry: false, staleTime: 60_000 },
  });
  const hasCourses = (userCourses?.length ?? 0) > 0;

  // ── Commission notification ─────────────────────────────────────────────────
  const [commissionBadge, setCommissionBadge] = useState(0);
  const prevCommissionIds = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!token) return;
    const stored = localStorage.getItem("seenCommissionIds");
    if (stored) {
      try { prevCommissionIds.current = new Set(JSON.parse(stored)); } catch { /* ignore */ }
    }

    async function checkCommissions() {
      try {
        const r = await fetch(`${API}/api/tribe/earnings`, { headers: { Authorization: `Bearer ${token}` } });
        if (!r.ok) return;
        const data: Array<{ id: number; amount: number; buyerName?: string; itemTitle?: string }> = await r.json();
        if (!Array.isArray(data) || data.length === 0) return;
        const newOnes = data.filter(e => !prevCommissionIds.current.has(e.id));
        if (newOnes.length === 0) return;
        if (prevCommissionIds.current.size > 0) {
          newOnes.forEach(e => {
            toast.success(
              `💰 کمیسیون جدید: ${e.amount?.toLocaleString("fa")} تومان${e.buyerName ? ` از ${e.buyerName}` : ""}${e.itemTitle ? ` — ${e.itemTitle}` : ""}`,
              { duration: 6000 }
            );
          });
        }
        newOnes.forEach(e => prevCommissionIds.current.add(e.id));
        localStorage.setItem("seenCommissionIds", JSON.stringify([...prevCommissionIds.current]));
        setCommissionBadge(b => b + newOnes.length);
      } catch { /* ignore */ }
    }

    checkCommissions();
    const interval = setInterval(checkCommissions, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [token]);

  const clearCommissionBadge = () => setCommissionBadge(0);

  // ── Reel & Channel unread badges ──────────────────────────────────────────
  const [reelBadge, setReelBadge] = useState(0);
  const [channelBadge, setChannelBadge] = useState(0);
  const allReelIds = useRef<string[]>([]);
  const allChannelIds = useRef<string[]>([]);

  useEffect(() => {
    function recalc() {
      const seenReels = new Set<string>(
        JSON.parse(localStorage.getItem("seenReelIds") || "[]"),
      );
      const seenChannel = new Set<string>(
        JSON.parse(localStorage.getItem("seenChannelIds") || "[]"),
      );
      setReelBadge(allReelIds.current.filter((id) => !seenReels.has(id)).length);
      setChannelBadge(allChannelIds.current.filter((id) => !seenChannel.has(id)).length);
    }

    async function init() {
      try {
        const [reelsRes, postsRes] = await Promise.all([
          fetch(`${API}/api/reels`),
          fetch(`${API}/api/channel/posts`),
        ]);
        const [reels, posts]: [any[], any[]] = await Promise.all([
          reelsRes.json(),
          postsRes.json(),
        ]);
        if (Array.isArray(reels))
          allReelIds.current = reels.map((r) => String(r.id));
        if (Array.isArray(posts))
          allChannelIds.current = posts.map((p) => String(p.id));

        // بار اول: همه آیتم‌های موجود را seen بگذار (کاربران قدیمی)
        if (!localStorage.getItem("seenReelIds_v1")) {
          localStorage.setItem("seenReelIds", JSON.stringify(allReelIds.current));
          localStorage.setItem("seenReelIds_v1", "1");
        }
        if (!localStorage.getItem("seenChannelIds_v1")) {
          localStorage.setItem("seenChannelIds", JSON.stringify(allChannelIds.current));
          localStorage.setItem("seenChannelIds_v1", "1");
        }
        recalc();
      } catch { /* ignore */ }
    }

    init();
    window.addEventListener("shivafer-seen-update", recalc);
    return () => window.removeEventListener("shivafer-seen-update", recalc);
  }, []);

  // ── Push subscription ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!token) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

    async function subscribePush() {
      try {
        const reg = await navigator.serviceWorker.ready;
        const existing = await reg.pushManager.getSubscription();
        if (existing) return; // already subscribed

        const keyRes = await fetch(`${API}/api/push/vapid-public-key`);
        if (!keyRes.ok) return;
        const { publicKey } = await keyRes.json();
        if (!publicKey) return;

        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;

        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
        });

        await fetch(`${API}/api/push/subscribe`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify(sub.toJSON()),
        });
      } catch { /* ignore */ }
    }

    subscribePush();

    // Handle navigate messages from SW notification clicks
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "navigate" && e.data?.url) navigate(e.data.url);
    };
    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, [token]);


  // ── App Install Banner ────────────────────────────────────────────────────────
  const [showInstallBanner, setShowInstallBanner] = useState(false);

  useEffect(() => {
    async function checkInstalled() {
      // PWA نصب‌شده (home screen / standalone)
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;

      // APK از طریق TWA (Trusted Web Activity)
      const isTWA = document.referrer.startsWith("android-app://");

      // اپ نیتیو با User-Agent سفارشی (APK مستقل)
      const isNativeApp = navigator.userAgent.includes("ShivaferAcademy") || (window as any).isNativeApp === true;

      // بررسی اپ نصب‌شده مرتبط (Chrome 73+)
      let hasRelatedApp = false;
      try {
        const related = await (navigator as any).getInstalledRelatedApps?.();
        hasRelatedApp = Array.isArray(related) && related.length > 0;
      } catch { /* not supported */ }

      if (!isStandalone && !isTWA && !isNativeApp && !hasRelatedApp) {
        setShowInstallBanner(true);
      }
    }
    checkInstalled();
  }, []);

  function dismissInstallBanner() {
    setShowInstallBanner(false);
  }

  function handleDownloadBanner() {
    setShowInstallBanner(false);
    navigate("/download");
  }

  const isReels = location === "/reels" || location.startsWith("/reels/");
  const isLeaderboard = location === "/leaderboard";
  const isAiChat = location.startsWith("/ai-chat");
  const isChannel = location === "/channel";
  const isAdvisor = location === "/advisor";
  const isAssistant = location === "/assistant";
  const isChannelOwner = isChannel && user?.phone === "09354505225";
  const hideHeader = isReels || isLeaderboard || isPlayerOpen || isAiChat || isChannel || isAdvisor || isAssistant;
  const hideNav = isLeaderboard || isPlayerOpen || isAiChat || isAdvisor || isAssistant;

  useEffect(() => {
    const bg = (isReels || isLeaderboard) ? "black" : "";
    document.body.style.backgroundColor = bg;
    document.documentElement.style.backgroundColor = bg;
    return () => {
      document.body.style.backgroundColor = "";
      document.documentElement.style.backgroundColor = "";
    };
  }, [isReels, isLeaderboard]);

  const coursesTab = { path: "/products", label: "محصولات", icon: ShoppingBag };

  const navItems = [
    { path: "/profile", label: "پروفایل", icon: User },
    { path: "/reels", label: "ریلز", icon: Film },
    { path: "/channel", label: "کانال", icon: Megaphone },
    { path: "/tribe", label: "قبیله", icon: Crown },
    coursesTab,
  ];

  return (
    <div className="mx-auto w-full max-w-[430px] h-full shadow-2xl flex flex-col relative" style={{ background: "var(--app-body-bg)" }}>
      {/* ── App Install Banner ── */}
      {showInstallBanner && !hideHeader && (
        <div
          dir="rtl"
          className="fixed z-[46] w-full max-w-[430px] left-1/2 -translate-x-1/2 flex items-center gap-2 px-3"
          style={{
            top: 0,
            height: 48,
            background: "var(--install-banner-bg)",
            borderBottom: "1px solid rgba(200,140,0,0.18)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.25)",
          }}
        >
          {/* دکمه بستن — سمت راست در RTL */}
          <button
            onClick={dismissInstallBanner}
            style={{
              background: "var(--glass-item-bg-inactive)",
              border: "1px solid var(--glass-separator)",
              borderRadius: 6,
              color: "var(--install-banner-close)",
              cursor: "pointer",
              fontSize: 16,
              width: 26,
              height: 26,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            ×
          </button>

          {/* متن — وسط، چسبیده به راست */}
          <p style={{
            flex: 1,
            fontSize: 12.5,
            color: "var(--install-banner-text)",
            margin: 0,
            textAlign: "right",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}>
            دانلود و نصب اپلیکیشن ShivafarAcademy
          </p>

          {/* دکمه دانلود — سمت چپ در RTL */}
          <button
            onClick={handleDownloadBanner}
            style={{
              background: "linear-gradient(135deg, #e8b800, #ca8a04)",
              color: "#000",
              border: "none",
              borderRadius: 8,
              padding: "5px 11px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
              flexShrink: 0,
              whiteSpace: "nowrap",
            }}
          >
            دانلود اپلیکیشن
          </button>
        </div>
      )}

      {!hideHeader && <Header topOffset={showInstallBanner ? 48 : 0} />}

      <main className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden w-full" style={{ paddingTop: hideHeader ? 0 : (showInstallBanner ? 120 : 72), paddingBottom: hideNav ? 0 : "calc(5rem + env(safe-area-inset-bottom))", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
        {children}
      </main>

      {/* Proactive chat bubble — طرح کارتی */}
      {chatbotEnabled && showBubble && token && (
        <>
          <style>{`
            @keyframes proactive-slide-up {
              0% { opacity: 0; transform: translateY(20px); }
              100% { opacity: 1; transform: translateY(0); }
            }
            .proactive-card { animation: proactive-slide-up 0.4s cubic-bezier(.2,.8,.4,1) forwards; }
          `}</style>
          <div
            className="proactive-card fixed z-42 select-none"
            style={{
              bottom: `calc(5.8rem + env(safe-area-inset-bottom) + 72px)`,
              right: `max(8px, calc(50% - 215px + 4px))`,
              width: "min(270px, calc(100vw - 16px))",
            }}
            dir="rtl"
            onClick={handleBubbleClick}
          >
            <div
              style={{
                background: "var(--proactive-bubble-bg)",
                border: "1px solid rgba(232,184,0,0.35)",
                borderRadius: 22,
                overflow: "hidden",
                boxShadow: "0 16px 48px rgba(0,0,0,0.7), 0 0 0 1px rgba(232,184,0,0.35), 0 0 30px rgba(232,184,0,0.35)",
                cursor: "pointer",
              }}
            >
              {/* accent bar */}
              <div style={{ height: 3, background: "linear-gradient(90deg, var(--gold-primary), #a87c10)" }} />

              <div style={{ padding: "14px 16px 14px" }}>
                {/* Agent row */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <img
                      src={proactiveData?.agentAvatarUrl ?? staticAssetUrl.supportAvatar()}
                      alt={proactiveData?.agentName ?? "پشتیبانی"}
                      style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(232,184,0,0.35)" }}
                      loading="eager"
                      fetchPriority="high"
                      decoding="async"
                    />
                    <span style={{ position: "absolute", bottom: 1, right: 1, width: 10, height: 10, background: "#22c55e", borderRadius: "50%", border: "2px solid #120b20", boxShadow: "0 0 6px rgba(34,197,94,0.9)" }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0, color: "var(--proactive-bubble-text)", fontSize: 13, fontWeight: 600, lineHeight: 1.3 }}>{proactiveData?.agentName ?? "پشتیبانی شیوافر"}</p>
                    <p style={{ margin: 0, fontSize: 10.5, color: "#22c55e", fontWeight: 500 }}>آنلاین • پاسخگوی سوالات شما</p>
                  </div>
                  <button
                    onClick={handleDismiss}
                    style={{ background: "var(--proactive-bubble-msg-bg)", border: "none", cursor: "pointer", color: "var(--glass-icon-inactive)", fontSize: 15, width: 26, height: 26, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
                  >×</button>
                </div>

                {/* Message */}
                <div style={{ background: "var(--proactive-bubble-msg-bg)", border: "1px solid var(--proactive-bubble-border)", borderRadius: 14, borderTopRightRadius: 4, padding: "10px 13px", marginBottom: 12 }}>
                  <p style={{ color: "var(--proactive-bubble-text)", fontSize: 13, lineHeight: 1.7, margin: 0 }}>
                    {proactiveData?.content}
                  </p>
                </div>

                {/* CTA */}
                <div style={{ background: "var(--gold-gradient)", borderRadius: 12, padding: "9px 14px", textAlign: "center" }}>
                  <span style={{ color: "#fff", fontSize: 15, fontWeight: 800, WebkitTextFillColor: "#fff" }}>بیا صحبت کنیم ←</span>
                </div>
              </div>
            </div>

            {/* Arrow pointing to FAB */}
            <div style={{ position: "absolute", bottom: -10, right: 28, width: 0, height: 0, borderLeft: "10px solid transparent", borderRight: "10px solid transparent", borderTop: "10px solid rgba(232,184,0,0.35)" }} />
            <div style={{ position: "absolute", bottom: -8, right: 29, width: 0, height: 0, borderLeft: "9px solid transparent", borderRight: "9px solid transparent", borderTop: "9px solid var(--proactive-bubble-bg)" }} />
          </div>
        </>
      )}

      {chatbotEnabled && !hideNav && !isReels && !location.startsWith("/ai-chat") && token && (
        <>
          <style>{`
            @keyframes widget-float {
              0%, 100% { transform: translateY(0px); }
              50% { transform: translateY(-5px); }
            }
            @keyframes widget-ring {
              0%, 90%, 100% { transform: scale(1); }
              93% { transform: scale(1.13); }
              96% { transform: scale(0.96); }
            }
            @keyframes widget-pulse-ring {
              0% { transform: scale(1); opacity: 0.7; }
              100% { transform: scale(1.7); opacity: 0; }
            }
            .widget-btn {
              animation: widget-float 3s ease-in-out infinite, widget-ring 5s ease-in-out infinite;
            }
            .widget-pulse {
              animation: widget-pulse-ring 2s ease-out infinite;
            }
          `}</style>
          <Link href="/ai-chat">
            <div
              className="fixed z-[55] cursor-pointer active:scale-90"
              style={{
                bottom: `calc(5.8rem + env(safe-area-inset-bottom) + ${extraBottom + (isChannelOwner ? 68 : 0) + (isReels ? 64 : 0)}px)`,
                right: "max(14px, calc(50% - 215px + 14px))",
                width: 52,
                height: 52,
                position: "fixed",
              }}
            >
              {/* pulse ring */}
              <span
                className="widget-pulse absolute inset-0 rounded-full"
                style={{ background: "rgba(232,184,0,0.35)" }}
              />
              <div
                className="widget-btn w-full h-full rounded-full flex items-center justify-center relative"
                style={{
                  background: "var(--gold-gradient)",
                  boxShadow: "0 4px 22px rgba(232,184,0,0.35), inset 0 1px 0 rgba(255,255,255,0.25)",
                }}
              >
                {/* headset SVG icon */}
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none">
                  {/* head arc */}
                  <path d="M5 10a7 7 0 0 1 14 0" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" fill="none"/>
                  {/* left ear cup */}
                  <rect x="3" y="10" width="3.5" height="5.5" rx="1.5" fill="currentColor"/>
                  {/* right ear cup */}
                  <rect x="17.5" y="10" width="3.5" height="5.5" rx="1.5" fill="currentColor"/>
                  {/* mic boom */}
                  <path d="M6.5 15.5 Q6.5 19 10 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" fill="none"/>
                  {/* mic dot */}
                  <circle cx="10.5" cy="19" r="1.1" fill="currentColor"/>
                </svg>
                {/* online dot */}
                <span
                  className="absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border-2"
                  style={{
                    background: "#22c55e",
                    borderColor: "var(--advisor-online-border)",
                    boxShadow: "0 0 6px rgba(34,197,94,0.8)",
                  }}
                />
              </div>
            </div>
          </Link>
        </>
      )}

      {/* Preload Sara avatar so advisor page loads instantly */}
      <img src={staticAssetUrl.saraAvatar()} alt="" aria-hidden loading="eager" fetchPriority="high" style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }} />

      <nav
        data-overlay-hide
        className="glass-nav fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] border-t flex flex-col justify-start px-2 z-50"
        style={{ height: "calc(5rem + env(safe-area-inset-bottom))", display: hideNav ? "none" : "flex" }}
      >
        <div className="flex items-center justify-around w-full" style={{ height: "5rem" }}>
        {navItems.map((item) => {
          const isActive = location === item.path || location.startsWith(item.path + "/");
          const isTribe = item.path === "/tribe";
          const isReelNav = item.path === "/reels";
          const isChannelNav = item.path === "/channel";
          const badgeCount = isTribe ? commissionBadge : isReelNav ? reelBadge : isChannelNav ? channelBadge : 0;
          const showBadge = badgeCount > 0;
          return (
            <Link
              key={item.path}
              href={item.path}
              onClick={isTribe ? clearCommissionBadge : undefined}
              className="flex flex-col items-center justify-center gap-1 w-16 h-full transition-all active:scale-90"
              data-testid={`nav-${item.path.replace("/", "") || "home"}`}
            >
              {/* Glass pill around active icon */}
              <div className="relative">
                <div
                  className="w-10 h-8 rounded-xl flex items-center justify-center transition-all"
                  style={isActive ? {
                    background: "var(--nav-active-pill-bg)",
                    border: "1px solid var(--nav-active-pill-border)",
                    boxShadow: "var(--nav-active-pill-shadow)",
                  } : {}}
                >
                  <item.icon
                    className="w-5 h-5"
                    style={{ color: isActive ? "var(--nav-icon-active)" : "var(--nav-icon-inactive)" }}
                  />
                </div>
                {showBadge && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full flex items-center justify-center text-[9px] font-black"
                    style={{ background: "#ef4444", color: "#fff", lineHeight: 1, boxShadow: "0 0 6px rgba(239,68,68,0.7)" }}>
                    {badgeCount > 99 ? "۹۹+" : badgeCount > 9 ? "+" + badgeCount : badgeCount.toLocaleString("fa")}
                  </span>
                )}
              </div>
              <span
                className="text-[10px] font-semibold"
                style={{ color: isActive ? "var(--nav-label-active)" : "var(--nav-label-inactive)" }}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
        </div>
      </nav>
    </div>
  );
}
