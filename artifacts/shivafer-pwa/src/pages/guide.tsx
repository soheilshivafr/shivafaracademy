import { useState, useRef, useEffect } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { useLocation } from "wouter";

const toPersian = (n: number) => String(n).replace(/\d/g, d => "۰۱۲۳۴۵۶۷۸۹"[+d]);

const TUTORIAL_CARDS = [
  { img: "/tutorial-cards/card-1.webp", audio: "/tutorial-cards/voice-1.mp3" },
  { img: "/tutorial-cards/card-2.webp", audio: "/tutorial-cards/voice-2.mp3" },
  { img: "/tutorial-cards/card-3.webp", audio: "/tutorial-cards/voice-3.mp3" },
  { img: "/tutorial-cards/card-4.webp", audio: "/tutorial-cards/voice-4.mp3" },
  { img: "/tutorial-cards/card-5.webp", audio: "/tutorial-cards/voice-5.mp3" },
  { img: "/tutorial-cards/card-6.webp", audio: "/tutorial-cards/voice-6.mp3" },
  { img: "/tutorial-cards/card-7.webp", audio: "/tutorial-cards/voice-7.mp3" },
];

/* ── Champagne Foil Gold + glassy liquid tokens ── */
const G = {
  /* 24k foil: horizontal brushed with sharp white-gold highlights */
  metal:      "linear-gradient(105deg,#5c3a00 0%,#c89c1a 7%,#ffe870 14%,#fffef2 21%,#ffd840 27%,#a87c10 35%,#e4be3c 43%,#fffce4 50%,#ffd040 57%,#a07610 65%,#d8ae2e 72%,#fff8de 80%,#cca01e 87%,#5c3a00 100%)",
  metalDim:   "linear-gradient(105deg,#3a2600 0%,#9a7416 7%,#d4b048 14%,#f5e898 21%,#c8a02c 27%,#805e0c 35%,#c0a02c 43%,#ead87a 50%,#c09828 57%,#745c0c 65%,#ae8c24 72%,#dccf70 80%,#9e7c16 87%,#3a2600 100%)",
  /* glass bg */
  glass:      "linear-gradient(135deg,rgba(255,218,100,0.12) 0%,rgba(175,115,0,0.05) 50%,rgba(255,218,100,0.09) 100%)",
  /* borders */
  border:     "1px solid rgba(255,218,100,0.30)",
  borderHi:   "1.5px solid rgba(255,230,120,0.52)",
  borderMetal:"1.5px solid rgba(255,252,200,0.50)",
  /* text */
  text:       "#f4cc44",
  textBright: "#fffce0",
  textDim:    "rgba(244,204,68,0.50)",
  /* blur */
  blur:       "blur(16px) saturate(190%)",
  /* shadows */
  shadowGlass:"inset 0 1.5px 0 rgba(255,252,200,0.18), inset 0 -1px 0 rgba(0,0,0,0.30), 0 4px 20px rgba(0,0,0,0.48)",
  shadowMetal:"inset 0 2px 0 rgba(255,252,200,0.40), inset 0 -2px 0 rgba(50,25,0,0.60), 0 6px 26px rgba(150,95,0,0.52)",
  shadowGlow: "0 8px 36px rgba(190,130,0,0.60)",
};

/* Reusable glass pill style */
const glassPill = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: G.glass,
  backdropFilter: G.blur,
  WebkitBackdropFilter: G.blur,
  border: G.border,
  boxShadow: G.shadowGlass,
  ...extra,
});

/* Metallic gold button style */
const metalBtn = (extra?: React.CSSProperties): React.CSSProperties => ({
  background: G.metal,
  border: G.borderMetal,
  boxShadow: G.shadowMetal,
  cursor: "pointer",
  position: "relative",
  overflow: "hidden",
  ...extra,
});

export default function GuidePage() {
  const [, navigate] = useLocation();
  const [cardIndex, setCardIndex]         = useState(0);
  const [isPlaying, setIsPlaying]         = useState(false);
  const [playbackRate, setPlaybackRate]   = useState(1);
  const [audioProgress, setAudioProgress] = useState(0);
  const [swipeHint, setSwipeHint]         = useState(false);
  const [slideDir, setSlideDir]           = useState<'fwd'|'bwd'>('fwd');
  const [prevIdx, setPrevIdx]             = useState(-1);
  const [sliding, setSliding]             = useState(false);
  const [showPlayHint, setShowPlayHint]   = useState(false);
  const SLIDE_MS = 360;
  const playHintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const audioRef  = useRef<HTMLAudioElement | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasPlayedRef = useRef(false);

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
  useEffect(() => () => stopAudio(), []);

  /* preload all card images on mount so swipes are instant */
  useEffect(() => {
    TUTORIAL_CARDS.forEach(card => {
      const img = new Image();
      img.src = card.img;
    });
  }, []);

  /* reset hasPlayed when card changes */
  useEffect(() => {
    hasPlayedRef.current = false;
    setShowPlayHint(false);
    if (playHintTimer.current) clearTimeout(playHintTimer.current);
    playHintTimer.current = setTimeout(() => {
      if (!hasPlayedRef.current) setShowPlayHint(true);
    }, 2000);
    return () => { if (playHintTimer.current) clearTimeout(playHintTimer.current); };
  }, [cardIndex]);

  /* hide hint when playing starts */
  useEffect(() => {
    if (isPlaying) setShowPlayHint(false);
  }, [isPlaying]);

  const goBack   = () => { stopAudio(); sessionStorage.setItem("tribe_guide_dismissed", "1"); navigate("/tribe"); };

  const slideToCard = (newIdx: number, dir: 'fwd'|'bwd') => {
    stopAudio(); setIsPlaying(false); setAudioProgress(0);
    setPrevIdx(cardIndex);
    setSlideDir(dir);
    setSliding(true);
    setCardIndex(newIdx);
    setTimeout(() => { setSliding(false); setPrevIdx(-1); }, SLIDE_MS + 40);
  };

  const nextCard = () => {
    if (cardIndex < TUTORIAL_CARDS.length - 1) slideToCard(cardIndex + 1, 'fwd');
    else goBack();
  };
  const prevCard = () => {
    if (cardIndex > 0) slideToCard(cardIndex - 1, 'bwd');
  };
  const togglePlay = () => {
    const card = TUTORIAL_CARDS[cardIndex];
    clearHint();
    hasPlayedRef.current = true;
    setShowPlayHint(false);
    if (!audioRef.current || audioRef.current.src !== window.location.origin + card.audio) {
      if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
      const a = new Audio(card.audio);
      a.playbackRate = playbackRate;
      a.onended = () => {
        setIsPlaying(false); setAudioProgress(1);
        setSwipeHint(true);
        hintTimer.current = setTimeout(() => setSwipeHint(false), 2200);
      };
      a.ontimeupdate = () => {
        if (a.duration > 0) setAudioProgress(a.currentTime / a.duration);
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

  const WAVES = [
    "wave1 0.8s ease-in-out infinite",
    "wave2 0.7s ease-in-out infinite 0.1s",
    "wave3 0.9s ease-in-out infinite 0.05s",
    "wave4 0.75s ease-in-out infinite 0.15s",
    "wave5 0.85s ease-in-out infinite 0.2s",
  ];

  return (
    <div
      dir="rtl"
      style={{
        position: "fixed", inset: 0, zIndex: 9999,
        background: "linear-gradient(180deg,#0b0800 0%,#100d00 55%,#080500 100%)",
        display: "flex", flexDirection: "column",
        fontFamily: "'Vazirmatn Variable','Vazirmatn',sans-serif",
      }}
      onTouchStart={(e) => { (e.currentTarget as any)._sx = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        const sx = (e.currentTarget as any)._sx;
        if (sx == null) return;
        const dx = e.changedTouches[0].clientX - sx;
        if (Math.abs(dx) > 50) { if (dx < 0) nextCard(); else prevCard(); }
      }}
    >
      <style>{`
        * { font-family: 'Vazirmatn Variable','Vazirmatn',sans-serif !important; box-sizing: border-box; }
        button { font-family: 'Vazirmatn Variable','Vazirmatn',sans-serif !important; }

        /* card slide transitions */
        @keyframes cardFwdIn  { from{transform:translateX(100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes cardFwdOut { from{transform:translateX(0);opacity:1}    to{transform:translateX(-80%);opacity:0} }
        @keyframes cardBwdIn  { from{transform:translateX(-100%);opacity:0} to{transform:translateX(0);opacity:1} }
        @keyframes cardBwdOut { from{transform:translateX(0);opacity:1}    to{transform:translateX(80%);opacity:0} }

        /* play button rings */
        @keyframes tutRipple  { 0%{transform:scale(1);opacity:0.7} 100%{transform:scale(2.4);opacity:0} }
        @keyframes tutBeat    { 0%,100%{transform:scale(1)} 15%{transform:scale(1.14)} 30%{transform:scale(0.95)} 45%{transform:scale(1.08)} 60%{transform:scale(0.98)} }

        /* metallic shimmer sweep — slow luxurious */
        @keyframes metalShimmer {
          0%   { background-position: -300% center; }
          100% { background-position:  300% center; }
        }
        /* sparkle twinkle on active elements */
        @keyframes sparkle1 { 0%,100%{opacity:0;transform:scale(0)} 50%{opacity:1;transform:scale(1)} }
        @keyframes sparkle2 { 0%,100%{opacity:0;transform:scale(0) rotate(45deg)} 60%{opacity:0.9;transform:scale(1.2) rotate(45deg)} }
        @keyframes playHintIn  { from{opacity:0;transform:scale(0.82)} to{opacity:1;transform:scale(1)} }
        @keyframes playHintBob { 0%,100%{transform:scale(1)} 50%{transform:scale(1.06)} }
        @keyframes overlayIn   { from{opacity:0} to{opacity:1} }
        /* liquid highlight pulse inside buttons */
        @keyframes liquidPulse {
          0%,100% { opacity: 0.18; transform: translateY(0) scaleX(1); }
          50%     { opacity: 0.38; transform: translateY(-2px) scaleX(1.08); }
        }

        /* sound waves */
        @keyframes wave1 { 0%,100%{height:4px}  50%{height:16px} }
        @keyframes wave2 { 0%,100%{height:10px} 50%{height:4px}  }
        @keyframes wave3 { 0%,100%{height:14px} 50%{height:6px}  }
        @keyframes wave4 { 0%,100%{height:6px}  50%{height:17px} }
        @keyframes wave5 { 0%,100%{height:12px} 50%{height:5px}  }

        /* swipe hint */
        @keyframes swipeHint  {
          0%{transform:translateX(0)} 12%{transform:translateX(-10px)} 26%{transform:translateX(5px)}
          40%{transform:translateX(-18px)} 55%{transform:translateX(6px)} 70%{transform:translateX(-22px)}
          84%{transform:translateX(3px)} 100%{transform:translateX(0)}
        }
        @keyframes arrowPulse {
          0%,100%{opacity:0.3;transform:translateX(0)} 50%{opacity:1;transform:translateX(-6px)}
        }
        @keyframes progressShimmer {
          0%{background-position:200% center} 100%{background-position:-200% center}
        }
      `}</style>

      {/* Ambient glow orbs */}
      <div style={{ position:"absolute",inset:0,pointerEvents:"none",overflow:"hidden" }}>
        <div style={{ position:"absolute",top:"-8%",right:"-10%",width:240,height:240,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(220,160,0,0.13) 0%,transparent 70%)" }} />
        <div style={{ position:"absolute",bottom:"10%",left:"-10%",width:200,height:200,borderRadius:"50%",
          background:"radial-gradient(circle,rgba(180,110,0,0.09) 0%,transparent 70%)" }} />
      </div>

      {/* ── Top bar ── */}
      <div style={{
        display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center",
        padding:"calc(env(safe-area-inset-top) + 12px) 10px 10px",
        flexShrink:0, position:"relative", zIndex:2,
      }}>
        {/* Col1 right (RTL): close button */}
        <div style={{ display:"flex", justifyContent:"flex-start" }}>
          <button
            onClick={goBack}
            style={{
              ...glassPill({ width:36, height:36, borderRadius:12 }),
              display:"flex", alignItems:"center", justifyContent:"center",
            }}
          >
            {/* metallic X shine overlay */}
            <div style={{
              position:"absolute",inset:0,borderRadius:12,
              background:"linear-gradient(160deg,rgba(255,240,180,0.18) 0%,transparent 55%)",
              pointerEvents:"none",
            }}/>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke="url(#goldX)" strokeWidth="2.5" strokeLinecap="round">
              <defs>
                <linearGradient id="goldX" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#fff8c0"/>
                  <stop offset="50%" stopColor="#f0c040"/>
                  <stop offset="100%" stopColor="#c08010"/>
                </linearGradient>
              </defs>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Col2 center: title */}
        <span style={{
          fontSize:14, fontWeight:800, textAlign:"center", whiteSpace:"nowrap",
          background: G.metal,
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
          backgroundClip:"text",
          filter:"drop-shadow(0 1px 8px rgba(190,130,0,0.7))",
          backgroundSize:"300% auto",
          animation:"metalShimmer 6s linear infinite",
        }}>راهنمای درآمدزایی</span>

        {/* Col3 left (RTL): counter */}
        <div style={{ display:"flex", alignItems:"center", gap:6, direction:"ltr", justifyContent:"flex-start" }}>
          {cardIndex > 0 && (
            <button
              onClick={prevCard}
              style={{
                ...glassPill({ width:32, height:32, borderRadius:10 }),
                display:"flex", alignItems:"center", justifyContent:"center",
              }}
            >
              <div style={{ position:"absolute",inset:0,borderRadius:10,background:"linear-gradient(160deg,rgba(255,240,180,0.15) 0%,transparent 55%)",pointerEvents:"none" }}/>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={G.text} strokeWidth="2.5" strokeLinecap="round">
                <polyline points="15 18 9 12 15 6"/>
              </svg>
            </button>
          )}
          <div style={{
            ...glassPill({ borderRadius:20, padding:"5px 12px" }),
            fontSize:13, fontWeight:800, color:G.text,
            letterSpacing:"0.02em", position:"relative",
          }}>
            <div style={{ position:"absolute",inset:0,borderRadius:20,background:"linear-gradient(160deg,rgba(255,240,180,0.18) 0%,transparent 55%)",pointerEvents:"none" }}/>
            {toPersian(cardIndex + 1)}/{toPersian(TUTORIAL_CARDS.length)}
          </div>
        </div>
      </div>

      {/* ── Card image (with slide transition) ── */}
      <div style={{ flex:1, minHeight:0, position:"relative", overflow:"hidden" }}>

        {/* Exiting card — slides out */}
        {sliding && prevIdx >= 0 && (
          <div style={{
            position:"absolute", inset:0, zIndex:1,
            animation:`${slideDir==='fwd' ? 'cardFwdOut' : 'cardBwdOut'} ${SLIDE_MS}ms cubic-bezier(0.4,0,0.2,1) both`,
          }}>
            <CachedImage src={TUTORIAL_CARDS[prevIdx].img} alt=""
              style={{ width:"100%",height:"100%",objectFit:"contain",display:"block" }} />
          </div>
        )}

        {/* Entering card — slides in */}
        <div style={{
          position: sliding ? "absolute" : "relative",
          inset: sliding ? 0 : undefined,
          width:"100%", height:"100%",
          zIndex:2,
          animation: sliding
            ? `${slideDir==='fwd' ? 'cardFwdIn' : 'cardBwdIn'} ${SLIDE_MS}ms cubic-bezier(0.25,0.46,0.45,0.94) both`
            : swipeHint
              ? "swipeHint 1.8s cubic-bezier(0.36,0.07,0.19,0.97)"
              : "none",
        }}>
          <CachedImage src={TUTORIAL_CARDS[cardIndex].img} alt={`کارت ${cardIndex + 1}`}
            style={{ width:"100%",height:"100%",objectFit:"contain",display:"block" }} />

          {/* Sound-wave badge */}
          <div style={{
            position:"absolute", top:10, right:10,
            ...glassPill({ borderRadius:10, padding:"5px 9px" }),
            display:"flex", alignItems:"center", gap:3,
          }}>
            <div style={{ position:"absolute",inset:0,borderRadius:10,background:"linear-gradient(160deg,rgba(255,240,180,0.15) 0%,transparent 55%)",pointerEvents:"none" }}/>
            {WAVES.map((anim, i) => (
              <div key={i} style={{
                width:3, height:11, borderRadius:2,
                background: isPlaying
                  ? "linear-gradient(180deg,#fff8c0 0%,#f0c040 40%,#c08010 100%)"
                  : "rgba(240,192,64,0.28)",
                animation: isPlaying ? anim : "none",
                transition:"background 0.3s",
              }}/>
            ))}
            <span style={{ fontSize:9, fontWeight:800, marginRight:3,
              background: G.metal, WebkitBackgroundClip:"text",
              WebkitTextFillColor:"transparent", backgroundClip:"text",
            }}>صدا</span>
          </div>

          {/* Swipe hint */}
          {swipeHint && cardIndex < TUTORIAL_CARDS.length - 1 && (
            <div style={{
              position:"absolute",inset:0,display:"flex",alignItems:"center",justifyContent:"flex-start",
              paddingLeft:20,pointerEvents:"none",
              background:"linear-gradient(to left,transparent 40%,rgba(180,110,0,0.15) 100%)",
            }}>
              <div style={{ display:"flex",gap:4 }}>
                {[0,1,2].map(i => (
                  <svg key={i} width="22" height="22" viewBox="0 0 24 24" fill="none"
                    stroke={G.text} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                    style={{ animation:`arrowPulse 0.7s ease-in-out infinite ${i*0.15}s`,opacity:0.3 }}>
                    <polyline points="15 18 9 12 15 6"/>
                  </svg>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress bar ── */}
      {audioProgress > 0 && (
        <div style={{ padding:"8px 14px 0", flexShrink:0 }}>
          <div style={{ width:"100%",height:4,borderRadius:4,background:"rgba(200,140,0,0.12)",overflow:"hidden",position:"relative" }}>
            <div style={{
              position:"absolute",left:0,top:0,bottom:0,
              width:`${Math.min(audioProgress*100,100)}%`,borderRadius:4,
              background: isPlaying
                ? "linear-gradient(90deg,#8a5800,#e8b020,#fff080,#e0a818)"
                : "rgba(200,140,0,0.40)",
              backgroundSize:"300% auto",
              animation: isPlaying ? "progressShimmer 3s linear infinite" : "none",
              transition: isPlaying ? "width 0.25s linear" : "none",
            }}/>
          </div>
        </div>
      )}

      {/* ── Play + Next ── */}
      <div style={{ display:"flex",alignItems:"center",gap:10,padding:"10px 12px 6px",flexShrink:0 }}>
        {/* Play button */}
        <div style={{ position:"relative",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0 }}>

          {!isPlaying && (
            <>
              <div style={{ position:"absolute",width:54,height:54,borderRadius:"50%",
                border:"2px solid rgba(240,192,64,0.40)",
                animation:"tutRipple 1.8s ease-out infinite" }}/>
              <div style={{ position:"absolute",width:54,height:54,borderRadius:"50%",
                border:"2px solid rgba(240,192,64,0.22)",
                animation:"tutRipple 1.8s ease-out infinite 0.65s" }}/>
            </>
          )}
          <button
            onClick={togglePlay}
            style={{
              ...metalBtn({ width:54,height:54,borderRadius:"50%" }),
              display:"flex",alignItems:"center",justifyContent:"center",
              animation: isPlaying ? "none" : "tutBeat 2.4s ease-in-out infinite",
              boxShadow: G.shadowMetal + ", " + G.shadowGlow,
            }}
          >
            {/* liquid highlight blob */}
            <div style={{
              position:"absolute",top:"8%",left:"12%",width:"50%",height:"36%",
              borderRadius:"50%",background:"rgba(255,255,200,0.28)",
              filter:"blur(4px)",
              animation:"liquidPulse 2.2s ease-in-out infinite",
              pointerEvents:"none",
            }}/>
            {isPlaying
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="#1a0e00" style={{ position:"relative",zIndex:1 }}>
                  <rect x="6" y="4" width="4" height="16" rx="1.5"/><rect x="14" y="4" width="4" height="16" rx="1.5"/>
                </svg>
              : <svg width="20" height="20" viewBox="0 0 24 24" fill="#1a0e00" style={{ marginRight:-2,position:"relative",zIndex:1 }}>
                  <polygon points="6,3 21,12 6,21"/>
                </svg>
            }
          </button>
        </div>

        {/* Next button — full metallic gold */}
        <button
          onClick={nextCard}
          style={{
            ...metalBtn({ flex:1, padding:"14px 12px", borderRadius:16 }),
            display:"flex", alignItems:"center", justifyContent:"center", gap:6,
            color:"#1a0e00", fontSize:15, fontWeight:900,
            boxShadow: G.shadowMetal + ", " + G.shadowGlow,
            letterSpacing:"0.01em",
          }}
        >
          {/* liquid blob highlight */}
          <div style={{
            position:"absolute",top:"6%",left:"8%",width:"40%",height:"40%",
            borderRadius:"50%",background:"rgba(255,255,200,0.22)",
            filter:"blur(8px)",
            animation:"liquidPulse 2.5s ease-in-out infinite",
            pointerEvents:"none",
          }}/>
          <span style={{ position:"relative",zIndex:1 }}>
            {cardIndex < TUTORIAL_CARDS.length - 1 ? "بعدی" : "الان شروع کن"}
          </span>
          {cardIndex < TUTORIAL_CARDS.length - 1 && (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1a0e00" strokeWidth="2.8"
              strokeLinecap="round" style={{ position:"relative",zIndex:1 }}>
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          )}
        </button>
      </div>

      {/* ── Speed buttons + status ── */}
      <div style={{ display:"flex",alignItems:"center",justifyContent:"space-between",padding:"0 12px",flexShrink:0 }}>
        <span style={{
          fontSize:11, fontWeight:700,
          background: isPlaying ? G.metal : "none",
          WebkitBackgroundClip: isPlaying ? "text" : undefined,
          WebkitTextFillColor: isPlaying ? "transparent" : G.textDim,
          backgroundClip: isPlaying ? "text" : undefined,
          backgroundSize:"300% auto",
          animation: isPlaying ? "metalShimmer 6s linear infinite" : "none",
          transition:"all 0.3s",
        }}>
          {isPlaying ? "در حال پخش..." : "پلی بزن"}
        </span>
        <div style={{ display:"flex",gap:6,direction:"ltr" }}>
          {[1, 1.5, 2].map(rate => (
            <button
              key={rate}
              onClick={() => changeRate(rate)}
              style={
                playbackRate === rate
                  ? {
                      ...metalBtn({ padding:"4px 11px", borderRadius:20 }),
                      color:"#1a0e00", fontSize:12, fontWeight:800,
                      position:"relative", overflow:"hidden",
                      boxShadow: G.shadowMetal,
                    }
                  : {
                      ...glassPill({ padding:"4px 11px", borderRadius:20 }),
                      color: G.text, fontSize:12, fontWeight:800,
                      position:"relative", overflow:"hidden",
                      cursor:"pointer", transition:"all 0.2s",
                    }
              }
            >
              <div style={{
                position:"absolute",top:"5%",left:"10%",width:"35%",height:"45%",
                borderRadius:"50%",background:"rgba(255,255,200,0.20)",
                filter:"blur(3px)",pointerEvents:"none",
                display: playbackRate === rate ? "block" : "none",
              }}/>
              <span style={{ position:"relative",zIndex:1 }}>{rate}x</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── Skip + progress dots ── */}
      <div style={{ padding:"6px 14px calc(env(safe-area-inset-bottom) + 14px)",flexShrink:0 }}>
        <button onClick={goBack} style={{
          width:"100%", background:"none", border:"none",
          color: G.textDim, fontSize:12, cursor:"pointer", padding:"4px",
        }}>رد کردن</button>
        <div style={{ display:"flex",justifyContent:"center",gap:5,marginTop:6,direction:"ltr" }}>
          {Array.from({ length:TUTORIAL_CARDS.length }).map((_,i) => (
            <div key={i} style={{
              width: i===cardIndex ? 18 : 5, height:5, borderRadius:3,
              background: i===cardIndex
                ? G.metal
                : i<cardIndex
                  ? "rgba(200,140,0,0.35)"
                  : "rgba(255,255,255,0.10)",
              backgroundSize:"200% auto",
              transition:"all 0.3s",
              boxShadow: i===cardIndex ? "0 0 8px rgba(200,140,0,0.7)" : "none",
            }}/>
          ))}
        </div>
      </div>

      {/* ── Play hint popup overlay ── */}
      {showPlayHint && !isPlaying && (
        <div
          onClick={() => setShowPlayHint(false)}
          style={{
            position:"fixed", inset:0, zIndex:9999,
            display:"flex", alignItems:"center", justifyContent:"center",
            background:"rgba(0,0,0,0.70)",
            backdropFilter:"blur(6px)",
            WebkitBackdropFilter:"blur(6px)",
            animation:"overlayIn 0.3s ease both",
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              animation:"playHintIn 0.4s cubic-bezier(0.22,1,0.36,1) both",
              display:"flex", flexDirection:"column", alignItems:"center", gap:24,
              padding:"36px 40px 32px",
              background:"linear-gradient(160deg,rgba(30,18,0,0.92) 0%,rgba(12,8,0,0.96) 100%)",
              border: G.borderHi,
              borderRadius:28,
              boxShadow:"0 24px 80px rgba(0,0,0,0.8), 0 0 40px rgba(190,130,0,0.3)",
              minWidth:240,
            }}
          >
            {/* title */}
            <div style={{ textAlign:"center" }}>
              <div style={{ fontSize:22, marginBottom:6 }}>🎧</div>
              <div style={{
                fontSize:15, fontWeight:800,
                background: G.metal, backgroundSize:"200% auto",
                WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent",
                backgroundClip:"text",
                animation:"metalShimmer 4s linear infinite",
              }}>این کارت صدا داره</div>
              <div style={{ fontSize:11, color:"rgba(244,204,68,0.55)", marginTop:4, fontWeight:600 }}>
                برای شنیدن پلی بزن
              </div>
            </div>

            {/* big play button */}
            <div style={{ position:"relative", display:"flex", alignItems:"center", justifyContent:"center" }}>
              <div style={{ position:"absolute",width:80,height:80,borderRadius:"50%",
                border:"2px solid rgba(240,192,64,0.35)",
                animation:"tutRipple 1.8s ease-out infinite" }}/>
              <div style={{ position:"absolute",width:80,height:80,borderRadius:"50%",
                border:"2px solid rgba(240,192,64,0.20)",
                animation:"tutRipple 1.8s ease-out infinite 0.65s" }}/>
              <button
                onClick={() => { togglePlay(); setShowPlayHint(false); }}
                style={{
                  ...metalBtn({ width:72, height:72, borderRadius:"50%" }),
                  display:"flex", alignItems:"center", justifyContent:"center",
                  boxShadow: G.shadowMetal + ", " + G.shadowGlow,
                  animation:"tutBeat 2.4s ease-in-out infinite, playHintBob 1.8s ease-in-out 0.5s infinite",
                }}
              >
                <div style={{
                  position:"absolute",top:"8%",left:"12%",width:"50%",height:"36%",
                  borderRadius:"50%",background:"rgba(255,255,200,0.28)",
                  filter:"blur(4px)",pointerEvents:"none",
                }}/>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="#1a0e00"
                  style={{ marginRight:-2, position:"relative", zIndex:1 }}>
                  <polygon points="6,3 21,12 6,21"/>
                </svg>
              </button>
            </div>

            {/* dismiss */}
            <button
              onClick={() => setShowPlayHint(false)}
              style={{
                background:"none", border:"none", cursor:"pointer",
                color:"rgba(244,204,68,0.35)", fontSize:11, fontWeight:600,
                padding:"4px 12px",
              }}
            >بعداً می‌زنم</button>
          </div>
        </div>
      )}
    </div>
  );
}
