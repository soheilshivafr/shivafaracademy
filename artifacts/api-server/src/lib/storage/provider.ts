// ─── Storage Provider Interface ──────────────────────────────────────────────
// Provider-based storage abstraction. Swap implementations without touching
// any route or business logic — only the factory in index.ts changes.

export interface UploadOptions {
  contentType?: string;
  cacheControl?: string;
  /** Default: "public-read" */
  acl?: "public-read" | "private";
}

export interface RangeResult {
  /** Node.js Readable stream for the object body */
  body: NodeJS.ReadableStream;
  statusCode: 200 | 206;
  contentType: string;
  contentLength?: number;
  contentRange?: string;
}

export interface StorageProvider {
  /** Upload a buffer. Resolves when the object is durably stored. */
  upload(key: string, data: Buffer, options?: UploadOptions): Promise<void>;

  /** Download an object as a buffer. */
  download(key: string): Promise<Buffer>;

  /**
   * Stream an object (with optional Range support).
   * @param key   Object key
   * @param range Optional HTTP Range header value (e.g. "bytes=0-1023")
   */
  streamRange(key: string, range?: string): Promise<RangeResult>;

  /** Delete an object. Resolves silently if the key does not exist. */
  delete(key: string): Promise<void>;

  /** Returns true if the object exists. */
  exists(key: string): Promise<boolean>;

  /** Copy an object within the same bucket. */
  copy(sourceKey: string, destKey: string): Promise<void>;

  /** Move = copy + delete source. */
  move(sourceKey: string, destKey: string): Promise<void>;

  /** Get the public (no-auth) URL for the key. */
  getPublicUrl(key: string): string;

  /** Generate a time-limited signed URL (default 3600 s). */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}
