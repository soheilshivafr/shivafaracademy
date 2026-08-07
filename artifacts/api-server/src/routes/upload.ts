import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { pipeline } from "stream/promises";
import { spawn } from "child_process";
import { requireAdmin, requireUser } from "../middlewares/auth";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";
import { getStorageService, isStorageConfigured, toProxyUrl } from "../lib/storage/index";

// ─── ffmpeg faststart ─────────────────────────────────────────────────────────
async function applyFaststart(filePath: string): Promise<void> {
  const tmpPath = filePath + ".fs.mp4";
  return new Promise((resolve) => {
    const ff = spawn("ffmpeg", ["-i", filePath, "-c", "copy", "-movflags", "+faststart", "-y", tmpPath]);
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(tmpPath)) {
        try { fs.renameSync(tmpPath, filePath); } catch { /* ignore */ }
      } else {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        if (code !== 0) logger.warn({ filePath, code }, "ffmpeg faststart failed — serving original");
      }
      resolve();
    });
    ff.on("error", () => {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      logger.warn({ filePath }, "ffmpeg not found — serving original without faststart");
      resolve();
    });
  });
}

// ─── ffprobe ──────────────────────────────────────────────────────────────────
function probeVideo(filePath: string): Promise<{ width: number; height: number; bitrate: number } | null> {
  return new Promise((resolve) => {
    const ff = spawn("ffprobe", [
      "-v", "error", "-select_streams", "v:0",
      "-show_entries", "stream=width,height:format=bit_rate",
      "-of", "json", filePath,
    ]);
    let out = "";
    ff.stdout.on("data", (d) => { out += d.toString(); });
    ff.on("close", (code) => {
      if (code !== 0) { resolve(null); return; }
      try {
        const j = JSON.parse(out);
        const width = Number(j?.streams?.[0]?.width) || 0;
        const height = Number(j?.streams?.[0]?.height) || 0;
        const bitrate = parseInt(j?.format?.bit_rate ?? "0", 10) || 0;
        resolve({ width, height, bitrate });
      } catch { resolve(null); }
    });
    ff.on("error", () => resolve(null));
  });
}

// ─── Reel optimization ────────────────────────────────────────────────────────
const REEL_MAX_EDGE = 1920;
const REEL_MAX_BITRATE = 4_000_000;

async function optimizeReelVideo(filePath: string): Promise<void> {
  const info = await probeVideo(filePath);
  const longEdge = info ? Math.max(info.width, info.height) : 0;
  const needsReencode = !!info && (longEdge > REEL_MAX_EDGE || info.bitrate > REEL_MAX_BITRATE);
  if (!needsReencode) { await applyFaststart(filePath); return; }

  const tmpPath = filePath + ".opt.mp4";
  const ok = await new Promise<boolean>((resolve) => {
    const ff = spawn("ffmpeg", [
      "-i", filePath,
      "-vf", `scale='if(gt(iw,ih),min(${REEL_MAX_EDGE},iw),-2)':'if(gt(iw,ih),-2,min(${REEL_MAX_EDGE},ih))'`,
      "-c:v", "libx264", "-preset", "veryfast", "-crf", "23",
      "-maxrate", "3500k", "-bufsize", "7000k", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", "-y", tmpPath,
    ]);
    ff.on("close", (code) => {
      if (code === 0 && fs.existsSync(tmpPath)) {
        try { fs.renameSync(tmpPath, filePath); resolve(true); } catch { resolve(false); }
      } else {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
        if (code !== 0) logger.warn({ filePath, code }, "reel re-encode failed — falling back to faststart");
        resolve(false);
      }
    });
    ff.on("error", () => {
      try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      logger.warn({ filePath }, "ffmpeg not found — skipping reel optimization");
      resolve(false);
    });
  });
  if (!ok) await applyFaststart(filePath);
}

// ─── WebP conversion (in-memory via sharp) ────────────────────────────────────
async function convertToWebPBuffer(buffer: Buffer, originalExt: string): Promise<{ buffer: Buffer; ext: string }> {
  const ext = originalExt.toLowerCase();
  if (ext === ".webp") return { buffer, ext };
  if (![".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff"].includes(ext)) return { buffer, ext };
  try {
    const sharp = (await import("sharp")).default;
    const webpBuf = await sharp(buffer).webp({ quality: 82, effort: 4 }).toBuffer();
    return { buffer: webpBuf, ext: ".webp" };
  } catch (err) {
    logger.warn({ err: (err as Error).message }, "sharp conversion failed — keeping original format");
    return { buffer, ext };
  }
}

// ─── Unique filename helper ───────────────────────────────────────────────────
function uniqueName(ext: string, prefix = ""): string {
  return `${prefix}${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
}

// ─── Disk-based temp dir (for videos only — ffmpeg needs a file path) ─────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const CHUNK_TMP_DIR = path.join(UPLOAD_DIR, "chunks_tmp");
const VIDEO_TMP_DIR = path.join(UPLOAD_DIR, "videos_tmp");

for (const dir of [CHUNK_TMP_DIR, VIDEO_TMP_DIR]) {
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    logger.warn({ dir, err: (err as Error).message }, "could not create temp dir — continuing");
  }
}

// ─── Multer configs ───────────────────────────────────────────────────────────
// Images and audio use memory storage — buffer goes straight to S3.
// Videos use disk storage so ffmpeg can process the file by path.

const memoryStorage = multer.memoryStorage();

const videoTmpStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, uniqueName(ext));
  },
});

const chunkStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, CHUNK_TMP_DIR),
  filename: (req, _file, cb) => {
    const uploadId = (req.query.uploadId as string) || req.body?.uploadId || "unknown";
    const chunkIndex = (req.query.chunkIndex as string) || req.body?.chunkIndex || "0";
    cb(null, `${uploadId}-${chunkIndex}`);
  },
});

const imageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("فقط فایل‌های تصویری مجاز هستند"));
  },
});

const videoUpload = multer({ storage: videoTmpStorage });

const audioUpload = multer({
  storage: memoryStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") cb(null, true);
    else cb(new Error("فقط فایل‌های صوتی مجاز هستند"));
  },
});

const chunkUpload = multer({ storage: chunkStorage });

// ─── Storage helper ───────────────────────────────────────────────────────────
// Returns null if S3 is not configured (graceful degradation).
function tryGetStorage() {
  if (!isStorageConfigured()) return null;
  return getStorageService();
}

// Upload a local file (disk) to S3, then delete the local temp file.
async function uploadFileToStorage(
  localPath: string,
  key: string,
  contentType: string,
): Promise<string> {
  const storage = getStorageService();
  const buffer = fs.readFileSync(localPath);
  const url = await storage.upload(key, buffer, {
    contentType,
    cacheControl: "public, max-age=31536000, immutable",
  });
  try { fs.unlinkSync(localPath); } catch { /* ignore */ }
  return url;
}

const router = Router();

// ─── Fallback URL helper (when S3 not configured) ─────────────────────────────
function getBaseUrl(req: Request): string {
  if (process.env.BASE_URL) return process.env.BASE_URL;
  const proto = (req.headers["x-forwarded-proto"] as string) || req.protocol || "https";
  const host = (req.headers["x-forwarded-host"] as string) || req.get("host") || "";
  return `${proto}://${host}`;
}

// ─── Avatar ───────────────────────────────────────────────────────────────────
router.post("/upload/avatar", requireUser, (req: Request, res: Response) => {
  imageUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود فایل" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname);
    const { buffer: finalBuf, ext: finalExt } = await convertToWebPBuffer(req.file.buffer, ext);
    const key = `images/${uniqueName(finalExt)}`;

    let avatarUrl: string;
    const storage = tryGetStorage();
    if (storage) {
      try {
        avatarUrl = await storage.upload(key, finalBuf, {
          contentType: "image/webp",
          cacheControl: "public, max-age=31536000, immutable",
        });
      } catch (uploadErr) {
        logger.error({ err: uploadErr }, "S3 upload failed for avatar");
        res.status(500).json({ error: "خطا در آپلود به سرور ذخیره‌سازی" });
        return;
      }
    } else {
      // Fallback: write to disk
      const fallbackDir = path.join(UPLOAD_DIR, "images");
      try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch { /* ignore */ }
      const filename = uniqueName(finalExt);
      fs.writeFileSync(path.join(fallbackDir, filename), finalBuf);
      avatarUrl = `${getBaseUrl(req)}/api/uploads/images/${filename}`;
    }

    try {
      await db.update(usersTable)
        .set({ avatar: avatarUrl, updatedAt: new Date() })
        .where(eq(usersTable.id, req.user!.userId));
    } catch (dbErr: unknown) {
      // Rollback: delete from S3 if we saved there
      if (tryGetStorage()) {
        try { await tryGetStorage()!.delete(key); } catch { /* best effort */ }
      }
      res.status(500).json({ error: dbErr instanceof Error ? dbErr.message : "خطا در ذخیره عکس" });
      return;
    }

    res.json({ url: avatarUrl });
  });
});

// ─── Tribe logo ───────────────────────────────────────────────────────────────
router.post("/upload/tribe-logo", requireUser, (req: Request, res: Response) => {
  imageUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود فایل" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname);
    const { buffer: finalBuf, ext: finalExt } = await convertToWebPBuffer(req.file.buffer, ext);
    const key = `images/${uniqueName(finalExt)}`;

    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try {
        url = await storage.upload(key, finalBuf, { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
      } catch (uploadErr) {
        logger.error({ err: uploadErr }, "S3 upload failed for tribe-logo");
        res.status(500).json({ error: "خطا در آپلود به سرور ذخیره‌سازی" });
        return;
      }
    } else {
      const fallbackDir = path.join(UPLOAD_DIR, "images");
      try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch { /* ignore */ }
      const filename = uniqueName(finalExt);
      fs.writeFileSync(path.join(fallbackDir, filename), finalBuf);
      url = `${getBaseUrl(req)}/api/uploads/images/${filename}`;
    }
    // Return proxy URL so the client never hits the private S3 bucket directly (403).
    res.json({ url: toProxyUrl(url) ?? url });
  });
});

// ─── Generic file (admin) ─────────────────────────────────────────────────────
router.post("/upload/file", requireAdmin, (req: Request, res: Response) => {
  const fileUpload = multer({
    storage: memoryStorage,
    limits: { fileSize: 500 * 1024 * 1024 },
  });
  fileUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود فایل" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const safeFilename = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `files/${Date.now()}-${safeFilename}`;
    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try {
        url = await storage.upload(key, req.file.buffer, { contentType: req.file.mimetype });
      } catch (uploadErr) {
        logger.error({ err: uploadErr }, "S3 upload failed for file");
        res.status(500).json({ error: "خطا در آپلود به سرور ذخیره‌سازی" });
        return;
      }
    } else {
      const fallbackDir = path.join(UPLOAD_DIR, "files");
      try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch { /* ignore */ }
      fs.writeFileSync(path.join(fallbackDir, `${Date.now()}-${safeFilename}`), req.file.buffer);
      url = `${getBaseUrl(req)}/api/uploads/files/${Date.now()}-${safeFilename}`;
    }
    res.json({ url });
  });
});

// ─── Generic image (admin) ────────────────────────────────────────────────────
router.post("/upload/image", requireAdmin, (req: Request, res: Response) => {
  imageUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود فایل" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname);
    const { buffer: finalBuf, ext: finalExt } = await convertToWebPBuffer(req.file.buffer, ext);
    const key = `images/${uniqueName(finalExt)}`;
    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try {
        url = await storage.upload(key, finalBuf, { contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable" });
      } catch (uploadErr) {
        logger.error({ err: uploadErr }, "S3 upload failed for image");
        res.status(500).json({ error: "خطا در آپلود به سرور ذخیره‌سازی" });
        return;
      }
    } else {
      const fallbackDir = path.join(UPLOAD_DIR, "images");
      try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch { /* ignore */ }
      const filename = uniqueName(finalExt);
      fs.writeFileSync(path.join(fallbackDir, filename), finalBuf);
      url = `${getBaseUrl(req)}/api/uploads/images/${filename}`;
    }
    res.json({ url });
  });
});

// ─── Video (admin) ────────────────────────────────────────────────────────────
router.post("/upload/video", requireAdmin, (req: Request, res: Response) => {
  videoUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود ویدیو" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const localPath = req.file.path;
    await applyFaststart(localPath);

    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try {
        url = await uploadFileToStorage(localPath, `videos/${req.file.filename}`, "video/mp4");
      } catch (uploadErr) {
        logger.error({ err: uploadErr }, "S3 upload failed for video");
        try { fs.unlinkSync(localPath); } catch { /* ignore */ }
        res.status(500).json({ error: "خطا در آپلود به سرور ذخیره‌سازی" });
        return;
      }
    } else {
      const destDir = path.join(UPLOAD_DIR, "videos");
      try { if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true }); } catch { /* ignore */ }
      const dest = path.join(destDir, req.file.filename);
      try { fs.renameSync(localPath, dest); } catch { fs.copyFileSync(localPath, dest); fs.unlinkSync(localPath); }
      url = `${getBaseUrl(req)}/api/uploads/videos/${req.file.filename}`;
    }
    res.json({ url });
  });
});

// ─── Audio (admin) ────────────────────────────────────────────────────────────
router.post("/upload/audio", requireAdmin, (req: Request, res: Response) => {
  audioUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود فایل صوتی" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname) || ".mp3";
    const key = `audios/${uniqueName(ext)}`;
    const storage = tryGetStorage();
    if (!storage) { res.status(503).json({ error: "سرویس ذخیره‌سازی پیکربندی نشده است" }); return; }
    let url: string;
    try {
      url = await storage.upload(key, req.file.buffer, { contentType: req.file.mimetype, cacheControl: "public, max-age=31536000, immutable" });
    } catch (uploadErr) {
      logger.error({ err: uploadErr }, "S3 upload failed for audio");
      res.status(500).json({ error: "خطا در آپلود به سرور ذخیره‌سازی" });
      return;
    }
    // Return proxy URL so admin panel preview uses backend stream, not raw S3.
    // Raw S3 bucket is private-ACL → direct access gives 403.
    res.json({ url: toProxyUrl(url) ?? url });
  });
});

// ─── Podcast image (phone-gated user) ─────────────────────────────────────────
const PODCAST_ADMIN_PHONE = "09354505225";

router.post("/upload/podcast-image", requireUser, (req: Request, res: Response) => {
  if (req.user!.phone !== PODCAST_ADMIN_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  imageUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود تصویر" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname);
    const { buffer: finalBuf, ext: finalExt } = await convertToWebPBuffer(req.file.buffer, ext);
    const key = `images/${uniqueName(finalExt)}`;
    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try { url = await storage.upload(key, finalBuf, { contentType: "image/webp" }); }
      catch (uploadErr) { logger.error({ err: uploadErr }, "S3 upload failed"); res.status(500).json({ error: "خطا در آپلود" }); return; }
    } else {
      const fallbackDir = path.join(UPLOAD_DIR, "images");
      try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch { /* ignore */ }
      const filename = uniqueName(finalExt);
      fs.writeFileSync(path.join(fallbackDir, filename), finalBuf);
      url = `${getBaseUrl(req)}/api/uploads/images/${filename}`;
    }
    res.json({ url });
  });
});

// ─── Podcast audio (phone-gated user) ─────────────────────────────────────────
router.post("/upload/podcast-audio", requireUser, (req: Request, res: Response) => {
  if (req.user!.phone !== PODCAST_ADMIN_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  audioUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در آپلود فایل صوتی" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname) || ".mp3";
    const key = `audios/${uniqueName(ext)}`;
    const storage = tryGetStorage();
    if (!storage) { res.status(503).json({ error: "سرویس ذخیره‌سازی پیکربندی نشده است" }); return; }
    let url: string;
    try { url = await storage.upload(key, req.file.buffer, { contentType: req.file.mimetype, cacheControl: "public, max-age=31536000, immutable" }); }
    catch (uploadErr) { logger.error({ err: uploadErr }, "S3 upload failed"); res.status(500).json({ error: "خطا در آپلود" }); return; }
    res.json({ url: toProxyUrl(url) ?? url });
  });
});

// ─── Channel uploads (phone-gated user) ──────────────────────────────────────
const CHANNEL_OWNER_PHONE_UPLOAD = "09354505225";

const channelImageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("فقط فایل‌های تصویری مجاز هستند"));
  },
});

const channelVideoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_TMP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp4";
    cb(null, `chan-${uniqueName(ext)}`);
  },
});
const channelVideoUpload = multer({
  storage: channelVideoStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("فقط فایل‌های ویدیویی مجاز هستند"));
  },
});

const channelVoiceUpload = multer({
  storage: memoryStorage,
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/") || file.mimetype === "application/octet-stream") cb(null, true);
    else cb(new Error("فقط فایل صوتی مجاز است"));
  },
});

router.post("/upload/channel-image", requireUser, (req: Request, res: Response) => {
  if (req.user!.phone !== CHANNEL_OWNER_PHONE_UPLOAD) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  channelImageUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : "خطا" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname);
    const { buffer: finalBuf, ext: finalExt } = await convertToWebPBuffer(req.file.buffer, ext);
    const key = `images/${uniqueName(finalExt)}`;
    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try { url = await storage.upload(key, finalBuf, { contentType: "image/webp" }); }
      catch (uploadErr) { logger.error({ err: uploadErr }, "S3 upload failed"); res.status(500).json({ error: "خطا در آپلود" }); return; }
    } else {
      const fallbackDir = path.join(UPLOAD_DIR, "images");
      try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch { /* ignore */ }
      const filename = uniqueName(finalExt);
      fs.writeFileSync(path.join(fallbackDir, filename), finalBuf);
      url = `${getBaseUrl(req)}/api/uploads/images/${filename}`;
    }
    res.json({ url });
  });
});

router.post("/upload/channel-video", requireUser, (req: Request, res: Response) => {
  if (req.user!.phone !== CHANNEL_OWNER_PHONE_UPLOAD) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  req.setTimeout(0);
  channelVideoUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : "خطا" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const localPath = req.file.path;
    await applyFaststart(localPath);
    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try {
        url = await uploadFileToStorage(localPath, `videos/${req.file.filename}`, "video/mp4");
      } catch (uploadErr) {
        logger.error({ err: uploadErr }, "S3 upload failed for channel video");
        try { fs.unlinkSync(localPath); } catch { /* ignore */ }
        res.status(500).json({ error: "خطا در آپلود به سرور ذخیره‌سازی" });
        return;
      }
    } else {
      const destDir = path.join(UPLOAD_DIR, "videos");
      try { if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true }); } catch { /* ignore */ }
      const dest = path.join(destDir, req.file.filename);
      try { fs.renameSync(localPath, dest); } catch { fs.copyFileSync(localPath, dest); fs.unlinkSync(localPath); }
      url = `${getBaseUrl(req)}/api/uploads/videos/${req.file.filename}`;
    }
    res.json({ url });
  });
});

router.post("/upload/channel-voice", requireUser, (req: Request, res: Response) => {
  if (req.user!.phone !== CHANNEL_OWNER_PHONE_UPLOAD) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  channelVoiceUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : "خطا" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname) || ".webm";
    const key = `audios/${uniqueName(ext, "voice-")}`;
    const storage = tryGetStorage();
    if (!storage) { res.status(503).json({ error: "سرویس ذخیره‌سازی پیکربندی نشده است" }); return; }
    let url: string;
    try { url = await storage.upload(key, req.file.buffer, { contentType: req.file.mimetype, cacheControl: "public, max-age=31536000, immutable" }); }
    catch (uploadErr) { logger.error({ err: uploadErr }, "S3 upload failed"); res.status(500).json({ error: "خطا در آپلود" }); return; }
    res.json({ url: toProxyUrl(url) ?? url });
  });
});

// ─── Admin channel avatar ─────────────────────────────────────────────────────
const adminChannelImageUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("image/")) cb(null, true);
    else cb(new Error("فقط فایل‌های تصویری مجاز هستند"));
  },
});

router.post("/upload/admin-channel-avatar", requireAdmin, (req: Request, res: Response) => {
  adminChannelImageUpload.single("file")(req, res, async (err) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : "خطا" }); return; }
    if (!req.file) { res.status(400).json({ error: "فایلی ارسال نشد" }); return; }

    const ext = path.extname(req.file.originalname);
    const { buffer: finalBuf, ext: finalExt } = await convertToWebPBuffer(req.file.buffer, ext);
    const key = `images/${uniqueName(finalExt)}`;
    const storage = tryGetStorage();
    let url: string;
    if (storage) {
      try { url = await storage.upload(key, finalBuf, { contentType: "image/webp" }); }
      catch (uploadErr) { logger.error({ err: uploadErr }, "S3 upload failed"); res.status(500).json({ error: "خطا در آپلود" }); return; }
    } else {
      const fallbackDir = path.join(UPLOAD_DIR, "images");
      try { if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true }); } catch { /* ignore */ }
      const filename = uniqueName(finalExt);
      fs.writeFileSync(path.join(fallbackDir, filename), finalBuf);
      url = `${getBaseUrl(req)}/api/uploads/images/${filename}`;
    }
    res.json({ url });
  });
});

// ─── Chunked upload — lesson (phone-gated user) ───────────────────────────────
const LESSON_ADMIN_PHONE = "09354505225";

router.post("/upload/chunk-lesson", requireUser, (req: Request, res: Response) => {
  const user = (req as any).user as { userId: number; phone: string };
  if (user.phone !== LESSON_ADMIN_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  req.setTimeout(0);
  chunkUpload.single("chunk")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در دریافت تکه" }); return; }
    if (!req.file) { res.status(400).json({ error: "تکه‌ای ارسال نشد" }); return; }
    res.json({ received: true });
  });
});

router.post("/upload/chunk-lesson/finalize", requireUser, async (req: Request, res: Response) => {
  const user = (req as any).user as { userId: number; phone: string };
  if (user.phone !== LESSON_ADMIN_PHONE) { res.status(403).json({ error: "دسترسی ندارید" }); return; }
  req.setTimeout(0);
  res.setTimeout(0);

  const { uploadId, totalChunks, ext } = req.body as { uploadId?: string; totalChunks?: number; ext?: string };
  if (!uploadId || !totalChunks || totalChunks < 1) { res.status(400).json({ error: "پارامترهای ناقص" }); return; }

  const safeExt = (ext && /^\.[a-z0-9]{2,5}$/i.test(ext)) ? ext : ".mp4";
  const finalFilename = uniqueName(safeExt);
  const finalPath = path.join(VIDEO_TMP_DIR, finalFilename);

  try {
    const writeStream = fs.createWriteStream(finalPath);
    for (let i = 0; i < Number(totalChunks); i++) {
      const chunkPath = path.join(CHUNK_TMP_DIR, `${uploadId}-${i}`);
      if (!fs.existsSync(chunkPath)) { writeStream.destroy(); throw new Error(`تکه ${i} یافت نشد`); }
      await pipeline(fs.createReadStream(chunkPath), writeStream, { end: false });
    }
    await new Promise<void>((resolve, reject) => { writeStream.end(); writeStream.once("finish", resolve); writeStream.once("error", reject); });
    for (let i = 0; i < Number(totalChunks); i++) {
      try { fs.unlinkSync(path.join(CHUNK_TMP_DIR, `${uploadId}-${i}`)); } catch { /* ignore */ }
    }

    const storage = tryGetStorage();
    if (storage) {
      // Return URL immediately, optimize + upload in background
      const key = `videos/${finalFilename}`;
      const placeholderUrl = storage.getPublicUrl(key);
      res.json({ url: placeholderUrl });

      // Background: optimize then upload to S3
      optimizeReelVideo(finalPath)
        .then(async () => {
          try {
            await uploadFileToStorage(finalPath, key, "video/mp4");
          } catch (e) {
            logger.warn({ finalPath, err: (e as Error).message }, "background S3 upload failed (lesson)");
          }
        })
        .catch((e) => logger.warn({ finalPath, err: (e as Error).message }, "background optimize failed (lesson)"));
    } else {
      const destDir = path.join(UPLOAD_DIR, "videos");
      try { if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true }); } catch { /* ignore */ }
      const destPath = path.join(destDir, finalFilename);
      // Return URL immediately, optimize in background
      const baseUrl = process.env.BASE_URL || "";
      res.json({ url: `${baseUrl}/api/uploads/videos/${finalFilename}` });
      optimizeReelVideo(finalPath)
        .then(() => { try { fs.renameSync(finalPath, destPath); } catch { /* ignore */ } })
        .catch((e) => logger.warn({ err: (e as Error).message }, "background optimize failed"));
    }
  } catch (e: unknown) {
    try { fs.unlinkSync(finalPath); } catch { /* ignore */ }
    res.status(500).json({ error: e instanceof Error ? e.message : "خطای سرور" });
  }
});

// ─── Chunked upload — admin ────────────────────────────────────────────────────
router.post("/upload/chunk", requireAdmin, (req: Request, res: Response) => {
  chunkUpload.single("chunk")(req, res, (err) => {
    if (err) { res.status(400).json({ error: err.message || "خطا در دریافت تکه" }); return; }
    if (!req.file) { res.status(400).json({ error: "تکه‌ای ارسال نشد" }); return; }
    res.json({ received: true });
  });
});

router.post("/upload/chunk/finalize", requireAdmin, async (req: Request, res: Response) => {
  req.setTimeout(0);
  res.setTimeout(0);

  const { uploadId, totalChunks, ext } = req.body as { uploadId?: string; totalChunks?: number; ext?: string };
  if (!uploadId || !totalChunks || totalChunks < 1) { res.status(400).json({ error: "پارامترهای ناقص" }); return; }

  const safeExt = (ext && /^\.[a-z0-9]{2,5}$/i.test(ext)) ? ext : ".mp4";
  const finalFilename = uniqueName(safeExt);
  const finalPath = path.join(VIDEO_TMP_DIR, finalFilename);

  try {
    const writeStream = fs.createWriteStream(finalPath);
    for (let i = 0; i < Number(totalChunks); i++) {
      const chunkPath = path.join(CHUNK_TMP_DIR, `${uploadId}-${i}`);
      if (!fs.existsSync(chunkPath)) { writeStream.destroy(); throw new Error(`تکه ${i} یافت نشد`); }
      await pipeline(fs.createReadStream(chunkPath), writeStream, { end: false });
    }
    await new Promise<void>((resolve, reject) => {
      writeStream.end();
      writeStream.once("finish", resolve);
      writeStream.once("error", reject);
    });
    for (let i = 0; i < Number(totalChunks); i++) {
      try { fs.unlinkSync(path.join(CHUNK_TMP_DIR, `${uploadId}-${i}`)); } catch { /* ignore */ }
    }

    const storage = tryGetStorage();
    if (storage) {
      const key = `videos/${finalFilename}`;
      const fileUrl = storage.getPublicUrl(key);
      res.json({ url: fileUrl });

      // Background: optimize then upload to S3
      optimizeReelVideo(finalPath)
        .then(async () => {
          try {
            await uploadFileToStorage(finalPath, key, "video/mp4");
          } catch (e) {
            logger.warn({ finalPath, err: (e as Error).message }, "background S3 upload failed");
          }
        })
        .catch((e) => logger.warn({ finalPath, err: (e as Error).message }, "background optimize failed"));
    } else {
      const destDir = path.join(UPLOAD_DIR, "videos");
      try { if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true }); } catch { /* ignore */ }
      const destPath = path.join(destDir, finalFilename);
      const fileUrl = `${process.env.BASE_URL || ""}/api/uploads/videos/${finalFilename}`;
      res.json({ url: fileUrl });

      optimizeReelVideo(finalPath)
        .then(() => { try { fs.renameSync(finalPath, destPath); } catch { /* ignore */ } })
        .catch((e) => logger.warn({ err: (e as Error).message }, "background optimize failed"));
    }
  } catch (e: unknown) {
    try { fs.unlinkSync(finalPath); } catch { /* ignore */ }
    res.status(500).json({ error: e instanceof Error ? e.message : "خطای سرور" });
  }
});

export default router;
