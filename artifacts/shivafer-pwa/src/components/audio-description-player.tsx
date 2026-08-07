/**
 * AudioDescriptionPlayer
 *
 * نمایش کارت دعوت صوتی + پلیر شناور کوچک
 * ─────────────────────────────────────────
 * • بعد از ۲–۵ ثانیه از ورود به صفحه نمایش داده می‌شود
 * • فقط وقتی کاربر صاحب آیتم نیست و آیتم audioUrl دارد
 * • با کلیک Play، کارت بسته می‌شود و پلیر شناور نمایش می‌یابد
 * • پلیر شناور: Play/Pause + نوار پیشرفت + Close — کاربر می‌تواند
 *   همزمان در صفحه گشت‌و‌گذار کند
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, X, Headphones, Volume2,
} from "lucide-react";

interface AudioDescriptionPlayerProps {
  audioUrl: string;
  title: string;
  /** رنگ accent آیتم (طلایی برای محصول، بنفش برای دوره، …) */
  color?: string;
  /** نوع آیتم برای متن پیام */
  itemType?: "product" | "course";
  /**
   * فاصله از پایین صفحه (px) — برای قرار گرفتن بالای دکمه خرید
   * پیش‌فرض: بالای نوار ناوبری
   */
  bottomOffset?: number;
}

export function AudioDescriptionPlayer({
  audioUrl,
  title,
  color = "#e8b800",
  itemType = "product",
  bottomOffset,
}: AudioDescriptionPlayerProps) {
  const [phase, setPhase] = useState<"idle" | "invite" | "player">("idle");
  const [dismissed, setDismissed] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  // ── نمایش کارت دعوت بعد از ۲–۵ ثانیه ──────────────────────────────
  useEffect(() => {
    if (dismissed) return;
    const delay = 2000 + Math.random() * 3000;
    const t = setTimeout(() => setPhase("invite"), delay);
    return () => clearTimeout(t);
  }, [dismissed]);

  // ── پخش صدا ──────────────────────────────────────────────────────────
  const handlePlay = useCallback(() => {
    setPhase("player");
    const el = audioRef.current;
    if (!el) return;
    el.play().catch(() => {});
    setPlaying(true);
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setPhase("idle");
  }, []);

  const togglePlay = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (playing) {
      el.pause();
      setPlaying(false);
    } else {
      el.play().catch(() => {});
      setPlaying(true);
    }
  }, [playing]);

  const closePlayer = useCallback(() => {
    const el = audioRef.current;
    if (el) {
      el.pause();
      el.currentTime = 0;
    }
    setPlaying(false);
    setPhase("idle");
    setDismissed(true);
  }, []);

  // ── کلیک روی نوار پیشرفت ─────────────────────────────────────────────
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = audioRef.current;
    const bar = progressRef.current;
    if (!el || !bar || !duration) return;
    const rect = bar.getBoundingClientRect();
    // نوار از چپ به راست (LTR)
    const ratio = (e.clientX - rect.left) / rect.width;
    el.currentTime = ratio * duration;
  }, [duration]);

  const fmt = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // موقعیت از پایین صفحه — بالای دکمه خرید (nav + ارتفاع دکمه خرید ≈ +96px)
  const bottomStyle = bottomOffset !== undefined
    ? `${bottomOffset}px`
    : "calc(5rem + env(safe-area-inset-bottom) + 96px)";

  return (
    <>
      {/* ── عنصر صوتی مخفی ────────────────────────────────────────────── */}
      <audio
        ref={audioRef}
        src={audioUrl}
        preload="metadata"
        onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
      />

      {/* ── کارت دعوت ────────────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === "invite" && (
          <motion.div
            key="invite-card"
            initial={{ opacity: 0, y: 64, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 48, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 320, damping: 28 }}
            className="fixed left-3 right-3 z-[70]"
            style={{
              bottom: bottomStyle,
              maxWidth: 430,
              margin: "0 auto",
            }}
          >
            <div
              className="relative rounded-3xl overflow-hidden"
              style={{
                background:
                  "linear-gradient(160deg, rgba(12,9,18,0.97) 0%, rgba(8,6,12,0.97) 100%)",
                border: `1.5px solid ${color}55`,
                boxShadow: `0 24px 64px rgba(0,0,0,0.7), 0 0 48px ${color}18, inset 0 1px 0 rgba(255,255,255,0.07)`,
                backdropFilter: "blur(28px)",
                WebkitBackdropFilter: "blur(28px)",
              }}
            >
              {/* نوار رنگی بالا */}
              <div
                style={{
                  position: "absolute",
                  top: 0, left: 0, right: 0,
                  height: 2,
                  background: `linear-gradient(90deg, transparent 0%, ${color}99 30%, ${color} 50%, ${color}99 70%, transparent 100%)`,
                }}
              />

              {/* نورهای دکوراتیو */}
              <div
                style={{
                  position: "absolute",
                  top: -40, right: -40,
                  width: 120, height: 120,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${color}22 0%, transparent 70%)`,
                  pointerEvents: "none",
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: -30, left: -30,
                  width: 90, height: 90,
                  borderRadius: "50%",
                  background: `radial-gradient(circle, ${color}14 0%, transparent 70%)`,
                  pointerEvents: "none",
                }}
              />

              <div className="relative p-5" dir="rtl" style={{ color: "#ffffff" }}>
                {/* ردیف بالا — آیکون + عنوان + بستن */}
                <div className="flex items-start justify-between mb-4 gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <motion.div
                      className="w-11 h-11 rounded-2xl flex items-center justify-center flex-shrink-0"
                      style={{
                        background: `${color}1a`,
                        border: `1.5px solid ${color}55`,
                        boxShadow: `0 0 20px ${color}30`,
                      }}
                      animate={{
                        scale: [1, 1.07, 1],
                        boxShadow: [
                          `0 0 12px ${color}28`,
                          `0 0 24px ${color}55`,
                          `0 0 12px ${color}28`,
                        ],
                      }}
                      transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
                    >
                      <Headphones className="w-5 h-5" style={{ color }} />
                    </motion.div>

                    <div className="min-w-0">
                      <p className="text-[11px] font-bold mb-0.5" style={{ color: `${color}99` }}>
                        توضیحات صوتی
                      </p>
                      <p className="text-sm font-black truncate leading-snug" style={{ color: "rgba(255,255,255,0.9)" }}>
                        {title}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={handleDismiss}
                    className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 active:scale-90 transition-transform"
                    style={{
                      background: "rgba(255,255,255,0.06)",
                      border: "1px solid rgba(255,255,255,0.1)",
                    }}
                    aria-label="بستن"
                  >
                    <X className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.35)" }} />
                  </button>
                </div>

                {/* متن سوال */}
                <p className="text-sm font-bold mb-5 leading-relaxed" style={{ color: "rgba(255,255,255,0.75)" }}>
                  تمایل دارید توضیحات این{" "}
                  <span style={{ color }}>{itemType === "course" ? "دوره" : "محصول"}</span>{" "}
                  را <span style={{ color: "rgba(255,255,255,0.9)" }}>صوتی</span> بشنوید؟
                </p>

                {/* دکمه Play بزرگ */}
                <motion.button
                  onClick={handlePlay}
                  whileTap={{ scale: 0.96 }}
                  className="w-full h-14 rounded-2xl flex items-center justify-center gap-3 font-black text-[15px] relative overflow-hidden"
                  style={{
                    background: `linear-gradient(135deg, ${color}, ${color}cc)`,
                    color: "#09070e",
                    boxShadow: `0 8px 32px ${color}50, 0 2px 8px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)`,
                  }}
                >
                  {/* shimmer sweep */}
                  <motion.span
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background:
                        "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.28) 50%, transparent 70%)",
                    }}
                    initial={{ x: "130%" }}
                    animate={{ x: "-130%" }}
                    transition={{
                      duration: 2.4,
                      repeat: Infinity,
                      repeatDelay: 1.2,
                      ease: "easeInOut",
                    }}
                  />

                  <div
                    className="w-9 h-9 rounded-full flex items-center justify-center relative z-10"
                    style={{ background: "rgba(0,0,0,0.22)" }}
                  >
                    <Play className="w-5 h-5" style={{ marginRight: -2 }} />
                  </div>
                  <span className="relative z-10">پخش توضیحات صوتی</span>
                </motion.button>

                {/* نوارهای صوتی دکوراتیو */}
                <div className="flex gap-1 items-end justify-center mt-3 h-5 opacity-40">
                  {[3, 7, 5, 9, 4, 8, 3, 6, 4, 8, 5, 7, 3].map((h, i) => (
                    <motion.div
                      key={i}
                      className="w-[3px] rounded-full"
                      style={{ background: color }}
                      animate={{ height: [`${h}px`, `${h * 2}px`, `${h}px`] }}
                      transition={{
                        duration: 1.0,
                        repeat: Infinity,
                        delay: i * 0.09,
                        ease: "easeInOut",
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── پلیر شناور کوچک ──────────────────────────────────────────── */}
      <AnimatePresence>
        {phase === "player" && (
          <motion.div
            key="floating-player"
            initial={{ opacity: 0, y: 56 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 40, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="fixed left-3 right-3 z-[70]"
            style={{
              bottom: bottomStyle,
              maxWidth: 430,
              margin: "0 auto",
            }}
          >
            <div
              className="relative rounded-2xl overflow-hidden"
              style={{
                background: "rgba(10,8,16,0.97)",
                border: `1.5px solid ${color}44`,
                boxShadow: `0 12px 40px rgba(0,0,0,0.65), 0 0 24px ${color}18, inset 0 1px 0 rgba(255,255,255,0.06)`,
                backdropFilter: "blur(24px)",
                WebkitBackdropFilter: "blur(24px)",
              }}
            >
              {/* نوار پیشرفت — قابل کلیک */}
              <div
                ref={progressRef}
                onClick={handleProgressClick}
                className="h-1 cursor-pointer relative"
                style={{ background: "rgba(255,255,255,0.08)" }}
              >
                <div
                  className="absolute top-0 left-0 h-full rounded-full transition-none"
                  style={{
                    width: `${progress}%`,
                    background: `linear-gradient(90deg, ${color}88, ${color})`,
                  }}
                />
                {/* دکمه‌ی کشیدنی */}
                {progress > 0 && (
                  <div
                    className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full"
                    style={{
                      left: `calc(${progress}% - 6px)`,
                      background: color,
                      boxShadow: `0 0 6px ${color}99`,
                    }}
                  />
                )}
              </div>

              {/* ردیف اصلی */}
              <div className="flex items-center gap-3 px-4 py-3" dir="rtl" style={{ color: "#ffffff" }}>
                {/* آیکون */}
                <motion.div
                  className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: `${color}18`, border: `1px solid ${color}44` }}
                  animate={playing ? { boxShadow: [`0 0 8px ${color}30`, `0 0 18px ${color}55`, `0 0 8px ${color}30`] } : { boxShadow: "none" }}
                  transition={playing ? { duration: 1.6, repeat: Infinity } : {}}
                >
                  <Volume2 className="w-4 h-4" style={{ color }} />
                </motion.div>

                {/* عنوان + زمان */}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-black truncate leading-tight" style={{ color: "rgba(255,255,255,0.85)" }}>
                    {title}
                  </p>
                  <p className="text-[10px] mt-0.5 font-medium" dir="ltr" style={{ color: "rgba(255,255,255,0.35)" }}>
                    {fmt(currentTime)} / {fmt(duration)}
                  </p>
                </div>

                {/* نوارهای صوتی متحرک */}
                <AnimatePresence>
                  {playing && (
                    <motion.div
                      key="bars"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.8 }}
                      className="flex gap-[3px] items-end h-5 flex-shrink-0"
                    >
                      {[4, 7, 5, 9, 4, 7, 5].map((h, i) => (
                        <motion.div
                          key={i}
                          className="w-[2.5px] rounded-full"
                          style={{ background: color }}
                          animate={{ height: [`${h}px`, `${h * 2.4}px`, `${h}px`] }}
                          transition={{
                            duration: 0.65,
                            repeat: Infinity,
                            delay: i * 0.09,
                            ease: "easeInOut",
                          }}
                        />
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* دکمه Play/Pause */}
                <button
                  onClick={togglePlay}
                  className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
                  style={{
                    background: playing ? `${color}28` : `${color}18`,
                    border: `1.5px solid ${color}${playing ? "70" : "45"}`,
                    boxShadow: playing ? `0 0 16px ${color}40` : "none",
                  }}
                  aria-label={playing ? "توقف" : "پخش"}
                >
                  {playing
                    ? <Pause className="w-4 h-4" style={{ color }} />
                    : <Play className="w-4 h-4" style={{ color, marginRight: -1 }} />
                  }
                </button>

                {/* دکمه بستن */}
                <button
                  onClick={closePlayer}
                  className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.08)",
                  }}
                  aria-label="بستن پلیر"
                >
                  <X className="w-3.5 h-3.5" style={{ color: "rgba(255,255,255,0.35)" }} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
