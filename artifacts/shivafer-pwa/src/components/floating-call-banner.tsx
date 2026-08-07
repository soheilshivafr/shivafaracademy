import { staticAssetUrl } from "@/lib/static-assets";
import { useLocation } from "wouter";
import { PhoneOff } from "lucide-react";
import { useVoiceCall } from "@/lib/voice-call-context";

/**
 * Thin persistent banner shown at the top while a Sara voice call is active and the
 * user has navigated away from the call screen. Tap the banner to return to the call;
 * tap the red button to hang up. Keeps the call alive across route changes.
 */
export function FloatingCallBanner() {
  const [location, navigate] = useLocation();
  const { isCallActive, phoneState, timer, talkState, endCall } = useVoiceCall();

  const onAdvisorPage = location === "/advisor" || location.startsWith("/advisor/");
  if (!isCallActive || onAdvisorPage) return null;

  const statusText =
    phoneState === "dialing"        ? "در حال برقراری ارتباط..." :
    talkState === "ai_speaking"     ? "سارا در حال صحبت..." :
    talkState === "user_speaking"   ? "در حال گوش دادن..." :
    talkState === "sending"         ? "در حال پردازش..." :
    "در حال مکالمه";

  return (
    <>
      <style>{`
        @keyframes call-banner-in { from { opacity: 0; transform: translate(-50%, -100%); } to { opacity: 1; transform: translate(-50%, 0); } }
        @keyframes call-dot-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.45; transform: scale(0.8); } }
        .call-banner { animation: call-banner-in 0.3s cubic-bezier(.2,.8,.4,1) forwards; }
      `}</style>
      <div
        dir="rtl"
        className="call-banner fixed z-[60] w-full max-w-[430px] left-1/2 flex items-center gap-2.5 px-3"
        style={{
          top: 0,
          paddingTop: "max(env(safe-area-inset-top), 8px)",
          paddingBottom: 8,
          background: "linear-gradient(135deg, #15321f 0%, #0c2417 100%)",
          borderBottom: "1px solid rgba(34,197,94,0.30)",
          boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
        }}
      >
        {/* Tap area → back to the full call screen */}
        <button
          onClick={() => navigate("/advisor")}
          className="flex items-center gap-2.5 flex-1 min-w-0 active:opacity-80"
          style={{ background: "transparent", border: "none", padding: "4px 0", cursor: "pointer", textAlign: "right" }}
          aria-label="بازگشت به تماس با سارا"
        >
          {/* Sara avatar + live dot */}
          <span style={{ position: "relative", flexShrink: 0 }}>
            <img
              src={staticAssetUrl.saraAvatar()}
              alt="سارا"
              style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", border: "2px solid rgba(34,197,94,0.45)" }}
            />
            <span
              style={{
                position: "absolute", bottom: -1, right: -1, width: 11, height: 11,
                background: "#22c55e", borderRadius: "50%", border: "2px solid #0c2417",
                animation: "call-dot-pulse 1.4s ease-in-out infinite",
              }}
            />
          </span>

          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", color: "white", fontSize: 13, fontWeight: 700, lineHeight: 1.3 }}>
              تماس با سارا
            </span>
            <span style={{ display: "block", color: "rgba(134,239,172,0.9)", fontSize: 11, fontWeight: 500, lineHeight: 1.4, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {statusText}
            </span>
          </span>

          {/* Timer */}
          {phoneState === "connected" && (
            <span className="tabular-nums" style={{ color: "#86efac", fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
              {timer}
            </span>
          )}

          {/* "Return" hint */}
          <span style={{ color: "rgba(255,255,255,0.55)", fontSize: 11, fontWeight: 600, flexShrink: 0, paddingInlineStart: 2 }}>
            بازگشت ↗
          </span>
        </button>

        {/* Hang-up */}
        <button
          onClick={endCall}
          aria-label="پایان تماس"
          className="flex items-center justify-center active:scale-90 transition-transform force-white"
          style={{
            flexShrink: 0, width: 34, height: 34, borderRadius: "50%",
            background: "linear-gradient(135deg, #dc2626, #ef4444)", border: "none", cursor: "pointer",
            boxShadow: "0 2px 10px rgba(220,38,38,0.5)",
          }}
        >
          <PhoneOff className="w-4 h-4 text-white" />
        </button>
      </div>
    </>
  );
}
