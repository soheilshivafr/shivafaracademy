import { motion } from "framer-motion";
import {
  Smartphone,
  Download as DownloadIcon,
  CheckCircle2,
  Settings,
  Globe,
  ArrowRight,
  Shield,
  Package,
  Loader2,
} from "lucide-react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";

const INSTALL_STEPS = [
  {
    icon: DownloadIcon,
    title: "دانلود فایل APK",
    desc: "روی دکمه زیر کلیک کنید تا فایل APK آماده نصب دانلود شود",
  },
  {
    icon: Settings,
    title: "فعالسازی نصب از منابع ناشناخته",
    desc: "در تنظیمات گوشی > امنیت، گزینه «نصب از منابع ناشناخته» را فعال کنید",
  },
  {
    icon: Smartphone,
    title: "نصب APK",
    desc: "فایل دانلود شده را باز کنید و مراحل نصب را طی کنید",
  },
];

const FEATURES = [
  "دسترسی به تمام دوره‌ها و محتوا",
  "پشتیبانی از حالت آفلاین",
  "تجربه بهتر روی موبایل",
  "آیکون اختصاصی روی صفحه اصلی",
  "اعلان‌های پوش (Push Notification)",
  "دکمه بازگشت اندروید پشتیبانی می‌شود",
];

export default function Download() {
  const apkUrl = "/api/download/android";

  const { data: info, isLoading } = useQuery<{
    type: "apk" | "zip" | null;
    available: boolean;
    sizeBytes: number;
    sizeMb: number;
    filename: string;
  }>({
    queryKey: ["/api/download/android/info"],
    queryFn: async () => {
      const res = await fetch("/api/download/android/info");
      return res.json();
    },
    staleTime: 60_000,
  });

  const isApk = info?.type === "apk";
  const sizeMb = info?.sizeMb;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="min-h-screen pb-28 px-4 pt-8"
      dir="rtl"
    >
      <div className="max-w-md mx-auto">
        {/* Hero */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-primary to-purple-900 flex items-center justify-center mx-auto mb-5 shadow-2xl shadow-primary/30">
            <Smartphone className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-3xl font-black text-foreground mb-2">
            اپلیکیشن شیوافر آکادمی
          </h1>
          <p className="text-muted-foreground text-sm leading-relaxed">
            اپلیکیشن اندروید شیوافر آکادمی را دانلود و نصب کنید
          </p>
        </motion.div>

        {/* Download button — always visible */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.15 }}
          className="mb-6"
        >
          <a href={apkUrl} download>
            <button className="w-full h-14 bg-primary hover:bg-primary/90 active:scale-95 text-white rounded-2xl font-black text-lg flex items-center justify-center gap-3 transition-all shadow-lg shadow-primary/30">
              {isLoading ? (
                <>
                  <Loader2 className="w-6 h-6 animate-spin" />
                  در حال بررسی...
                </>
              ) : isApk ? (
                <>
                  <DownloadIcon className="w-6 h-6" />
                  دانلود APK
                  {sizeMb ? (
                    <span className="text-white/70 text-sm font-normal">
                      ({sizeMb} MB)
                    </span>
                  ) : null}
                </>
              ) : (
                <>
                  <DownloadIcon className="w-6 h-6" />
                  دانلود اپلیکیشن اندروید
                  {sizeMb ? (
                    <span className="text-white/70 text-sm font-normal">
                      ({sizeMb} MB)
                    </span>
                  ) : null}
                </>
              )}
            </button>
          </a>

          <div className="flex items-center justify-center gap-1.5 mt-2">
            <Shield className="w-3.5 h-3.5 text-muted-foreground" />
            <p className="text-muted-foreground text-xs text-center">
              فایل APK مستقیم از سرور شیوافر آکادمی — امن و بهینه
            </p>
          </div>
        </motion.div>

        {/* Features */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.2 }}
          className="bg-card border border-border rounded-2xl p-5 mb-6"
        >
          <h2 className="font-bold text-foreground mb-4 flex items-center gap-2">
            <Globe className="w-5 h-5 text-primary" />
            امکانات اپلیکیشن
          </h2>
          <div className="space-y-2.5">
            {FEATURES.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                <span className="text-sm text-foreground">{f}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Install steps */}
        <motion.div
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 0.25 }}
          className="mb-6"
        >
          <h2 className="font-bold text-foreground mb-4">مراحل نصب</h2>
          <div className="space-y-3">
            {INSTALL_STEPS.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={i}
                  className="flex items-start gap-4 bg-card border border-border rounded-xl p-4"
                >
                  <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                    <Icon className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="w-5 h-5 rounded-full bg-primary text-white text-xs font-black flex items-center justify-center shrink-0">
                        {i + 1}
                      </span>
                      <p className="font-bold text-sm text-foreground">{step.title}</p>
                    </div>
                    <p className="text-muted-foreground text-xs leading-relaxed">
                      {step.desc}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Back */}
        <Link href="/">
          <button className="w-full h-12 bg-card border border-border text-foreground rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-accent active:scale-95 transition-all">
            <ArrowRight className="w-5 h-5" />
            بازگشت به صفحه اصلی
          </button>
        </Link>
      </div>
    </motion.div>
  );
}
