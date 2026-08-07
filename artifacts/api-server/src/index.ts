// Polyfill File global for Node.js 18 compatibility
import { File as NodeFile } from "node:buffer";
if (typeof globalThis.File === "undefined") {
  (globalThis as any).File = NodeFile;
}

// Prevent MaxListenersExceededWarning during concurrent chunked uploads
process.stdout.setMaxListeners(0);
process.stderr.setMaxListeners(0);

import {
  accessSync,
  constants as fsConstants,
  statSync,
} from "node:fs";
import app from "./app";
import { logger } from "./lib/logger";
import { runMigrations } from "./lib/migrate";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// ─── Static Assets Startup Validation ────────────────────────────────────────
//
// Architecture (v6):
//   Production:  STATIC_ASSETS_PATH=/var/www/static-assets  (must be set + readable)
//   Development: STATIC_ASSETS_PATH optional — falls back to dist/public/static-assets/
//
// In production, a missing or unreadable STATIC_ASSETS_PATH is a fatal error:
// serving placeholder stubs to end users is worse than not starting at all.
// In development, the fallback is allowed (placeholder stubs are acceptable).
//
// ─────────────────────────────────────────────────────────────────────────────
function validateStaticAssets(): void {
  const isProduction = process.env.NODE_ENV === "production";
  const staticAssetsPath = process.env.STATIC_ASSETS_PATH;

  if (isProduction) {
    // Rule 1: STATIC_ASSETS_PATH must be set in production
    if (!staticAssetsPath || staticAssetsPath.trim() === "") {
      throw new Error(
        "[static-assets] FATAL: STATIC_ASSETS_PATH environment variable is not set.\n" +
        "  In production, set STATIC_ASSETS_PATH to the canonical asset directory (e.g. /var/www/static-assets).\n" +
        "  Refusing to start without it — serving placeholder stubs to users is unacceptable.",
      );
    }

    // Rule 2: The path must be a directory that exists and is readable
    try {
      accessSync(staticAssetsPath, fsConstants.R_OK);
      if (!statSync(staticAssetsPath).isDirectory()) {
        throw new Error("path is not a directory");
      }
    } catch (err: any) {
      const reason =
        err?.code === "ENOENT"
          ? "path does not exist"
          : err?.code === "EACCES"
          ? "path is not readable (permission denied)"
          : err?.message === "path is not a directory"
          ? "path is not a directory"
          : `access check failed (${err?.code ?? err?.message})`;
      throw new Error(
        `[static-assets] FATAL: STATIC_ASSETS_PATH="${staticAssetsPath}" — ${reason}.\n` +
        "  Ensure the directory exists and the process has read permissions.\n" +
        "  Refusing to start — static assets are required for production.",
      );
    }

    logger.info(
      { staticAssetsPath },
      "[static-assets] Production static assets path validated ✓",
    );
  } else {
    // Development: fallback is allowed, just log the effective path
    if (staticAssetsPath) {
      try {
        accessSync(staticAssetsPath, fsConstants.R_OK);
        logger.info(
          { staticAssetsPath },
          "[static-assets] Dev: using STATIC_ASSETS_PATH ✓",
        );
      } catch {
        logger.warn(
          { staticAssetsPath },
          "[static-assets] Dev: STATIC_ASSETS_PATH set but not readable — falling back to dist/public/static-assets",
        );
      }
    } else {
      logger.info(
        "[static-assets] Dev: STATIC_ASSETS_PATH not set — using dist/public/static-assets fallback",
      );
    }
  }
}

async function main() {
  // Validate static assets BEFORE starting the server so errors are explicit
  validateStaticAssets();

  await runMigrations();

  const server = app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });

  // Allow long-running requests (e.g. chunked video finalize) up to 30 minutes
  server.setTimeout(30 * 60 * 1000);
  server.keepAliveTimeout = 30 * 60 * 1000;
}

main().catch((err) => {
  logger.error({ err }, "Fatal startup error");
  process.exit(1);
});
