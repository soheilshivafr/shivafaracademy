/**
 * migrate-video-urls.ts
 *
 * Migrates legacy local video URLs stored in the database to the new
 * Object Storage (S3-compatible) format used by StorageService.
 *
 * Legacy format:  https://shivafaracademy.ir/api/uploads/videos/<filename>
 *                 /api/uploads/videos/<filename>
 * New format:     <S3_PUBLIC_BASE_URL>/videos/<filename>
 *                 (e.g. https://c163573.parspack.net/videos/<filename>)
 *
 * Requirements:
 *   - idempotent  (safe to run multiple times)
 *   - verifies object exists in S3 before updating
 *   - never updates records when object is missing
 *   - prints a full summary report at the end
 *
 * Usage:
 *   S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY=... S3_SECRET_KEY=... \
 *   S3_REGION=... S3_PUBLIC_BASE_URL=... DATABASE_URL=... \
 *   pnpm --filter @workspace/scripts run migrate-video-urls
 */

import { db } from "../../lib/db/src/index.js";
import { courseLessonsTable, reelsTable } from "../../lib/db/src/index.js";
import { eq, like, or } from "drizzle-orm";
import {
  S3Client,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

// ─── Config ───────────────────────────────────────────────────────────────────

const S3_ENDPOINT       = process.env.S3_ENDPOINT!;
const S3_REGION         = process.env.S3_REGION!;
const S3_BUCKET         = process.env.S3_BUCKET!;
const S3_ACCESS_KEY     = process.env.S3_ACCESS_KEY!;
const S3_SECRET_KEY     = process.env.S3_SECRET_KEY!;
const S3_PUBLIC_BASE_URL = (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");

for (const [name, val] of [
  ["S3_ENDPOINT",        S3_ENDPOINT],
  ["S3_REGION",          S3_REGION],
  ["S3_BUCKET",          S3_BUCKET],
  ["S3_ACCESS_KEY",      S3_ACCESS_KEY],
  ["S3_SECRET_KEY",      S3_SECRET_KEY],
  ["S3_PUBLIC_BASE_URL", S3_PUBLIC_BASE_URL],
] as [string, string][]) {
  if (!val) {
    console.error(`❌ Missing required env var: ${name}`);
    process.exit(1);
  }
}

const s3 = new S3Client({
  endpoint:    S3_ENDPOINT,
  region:      S3_REGION,
  credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  forcePathStyle: true,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true when url is already pointing at current Object Storage. */
function isNewFormat(url: string): boolean {
  return url.startsWith(S3_PUBLIC_BASE_URL + "/");
}

/**
 * Extract the bare filename from a legacy local upload URL.
 * Accepts both absolute (https://shivafaracademy.ir/api/uploads/videos/xxx)
 * and relative (/api/uploads/videos/xxx) forms.
 * Returns null if the pattern does not match.
 */
function extractFilename(url: string): string | null {
  const m = url.match(/(?:^|\/)(api\/uploads\/videos\/|uploads\/videos\/)([^/?#]+)$/i);
  if (m) return m[2];
  // Also handle bare filenames stored without any path prefix
  return null;
}

/** Build the S3 object key for a video filename. Matches the upload route. */
function buildKey(filename: string): string {
  return `videos/${filename}`;
}

/** Build the new public URL from a key. */
function buildPublicUrl(key: string): string {
  return `${S3_PUBLIC_BASE_URL}/${key}`;
}

/** Returns true when the object exists in the bucket. */
async function existsInS3(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

// ─── Counter ──────────────────────────────────────────────────────────────────

interface Stats {
  scanned:       number;
  updated:       number;
  alreadyCorrect: number;
  missingInS3:   number;
  failed:        number;
  missingList:   { table: string; id: number; url: string }[];
  failedList:    { table: string; id: number; url: string; error: string }[];
}

const stats: Stats = {
  scanned:        0,
  updated:        0,
  alreadyCorrect: 0,
  missingInS3:    0,
  failed:         0,
  missingList:    [],
  failedList:     [],
};

// ─── Migration logic ──────────────────────────────────────────────────────────

/** Legacy URL patterns to search for. */
const LEGACY_PATTERNS = [
  "%/api/uploads/videos/%.%",
  "%/uploads/videos/%.%",
];

async function migrateLesson(lesson: { id: number; videoUrl: string | null }) {
  const url = lesson.videoUrl;
  if (!url) return;

  stats.scanned++;

  if (isNewFormat(url)) {
    stats.alreadyCorrect++;
    console.log(`  ✅ lesson #${lesson.id} — already correct`);
    return;
  }

  const filename = extractFilename(url);
  if (!filename) {
    stats.failed++;
    stats.failedList.push({ table: "course_lessons", id: lesson.id, url, error: "Could not extract filename from URL" });
    console.warn(`  ⚠️  lesson #${lesson.id} — could not extract filename: ${url}`);
    return;
  }

  const key = buildKey(filename);
  const exists = await existsInS3(key);

  if (!exists) {
    stats.missingInS3++;
    stats.missingList.push({ table: "course_lessons", id: lesson.id, url });
    console.warn(`  ❌ lesson #${lesson.id} — object not found in S3: ${key}`);
    return;
  }

  const newUrl = buildPublicUrl(key);
  try {
    await db
      .update(courseLessonsTable)
      .set({ videoUrl: newUrl })
      .where(eq(courseLessonsTable.id, lesson.id));
    stats.updated++;
    console.log(`  ✏️  lesson #${lesson.id} — updated`);
    console.log(`       old: ${url}`);
    console.log(`       new: ${newUrl}`);
  } catch (err) {
    stats.failed++;
    stats.failedList.push({ table: "course_lessons", id: lesson.id, url, error: (err as Error).message });
    console.error(`  💥 lesson #${lesson.id} — DB update failed: ${(err as Error).message}`);
  }
}

async function migrateReel(reel: { id: number; videoUrl: string }) {
  const url = reel.videoUrl;

  stats.scanned++;

  if (isNewFormat(url)) {
    stats.alreadyCorrect++;
    console.log(`  ✅ reel #${reel.id} — already correct`);
    return;
  }

  const filename = extractFilename(url);
  if (!filename) {
    stats.failed++;
    stats.failedList.push({ table: "reels", id: reel.id, url, error: "Could not extract filename from URL" });
    console.warn(`  ⚠️  reel #${reel.id} — could not extract filename: ${url}`);
    return;
  }

  const key = buildKey(filename);
  const exists = await existsInS3(key);

  if (!exists) {
    stats.missingInS3++;
    stats.missingList.push({ table: "reels", id: reel.id, url });
    console.warn(`  ❌ reel #${reel.id} — object not found in S3: ${key}`);
    return;
  }

  const newUrl = buildPublicUrl(key);
  try {
    await db
      .update(reelsTable)
      .set({ videoUrl: newUrl })
      .where(eq(reelsTable.id, reel.id));
    stats.updated++;
    console.log(`  ✏️  reel #${reel.id} — updated`);
    console.log(`       old: ${url}`);
    console.log(`       new: ${newUrl}`);
  } catch (err) {
    stats.failed++;
    stats.failedList.push({ table: "reels", id: reel.id, url, error: (err as Error).message });
    console.error(`  💥 reel #${reel.id} — DB update failed: ${(err as Error).message}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  Shivafer — Video URL Migration  (legacy → Object Storage)");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  S3 bucket      : ${S3_BUCKET}`);
  console.log(`  Public base URL: ${S3_PUBLIC_BASE_URL}`);
  console.log();

  // ── 1. course_lessons ──────────────────────────────────────────────────────
  console.log("▶ Scanning table: course_lessons (video_url)");

  const legacyLessons = await db
    .select({ id: courseLessonsTable.id, videoUrl: courseLessonsTable.videoUrl })
    .from(courseLessonsTable)
    .where(
      or(
        ...LEGACY_PATTERNS.map((p) => like(courseLessonsTable.videoUrl!, p)),
      ),
    );

  console.log(`  Found ${legacyLessons.length} lesson(s) with legacy video URLs`);
  for (const lesson of legacyLessons) {
    await migrateLesson(lesson);
  }

  // ── 2. reels ───────────────────────────────────────────────────────────────
  console.log();
  console.log("▶ Scanning table: reels (video_url)");

  const legacyReels = await db
    .select({ id: reelsTable.id, videoUrl: reelsTable.videoUrl })
    .from(reelsTable)
    .where(
      or(
        ...LEGACY_PATTERNS.map((p) => like(reelsTable.videoUrl, p)),
      ),
    );

  console.log(`  Found ${legacyReels.length} reel(s) with legacy video URLs`);
  for (const reel of legacyReels) {
    await migrateReel(reel);
  }

  // ── Report ─────────────────────────────────────────────────────────────────
  console.log();
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  MIGRATION REPORT");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Total scanned   : ${stats.scanned}`);
  console.log(`  Updated         : ${stats.updated}`);
  console.log(`  Already correct : ${stats.alreadyCorrect}`);
  console.log(`  Missing in S3   : ${stats.missingInS3}`);
  console.log(`  Failed          : ${stats.failed}`);

  if (stats.missingList.length > 0) {
    console.log();
    console.log("  ❌ Records NOT updated (object missing in S3):");
    for (const { table, id, url } of stats.missingList) {
      console.log(`     [${table}] id=${id}  ${url}`);
    }
  }

  if (stats.failedList.length > 0) {
    console.log();
    console.log("  💥 Errors:");
    for (const { table, id, url, error } of stats.failedList) {
      console.log(`     [${table}] id=${id}  ${url}`);
      console.log(`       → ${error}`);
    }
  }

  console.log();

  if (stats.missingInS3 > 0 || stats.failed > 0) {
    console.log("⚠️  Migration completed with warnings — see above.");
    process.exit(1);
  } else {
    console.log("✅ Migration completed successfully.");
  }
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
