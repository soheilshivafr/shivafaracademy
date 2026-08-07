import { useState, useEffect } from "react";

const STORAGE_KEY = "shivafer_img_cache";

function loadPersistedUrls(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch {}
  return new Set();
}

const loadedUrls: Set<string> = loadPersistedUrls();

function persistUrl(src: string): void {
  if (src.startsWith("blob:")) return;
  if (loadedUrls.has(src)) return;
  loadedUrls.add(src);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadedUrls]));
  } catch {}
}

/**
 * Synchronous check — runs BEFORE the first paint.
 * Layer 1: localStorage  — URL seen in a previous session / after refresh
 * Layer 2: img.complete  — image already decoded in browser memory (same session)
 */
function isAlreadyLoaded(src: string): boolean {
  if (loadedUrls.has(src)) return true;
  try {
    const probe = new Image();
    probe.src = src;
    if (probe.complete && probe.naturalWidth > 0) {
      persistUrl(src);
      return true;
    }
  } catch {}
  return false;
}

interface CachedImageProps {
  src: string | null | undefined;
  alt: string;
  className?: string;
  style?: React.CSSProperties;
  fallback?: React.ReactNode;
  width?: number;
  height?: number;
  loading?: "lazy" | "eager";
  fetchPriority?: "high" | "low" | "auto";
}

export function CachedImage({
  src,
  alt,
  className,
  style,
  fallback,
  width,
  height,
  loading,
  fetchPriority,
}: CachedImageProps) {
  const [loaded, setLoaded] = useState<boolean>(() => !!src && isAlreadyLoaded(src));
  const [errored, setErrored] = useState(false);

  /**
   * Layer 3: img.decode() — runs after first paint via useEffect.
   *
   * Catches images in the browser's HTTP disk cache whose img.complete was
   * still false at synchronous check time (disk cache reads are asynchronous
   * in the browser's network thread). For immutable disk-cached images,
   * decode() resolves in < 1 frame, so the opacity-0 flash is imperceptible.
   */
  useEffect(() => {
    if (loaded || !src || errored) return;
    let cancelled = false;
    const probe = new Image();
    probe.src = src;
    probe
      .decode()
      .then(() => {
        if (!cancelled) {
          persistUrl(src);
          setLoaded(true);
        }
      })
      .catch(() => {
        // Not cached — the real <img> onLoad handler will take over
      });
    return () => {
      cancelled = true;
    };
  }, [src, loaded, errored]);

  if (!src || errored) {
    return fallback ? <>{fallback}</> : null;
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      fetchPriority={fetchPriority}
      style={{
        ...style,
        opacity: loaded ? 1 : 0,
        transition: loaded ? undefined : "opacity 0.15s ease",
      }}
      onLoad={() => {
        persistUrl(src);
        setLoaded(true);
      }}
      onError={() => setErrored(true)}
    />
  );
}
