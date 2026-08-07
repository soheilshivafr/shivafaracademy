import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  CheckCircle2,
  XCircle,
  ArrowRight,
  BookOpen,
  Brain,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";

interface AiReportPending {
  slug: string;
  sessionId: number;
}

function readAiReportPending(): AiReportPending | null {
  try {
    const raw = sessionStorage.getItem("ai_report_pending");
    if (!raw) return null;
    return JSON.parse(raw) as AiReportPending;
  } catch {
    return null;
  }
}

function clearAiReportPending() {
  try {
    sessionStorage.removeItem("ai_report_pending");
  } catch {}
}

export default function PaymentResult() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const status = params.get("status");
  const refId = params.get("refId");
  const message = params.get("message");
  const orderId = params.get("orderId");
  const itemType = params.get("itemType"); // "ai_report" when set by verify route
  const sessionIdParam = params.get("sessionId"); // sessionId for ai_report

  const isSuccess = status === "success";
  const isAiReport =
    itemType === "ai_report" ||
    (isSuccess && !!readAiReportPending());

  // Read & clear sessionStorage on mount
  const [aiPending] = useState<AiReportPending | null>(() => {
    if (!isSuccess) return null;
    const p = readAiReportPending();
    if (p) clearAiReportPending();
    return p;
  });

  const resolvedSessionId =
    sessionIdParam ? parseInt(sessionIdParam) : aiPending?.sessionId ?? null;
  const resolvedSlug = aiPending?.slug ?? null;

  // Auto-redirect to assessment result after a short delay if we have the slug
  const [countdown, setCountdown] = useState(isSuccess && isAiReport && resolvedSlug ? 5 : 0);

  useEffect(() => {
    if (!isSuccess || !isAiReport || !resolvedSlug || countdown <= 0) return;
    const t = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(t);
          navigate(`/assessment/${resolvedSlug}/result/${resolvedSessionId}`);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [isSuccess, isAiReport, resolvedSlug, resolvedSessionId, navigate]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center min-h-screen px-6 pb-24 text-center bg-background"
      dir="rtl"
    >
      {/* Icon */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ type: "spring", delay: 0.1 }}
        className={`w-24 h-24 rounded-full flex items-center justify-center mb-6 ${
          isSuccess ? "bg-green-500/10" : "bg-destructive/10"
        }`}
      >
        {isSuccess ? (
          isAiReport ? (
            <Sparkles className="w-12 h-12 text-green-500" />
          ) : (
            <CheckCircle2 className="w-12 h-12 text-green-500" />
          )
        ) : (
          <XCircle className="w-12 h-12 text-destructive" />
        )}
      </motion.div>

      {/* Title */}
      <h1
        className={`text-2xl font-black mb-3 ${
          isSuccess ? "text-green-500" : "text-destructive"
        }`}
      >
        {isSuccess
          ? isAiReport
            ? "گزارش AI آماده است! 🎉"
            : "پرداخت موفق"
          : "پرداخت ناموفق"}
      </h1>

      {/* Description */}
      {isSuccess && isAiReport ? (
        <p className="text-muted-foreground text-sm mb-5 max-w-xs leading-relaxed">
          پرداخت شما تأیید شد و گزارش هوش مصنوعی در حال آماده‌سازی است.
          {resolvedSlug && (
            <> در {countdown} ثانیه به صفحه نتیجه منتقل می‌شوید.</>
          )}
        </p>
      ) : isSuccess ? (
        <p className="text-muted-foreground text-sm mb-5 max-w-xs leading-relaxed">
          پرداخت شما با موفقیت انجام شد. دوره/محصول در پروفایل شما فعال گردید.
        </p>
      ) : (
        !isAiReport && (
          <p className="text-muted-foreground text-sm mb-5 max-w-xs leading-relaxed">
            پرداخت انجام نشد. مبلغی از حساب شما کسر نشده است.
          </p>
        )
      )}

      {/* Ref ID */}
      {isSuccess && refId && (
        <div className="bg-card border border-border rounded-xl px-5 py-4 mb-5 w-full max-w-xs">
          <p className="text-muted-foreground text-xs mb-1">کد پیگیری تراکنش</p>
          <p className="font-mono font-bold text-foreground text-lg" dir="ltr">
            {refId}
          </p>
          {orderId && (
            <p className="text-muted-foreground text-xs mt-1">شماره سفارش: #{orderId}</p>
          )}
        </div>
      )}

      {!isSuccess && message && (
        <p className="text-muted-foreground text-sm mb-5 max-w-xs leading-relaxed">
          {decodeURIComponent(message)}
        </p>
      )}

      {/* CTAs */}
      <div className="flex flex-col gap-3 w-full max-w-xs">
        {isSuccess && isAiReport && resolvedSlug && resolvedSessionId && (
          <button
            onClick={() =>
              navigate(`/assessment/${resolvedSlug}/result/${resolvedSessionId}`)
            }
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all"
          >
            <Brain className="w-5 h-5" />
            مشاهده گزارش AI
            {countdown > 0 && (
              <span className="opacity-60 text-sm">({countdown})</span>
            )}
          </button>
        )}

        {isSuccess && !isAiReport && (
          <Link href="/profile">
            <button className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all">
              <BookOpen className="w-5 h-5" />
              مشاهده دوره‌های من
            </button>
          </Link>
        )}

        <Link href="/">
          <button className="w-full h-12 bg-card border border-border text-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-accent active:scale-95 transition-all">
            <ArrowRight className="w-5 h-5" />
            بازگشت به صفحه اصلی
          </button>
        </Link>

        {!isSuccess && (
          <button
            onClick={() => window.history.back()}
            className="w-full h-12 bg-primary text-primary-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-primary/90 active:scale-95 transition-all"
          >
            تلاش مجدد
          </button>
        )}
      </div>
    </motion.div>
  );
}
