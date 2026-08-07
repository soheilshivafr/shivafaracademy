// ─── Storage Service ──────────────────────────────────────────────────────────
// High-level façade over a StorageProvider.
// All route handlers use this — never the provider directly.

import type { StorageProvider, UploadOptions, RangeResult } from "./provider.js";
import { logger } from "../logger.js";

export class StorageService {
  private readonly _publicBaseUrl: string;

  constructor(
    private readonly provider: StorageProvider,
    publicBaseUrl: string,
  ) {
    this._publicBaseUrl = publicBaseUrl.replace(/\/$/, "");
  }

  /**
   * Upload a buffer and return the public URL.
   * Throws on failure — no partial DB records should be created after a throw.
   */
  async upload(key: string, data: Buffer, options?: UploadOptions): Promise<string> {
    logger.info({ key, bytes: data.length }, "storage: upload");
    await this.provider.upload(key, data, options);
    return this.provider.getPublicUrl(key);
  }

  /** Download an object as a buffer. */
  async download(key: string): Promise<Buffer> {
    return this.provider.download(key);
  }

  /**
   * Stream an object with optional Range support.
   * Returns the stream + metadata needed to build the HTTP response.
   */
  async streamRange(key: string, range?: string): Promise<RangeResult> {
    return this.provider.streamRange(key, range);
  }

  /** Delete an object. Resolves silently if the key does not exist. */
  async delete(key: string): Promise<void> {
    logger.info({ key }, "storage: delete");
    return this.provider.delete(key);
  }

  async exists(key: string): Promise<boolean> {
    return this.provider.exists(key);
  }

  async copy(sourceKey: string, destKey: string): Promise<string> {
    await this.provider.copy(sourceKey, destKey);
    return this.provider.getPublicUrl(destKey);
  }

  async move(sourceKey: string, destKey: string): Promise<string> {
    await this.provider.move(sourceKey, destKey);
    return this.provider.getPublicUrl(destKey);
  }

  getPublicUrl(key: string): string {
    return this.provider.getPublicUrl(key);
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return this.provider.getSignedUrl(key, expiresIn);
  }

  /**
   * Extract the storage key from a public URL produced by this service.
   * e.g. "https://c163573.parspack.net/videos/foo.mp4" → "videos/foo.mp4"
   * Returns null if the URL doesn't belong to this storage instance.
   */
  keyFromUrl(url: string): string | null {
    if (!url.startsWith(this._publicBaseUrl + "/")) return null;
    return url.slice(this._publicBaseUrl.length + 1);
  }

  /**
   * @deprecated Pass publicBaseUrl explicitly via constructor instead.
   */
  keyFromPublicUrl(url: string, publicBaseUrl: string): string | null {
    const base = publicBaseUrl.replace(/\/$/, "");
    if (!url.startsWith(base + "/")) return null;
    return url.slice(base.length + 1);
  }
}
