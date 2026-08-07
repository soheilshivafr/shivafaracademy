import { staticAssetUrl } from "@/lib/static-assets";
import { useState, useEffect } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { useLocation } from "wouter";
import { useAuth } from "@/lib/auth";
import { useVoiceCall } from "@/lib/voice-call-context";
import { Phone, PhoneOff, ChevronRight, Mic, MicOff, Clock, MessageCircle } from "lucide-react";

/* ── Persian-friendly "time remaining" helpers ─────────────────────────────── */
function faDigits(s: string): string {
  return s.replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[Number(d)]);
}
function formatRemain(ms: number): string {
  const totalMin = Math.max(1, Math.ceil(ms / 60000));
  const days = Math.floor(totalMin / (60 * 24));
  const hours = Math.floor((totalMin % (60 * 24)) / 60);
  const mins = totalMin % 60;
  if (days > 0) return hours > 0 ? `${faDigits(String(days))} روز و ${faDigits(String(hours))} ساعت` : `${faDigits(String(days))} روز`;
  if (hours > 0) return mins > 0 ? `${faDigits(String(hours))} ساعت و ${faDigits(String(mins))} دقیقه` : `${faDigits(String(hours))} ساعت`;
  return `${faDigits(String(mins))} دقیقه`;
}

/* Live countdown to the next allowed call. */
function NextCallCountdown({ iso }: { iso: string }) {
  const [ms, setMs] = useState(() => new Date(iso).getTime() - Date.now());
  useEffect(() => {
    const id = setInterval(() => setMs(new Date(iso).getTime() - Date.now()), 30000);
    return () => clearInterval(id);
  }, [iso]);
  if (ms <= 0) return <span style={{ color: "#86efac" }}>الان می‌تونی دوباره تماس بگیری</span>;
  return <span><span style={{ color: "#c4b5fd", fontWeight: 800 }}>{formatRemain(ms)}</span> دیگه</span>;
}

/* ── Wave bars animation ────────────────────────────────────────────────── */
function WaveBars({ active, color = "#a78bfa" }: { active: boolean; color?: string }) {
  if (!active) return <div style={{ height: 28 }} />;
  return (
    <div className="flex items-end gap-1" style={{ height: 28 }}>
      {[0, 0.1, 0.2, 0.3, 0.2, 0.1, 0].map((delay, i) => (
        <div
          key={i}
          style={{
            width: 4, borderRadius: 2, background: color,
            animation: `wave-bar 0.8s ease-in-out ${delay}s infinite`,
            height: 6,
          }}
        />
      ))}
    </div>
  );
}

/* ── Main component ─────────────────────────────────────────────────────── */
export default function AdvisorPage() {
  const [, navigate] = useLocation();
  const { user } = useAuth();

  const {
    phoneState, talkState, liveText, lastAiText, errorMsg, vadStatus,
    ctaUrl, ctaLabel, isMuted, timer, waitNudge,
    confirmPrompt, confirmDone, confirmContinue,
    gateBlocked, nextCallInfo,
    startCall, endCall, toggleMute,
  } = useVoiceCall();

  // Pre-call tips carousel — local UI only
  const [showTips, setShowTips] = useState(false);
  const [tipStep,  setTipStep]  = useState(0);

  /* ── computed ─────────────────────────────────────────────────────────── */
  const isAI         = talkState === "ai_speaking";
  const isUser       = talkState === "user_speaking";
  const isSending    = talkState === "sending";
  const isListen     = talkState === "listening";
  const isConfirming = talkState === "confirming";

  const waitMsg = user?.name ? `${user.name.split(" ")[0]} جان لطفاً کمی صبر کن` : "لطفاً کمی صبر کن";
  const statusText = phoneState === "dialing" ? "در حال برقراری ارتباط..." :
                     isAI         ? "سارا در حال صحبت..." :
                     isUser       ? "در حال گوش دادن..." :
                     isConfirming ? "منتظر تأییدت هستم..." :
                     isSending    ? `در حال پردازش...` :
                     isListen     ? "گوش می‌دم..." : "";

  const glowColor = isAI ? "rgba(99,102,241,0.35)" : isUser ? "rgba(34,197,94,0.3)" : "rgba(99,102,241,0.18)";
  const ringColor = isAI ? "#6366f1" : isUser ? "#22c55e" : "#6366f1";

  // Navigating away keeps the call alive — a floating banner lets the user return.
  const handleCtaClick = () => {
    if (ctaUrl.startsWith("/")) { navigate(ctaUrl); }
    else { window.open(ctaUrl, "_blank", "noopener"); }
  };

  /* ── render ───────────────────────────────────────────────────────────── */
  return (
    <div
      dir="rtl"
      className="flex flex-col"
      style={{ minHeight: "100dvh", background: "var(--advisor-bg)", fontFamily: "var(--app-font-sans)" }}
    >
      <style>{`
        @keyframes wave-bar { 0%,100%{height:6px} 50%{height:22px} }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:.55} 100%{transform:scale(1.85);opacity:0} }
        @keyframes spin-ring  { to{transform:rotate(360deg)} }
        @keyframes dots-blink { 0%,80%,100%{opacity:.3} 40%{opacity:1} }
        @keyframes nudge-in { 0%{opacity:0;transform:translateY(-12px) scale(.95)} 60%{transform:translateY(2px) scale(1.01)} 100%{opacity:1;transform:translateY(0) scale(1)} }
        .nudge-bubble{animation:nudge-in .32s cubic-bezier(.2,.8,.4,1) both}
        .dot-anim:nth-child(1){animation-delay:0s}
        .dot-anim:nth-child(2){animation-delay:.15s}
        .dot-anim:nth-child(3){animation-delay:.3s}
      `}</style>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4"
        style={{ paddingTop: "max(env(safe-area-inset-top), 16px)", paddingBottom: 10 }}
      >
        <button
          onClick={() => navigate("/profile")}
          className="w-9 h-9 rounded-xl flex items-center justify-center"
          style={{ background: "var(--advisor-btn-back-bg)", border: "1px solid var(--advisor-btn-back-border)" }}
        >
          <ChevronRight className="w-5 h-5" style={{ color: "var(--advisor-btn-back-color)" }} />
        </button>

        {phoneState === "connected" && (
          <span className="text-sm font-bold tabular-nums" style={{ color: "#a78bfa" }}>{timer}</span>
        )}

        {(phoneState === "idle" || phoneState === "ended") && (
          <span className="text-sm font-bold" style={{ color: "var(--advisor-title-color)" }}>
            {phoneState === "ended" ? "تماس پایان یافت" : "مشاور سارا"}
          </span>
        )}
      </div>

      {/* ── Ambient glow ──────────────────────────────────────────────────── */}
      <div className="pointer-events-none fixed inset-0 z-0 transition-all duration-700">
        <div style={{ position: "absolute", top: "5%", right: "10%", width: 320, height: 320, borderRadius: "50%", background: `radial-gradient(circle, ${glowColor} 0%, transparent 70%)`, transition: "background 0.7s" }} />
        <div style={{ position: "absolute", bottom: "20%", left: "5%", width: 180, height: 180, borderRadius: "50%", background: "radial-gradient(circle, var(--advisor-glow-secondary) 0%, transparent 70%)" }} />
      </div>

      {/* ── "Please wait" nudge (user talked over Sara; she keeps speaking) ── */}
      {phoneState === "connected" && waitNudge && (
        <div
          className="fixed left-0 right-0 z-40 flex justify-center px-6 pointer-events-none"
          style={{ top: "calc(env(safe-area-inset-top) + 60px)" }}
        >
          <div
            key={waitNudge}
            className="nudge-bubble flex items-start gap-2.5 rounded-2xl px-4 py-3"
            style={{
              maxWidth: 340,
              background: "linear-gradient(135deg, rgba(99,102,241,0.96), rgba(139,92,246,0.96))",
              boxShadow: "0 10px 36px rgba(99,102,241,0.45)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <span style={{ fontSize: 18, lineHeight: "1.6rem" }}>🤚</span>
            <p className="text-sm font-semibold leading-7" style={{ color: "white" }}>
              {waitNudge}
            </p>
          </div>
        </div>
      )}

      {/* ── End-of-turn confirmation («صحبتت تمام شد؟» + بله/خیر) ──────────── */}
      {phoneState === "connected" && confirmPrompt && (
        <div
          className="fixed left-0 right-0 z-40 flex justify-center px-6"
          style={{ top: "calc(env(safe-area-inset-top) + 60px)" }}
        >
          <div
            key={confirmPrompt}
            className="nudge-bubble flex flex-col items-center gap-3 rounded-2xl px-5 py-4"
            style={{
              maxWidth: 340,
              background: "linear-gradient(135deg, rgba(16,185,129,0.97), rgba(5,150,105,0.97))",
              boxShadow: "0 10px 36px rgba(16,185,129,0.45)",
              border: "1px solid rgba(255,255,255,0.18)",
            }}
          >
            <p className="text-sm font-semibold leading-7 text-center" style={{ color: "white" }}>
              {confirmPrompt}
            </p>
            <div className="flex items-center gap-2.5">
              <button
                onClick={confirmDone}
                className="rounded-xl px-5 py-2 text-sm font-bold"
                style={{ background: "white", color: "#059669", minWidth: 92 }}
              >
                بله، بفرست
              </button>
              <button
                onClick={confirmContinue}
                className="rounded-xl px-5 py-2 text-sm font-bold"
                style={{ background: "rgba(255,255,255,0.18)", color: "white", border: "1px solid rgba(255,255,255,0.35)", minWidth: 92 }}
              >
                خیر، ادامه داره
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── BLOCKED screen (cooldown / weekly cap reached) ────────────────── */}
      {phoneState === "idle" && gateBlocked && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-7">
          <div className="relative">
            <div style={{ width: 100, height: 100, borderRadius: "50%", boxShadow: "0 0 0 3px rgba(245,158,11,0.5), 0 0 40px rgba(245,158,11,0.18)", overflow: "hidden", opacity: 0.92 }}>
              <CachedImage src={staticAssetUrl.saraAvatar()} alt="سارا" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="eager" fetchPriority="high" />
            </div>
            <span style={{ position: "absolute", bottom: 4, right: 4, width: 30, height: 30, background: "#f59e0b", borderRadius: "50%", border: "3px solid var(--advisor-online-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Clock className="w-4 h-4 text-white" />
            </span>
          </div>

          <div className="text-center space-y-1">
            <h2 className="text-xl font-black" style={{ color: "var(--color-foreground)" }}>سارا</h2>
            <p className="text-sm text-muted-foreground">مشاور کسب‌وکار اینترنتی</p>
          </div>

          <div
            className="w-full rounded-2xl px-5 py-5 text-right"
            style={{ background: "linear-gradient(135deg, rgba(245,158,11,0.10) 0%, rgba(249,115,22,0.06) 100%)", border: "1px solid rgba(245,158,11,0.25)" }}
          >
            <p className="leading-8 text-sm" style={{ color: "var(--color-foreground)", lineHeight: "2rem" }}>
              {gateBlocked.message}
            </p>
            {gateBlocked.nextCallAllowedAt && (
              <div className="mt-4 pt-3 flex items-center gap-2" style={{ borderTop: "1px solid rgba(245,158,11,0.18)" }}>
                <Clock className="w-4 h-4" style={{ color: "#fbbf24" }} />
                <span className="text-sm" style={{ color: "var(--color-muted-foreground)" }}>
                  تماس بعدی: <NextCallCountdown iso={gateBlocked.nextCallAllowedAt} />
                </span>
              </div>
            )}
          </div>

          <button
            onClick={() => navigate("/ai-chat")}
            className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", boxShadow: "0 4px 24px rgba(99,102,241,0.35)" }}
          >
            <MessageCircle className="w-5 h-5" />
            همین حالا توی چت بپرس
          </button>
        </div>
      )}

      {/* ── IDLE screen ───────────────────────────────────────────────────── */}
      {phoneState === "idle" && !gateBlocked && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-8">
          {/* Avatar */}
          <div className="relative">
            <div style={{ width: 110, height: 110, borderRadius: "50%", boxShadow: "0 0 0 3px rgba(99,102,241,0.6), 0 0 50px rgba(99,102,241,0.25)", overflow: "hidden" }}>
              <CachedImage src={staticAssetUrl.saraAvatar()} alt="سارا" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="eager" fetchPriority="high" />
            </div>
            <span style={{ position: "absolute", bottom: 6, right: 6, width: 16, height: 16, background: "#22c55e", borderRadius: "50%", border: "3px solid var(--advisor-online-border)", boxShadow: "0 0 10px rgba(34,197,94,0.8)" }} />
          </div>

          <div className="text-center space-y-2">
            <h2 className="text-2xl font-black text-foreground">سارا</h2>
            <p className="text-sm text-muted-foreground">مشاور کسب‌وکار اینترنتی</p>
          </div>

          {/* Description card */}
          <div
            className="w-full rounded-2xl px-5 py-5 text-right"
            style={{
              background: "linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(139,92,246,0.09) 100%)",
              border: "1px solid rgba(139,92,246,0.30)",
              boxShadow: "0 8px 32px rgba(99,102,241,0.08)",
            }}
          >
            {/* Decorative top line */}
            <div className="flex items-center gap-2 mb-3">
              <span style={{ fontSize: 16, color: "#7c3aed" }}>✦</span>
              <span className="text-xs font-bold tracking-widest" style={{ color: "color-mix(in srgb, #7c3aed 85%, var(--color-foreground))", letterSpacing: "0.12em" }}>مشاور هوشمند آکادمی شیوافر</span>
            </div>

            <p
              className="leading-8 text-base"
              style={{ color: "color-mix(in srgb, var(--color-foreground) 82%, transparent)", lineHeight: "2rem" }}
            >
              اگه دوست داری درباره{" "}
              <span style={{ color: "color-mix(in srgb, #7c3aed 80%, var(--color-foreground))", fontWeight: 700 }}>کسب درآمد اینترنتی</span>،{" "}
              <span style={{ color: "color-mix(in srgb, #7c3aed 80%, var(--color-foreground))", fontWeight: 700 }}>راه‌اندازی یا توسعه کسب‌وکارت</span>،{" "}
              <span style={{ color: "color-mix(in srgb, #7c3aed 80%, var(--color-foreground))", fontWeight: 700 }}>افزایش فروش</span>،{" "}
              <span style={{ color: "color-mix(in srgb, #7c3aed 80%, var(--color-foreground))", fontWeight: 700 }}>رشد در فضای آنلاین</span>{" "}
              یا{" "}
              <span style={{ color: "color-mix(in srgb, #7c3aed 80%, var(--color-foreground))", fontWeight: 700 }}>دوره‌ها و خدمات آکادمی شیوافر</span>{" "}
              راهنمایی بگیری، می‌تونی با سارا صحبت کنی.
            </p>

            <div
              className="mt-4 pt-3 flex items-start gap-2"
              style={{ borderTop: "1px solid rgba(139,92,246,0.22)" }}
            >
              <span style={{ color: "#16a34a", fontSize: 13, marginTop: 1 }}>●</span>
              <p className="text-sm leading-6 text-muted-foreground">
                سارا شرایطت رو بررسی می‌کنه، به سوالاتت جواب میده و کمکت می‌کنه بهترین مسیر رو برای خودت پیدا کنی.
              </p>
            </div>
          </div>

          <button
            onClick={() => {
              let seen = false;
              try { seen = localStorage.getItem("sara_tips_seen_v2") === "1"; } catch { /* ignore */ }
              if (seen) {
                startCall();
              } else {
                // Mark seen the moment we actually show the guide (not inside
                // startCall) so re-calls / direct calls can't silently consume it.
                try { localStorage.setItem("sara_tips_seen_v2", "1"); } catch { /* ignore */ }
                setTipStep(0);
                setShowTips(true);
              }
            }}
            className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 active:scale-95 transition-transform"
            style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 24px rgba(34,197,94,0.35)", color: "white" }}
          >
            <Phone className="w-5 h-5" />
            تماس با سارا
          </button>
        </div>
      )}

      {/* ── TIPS carousel overlay ─────────────────────────────────────────── */}
      {showTips && phoneState === "idle" && (() => {
        const TIPS = [
          {
            emoji: "🎧",
            title: "هندزفری یا ایرپاد استفاده کن",
            body: "بهترین کیفیت صدا رو با هندزفری تجربه می‌کنی. صدای سارا واضح‌تر میاد و سارا هم صدات رو بهتر می‌شنوه.",
            accent: "#a78bfa",
          },
          {
            emoji: "🔇",
            title: "یه جای آروم باش",
            body: "تلویزیون، موسیقی یا صحبت کسی در کنارت می‌تونه اختلال ایجاد کنه. چند دقیقه محیطت رو آروم کن.",
            accent: "#60a5fa",
          },
          {
            emoji: "⏸️",
            title: "صبر کن سارا حرفش تموم بشه",
            body: "وقتی سارا داره صحبت می‌کنه، صبر کن تمام کنه — بعد جواب بده. قطع کردن حرفش باعث سردرگمی میشه.",
            accent: "#f472b6",
          },
          {
            emoji: "🗣️",
            title: "بعد از هر جمله مکث کن",
            body: "سارا ۱.۶ ثانیه سکوت رو نشانه پایان صحبت تو می‌دونه. کمی مکث کن تا صحبتت پردازش بشه.",
            accent: "#34d399",
          },
          {
            emoji: "📶",
            title: "اینترنت پایدار داشته باش",
            body: "سارا به اتصال مستمر نیاز داره. وای‌فای یا اینترنت خوب داشته باش تا مکالمه بدون وقفه پیش بره.",
            accent: "#fbbf24",
          },
        ];
        const tip = TIPS[tipStep];
        const isLast = tipStep === TIPS.length - 1;
        return (
          <div
            className="fixed inset-0 z-50 flex flex-col"
            style={{ background: "#08060a" }}
          >
            <style>{`
              @keyframes tip-in { from { opacity:0; transform:translateX(32px); } to { opacity:1; transform:translateX(0); } }
              .tip-slide { animation: tip-in 0.32s cubic-bezier(.2,.8,.4,1) forwards; }
            `}</style>

            {/* Header: title + skip */}
            <div className="flex items-center justify-between px-5 pt-6 pb-2">
              <button
                onClick={() => setShowTips(false)}
                className="text-sm font-bold px-4 py-2 rounded-xl active:scale-95 transition-transform"
                style={{ color: "#f87171", background: "rgba(248,113,113,0.12)", border: "1.5px solid rgba(248,113,113,0.28)" }}
              >
                رد کردن
              </button>
              <span className="text-sm font-bold" style={{ color: "rgba(255,255,255,0.45)" }}>
                قبل از تماس بخوان
              </span>
            </div>

            {/* Tip card */}
            <div key={tipStep} className="tip-slide flex-1 flex flex-col items-center justify-center px-7 gap-7">
              {/* Big emoji */}
              <div
                className="flex items-center justify-center rounded-3xl"
                style={{ width: 100, height: 100, fontSize: 52, background: `${tip.accent}18`, border: `2px solid ${tip.accent}30` }}
              >
                {tip.emoji}
              </div>

              {/* Text */}
              <div className="text-center space-y-3 w-full">
                <h3 className="text-xl font-black text-white leading-8">{tip.title}</h3>
                <p className="text-sm leading-8" style={{ color: "rgba(255,255,255,0.62)", lineHeight: "1.9rem" }}>
                  {tip.body}
                </p>
              </div>

              {/* Step counter */}
              <p className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>
                {tipStep + 1} از {TIPS.length}
              </p>
            </div>

            {/* Dots + button */}
            <div className="px-6 pb-10 flex flex-col items-center gap-5">
              {/* Dot indicators */}
              <div className="flex gap-2">
                {TIPS.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setTipStep(i)}
                    style={{
                      width: i === tipStep ? 22 : 7,
                      height: 7,
                      borderRadius: 4,
                      background: i === tipStep ? tip.accent : "rgba(255,255,255,0.18)",
                      transition: "all 0.3s ease",
                      border: "none",
                      padding: 0,
                    }}
                  />
                ))}
              </div>

              {/* Action button */}
              {isLast ? (
                <button
                  onClick={() => { setShowTips(false); startCall(); }}
                  className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-3 active:scale-95 transition-transform"
                  style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", boxShadow: "0 4px 24px rgba(34,197,94,0.35)", color: "white" }}
                >
                  <Phone className="w-5 h-5" />
                  شروع تماس
                </button>
              ) : (
                <button
                  onClick={() => setTipStep(s => s + 1)}
                  className="w-full py-4 rounded-2xl font-bold text-base active:scale-95 transition-transform"
                  style={{ background: `${tip.accent}22`, border: `1.5px solid ${tip.accent}55`, color: tip.accent }}
                >
                  نکته بعدی ←
                </button>
              )}
            </div>
          </div>
        );
      })()}

      {/* ── DIALING / CONNECTED screen ────────────────────────────────────── */}
      {(phoneState === "dialing" || phoneState === "connected") && (
        <div className="relative z-10 flex-1 flex flex-col px-6 pb-10 pt-2" style={{ gap: 0 }}>

          {/* ── TOP: Avatar + name + wave + status ── */}
          <div className="flex flex-col items-center gap-4 pt-2">
            {/* Avatar + pulse rings */}
            <div className="relative flex items-center justify-center" style={{ width: 150, height: 150 }}>
              {(phoneState === "dialing" || isAI) && <>
                <span className="absolute inset-0 rounded-full" style={{ background: `${ringColor}22`, animation: "pulse-ring 2s ease-out infinite" }} />
                <span className="absolute inset-0 rounded-full" style={{ background: `${ringColor}18`, animation: "pulse-ring 2s ease-out 0.6s infinite" }} />
                <span className="absolute inset-0 rounded-full" style={{ background: `${ringColor}12`, animation: "pulse-ring 2s ease-out 1.2s infinite" }} />
              </>}
              {isUser && <>
                <span className="absolute inset-0 rounded-full" style={{ background: "rgba(34,197,94,0.22)", animation: "pulse-ring 1s ease-out infinite" }} />
                <span className="absolute inset-0 rounded-full" style={{ background: "rgba(34,197,94,0.14)", animation: "pulse-ring 1s ease-out 0.3s infinite" }} />
              </>}
              <div
                style={{
                  width: 110, height: 110, borderRadius: "50%",
                  boxShadow: isUser
                    ? "0 0 0 3px rgba(34,197,94,0.7), 0 0 40px rgba(34,197,94,0.3)"
                    : "0 0 0 3px rgba(99,102,241,0.7), 0 0 50px rgba(99,102,241,0.35)",
                  overflow: "hidden",
                  transition: "all 0.4s ease",
                  flexShrink: 0,
                }}
              >
                <CachedImage src={staticAssetUrl.saraAvatar()} alt="سارا" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} loading="eager" fetchPriority="high" />
              </div>
            </div>

            {/* Name + subtitle */}
            <div className="text-center space-y-1">
              <h2 className="text-xl font-black text-white">سارا</h2>
              <p className="text-sm" style={{ color: "var(--advisor-connected-subtitle)" }}>مشاور کسب‌وکار اینترنتی</p>
            </div>

            {/* Wave bars */}
            <WaveBars active={isAI || isUser} color={isUser ? "#22c55e" : "#a78bfa"} />

            {/* Status */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-2 min-h-[24px]">
                {phoneState === "dialing" && (
                  <div className="flex gap-1.5">
                    {[0,1,2].map(i => (
                      <span key={i} className="dot-anim w-2 h-2 rounded-full" style={{ background: "#a78bfa", animation: `dots-blink 1.2s ease-in-out ${i * 0.15}s infinite` }} />
                    ))}
                  </div>
                )}
                {isSending && (
                  <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
                )}
                <p className="text-base font-semibold" style={{ color: isSending ? "#fbbf24" : "var(--advisor-connected-status)" }}>
                  {statusText}
                </p>
              </div>
              {isSending && (
                <p className="text-sm font-medium" style={{ color: "var(--advisor-connected-sending-wait)" }}>
                  {waitMsg}
                </p>
              )}

              {/* VAD status badge */}
              {phoneState === "connected" && vadStatus !== "idle" && (
                <div className="flex items-center gap-1.5 px-3 py-1 rounded-full" style={{
                  background: vadStatus === "locked"
                    ? "rgba(34,197,94,0.22)"
                    : "rgba(250,204,21,0.22)",
                  border: `1px solid ${vadStatus === "locked" ? "rgba(34,197,94,0.45)" : "rgba(250,204,21,0.45)"}`,
                }}>
                  <span style={{
                    width: 6, height: 6, borderRadius: "50%",
                    background: vadStatus === "locked" ? "#16a34a" : "#ca8a04",
                    animation: vadStatus === "locked" ? "none" : "dots-blink 1s ease-in-out infinite",
                  }} />
                  <span className="text-xs font-semibold" style={{
                    color: vadStatus === "locked" ? "#15803d" : "#a16207",
                  }}>
                    {vadStatus === "calibrating" && "تنظیم محیط..."}
                    {vadStatus === "fingerprinting" && "منتظر صدای شما..."}
                    {vadStatus === "locked" && "صدای شما ثبت شد"}
                  </span>
                </div>
              )}
            </div>

            {/* Error */}
            {errorMsg && (
              <div className="w-full px-4 py-2.5 rounded-xl text-sm text-center" style={{ background: "rgba(239,68,68,0.12)", border: "1px solid rgba(239,68,68,0.25)", color: "#fca5a5" }}>
                {errorMsg}
              </div>
            )}
          </div>

          {/* ── BOTTOM: Transcript + End call ── */}
          <div className="flex flex-col items-center justify-end flex-1 gap-6">
            {/* Live + last transcript */}
            {phoneState === "connected" && (liveText || lastAiText) && (
              <div className="w-full rounded-2xl px-5 py-4" style={{ background: "var(--advisor-connected-transcript-bg)", border: "1px solid var(--advisor-connected-transcript-border)" }}>
                <div className="flex flex-col justify-end overflow-hidden" style={{ height: "4rem" }}>
                  <p className="text-base text-center leading-8" style={{ color: "var(--advisor-connected-transcript-text)" }}>
                    {liveText || lastAiText}
                    {liveText && <span className="inline-block w-1 h-4 bg-violet-400/70 mr-1 animate-pulse rounded-sm" />}
                  </p>
                </div>
              </div>
            )}

            {/* MTP registration CTA → opens the in-app MTP course page (keeps the call alive) */}
            {ctaUrl && (
              <button
                type="button"
                onClick={handleCtaClick}
                className="w-full py-4 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 active:scale-95 transition-transform"
                style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", boxShadow: "0 4px 24px rgba(99,102,241,0.4)" }}
              >
                <span style={{ fontSize: 18 }}>✦</span>
                {ctaLabel}
              </button>
            )}

            {/* Call controls: mute + end call */}
            <div className="flex items-center justify-center gap-6">
              {phoneState === "connected" && (
                <div className="flex flex-col items-center gap-1.5">
                  <button
                    onClick={toggleMute}
                    aria-label={isMuted ? "روشن کردن میکروفون" : "بی‌صدا کردن میکروفون"}
                    className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                    style={isMuted
                      ? { background: "linear-gradient(135deg, #c89c1a, #e8b800)", boxShadow: "0 4px 20px rgba(245,158,11,0.5)" }
                      : { background: "var(--advisor-connected-mute-bg)", border: "1px solid var(--advisor-connected-mute-border)" }}
                  >
                    {isMuted
                      ? <MicOff className="w-7 h-7 text-white" />
                      : <Mic className="w-7 h-7" style={{ color: "var(--advisor-connected-mute-icon)" }} />}
                  </button>
                  <span className="text-xs" style={{ color: isMuted ? "rgba(245,158,11,0.9)" : "var(--advisor-connected-label)" }}>
                    {isMuted ? "میکروفون خاموش" : "بی‌صدا"}
                  </span>
                </div>
              )}

              {/* End call button */}
              <div className="flex flex-col items-center gap-1.5">
                <button
                  onClick={endCall}
                  className="w-16 h-16 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                  style={{ background: "linear-gradient(135deg, #dc2626, #ef4444)", boxShadow: "0 4px 20px rgba(220,38,38,0.5)" }}
                >
                  <PhoneOff className="w-7 h-7 text-white" />
                </button>
                {phoneState === "connected" && (
                  <span className="text-xs" style={{ color: "var(--advisor-connected-label)" }}>پایان</span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ENDED screen ──────────────────────────────────────────────────── */}
      {phoneState === "ended" && (
        <div className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 gap-8">
          <div style={{ width: 90, height: 90, borderRadius: "50%", background: "var(--advisor-ended-circle-bg)", border: "1px solid var(--advisor-ended-circle-border)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <PhoneOff className="w-9 h-9" style={{ color: "var(--advisor-ended-icon)" }} />
          </div>
          <p className="text-sm" style={{ color: "var(--advisor-ended-text)" }}>تماس پایان یافت</p>

          {/* Next-call cooldown notice */}
          {nextCallInfo && (
            <div
              className="w-full rounded-2xl px-5 py-4 text-center"
              style={{ background: "var(--advisor-cooldown-bg)", border: "1px solid var(--advisor-cooldown-border)" }}
            >
              <div className="flex items-center justify-center gap-2">
                <Clock className="w-4 h-4" style={{ color: "#fbbf24" }} />
                <span className="text-sm" style={{ color: "var(--advisor-cooldown-text)" }}>
                  {nextCallInfo.nextCallAllowedAt
                    ? <>تماس بعدی: <NextCallCountdown iso={nextCallInfo.nextCallAllowedAt} /></>
                    : "ممنون از تماست 💜"}
                </span>
              </div>
            </div>
          )}

          {ctaUrl && (
            <button
              type="button"
              onClick={handleCtaClick}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", boxShadow: "0 4px 20px rgba(99,102,241,0.4)" }}
            >
              <span style={{ fontSize: 16 }}>✦</span>
              {ctaLabel}
            </button>
          )}

          {nextCallInfo ? (
            <button
              onClick={() => navigate("/ai-chat")}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "white", boxShadow: "0 4px 20px rgba(99,102,241,0.35)" }}
            >
              <MessageCircle className="w-4 h-4" />
              ادامه در چت
            </button>
          ) : (
            <button
              onClick={startCall}
              className="flex items-center gap-2.5 px-6 py-3.5 rounded-2xl font-bold text-sm active:scale-95 transition-transform"
              style={{ background: "linear-gradient(135deg, #22c55e, #16a34a)", color: "white", boxShadow: "0 4px 20px rgba(34,197,94,0.3)" }}
            >
              <Phone className="w-4 h-4" />
              تماس مجدد
            </button>
          )}
        </div>
      )}
    </div>
  );
}
