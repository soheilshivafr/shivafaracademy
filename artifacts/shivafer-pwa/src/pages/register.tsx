import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { RefreshCw, ChevronRight } from "lucide-react";
import { AcademyLogo } from "@/components/academy-logo";
import { motion } from "framer-motion";
import { toPersianDigits, normalizePhone, isValidIranianPhone } from "@/lib/persian";
import { getGuestId, clearGuestId } from "@/lib/guest-id";

const OTP_TIMEOUT = 120;

function getDeviceId(): string {
  const key = "shivafer_device_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id =
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
            const r = (Math.random() * 16) | 0;
            return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
          });
    localStorage.setItem(key, id);
  }
  return id;
}

async function apiPost<T>(path: string, body: object, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-device-id": getDeviceId(),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw { data };
  return data as T;
}

export default function Register() {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setLocation] = useLocation();
  const { setToken } = useAuth();

  const startCountdown = () => {
    setCountdown(OTP_TIMEOUT);
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) { clearInterval(timerRef.current!); timerRef.current = null; return 0; }
        return prev - 1;
      });
    }, 1000);
  };

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); }, []);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!name.trim() || name.trim().length < 2) { toast.error("نام و نام خانوادگی را وارد کنید"); return; }
    if (!isValidIranianPhone(normalized)) { toast.error("شماره موبایل معتبر نیست"); return; }
    setSending(true);
    try {
      const res = await apiPost<{ devCode?: string }>("/api/auth/register-send-otp", { phone: normalized, name: name.trim() });
      setStep(2);
      startCountdown();
      if (res.devCode) { setCode(res.devCode); toast.info(`کد توسعه: ${res.devCode}`, { duration: 30000 }); }
      else { toast.success("کد تایید ارسال شد"); }
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      toast.error(msg ?? "خطا در ارسال کد تایید");
    } finally {
      setSending(false);
    }
  };

  const handleResend = async () => {
    if (countdown > 0) return;
    setSending(true);
    try {
      const res = await apiPost<{ devCode?: string }>("/api/auth/register-send-otp", { phone: normalizePhone(phone), name: name.trim() });
      startCountdown();
      if (res.devCode) { setCode(res.devCode); toast.info(`کد توسعه: ${res.devCode}`, { duration: 30000 }); }
      else { setCode(""); toast.success("کد مجدداً ارسال شد"); }
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      toast.error(msg ?? "خطا در ارسال مجدد");
    } finally {
      setSending(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 4) { toast.error("کد تایید معتبر نیست"); return; }
    setVerifying(true);
    // Extract referral code from URL param or cookie
    const urlRef = new URLSearchParams(window.location.search).get("ref") ?? "";
    const cookieRef = document.cookie.split(";").map(c => c.trim()).find(c => c.startsWith("referral_code="))?.split("=")?.[1] ?? "";
    const referralCode = (urlRef || cookieRef).toUpperCase().trim() || undefined;
    // ارسال guestId برای انتقال تخفیف‌های مهمان به کاربر جدید
    const guestId = getGuestId();
    const extraHeaders: Record<string, string> = {};
    if (guestId) extraHeaders["x-guest-id"] = guestId;
    try {
      const res = await apiPost<{ token: string; isNewUser?: boolean }>("/api/auth/register-verify", {
        phone: normalizePhone(phone),
        code,
        name: name.trim(),
        ...(referralCode ? { referralCode } : {}),
      }, extraHeaders);
      setToken(res.token);
      clearGuestId(); // بعد از ثبت‌نام موفق، guestId پاک می‌شود
      if (res.isNewUser) {
        try { localStorage.setItem("firstAccountProactive", "1"); } catch { /* ignore */ }
      }
      toast.success("حساب شما با موفقیت ساخته شد");
      setLocation("/profile");
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      toast.error(msg ?? "کد تایید نامعتبر است");
    } finally {
      setVerifying(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${toPersianDigits(m)}:${toPersianDigits(s.toString().padStart(2, "0"))}`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[100dvh] flex items-center justify-center p-4 bg-background relative"
    >
      <button
        onClick={() => window.history.back()}
        className="absolute top-4 right-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        aria-label="بازگشت"
      >
        <ChevronRight className="w-5 h-5" />
        <span>بازگشت</span>
      </button>
      <div className="w-full max-w-sm mx-auto space-y-8">
        <div className="text-center space-y-2">
          <div className="flex justify-center mb-6">
            <AcademyLogo size={64} />
          </div>
          <h1 className="text-2xl font-black text-foreground">
            {step === 1 ? "ساخت حساب کاربری" : "تایید شماره موبایل"}
          </h1>
          <p className="text-muted-foreground text-sm">
            {step === 1
              ? "اطلاعات خود را وارد کنید"
              : `کد ارسال شده به ${toPersianDigits(phone)} را وارد کنید`}
          </p>
        </div>

        {step === 1 ? (
          <form onSubmit={handleSendOtp} className="space-y-4">
            <Input
              type="text"
              placeholder="نام و نام خانوادگی"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-12 text-right text-base bg-secondary/50 border-secondary-border focus-visible:ring-primary"
            />
            <Input
              type="tel"
              dir="ltr"
              placeholder="09123456789"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="h-12 text-center text-lg tracking-widest bg-secondary/50 border-secondary-border focus-visible:ring-primary"
            />
            <Button type="submit" className="w-full h-12 text-lg font-bold rounded-xl" disabled={sending || !name || !phone}>
              {sending ? "در حال ارسال..." : "دریافت کد تایید"}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              قبلاً ثبت‌نام کردی؟{" "}
              <Link href="/login" className="text-primary font-bold hover:underline">ورود</Link>
            </p>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <Input
              type="text"
              dir="ltr"
              placeholder="- - - - - -"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              maxLength={6}
              inputMode="numeric"
              className="h-12 text-center text-2xl tracking-[0.5em] bg-secondary/50 border-secondary-border focus-visible:ring-primary font-mono"
            />
            <Button type="submit" className="w-full h-12 text-lg font-bold rounded-xl" disabled={verifying || !code}>
              {verifying ? "در حال بررسی..." : "تایید و ساخت حساب"}
            </Button>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" className="flex-1 text-sm" onClick={() => { setStep(1); setCode(""); }} disabled={verifying}>
                ویرایش اطلاعات
              </Button>
              <Button type="button" variant="ghost" className="flex-1 text-sm gap-1.5" onClick={handleResend} disabled={countdown > 0 || sending}>
                {countdown > 0 ? (
                  <span className="text-muted-foreground font-mono">{formatCountdown(countdown)}</span>
                ) : (
                  <><RefreshCw className="w-3.5 h-3.5" />ارسال مجدد</>
                )}
              </Button>
            </div>
          </form>
        )}
      </div>
    </motion.div>
  );
}
