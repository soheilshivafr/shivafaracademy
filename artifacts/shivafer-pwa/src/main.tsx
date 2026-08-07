import { createRoot } from "react-dom/client";
import { setBaseUrl, setAuthTokenGetter, setDeviceIdGetter } from "@workspace/api-client-react";
import App from "./App";
import "./index.css";
import { setupAudioUnlock } from "./lib/audio-unlock";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function getOrCreateDeviceId(): string {
  const key = "shivafer_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

// Handle auto-login token from admin panel
const urlParams = new URLSearchParams(window.location.search);
const pwaToken = urlParams.get("pwa_token");
if (pwaToken) {
  localStorage.setItem("shivafer_token", pwaToken);
  urlParams.delete("pwa_token");
  const newSearch = urlParams.toString();
  const newUrl = window.location.pathname + (newSearch ? `?${newSearch}` : "") + window.location.hash;
  window.history.replaceState({}, "", newUrl);
}

// setBaseUrl not needed — generated hooks already include /api prefix from OpenAPI spec
setAuthTokenGetter(() => localStorage.getItem("shivafer_token"));
setDeviceIdGetter(getOrCreateDeviceId);
setupAudioUnlock();

// ── Service worker registration + auto-update ──────────────────────────────
// A stale service worker/HTML shell is the classic cause of "blank screen
// after deploy" on iOS PWAs (see DEVELOPER_CONTEXT.md, "مشکلات شناخته‌شده").
// The actual fix is in sw.js (navigation fetches always bypass the browser's
// HTTP cache), so a stale shell should never be served in the first place.
// What follows is a *conservative* belt-and-suspenders update path for tabs
// that are already open when a new version ships — conservative because an
// over-eager auto-reload here can itself cause a blank/flickering screen on
// iOS Safari (reload firing on the very first SW install, or firing more
// than once per tab session). To avoid that:
//   - We only ever reload automatically if a controller already existed
//     when we registered (i.e. this is a genuine update, not the first-ever
//     SW install for this visitor — first installs don't need a reload,
//     the current page already has the right content).
//   - The "already reloaded" flag lives in sessionStorage, not a plain JS
//     variable, so it survives the reload itself and guarantees at most one
//     automatic reload per tab session even if controllerchange fires again.
if ("serviceWorker" in navigator) {
  let registration: ServiceWorkerRegistration | null = null;
  const hadControllerBeforeRegister = !!navigator.serviceWorker.controller;
  const RELOAD_FLAG = "shivafer_sw_reloaded";

  if (hadControllerBeforeRegister) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      if (sessionStorage.getItem(RELOAD_FLAG)) return;
      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();
    });
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("/sw.js")
      .then((reg) => {
        registration = reg;
      })
      .catch((err) => {
        console.error("ServiceWorker registration failed: ", err);
      });
  });

  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
      registration?.update().catch(() => {});
    }
  });
}

createRoot(document.getElementById("root")!).render(<App />);
