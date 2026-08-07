import { useState, useRef } from "react";
import { useParams, useLocation } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ChevronRight,
  ChevronLeft,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Brain,
  Star,
} from "lucide-react";

function authFetch(token: string | null, url: string, opts: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
  });
}

interface Question {
  id: number;
  type: string;
  title: string;
  description?: string;
  image?: string;
  sortOrder: number;
  isRequired: boolean;
  options: Array<{ id: string; label: string }>;
  conditionalLogic?: { questionId: number; operator: string; value: unknown } | null;
  specialMessage?: string;
  answerLabel?: string;
  scaleMinLabel?: string;
  scaleMaxLabel?: string;
}

interface Assessment {
  id: number;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  coverImage?: string;
  estimatedMinutes?: number;
  startText?: string;
  endText?: string;
  requiresAuth: boolean;
  requiresLogin?: boolean;
  collectContactInfo: boolean;
  hasAiReport: boolean;
  aiReportPrice?: number;
  participantCount: number;
  questions: Question[] | null;
}

function shouldShowQuestion(q: Question, answers: Record<string, unknown>): boolean {
  if (!q.conditionalLogic) return true;
  const { questionId, operator, value } = q.conditionalLogic;
  const ans = answers[String(questionId)];
  if (ans == null) return false;
  switch (operator) {
    case "eq": return ans === value;
    case "neq": return ans !== value;
    case "in": return Array.isArray(value) && (value as unknown[]).includes(ans);
    case "gte": return Number(ans) >= Number(value);
    case "lte": return Number(ans) <= Number(value);
    default: return true;
  }
}

// ─── Scale renderer (1-5 or 1-10) ─────────────────────────────────────────────
function ScaleInput({
  max,
  value,
  onChange,
  minLabel,
  maxLabel,
}: {
  max: 5 | 10;
  value: unknown;
  onChange: (v: number) => void;
  minLabel?: string;
  maxLabel?: string;
}) {
  const selected = typeof value === "number" ? value : null;
  const numbers = Array.from({ length: max }, (_, i) => i + 1);

  return (
    <div className="w-full">
      {max === 5 ? (
        // Star-style for scale_5
        <div className="flex justify-center gap-3 py-4">
          {numbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className="flex flex-col items-center gap-1 transition-transform active:scale-90"
            >
              <Star
                className={`w-10 h-10 transition-all ${
                  selected !== null && n <= selected
                    ? "fill-primary text-primary scale-110"
                    : "text-muted-foreground/40"
                }`}
              />
              <span className="text-xs text-muted-foreground font-medium">{n}</span>
            </button>
          ))}
        </div>
      ) : (
        // Number buttons for scale_10
        <div className="grid grid-cols-5 gap-2">
          {numbers.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => onChange(n)}
              className={`h-12 rounded-xl border text-base font-bold transition-all active:scale-95 ${
                selected === n
                  ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                  : "bg-card border-border hover:border-primary/40 hover:bg-primary/5 text-foreground"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      {(minLabel || maxLabel) && (
        <div className="flex justify-between mt-3 px-1">
          <span className="text-xs text-muted-foreground">{minLabel}</span>
          <span className="text-xs text-muted-foreground">{maxLabel}</span>
        </div>
      )}
    </div>
  );
}

export default function AssessmentTake() {
  const { slug } = useParams<{ slug: string }>();
  const [, setLocation] = useLocation();
  const { token } = useAuth();

  const [phase, setPhase] = useState<"intro" | "contact" | "quiz" | "submitting">("intro");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [contactInfo, setContactInfo] = useState({ name: "", phone: "" });
  const [error, setError] = useState<string | null>(null);

  const deviceFp = useRef<string>(
    `fp-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );

  const { data: assessment, isLoading } = useQuery<Assessment>({
    queryKey: ["/api/assessments", slug],
    queryFn: async () => {
      const res = await authFetch(token, `/api/assessments/${slug}`);
      if (!res.ok) throw new Error("not found");
      return res.json();
    },
  });

  const startMutation = useMutation({
    mutationFn: async () => {
      const res = await authFetch(token, `/api/assessments/${slug}/start`, {
        method: "POST",
        body: JSON.stringify({ deviceFingerprint: deviceFp.current }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "خطا");
      }
      return res.json() as Promise<{ sessionId: number }>;
    },
    onSuccess: (data) => {
      setSessionId(data.sessionId);
      if (assessment?.collectContactInfo) {
        setPhase("contact");
      } else {
        setPhase("quiz");
      }
    },
    onError: (e: Error) => setError(e.message),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      setPhase("submitting");
      const res = await authFetch(token, `/api/assessments/${slug}/submit`, {
        method: "POST",
        body: JSON.stringify({
          sessionId,
          answers,
          contactInfo: assessment?.collectContactInfo ? contactInfo : undefined,
        }),
      });
      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error ?? "خطا");
      }
      return res.json();
    },
    onSuccess: () => {
      setLocation(`/assessment/${slug}/result/${sessionId}`);
    },
    onError: (e: Error) => {
      setError(e.message);
      setPhase("quiz");
    },
  });

  // ─── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="min-h-screen flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-3" />
          <p className="text-muted-foreground">تست یافت نشد</p>
        </div>
      </div>
    );
  }

  // ─── Requires Login ─────────────────────────────────────────────────────────
  if (assessment.requiresLogin) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6" dir="rtl">
        <div className="text-center max-w-sm">
          <Brain className="w-12 h-12 text-primary mx-auto mb-4" />
          <h2 className="text-xl font-bold mb-2">ورود به حساب کاربری لازم است</h2>
          <p className="text-muted-foreground mb-6">
            برای شروع این تست باید وارد حساب خود شوید
          </p>
          <Button onClick={() => setLocation("/login")} className="w-full">
            ورود / ثبت‌نام
          </Button>
        </div>
      </div>
    );
  }

  const visibleQuestions = (assessment.questions ?? []).filter((q) =>
    shouldShowQuestion(q, answers)
  );
  const totalQ = visibleQuestions.length;
  const progress = totalQ > 0 ? Math.round((currentIdx / totalQ) * 100) : 0;
  const currentQ = visibleQuestions[currentIdx];

  // ─── Intro Phase ────────────────────────────────────────────────────────────
  if (phase === "intro") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex flex-col"
        dir="rtl"
      >
        {assessment.coverImage && (
          <div className="w-full h-52 overflow-hidden">
            <img
              src={assessment.coverImage}
              alt={assessment.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="flex-1 px-6 pt-6 pb-24 max-w-lg mx-auto w-full">
          <h1 className="text-2xl font-black text-foreground mb-2">
            {assessment.title}
          </h1>
          {assessment.shortDescription && (
            <p className="text-muted-foreground mb-4">{assessment.shortDescription}</p>
          )}

          <div className="flex gap-4 mb-6">
            {assessment.estimatedMinutes && (
              <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                <Clock className="w-4 h-4" />
                <span>{assessment.estimatedMinutes} دقیقه</span>
              </div>
            )}
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Users className="w-4 h-4" />
              <span>
                {assessment.participantCount.toLocaleString("fa")} شرکت‌کننده
              </span>
            </div>
          </div>

          {assessment.startText && (
            <div className="bg-card border border-border rounded-2xl p-4 mb-6 text-sm text-foreground leading-loose">
              {assessment.startText}
            </div>
          )}

          {assessment.description && !assessment.startText && (
            <div className="text-sm text-muted-foreground leading-loose mb-6">
              {assessment.description}
            </div>
          )}

          {error && (
            <p className="text-red-400 text-sm mb-4 bg-red-500/10 rounded-xl p-3">
              {error}
            </p>
          )}

          <Button
            onClick={() => startMutation.mutate()}
            disabled={startMutation.isPending}
            className="w-full h-12 text-base font-bold"
          >
            {startMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <>
                شروع تست
                <ChevronLeft className="w-4 h-4 mr-2" />
              </>
            )}
          </Button>
        </div>
      </motion.div>
    );
  }

  // ─── Contact Phase ──────────────────────────────────────────────────────────
  if (phase === "contact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="min-h-screen flex flex-col px-6 pt-10 pb-24 max-w-lg mx-auto w-full"
        dir="rtl"
      >
        <Brain className="w-10 h-10 text-primary mb-4" />
        <h2 className="text-xl font-black mb-1">اطلاعات تماس</h2>
        <p className="text-muted-foreground text-sm mb-6">
          برای دریافت نتیجه شخصی‌سازی‌شده، اطلاعات خود را وارد کنید
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <label className="text-sm font-medium mb-1.5 block">نام و نام خانوادگی</label>
            <Input
              value={contactInfo.name}
              onChange={(e) => setContactInfo((p) => ({ ...p, name: e.target.value }))}
              placeholder="مثلاً: علی رضایی"
              className="h-12"
            />
          </div>
          <div>
            <label className="text-sm font-medium mb-1.5 block">شماره موبایل</label>
            <Input
              value={contactInfo.phone}
              onChange={(e) =>
                setContactInfo((p) => ({ ...p, phone: e.target.value }))
              }
              placeholder="09xxxxxxxxx"
              type="tel"
              inputMode="numeric"
              className="h-12"
              dir="ltr"
            />
          </div>
        </div>

        <Button
          onClick={() => setPhase("quiz")}
          disabled={!contactInfo.name.trim() || contactInfo.phone.length < 10}
          className="w-full h-12 text-base font-bold"
        >
          ادامه به سوالات
        </Button>
        <button
          onClick={() => setPhase("quiz")}
          className="mt-3 text-center text-sm text-muted-foreground w-full"
        >
          رد کردن
        </button>
      </motion.div>
    );
  }

  // ─── Submitting ─────────────────────────────────────────────────────────────
  if (phase === "submitting") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" dir="rtl">
        <Loader2 className="w-10 h-10 animate-spin text-primary" />
        <p className="text-foreground font-medium">در حال محاسبه نتیجه...</p>
      </div>
    );
  }

  // ─── All questions done (no currentQ) ──────────────────────────────────────
  if (!currentQ) {
    return (
      <div
        className="min-h-screen flex flex-col items-center justify-center gap-6 px-6"
        dir="rtl"
      >
        <CheckCircle2 className="w-16 h-16 text-green-400" />
        <h2 className="text-xl font-bold text-center">همه سوالات پاسخ داده شد!</h2>
        {error && (
          <p className="text-red-400 text-sm text-center">{error}</p>
        )}
        <Button
          onClick={() => submitMutation.mutate()}
          disabled={submitMutation.isPending}
          className="h-12 px-10 text-base font-bold"
        >
          {submitMutation.isPending ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            "مشاهده نتیجه"
          )}
        </Button>
      </div>
    );
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────
  function setAnswer(qid: number, val: unknown) {
    setAnswers((prev) => ({ ...prev, [String(qid)]: val }));
  }

  function handleNext() {
    if (
      currentQ.isRequired &&
      (answers[String(currentQ.id)] == null || answers[String(currentQ.id)] === "")
    ) {
      setError("پاسخ به این سوال اجباری است");
      return;
    }
    setError(null);
    if (currentIdx + 1 >= totalQ) {
      submitMutation.mutate();
    } else {
      setCurrentIdx((i) => i + 1);
    }
  }

  function handlePrev() {
    if (currentIdx > 0) setCurrentIdx((i) => i - 1);
  }

  const currentAnswer = answers[String(currentQ.id)];

  // ─── Quiz Phase ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen flex flex-col" dir="rtl">
      {/* Progress bar */}
      <div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-4 pt-4 pb-3">
        <div className="flex items-center justify-between mb-2 max-w-lg mx-auto">
          <span className="text-xs text-muted-foreground">
            سوال {currentIdx + 1} از {totalQ}
          </span>
          <span className="text-xs text-muted-foreground font-medium">{progress}%</span>
        </div>
        <Progress value={progress} className="h-2 max-w-lg mx-auto" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={currentQ.id}
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
          className="flex-1 px-6 pt-8 pb-32 max-w-lg mx-auto w-full"
        >
          {currentQ.image && (
            <img
              src={currentQ.image}
              alt=""
              className="w-full rounded-xl mb-4 max-h-48 object-cover"
            />
          )}

          <h2 className="text-lg font-bold text-foreground mb-2 leading-relaxed">
            {currentQ.title}
            {currentQ.isRequired && (
              <span className="text-red-400 mr-1">*</span>
            )}
          </h2>

          {currentQ.description && (
            <p className="text-muted-foreground text-sm mb-6">{currentQ.description}</p>
          )}

          {/* ── Single choice / Yes-No / Dropdown ── */}
          {(currentQ.type === "single_choice" ||
            currentQ.type === "yes_no" ||
            currentQ.type === "dropdown") && (
            <div className="space-y-2.5">
              {currentQ.options.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAnswer(currentQ.id, opt.id)}
                  className={`w-full text-right px-4 py-3.5 rounded-xl border transition-all text-sm font-medium ${
                    currentAnswer === opt.id
                      ? "bg-primary text-primary-foreground border-primary shadow-md shadow-primary/20"
                      : "bg-card border-border hover:border-primary/40 hover:bg-primary/5"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}

          {/* ── Multi choice ── */}
          {currentQ.type === "multi_choice" && (
            <div className="space-y-2.5">
              {currentQ.options.map((opt) => {
                const sel = Array.isArray(currentAnswer)
                  ? (currentAnswer as string[])
                  : [];
                const isSelected = sel.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      const prev = Array.isArray(currentAnswer)
                        ? [...(currentAnswer as string[])]
                        : [];
                      setAnswer(
                        currentQ.id,
                        isSelected
                          ? prev.filter((x) => x !== opt.id)
                          : [...prev, opt.id]
                      );
                    }}
                    className={`w-full text-right px-4 py-3.5 rounded-xl border transition-all text-sm font-medium flex items-center gap-3 ${
                      isSelected
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-card border-border hover:border-primary/40"
                    }`}
                  >
                    <span
                      className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                        isSelected
                          ? "border-primary-foreground bg-primary-foreground/20"
                          : "border-current opacity-40"
                      }`}
                    >
                      {isSelected && (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Scale 1-5 (stars) ── */}
          {currentQ.type === "scale_5" && (
            <ScaleInput
              max={5}
              value={currentAnswer}
              onChange={(v) => setAnswer(currentQ.id, v)}
              minLabel={currentQ.scaleMinLabel}
              maxLabel={currentQ.scaleMaxLabel}
            />
          )}

          {/* ── Scale 1-10 (number buttons) ── */}
          {currentQ.type === "scale_10" && (
            <ScaleInput
              max={10}
              value={currentAnswer}
              onChange={(v) => setAnswer(currentQ.id, v)}
              minLabel={currentQ.scaleMinLabel}
              maxLabel={currentQ.scaleMaxLabel}
            />
          )}

          {/* ── Short text ── */}
          {currentQ.type === "short_text" && (
            <Input
              value={typeof currentAnswer === "string" ? currentAnswer : ""}
              onChange={(e) => setAnswer(currentQ.id, e.target.value)}
              placeholder={currentQ.answerLabel ?? "پاسخ خود را بنویسید..."}
              className="h-12 text-base"
              dir="rtl"
            />
          )}

          {/* ── Long text ── */}
          {currentQ.type === "long_text" && (
            <Textarea
              value={typeof currentAnswer === "string" ? currentAnswer : ""}
              onChange={(e) => setAnswer(currentQ.id, e.target.value)}
              placeholder={currentQ.answerLabel ?? "پاسخ تفصیلی خود را بنویسید..."}
              className="min-h-[140px] text-base leading-relaxed resize-none"
              dir="rtl"
            />
          )}

          {/* ── Number ── */}
          {currentQ.type === "number" && (
            <Input
              type="number"
              value={typeof currentAnswer === "number" ? String(currentAnswer) : ""}
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                setAnswer(currentQ.id, isNaN(v) ? "" : v);
              }}
              placeholder={currentQ.answerLabel ?? "عدد را وارد کنید"}
              className="h-12 text-base"
              inputMode="numeric"
              dir="ltr"
            />
          )}

          {/* ── Info section ── */}
          {currentQ.type === "info_section" && (
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-4 text-sm text-foreground leading-relaxed">
              {currentQ.description}
            </div>
          )}

          {/* Error */}
          {error && (
            <p className="text-red-400 text-sm mt-3">{error}</p>
          )}

          {/* Special message after answer */}
          {currentQ.specialMessage && currentAnswer != null && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 bg-primary/10 border border-primary/30 rounded-xl p-3 text-sm text-primary"
            >
              {currentQ.specialMessage}
            </motion.div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Bottom nav */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/95 backdrop-blur border-t border-border px-6 py-4">
        <div className="flex gap-3 max-w-lg mx-auto">
          {currentIdx > 0 && (
            <Button
              variant="outline"
              onClick={handlePrev}
              className="flex-1 h-12"
            >
              <ChevronRight className="w-4 h-4 ml-1" /> قبلی
            </Button>
          )}
          {/* Skip info_section without requiring answer */}
          <Button
            onClick={handleNext}
            disabled={submitMutation.isPending}
            className="flex-1 h-12 font-bold"
          >
            {submitMutation.isPending ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : currentIdx + 1 >= totalQ ? (
              "مشاهده نتیجه"
            ) : (
              <>
                بعدی <ChevronLeft className="w-4 h-4 mr-1" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
