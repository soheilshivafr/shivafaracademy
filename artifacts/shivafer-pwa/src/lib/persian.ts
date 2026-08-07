export function toPersianDigits(num: number | string): string {
  const farsiDigits = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹'];
  return num.toString().replace(/\d/g, (x) => farsiDigits[parseInt(x)]);
}

export function formatPrice(price: number): string {
  return price.toLocaleString("fa-IR") + ' تومان';
}

export function formatNumber(num: number): string {
  return num.toLocaleString("fa-IR");
}

export function normalizePhone(raw: string): string {
  return raw
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/\D/g, "");
}

export function isValidIranianPhone(phone: string): boolean {
  const normalized = normalizePhone(phone);
  return /^09[0-9]{9}$/.test(normalized);
}
