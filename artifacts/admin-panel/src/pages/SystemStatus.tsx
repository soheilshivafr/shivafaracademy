import { useEffect, useState } from "react";
import { get } from "@/lib/api";
import { Link } from "wouter";
import {
  CheckCircle2, XCircle, AlertCircle, ExternalLink,
  Database, Bot, Brain, TrendingUp, Settings, Zap,
} from "lucide-react";

interface SystemStatusData {
  stats: {
    knowledgeBase: number;
    leadProfiles: number;
    advisorRequests: number;
    pushSubscriptions: number;
    chatMessages: number;
    users: number;
    publishedCourses: number;
    chatbotModel: string;
  };
  env: {
    vapid: boolean;
    elevenlabs: boolean;
    openai: boolean;
    zarinpal: boolean;
    jwt: boolean;
    sms: boolean;
    uploadDir: boolean;
  };
}

function StatusBadge({ ok, warn }: { ok: boolean; warn?: boolean }) {
  if (ok) return <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />;
  if (warn) return <AlertCircle size={16} className="text-amber-400 shrink-0" />;
  return <XCircle size={16} className="text-red-400 shrink-0" />;
}

function PhaseCard({
  icon: Icon,
  title,
  color,
  items,
}: {
  icon: React.ElementType;
  title: string;
  color: string;
  items: Array<{ label: string; ok: boolean; warn?: boolean; note?: string; href?: string }>;
}) {
  const allOk = items.every(i => i.ok);
  const hasWarning = !allOk && items.some(i => i.warn);
  return (
    <div className="bg-card rounded-xl border border-border overflow-hidden">
      <div className={`px-4 py-3 border-b border-border flex items-center gap-2 ${color}`}>
        <Icon size={16} />
        <h3 className="font-semibold text-sm">{title}</h3>
        <span className="mr-auto">
          {allOk
            ? <span className="text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">کامل</span>
            : hasWarning
            ? <span className="text-xs bg-amber-500/20 text-amber-400 px-2 py-0.5 rounded-full">نیاز به توجه</span>
            : <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full">ناقص</span>}
        </span>
      </div>
      <div className="divide-y divide-border">
        {items.map((item, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-2.5">
            <StatusBadge ok={item.ok} warn={item.warn} />
            <div className="flex-1 min-w-0">
              <span className="text-sm">{item.label}</span>
              {item.note && <span className="text-xs text-muted-foreground mr-2">{item.note}</span>}
            </div>
            {item.href && (
              <Link href={item.href}>
                <span className="text-xs text-violet-400 hover:underline shrink-0">تنظیم ←</span>
              </Link>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

const MASTER_SCRIPT_SECTIONS = [
  { num: 1, title: "Lead Scoring — امتیازبندی سرنخ‌ها" },
  { num: 2, title: "اولویت محصولات و پاسخ اعتراضات (پرامپت)" },
  { num: 3, title: "Auto Follow-up Engine — پیام‌های خودکار" },
  { num: 4, title: "قوانین مشاور و تأمین مالی (پرامپت)" },
  { num: 5, title: "اطلاعات ممنوعه (پرامپت)" },
  { num: 6, title: "آنالیتیک ادمین — قیف فروش" },
  { num: 7, title: "ساختار پایگاه دانش" },
  { num: 8, title: "هویت مشاور سارا (پرامپت)" },
  { num: 9, title: "DB Schema — جداول DB" },
  { num: 10, title: "فازهای پیاده‌سازی (این صفحه)" },
];

export default function SystemStatus() {
  const [data, setData] = useState<SystemStatusData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    get<SystemStatusData>("/admin/system/status")
      .then(setData)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="flex justify-center py-20"><div className="loader" /></div>;
  }
  if (!data) {
    return <p className="text-center text-muted-foreground py-10">خطا در بارگذاری وضعیت سیستم</p>;
  }

  const { stats, env } = data;

  const configScore = Object.values(env).filter(Boolean).length;
  const configTotal = Object.values(env).length;

  return (
    <div className="space-y-5 max-w-3xl">
      <div>
        <h1 className="text-xl font-bold">وضعیت پیاده‌سازی</h1>
        <p className="text-xs text-muted-foreground mt-0.5">Master Script — ۱۰ بخش · تنظیمات محیطی · آمار سیستم</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "کاربران", value: stats.users },
          { label: "دوره‌های منتشر", value: stats.publishedCourses },
          { label: "آیتم‌های دانش‌نامه", value: stats.knowledgeBase },
          { label: "سرنخ‌های ثبت‌شده", value: stats.leadProfiles },
        ].map(s => (
          <div key={s.label} className="bg-card rounded-xl border border-border p-4 text-center">
            <p className="text-2xl font-bold text-violet-400">{s.value}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Master Script Sections */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-violet-400">
          <Brain size={16} />
          <h3 className="font-semibold text-sm">Master Script — ۱۰ بخش</h3>
          <span className="mr-auto text-xs bg-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-full">
            ۱۰/۱۰ پیاده‌سازی شد ✓
          </span>
        </div>
        <div className="divide-y divide-border">
          {MASTER_SCRIPT_SECTIONS.map(s => (
            <div key={s.num} className="flex items-center gap-3 px-4 py-2.5">
              <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
              <span className="text-xs text-muted-foreground w-6 shrink-0">#{s.num}</span>
              <span className="text-sm">{s.title}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Phase 1 — Foundation */}
      <PhaseCard
        icon={Database}
        title="فاز ۱ — پایه‌های سیستم"
        color="text-blue-400"
        items={[
          { label: "پایگاه داده PostgreSQL", ok: true, note: "فعال" },
          { label: "احراز هویت OTP (SMS)", ok: env.sms, warn: !env.sms, note: env.sms ? "فعال" : "MODIRPAYAMAK_USERNAME تنظیم نشده", href: env.sms ? undefined : "/settings" },
          { label: "JWT Secret", ok: env.jwt, note: env.jwt ? "تنظیم شده" : "JWT_SECRET تنظیم نشده", href: env.jwt ? undefined : "/settings" },
          { label: "مسیر آپلود فایل", ok: env.uploadDir, warn: !env.uploadDir, note: env.uploadDir ? "فعال" : "UPLOAD_DIR پیش‌فرض استفاده میشه" },
          { label: `دوره‌های منتشر شده: ${stats.publishedCourses}`, ok: stats.publishedCourses > 0, warn: stats.publishedCourses === 0, note: stats.publishedCourses === 0 ? "هیچ دوره‌ای منتشر نشده" : undefined, href: stats.publishedCourses === 0 ? "/courses" : undefined },
          { label: "درگاه پرداخت زرین‌پال", ok: env.zarinpal, warn: !env.zarinpal, note: env.zarinpal ? "فعال" : "ZARINPAL_MERCHANT_ID تنظیم نشده", href: env.zarinpal ? undefined : "/settings" },
        ]}
      />

      {/* Phase 2 — AI */}
      <PhaseCard
        icon={Bot}
        title="فاز ۲ — قابلیت‌های هوش مصنوعی"
        color="text-violet-400"
        items={[
          { label: "چت‌بات سارا", ok: env.openai, warn: !env.openai, note: env.openai ? `مدل: ${stats.chatbotModel}` : "AVALAI_API_KEY یا OPENAI_API_KEY تنظیم نشده", href: env.openai ? "/chatbot" : "/settings" },
          { label: "مشاور صوتی سارا (ElevenLabs)", ok: env.elevenlabs, warn: !env.elevenlabs, note: env.elevenlabs ? "فعال" : "ELEVENLABS_API_KEY تنظیم نشده", href: env.elevenlabs ? undefined : "/settings" },
          { label: `پایگاه دانش: ${stats.knowledgeBase} آیتم`, ok: stats.knowledgeBase >= 10, warn: stats.knowledgeBase < 10, note: stats.knowledgeBase === 0 ? "خالی — نیاز به seed دارد" : stats.knowledgeBase < 10 ? "محتوای کم" : "کافی", href: "/chatbot" },
          { label: `مکالمات سارا: ${stats.chatMessages} پیام`, ok: true, note: `${stats.advisorRequests} درخواست مشاور` },
        ]}
      />

      {/* Phase 3 — Sales Automation */}
      <PhaseCard
        icon={TrendingUp}
        title="فاز ۳ — خودکارسازی فروش"
        color="text-emerald-400"
        items={[
          { label: "Lead Scoring (امتیازبندی سرنخ)", ok: true, note: `${stats.leadProfiles} پروفایل ثبت شده` },
          { label: "Auto Follow-up Engine", ok: true, note: "هر ۶ ساعت اجرا میشه" },
          { label: "داشبورد آنالیتیک (قیف فروش)", ok: true, href: "/" },
          { label: "مدیریت درخواست مشاور", ok: true, note: `${stats.advisorRequests} درخواست`, href: "/advisor-requests" },
        ]}
      />

      {/* Phase 4 — Push & Notifications */}
      <PhaseCard
        icon={Zap}
        title="فاز ۴ — اعلان‌های Push"
        color="text-amber-400"
        items={[
          { label: "VAPID Keys (Web Push)", ok: env.vapid, warn: !env.vapid, note: env.vapid ? "فعال" : "VAPID_PUBLIC_KEY و VAPID_PRIVATE_KEY تنظیم نشده", href: env.vapid ? undefined : "/settings" },
          { label: `اشتراک‌های Push فعال: ${stats.pushSubscriptions}`, ok: stats.pushSubscriptions > 0, warn: stats.pushSubscriptions === 0, note: stats.pushSubscriptions === 0 ? "هیچ کاربری push ندارد" : undefined },
          { label: "پیام مستقیم به کاربران", ok: true, href: "/push-notification" },
        ]}
      />

      {/* Config summary */}
      <div className="bg-card rounded-xl border border-border p-4 flex items-center gap-4">
        <Settings size={20} className="text-muted-foreground shrink-0" />
        <div className="flex-1">
          <p className="text-sm font-medium">تنظیمات محیطی</p>
          <p className="text-xs text-muted-foreground mt-0.5">{configScore} از {configTotal} متغیر محیطی تنظیم شده‌اند</p>
          <div className="h-1.5 bg-muted rounded-full mt-2 overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all"
              style={{ width: `${(configScore / configTotal) * 100}%` }}
            />
          </div>
        </div>
        <Link href="/settings">
          <span className="flex items-center gap-1 text-xs text-violet-400 hover:underline shrink-0">
            <ExternalLink size={12} /> تنظیمات
          </span>
        </Link>
      </div>
    </div>
  );
}
