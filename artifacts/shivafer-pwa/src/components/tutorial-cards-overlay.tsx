import { useState, useRef, useEffect } from "react";

const TUTORIAL_CARDS = [
  { img: "/tutorial-cards/card-1.webp", audio: "/tutorial-cards/voice-1.mp3" },
  { img: "/tutorial-cards/card-2.webp", audio: "/tutorial-cards/voice-2.mp3" },
  { img: "/tutorial-cards/card-3.webp", audio: "/tutorial-cards/voice-3.mp3" },
  { img: "/tutorial-cards/card-4.webp", audio: "/tutorial-cards/voice-4.mp3" },
  { img: "/tutorial-cards/card-5.webp", audio: "/tutorial-cards/voice-5.mp3" },
  { img: "/tutorial-cards/card-6.webp", audio: "/tutorial-cards/voice-6.mp3" },
  { img: "/tutorial-cards/card-7.webp", audio: "/tutorial-cards/voice-7.mp3" },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export function TutorialCardsOverlay({ isOpen, onClose }: Props) {
  const [tutCardIndex, setTutCardIndex] = useState(0);
  const [isPlaying, setIsPlaying]       = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [audioProgress, setAudioProgress] = useState(0);
  const [swipeHint, setSwipeHint]       = useState(false);
  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const hintTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHint = () => {
    if (hintTimer.current) { clearTimeout(hintTimer.current); hintTimer.current = null; }
    setSwipeHint(false);
  };

  const stopAudio = () => {
    clearHint();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      audioRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.body.classList.add("tutorial-overlay-open");
    } else {
      document.body.classList.remove("tutorial-overlay-open");
      stopAudio();
      setIsPlaying(false);
      setTutCardIndex(0);
      setAudioProgress(0);
    }
    return () => document.body.classList.remove("tutorial-overlay-open");
  }, [isOpen]);

  const close = () => {
    stopAudio();
    setIsPlaying(false);
    setTutCardIndex(0);
    setAudioProgress(0);
    onClose();
  };

  const nextCard = () => {
    stopAudio();
    setIsPlaying(false);
    setAudioProgress(0);
    if (tutCardIndex < TUTORIAL_CARDS.length - 1) setTutCardIndex(i => i + 1);
    else close();
  };

  const prevCard = () => {
    stopAudio();
    setIsPlaying(false);
    setAudioProgress(0);
    if (tutCardIndex > 0) setTutCardIndex(i => i - 1);
  };

  const togglePlay = () => {
    const card = TUTORIAL_CARDS[tutCardIndex];
    clearHint();
    if (!audioRef.current || audioRef.current.src !== window.location.origin + card.audio) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const a = new Audio(card.audio);
      a.playbackRate = playbackRate;
      a.onended = () => {
        setIsPlaying(false);
        setAudioProgress(1);
        // trigger swipe-hint animation
        setSwipeHint(true);
        hintTimer.current = setTimeout(() => setSwipeHint(false), 2200);
      };
      a.ontimeupdate = () => {
        if (a.duration && a.duration > 0) setAudioProgress(a.currentTime / a.duration);
      };
      audioRef.current = a;
    }
    if (isPlaying) { audioRef.current!.pause(); setIsPlaying(false); }
    else { audioRef.current!.playbackRate = playbackRate; audioRef.current!.play().catch(() => {}); setIsPlaying(true); }
  };

  const changeRate = (rate: number) => {
    setPlaybackRate(rate);
    if (audioRef.current) audioRef.current.playbackRate = rate;
  };

  if (!isOpen) return null;

  const WAVES = [
    "wave1 0.8s ease-in-out infinite",
    "wave2 0.7s ease-in-out infinite 0.1s",
    "wave3 0.9s ease-in-out infinite 0.05s",
    "wave4 0.75s ease-in-out infinite 0.15s",
    "wave5 0.85s ease-in-out infinite 0.2s",
  ];

  return (
    <div
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "rgb(4,2,12)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "calc(env(safe-area-inset-top) + 12px) 14px calc(env(safe-area-inset-bottom) + 12px)",
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close(); }}
    >
      <style>{`
        body.tutorial-overlay-open [data-overlay-hide] {
          opacity: 0 !important;
          pointer-events: none !important;
          transition: opacity 0.25s ease !important;
        }
        [data-overlay-hide] { transition: opacity 0.25s ease; }
        @keyframes tutFadeIn   { from{opacity:0;transform:scale(0.96)} to{opacity:1;transform:scale(1)} }
        @keyframes tutCardIn   { from{opacity:0;transform:translateX(40px)} to{opacity:1;transform:translateX(0)} }
        @keyframes tutRipple   { 0%{transform:scale(1);opacity:1} 100%{transform:scale(2.2);opacity:0} }
        @keyframes tutBeat     { 0%,100%{transform:scale(1)} 15%{transform:scale(1.18)} 30%{transform:scale(0.94)} 45%{transform:scale(1.10)} 60%{transform:scale(0.98)} }
        @keyframes tutPlayPulse { 0%,100%{box-shadow:0 0 0 0 rgba(167,139,250,0.7),0 6px 30px rgba(124,58,237,0.5)} 50%{box-shadow:0 0 0 16px rgba(167,139,250,0),0 6px 30px rgba(124,58,237,0.5)} }
        @keyframes wave1 { 0%,100%{height:5px}  50%{height:18px} }
        @keyframes wave2 { 0%,100%{height:11px} 50%{height:4px}  }
        @keyframes wave3 { 0%,100%{height:15px} 50%{height:7px}  }
        @keyframes wave4 { 0%,100%{height:7px}  50%{height:19px} }
        @keyframes wave5 { 0%,100%{height:13px} 50%{height:5px}  }
        @keyframes tutShimmer  { 0%{opacity:0} 50%{opacity:1} 100%{opacity:0} }
        @keyframes swipeHint   {
          0%   { transform: translateX(0)    rotate(0deg);   }
          12%  { transform: translateX(-10px) rotate(-1.5deg); }
          26%  { transform: translateX(5px)  rotate(1deg);   }
          40%  { transform: translateX(-18px) rotate(-2deg);  }
          55%  { transform: translateX(6px)  rotate(0.8deg); }
          70%  { transform: translateX(-22px) rotate(-2.5deg);}
          84%  { transform: translateX(3px)  rotate(0.5deg); }
          100% { transform: translateX(0)    rotate(0deg);   }
        }
        @keyframes arrowPulse {
          0%,100% { opacity: 0.3; transform: translateX(0); }
          50%     { opacity: 1;   transform: translateX(-6px); }
        }
        @keyframes closePop { from{opacity:0;transform:scale(0.7)} to{opacity:1;transform:scale(1)} }
      `}</style>

      <div style={{ width: "100%", maxWidth: 400, position: "relative" }}>
        <div
          style={{
            width: "100%", background: "linear-gradient(160deg,#120e2e 0%,#0b0820 100%)",
            borderRadius: 28, border: "1px solid rgba(167,139,250,0.35)",
            animation: "tutFadeIn 0.35s cubic-bezier(0.22,1,0.36,1) both",
            overflow: "hidden", display: "flex", flexDirection: "column",
            position: "relative",
          }}
          onTouchStart={(e) => { (e.currentTarget as any)._sx = e.touches[0].clientX; }}
          onTouchEnd={(e) => {
            const sx = (e.currentTarget as any)._sx;
            if (sx == null) return;
            const dx = e.changedTouches[0].clientX - sx;
            if (Math.abs(dx) > 50) { if (dx < 0) nextCard(); else prevCard(); }
          }}
        >
          {/* Close button — top-right corner */}
          <button
            onClick={close}
            style={{
              position: "absolute", top: 10, right: 10, zIndex: 30,
              width: 34, height: 34, borderRadius: 12,
              background: "rgba(15,10,40,0.85)",
              border: "1.5px solid rgba(167,139,250,0.4)",
              backdropFilter: "blur(8px)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 2px 12px rgba(0,0,0,0.6)",
              animation: "closePop 0.3s cubic-bezier(0.22,1,0.36,1) both",
              transition: "background 0.2s",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth="2.5" strokeLinecap="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>

          {/* Top bar */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 14px 6px", flexShrink: 0 }}>
            {tutCardIndex > 0 ? (
              <button onClick={prevCard} style={{ width: 32, height: 32, borderRadius: 10, background: "rgba(167,139,250,0.12)", border: "1px solid rgba(167,139,250,0.3)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(167,139,250,0.9)" strokeWidth="2.5" strokeLinecap="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>
            ) : <div style={{ width: 32 }} />}
            <span style={{ fontSize: 13, fontWeight: 700, color: "#fff" }}>راهنمای درآمدزایی</span>
            <span style={{ fontSize: 14, color: "rgba(167,139,250,0.95)", background: "rgba(167,139,250,0.15)", borderRadius: 20, padding: "4px 12px", fontWeight: 700 }}>
              {TUTORIAL_CARDS.length.toLocaleString("fa-IR")} / {(tutCardIndex + 1).toLocaleString("fa-IR")}
            </span>
          </div>

          {/* Card image — bigger */}
          <div
            key={tutCardIndex}
            style={{
              position: "relative", margin: "4px 0 0",
              animation: swipeHint
                ? "swipeHint 1.8s cubic-bezier(0.36,0.07,0.19,0.97)"
                : "tutCardIn 0.32s cubic-bezier(0.22,1,0.36,1) both",
            }}
          >
            <img
              src={TUTORIAL_CARDS[tutCardIndex].img}
              alt={`کارت ${tutCardIndex + 1}`}
              style={{
                width: "100%", display: "block", objectFit: "cover",
                maxHeight: "58vh",
                boxShadow: "0 4px 24px rgba(139,92,246,0.4)",
              }}
            />

            {/* Sound-wave badge */}
            <div style={{ position: "absolute", top: 10, right: 10, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(6px)", borderRadius: 9, padding: "4px 7px", display: "flex", alignItems: "center", gap: 2, border: "1px solid rgba(167,139,250,0.35)" }}>
              {WAVES.map((anim, i) => (
                <div key={i} style={{ width: 3, height: 11, borderRadius: 2, background: isPlaying ? "#a78bfa" : "rgba(167,139,250,0.4)", animation: isPlaying ? anim : "none", transition: "background 0.3s" }} />
              ))}
              <span style={{ fontSize: 9, color: "rgba(167,139,250,0.9)", fontWeight: 600, marginRight: 3 }}>صدا</span>
            </div>

            {/* Swipe-hint overlay — arrow pointing left */}
            {swipeHint && tutCardIndex < TUTORIAL_CARDS.length - 1 && (
              <div style={{
                position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "flex-start",
                paddingLeft: 16, pointerEvents: "none",
                background: "linear-gradient(to left, transparent 40%, rgba(124,58,237,0.18) 100%)",
              }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[0, 1, 2].map(i => (
                    <svg key={i} width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                      style={{ animation: `arrowPulse 0.7s ease-in-out infinite ${i * 0.15}s`, opacity: 0.3 }}>
                      <polyline points="15 18 9 12 15 6"/>
                    </svg>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Progress bar */}
          {audioProgress > 0 && (
            <div style={{ padding: "8px 12px 0", flexShrink: 0 }}>
              <div style={{ width: "100%", height: 4, borderRadius: 4, background: "rgba(167,139,250,0.18)", overflow: "hidden", position: "relative" }}>
                <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${Math.min(audioProgress * 100, 100)}%`, borderRadius: 4, background: isPlaying ? "linear-gradient(90deg,#7c3aed,#a78bfa)" : "rgba(167,139,250,0.55)", transition: isPlaying ? "width 0.25s linear" : "none" }} />
                {isPlaying && (
                  <div style={{ position: "absolute", top: 0, bottom: 0, width: 40, borderRadius: 4, left: `calc(${Math.min(audioProgress * 100, 100)}% - 20px)`, background: "linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)", animation: "tutShimmer 1.2s ease-in-out infinite" }} />
                )}
              </div>
            </div>
          )}

          {/* Play + Next row */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 10px 6px", flexShrink: 0 }}>
            <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              {!isPlaying && (
                <>
                  <div style={{ position: "absolute", width: 52, height: 52, borderRadius: "50%", border: "2px solid rgba(167,139,250,0.5)", animation: "tutRipple 1.8s ease-out infinite" }} />
                  <div style={{ position: "absolute", width: 52, height: 52, borderRadius: "50%", border: "2px solid rgba(167,139,250,0.3)", animation: "tutRipple 1.8s ease-out infinite 0.65s" }} />
                </>
              )}
              <button
                onClick={togglePlay}
                style={{
                  width: 52, height: 52, borderRadius: "50%",
                  background: isPlaying ? "linear-gradient(135deg,#7c3aed,#5b21b6)" : "linear-gradient(135deg,#c4b5fd,#8b5cf6,#6d28d9)",
                  border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
                  position: "relative", zIndex: 1,
                  animation: isPlaying ? "tutPlayPulse 1.4s ease-in-out infinite" : "tutBeat 2.4s ease-in-out infinite",
                  transition: "background 0.25s", boxShadow: "0 4px 22px rgba(124,58,237,0.6)",
                }}
              >
                {isPlaying
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/></svg>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="white" style={{ marginRight: -2 }}><polygon points="6,3 21,12 6,21"/></svg>
                }
              </button>
            </div>
            <button
              onClick={nextCard}
              style={{ flex: 1, padding: "13px 12px", borderRadius: 14, background: "linear-gradient(135deg,#7c3aed,#5b21b6)", border: "none", cursor: "pointer", color: "#fff", fontSize: 15, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", gap: 6, boxShadow: "0 4px 18px rgba(124,58,237,0.45)" }}
            >
              <span>{tutCardIndex < TUTORIAL_CARDS.length - 1 ? "بعدی" : "الان شروع کن"}</span>
              {tutCardIndex < TUTORIAL_CARDS.length - 1 && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
              )}
            </button>
          </div>

          {/* Playback rate (LTR: 1x → 1.5x → 2x) + status */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 12px", marginBottom: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: isPlaying ? "#a78bfa" : "rgba(255,255,255,0.45)", fontWeight: 600, transition: "color 0.3s" }}>
              {isPlaying ? "در حال پخش..." : "پلی بزن"}
            </span>
            <div style={{ display: "flex", gap: 5, direction: "ltr" }}>
              {[1, 1.5, 2].map(rate => (
                <button
                  key={rate}
                  onClick={() => changeRate(rate)}
                  style={{
                    padding: "3px 9px", borderRadius: 20,
                    border: playbackRate === rate ? "none" : "1px solid rgba(167,139,250,0.35)",
                    background: playbackRate === rate ? "linear-gradient(135deg,#7c3aed,#5b21b6)" : "transparent",
                    color: playbackRate === rate ? "#fff" : "rgba(167,139,250,0.7)",
                    fontSize: 12, fontWeight: 700, cursor: "pointer", transition: "all 0.2s",
                  }}
                >{rate}x</button>
              ))}
            </div>
          </div>

          {/* Skip + dots */}
          <div style={{ padding: "0 10px 12px", flexShrink: 0 }}>
            <button onClick={close} style={{ width: "100%", background: "none", border: "none", color: "rgba(255,255,255,0.3)", fontSize: 12, cursor: "pointer", padding: "4px" }}>
              رد کردن
            </button>
            <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: 6, direction: "ltr" }}>
              {Array.from({ length: TUTORIAL_CARDS.length }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: i === tutCardIndex ? 16 : 5, height: 5, borderRadius: 3,
                    background: i === tutCardIndex ? "#a78bfa" : i < tutCardIndex ? "rgba(167,139,250,0.4)" : "rgba(255,255,255,0.15)",
                    transition: "all 0.3s",
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
