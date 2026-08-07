import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Wrench, Smartphone, Download, Bot, BarChart2, Brain, ChevronLeft, Clock, Users, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth";

function authFetch(token: string | null, url: string): Promise<Response> {
  return fetch(url, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

interface Assessment {
  id: number;
  title: string;
  slug: string;
  shortDescription?: string;
  coverImage?: string;
  estimatedMinutes?: number;
  participantCount: number;
  questionCount: number;
  hasAiReport: boolean;
  requiresAuth: boolean;
  aiReportPrice?: number;
  productTitle?: string;
  category?: string;
}

type Tab = "tools" | "assessments";

export default function Tools() {
  const { token } = useAuth();

  // تشخیص اینکه آیا کاربر APK یا PWA رو نصب کرده
  const [isInstalled, setIsInstalled] = useState(false);
  useEffect(() => {
    async function checkInstalled() {
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches ||
        window.matchMedia("(display-mode: fullscreen)").matches ||
        window.matchMedia("(display-mode: minimal-ui)").matches ||
        (navigator as unknown as { standalone?: boolean }).standalone === true;
      const isTWA = document.referrer.startsWith("android-app://");
      const isNativeApp = navigator.userAgent.includes("ShivaferAcademy") || (window as any).isNativeApp === true;
      let hasRelatedApp = false;
      try {
        const related = await (navigator as any).getInstalledRelatedApps?.();
        hasRelatedApp = Array.isArray(related) && related.length > 0;
      } catch { /* not supported */ }
      if (isStandalone || isTWA || isNativeApp || hasRelatedApp) {
        setIsInstalled(true);
      }
    }
    checkInstalled();
  }, []);
  const [activeTab, setActiveTab] = useState<Tab>("tools");

  const { data: reminders = [] } = useQuery<{ readAt: string | null }[]>({
    queryKey: ["/api/assistant/reminders"],
    enabled: !!token,
    queryFn: async () => {
      const res = await authFetch(token, "/api/assistant/reminders");
      if (!res.ok) return [];
      return res.json();
    },
    refetchInterval: 60_000,
  });

  const { data: assessments = [], isLoading: assessmentsLoading } = useQuery<Assessment[]>({
    queryKey: ["/api/assessments"],
    queryFn: async () => {
      const res = await fetch("/api/assessments");
      if (!res.ok) return [];
      return res.json();
    },
  });

  const unreadCount = reminders.filter((r) => !r.readAt).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center pb-24 px-4 pt-8"
      dir="rtl"
    >
      {/* Header */}
      <div className="w-full max-w-md mb-6 text-right">
        <h1 className="text-2xl font-black text-foreground mb-1">ابزارها</h1>
        <p className="text-muted-foreground text-sm">امکانات ویژه شیوافر آکادمی</p>
      </div>

      {/* Glassy Liquid Tabs — theme-aware */}
      <div className="w-full max-w-md mb-6">
        <div className="relative flex rounded-2xl p-1.5 bg-muted/60 border border-border backdrop-blur-xl">
          {/* Sliding indicator */}
          <motion.div
            className="absolute top-1.5 bottom-1.5 rounded-xl"
            layout
            transition={{ type: "spring", stiffness: 400, damping: 35 }}
            style={
              activeTab === "tools"
                ? {
                    right: "6px",
                    width: "calc(50% - 6px)",
                    background: "linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)",
                    boxShadow: "0 4px 20px rgba(139,92,246,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }
                : {
                    left: "6px",
                    width: "calc(50% - 6px)",
                    background: "linear-gradient(135deg, #10b981 0%, #059669 100%)",
                    boxShadow: "0 4px 20px rgba(16,185,129,0.4), inset 0 1px 0 rgba(255,255,255,0.15)",
                  }
            }
          />

          {/* ابزارها tab */}
          <button
            onClick={() => setActiveTab("tools")}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all duration-200"
          >
            <Wrench
              className={`w-4 h-4 transition-all duration-200 ${
                activeTab === "tools" ? "text-white" : "text-muted-foreground"
              }`}
            />
            <span
              className={`text-sm font-bold transition-all duration-200 ${
                activeTab === "tools" ? "text-white" : "text-muted-foreground"
              }`}
            >
              ابزارها
            </span>
          </button>

          {/* تست‌ها tab */}
          <button
            onClick={() => setActiveTab("assessments")}
            className="relative z-10 flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl transition-all duration-200"
          >
            <Brain
              className={`w-4 h-4 transition-all duration-200 ${
                activeTab === "assessments" ? "text-white" : "text-muted-foreground"
              }`}
            />
            <span
              className={`text-sm font-bold transition-all duration-200 ${
                activeTab === "assessments" ? "text-white" : "text-muted-foreground"
              }`}
            >
              تست‌ها
            </span>
          </button>
        </div>
      </div>

      {/* Tab Content */}
      <div className="w-full max-w-md">
        <AnimatePresence mode="wait">
          {activeTab === "tools" ? (
            <motion.div
              key="tools"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col gap-4"
            >
              {/* Android App Download Card — فقط برای کاربرانی که اپ رو نصب نکردن */}
              {!isInstalled && <Link href="/download">
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary to-purple-900 p-5 cursor-pointer shadow-lg shadow-primary/25"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                        <Smartphone className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="font-black text-white text-base">اپلیکیشن اندروید</h3>
                        <p className="text-white/70 text-xs mt-0.5">دانلود اپ شیوافر آکادمی</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
                      <Download className="w-4 h-4 text-white" />
                      <span className="text-white text-xs font-bold">دانلود</span>
                    </div>
                  </div>
                  <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full bg-white/5" />
                  <div className="absolute -bottom-4 -left-2 w-12 h-12 rounded-full bg-white/5" />
                </motion.div>
              </Link>}

              {/* Smart Assistant Card */}
              <Link href="/assistant">
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-violet-700 to-purple-900 p-5 cursor-pointer shadow-lg shadow-violet-500/25"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                          <Bot className="w-7 h-7 text-white" />
                        </div>
                        {unreadCount > 0 && (
                          <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            className="absolute -top-1.5 -right-1.5 min-w-[20px] h-5 px-1 rounded-full bg-red-500 text-white text-[11px] font-black flex items-center justify-center shadow-md shadow-red-500/40"
                          >
                            {unreadCount > 9 ? "9+" : unreadCount}
                          </motion.span>
                        )}
                      </div>
                      <div>
                        <h3 className="font-black text-white text-base">دستیار هوشمند</h3>
                        <p className="text-white/70 text-xs mt-0.5">مدیریت کارها، یادآوری و چت</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
                      <span className="text-white text-xs font-bold">باز کردن</span>
                    </div>
                  </div>
                  <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full bg-white/5" />
                  <div className="absolute -bottom-4 -left-2 w-12 h-12 rounded-full bg-white/5" />
                </motion.div>
              </Link>

              {/* Income & Expense Tool */}
              <Link href="/tools/income-expense">
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-emerald-800 to-teal-900 p-5 cursor-pointer shadow-lg shadow-emerald-900/30"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-xl bg-white/10 flex items-center justify-center">
                        <BarChart2 className="w-7 h-7 text-white" />
                      </div>
                      <div>
                        <h3 className="font-black text-white text-base">مدیریت درآمد و هزینه</h3>
                        <p className="text-white/70 text-xs mt-0.5">ابزار مالی هوشمند</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white/15 rounded-lg px-3 py-1.5">
                      <span className="text-white text-xs font-bold">باز کردن</span>
                    </div>
                  </div>
                  <div className="absolute -top-6 -left-6 w-20 h-20 rounded-full bg-white/5" />
                  <div className="absolute -bottom-4 -left-2 w-12 h-12 rounded-full bg-white/5" />
                </motion.div>
              </Link>
            </motion.div>
          ) : (
            <motion.div
              key="assessments"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.2 }}
            >
              {assessmentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : assessments.length === 0 ? (
                <div className="rounded-2xl bg-card border border-border p-8 text-center">
                  <Brain className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-40" />
                  <p className="text-muted-foreground text-sm">به زودی تست‌های جدید اضافه می‌شود</p>
                </div>
              ) : (
                <div className="flex flex-col gap-4">
                  {assessments.map((assessment, i) => (
                    <Link key={assessment.id} href={`/assessment/${assessment.slug}`}>
                      <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.05 }}
                        whileTap={{ scale: 0.97 }}
                        className="relative overflow-hidden rounded-2xl bg-card border border-border cursor-pointer hover:border-primary/40 transition-all shadow-sm"
                      >
                        <div className="flex gap-3 p-4">
                          {assessment.coverImage ? (
                            <img
                              src={assessment.coverImage}
                              alt={assessment.title}
                              className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
                            />
                          ) : (
                            <div className="w-16 h-16 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                              <Brain className="w-7 h-7 text-primary" />
                            </div>
                          )}

                          <div className="flex-1 min-w-0">
                            {assessment.category && (
                              <span className="inline-block text-xs text-primary/70 bg-primary/10 px-2 py-0.5 rounded-full mb-1">
                                {assessment.category}
                              </span>
                            )}
                            <h3 className="font-black text-foreground text-sm leading-snug mb-1 line-clamp-1">
                              {assessment.title}
                            </h3>
                            {assessment.shortDescription && (
                              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                                {assessment.shortDescription}
                              </p>
                            )}
                            <div className="flex items-center gap-3 flex-wrap">
                              {assessment.estimatedMinutes && (
                                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                  <Clock className="w-3 h-3" />
                                  {assessment.estimatedMinutes} دقیقه
                                </span>
                              )}
                              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                                <Users className="w-3 h-3" />
                                {assessment.participantCount.toLocaleString("fa")}
                              </span>
                              {assessment.questionCount > 0 && (
                                <span className="text-xs text-muted-foreground">
                                  {assessment.questionCount} سوال
                                </span>
                              )}
                            </div>
                          </div>

                          <div className="flex flex-col items-end justify-between flex-shrink-0">
                            <ChevronLeft className="w-4 h-4 text-muted-foreground" />
                            {assessment.hasAiReport ? (
                              <span className="text-xs bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-full font-medium">
                                AI
                              </span>
                            ) : (
                              <span className="text-xs bg-green-500/10 text-green-600 border border-green-500/20 px-2 py-0.5 rounded-full font-medium">
                                رایگان
                              </span>
                            )}
                          </div>
                        </div>

                        {assessment.productTitle && (
                          <div className="px-4 pb-3">
                            <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">
                              🎯 مرتبط با: {assessment.productTitle}
                            </span>
                          </div>
                        )}
                      </motion.div>
                    </Link>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
