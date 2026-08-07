// ─── Storage Layer — Public API ───────────────────────────────────────────────
// Import everything storage-related from here, never from sub-modules directly.

export type { StorageProvider, UploadOptions, RangeResult } from "./provider.js";
export { S3StorageProvider } from "./s3-provider.js";
export { StorageService } from "./service.js";

import { S3StorageProvider } from "./s3-provider.js";
import { StorageService } from "./service.js";

let _instance: StorageService | null = null;

/**
 * Returns the singleton StorageService.
 * Reads configuration from environment variables on first call.
 *
 * Required env vars:
 *   S3_ENDPOINT        — e.g. https://c163573.parspack.net
 *   S3_REGION          — e.g. us-east-1
 *   S3_BUCKET          — bucket name
 *   S3_ACCESS_KEY      — access key ID
 *   S3_SECRET_KEY      — secret access key
 *   S3_PUBLIC_BASE_URL — public URL prefix, e.g. https://c163573.parspack.net
 *
 * Throws if any of the above vars are missing.
 */
export function getStorageService(): StorageService {
  if (_instance) return _instance;

  const endpoint      = process.env.S3_ENDPOINT;
  const region        = process.env.S3_REGION;
  const bucket        = process.env.S3_BUCKET;
  const accessKey     = process.env.S3_ACCESS_KEY;
  const secretKey     = process.env.S3_SECRET_KEY;
  const publicBaseUrl = process.env.S3_PUBLIC_BASE_URL;

  if (!endpoint || !region || !bucket || !accessKey || !secretKey || !publicBaseUrl) {
    const missing = [
      !endpoint      && "S3_ENDPOINT",
      !region        && "S3_REGION",
      !bucket        && "S3_BUCKET",
      !accessKey     && "S3_ACCESS_KEY",
      !secretKey     && "S3_SECRET_KEY",
      !publicBaseUrl && "S3_PUBLIC_BASE_URL",
    ].filter(Boolean).join(", ");
    throw new Error(`Storage not configured. Missing env vars: ${missing}`);
  }

  _instance = new StorageService(
    new S3StorageProvider({ endpoint, region, bucket, accessKey, secretKey, publicBaseUrl }),
    publicBaseUrl,
  );
  return _instance;
}

/**
 * Returns true when all required S3 env vars are present.
 * Use this to gracefully degrade (fall back to disk) if storage isn't configured yet.
 */
export function isStorageConfigured(): boolean {
  return !!(
    process.env.S3_ENDPOINT &&
    process.env.S3_REGION &&
    process.env.S3_BUCKET &&
    process.env.S3_ACCESS_KEY &&
    process.env.S3_SECRET_KEY &&
    process.env.S3_PUBLIC_BASE_URL
  );
}

/**
 * Convert any S3 URL to a backend proxy URL so the client never sees a raw
 * Object Storage URL. Local URLs and nulls pass through unchanged.
 *
 * Example:
 *   "https://c163573.parspack.net/images/foo.webp"
 *   → "/api/stream/media?key=images%2Ffoo.webp"
 *
 * Falls back to the original URL when storage is not configured (dev without S3).
 */
export function toProxyUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (!isStorageConfigured()) return url;
  try {
    const storage = getStorageService();
    const key = storage.keyFromUrl(url);
    if (key) {
      const base = process.env.BASE_URL ?? "";
      return `${base}/api/stream/media?key=${encodeURIComponent(key)}`;
    }
  } catch {
    // storage misconfigured — return raw URL as fallback
  }
  return url;
}
