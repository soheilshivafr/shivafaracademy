/**
 * guestId — شناسه یکتا برای کاربر مهمان
 * یک UUID در localStorage ذخیره می‌شود و تا زمان ثبت‌نام باقی می‌ماند.
 * بعد از ثبت‌نام، به سرور ارسال می‌شود تا تخفیف‌ها منتقل شوند.
 */

const STORAGE_KEY = "shivafer_guest_id";

function generateUUID(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // fallback برای محیط‌های قدیمی
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function getOrCreateGuestId(): string {
  try {
    const existing = localStorage.getItem(STORAGE_KEY);
    if (existing) return existing;
    const id = generateUUID();
    localStorage.setItem(STORAGE_KEY, id);
    return id;
  } catch {
    // در صورت خطا (private browsing)، یک ID موقت برمی‌گردانیم
    return generateUUID();
  }
}

export function clearGuestId(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function getGuestId(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}
