import { Router } from "express";
import { createReadStream, existsSync, statSync, mkdirSync, unlinkSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import multer from "multer";
import { requireAdmin } from "../middlewares/auth";
import { db } from "@workspace/db";
import { analyticsEventsTable } from "@workspace/db";

const router = Router();

// Resolve the downloads directory relative to the bundled module instead of
// process.cwd(). In production (autoscale, application router) the api-server
// process starts from the repo root, while in dev it starts from the package
// dir — so a cwd-relative path points to the wrong place in production.
// MODULE_DIR is the bundled dist/ folder, and public/ sits next to it.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR_CANDIDATES = [
  join(MODULE_DIR, "..", "public", "downloads"),
  join(process.cwd(), "public", "downloads"),
  join(process.cwd(), "artifacts", "api-server", "public", "downloads"),
];

function resolvePublicDir(): string {
  for (const dir of PUBLIC_DIR_CANDIDATES) {
    if (
      existsSync(join(dir, "shivafaracademy.apk")) ||
      existsSync(join(dir, "shivafaracademy-android.zip"))
    ) {
      return dir;
    }
  }
  return PUBLIC_DIR_CANDIDATES[0];
}

const PUBLIC_DIR = resolvePublicDir();
const APK_PATH = join(PUBLIC_DIR, "shivafaracademy.apk");
const ZIP_PATH = join(PUBLIC_DIR, "shivafaracademy-android.zip");

function ensurePublicDir() {
  if (!existsSync(PUBLIC_DIR)) mkdirSync(PUBLIC_DIR, { recursive: true });
}

const apkUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensurePublicDir();
      cb(null, PUBLIC_DIR);
    },
    filename: (_req, _file, cb) => cb(null, "shivafaracademy.apk"),
  }),
  fileFilter: (_req, file, cb) => {
    const ok = file.mimetype === "application/vnd.android.package-archive"
      || file.originalname.endsWith(".apk");
    cb(null, ok);
  },
  limits: { fileSize: 200 * 1024 * 1024 }, // 200 MB
});

// GET /api/download/android — serve APK if available, else serve project ZIP
router.get("/download/android", (req, res) => {
  ensurePublicDir();

  // fire-and-forget APK install tracking
  const sessionId = (req.headers["x-session-id"] as string) || `apk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  db.insert(analyticsEventsTable).values({ eventType: "apk_install", sessionId }).catch(() => {});

  if (existsSync(APK_PATH)) {
    const stat = statSync(APK_PATH);
    res.setHeader("Content-Type", "application/vnd.android.package-archive");
    res.setHeader("Content-Disposition", 'attachment; filename="ShivafarAcademy.apk"');
    res.setHeader("Content-Length", stat.size);
    createReadStream(APK_PATH).pipe(res);
    return;
  }

  if (existsSync(ZIP_PATH)) {
    const stat = statSync(ZIP_PATH);
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="shivafaracademy-android.zip"');
    res.setHeader("Content-Length", stat.size);
    createReadStream(ZIP_PATH).pipe(res);
    return;
  }

  res.status(503).json({ error: "فایل دانلود در دسترس نیست" });
});

// GET /api/download/android/info — metadata about what is available
router.get("/download/android/info", (_req, res) => {
  ensurePublicDir();
  const apkExists = existsSync(APK_PATH);
  const zipExists = existsSync(ZIP_PATH);

  if (apkExists) {
    const stat = statSync(APK_PATH);
    res.json({
      type: "apk",
      available: true,
      sizeBytes: stat.size,
      sizeMb: +(stat.size / 1024 / 1024).toFixed(1),
      filename: "ShivafarAcademy.apk",
      updatedAt: stat.mtime,
    });
    return;
  }

  if (zipExists) {
    const stat = statSync(ZIP_PATH);
    res.json({
      type: "zip",
      available: true,
      sizeBytes: stat.size,
      sizeMb: +(stat.size / 1024 / 1024).toFixed(1),
      filename: "shivafaracademy-android.zip",
      updatedAt: stat.mtime,
    });
    return;
  }

  res.json({ type: null, available: false, sizeBytes: 0, sizeMb: 0 });
});

// POST /api/admin/download/upload-apk — admin uploads the compiled APK
router.post(
  "/admin/download/upload-apk",
  requireAdmin,
  apkUpload.single("apk"),
  (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "فایل APK ارسال نشده یا فرمت نامعتبر است" });
      return;
    }
    const stat = statSync(APK_PATH);
    res.json({
      ok: true,
      sizeBytes: stat.size,
      sizeMb: +(stat.size / 1024 / 1024).toFixed(1),
      message: "APK با موفقیت آپلود شد",
    });
  }
);

// DELETE /api/admin/download/apk — remove uploaded APK (revert to project ZIP)
router.delete("/admin/download/apk", requireAdmin, (_req, res) => {
  if (existsSync(APK_PATH)) {
    unlinkSync(APK_PATH);
    res.json({ ok: true, message: "APK حذف شد" });
  } else {
    res.status(404).json({ error: "فایل APK وجود ندارد" });
  }
});

export default router;
