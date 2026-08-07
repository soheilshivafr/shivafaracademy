import { Router, Request, Response } from "express";
import { db } from "@workspace/db";
import { courseLessonsTable, userCoursesTable, reelsTable, audioPostsTable, productsTable, coursesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { requireUserViaMedia } from "../middlewares/auth";
import fs from "fs";
import path from "path";
import { spawn } from "child_process";
import { logger } from "../lib/logger";
import { getStorageService, isStorageConfigured } from "../lib/storage/index";

const router = Router();

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when the URL is a full http/https URL (i.e. stored in Object Storage). */
function isExternalUrl(url: string): boolean {
  return /^https?:\/\//i.test(url);
}

/**
 * For local URLs like "/api/uploads/videos/xxx.mp4" → extract the relative path
 * and resolve to disk. Returns null if the pattern doesn't match.
 */
function localPathFromUrl(videoUrl: string): string | null {
  const m = videoUrl.match(/\/?api\/uploads\/(.+)$/);
  if (!m) return null;
  return path.join(UPLOAD_DIR, m[1]);
}

// ─── In-memory path/URL cache for reels ──────────────────────────────────────
// Without this, every range-request chunk triggers a full DB query.
interface ReelEntry {
  /** Absolute local path (legacy disk storage) OR null when stored externally */
  filePath: string | null;
  /** S3 / Object Storage public URL (new uploads) OR null for legacy disk entries */
  externalUrl: string | null;
  fileSize: number; // only relevant for disk entries
}
const reelCache = new Map<number, ReelEntry>();

// Thumbnail cache: reelId → jpeg path
const thumbCache = new Map<number, string>();

async function generateThumb(videoPath: string, thumbPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-ss", "0", "-i", videoPath, "-vframes", "1", "-q:v", "3", "-f", "image2", "-y", thumbPath]);
    ff.on("close", (code) => resolve(code === 0 && fs.existsSync(thumbPath)));
    ff.on("error", () => resolve(false));
  });
}

// ─── Disk-based streaming (legacy local storage) ──────────────────────────────
function streamVideoFromDisk(req: Request, res: Response, filePath: string, fileSize: number) {
  res.setHeader("Content-Type", "video/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "private, max-age=3600");

  const rangeHeader = req.headers.range;
  const start = rangeHeader
    ? parseInt(rangeHeader.replace(/bytes=/, "").split("-")[0], 10)
    : 0;
  const end = (rangeHeader && rangeHeader.split("-")[1])
    ? parseInt(rangeHeader.split("-")[1], 10)
    : Math.min(start + 512 * 1024 - 1, fileSize - 1);

  if (start >= fileSize) {
    res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end();
    return;
  }

  const chunkSize = end - start + 1;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", chunkSize);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

// ─── Object Storage streaming (via StorageService + AWS SDK) ─────────────────
/**
 * Streams a file from S3/Object Storage using StorageService.streamRange().
 *
 * IMPORTANT: always call result.body.destroy() when the client disconnects —
 * failing to do so leaves the S3 TCP connection open and eventually exhausts
 * the AWS SDK connection pool, causing all subsequent requests to hang until
 * the process is restarted.
 */
async function streamViaStorage(req: Request, res: Response, key: string): Promise<void> {
  try {
    const storage = getStorageService();
    const rangeHeader = req.headers.range;

    logger.info({ key, range: rangeHeader ?? "none" }, "stream: fetching from storage");

    const result = await storage.streamRange(key, rangeHeader);

    res.status(result.statusCode);
    res.setHeader("Content-Type", result.contentType || "application/octet-stream");
    res.setHeader("Accept-Ranges", "bytes");
    res.setHeader("X-Accel-Buffering", "no");
    res.setHeader("Cache-Control", "private, max-age=3600");

    if (result.contentLength !== undefined) {
      res.setHeader("Content-Length", result.contentLength);
    }
    if (result.contentRange) {
      res.setHeader("Content-Range", result.contentRange);
    }

    result.body.pipe(res);

    // ── Critical: destroy the S3 stream when the client disconnects ───────────
    // Without this, every seek / tab-close / pause leaves an open S3 TCP
    // connection that never returns to the AWS SDK pool. After O(50-100)
    // such events the pool is saturated and all streaming requests hang.
    const destroyBody = () => {
      try { result.body.destroy(); } catch { /* ignore */ }
    };
    req.on("close", destroyBody);
    req.on("aborted", destroyBody);
    res.on("close", destroyBody);

    result.body.on("error", (err) => {
      logger.error({ key, err: err.message }, "stream: body pipe error");
      if (!res.headersSent) res.status(502).end();
      else res.destroy();
    });
  } catch (err) {
    logger.error({ key, err: (err as Error).message }, "stream: storage error");
    if (!res.headersSent) {
      res.status(502).json({ error: "خطا در دریافت فایل از فضای ذخیره‌سازی" });
    }
  }
}

// ─── GET /stream/lesson/:lessonId — protected video streaming ─────────────────
//
// Auth: requireUserViaMedia accepts either:
//   - Authorization: Bearer header  (API/fetch calls)
//   - shivafer_media HttpOnly cookie (browser <video src> — automatic, no JS needed)
//
// Frontend simply uses: <video src="/api/stream/lesson/:id">
// No token appended to the URL.
//
router.get("/stream/lesson/:lessonId", requireUserViaMedia, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  if (isNaN(lessonId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  const [lesson] = await db
    .select()
    .from(courseLessonsTable)
    .where(eq(courseLessonsTable.id, lessonId))
    .limit(1);

  if (!lesson?.videoUrl) { res.status(404).json({ error: "ویدیو یافت نشد" }); return; }

  // ── Access control ──────────────────────────────────────────────────────────
  if (!lesson.isFree) {
    const [ownership] = await db
      .select()
      .from(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, req.user!.userId), eq(userCoursesTable.courseId, lesson.courseId)))
      .limit(1);
    if (!ownership) { res.status(403).json({ error: "شما این دوره را خریداری نکرده‌اید" }); return; }
  }

  // ── Object Storage (new uploads) ────────────────────────────────────────────
  //
  // Architecture: presigned URL redirect (v49+)
  // Instead of proxying every byte through the backend (which exhausts the
  // S3 connection pool under concurrent users), we generate a short-lived
  // presigned URL and let the browser fetch directly from parspack.
  // This eliminates connection-pool exhaustion (previously: capacity=50,
  // 361+ requests enqueued → nginx 504).
  //
  if (isExternalUrl(lesson.videoUrl)) {
    if (isStorageConfigured()) {
      const storage = getStorageService();
      const key = storage.keyFromUrl(lesson.videoUrl);

      if (key) {
        logger.info({ key }, "stream/lesson: generating presigned URL");
        const signedUrl = await storage.getSignedUrl(key, 3600); // 1-hour expiry
        res.setHeader("Cache-Control", "no-store");
        res.redirect(302, signedUrl);
        return;
      }

      // URL doesn't match our S3_PUBLIC_BASE_URL (e.g. old bucket / migration).
      logger.warn({ videoUrl: lesson.videoUrl }, "stream/lesson: URL not from current storage, redirecting");
      res.redirect(302, lesson.videoUrl);
      return;
    }

    logger.warn({ videoUrl: lesson.videoUrl }, "stream/lesson: storage not configured, redirecting to external URL");
    res.redirect(302, lesson.videoUrl);
    return;
  }

  // ── Legacy disk storage ─────────────────────────────────────────────────────
  const filePath = localPathFromUrl(lesson.videoUrl);
  if (!filePath) { res.status(404).json({ error: "مسیر ویدیو نامعتبر است" }); return; }
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "فایل ویدیو یافت نشد" }); return; }
  const stat = fs.statSync(filePath);
  streamVideoFromDisk(req, res, filePath, stat.size);
});

// ─── GET /stream/reel/:reelId — public video streaming ────────────────────────
//
// Streams reel video through the backend for private-bucket compatibility.
// Legacy disk reels are still streamed directly from disk.
router.get("/stream/reel/:reelId", async (req, res) => {
  const reelId = parseInt(req.params.reelId as string);
  if (isNaN(reelId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }

  let cached = reelCache.get(reelId);

  if (!cached) {
    const [reel] = await db
      .select({ videoUrl: reelsTable.videoUrl })
      .from(reelsTable)
      .where(eq(reelsTable.id, reelId))
      .limit(1);

    if (!reel?.videoUrl) { res.status(404).json({ error: "ویدیو یافت نشد" }); return; }

    if (isExternalUrl(reel.videoUrl)) {
      cached = { filePath: null, externalUrl: reel.videoUrl, fileSize: 0 };
    } else {
      const urlMatch = reel.videoUrl.match(/\/?api\/uploads\/(.+)$/);
      if (!urlMatch) { res.status(404).json({ error: "مسیر ویدیو نامعتبر است" }); return; }
      const filePath = path.join(UPLOAD_DIR, urlMatch[1]);
      if (!fs.existsSync(filePath)) { res.status(404).json({ error: "فایل ویدیو یافت نشد" }); return; }
      const stat = fs.statSync(filePath);
      cached = { filePath, externalUrl: null, fileSize: stat.size };
    }
    reelCache.set(reelId, cached);
  }

  // S3 reels: proxy through backend (supports private-ACL buckets).
  if (cached.externalUrl) {
    if (isStorageConfigured()) {
      const storage = getStorageService();
      const key = storage.keyFromUrl(cached.externalUrl);
      if (key) {
        await streamViaStorage(req, res, key);
        return;
      }
    }
    // Fallback: redirect (only if S3 not configured or key not found)
    res.redirect(302, cached.externalUrl);
    return;
  }

  // Legacy disk
  streamVideoFromDisk(req, res, cached.filePath!, cached.fileSize);
});

// ─── GET /stream/reel/:reelId/thumbnail — first-frame JPEG ───────────────────
router.get("/stream/reel/:reelId/thumbnail", async (req, res) => {
  const reelId = parseInt(req.params.reelId as string);
  if (isNaN(reelId)) { res.status(400).end(); return; }

  // Serve from disk cache first
  const cached = thumbCache.get(reelId);
  if (cached && fs.existsSync(cached)) {
    res.setHeader("Content-Type", "image/jpeg");
    res.setHeader("Cache-Control", "public, max-age=86400");
    fs.createReadStream(cached).pipe(res);
    return;
  }

  // Resolve video location (reuse reel cache)
  let entry = reelCache.get(reelId);
  if (!entry) {
    const [reel] = await db.select({ videoUrl: reelsTable.videoUrl }).from(reelsTable).where(eq(reelsTable.id, reelId)).limit(1);
    if (!reel?.videoUrl) { res.status(404).end(); return; }
    if (isExternalUrl(reel.videoUrl)) {
      entry = { filePath: null, externalUrl: reel.videoUrl, fileSize: 0 };
    } else {
      const urlMatch = reel.videoUrl.match(/\/?api\/uploads\/(.+)$/);
      if (!urlMatch) { res.status(404).end(); return; }
      const filePath = path.join(UPLOAD_DIR, urlMatch[1]);
      if (!fs.existsSync(filePath)) { res.status(404).end(); return; }
      const stat = fs.statSync(filePath);
      entry = { filePath, externalUrl: null, fileSize: stat.size };
    }
    reelCache.set(reelId, entry);
  }

  // For S3 reels, ffmpeg can't access the remote file locally — return 404.
  if (entry.externalUrl || !entry.filePath) {
    res.status(404).end();
    return;
  }

  const thumbDir = path.join(UPLOAD_DIR, "thumbs");
  try {
    if (!fs.existsSync(thumbDir)) fs.mkdirSync(thumbDir, { recursive: true });
  } catch {
    res.status(503).end();
    return;
  }
  const thumbPath = path.join(thumbDir, `reel-${reelId}.jpg`);
  const ok = await generateThumb(entry.filePath, thumbPath);
  if (!ok) { res.status(500).end(); return; }

  thumbCache.set(reelId, thumbPath);
  res.setHeader("Content-Type", "image/jpeg");
  res.setHeader("Cache-Control", "public, max-age=86400");
  fs.createReadStream(thumbPath).pipe(res);
});


// ─── Audio streaming helpers ──────────────────────────────────────────────────

function streamAudioFromDisk(req: Request, res: Response, filePath: string, fileSize: number) {
  const ext = path.extname(filePath).toLowerCase();
  const ctMap: Record<string, string> = { ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".aac": "audio/aac", ".m4a": "audio/mp4" };
  res.setHeader("Content-Type", ctMap[ext] ?? "audio/mpeg");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Cache-Control", "private, max-age=3600");
  const rangeHeader = req.headers.range;
  const start = rangeHeader ? parseInt(rangeHeader.replace(/bytes=/, "").split("-")[0], 10) : 0;
  const end = (rangeHeader && rangeHeader.split("-")[1]) ? parseInt(rangeHeader.split("-")[1], 10) : Math.min(start + 512 * 1024 - 1, fileSize - 1);
  if (start >= fileSize) { res.status(416).setHeader("Content-Range", `bytes */${fileSize}`).end(); return; }
  const chunkSize = end - start + 1;
  res.status(206);
  res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
  res.setHeader("Content-Length", chunkSize);
  fs.createReadStream(filePath, { start, end }).pipe(res);
}

/**
 * Unified audio file handler — presigned URL redirect.
 *
 * Audio files are served via a short-lived presigned URL redirect (302) so the
 * browser downloads directly from Object Storage. This avoids proxying audio
 * bytes through the Node process, which previously caused S3 connection-pool
 * exhaustion: every seek / pause / tab-close left an open TCP connection to S3
 * that was never destroyed, eventually filling the pool and stopping all audio
 * playback until the server was restarted.
 *
 * TTL: 4 hours — long enough for a full listening session including scrubbing.
 * The redirect response carries Cache-Control: no-store so the browser never
 * caches the signed URL itself and always asks for a fresh one.
 *
 * Supports three URL formats stored in DB:
 *   1. https://c163573.parspack.net/audios/xxx.mp3  — raw S3 URL (legacy)
 *   2. /api/stream/media?key=audios%2Fxxx.mp3       — internal proxy URL (new uploads v45+)
 *   3. /api/uploads/audios/xxx.mp3                  — local disk (dev / legacy local)
 */
const AUDIO_PRESIGN_TTL = 4 * 60 * 60; // 4 hours in seconds

async function streamAudioFile(req: Request, res: Response, audioUrl: string): Promise<void> {
  // ── Format 2: internal proxy URL stored by new upload flow ──────────────────
  const proxyKeyMatch = audioUrl.match(/[?&]key=([^&]+)/);
  if (proxyKeyMatch) {
    if (!isStorageConfigured()) {
      logger.warn({ audioUrl }, "stream/audio: proxy URL in DB but storage not configured");
      res.status(503).json({ error: "سرویس ذخیره‌سازی در دسترس نیست" });
      return;
    }
    const key = decodeURIComponent(proxyKeyMatch[1]);
    logger.info({ key }, "stream/audio: presigned redirect (proxy-url format)");
    const signedUrl = await getStorageService().getSignedUrl(key, AUDIO_PRESIGN_TTL);
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, signedUrl);
    return;
  }

  // ── Format 1: raw S3 / external URL (legacy uploads) ────────────────────────
  if (isExternalUrl(audioUrl)) {
    if (!isStorageConfigured()) {
      logger.warn({ audioUrl }, "stream/audio: S3 not configured");
      res.status(503).json({ error: "سرویس ذخیره‌سازی در دسترس نیست" });
      return;
    }
    const storage = getStorageService();
    const key = storage.keyFromUrl(audioUrl);
    if (key) {
      logger.info({ key }, "stream/audio: presigned redirect (raw-url format)");
      const signedUrl = await storage.getSignedUrl(key, AUDIO_PRESIGN_TTL);
      res.setHeader("Cache-Control", "no-store");
      res.redirect(302, signedUrl);
      return;
    }
    // URL from an unknown/old bucket — redirect as-is (best effort)
    logger.warn({ audioUrl }, "stream/audio: URL not from current storage, direct redirect");
    res.setHeader("Cache-Control", "no-store");
    res.redirect(302, audioUrl);
    return;
  }

  // ── Format 3: local disk (dev without S3) ───────────────────────────────────
  const filePath = localPathFromUrl(audioUrl);
  if (!filePath) { res.status(404).json({ error: "مسیر فایل صوتی نامعتبر است" }); return; }
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "فایل صوتی یافت نشد" }); return; }
  const stat = fs.statSync(filePath);
  streamAudioFromDisk(req, res, filePath, stat.size);
}

// ─── GET /stream/audio/lesson/:lessonId — lesson audio (auth for paid) ────────
//
// Auth: requireUserViaMedia (cookie OR header — no token in URL needed)
//
router.get("/stream/audio/lesson/:lessonId", requireUserViaMedia, async (req, res) => {
  const lessonId = parseInt(req.params.lessonId as string);
  if (isNaN(lessonId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const [lesson] = await db.select({ audioUrl: courseLessonsTable.audioUrl, isFree: courseLessonsTable.isFree, courseId: courseLessonsTable.courseId })
    .from(courseLessonsTable).where(eq(courseLessonsTable.id, lessonId)).limit(1);
  if (!lesson?.audioUrl) { res.status(404).json({ error: "فایل صوتی یافت نشد" }); return; }
  if (!lesson.isFree) {
    const [ownership] = await db.select().from(userCoursesTable)
      .where(and(eq(userCoursesTable.userId, req.user!.userId), eq(userCoursesTable.courseId, lesson.courseId))).limit(1);
    if (!ownership) { res.status(403).json({ error: "شما این دوره را خریداری نکرده‌اید" }); return; }
  }
  await streamAudioFile(req, res, lesson.audioUrl);
});

// ─── GET /stream/audio/course/:courseId — course description audio (public) ───
router.get("/stream/audio/course/:courseId", async (req, res) => {
  const courseId = parseInt(req.params.courseId as string);
  if (isNaN(courseId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const [course] = await db.select({ audioUrl: coursesTable.audioUrl })
    .from(coursesTable).where(eq(coursesTable.id, courseId)).limit(1);
  if (!course?.audioUrl) { res.status(404).json({ error: "فایل صوتی یافت نشد" }); return; }
  await streamAudioFile(req, res, course.audioUrl);
});

// ─── GET /stream/audio/product/:productId — product audio (public) ────────────
router.get("/stream/audio/product/:productId", async (req, res) => {
  const productId = parseInt(req.params.productId as string);
  if (isNaN(productId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const [product] = await db.select({ audioUrl: productsTable.audioUrl })
    .from(productsTable).where(eq(productsTable.id, productId)).limit(1);
  if (!product?.audioUrl) { res.status(404).json({ error: "فایل صوتی یافت نشد" }); return; }
  await streamAudioFile(req, res, product.audioUrl);
});

// ─── GET /stream/audio/podcast/:postId — audio post (public) ─────────────────
router.get("/stream/audio/podcast/:postId", async (req, res) => {
  const postId = parseInt(req.params.postId as string);
  if (isNaN(postId)) { res.status(400).json({ error: "شناسه نامعتبر" }); return; }
  const [post] = await db.select({ audioUrl: audioPostsTable.audioUrl })
    .from(audioPostsTable).where(eq(audioPostsTable.id, postId)).limit(1);
  if (!post?.audioUrl) { res.status(404).json({ error: "فایل صوتی یافت نشد" }); return; }
  await streamAudioFile(req, res, post.audioUrl);
});

// ─── GET /stream/media — generic proxy for any S3 media (images, files, etc.) ─
//
// Used by frontend to access ANY file from the private-ACL Object Storage bucket.
// The client never receives a raw parspack.net URL; all URLs are converted to this
// proxy endpoint by toProxyUrl() in lib/storage/index.ts.
//
// Query param:
//   key — URL-encoded S3 object key, e.g. "images%2Ffoo.webp"
//
// No auth required: content visibility is determined upstream (only proxy URLs
// that correspond to data already returned by authenticated endpoints).
router.get("/stream/media", async (req, res) => {
  const rawKey = req.query.key as string | undefined;
  if (!rawKey) { res.status(400).json({ error: "پارامتر key الزامی است" }); return; }

  const key = decodeURIComponent(rawKey);

  // Security: reject path traversal attempts
  if (key.includes("..") || key.startsWith("/") || key.startsWith("\\")) {
    res.status(400).json({ error: "کلید نامعتبر" }); return;
  }

  if (!isStorageConfigured()) {
    res.status(503).json({ error: "سرویس ذخیره‌سازی پیکربندی نشده است" }); return;
  }

  // Allow longer cache for immutable assets (images, etc.)
  const isImmutable = key.startsWith("images/") || key.startsWith("files/");
  if (isImmutable) {
    res.setHeader("Cache-Control", "public, max-age=86400");
  }

  await streamViaStorage(req, res, key);
});

export default router;
