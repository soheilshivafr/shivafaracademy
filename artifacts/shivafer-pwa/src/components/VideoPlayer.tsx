import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { usePlayer } from "@/lib/player-context";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Play, Pause, Volume2, VolumeX,
  Maximize, Minimize, RotateCcw, RotateCw, Loader2, ChevronDown, ChevronUp,
} from "lucide-react";

const WATERMARK_INTERVAL_MS = 4 * 60 * 1000;
const WATERMARK_DURATION = 20;
const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];
const CONTROLS_HIDE_DELAY = 3500;

interface VideoPlayerProps {
  src: string;
  title: string;
  description?: string;
  watermarkName: string;
  watermarkPhone: string;
  onClose: () => void;
}

function formatTime(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export function VideoPlayer({
  src, title, description, watermarkName, watermarkPhone, onClose,
}: VideoPlayerProps) {
  const videoRef      = useRef<HTMLVideoElement>(null);
  const containerRef  = useRef<HTMLDivElement>(null);
  const ctrlTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wmTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wmIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const fbTimerRef    = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [playing, setPlaying]         = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration]       = useState(0);
  const [buffered, setBuffered]       = useState(0);
  const [muted, setMuted]             = useState(false);
  const [speed, setSpeed]             = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLandscape, setIsLandscape] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [loading, setLoading]         = useState(true);
  const [videoError, setVideoError]   = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  const { openPlayer, closePlayer } = usePlayer();

  useEffect(() => {
    openPlayer();
    return () => closePlayer();
  }, [openPlayer, closePlayer]);

  const [wmPos, setWmPos]     = useState<{ x: number; y: number } | null>(null);
  const [wmKey, setWmKey]     = useState(0);
  const [videoBounds, setVideoBounds] = useState<{ left: number; top: number; width: number; height: number } | null>(null);

  const [playFeedback, setPlayFeedback] = useState<"play" | "pause" | null>(null);
  const [feedbackKey, setFeedbackKey]   = useState(0);

  // ── Controls auto-hide (only while playing) ───────────────────────────────
  const showCtrl = useCallback(() => {
    setShowControls(true);
    if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current);
    const v = videoRef.current;
    if (!v || v.paused) return;
    ctrlTimerRef.current = setTimeout(() => {
      setShowControls(false);
      setShowSpeedMenu(false);
    }, CONTROLS_HIDE_DELAY);
  }, []);

  // ── Play / Pause ───────────────────────────────────────────────────────────
  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    const willPlay = v.paused;
    willPlay ? v.play() : v.pause();
    // center feedback
    setPlayFeedback(willPlay ? "play" : "pause");
    setFeedbackKey(k => k + 1);
    if (fbTimerRef.current) clearTimeout(fbTimerRef.current);
    fbTimerRef.current = setTimeout(() => setPlayFeedback(null), 700);
    showCtrl();
  }, [showCtrl]);

  // ── Skip ──────────────────────────────────────────────────────────────────
  const skip = useCallback((sec: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = Math.max(0, Math.min(v.duration || 0, v.currentTime + sec));
    showCtrl();
  }, [showCtrl]);

  // Track whether landscape was intentionally requested by user
  const wantsLandscape = useRef(false);

  // ── Landscape / Fullscreen ────────────────────────────────────────────────
  const toggleLandscape = useCallback(async () => {
    if (!isLandscape) {
      wantsLandscape.current = true;
      // Try native orientation lock (Android)
      try {
        await (screen.orientation as any).lock("landscape");
        setIsLandscape(true);
        showCtrl();
        return;
      } catch { /* iOS — fall back to CSS rotation */ }
      // CSS rotation: also try locking portrait so phone doesn't double-rotate
      try { await (screen.orientation as any).lock("portrait"); } catch { /* ignore */ }
      setIsLandscape(true);
    } else {
      wantsLandscape.current = false;
      try { (screen.orientation as any).unlock(); } catch { /* ignore */ }
      setIsLandscape(false);
    }
    showCtrl();
  }, [isLandscape, showCtrl]);

  // ── Sync CSS landscape with physical orientation ───────────────────────────
  // When phone physically rotates to landscape → remove CSS rotation (redundant)
  // When phone rotates back to portrait and user wanted landscape → re-apply
  useEffect(() => {
    const onResize = () => {
      const physicalLandscape = window.innerWidth > window.innerHeight;
      if (physicalLandscape && wantsLandscape.current) {
        // Phone is now actually landscape — CSS rotation no longer needed
        setIsLandscape(false);
      } else if (!physicalLandscape && wantsLandscape.current) {
        // Phone back to portrait — re-apply CSS rotation
        setIsLandscape(true);
      }
    };
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  // Unlock on unmount
  useEffect(() => {
    return () => {
      try { (screen.orientation as any).unlock(); } catch { /* ignore */ }
    };
  }, []);

  // ── Video element event listeners ─────────────────────────────────────────
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onTimeUpdate = () => {
      setCurrentTime(v.currentTime);
      if (v.buffered.length > 0 && v.duration > 0)
        setBuffered((v.buffered.end(v.buffered.length - 1) / v.duration) * 100);
    };
    const onDuration      = () => setDuration(v.duration);
    const onPlay          = () => { setPlaying(true); setVideoError(null); };
    const onPause         = () => { setPlaying(false); setLoading(false); };
    const onPlaying       = () => { setLoading(false); setVideoError(null); };
    const onWaiting       = () => setLoading(true);
    const onStalled       = () => setLoading(true);
    const onError         = () => {
      const code = v.error?.code ?? 0;
      let msg = "مشکلی در بارگذاری ویدیو پیش آمد. اتصال اینترنت خود را بررسی کنید و دوباره امتحان کنید.";
      if (code === 2) msg = "ارتباط با سرور قطع شد. اینترنت خود را بررسی کنید.";
      if (code === 3) msg = "ویدیو قابل پخش نیست. لطفاً صفحه را رفرش کنید.";
      if (code === 4) msg = "دسترسی به ویدیو امکان‌پذیر نیست. لطفاً دوباره وارد شوید.";
      setVideoError(msg);
      setLoading(false);
    };
    const preventNativeFS = () => { const vv = v as any; if (vv.webkitExitFullscreen) vv.webkitExitFullscreen(); };

    v.addEventListener("timeupdate", onTimeUpdate);
    v.addEventListener("durationchange", onDuration);
    v.addEventListener("play", onPlay);
    v.addEventListener("pause", onPause);
    v.addEventListener("playing", onPlaying);
    v.addEventListener("waiting", onWaiting);
    v.addEventListener("stalled", onStalled);
    v.addEventListener("error", onError);
    v.addEventListener("webkitbeginfullscreen", preventNativeFS);
    return () => {
      v.removeEventListener("timeupdate", onTimeUpdate);
      v.removeEventListener("durationchange", onDuration);
      v.removeEventListener("play", onPlay);
      v.removeEventListener("pause", onPause);
      v.removeEventListener("playing", onPlaying);
      v.removeEventListener("waiting", onWaiting);
      v.removeEventListener("stalled", onStalled);
      v.removeEventListener("error", onError);
      v.removeEventListener("webkitbeginfullscreen", preventNativeFS);
    };
  }, []);

  // ── Fullscreen change ──────────────────────────────────────────────────────
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(!!(document.fullscreenElement || (document as any).webkitFullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    document.addEventListener("webkitfullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      document.removeEventListener("webkitfullscreenchange", onChange);
    };
  }, []);

  // ── Page visibility ────────────────────────────────────────────────────────
  useEffect(() => {
    const onVis = () => {
      const v = videoRef.current;
      if (v && document.hidden) { v.pause(); setPlaying(false); }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // ── Keyboard ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === " ") { e.preventDefault(); togglePlay(); }
      if (e.key === "ArrowRight") skip(10);
      if (e.key === "ArrowLeft") skip(-10);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, togglePlay, skip]);

  // ── Show controls on play start ────────────────────────────────────────────
  useEffect(() => {
    if (playing) showCtrl();
  }, [playing, showCtrl]);

  // ── Initial controls timer ─────────────────────────────────────────────────
  useEffect(() => {
    showCtrl();
    return () => { if (ctrlTimerRef.current) clearTimeout(ctrlTimerRef.current); };
  }, [showCtrl]);

  // ── Video bounds (exact rendered area, no letterbox) ──────────────────────
  const calcVideoBounds = useCallback(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container || !video.videoWidth || !video.videoHeight) return;
    const cw = container.clientWidth;
    const ch = container.clientHeight;
    const va = video.videoWidth / video.videoHeight;
    const ca = cw / ch;
    let vw: number, vh: number, vl: number, vt: number;
    if (va > ca) {
      vw = cw; vh = cw / va; vl = 0; vt = (ch - vh) / 2;
    } else {
      vh = ch; vw = ch * va; vt = 0; vl = (cw - vw) / 2;
    }
    setVideoBounds({ left: vl, top: vt, width: vw, height: vh });
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;
    video.addEventListener("loadedmetadata", calcVideoBounds);
    const ro = new ResizeObserver(calcVideoBounds);
    ro.observe(container);
    return () => {
      video.removeEventListener("loadedmetadata", calcVideoBounds);
      ro.disconnect();
    };
  }, [calcVideoBounds]);

  // ── Watermark ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const trigger = () => {
      const x = 10 + Math.random() * 65;
      const y = 10 + Math.random() * 55;
      setWmPos({ x, y });
      setWmKey(k => k + 1);
      if (wmTimerRef.current) clearTimeout(wmTimerRef.current);
      wmTimerRef.current = setTimeout(() => setWmPos(null), WATERMARK_DURATION * 1000);
    };
    const init = setTimeout(trigger, 1000);
    wmIntervalRef.current = setInterval(trigger, WATERMARK_INTERVAL_MS);
    return () => {
      clearTimeout(init);
      if (wmIntervalRef.current) clearInterval(wmIntervalRef.current);
      if (wmTimerRef.current) clearTimeout(wmTimerRef.current);
    };
  }, []);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] bg-black dark-surface"
      >
        <style>{`
          @keyframes wm-fade {
            0%   { opacity: 0; }
            12%  { opacity: 0.75; }
            85%  { opacity: 0.75; }
            100% { opacity: 0; }
          }
          @keyframes wm-drift {
            0%   { transform: translateX(-50%) translate(0px,   0px); }
            20%  { transform: translateX(-50%) translate(10px,  -7px); }
            40%  { transform: translateX(-50%) translate(-8px,  11px); }
            60%  { transform: translateX(-50%) translate(12px,   5px); }
            80%  { transform: translateX(-50%) translate(-5px, -10px); }
            100% { transform: translateX(-50%) translate(0px,   0px); }
          }
          .player-seek { -webkit-appearance:none; appearance:none; background:transparent; cursor:pointer; width:100%; }
          .player-seek::-webkit-slider-thumb { -webkit-appearance:none; width:18px; height:18px; border-radius:50%; background:#ffffff; box-shadow:0 0 6px rgba(0,0,0,0.6); margin-top:-7px; }
          .player-seek::-webkit-slider-runnable-track { height:4px; border-radius:2px; background:transparent; }
          .player-seek::-moz-range-thumb { width:18px; height:18px; border-radius:50%; background:#ffffff; border:none; box-shadow:0 0 6px rgba(0,0,0,0.6); }
          .player-seek::-moz-range-track { height:4px; border-radius:2px; background:transparent; }
        `}</style>

        {/* ── Container ── */}
        <div
          ref={containerRef}
          className="relative flex items-center justify-center bg-black select-none"
          style={isLandscape ? {
            position: "absolute",
            width: `${window.innerHeight}px`,
            height: `${window.innerWidth}px`,
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%) rotate(90deg)",
          } : { width: "100%", height: "100%" }}
          onMouseMove={showCtrl}
          onTouchStart={showCtrl}
        >
          {/* Video */}
          <video
            ref={videoRef}
            src={src}
            autoPlay
            playsInline
            preload="auto"
            muted={muted}
            className="max-w-full max-h-full w-full h-full object-contain"
            controlsList="nodownload noremoteplayback nofullscreen"
            disablePictureInPicture
            onContextMenu={(e) => e.preventDefault()}
          />

          {/* Click area */}
          <div className="absolute inset-0 z-10" onClick={togglePlay} />

          {/* Loading */}
          {loading && !videoError && (
            <div className="absolute inset-0 z-20 flex items-center justify-center pointer-events-none">
              <Loader2 className="w-12 h-12 text-white animate-spin opacity-80" />
            </div>
          )}

          {/* Error */}
          {videoError && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 px-6" dir="rtl">
              <div className="text-4xl">⚠️</div>
              <p className="text-white text-center text-sm leading-relaxed opacity-90">{videoError}</p>
              <button
                onClick={() => {
                  const v = videoRef.current;
                  if (!v) return;
                  setVideoError(null);
                  setLoading(true);
                  v.load();
                  v.play().catch(() => {});
                }}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, #c89c1a, #a87c10)" }}
              >
                تلاش مجدد
              </button>
            </div>
          )}

          {/* ── Center play/pause feedback ── */}
          <AnimatePresence>
            {playFeedback && (
              <motion.div
                key={feedbackKey}
                initial={{ opacity: 0.9, scale: 0.6 }}
                animate={{ opacity: 0, scale: 1.4 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="absolute z-25 pointer-events-none flex items-center justify-center"
                style={{ inset: 0 }}
              >
                <div className="bg-black/40 rounded-full p-5">
                  {playFeedback === "play"
                    ? <Play className="w-12 h-12 text-white fill-white" />
                    : <Pause className="w-12 h-12 text-white fill-white" />
                  }
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ── Watermark overlay — exact video area ── */}
          {videoBounds && wmPos && (watermarkName || watermarkPhone) && (
            <div
              className="absolute z-20 pointer-events-none select-none overflow-hidden"
              style={{
                left: videoBounds.left,
                top: videoBounds.top,
                width: videoBounds.width,
                height: videoBounds.height,
              }}
            >
              <div
                key={wmKey}
                style={{
                  position: "absolute",
                  left: `${wmPos.x}%`,
                  top: `${wmPos.y}%`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  gap: "2px",
                  animation: `wm-fade ${WATERMARK_DURATION}s ease-in-out forwards, wm-drift ${WATERMARK_DURATION}s ease-in-out infinite`,
                }}
              >
                {watermarkName && (
                  <span style={{ display: "block", color: "white", fontSize: "0.85rem", fontWeight: "700", whiteSpace: "nowrap", textShadow: "0 1px 8px rgba(0,0,0,0.9)", textAlign: "center" }}>
                    {watermarkName}
                  </span>
                )}
                {watermarkPhone && (
                  <span dir="ltr" style={{ display: "block", color: "white", fontFamily: "monospace", fontSize: "0.85rem", letterSpacing: "0.08em", whiteSpace: "nowrap", textShadow: "0 1px 8px rgba(0,0,0,0.9)", textAlign: "center" }}>
                    {watermarkPhone}
                  </span>
                )}
              </div>
            </div>
          )}

          {/* ── Top bar ── */}
          <div
            className={`absolute top-0 left-0 right-0 z-30 px-4 pt-3 pb-4 bg-gradient-to-b from-black/90 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3">
              <button
                onClick={onClose}
                className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors shrink-0 mt-0.5"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex-1 min-w-0">
                {/* Session title */}
                <p className="text-white font-black text-sm leading-snug text-center drop-shadow-sm tracking-tight">
                  {title}
                </p>
                {/* Collapsible description */}
                {description && (
                  <div className="mt-2">
                    <AnimatePresence initial={false}>
                      {descExpanded && (
                        <motion.div
                          key="desc"
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.25, ease: "easeInOut" }}
                          className="overflow-hidden"
                        >
                          <div className="rounded-xl px-3 py-2 mb-1.5 text-center"
                            style={{ background: "rgba(0,0,0,0.35)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" }}>
                            <p className="text-white/80 text-xs leading-relaxed" dir="rtl">
                              {description}
                            </p>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                    <button
                      onClick={() => setDescExpanded(v => !v)}
                      className="flex items-center justify-center gap-1 mx-auto rounded-full px-3 py-0.5 text-xs font-bold transition-all"
                      style={{
                        background: descExpanded ? "rgba(251,191,36,0.15)" : "rgba(251,191,36,0.1)",
                        border: "1px solid rgba(251,191,36,0.35)",
                        color: "#fbbf24",
                      }}
                    >
                      {descExpanded
                        ? <><ChevronUp className="w-3 h-3" /><span>بستن</span></>
                        : <><ChevronDown className="w-3 h-3" /><span>توضیحات</span></>}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Bottom controls ── */}
          <div
            className={`absolute bottom-0 left-0 right-0 z-30 px-3 pt-10 bg-gradient-to-t from-black/90 via-black/50 to-transparent transition-opacity duration-300 ${showControls ? "opacity-100" : "opacity-0 pointer-events-none"}`}
            style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom) + 0.75rem)" }}
            onClick={(e) => e.stopPropagation()}
            dir="ltr"
          >
            {/* Seek bar */}
            <div className="relative h-5 flex items-center mb-2 px-1">
              <div className="absolute left-1 right-1 h-1 rounded-full overflow-hidden pointer-events-none"
                style={{ background: "rgba(255,255,255,0.22)" }}>
                <div className="absolute top-0 left-0 h-full rounded-full"
                  style={{ width: `${buffered}%`, background: "rgba(255,255,255,0.32)" }} />
                <div className="absolute top-0 left-0 h-full rounded-full transition-[width] duration-100"
                  style={{ width: `${progressPct}%`, background: "linear-gradient(90deg,#f59e0b,#fbbf24)" }} />
              </div>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                step={0.5}
                onChange={(e) => {
                  const v = videoRef.current;
                  if (v) v.currentTime = parseFloat(e.target.value);
                  showCtrl();
                }}
                className="player-seek relative z-10"
              />
            </div>

            {/* Controls row */}
            <div className="flex items-center justify-between gap-2 pb-1">
              {/* Left: play, skip, time */}
              <div className="flex items-center gap-1">
                <button onClick={togglePlay} className="text-white p-1.5 hover:text-yellow-400 transition-colors">
                  {playing ? <Pause className="w-7 h-7" /> : <Play className="w-7 h-7" />}
                </button>
                <button onClick={() => skip(-10)} className="text-white p-1.5 hover:text-yellow-400 transition-colors">
                  <RotateCcw className="w-5 h-5" />
                </button>
                <button onClick={() => skip(10)} className="text-white p-1.5 hover:text-yellow-400 transition-colors">
                  <RotateCw className="w-5 h-5" />
                </button>
                <span className="text-white/70 text-xs font-mono px-1">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
              </div>

              {/* Right: mute, speed, fullscreen */}
              <div className="flex items-center gap-1 relative">
                <button onClick={() => { setMuted(m => !m); showCtrl(); }} className="text-white p-1.5 hover:text-yellow-400 transition-colors">
                  {muted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
                </button>

                <div className="relative">
                  <button
                    onClick={() => { setShowSpeedMenu(m => !m); showCtrl(); }}
                    className="text-white text-xs px-2 py-1 rounded bg-white/10 hover:bg-white/20 transition-colors font-mono min-w-[36px] text-center"
                  >
                    ×{speed}
                  </button>
                  {showSpeedMenu && (
                    <div className="absolute bottom-full mb-2 right-0 bg-black/95 rounded-xl overflow-hidden border border-white/10 shadow-2xl" style={{ minWidth: 80 }}>
                      {SPEEDS.map(s => (
                        <button
                          key={s}
                          onClick={() => {
                            const v = videoRef.current;
                            if (v) v.playbackRate = s;
                            setSpeed(s);
                            setShowSpeedMenu(false);
                            showCtrl();
                          }}
                          className={`block w-full text-center px-4 py-2.5 text-sm font-mono transition-colors ${speed === s ? "text-yellow-400 bg-white/10 font-bold" : "text-white hover:bg-white/10"}`}
                        >
                          ×{s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <button onClick={toggleLandscape} className="text-white p-1.5 hover:text-yellow-400 transition-colors">
                  {isLandscape ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                </button>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
