const REQUIRED_ASSETS = [
  "/static-assets/channel-bg-v6.webp",
  "/static-assets/channel-bg-light-v2.webp",
  "/static-assets/support-avatar-v2.webp",
  "/static-assets/sara-avatar.webp",
  "/static-assets/icons/tool-sara.webp",
  "/static-assets/icons/tool-assistant.webp",
  "/static-assets/icons/tool-finance.webp",
] as const;

const DEPLOYMENT_URL_ENV_NAMES = [
  "DEPLOY_URL",
  "SMOKE_TEST_BASE_URL",
  "REPLIT_DEPLOYMENT_URL",
] as const;

type AssetResult = {
  path: string;
  url: string;
  status: number | "request-error";
  contentType: string;
  isHtml: boolean;
  error?: string;
};

function getDeploymentUrl(): URL {
  const suppliedUrl =
    process.argv.slice(2).find((argument) => argument !== "--") ??
    DEPLOYMENT_URL_ENV_NAMES.map((name) => process.env[name]).find(Boolean);

  if (!suppliedUrl) {
    throw new Error(
      "Missing deployment URL. Pass it as the first argument or set DEPLOY_URL.",
    );
  }

  try {
    return new URL(suppliedUrl.endsWith("/") ? suppliedUrl : `${suppliedUrl}/`);
  } catch {
    throw new Error(`Invalid deployment URL: ${suppliedUrl}`);
  }
}

async function readResponseSample(response: Response): Promise<string> {
  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  try {
    const { value } = await reader.read();
    return new TextDecoder().decode(value?.subarray(0, 2048)).trimStart();
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function isHtmlResponse(contentType: string, sample: string): boolean {
  if (contentType === "text/html" || contentType.endsWith("+html")) {
    return true;
  }

  return /^\s*(?:<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>])/i.test(
    sample,
  );
}

async function checkAsset(baseUrl: URL, path: string): Promise<AssetResult> {
  const url = new URL(path.slice(1), baseUrl).toString();

  try {
    const response = await fetch(url, {
      headers: { Accept: "image/webp" },
      redirect: "follow",
    });
    const contentType =
      response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ??
      "";
    const sample = await readResponseSample(response);

    return {
      path,
      url,
      status: response.status,
      contentType,
      isHtml: isHtmlResponse(contentType, sample),
    };
  } catch (error) {
    return {
      path,
      url,
      status: "request-error",
      contentType: "",
      isHtml: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function hasPassed(result: AssetResult): boolean {
  return (
    result.status === 200 &&
    result.contentType === "image/webp" &&
    !result.isHtml
  );
}

async function main(): Promise<void> {
  let baseUrl: URL;
  try {
    baseUrl = getDeploymentUrl();
  } catch (error) {
    console.error(
      `Post-deploy Smoke Test FAILED: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(`Post-deploy Smoke Test: ${baseUrl.origin}`);

  const results = await Promise.all(
    REQUIRED_ASSETS.map((path) => checkAsset(baseUrl, path)),
  );
  const failures = results.filter((result) => !hasPassed(result));

  for (const result of results) {
    const status =
      result.status === "request-error"
        ? `request error: ${result.error}`
        : `HTTP ${result.status}`;
    const contentType = result.contentType || "(missing)";
    const htmlCheck = result.isHtml ? "HTML detected" : "not HTML";
    const marker = hasPassed(result) ? "PASS" : "FAIL";

    console.log(
      `[${marker}] ${result.path} — ${status}; Content-Type: ${contentType}; ${htmlCheck}`,
    );
  }

  if (failures.length > 0) {
    console.error(
      `Post-deploy Smoke Test FAILED: ${failures.length} of ${results.length} required asset(s) failed. ` +
        "Deploy must be considered failed.",
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `Post-deploy Smoke Test PASSED: all ${results.length} required assets returned HTTP 200, image/webp, and non-HTML responses.`,
  );
}

void main().catch((error: unknown) => {
  console.error(
    `Post-deploy Smoke Test FAILED unexpectedly: ${
      error instanceof Error ? error.stack ?? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});