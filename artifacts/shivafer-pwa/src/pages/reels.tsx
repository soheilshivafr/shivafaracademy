import { useState, useEffect, useRef, useCallback } from "react";
import { useGetReels, Reel } from "@workspace/api-client-react";
import { Play, Volume2, VolumeX, Download, CheckCircle2, Loader2, Trash2 } from "lucide-react";
import { Link } from "wouter";
import { useSingleMediaCache } from "@/hooks/use-media-cache";

const NAV_H = "5rem";

export default function Reels() {
  const { data: reels, isLoading } = useGetReels();
  const containerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [showUnmuteHint, setShowUnmuteHint] = useState(false);
  const touchStartY = useRef<number>(0);
  const isSwiping = useRef(false);

  // ── Mark current reel as seen ──────────────────────────────────────────────
  useEffect(() => {
    if (!reels || reels.length === 0) return;
    const reel = reels[currentIndex];
    if (!reel) return;
    const id = String(reel.id);
    const seen = new Set<string>(
      JSON.parse(localStorage.getItem("seenReelIds") || "[]"),
    );
    if (!seen.has(id)) {
      seen.add(id);
      localStorage.setItem("seenReelIds", JSON.stringify([...seen]));
      window.dispatchEvent(new Event("shivafer-seen-update"));
    }
  }, [currentIndex, reels]);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartY.current = e.touches[0].clientY;
    isSwiping.current = false;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isSwiping.current) return;
    const diff = touchStartY.current - e.changedTouches[0].clientY;
    if (Math.abs(diff) < 40) return;
    isSwiping.current = true;
    const total = reels?.length ?? 0;
    setCurrentIndex(prev => {
      const next = diff > 0 ? prev + 1 : prev - 1;
      return Math.max(0, Math.min(total - 1, next));
    });
  }, [reels]);

  if (isLoading) {
    return (
      <div className="w-full bg-black flex items-center justify-center" style={{ height: `calc(100dvh - ${NAV_H})` }}>
        <ReelsLoadingAnimation />
      </div>
    );
  }

  if (!reels || reels.length === 0) {
    return (
      <div className="w-full flex flex-col items-center justify-center text-muted-foreground" style={{ height: `calc(100dvh - ${NAV_H})` }}>
        <Play className="w-16 h-16 mb-4 opacity-20" />
        <p>هیچ ویدیویی یافت نشد</p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      className="w-full bg-black relative overflow-hidden"
      style={{
        height: `calc(100dvh - ${NAV_H})`,
        overscrollBehavior: "none",
        touchAction: "none",
      }}
    >
      {/* گرادیان تاریک بالا — خوانایی روی هر رنگ ویدیو */}
      <div
        className="fixed top-0 left-0 right-0 z-29 pointer-events-none"
        style={{
          height: "120px",
          background: "linear-gradient(to bottom, rgba(0,0,0,0.55) 0%, transparent 100%)",
        }}
      />

      {/* سوییچر شیشه‌ای بالا */}
      <div className="fixed top-0 left-0 right-0 z-30 flex justify-center" style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}>
        <div
          className="flex items-center rounded-2xl overflow-hidden"
          style={{
            background: "rgba(0,0,0,0.42)",
            backdropFilter: "blur(20px) saturate(160%)",
            WebkitBackdropFilter: "blur(20px) saturate(160%)",
            border: "1px solid rgba(255,255,255,0.18)",
            boxShadow: "0 4px 24px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.2)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {[
            { label: "کانال", href: "/channel" },
            { label: "ابزارها", href: "/tools" },
            { label: "پادکست‌ها", href: "/podcasts" },
          ].map((tab, i) => (
            <Link key={tab.href} href={tab.href}>
              <div className="flex items-center">
                {/* جداساز */}
                {i > 0 && (
                  <div style={{
                    width: "1px",
                    height: "18px",
                    background: "linear-gradient(to bottom, transparent, rgba(255,255,255,0.25), transparent)",
                    flexShrink: 0,
                  }} />
                )}
                <div
                  className="relative px-5 py-2.5 text-sm font-bold transition-all duration-150 active:scale-95 cursor-pointer select-none"
                  style={{
                    color: "rgba(255,255,255,0.92)",
                    textShadow: "0 1px 4px rgba(0,0,0,0.8), 0 0 12px rgba(0,0,0,0.5)",
                    letterSpacing: "0.01em",
                  }}
                >
                  {tab.label}
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* دکمه صدا */}
      <button
        onClick={(e) => { e.stopPropagation(); setIsMuted((m) => !m); }}
        className="fixed z-30 w-9 h-9 bg-black/65 backdrop-blur-md rounded-full flex items-center justify-center text-white ring-2 ring-white/40 shadow-[0_2px_12px_rgba(0,0,0,0.55)]"
        style={{ top: "calc(env(safe-area-inset-top) + 12px)", left: "1rem" }}
      >
        {isMuted ? <VolumeX className="w-4 h-4" color="white" /> : <Volume2 className="w-4 h-4" color="white" />}
      </button>

      {reels.map((reel, index) => (
        <ReelPlayer
          key={reel.id}
          reel={reel}
          isActive={index === currentIndex}
          preload={index > currentIndex && index <= currentIndex + 2}
          isMuted={isMuted}
          onForceMute={() => { setIsMuted(true); setShowUnmuteHint(true); }}
          translateY={`calc(${(index - currentIndex) * 100}% )`}
        />
      ))}

      {showUnmuteHint && isMuted && (
        <button
          onClick={(e) => { e.stopPropagation(); setIsMuted(false); setShowUnmuteHint(false); }}
          className="fixed bottom-44 left-1/2 -translate-x-1/2 z-40 flex items-center gap-2 bg-black/70 backdrop-blur-md text-white text-sm px-4 py-2 rounded-full animate-pulse"
        >
          <Volume2 className="w-4 h-4" />
          برای صدا لمس کنید
        </button>
      )}
    </div>
  );
}

function ReelsLoadingAnimation() {
  return (
    <div className="flex flex-col items-center gap-6">
      {/* حلقه دوار بیرونی */}
      <div className="relative w-20 h-20">
        <div
          className="absolute inset-0 rounded-full border-4 border-white/10"
        />
        <div
          className="absolute inset-0 rounded-full border-4 border-t-primary border-r-primary border-b-transparent border-l-transparent animate-spin"
          style={{ animationDuration: "0.9s" }}
        />
        <div
          className="absolute inset-2 rounded-full border-2 border-t-transparent border-r-transparent border-b-primary/60 border-l-primary/60 animate-spin"
          style={{ animationDuration: "1.4s", animationDirection: "reverse" }}
        />
        {/* آیکون پلی وسط */}
        <div className="absolute inset-0 flex items-center justify-center">
          <Play className="w-7 h-7 text-white fill-white ml-0.5 opacity-80" />
        </div>
      </div>

      {/* باره‌های صوتی متحرک */}
      <div className="flex items-end gap-1.5" style={{ height: 28 }}>
        {[0.4, 0.7, 1, 0.6, 0.9, 0.5, 0.8, 0.3, 0.75, 0.55, 0.85, 0.45].map((h, i) => (
          <div
            key={i}
            className="w-1 rounded-full bg-primary"
            style={{
              height: `${h * 28}px`,
              animation: `reelBar 0.9s ease-in-out infinite alternate`,
              animationDelay: `${i * 0.07}s`,
              opacity: 0.7 + h * 0.3,
            }}
          />
        ))}
      </div>

      <p className="text-white/50 text-sm font-medium tracking-wide">در حال بارگذاری...</p>

      <style>{`
        @keyframes reelBar {
          0%   { transform: scaleY(0.3); }
          100% { transform: scaleY(1); }
        }
      `}</style>
    </div>
  );
}

function ReelPlayer({
  reel,
  isActive,
  preload,
  isMuted,
  onForceMute,
  translateY,
}: {
  reel: Reel;
  isActive: boolean;
  preload: boolean;
  isMuted: boolean;
  onForceMute: () => void;
  translateY: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [isBuffering, setIsBuffering] = useState(true);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (isActive) {
      video.muted = isMuted;
      setIsBuffering(true);
      video.currentTime = 0;
      video.play()
        .catch(() => {
          // iOS blocks unmuted autoplay — retry muted
          video.muted = true;
          onForceMute();
          video.play().catch(() => {});
        });
    } else {
      video.pause();
      setIsPlaying(false);
      setIsBuffering(false);
    }
  }, [isActive]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = isMuted;
  }, [isMuted]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (isPlaying) {
      video.pause();
      setIsPlaying(false);
    } else {
      video.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const streamUrl = `/api/stream/reel/${reel.id}`;
  const posterUrl = `/api/stream/reel/${reel.id}/thumbnail`;
  const isVideoUrl = !hasError && !!reel.videoUrl;
  const { status: cacheStatus, progress: cacheProgress, toggle: toggleCache } = useSingleMediaCache(streamUrl);

  const prevCacheStatus = useRef(cacheStatus);
  const shouldReloadOnEnd = useRef(false);

  useEffect(() => {
    if (prevCacheStatus.current === "downloading" && cacheStatus === "cached") {
      shouldReloadOnEnd.current = true;
    }
    prevCacheStatus.current = cacheStatus;
  }, [cacheStatus]);

  const reloadFromCache = () => {
    const video = videoRef.current;
    if (!video) return;
    shouldReloadOnEnd.current = false;
    setIsBuffering(true);
    video.load();
    video.play().catch(() => {
      video.muted = true;
      onForceMute();
      video.play().catch(() => {});
    });
  };

  const handleWaiting = () => {
    setIsBuffering(true);
    if (shouldReloadOnEnd.current) {
      reloadFromCache();
    }
  };

  const handleEnded = () => {
    if (shouldReloadOnEnd.current) {
      reloadFromCache();
    } else {
      const video = videoRef.current;
      if (!video) return;
      video.currentTime = 0;
      video.play().catch(() => {});
    }
  };

  return (
    <div
      className="w-full absolute left-0 right-0 bg-black cursor-pointer"
      style={{
        height: `calc(100dvh - ${NAV_H})`,
        top: 0,
        transform: `translateY(${translateY})`,
        transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
        willChange: "transform",
      }}
      data-testid={`reel-item-${reel.id}`}
      onClick={togglePlay}
    >
      {isVideoUrl ? (
        <video
          ref={videoRef}
          src={streamUrl}
          poster={posterUrl}
          className="h-full w-full object-cover"
          playsInline
          preload={isActive ? "auto" : preload ? "auto" : "none"}
          onError={() => { setHasError(true); setIsBuffering(false); }}
          onPlaying={() => setIsPlaying(true)}
          onTimeUpdate={() => { setIsPlaying(true); setIsBuffering(false); }}
          onPause={() => setIsPlaying(false)}
          onWaiting={handleWaiting}
          onEnded={handleEnded}
          controlsList="nodownload noremoteplayback"
          onContextMenu={(e) => e.preventDefault()}
        />
      ) : (
        <div
          className="h-full w-full bg-cover bg-center"
          style={{ backgroundImage: `url(${reel.videoUrl})` }}
        />
      )}

      {/* لودینگ موقع بافرینگ */}
      {isBuffering && isActive && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 pointer-events-none">
          <ReelsLoadingAnimation />
        </div>
      )}


      {!isPlaying && !isBuffering && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
          <div className="w-20 h-20 bg-black/50 rounded-full flex items-center justify-center backdrop-blur-sm">
            <Play className="w-10 h-10 text-white fill-white ml-1" />
          </div>
        </div>
      )}

      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" style={{ paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom))", paddingLeft: "1rem", paddingRight: "1rem", paddingTop: "3rem" }}>
        <div className="flex items-end justify-between gap-2">
          <h2 className="text-base font-bold drop-shadow-md text-right leading-snug flex-1" style={{ color: "white" }}>
            {reel.title}
          </h2>
        </div>
      </div>
    </div>
  );
}
