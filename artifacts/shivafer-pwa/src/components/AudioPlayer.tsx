import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Play, Pause, RotateCcw, RotateCw, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { usePlayer } from "@/lib/player-context";

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

function formatTime(s: number) {
  if (!isFinite(s) || isNaN(s)) return "0:00";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

interface AudioPlayerProps {
  src: string;
  title: string;
  description?: string;
  onClose: () => void;
}

export function AudioPlayer({ src, title, description, onClose }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const { openPlayer, closePlayer } = usePlayer();

  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [descExpanded, setDescExpanded] = useState(false);

  useEffect(() => {
    openPlayer();
    return () => closePlayer();
  }, [openPlayer, closePlayer]);

  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;

    const onTimeUpdate = () => {
      setCurrentTime(a.currentTime);
      if (a.buffered.length > 0 && a.duration > 0)
        setBuffered((a.buffered.end(a.buffered.length - 1) / a.duration) * 100);
    };
    const onDuration = () => setDuration(a.duration);
    const onPlay = () => { setPlaying(true); setAudioError(null); };
    const onPause = () => setPlaying(false);
    const onPlaying = () => { setLoading(false); setAudioError(null); };
    const onWaiting = () => setLoading(true);
    const onCanPlay = () => setLoading(false);
    const onError = () => {
      setAudioError("مشکلی در بارگذاری فایل صوتی پیش آمد. اتصال اینترنت خود را بررسی کنید.");
      setLoading(false);
    };

    a.addEventListener("timeupdate", onTimeUpdate);
    a.addEventListener("durationchange", onDuration);
    a.addEventListener("play", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("playing", onPlaying);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("canplay", onCanPlay);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTimeUpdate);
      a.removeEventListener("durationchange", onDuration);
      a.removeEventListener("play", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("playing", onPlaying);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("canplay", onCanPlay);
      a.removeEventListener("error", onError);
    };
  }, []);

  const togglePlay = useCallback(() => {
    const a = audioRef.current;
    if (!a) return;
    a.paused ? a.play() : a.pause();
  }, []);

  const skip = useCallback((sec: number) => {
    const a = audioRef.current;
    if (!a) return;
    a.currentTime = Math.max(0, Math.min(a.duration || 0, a.currentTime + sec));
  }, []);

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

  // Media Session API — پخش در پس‌زمینه و کنترل از نوار اعلان
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist: "شیوافر آکادمی",
      album: "",
    });
    navigator.mediaSession.setActionHandler("play", () => { audioRef.current?.play(); });
    navigator.mediaSession.setActionHandler("pause", () => { audioRef.current?.pause(); });
    navigator.mediaSession.setActionHandler("seekbackward", () => skip(-10));
    navigator.mediaSession.setActionHandler("seekforward", () => skip(10));
    return () => {
      try {
        navigator.mediaSession.setActionHandler("play", null);
        navigator.mediaSession.setActionHandler("pause", null);
        navigator.mediaSession.setActionHandler("seekbackward", null);
        navigator.mediaSession.setActionHandler("seekforward", null);
      } catch { /* ignore */ }
    };
  }, [title, skip]);

  // آپدیت وضعیت Media Session
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;
    navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  }, [playing]);

  // آپدیت موقعیت Media Session
  useEffect(() => {
    if (!("mediaSession" in navigator) || !duration) return;
    try {
      navigator.mediaSession.setPositionState({
        duration,
        playbackRate: speed,
        position: currentTime,
      });
    } catch { /* ignore */ }
  }, [currentTime, duration, speed]);

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return createPortal(
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[200] flex flex-col dark-surface"
        style={{ background: "linear-gradient(160deg, #0a0618 0%, #0f0820 40%, #0c0a1a 100%)" }}
      >
        <style>{`
          .audio-seek { -webkit-appearance:none; appearance:none; background:transparent; cursor:pointer; width:100%; direction:ltr; }
          .audio-seek::-webkit-slider-thumb { -webkit-appearance:none; width:20px; height:20px; border-radius:50%; background:#ffffff; box-shadow:0 0 8px rgba(124,58,237,0.7); margin-top:-8px; }
          .audio-seek::-webkit-slider-runnable-track { height:4px; border-radius:2px; background:transparent; }
          .audio-seek::-moz-range-thumb { width:20px; height:20px; border-radius:50%; background:#ffffff; border:none; box-shadow:0 0 8px rgba(124,58,237,0.7); }
          .audio-seek::-moz-range-track { height:4px; border-radius:2px; background:transparent; }
        `}</style>

        <audio ref={audioRef} src={src} autoPlay preload="auto" />

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 pt-safe-top pt-4 pb-2" dir="rtl">
          <button onClick={onClose} className="p-2 rounded-full bg-white/10 text-white hover:bg-white/20 transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
          <div className="flex-1 min-w-0">
            <p className="text-white font-black text-sm leading-snug text-center drop-shadow-sm tracking-tight">
              {title}
            </p>
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
                        style={{ background: "rgba(255,255,255,0.06)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" }}>
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
                    background: descExpanded ? "rgba(167,139,250,0.18)" : "rgba(167,139,250,0.1)",
                    border: "1px solid rgba(167,139,250,0.35)",
                    color: "#a78bfa",
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

        {/* Center artwork / loading / error */}
        <div className="flex-1 flex flex-col items-center justify-center px-8 gap-6">
          {audioError ? (
            <div className="flex flex-col items-center gap-4 text-center px-4">
              <div className="text-4xl">⚠️</div>
              <p className="text-white text-sm leading-relaxed opacity-90">{audioError}</p>
              <button
                onClick={() => {
                  const a = audioRef.current;
                  if (!a) return;
                  setAudioError(null);
                  setLoading(true);
                  a.load();
                  a.play().catch(() => {});
                }}
                className="px-6 py-2.5 rounded-xl text-sm font-bold text-white"
                style={{ background: "linear-gradient(135deg, var(--gold-primary), #a87c10)" }}
              >
                تلاش مجدد
              </button>
            </div>
          ) : (
            <>
              {/* Album art placeholder */}
              <div className="w-52 h-52 rounded-3xl flex items-center justify-center relative overflow-hidden shadow-2xl"
                style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(79,70,229,0.2))", border: "1px solid rgba(124,58,237,0.3)" }}>
                <motion.div
                  animate={playing ? { scale: [1, 1.08, 1], opacity: [0.6, 1, 0.6] } : { scale: 1, opacity: 0.5 }}
                  transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                  className="absolute inset-0 rounded-3xl"
                  style={{ background: "radial-gradient(circle at center, rgba(124,58,237,0.4), transparent 70%)" }}
                />
                {loading && !audioError ? (
                  <Loader2 className="w-16 h-16 text-violet-400 animate-spin" />
                ) : (
                  <motion.div
                    animate={playing ? { rotate: 360 } : { rotate: 0 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                    className="w-24 h-24 rounded-full flex items-center justify-center"
                    style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.5), rgba(79,70,229,0.4))", border: "2px solid rgba(124,58,237,0.5)" }}
                  >
                    <div className="w-4 h-4 rounded-full bg-white/20" />
                  </motion.div>
                )}
              </div>

              {/* Waveform visualization bars */}
              <div className="flex items-end gap-1 h-10">
                {Array.from({ length: 20 }).map((_, i) => (
                  <motion.div
                    key={i}
                    className="w-1.5 rounded-full"
                    style={{ background: "rgba(124,58,237,0.7)" }}
                    animate={playing ? {
                      height: [`${12 + Math.random() * 24}px`, `${12 + Math.random() * 24}px`, `${12 + Math.random() * 24}px`],
                    } : { height: "6px" }}
                    transition={{ duration: 0.6, repeat: Infinity, repeatType: "reverse", delay: i * 0.05 }}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Bottom controls */}
        <div className="px-6 pb-safe-bottom" style={{ paddingBottom: "max(2rem, env(safe-area-inset-bottom) + 1.5rem)" }}>
          {/* Progress bar — dir=ltr تا از چپ به راست پر شود */}
          <div className="relative h-6 flex items-center mb-2" dir="ltr">
            <div className="absolute left-0 right-0 h-1.5 rounded-full overflow-hidden pointer-events-none"
              style={{ background: "rgba(255,255,255,0.18)" }}>
              <div className="absolute top-0 left-0 h-full rounded-full"
                style={{ width: `${buffered}%`, background: "rgba(255,255,255,0.28)" }} />
              <div className="absolute top-0 left-0 h-full rounded-full transition-[width] duration-100"
                style={{ width: `${progressPct}%`, background: "linear-gradient(90deg,#7c3aed,#a78bfa)" }} />
            </div>
            <input
              type="range" min={0} max={duration || 100} value={currentTime} step={0.5}
              onChange={(e) => { const a = audioRef.current; if (a) a.currentTime = parseFloat(e.target.value); }}
              className="audio-seek relative z-10"
            />
          </div>
          {/* زمان‌ها — dir=ltr: زمان جاری چپ، مدت کل راست */}
          <div className="flex justify-between text-xs text-white/50 mb-4 px-1 font-mono" dir="ltr">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>

          {/* Controls row */}
          <div className="flex items-center justify-between gap-2">
            <button onClick={() => skip(-10)} className="p-3 text-white/70 hover:text-white transition-colors">
              <RotateCcw className="w-6 h-6" />
            </button>

            <button onClick={togglePlay}
              className="w-16 h-16 rounded-full flex items-center justify-center shadow-xl text-white"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
              {loading && !audioError ? (
                <Loader2 className="w-7 h-7 animate-spin" />
              ) : playing ? (
                <Pause className="w-7 h-7" />
              ) : (
                <Play className="w-7 h-7 mr-[-2px]" />
              )}
            </button>

            <button onClick={() => skip(10)} className="p-3 text-white/70 hover:text-white transition-colors">
              <RotateCw className="w-6 h-6" />
            </button>
          </div>

          {/* Speed control — dir=ltr: 1x چپ، 2x راست */}
          <div className="flex items-center justify-center mt-4 relative">
            <button
              onClick={() => setShowSpeedMenu(m => !m)}
              className="text-sm px-4 py-2 rounded-full text-white/70 font-mono border border-white/15 bg-white/5 hover:bg-white/10 transition-colors"
            >
              سرعت: ×{speed}
            </button>
            {showSpeedMenu && (
              <div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-black/95 rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex" dir="ltr">
                {SPEEDS.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      const a = audioRef.current;
                      if (a) a.playbackRate = s;
                      setSpeed(s);
                      setShowSpeedMenu(false);
                    }}
                    className={`px-4 py-3 text-sm font-mono transition-colors ${speed === s ? "text-violet-400 bg-white/10 font-bold" : "text-white hover:bg-white/10"}`}
                  >
                    ×{s}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>,
    document.body
  );
}
