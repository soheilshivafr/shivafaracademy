const BASE = "/api";

function getToken(): string {
  return localStorage.getItem("shivafer_admin_token") ?? "";
}

function authHeaders(): Record<string, string> {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${getToken()}`,
  };
}

async function req<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: authHeaders(),
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      window.dispatchEvent(new CustomEvent("admin-unauthorized"));
    }
    throw new Error((data as any)?.error ?? `خطا: ${res.status}`);
  }
  return data as T;
}

export function get<T>(path: string) { return req<T>("GET", path); }
export function post<T>(path: string, body?: unknown) { return req<T>("POST", path, body); }
export function put<T>(path: string, body?: unknown) { return req<T>("PUT", path, body); }
export function patch<T>(path: string, body?: unknown) { return req<T>("PATCH", path, body); }
export function del<T>(path: string) { return req<T>("DELETE", path); }

export async function uploadFile(path: string, file: File): Promise<{ url: string }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? "خطای آپلود");
  return data as { url: string };
}

export function uploadFileWithProgress(
  path: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<{ url: string }> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append("file", file);

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${BASE}${path}`, true);
    xhr.setRequestHeader("Authorization", `Bearer ${getToken()}`);

    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) {
        onProgress(Math.round((e.loaded / e.total) * 100));
      }
    });

    xhr.addEventListener("load", () => {
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress(100);
          resolve(data as { url: string });
        } else {
          reject(new Error(data?.error ?? "خطای آپلود"));
        }
      } catch {
        reject(new Error("خطای آپلود"));
      }
    });

    xhr.addEventListener("error", () => reject(new Error("خطای شبکه")));
    xhr.addEventListener("abort", () => reject(new Error("آپلود لغو شد")));

    xhr.send(form);
  });
}

export async function adminLogin(username: string, password: string) {
  const res = await fetch(`${BASE}/admin/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error ?? "خطای ورود");
  return data as { token: string; admin: { id: number; username: string; isSuperAdmin?: boolean; permissions?: string[] } };
}

/** Normalize an image URL to use a relative path.
 *  When migrating to a new server, stored absolute URLs (e.g. https://old-host.com/api/uploads/...)
 *  would break. This strips the origin so the browser always fetches from the current host.
 */
export function normalizeImageUrl(url: string | null | undefined): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    // If path contains /api/uploads/ or /uploads/, use just the path
    if (u.pathname.includes("/uploads/") || u.pathname.includes("/api/uploads/")) {
      return u.pathname;
    }
  } catch {
    // Not a full URL (already relative) — use as-is
  }
  return url;
}
