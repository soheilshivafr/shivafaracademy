// ─── S3-Compatible Storage Provider ──────────────────────────────────────────
// Works with AWS S3, Cloudflare R2, MinIO, Backblaze B2, ParsPack, Liara, etc.
// No hardcoded values — all config comes from the constructor (injected via ENV).

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  CopyObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl as awsGetSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, UploadOptions, RangeResult } from "./provider.js";
import type { Readable } from "stream";

export interface S3Config {
  endpoint: string;
  region: string;
  bucket: string;
  accessKey: string;
  secretKey: string;
  /** Base URL used for public object access, e.g. https://c163573.parspack.net */
  publicBaseUrl: string;
}

export class S3StorageProvider implements StorageProvider {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicBaseUrl: string;

  constructor(config: S3Config) {
    this.bucket = config.bucket;
    this.publicBaseUrl = config.publicBaseUrl.replace(/\/$/, "");
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      credentials: {
        accessKeyId: config.accessKey,
        secretAccessKey: config.secretKey,
      },
      // Required for MinIO / ParsPack / most S3-compatible providers.
      // AWS S3 itself ignores this flag.
      forcePathStyle: true,
    });
  }

  async upload(key: string, data: Buffer, options?: UploadOptions): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: data,
        ContentType: options?.contentType ?? "application/octet-stream",
        ...(options?.cacheControl ? { CacheControl: options.cacheControl } : {}),
        // Default to public-read so URLs work without signing.
        // Pass acl: "private" for access-controlled content.
        ACL: options?.acl === "private" ? "private" : "public-read",
      }),
    );
  }

  async download(key: string): Promise<Buffer> {
    const output = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!output.Body) throw new Error(`S3 empty body for key: ${key}`);
    const chunks: Uint8Array[] = [];
    for await (const chunk of output.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  async streamRange(key: string, range?: string): Promise<RangeResult> {
    const output = await this.client.send(
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ...(range ? { Range: range } : {}),
      }),
    );
    if (!output.Body) throw new Error(`S3 empty body for key: ${key}`);

    // Use the actual HTTP status returned by the provider.
    // S3-compatible providers return 206 when Range is honoured, 200 otherwise.
    const httpStatus = (output.$metadata?.httpStatusCode as number | undefined);
    const statusCode: 200 | 206 =
      httpStatus === 206 ? 206 :
      httpStatus === 200 ? 200 :
      range ? 206 : 200;

    return {
      body: output.Body as Readable,
      statusCode,
      contentType: output.ContentType ?? "video/mp4",
      contentLength: output.ContentLength,
      contentRange: output.ContentRange,
    };
  }

  async delete(key: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
      );
    } catch (err: unknown) {
      // S3 returns 204 on missing key — but some providers throw NoSuchKey
      const code = (err as { Code?: string; $metadata?: { httpStatusCode?: number } })?.Code;
      const status = (err as { $metadata?: { httpStatusCode?: number } })?.$metadata?.httpStatusCode;
      if (code === "NoSuchKey" || status === 404) return;
      throw err;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      await this.client.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch {
      return false;
    }
  }

  async copy(sourceKey: string, destKey: string): Promise<void> {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destKey,
        ACL: "public-read",
      }),
    );
  }

  async move(sourceKey: string, destKey: string): Promise<void> {
    await this.copy(sourceKey, destKey);
    await this.delete(sourceKey);
  }

  getPublicUrl(key: string): string {
    return `${this.publicBaseUrl}/${key}`;
  }

  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    return awsGetSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }
}
