// Durable static asset base — v5 architecture.
//
// Root cause of the v4 asset outage: brand-level static assets (assistant
// avatars, leaderboard artwork, tribe backgrounds, promo images) lived only
// in the PWA's `public/` folder. That folder is wiped and rebuilt from
// source on every Vite build (`emptyOutDir: true`), and any file missing
// from source is served as `index.html` by nginx's SPA fallback instead of
// a 404 — so the failure is silent (200 OK, Content-Type: text/html).
//
// Fix: these assets are now served by the API server, which has a stable,
// systemd-managed deploy path that survives PWA/admin redeploys. Use the
// same base URL the app already uses for all other API calls so this works
// identically in dev and production.
const API = import.meta.env.VITE_API_BASE_URL ?? "";

/** Assistant avatar image, e.g. staticAssetUrl.avatar("am1") -> `${API}/avatars/am1.webp` */
export const staticAssetUrl = {
  avatar: (id: string) => `${API}/avatars/${id}.webp`,
  leaderboard: (file: string) => `${API}/leaderboard/${file}`,
  tribe: (file: string) => `${API}/tribes/${file}`,
  asset: (file: string) => `${API}/static-assets/${file}`,
  /** Versioned chatbot avatars — bump v= here whenever the image changes */
  supportAvatar: () => `${API}/static-assets/support-avatar-v2.webp?v=3`,
  saraAvatar:    () => `${API}/static-assets/sara-avatar.webp?v=3`,
};
