import { createRequire } from "module";
const _require = createRequire(import.meta.url);
const _dns = _require("dns") as typeof import("dns");
const _https = _require("https") as typeof import("https");
const _http = _require("http") as typeof import("http");

_dns.setServers(["185.55.226.26", "185.55.225.25", "8.8.8.8"]);

const IPPANEL_IPS = ["185.143.232.201", "185.143.235.201"];

export interface SmsConfig {
  apiKey?: string | null;
  from?: string | null;
  patternCode?: string | null;
}

function makeRequest(
  ip: string,
  useHttps: boolean,
  path: string,
  headers: Record<string, string | number>,
  body: string
): Promise<{ status: number; body: string }> {
  return new Promise((res, reject) => {
    const mod = useHttps ? _https : _http;
    const port = useHttps ? 443 : 80;
    const options: import("https").RequestOptions = {
      hostname: ip,
      port,
      path,
      method: "POST",
      headers: {
        ...headers,
        Host: "api2.ippanel.com",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 8000,
    };
    if (useHttps) {
      (options as any).servername = "api2.ippanel.com";
      (options as any).rejectUnauthorized = true;
    }
    const req = mod.request(options, (response) => {
      let data = "";
      response.on("data", (chunk: Buffer) => { data += chunk; });
      response.on("end", () => {
        res({ status: response.statusCode || 0, body: data });
      });
    });
    req.on("error", reject);
    req.on("timeout", () => { req.destroy(); reject(new Error(`Timeout ${ip}:${port}`)); });
    req.write(body);
    req.end();
  });
}

async function ippanelPost(
  path: string,
  headers: Record<string, string>,
  body: string
): Promise<{ status: number; body: string }> {
  const attempts: Array<{ ip: string; useHttps: boolean }> = [
    ...IPPANEL_IPS.map(ip => ({ ip, useHttps: false })),
    ...IPPANEL_IPS.map(ip => ({ ip, useHttps: true })),
  ];
  for (const { ip, useHttps } of attempts) {
    try {
      const result = await makeRequest(ip, useHttps, path, headers, body);
      console.log(`[SMS] ${useHttps ? "https" : "http"}://${ip} -> ${result.status} ${result.body}`);
      return result;
    } catch (err: unknown) {
      console.log(`[SMS] ${ip} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  throw new Error("All IPPanel connection attempts failed");
}

// Env var fallbacks (used only if DB config not provided)
const ENV_API_KEY = process.env.IPPANEL_API_KEY || process.env.MODIRPAYAMAK_API_KEY || "";
const ENV_FROM = process.env.MDIR_PAYAMAK_FROM_NUMBER || process.env.MODIRPAYAMAK_FROM || "+983000505";
const ENV_PATTERN_CODE = process.env.MDIR_PAYAMAK_BODY_ID || process.env.MODIRPAYAMAK_PATTERN_CODE || "m5275bwbdsd66ha";

export async function sendOtpSms(phone: string, code: string, cfg?: SmsConfig): Promise<boolean> {
  const apiKey = cfg?.apiKey?.trim() || ENV_API_KEY;
  const from = cfg?.from?.trim() || ENV_FROM;
  const patternCode = cfg?.patternCode?.trim() || ENV_PATTERN_CODE;

  if (!apiKey) {
    console.log(`[SMS DEV] OTP for ${phone}: ${code}`);
    return true;
  }

  try {
    const requestBody = JSON.stringify({
      code: patternCode,
      sender: from,
      recipient: phone,
      variable: { code },
    });

    console.log(`[SMS] key_len=${apiKey.length} from=${from} pattern=${patternCode} to=${phone}`);

    const result = await ippanelPost(
      "/api/v1/sms/pattern/normal/send",
      {
        "Content-Type": "application/json",
        Accept: "application/json",
        apikey: apiKey,
      },
      requestBody
    );

    if (result.status >= 200 && result.status < 300) {
      return true;
    }
    console.error(`[SMS] Failed: ${result.status} ${result.body}`);
    return false;
  } catch (err: unknown) {
    console.error(`[SMS] Error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export function generateOtpCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function sendPatternSms(
  phone: string,
  patternCode: string,
  variables: Record<string, string>,
  cfg?: SmsConfig
): Promise<boolean> {
  const apiKey = cfg?.apiKey?.trim() || ENV_API_KEY;
  const from = cfg?.from?.trim() || ENV_FROM;

  if (!apiKey) {
    console.log(`[SMS DEV] Pattern ${patternCode} to ${phone}:`, variables);
    return true;
  }
  try {
    const requestBody = JSON.stringify({
      code: patternCode,
      sender: from,
      recipient: phone,
      variable: variables,
    });
    const result = await ippanelPost(
      "/api/v1/sms/pattern/normal/send",
      { "Content-Type": "application/json", Accept: "application/json", apikey: apiKey },
      requestBody
    );
    return result.status >= 200 && result.status < 300;
  } catch (err) {
    console.error(`[SMS] Pattern error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

export async function sendSimpleSms(phone: string, message: string, cfg?: SmsConfig): Promise<boolean> {
  const apiKey = cfg?.apiKey?.trim() || ENV_API_KEY;
  const from = cfg?.from?.trim() || ENV_FROM;

  if (!apiKey) {
    console.log(`[SMS DEV] Simple SMS to ${phone}: ${message}`);
    return true;
  }
  try {
    const requestBody = JSON.stringify({
      sender: from,
      recipient: [phone],
      message,
    });
    const result = await ippanelPost(
      "/api/v1/sms/send/webservice/single",
      { "Content-Type": "application/json", Accept: "application/json", apikey: apiKey },
      requestBody
    );
    return result.status >= 200 && result.status < 300;
  } catch (err) {
    console.error(`[SMS] Simple error: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
