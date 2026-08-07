import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { logger } from "./lib/logger";
import { resolveTrackingLink } from "./routes/tracking-links";
import { SLUG_RE } from "./lib/tracking-links";

// ─── Single Source of Truth for Static Assets ────────────────────────────────
//
// IMPORTANT: All static asset paths MUST be derived from _serverDir, NOT from
// process.cwd(). Here is why:
//
//   process.cwd() is the WORKING DIRECTORY of the node process at startup,
//   which depends entirely on how pm2/systemd launches the app:
//     Dev:  artifacts/api-server/          → public/ exists here  ✅
//     Prod: /var/www/shivafer/api/         → public/ does NOT exist here ❌
//           (assets are actually at dist/public/ copied by deploy)
//
//   __dirname (via esbuild banner, or import.meta.url) is the LOCATION of the
//   compiled .mjs file, which is always dist/. So path.join(_serverDir, "public")
//   resolves to dist/public/ in both dev and prod — the ONLY place assets live
//   after build.m//
// Architecture:
//   git source   :  public/                     (placeholder-guarded in git)
//   after build  :  dist/public/                (created by safeCopyPublic() in build.mjs)
//   Express reads:  _serverDir + /public  =  dist/public/    ← SINGLE SOURCE OF TRUTH
//   deploy copies:  dist/ (including dist/public/) → server   ← no extra copies
//
// ─────────────────────────────────────────────────────────────────────────────
const _serverDir = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Trust reverse proxy (nginx) so req.hostname and req.ip are correct
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

// Disable browser/proxy caching for API JSON responses (not static files)
app.use("/api", (req, res, next) => {
  if (!req.path.startsWith("/uploads/") && !req.path.startsWith("/public/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
    res.setHeader("Pragma", "no-cache");
  }
  next();
});

// Serve uploaded files statically
// UPLOAD_DIR: runtime-written files — configurable via env var.
// Default is one level above dist/ so uploads persist across redeploys
// (they live at /var/www/shivafer/api/uploads/, not inside dist/).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(_serverDir, "..", "uploads");

// Images and other non-video uploads are public
// Video files are served only through the protected /api/stream/lesson/:id endpoint
app.use("/api/uploads", (req, res, next) => {
  if (req.path.startsWith("/videos/")) {
    res.status(403).json({ error: "دسترسی مستقیم به ویدیو ممنوع است. از پلیر استفاده کنید" });
    return;
  }
  next();
}, express.static(UPLOAD_DIR, {
  // setHeaders runs AFTER serve-static sets its own Cache-Control, so ours wins
  setHeaders: (res, filePath) => {
    if (/\.(webp|jpg|jpeg|png|gif|svg|mp3|wav|ogg)$/i.test(filePath)) {
      res.setHeader("Cache-Control", "public, max-age=2592000, immutable");
    }
  },
}));

// Serve public downloads (e.g. Android APK ZIP)
// _serverDir = dist/ → dist/public/ (single source of truth, set at top of file)
const PUBLIC_DIR = path.join(_serverDir, "public");
app.use("/api/public", express.static(PUBLIC_DIR));

// ─── Durable static asset architecture (v5) ──────────────────────────────────
// Root cause of the v4 asset outage: avatars / leaderboard artwork / channel
// backgrounds lived only inside the PWA's `public/` folder, which:
//   1) is only as durable as the PWA build/deploy step (Vite's
//      `emptyOutDir: true` wipes and rebuilds it from source on every build —
//      any file that was hand-copied onto the server outside of git is lost
//      on the next deploy), and
//   2) is served by nginx's SPA fallback (`try_files $uri $uri/ /index.html`),
//      so a missing file silently returns `index.html` (Content-Type:
//      text/html, HTTP 200) instead of a 404 — the app never notices.
//
// Fix: serve all durable, brand-level static assets (avatars, leaderboard
// artwork, tribe card backgrounds, other cross-page promotional images) from
// the API server instead. Nginx proxies these path prefixes directly to the
// API so they never fall through to the PWA's SPA catch-all.
//
// ─── Avatar Asset Architecture (v6) ──────────────────────────────────────────
//
// PROBLEM (v5): avatars existed in multiple locations simultaneously:
//   • artifacts/api-server/public/static-assets/avatars   (git placeholders, 4 KB each)
//   • artifacts/api-server/dist/public/static-assets/avatars (build copy of placeholders)
//   • /var/www/static-assets/avatars                      (real production files)
//   After deploy the build-copy was served instead of the canonical copy → placeholder circles.
//
// FIX (v6): STATIC_ASSETS_PATH env var points Express directly at the canonical
//   server directory. The build output (dist/public/static-assets/) is now a
//   local-dev fallback ONLY — Express ignores it in production.
//
// Resolution order:
//   1. STATIC_ASSETS_PATH env var (production):  /var/www/static-assets/
//   2. __dirname/public/static-assets            (dev fallback, placeholder files)
//
// Canonical asset location on server: /var/www/static-assets/
// Set in /var/www/shivafer/api/.env:  STATIC_ASSETS_PATH=/var/www/static-assets
//
// See ASSET_ARCHITECTURE.md for full documentation.
// ─────────────────────────────────────────────────────────────────────────────
const STATIC_ASSETS_DIR =
  process.env.STATIC_ASSETS_PATH ||
  path.join(_serverDir, "public", "static-assets");

// setHeaders runs AFTER serve-static sets its own Cache-Control, so ours wins.
// 1-year immutable — files are versioned by name (e.g. channel-bg-v6.webp) or ?v= query param.
const STATIC_FILE_OPTS: Parameters<typeof express.static>[1] = {
  setHeaders: (_res) => {
    _res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    _res.setHeader("Vary", "Accept-Encoding");
  },
};

app.use("/avatars",       express.static(path.join(STATIC_ASSETS_DIR, "avatars"),     STATIC_FILE_OPTS));
app.use("/leaderboard",   express.static(path.join(STATIC_ASSETS_DIR, "leaderboard"), STATIC_FILE_OPTS));
app.use("/tribes",        express.static(path.join(STATIC_ASSETS_DIR, "tribes"),      STATIC_FILE_OPTS));
// tutorial-cards: card-N.webp + voice-N.mp3 (14 files) — durable static pattern
app.use("/tutorial-cards",express.static(path.join(STATIC_ASSETS_DIR, "tutorial-cards"), STATIC_FILE_OPTS));
app.use("/static-assets", express.static(STATIC_ASSETS_DIR,                           STATIC_FILE_OPTS));

app.use("/api", router);

// Top-level short-link redirect: /r/:code (mirrors GET /api/tracking/resolve/:code)
// Must be after /api router to not conflict.
//
// Tracking links (lowercase slug, e.g. /r/instagram-july) take priority; if no
// matching tracking link exists, this falls back to the legacy tribe referral
// code behaviour (uppercase code -> /register?ref=CODE) so old shared links
// keep working unchanged.
app.get("/r/:code", async (req, res) => {
  const raw = req.params.code;
  const FRONTEND = process.env.FRONTEND_BASE_URL?.replace(/\/+$/, "") ?? "https://shivafaracademy.ir";

  if (SLUG_RE.test(raw.toLowerCase())) {
    try {
      const result = await resolveTrackingLink(req, res, raw);
      if (result.status === "ok") {
        const destination = result.link.destinationUrl.startsWith("/")
          ? `${FRONTEND}${result.link.destinationUrl}`
          : result.link.destinationUrl;
        res.redirect(302, destination);
        return;
      }
      if (result.status === "blocked") {
        // A real tracking-link slug exists but is inactive/expired/rate
        // limited — never fall through to the legacy referral flow here,
        // or a disabled campaign slug (or abusive traffic) could hijack the
        // referral registration path.
        res.redirect(302, FRONTEND);
        return;
      }
      // status === "not_found": no tracking link owns this slug, safe to
      // fall through to the legacy tribe-referral-code behaviour below.
    } catch (err) {
      logger.error({ err }, "tracking link redirect failed");
      res.redirect(302, FRONTEND);
      return;
    }
  }

  // Legacy tribe referral code fallback.
  const code = raw.toUpperCase();
  res.cookie("referral_code", code, { maxAge: 30 * 24 * 60 * 60 * 1000, httpOnly: false, sameSite: "lax" });
  res.redirect(`${FRONTEND}/register?ref=${code}`);
});

export default app;
