import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, cp, readdir, stat, mkdir } from "node:fs/promises";
import { existsSync, statSync } from "node:fs";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    // Production receives only the executable bundle. A linked sourcemap can
    // expose workspace source paths and lets Node resolve stack traces back to
    // files that are not present on the server.
    sourcemap: false,
    legalComments: "none",
    minify: true,
    plugins: [
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}


// ── Post-build: remove hardcoded build-machine paths from pino workers ──────
//
// ROOT CAUSE (documented):
//   esbuild-plugin-pino v2.x generates ESM worker files (pino-pretty.mjs, etc.)
//   and injects:  const outputDir = "/abs/build/machine/path/to/dist";
//   At runtime on the production server this path does not exist → workers fail.
//
//   The previous fix used require() / __dirname which are NOT available in ESM
//   worker files that don't carry the main bundle's banner. That caused the
//   "Cannot find module /home/runner/workspace/.../pino-pretty.mjs" error even
//   when grep found no such path in dist (the grep-invisible cause was that the
//   require() fallback itself errored first, producing a confusing stack trace).
//
//   THE FIX: use import.meta.url — always available in ESM modules regardless
//   of how they were loaded. new URL('.', import.meta.url).pathname gives the
//   directory of the currently executing file at runtime, not the build machine.
async function patchBuildMachinePaths() {
  const distDir = path.resolve(artifactDir, 'dist');
  const { readFileSync, writeFileSync, readdirSync } = await import('node:fs');
  const files = readdirSync(distDir).filter(f => f.endsWith('.mjs'));
  let patchedCount = 0;
  for (const file of files) {
    const fp = path.join(distDir, file);
    let content = readFileSync(fp, 'utf8');
    let modified = false;

    // Pattern 1: const outputDir = "/abs/path"; — injected by esbuild-plugin-pino
    const search = 'const outputDir = ' + JSON.stringify(distDir) + ';';
    if (content.includes(search)) {
      // import.meta.url is always available in ESM; new URL('.', url).pathname
      // resolves to the directory of the running file at runtime — no hardcoded path.
      const replacement = `const outputDir = new URL('.', import.meta.url).pathname.replace(/\\/+$/, '');`;
      content = content.replaceAll(search, replacement);
      modified = true;
      console.log('  [post-build] patched outputDir in:', file);
    }

    // Pattern 2: any remaining bare string occurrence of the absolute dist path
    // (safety net for plugin versions that embed it differently, e.g. in a Worker call)
    if (content.includes(distDir)) {
      // Replace "/abs/path/to/dist/worker.mjs" with a runtime-relative form.
      // Regex matches the quoted absolute path (JSON-stringified form).
      const escapedDir = distDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const workerPathRe = new RegExp('"' + escapedDir + '/([^"]+\\.mjs)"', 'g');
      content = content.replace(workerPathRe, (_, filename) =>
        `new URL(${JSON.stringify(filename)}, import.meta.url).pathname`
      );
      modified = true;
      console.log('  [post-build] patched absolute worker path in:', file);
    }

    // Pattern 3: minified plugin output may keep the dist directory as the
    // first argument to path.resolve(), rather than embedding the worker
    // filename in the same string. Replace the directory literal itself so
    // every worker path is resolved relative to the deployed bundle.
    const distLiteral = JSON.stringify(distDir);
    if (content.includes(distLiteral)) {
      const runtimeDistDir =
        "new URL('.', import.meta.url).pathname.replace(/\\/+$/, '')";
      content = content.replaceAll(distLiteral, runtimeDistDir);
      modified = true;
      console.log('  [post-build] patched embedded dist directory in:', file);
    }

    if (modified) {
      writeFileSync(fp, content);
      patchedCount++;
    }
  }
  if (patchedCount === 0) {
    console.log('  [post-build] no hardcoded paths found — nothing to patch.');
  }
}

// ── Post-build: safe copy of public/ → dist/public/ ──────────────────────────
//
// ROOT CAUSE DOCUMENTATION (2025-07):
// The leaderboard artwork (lion-crest-hq.webp, silver-crest.webp,
// bronze-crest.webp) and some avatars exist as tiny placeholder files in git
// (~3-4 KB each). The real production artwork is hand-placed on the server and
// is NOT committed to git. Any deploy step that blindly copies from source →
// production will overwrite the real files with the git placeholders.
//
// MINIMUM SIZE THRESHOLDS (bytes): files below this threshold in the SOURCE
// are considered git placeholders and must NEVER overwrite a larger destination
// file. The thresholds are set conservatively — real artwork is always larger.
const PLACEHOLDER_GUARD = {
  // leaderboard artwork: real HQ crests are >50 KB each
  'leaderboard/lion-crest-hq.webp':  50_000,
  'leaderboard/silver-crest.webp':   50_000,
  'leaderboard/bronze-crest.webp':   50_000,
  // top-level avatar images
  'sara-avatar.webp':                20_000,
  'support-avatar-v2.webp':          20_000,
};

// Directory-level placeholder guard (v6):
// Every file inside these subdirectories is treated as a placeholder when its
// source size is below the threshold. Real production avatars are stored in the
// canonical server directory (/var/www/static-assets) and are always >20 KB.
// The dist copy of these dirs is a LOCAL DEV fallback ONLY — production Express
// reads from STATIC_ASSETS_PATH env var, never from dist/public/static-assets.
const PLACEHOLDER_GUARD_DIRS = {
  'static-assets/avatars':     20_000,  // real avatars >20 KB; git has 4 KB stubs
  'static-assets/leaderboard': 50_000,  // real crests >50 KB; git has 4 KB stubs
};

/**
 * Recursively copy srcDir → destDir with two protection rules:
 *
 * 1. PLACEHOLDER GUARD: If a source file is listed in PLACEHOLDER_GUARD and is
 *    smaller than the threshold, never overwrite a destination file that is
 *    larger (the destination is the real production asset).
 *
 * 2. NO-CLOBBER FOR GUARDED DIRS: Tutorial cards and tribe images are never
 *    committed with their real content. Only copy them if the destination file
 *    does NOT already exist (no overwrite at all).
 */
async function safeCopyPublic() {
  const srcDir  = path.resolve(artifactDir, 'public');
  const destDir = path.resolve(artifactDir, 'dist', 'public');

  if (!existsSync(srcDir)) {
    console.log('  [asset-copy] public/ dir not found — skipping');
    return;
  }

  // Directories whose files are NEVER in git (user-uploaded). Only create
  // missing files; never touch existing ones.
  const NO_OVERWRITE_SUBDIRS = ['static-assets/tutorial-cards', 'static-assets/tribes', 'uploads'];

  async function copyDir(src, dest, relBase = '') {
    await mkdir(dest, { recursive: true });
    const entries = await readdir(src, { withFileTypes: true });
    for (const entry of entries) {
      const srcPath  = path.join(src,  entry.name);
      const destPath = path.join(dest, entry.name);
      const relPath  = relBase ? `${relBase}/${entry.name}` : entry.name;

      if (entry.isDirectory()) {
        await copyDir(srcPath, destPath, relPath);
      } else {
        // Check no-overwrite subdirs
        const isNoClobberDir = NO_OVERWRITE_SUBDIRS.some(d => relPath.startsWith(d));
        if (isNoClobberDir && existsSync(destPath)) {
          console.log(`  [asset-copy] SKIP (no-clobber dir, dest exists): ${relPath}`);
          continue;
        }

        // Check placeholder guard — file-level
        let guardThreshold = PLACEHOLDER_GUARD[relPath];

        // Check placeholder guard — directory-level (v6: covers entire avatar dir)
        if (guardThreshold === undefined) {
          for (const [dir, threshold] of Object.entries(PLACEHOLDER_GUARD_DIRS)) {
            if (relPath.startsWith(dir + '/')) {
              guardThreshold = threshold;
              break;
            }
          }
        }

        if (guardThreshold !== undefined) {
          const srcSize = statSync(srcPath).size;
          if (srcSize < guardThreshold) {
            if (existsSync(destPath)) {
              const destSize = statSync(destPath).size;
              if (destSize >= guardThreshold) {
                console.warn(
                  `  [asset-copy] BLOCKED placeholder overwrite: ${relPath}` +
                  ` (src=${srcSize}B < threshold=${guardThreshold}B, dest=${destSize}B — keeping real file)`
                );
                continue;
              }
            }
            console.warn(
              `  [asset-copy] PLACEHOLDER: ${relPath}` +
              ` (${srcSize}B < ${guardThreshold}B threshold) — dev stub only; real file lives in STATIC_ASSETS_PATH`
            );
          }
        }

        await cp(srcPath, destPath, { force: true });
        console.log(`  [asset-copy] copied: ${relPath}`);
      }
    }
  }

  console.log('  [asset-copy] Copying public/ → dist/public/ (with placeholder guard)...');
  await copyDir(srcDir, destDir);
  console.log('  [asset-copy] Done.');
}

// ── Post-build: validate single source of truth for static assets ────────────
//
// Architecture v6 (Avatar Fix):
//   git source   :  public/static-assets/       (placeholder stubs in git)
//   build output :  dist/public/static-assets/   (dev fallback — placeholder stubs)
//   PRODUCTION   :  STATIC_ASSETS_PATH=/var/www/static-assets  (real files, set in .env)
//   Express reads:  process.env.STATIC_ASSETS_PATH || __dirname/public/static-assets
//
// Rules checked:
//   1. dist/public/ MUST exist (build produced it)
//   2. Expected asset subdirectories are present
//   3. No rogue copies of static-assets outside canonical locations
//   4. Critical production files MUST exist (hard FAIL in production)
//   Note: avatar files in dist are PLACEHOLDER stubs — production uses STATIC_ASSETS_PATH
//
// If dist/public/ is missing → hard FAIL (build is broken).
// If expected subdirectories are missing → WARNING (may be empty on fresh clone).
// If rogue copies found outside canonical paths → hard FAIL.
// If critical files missing in production → hard FAIL.

// Critical files that MUST exist in the canonical asset directory before production deploy.
// Missing any of these causes a hard FAIL when NODE_ENV=production.
const CRITICAL_ASSET_FILES = [
  'support-avatar-v2.webp',
  'sara-avatar.webp',
  'channel-bg-v6.webp',
  'channel-bg-light-v2.webp',
  'icons/tool-sara.webp',
  'icons/tool-assistant.webp',
  'icons/tool-finance.webp',
];

async function validateBuild() {
  const srcPublic  = path.resolve(artifactDir, 'public');
  const distPublic = path.resolve(artifactDir, 'dist', 'public');
  const isProduction = process.env.NODE_ENV === 'production';

  console.log('');
  console.log('  [validate] ════════════════════════════════════════════════');
  console.log('  [validate]  Static Asset Single-Source-of-Truth Check');
  console.log('  [validate] ════════════════════════════════════════════════');

  // Rule 1: dist/public/ must exist
  if (!existsSync(distPublic)) {
    console.error('  [validate] ❌  FAIL: dist/public/ is missing after build!');
    console.error('  [validate]    safeCopyPublic() should have created it.');
    process.exit(1);
  }
  console.log(`  [validate] ✓  dist/public/ exists (Express runtime root)`);

  // Rule 2: expected asset subdirectories
  const EXPECTED_DIRS = [
    'static-assets/avatars',
    'static-assets/leaderboard',
    'static-assets/tribes',
    'static-assets/tutorial-cards',
    'static-assets/icons',
  ];
  let missingDirs = 0;
  for (const rel of EXPECTED_DIRS) {
    const full = path.join(distPublic, rel);
    if (existsSync(full)) {
      const count = (await readdir(full)).filter(f => !f.startsWith('.')).length;
      console.log(`  [validate] ✓  dist/public/${rel}  (${count} files)`);
    } else {
      console.warn(`  [validate] ⚠   dist/public/${rel}  — MISSING (placeholder clone?)`);
      missingDirs++;
    }
  }
  if (missingDirs > 0) {
    console.warn(`  [validate] ⚠   ${missingDirs} asset dir(s) empty — place real files before deploying.`);
  }

  // Rule 3: Check for rogue public/ copies outside the two canonical locations
  // Canonical: artifactDir/public and artifactDir/dist/public
  // Any `public` directory directly inside `dist/dist/` would indicate a
  // misconfigured double-build.
  const rogueLocations = [
    path.join(artifactDir, 'dist', 'dist', 'public'),  // dist/dist/public
    path.join(artifactDir, 'src', 'public'),            // src/public (should never exist)
  ];
  let rogueFound = false;
  for (const rogue of rogueLocations) {
    if (existsSync(rogue)) {
      console.error(`  [validate] ❌  ROGUE COPY: ${rogue}`);
      console.error(`  [validate]    This is a duplicate asset path. Delete it and re-examine build.mjs.`);
      rogueFound = true;
    }
  }
  if (rogueFound) process.exit(1);

  // Rule 4: Critical production files check
  //
  // Determine which directory to check:
  //   - In production: STATIC_ASSETS_PATH (canonical server dir, required)
  //   - In dev/CI:     dist/public/static-assets (local fallback, placeholders OK)
  //
  // In production, all CRITICAL_ASSET_FILES must exist → hard FAIL if any is missing.
  // In dev/CI, missing critical files only produce a WARNING (placeholders are acceptable).
  console.log('');
  console.log('  [validate] ─── Critical asset files check ───────────────────');

  const staticAssetsEnv = process.env.STATIC_ASSETS_PATH;
  const checkDir = (isProduction && staticAssetsEnv)
    ? staticAssetsEnv
    : path.join(distPublic, 'static-assets');

  const checkLabel = (isProduction && staticAssetsEnv)
    ? `STATIC_ASSETS_PATH (${staticAssetsEnv})`
    : 'dist/public/static-assets (dev fallback)';

  console.log(`  [validate]  Checking in: ${checkLabel}`);

  let criticalFail = false;
  for (const rel of CRITICAL_ASSET_FILES) {
    const full = path.join(checkDir, rel);
    if (existsSync(full) && statSync(full).isFile()) {
      const size = statSync(full).size;
      console.log(`  [validate] ✓  ${rel}  (${size} B)`);
    } else {
      if (isProduction) {
        console.error(`  [validate] ❌  MISSING critical asset: ${rel}`);
        console.error(`  [validate]    Expected at: ${full}`);
        criticalFail = true;
      } else {
        console.warn(`  [validate] ⚠   ${rel}  — NOT FOUND in dev fallback (place real file before deploying)`);
      }
    }
  }

  if (criticalFail) {
    console.error('');
    console.error('  [validate] ❌  FAIL: One or more critical static assets are missing in production.');
    console.error('  [validate]    Place the required files in STATIC_ASSETS_PATH before deploying.');
    process.exit(1);
  }

  // Summary
  console.log('');
  console.log('  [validate] ─────────────────────────────────────────────────');
  console.log('  [validate]  Architecture:');
  console.log(`  [validate]    git source    →  public/`);
  console.log(`  [validate]    after build   →  dist/public/             ← build output`);
  console.log(`  [validate]    Express reads →  STATIC_ASSETS_PATH || __dirname/public/static-assets`);
  console.log(`  [validate]    deploy copies →  dist/ (incl. dist/public/) → server`);
  console.log(`  [validate]    on server     →  /var/www/shivafer/api/dist/public/`);
  console.log('  [validate] ─────────────────────────────────────────────────');
  console.log('  [validate] ✅  Validation passed.');
  console.log('');
}

// ── Post-build: validate the executable bundle ─────────────────────────────
//
// The API is deployed as a self-contained ESM bundle. Keep this check close
// to the build so a generated Zod/API mismatch can never reach production.
async function validateRuntimeBundle() {
  const distDir = path.resolve(artifactDir, "dist");
  const bundlePath = path.resolve(artifactDir, "dist", "index.mjs");
  const { readFile } = await import("node:fs/promises");
  const bundle = await readFile(bundlePath, "utf8");

  const forbiddenPatterns = [
    {
      pattern: /\bzod\.int\s*\(/,
      message: "Zod 4 API zod.int() found; this project uses Zod 3.",
    },
    {
      pattern: /\(\s*void 0\s*\)\s*\(/,
      message: "Undefined generated validator call found.",
    },
    {
      pattern: /(?:from|import|require)\s*(?:\(\s*)?["']@workspace\//,
      message: "Workspace package import escaped the bundle.",
    },
    {
      pattern: /(?:from|import|require)\s*(?:\(\s*)?["'][^"']*(?:lib\/api-zod\/src|generated\/api\.ts|(?:^|\/)src\/)[^"']*["']/,
      message: "Source/workspace import escaped the bundle.",
    },
    {
      pattern: /(?:lib\/api-zod\/src|generated\/api\.ts)/,
      message: "Workspace source path escaped the standalone bundle.",
    },
  ];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(bundle)) {
      throw new Error(`[validate] ❌ ${message}`);
    }
  }

  if (bundle.includes(distDir)) {
    throw new Error(
      "[validate] ❌ Build-machine dist path escaped into the runtime bundle.",
    );
  }

  console.log("  [validate] ✅  Runtime bundle is self-contained and Zod 3-compatible.");
}

// A deployment must contain the executable bundle only. Keep this check in
// the build itself so a future change cannot silently reintroduce a linked
// sourcemap or another source-side runtime file.
async function validateStandaloneOutput() {
  const distDir = path.resolve(artifactDir, "dist");
  const entries = await readdir(distDir);
  const unexpectedMaps = entries.filter((entry) => entry.endsWith(".map"));
  if (unexpectedMaps.length > 0) {
    throw new Error(
      `[validate] ❌ Standalone output contains sourcemaps: ${unexpectedMaps.join(", ")}`,
    );
  }

  const bundlePath = path.join(distDir, "index.mjs");
  const bundle = await (await import("node:fs/promises")).readFile(bundlePath, "utf8");
  const forbiddenImport = /(?:from|import|require)\s*(?:\(\s*)?["'][^"']*(?:lib\/api-zod\/src|generated\/api\.ts|src\/)[^"']*["']/;
  if (forbiddenImport.test(bundle)) {
    throw new Error(
      "[validate] ❌ Standalone bundle contains an import/require of workspace source files.",
    );
  }
}

buildAll()
  .then(patchBuildMachinePaths)
  .then(safeCopyPublic)
  .then(validateRuntimeBundle)
  .then(validateStandaloneOutput)
  .then(validateBuild)
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
