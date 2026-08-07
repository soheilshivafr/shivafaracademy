/**
 * analytics.ts — ثبت رویدادهای کاربر برای داشبورد ادمین
 *
 * - trackPageview: هر بار که کاربر صفحه‌ای را باز می‌کند فراخوانی می‌شود
 * - trackPing: هر ۶۰ ثانیه برای نشان دادن حضور آنلاین کاربر
 */

const SESSION_KEY = "shivafer_analytics_session";

function getOrCreateSessionId(): string {
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id =
        typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
          ? crypto.randomUUID()
          : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return `tmp-${Date.now().toString(36)}`;
  }
}

async function sendEvent(url: string, body: Record<string, unknown>): Promise<void> {
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    });
  } catch {
    // خطای شبکه رو نادیده می‌گیریم تا UX تحت تأثیر قرار نگیره
  }
}

/** ارسال رویداد بازدید صفحه */
export function trackPageview(page: string, userId?: number | null): void {
  const sessionId = getOrCreateSessionId();
  // برای صفحات جزئیات محصول و دوره، ID رو هم در slug نگه می‌داریم
  // مثال: /product/123 → "product/123"  |  /courses/456 → "courses/456"
  const parts = page.replace(/^\//, "").split("/");
  const slug =
    parts.length >= 2 && ["product", "courses"].includes(parts[0])
      ? `${parts[0]}/${parts[1]}`
      : parts[0] || "home";
  sendEvent("/api/analytics/event", {
    eventType: "pageview",
    page: slug,
    sessionId,
    ...(userId != null ? { userId } : {}),
  });
}

/** ارسال heartbeat برای نشان دادن حضور آنلاین */
export function trackPing(userId?: number | null): void {
  const sessionId = getOrCreateSessionId();
  sendEvent("/api/analytics/ping", {
    sessionId,
    ...(userId != null ? { userId } : {}),
  });
}
