/**
 * migrate-audio-urls.ts  (v41)
 *
 * Migrates legacy local audio URLs in the database to Object Storage.
 * Self-contained — only uses pg (raw SQL) and @aws-sdk/client-s3.
 *
 * Tables: products.audio_url, courses.audio_url,
 *         course_lessons.audio_url, audio_posts.audio_url
 *
 * Usage:
 *   export DATABASE_URL=postgres://...
 *   export S3_ENDPOINT=https://c163573.parspack.net
 *   export S3_REGION=us-east-1
 *   export S3_BUCKET=c163573
 *   export S3_ACCESS_KEY=...
 *   export S3_SECRET_KEY=...
 *   export S3_PUBLIC_BASE_URL=https://c163573.parspack.net
 *   export UPLOAD_DIR=/var/www/uploads
 *   pnpm --filter @workspace/scripts run migrate-audio-urls
 */

import * as fs   from "fs";
import * as path from "path";
import pg        from "pg";
import {
  S3Client,
  PutObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

// ─── Config ───────────────────────────────────────────────────────────────────

const S3_ENDPOINT        = process.env.S3_ENDPOINT!;
const S3_REGION          = process.env.S3_REGION!;
const S3_BUCKET          = process.env.S3_BUCKET!;
const S3_ACCESS_KEY      = process.env.S3_ACCESS_KEY!;
const S3_SECRET_KEY      = process.env.S3_SECRET_KEY!;
const S3_PUBLIC_BASE_URL = (process.env.S3_PUBLIC_BASE_URL ?? "").replace(/\/$/, "");
const DATABASE_URL       = process.env.DATABASE_URL!;
const UPLOAD_DIR         = process.env.UPLOAD_DIR || "/var/www/uploads";

for (const [name, val] of Object.entries({
  S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY,
  S3_SECRET_KEY, S3_PUBLIC_BASE_URL, DATABASE_URL,
})) {
  if (!val) { console.error(`❌ Missing env var: ${name}`); process.exit(1); }
}

const pool = new pg.Pool({ connectionString: DATABASE_URL });

const s3 = new S3Client({
  endpoint:    S3_ENDPOINT,
  region:      S3_REGION,
  credentials: { accessKeyId: S3_ACCESS_KEY, secretAccessKey: S3_SECRET_KEY },
  forcePathStyle: true,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isNewFormat(url: string): boolean {
  return url.startsWith(S3_PUBLIC_BASE_URL + "/");
}

function extractFilename(url: string): { filename: string; srcDir: string } | null {
  const m = url.match(/(?:^|\/)api\/uploads\/(audios|files)\/([^/?#]+)$/i);
  if (!m) return null;
  return { filename: m[2], srcDir: m[1] };
}

function guessMime(filename: string): string {
  const map: Record<string, string> = {
    ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac",
    ".ogg": "audio/ogg",  ".wav": "audio/wav",  ".webm": "audio/webm",
    ".flac": "audio/flac",
  };
  return map[path.extname(filename).toLowerCase()] ?? "audio/mpeg";
}

async function existsInS3(key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch { return false; }
}

async function uploadToS3(key: string, localPath: string): Promise<void> {
  const body = fs.readFileSync(localPath);
  await s3.send(new PutObjectCommand({
    Bucket:       S3_BUCKET,
    Key:          key,
    Body:         body,
    ContentType:  guessMime(localPath),
    CacheControl: "public, max-age=31536000, immutable",
    ACL:          "public-read" as never,
  }));
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const stats = {
  scanned: 0, updated: 0, alreadyCorrect: 0,
  alreadyInS3: 0, missingOnDisk: 0, failed: 0,
  missingList: [] as { table: string; id: number; url: string }[],
  failedList:  [] as { table: string; id: number; url: string; error: string }[],
};

// ─── Core migrator ────────────────────────────────────────────────────────────

async function migrateRow(
  table: string,
  id: number,
  audioUrl: string,
  updateSql: string,
): Promise<void> {
  stats.scanned++;

  if (isNewFormat(audioUrl)) { stats.alreadyCorrect++; return; }

  const parsed = extractFilename(audioUrl);
  if (!parsed) {
    console.warn(`  [${table}] id=${id} — unrecognised URL, skipping: ${audioUrl}`);
    stats.failed++;
    stats.failedList.push({ table, id, url: audioUrl, error: "unrecognised URL format" });
    return;
  }

  const { filename, srcDir } = parsed;
  const key       = `audios/${filename}`;
  const newUrl    = `${S3_PUBLIC_BASE_URL}/${key}`;
  const localPath = path.join(UPLOAD_DIR, srcDir, filename);

  try {
    if (await existsInS3(key)) {
      console.log(`  [${table}] id=${id} — already in S3, updating DB`);
      await pool.query(updateSql, [newUrl, id]);
      stats.alreadyInS3++;
      stats.updated++;
      return;
    }

    if (!fs.existsSync(localPath)) {
      console.warn(`  [${table}] id=${id} — not on disk: ${localPath}`);
      stats.missingOnDisk++;
      stats.missingList.push({ table, id, url: audioUrl });
      return;
    }

    const kb = Math.round(fs.statSync(localPath).size / 1024);
    console.log(`  [${table}] id=${id} — uploading ${filename} (${kb} KB)…`);
    await uploadToS3(key, localPath);

    if (!await existsInS3(key)) throw new Error("HeadObject failed after upload");

    await pool.query(updateSql, [newUrl, id]);
    console.log(`  [${table}] id=${id} — ✅ ${newUrl}`);
    stats.updated++;

  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`  [${table}] id=${id} — ❌ ${msg}`);
    stats.failed++;
    stats.failedList.push({ table, id, url: audioUrl, error: msg });
  }
}

// ─── Table migrators ──────────────────────────────────────────────────────────

async function migrateTable(
  label: string,
  sql: string,
  updateSql: string,
): Promise<void> {
  console.log(`\n── ${label} ${"─".repeat(Math.max(0, 50 - label.length))}`);
  const { rows } = await pool.query(sql);
  console.log(`  Found ${rows.length} row(s)`);
  for (const row of rows) {
    await migrateRow(label, row.id, row.audio_url, updateSql);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  AUDIO MIGRATION — Local → Object Storage");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Endpoint : ${S3_ENDPOINT}`);
  console.log(`  Bucket   : ${S3_BUCKET}`);
  console.log(`  Base URL : ${S3_PUBLIC_BASE_URL}`);
  console.log(`  UploadDir: ${UPLOAD_DIR}`);

  const legacyFilter = `
    audio_url IS NOT NULL AND audio_url != ''
    AND audio_url NOT LIKE '${S3_PUBLIC_BASE_URL}/%'
  `;

  await migrateTable(
    "products",
    `SELECT id, audio_url FROM products WHERE ${legacyFilter}`,
    `UPDATE products SET audio_url = $1 WHERE id = $2`,
  );
  await migrateTable(
    "courses",
    `SELECT id, audio_url FROM courses WHERE ${legacyFilter}`,
    `UPDATE courses SET audio_url = $1 WHERE id = $2`,
  );
  await migrateTable(
    "course_lessons",
    `SELECT id, audio_url FROM course_lessons WHERE ${legacyFilter}`,
    `UPDATE course_lessons SET audio_url = $1 WHERE id = $2`,
  );
  await migrateTable(
    "audio_posts",
    `SELECT id, audio_url FROM audio_posts WHERE ${legacyFilter}`,
    `UPDATE audio_posts SET audio_url = $1 WHERE id = $2`,
  );

  await pool.end();

  console.log();
  console.log("═══════════════════════════════════════════════════════════");
  console.log("  REPORT");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`  Scanned         : ${stats.scanned}`);
  console.log(`  Uploaded+saved  : ${stats.updated - stats.alreadyInS3}`);
  console.log(`  Already in S3   : ${stats.alreadyInS3}`);
  console.log(`  Already correct : ${stats.alreadyCorrect}`);
  console.log(`  Missing on disk : ${stats.missingOnDisk}`);
  console.log(`  Failed          : ${stats.failed}`);

  if (stats.missingList.length) {
    console.log("\n  ❌ Missing on disk:");
    for (const { table, id, url } of stats.missingList)
      console.log(`     [${table}] id=${id}  ${url}`);
  }
  if (stats.failedList.length) {
    console.log("\n  💥 Errors:");
    for (const { table, id, url, error } of stats.failedList)
      console.log(`     [${table}] id=${id}  ${url}\n       → ${error}`);
  }

  console.log();
  if (stats.missingOnDisk > 0 || stats.failed > 0) {
    console.log("⚠️  Migration completed with warnings.");
    process.exit(1);
  } else {
    console.log("✅ Audio migration completed successfully.");
  }
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
