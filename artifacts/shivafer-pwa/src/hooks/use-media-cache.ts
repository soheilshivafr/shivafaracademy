import { useState, useEffect, useCallback } from "react";

export type CacheStatus = "idle" | "downloading" | "cached";

export interface MediaCacheState {
  status: CacheStatus;
  progress: number;
}

type StatusMap = Record<string, MediaCacheState>;

const IDLE: MediaCacheState = { status: "idle", progress: 0 };

function swReady(): Promise<ServiceWorker | null> {
  if (!("serviceWorker" in navigator)) return Promise.resolve(null);
  return navigator.serviceWorker.ready.then((reg) => reg.active);
}

export function useMediaCache(urls: string[]) {
  const [statuses, setStatuses] = useState<StatusMap>({});

  const key = urls.join(",");

  useEffect(() => {
    if (!urls.length) return;
    swReady().then((sw) => {
      sw?.postMessage({ type: "QUERY_CACHE_STATUS", urls });
    });
  }, [key]);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handler = (event: MessageEvent) => {
      const { type } = event.data;

      if (type === "CACHE_STATUS") {
        const { statuses: incoming } = event.data as { statuses: Record<string, "cached" | "idle"> };
        setStatuses((prev) => {
          const next = { ...prev };
          for (const [url, s] of Object.entries(incoming)) {
            if (next[url]?.status === "downloading") continue;
            next[url] = { status: s, progress: s === "cached" ? 100 : 0 };
          }
          return next;
        });
      }

      if (type === "CACHE_PROGRESS") {
        const { url, progress } = event.data as { url: string; progress: number };
        setStatuses((prev) => ({ ...prev, [url]: { status: "downloading", progress } }));
      }

      if (type === "CACHE_COMPLETE") {
        const { url } = event.data as { url: string };
        setStatuses((prev) => ({ ...prev, [url]: { status: "cached", progress: 100 } }));
      }

      if (type === "CACHE_ERROR") {
        const { url } = event.data as { url: string };
        setStatuses((prev) => ({ ...prev, [url]: { status: "idle", progress: 0 } }));
      }

      if (type === "CACHE_REMOVED") {
        const { url } = event.data as { url: string };
        setStatuses((prev) => ({ ...prev, [url]: { status: "idle", progress: 0 } }));
      }

      if (type === "MEDIA_CLEARED") {
        setStatuses({});
      }
    };

    navigator.serviceWorker.addEventListener("message", handler);
    return () => navigator.serviceWorker.removeEventListener("message", handler);
  }, []);

  const cacheMedia = useCallback((url: string, fetchUrl?: string) => {
    setStatuses((prev) => ({ ...prev, [url]: { status: "downloading", progress: 0 } }));
    swReady().then((sw) => {
      sw?.postMessage({ type: "CACHE_MEDIA", url, fetchUrl: fetchUrl || url });
    });
  }, []);

  const removeMedia = useCallback((url: string) => {
    swReady().then((sw) => {
      sw?.postMessage({ type: "REMOVE_MEDIA", url });
    });
  }, []);

  const getStatus = useCallback(
    (url: string): MediaCacheState => statuses[url] ?? IDLE,
    [statuses]
  );

  return { getStatus, cacheMedia, removeMedia };
}

export function useSingleMediaCache(url: string, fetchUrl?: string) {
  const { getStatus, cacheMedia, removeMedia } = useMediaCache(url ? [url] : []);
  const state = getStatus(url);

  const toggle = useCallback(() => {
    if (!url) return;
    if (state.status === "cached") {
      removeMedia(url);
    } else if (state.status === "idle") {
      cacheMedia(url, fetchUrl);
    }
  }, [state.status, url, fetchUrl, cacheMedia, removeMedia]);

  return { ...state, toggle };
}

export interface MediaCacheItem {
  url: string;
  size: number;
}

export interface MediaCacheInfo {
  items: MediaCacheItem[];
  totalSize: number;
}

export async function getMediaCacheInfo(): Promise<MediaCacheInfo> {
  return new Promise((resolve) => {
    if (!("serviceWorker" in navigator)) { resolve({ items: [], totalSize: 0 }); return; }
    navigator.serviceWorker.ready.then((reg) => {
      const sw = reg.active;
      if (!sw) { resolve({ items: [], totalSize: 0 }); return; }

      const handler = (e: MessageEvent) => {
        if (e.data?.type === "MEDIA_ITEMS") {
          navigator.serviceWorker.removeEventListener("message", handler);
          resolve({
            items: (e.data.items as MediaCacheItem[]) ?? [],
            totalSize: (e.data.totalSize as number) ?? 0,
          });
        }
      };
      navigator.serviceWorker.addEventListener("message", handler);
      sw.postMessage({ type: "GET_MEDIA_ITEMS" });

      setTimeout(() => {
        navigator.serviceWorker.removeEventListener("message", handler);
        resolve({ items: [], totalSize: 0 });
      }, 3000);
    });
  });
}

export async function getMediaCacheItems(): Promise<string[]> {
  const { items } = await getMediaCacheInfo();
  return items.map((i) => i.url);
}

export async function removeMediaCacheItem(url: string): Promise<void> {
  const sw = await swReady();
  sw?.postMessage({ type: "REMOVE_MEDIA", url });
}

export async function clearAllMediaCache(): Promise<void> {
  const sw = await swReady();
  sw?.postMessage({ type: "CLEAR_ALL_MEDIA" });
}
