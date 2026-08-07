import { useState } from "react";
import { useGetUserCourses, getGetUserCoursesQueryKey } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CachedImage } from "@/components/ui/cached-image";
import { Link, Redirect } from "wouter";
import { motion } from "framer-motion";
import { GraduationCap, PlayCircle, ShoppingBag, Key, CheckCircle, ChevronLeft, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

function ShopBannerCard() {
  return (
    <Link href="/products">
      <div className="glass-card glass-shimmer relative overflow-hidden rounded-2xl mb-6 cursor-pointer active:scale-[0.97] transition-transform select-none" style={{ minHeight: 110 }}>
        {/* Liquid glass base tint */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(240,192,64,0.08) 0%, rgba(255,255,255,0.03) 50%, rgba(0,0,0,0.1) 100%)" }} />

        {/* Animated glow orb 1 — gold */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 180, height: 180, background: "radial-gradient(circle, rgba(240,192,64,0.28) 0%, transparent 70%)", top: -40, right: -30 }}
          animate={{ x: [0, 18, -8, 0], y: [0, 12, -10, 0], scale: [1, 1.15, 0.95, 1] }}
          transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
        />

        {/* Animated glow orb 2 — amber */}
        <motion.div
          className="absolute rounded-full"
          style={{ width: 140, height: 140, background: "radial-gradient(circle, rgba(202,138,4,0.18) 0%, transparent 70%)", bottom: -30, left: 10 }}
          animate={{ x: [0, -14, 10, 0], y: [0, -10, 14, 0], scale: [1, 0.9, 1.1, 1] }}
          transition={{ duration: 9, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        />

        {/* Floating particles */}
        {[
          { cx: "20%", cy: "30%", d: 4, delay: 0 },
          { cx: "75%", cy: "60%", d: 3, delay: 1.2 },
          { cx: "50%", cy: "80%", d: 2.5, delay: 2.5 },
          { cx: "85%", cy: "25%", d: 3.5, delay: 0.8 },
          { cx: "35%", cy: "65%", d: 2, delay: 3.5 },
        ].map((p, i) => (
          <motion.div
            key={i}
            className="absolute rounded-full"
            style={{ width: p.d, height: p.d, left: p.cx, top: p.cy, background: "rgba(240,192,64,0.6)" }}
            animate={{ opacity: [0.3, 1, 0.3], scale: [1, 1.6, 1], y: [0, -8, 0] }}
            transition={{ duration: 3 + i * 0.5, repeat: Infinity, ease: "easeInOut", delay: p.delay }}
          />
        ))}

        {/* Specular shimmer sweep */}
        <motion.div
          className="absolute inset-0"
          style={{ background: "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.07) 50%, transparent 70%)" }}
          animate={{ x: ["-100%", "200%"] }}
          transition={{ duration: 4, repeat: Infinity, ease: "easeInOut", repeatDelay: 3 }}
        />

        {/* Content */}
        <div className="relative z-10 flex items-center justify-between px-5 py-5">
          <div className="flex items-center gap-3">
            {/* Icon with gold glow */}
            <div className="relative">
              <div className="absolute inset-0 blur-md rounded-xl" style={{ background: "rgba(240,192,64,0.4)" }} />
              <div className="relative w-12 h-12 rounded-xl flex items-center justify-center shadow-lg" style={{ background: "linear-gradient(135deg, #f0c040, #ca8a04)", boxShadow: "0 4px 16px rgba(240,192,64,0.35)" }}>
                <ShoppingBag className="w-6 h-6 text-black" />
              </div>
            </div>

            <div dir="rtl">
              <div className="flex items-center gap-1.5 mb-0.5">
                <motion.div
                  animate={{ rotate: [0, 15, -10, 0], scale: [1, 1.2, 1] }}
                  transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="w-3.5 h-3.5" style={{ color: "#e8b800" }} />
                </motion.div>
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: "#e8b800" }}>آکادمی شیوافر</span>
              </div>
              <h2 className="text-lg font-black text-foreground leading-tight">فروشگاه آکادمی</h2>
              <p className="text-xs mt-0.5" style={{ color: "rgba(240,192,64,0.65)" }}>دوره‌های آموزشی قابل خرید</p>
            </div>
          </div>

          {/* Arrow */}
          <motion.div
            animate={{ x: [0, -5, 0] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
            className="w-8 h-8 rounded-full flex items-center justify-center shrink-0"
            style={{ background: "var(--tag-inactive-bg)", border: "1px solid var(--card-glass-border)" }}
          >
            <ChevronLeft className="w-4 h-4" style={{ color: "rgba(240,192,64,0.8)" }} />
          </motion.div>
        </div>

        {/* Bottom specular line */}
        <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: "linear-gradient(to right, transparent, rgba(240,192,64,0.4), transparent)" }} />
      </div>
    </Link>
  );
}

function LicenseRedeemSection({ token }: { token: string }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const qc = useQueryClient();

  const handleRedeem = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) { toast.error("کد لایسنس را وارد کنید"); return; }
    setLoading(true);
    try {
      const res = await fetch("/api/licenses/redeem", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ code: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const title = data.courseTitle ?? "دوره";
      setSuccess(title);
      setCode("");
      await qc.invalidateQueries({ queryKey: getGetUserCoursesQueryKey() });
      const count = data.courseIds?.length ?? 1;
      toast.success(count > 1 ? `${count} دوره با موفقیت فعال شد!` : `دوره "${title}" با موفقیت فعال شد!`);
    } catch (err: unknown) {
      toast.error((err as Error).message ?? "کد لایسنس نامعتبر است");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-2 mb-3">
        <Key className="w-4 h-4 text-primary" />
        <h2 className="text-sm font-bold text-foreground">فعالسازی با لایسنس</h2>
      </div>

      {success ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 text-green-500 text-sm font-medium"
        >
          <CheckCircle className="w-4 h-4" />
          دوره «{success}» در لیست دوره‌های شما اضافه شد
          <button onClick={() => setSuccess(null)} className="mr-auto text-xs text-muted-foreground hover:text-foreground">فعالسازی جدید</button>
        </motion.div>
      ) : (
        <form onSubmit={handleRedeem} className="flex gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="SHVF-XXXX-XXXX-XXXX"
            dir="ltr"
            className="flex-1 h-10 text-sm font-mono bg-background border-primary/30 focus-visible:ring-primary uppercase tracking-wider"
            maxLength={19}
          />
          <Button type="submit" size="sm" className="h-10 px-4 shrink-0" disabled={loading || !code.trim()}>
            {loading ? "..." : "فعالسازی"}
          </Button>
        </form>
      )}
      <p className="text-xs text-muted-foreground mt-2">
        اگر دوره را از مشاور فروش خریداری کرده‌اید، کد لایسنس دریافتی را وارد کنید.
      </p>
    </div>
  );
}

export default function Courses() {
  const { token } = useAuth();
  const { data: courses, isLoading, isError } = useGetUserCourses({
    query: {
      enabled: !!token,
      queryKey: getGetUserCoursesQueryKey(),
      retry: 1,
    }
  });

  if (!token) return <Redirect to="/login" />;

  const isEmpty = !isLoading && !isError && (!courses || courses.length === 0);
  const hasError = isError;

  return (
    <div className="p-4 pt-8 pb-24" dir="rtl">
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-black mb-2 flex items-center gap-2 justify-center" style={{ color: "#fff" }}>
          <GraduationCap className="text-primary" />
          دوره‌های آموزشی من
        </h1>
        <p className="text-sm" style={{ color: "var(--text-on-dark-mid)" }}>دوره‌هایی که خریداری کرده‌اید</p>
      </div>

      {/* License redeem section — always visible */}
      <LicenseRedeemSection token={token} />

      {isLoading ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: "rgba(232,184,0,0.25)", borderTopColor: "#e8b800" }} />
        </div>
      ) : (isEmpty || hasError) ? (
        /* Empty state */
        <div className="flex flex-col gap-4 mt-4">
          {/* Message */}
          <div
            className="rounded-2xl p-4 text-center"
            style={{ background: "var(--card-glass-bg)", border: "1px solid var(--card-glass-border)" }}
          >
            <GraduationCap className="w-10 h-10 mx-auto mb-2 opacity-30" style={{ color: "#e8b800" }} />
            <p className="font-bold text-sm" style={{ color: "var(--text-on-dark-mid)" }}>
              شما در حال حاضر دوره خریداری شده ندارید
            </p>
          </div>

          {/* Shop card */}
          <Link href="/products">
            <div
              className="rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.18), rgba(79,70,229,0.12))", border: "1px solid rgba(124,58,237,0.3)" }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "rgba(124,58,237,0.2)" }}
              >
                <ShoppingBag className="w-5 h-5" style={{ color: "#a78bfa" }} />
              </div>
              <div className="flex-1 text-right">
                <p className="font-black text-sm text-foreground">فروشگاه محصولات آموزشی</p>
                <p className="text-xs mt-0.5" style={{ color: "var(--text-on-dark-mid)" }}>مشاهده دوره‌های قابل خرید</p>
              </div>
              <ChevronLeft className="w-4 h-4 shrink-0" style={{ color: "var(--text-on-dark-low)" }} />
            </div>
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
        {(courses ?? []).map((course, index) => (
          <motion.div
            key={course.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <Link href={`/courses/${course.id}`}>
              <Card className="overflow-hidden bg-card border-card-border active:scale-[0.98] transition-transform">
                <div className="flex h-32">
                  <div className="w-32 bg-muted relative shrink-0">
                    <CachedImage
                      src={course.thumbnail ?? course.image}
                      alt={course.title}
                      className="w-full h-full object-cover"
                      fallback={
                        <div className="w-full h-full flex items-center justify-center bg-secondary">
                          <PlayCircle className="w-8 h-8 text-muted-foreground opacity-50" />
                        </div>
                      }
                    />
                  </div>
                  <CardContent className="p-3 flex flex-col justify-between flex-1">
                    <div>
                      <h3 className="font-bold text-sm line-clamp-2 leading-tight mb-1">{course.title}</h3>
                      <p className="text-xs text-muted-foreground line-clamp-2">{course.description}</p>
                    </div>
                    <div className="flex justify-end">
                      <span className="text-xs text-primary font-semibold bg-primary/10 px-2 py-1 rounded-full">
                        خریداری شده ✓
                      </span>
                    </div>
                  </CardContent>
                </div>
              </Card>
            </Link>
          </motion.div>
        ))}
        </div>
      )}
    </div>
  );
}
