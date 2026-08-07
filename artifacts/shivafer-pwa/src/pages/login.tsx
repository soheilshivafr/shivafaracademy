import { useState, useEffect, useRef } from "react";
import { useSendOtp, useVerifyOtp } from "@workspace/api-client-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocation, Link } from "wouter";
import { toast } from "sonner";
import { RefreshCw, Lock, MessageSquare, Eye, EyeOff, ChevronRight } from "lucide-react";
import { motion } from "framer-motion";
import { toPersianDigits, normalizePhone, isValidIranianPhone } from "@/lib/persian";
import { AcademyLogo } from "@/components/academy-logo";
import { getGuestId, clearGuestId } from "@/lib/guest-id";

const OTP_TIMEOUT = 120;

// ─── Mode Switcher ────────────────────────────────────────────────────────────
// Simple segmented control: two tabs, glass pill slides between them.
// Pill renders at the correct position from the very first frame (no wrong-start animation).

function ModeSwitcher({
  mode,
  onSwitch,
  gold,
}: {
  mode: "otp" | "password";
  onSwitch: (m: "otp" | "password") => void;
  gold: string;
}) {
  const isPassword = mode === "password";

  const tabStyle = (active: boolean): React.CSSProperties => ({
    position: "relative",
    zIndex: 1,
    minWidth: 130,
    height: 40,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: 20,
    border: "none",
    background: "transparent",
    cursor: "pointer",
    color: active ? gold : "var(--nav-icon-inactive)",
    fontWeight: active ? 700 : 500,
    fontSize: 13,
    transition: "color 0.22s",
    fontFamily: "inherit",
    paddingInline: 16,
    whiteSpace: "nowrap",
    direction: "rtl",
    // Ensure the full button area is tappable on mobile
    WebkitTapHighlightColor: "transparent",
    touchAction: "manipulation",
    userSelect: "none",
  });

  return (
    <div style={{ display: "flex", justifyContent: "center" }}>
      {/*
        Wrapper: inline-flex track.
        Pill is a position:absolute child rendered FIRST (behind buttons in paint order).
        No backdrop-filter on pill — iOS Safari intercepts touches even with pointer-events:none.
        Glass effect comes purely from border + box-shadow + gradient background.
      */}
      <div
        style={{
          position: "relative",
          display: "inline-flex",
          direction: "ltr",   /* force LTR so first child = left, second = right */
          borderRadius: 24,
          padding: 3,
          background: "var(--glass-toggle-bg)",
          border: "1px solid var(--glass-toggle-border)",
        }}
      >
        {/* Glass pill — CSS transition only. No backdrop-filter (iOS touch bug). */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            top: 3,
            bottom: 3,
            left: 3,
            width: "calc(50% - 3px)",
            borderRadius: 20,
            pointerEvents: "none",
            /* LTR order: [OTP=left][Password=right]
               pill at translateX(0%)  → left  → OTP
               pill at translateX(100%) → right → Password          */
            transform: isPassword ? "translateX(100%)" : "translateX(0%)",
            transition: "transform 0.28s cubic-bezier(0.34,1.40,0.64,1)",
            // No backdrop-filter — avoids iOS touch interception bug
            background: "linear-gradient(165deg, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.04) 50%, rgba(0,0,0,0.06) 100%)",
            border: "1px solid rgba(255,255,255,0.35)",
            boxShadow: [
              "inset 0 1.5px 0 rgba(255,255,255,0.60)",
              "inset 0 -1px 0 rgba(0,0,0,0.12)",
              "0 0 0 0.5px rgba(240,192,64,0.25)",
              "0 3px 14px rgba(240,192,64,0.18)",
              "0 1px 4px rgba(0,0,0,0.28)",
            ].join(", "),
            overflow: "hidden",
          }}
        >
          {/* Top specular arc — simulates glass lens highlight */}
          <span style={{
            position: "absolute", top: 2, left: "12%", right: "12%",
            height: "38%", borderRadius: "50%",
            background: "linear-gradient(180deg, rgba(255,255,255,0.45) 0%, transparent 100%)",
            display: "block",
          }} />
        </span>

        {/* Tab: کد پیامکی — renders first in DOM (left in LTR, right in RTL) */}
        <button type="button" onClick={() => onSwitch("otp")} style={tabStyle(!isPassword)}>
          <MessageSquare style={{ width: 14, height: 14, flexShrink: 0 }} />
          کد پیامکی
        </button>

        {/* Tab: رمز عبور — renders second (right in LTR, left in RTL) */}
        <button type="button" onClick={() => onSwitch("password")} style={tabStyle(isPassword)}>
          <Lock style={{ width: 14, height: 14, flexShrink: 0 }} />
          رمز عبور
        </button>
      </div>
    </div>
  );
}

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

async function loginWithPassword(phone: string, password: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-device-id": getDeviceId(),
  };
  const guestId = getGuestId();
  if (guestId) headers["x-guest-id"] = guestId;

  const res = await fetch("/api/auth/login-password", {
    method: "POST",
    headers,
    body: JSON.stringify({ phone, password }),
  });
  const data = await res.json();
  if (!res.ok) throw { data };
  return data as { token: string; isNewUser?: boolean; user: { id: number; phone: string; name?: string | null } };
}

export default function Login({ inline = false }: { inline?: boolean }) {
  const [mode, setMode] = useState<"otp" | "password">("password");
  const [step, setStep] = useState<1 | 2>(1);
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [, setLocation] = useLocation();

  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();
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

  const handleSendOtp = (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!isValidIranianPhone(normalized)) { toast.error("شماره موبایل معتبر نیست"); return; }
    sendOtp.mutate(
      { data: { phone: normalized } },
      {
        onSuccess: (res) => {
          setStep(2);
          startCountdown();
          const devCode = (res as unknown as { devCode?: string }).devCode;
          if (devCode) { setCode(devCode); toast.info(`کد توسعه: ${devCode}`, { duration: 30000 }); }
          else { toast.success("کد تایید ارسال شد"); }
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error;
          toast.error(msg ?? "خطا در ارسال کد تایید");
        },
      }
    );
  };

  const handleResendOtp = () => {
    if (countdown > 0) return;
    sendOtp.mutate(
      { data: { phone: normalizePhone(phone) } },
      {
        onSuccess: (res) => {
          startCountdown();
          const devCode = (res as unknown as { devCode?: string }).devCode;
          if (devCode) { setCode(devCode); toast.info(`کد توسعه: ${devCode}`, { duration: 30000 }); }
          else { setCode(""); toast.success("کد مجدداً ارسال شد"); }
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error;
          toast.error(msg ?? "خطا در ارسال مجدد کد");
        },
      }
    );
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || code.length < 4) { toast.error("کد تایید معتبر نیست"); return; }
    // برای انتقال تخفیف مهمان، از fetch مستقیم استفاده می‌کنیم تا بتوانیم header اضافه کنیم
    const guestId = getGuestId();
    if (guestId) {
      // از fetch مستقیم با header استفاده کن
      try {
        const res = await fetch("/api/auth/verify-otp", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-device-id": getDeviceId(),
            "x-guest-id": guestId,
          },
          body: JSON.stringify({ phone: normalizePhone(phone), code }),
        });
        const data = await res.json();
        if (!res.ok) { toast.error(data.error ?? "کد تایید نامعتبر است"); return; }
        setToken(data.token);
        clearGuestId(); // بعد از لاگین گuestId پاک می‌شه
        if (data.isNewUser) { try { localStorage.setItem("firstAccountProactive", "1"); } catch { /* ignore */ } }
        toast.success("ورود موفقیت‌آمیز بود");
        if (!inline) setLocation("/");
      } catch { toast.error("خطا در ارتباط با سرور"); }
      return;
    }
    verifyOtp.mutate(
      { data: { phone: normalizePhone(phone), code } },
      {
        onSuccess: (res) => {
          setToken(res.token);
          if ((res as { isNewUser?: boolean }).isNewUser) {
            try { localStorage.setItem("firstAccountProactive", "1"); } catch { /* ignore */ }
          }
          toast.success("ورود موفقیت‌آمیز بود");
          if (!inline) setLocation("/");
        },
        onError: (err: unknown) => {
          const msg = (err as { data?: { error?: string } })?.data?.error;
          toast.error(msg ?? "کد تایید نامعتبر است");
        },
      }
    );
  };

  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePhone(phone);
    if (!isValidIranianPhone(normalized)) { toast.error("شماره موبایل معتبر نیست"); return; }
    if (!password) { toast.error("رمز عبور را وارد کنید"); return; }
    setPasswordLoading(true);
    try {
      const res = await loginWithPassword(normalized, password);
      setToken(res.token);
      clearGuestId(); // بعد از لاگین موفق، guestId پاک می‌شود
      if (res.isNewUser) {
        try { localStorage.setItem("firstAccountProactive", "1"); } catch { /* ignore */ }
      }
      toast.success("ورود موفقیت‌آمیز بود");
      if (!inline) setLocation("/");
    } catch (err: unknown) {
      const msg = (err as { data?: { error?: string } })?.data?.error;
      toast.error(msg ?? "شماره موبایل یا رمز عبور اشتباه است");
    } finally {
      setPasswordLoading(false);
    }
  };

  const formatCountdown = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${toPersianDigits(m)}:${toPersianDigits(s.toString().padStart(2, "0"))}`;
  };

  const switchMode = (newMode: "otp" | "password") => {
    setMode(newMode);
    setStep(1);
    setCode("");
    setPassword("");
  };

  const GOLD = "var(--color-gold)";

  const content = (
    <div className="w-full max-w-sm mx-auto space-y-6">
      {/* Logo + title */}
      <div className="text-center space-y-3">
        {!inline && (
          <div className="flex justify-center mb-4">
            <AcademyLogo size={64} />
          </div>
        )}
        <h1 className="text-2xl font-black text-foreground">
          {mode === "otp"
            ? (step === 1 ? "ورود به حساب کاربری" : "تایید شماره موبایل")
            : "ورود به حساب کاربری"}
        </h1>
        <p className="text-muted-foreground text-sm">
          {mode === "otp"
            ? (step === 1 ? "برای استفاده از امکانات آکادمی وارد شوید" : `کد ارسال شده به ${phone} را وارد کنید`)
            : "برای استفاده از امکانات آکادمی وارد شوید"}
        </p>
      </div>

      {/* Mode switcher — segmented control, centered */}
      <ModeSwitcher mode={mode} onSwitch={switchMode} gold={GOLD} />

      {/* OTP mode */}
      {mode === "otp" && (
        <>
          {step === 1 ? (
            <form onSubmit={handleSendOtp} className="space-y-4">
              <Input
                type="tel"
                dir="ltr"
                placeholder="09123456789"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="h-12 text-center text-lg tracking-widest"
              />
              <Button type="submit" className="w-full h-12 text-base font-bold" size="lg" disabled={sendOtp.isPending || !phone}>
                {sendOtp.isPending ? "در حال ارسال..." : "دریافت کد تایید"}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <Input
                type="text"
                dir="ltr"
                placeholder="- - - -"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                maxLength={6}
                inputMode="numeric"
                autoComplete="one-time-code"
                className="h-12 text-center text-2xl tracking-[0.5em] font-mono"
              />
              <Button type="submit" className="w-full h-12 text-base font-bold" size="lg" disabled={verifyOtp.isPending || !code}>
                {verifyOtp.isPending ? "در حال بررسی..." : "تایید و ورود"}
              </Button>
              <div className="flex items-center justify-between gap-2">
                <Button type="button" variant="ghost" className="flex-1 text-sm" onClick={() => { setStep(1); setCode(""); }} disabled={verifyOtp.isPending}>
                  ویرایش شماره
                </Button>
                <Button type="button" variant="ghost" className="flex-1 text-sm gap-1.5" onClick={handleResendOtp} disabled={countdown > 0 || sendOtp.isPending}>
                  {countdown > 0 ? (
                    <span className="font-mono" style={{ color: GOLD }}>{formatCountdown(countdown)}</span>
                  ) : (
                    <><RefreshCw className="w-3.5 h-3.5" />ارسال مجدد</>
                  )}
                </Button>
              </div>
            </form>
          )}
        </>
      )}

      {/* Password mode */}
      {mode === "password" && (
        <form onSubmit={handlePasswordLogin} className="space-y-4">
          <Input
            type="tel"
            dir="ltr"
            placeholder="09123456789"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="h-12 text-center text-lg tracking-widest"
          />
          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              dir="ltr"
              placeholder="رمز عبور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="h-12 text-center text-lg pr-12"
            />
            <button
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          </div>
          <Button
            type="submit"
            className="w-full h-12 text-base font-bold"
            size="lg"
            disabled={passwordLoading || !phone || !password}
          >
            {passwordLoading ? "در حال ورود..." : "ورود"}
          </Button>
        </form>
      )}

      {/* Register link */}
      <p className="text-center text-sm text-muted-foreground">
        حساب نداری؟{" "}
        <Link href="/register" className="font-bold hover:underline" style={{ color: GOLD }}>ثبت‌نام</Link>
      </p>
    </div>
  );

  if (inline) return (
    <div className="h-full flex items-center justify-center p-6">
      {content}
    </div>
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="min-h-[100dvh] flex items-center justify-center p-4 relative"
      style={{ background: "var(--app-body-bg)" }}
    >
      <button
        onClick={() => window.history.back()}
        className="absolute top-4 right-4 flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors active:scale-95"
        aria-label="بازگشت"
      >
        <ChevronRight className="w-5 h-5" />
        <span>بازگشت</span>
      </button>
      {content}
    </motion.div>
  );
}
