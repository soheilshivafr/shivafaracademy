import { mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceDir = path.resolve(
  workspaceRoot,
  "artifacts/api-server/dist/public/static-assets",
);
const targetDir = "/var/www/static-assets";

const requiredAssets = [
  "channel-bg-v6.webp",
  "channel-bg-light-v2.webp",
  "support-avatar-v2.webp",
  "sara-avatar.webp",
  "icons/tool-sara.webp",
  "icons/tool-assistant.webp",
  "icons/tool-finance.webp",
];

const deploymentUrlEnvNames = [
  "DEPLOY_URL",
  "SMOKE_TEST_BASE_URL",
  "REPLIT_DEPLOYMENT_URL",
  "REPLIT_DOMAINS",
];

async function isRegularFile(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

function getDeploymentUrl() {
  const suppliedUrl =
    process.argv.slice(2).find((argument) => argument !== "--") ??
    deploymentUrlEnvNames.map((name) => process.env[name]).find(Boolean);

  if (!suppliedUrl) {
    throw new Error("missing deployment URL");
  }

  const domain = suppliedUrl.split(",")[0].trim();
  const urlWithScheme = /^[a-z][a-z\d+.-]*:\/\//i.test(domain)
    ? domain
    : `https://${domain}`;
  const normalizedUrl = urlWithScheme.endsWith("/")
    ? urlWithScheme
    : `${urlWithScheme}/`;
  return new URL(normalizedUrl);
}

function runRsync() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "rsync",
      [
        "--archive",
        "--no-owner",
        "--no-group",
        "--out-format=%n",
        `${sourceDir}${path.sep}`,
        `${targetDir}${path.sep}`,
      ],
      { stdio: ["ignore", "pipe", "ignore"] },
    );
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });

    child.once("error", (error) => {
      reject(
        new Error(
          `Static asset synchronization could not start: ${error.message}`,
        ),
      );
    });
    child.once("exit", (code, signal) => {
      if (code === 0) {
        resolve(
          output
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean).length,
        );
        return;
      }

      reject(
        new Error(
          `Static asset synchronization failed (exit=${code ?? "null"}, signal=${signal ?? "none"}).`,
        ),
      );
    });
  });
}

function isHtmlResponse(contentType, sample) {
  if (contentType === "text/html" || contentType.endsWith("+html")) {
    return true;
  }

  return /^\s*(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(
    sample,
  );
}

async function readResponseSample(response) {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalLength = 0;

  try {
    while (totalLength < 2048) {
      const { done, value } = await reader.read();
      if (done || !value) {
        break;
      }

      const remaining = 2048 - totalLength;
      const chunk = value.subarray(0, remaining);
      chunks.push(chunk);
      totalLength += chunk.length;

      if (chunk.length < value.length) {
        break;
      }
    }
  } finally {
    await reader.cancel().catch(() => undefined);
  }

  const sampleBytes = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    sampleBytes.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(sampleBytes);
}

async function checkAssetResponse(baseUrl, relativePath) {
  const url = new URL(`/static-assets/${relativePath}`, baseUrl);
  const response = await fetch(url, {
    headers: { Accept: "image/webp" },
    redirect: "follow",
  });
  const contentType =
    response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ??
    "";
  const sample = await readResponseSample(response);

  return {
    passed:
      response.status === 200 &&
      contentType === "image/webp" &&
      !isHtmlResponse(contentType, sample),
  };
}

async function runSmokeTest() {
  const baseUrl = getDeploymentUrl();
  const results = await Promise.all(
    requiredAssets.map(async (relativePath) => {
      try {
        return await checkAssetResponse(baseUrl, relativePath);
      } catch {
        return { passed: false };
      }
    }),
  );
  return results.every((result) => result.passed);
}

async function validateBuildOutput() {
  if (!(await isRegularFile(path.join(sourceDir, requiredAssets[0])))) {
    try {
      await stat(sourceDir);
    } catch {
      throw new Error(`Build output is missing: ${sourceDir}`);
    }
  }

  const missingAssets = [];
  for (const relativePath of requiredAssets) {
    if (!(await isRegularFile(path.join(sourceDir, relativePath)))) {
      missingAssets.push(relativePath);
    }
  }

  if (missingAssets.length > 0) {
    throw new Error(`missing build assets: ${missingAssets.join(", ")}`);
  }
}

async function main() {
  let synchronizedFiles = "failed";
  let validationResult = "failed";
  let smokeTestResult = "not run";
  let deploymentStatus = "failed";

  try {
    await validateBuildOutput();
    validationResult = "passed";
    await mkdir(targetDir, { recursive: true });
    synchronizedFiles = String(await runRsync());

    const missingAfterSync = [];
    for (const relativePath of requiredAssets) {
      if (!(await isRegularFile(path.join(targetDir, relativePath)))) {
        missingAfterSync.push(relativePath);
      }
    }

    if (missingAfterSync.length > 0) {
      throw new Error(
        `missing synchronized assets: ${missingAfterSync.join(", ")}`,
      );
    }

    smokeTestResult = (await runSmokeTest()) ? "passed" : "failed";
    if (smokeTestResult !== "passed") {
      throw new Error("smoke test failed");
    }
    deploymentStatus = "passed";
  } catch {
    if (validationResult === "passed" && smokeTestResult === "not run") {
      smokeTestResult = "failed";
    }
  } finally {
    console.log(`synchronized files: ${synchronizedFiles}`);
    console.log(`validation result: ${validationResult}`);
    console.log(`smoke test result: ${smokeTestResult}`);
    console.log(`deployment status: ${deploymentStatus}`);
  }

  if (deploymentStatus !== "passed") {
    process.exitCode = 1;
  }
}

void main();