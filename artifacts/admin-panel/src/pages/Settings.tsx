import { useEffect, useState } from "react";
import { get, put, uploadFile } from "@/lib/api";
import { Upload, Save, Eye, EyeOff, MessageCircle, Phone, CreditCard, MessageSquare, ShoppingBag } from "lucide-react";

// helper: convert stored seconds → display minutes (rounded to 1 decimal)
function spSec(val: string | null | undefined, defaultSec: number): number {
  const s = parseInt(val ?? "");
  return isNaN(s) || s <= 0 ? +(defaultSec / 60).toFixed(1) : +(s / 60).toFixed(1);
}

interface SiteSettings {
  siteName?: string | null; logoUrl?: string | null; primaryColor?: string | null;
  heroTitle?: string | null; heroSubtitle?: string | null; aboutText?: string | null;
  footerText?: string | null; bannerImageUrl?: string | null;
  avalai_api_key?: string | null; chatbot_model?: string | null;
  elevenlabs_api_key?: string | null; elevenlabs_voice_id?: string | null;
  openai_api_key?: string | null;
  chatbot_enabled?: string | null;
  voice_call_enabled?: string | null;
  voice_call_blocked_course_ids?: string | null;
  voice_call_course_filter_mode?: string | null;
  voice_call_course_filter_ids?: string | null;
  chatbot_course_filter_mode?: string | null;
  chatbot_course_filter_ids?: string | null;
  site_url?: string | null;
  zarinpal_merchant_id?: string | null;
  zarinpal_sandbox?: string | null;
  sms_api_key?: string | null;
  sms_from?: string | null;
  sms_pattern_code?: string | null;
  ippanel_api_key?: string | null;
  // Social Proof timing (seconds stored, minutes shown)
  sp_first_delay_min?: string | null;
  sp_first_delay_max?: string | null;
  sp_interval_min?: string | null;
  sp_interval_max?: string | null;
}

interface CourseOption {
  id: number;
  title: string;
  isPublished: boolean;
}

function SecretInput({ label, value, onChange, placeholder, hint }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; hint?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input
          className="input flex-1 font-mono text-xs"
          type={show ? "text" : "password"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
        />
        <button type="button" onClick={() => setShow(s => !s)} className="btn-secondary px-3">
          {show ? <EyeOff size={15} /> : <Eye size={15} />}
        </button>
      </div>
      {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function ToggleSwitch({ label, description, icon, value, onChange }: {
  label: string; description?: string; icon?: React.ReactNode;
  value: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <div className="flex items-center gap-2.5 min-w-0">
        {icon && <span className="shrink-0 text-muted-foreground">{icon}</span>}
        <div className="min-w-0">
          <p className="font-medium text-sm">{label}</p>
          {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className="shrink-0 relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 focus:outline-none"
        style={{ background: value ? "#22c55e" : "rgba(100,100,120,0.4)", border: "1px solid " + (value ? "#16a34a" : "rgba(255,255,255,0.15)") }}
      >
        <span
          className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform duration-200"
          style={{ transform: value ? "translateX(22px)" : "translateX(3px)" }}
        />
      </button>
    </div>
  );
}

type FilterMode = "off" | "block" | "allow";

function CourseFilterSelector({ label, courses, mode, selectedIds, onModeChange, onIdsChange }: {
  label: string;
  courses: CourseOption[];
  mode: FilterMode;
  selectedIds: number[];
  onModeChange: (m: FilterMode) => void;
  onIdsChange: (ids: number[]) => void;
}) {
  const toggle = (id: number) => {
    if (selectedIds.includes(id)) onIdsChange(selectedIds.filter(x => x !== id));
    else onIdsChange([...selectedIds, id]);
  };

  const modeColor = mode === "block" ? "#ef4444" : mode === "allow" ? "#22c55e" : "rgba(255,255,255,0.3)";
  const accentClass = mode === "block" ? "accent-red-500" : "accent-green-500";

  return (
    <div className="space-y-3">
      {/* Mode selector */}
      <div className="flex gap-2">
        {(["off", "allow", "block"] as FilterMode[]).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onModeChange(m)}
            className="flex-1 py-1.5 px-2 rounded-lg text-xs font-medium transition-all"
            style={{
              background: mode === m ? (m === "off" ? "rgba(255,255,255,0.12)" : m === "allow" ? "rgba(34,197,94,0.18)" : "rgba(239,68,68,0.18)") : "transparent",
              border: mode === m ? `1px solid ${modeColor}` : "1px solid rgba(255,255,255,0.08)",
              color: mode === m ? (m === "off" ? "#fff" : m === "allow" ? "#4ade80" : "#f87171") : "rgba(255,255,255,0.4)",
            }}
          >
            {m === "off" ? "🔓 غیرفعال" : m === "allow" ? "✅ فقط دارندگان" : "🚫 عدم نمایش"}
          </button>
        ))}
      </div>

      {/* Description */}
      {mode === "allow" && (
        <p className="text-xs" style={{ color: "#4ade80" }}>
          ✅ فقط کاربرانی که <strong>حداقل یکی</strong> از دوره‌های زیر را دارند می‌توانند از {label} استفاده کنند.
        </p>
      )}
      {mode === "block" && (
        <p className="text-xs" style={{ color: "#f87171" }}>
          🚫 ویجت چت‌بات و کارت سارا برای این کاربران فقط در پروفایل و صفحات اصلی پنهان می‌شود.
        </p>
      )}

      {/* Course list (only visible when mode is not off) */}
      {mode !== "off" && (
        <div className="space-y-2 pt-1">
          {courses.length === 0 && (
            <p className="text-xs text-muted-foreground">هیچ دوره‌ای ثبت نشده است.</p>
          )}
          {courses.map(c => {
            const selected = selectedIds.includes(c.id);
            const borderColor = selected ? (mode === "allow" ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.5)") : "rgba(255,255,255,0.07)";
            const bgColor = selected ? (mode === "allow" ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)") : "transparent";
            return (
              <label
                key={c.id}
                className="flex items-center gap-3 cursor-pointer p-2.5 rounded-lg transition-colors"
                style={{ border: `1px solid ${borderColor}`, background: bgColor }}
              >
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => toggle(c.id)}
                  className={`${accentClass} w-4 h-4 shrink-0`}
                />
                <span className="text-sm flex-1 min-w-0 truncate">{c.title}</span>
                {!c.isPublished && (
                  <span className="text-xs text-muted-foreground shrink-0 px-1.5 py-0.5 rounded" style={{ background: "rgba(255,255,255,0.06)" }}>
                    پیش‌نویس
                  </span>
                )}
              </label>
            );
          })}
          {selectedIds.length === 0 && mode !== "off" && (
            <p className="text-xs text-muted-foreground">هیچ دوره‌ای انتخاب نشده — فیلتر بی‌اثر است.</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<SiteSettings>({});
  const [courses, setCourses] = useState<CourseOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    Promise.all([
      get<SiteSettings>("/admin/settings"),
      get<CourseOption[]>("/admin/courses").catch(() => [] as CourseOption[]),
    ]).then(([data, courseList]) => {
      setSettings(data);
      setCourses(courseList);
      setLoading(false);
    });
  }, []);

  function set(key: keyof SiteSettings, value: string) {
    setSettings(prev => ({ ...prev, [key]: value || null }));
  }

  function setBool(key: "chatbot_enabled" | "voice_call_enabled", value: boolean) {
    setSettings(prev => ({ ...prev, [key]: value ? "true" : "false" }));
  }

  function getBool(key: "chatbot_enabled" | "voice_call_enabled"): boolean {
    const v = settings[key];
    if (v === null || v === undefined) return true;
    return v !== "false";
  }

  function getFilterMode(key: "voice_call_course_filter_mode" | "chatbot_course_filter_mode"): FilterMode {
    const v = settings[key];
    if (v === "allow" || v === "block") return v;
    // legacy: if old voice_call_blocked_course_ids has values, treat as block
    if (key === "voice_call_course_filter_mode" && !v) {
      try {
        const old = JSON.parse(settings.voice_call_blocked_course_ids ?? "[]");
        if (Array.isArray(old) && old.length > 0) return "block";
      } catch { /* ignore */ }
    }
    return "off";
  }

  function setFilterMode(key: "voice_call_course_filter_mode" | "chatbot_course_filter_mode", mode: FilterMode) {
    setSettings(prev => ({ ...prev, [key]: mode }));
  }

  function getFilterIds(key: "voice_call_course_filter_ids" | "chatbot_course_filter_ids", legacyKey?: "voice_call_blocked_course_ids"): number[] {
    try {
      const v = settings[key];
      if (v) {
        const parsed = JSON.parse(v);
        if (Array.isArray(parsed)) return parsed;
      }
      if (legacyKey) {
        const old = JSON.parse(settings[legacyKey] ?? "[]");
        if (Array.isArray(old)) return old;
      }
    } catch { /* ignore */ }
    return [];
  }

  function setFilterIds(key: "voice_call_course_filter_ids" | "chatbot_course_filter_ids", ids: number[]) {
    setSettings(prev => ({ ...prev, [key]: JSON.stringify(ids) }));
  }

  async function upload(key: "logoUrl" | "bannerImageUrl", file: File) {
    setUploading(key);
    try { const r = await uploadFile("/upload/image", file); setSettings(p => ({ ...p, [key]: r.url })); }
    catch (e: any) { alert(e.message); } finally { setUploading(null); }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setSaved(false);
    try { await put("/admin/settings", settings); setSaved(true); setTimeout(() => setSaved(false), 3000); }
    catch (e: any) { alert(e.message); } finally { setSaving(false); }
  }

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-5 max-w-xl">
      <h1 className="text-xl font-bold">تنظیمات سایت</h1>

      <form onSubmit={save} className="space-y-5">

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm">⚡ فعال / غیرفعال کردن ویژگی‌ها</h2>
          <p className="text-xs text-muted-foreground">چت‌بات و تماس صوتی سارا را به‌صورت مستقل روشن یا خاموش کنید.</p>
          <div className="space-y-3 pt-1">
            <ToggleSwitch
              label="چت‌بات"
              description={getBool("chatbot_enabled") ? "فعال — کاربران می‌توانند با پشتیبانی چت کنند" : "غیرفعال — پیام آفلاین نمایش داده می‌شود"}
              icon={<MessageCircle size={16} />}
              value={getBool("chatbot_enabled")}
              onChange={v => setBool("chatbot_enabled", v)}
            />
            <div style={{ height: 1, background: "rgba(255,255,255,0.07)" }} />
            <ToggleSwitch
              label="تماس صوتی سارا"
              description={getBool("voice_call_enabled") ? "فعال — کاربران می‌توانند با سارا تماس بگیرند" : "غیرفعال — پیام آفلاین نمایش داده می‌شود"}
              icon={<Phone size={16} />}
              value={getBool("voice_call_enabled")}
              onChange={v => setBool("voice_call_enabled", v)}
            />
          </div>
        </div>

        {/* ── Voice Call Course Filter ─────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <Phone size={18} className="text-violet-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">فیلتر دوره — تماس صوتی سارا</h2>
              <p className="text-xs text-muted-foreground mt-1">
                مشخص کنید تماس صوتی سارا برای چه کاربرانی (بر اساس دوره) فعال باشد.
              </p>
            </div>
          </div>
          <CourseFilterSelector
            label="تماس صوتی سارا"
            courses={courses}
            mode={getFilterMode("voice_call_course_filter_mode")}
            selectedIds={getFilterIds("voice_call_course_filter_ids", "voice_call_blocked_course_ids")}
            onModeChange={m => setFilterMode("voice_call_course_filter_mode", m)}
            onIdsChange={ids => setFilterIds("voice_call_course_filter_ids", ids)}
          />
        </div>

        {/* ── Chatbot Course Filter ─────────────────────────────────────── */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <MessageCircle size={18} className="text-violet-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">فیلتر دوره — چت‌بات</h2>
              <p className="text-xs text-muted-foreground mt-1">
                مشخص کنید چت‌بات برای چه کاربرانی (بر اساس دوره) فعال باشد.
              </p>
            </div>
          </div>
          <CourseFilterSelector
            label="چت‌بات"
            courses={courses}
            mode={getFilterMode("chatbot_course_filter_mode")}
            selectedIds={getFilterIds("chatbot_course_filter_ids")}
            onModeChange={m => setFilterMode("chatbot_course_filter_mode", m)}
            onIdsChange={ids => setFilterIds("chatbot_course_filter_ids", ids)}
          />
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm">اطلاعات کلی</h2>
          <div><label className="label">نام سایت</label><input className="input" value={settings.siteName ?? ""} onChange={e => set("siteName", e.target.value)} placeholder="شیوافر آکادمی" /></div>
          <div>
            <label className="label">لوگو</label>
            <div className="flex gap-2">
              <input className="input flex-1 text-xs" placeholder="آدرس URL لوگو" value={settings.logoUrl ?? ""} onChange={e => set("logoUrl", e.target.value)} />
              <label className="btn-secondary cursor-pointer flex items-center gap-1 text-sm px-3">
                <Upload size={14} /> {uploading === "logoUrl" ? "..." : "آپلود"}
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload("logoUrl", e.target.files[0])} />
              </label>
            </div>
            {settings.logoUrl && <img src={settings.logoUrl} className="mt-2 h-14 object-contain" />}
          </div>
          <div><label className="label">رنگ اصلی (hex)</label><div className="flex gap-2 items-center"><input type="color" value={settings.primaryColor ?? "#6366f1"} onChange={e => set("primaryColor", e.target.value)} className="w-10 h-10 rounded cursor-pointer border border-border" /><input className="input flex-1" value={settings.primaryColor ?? ""} onChange={e => set("primaryColor", e.target.value)} placeholder="#6366f1" /></div></div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm">صفحه اصلی</h2>
          <div><label className="label">عنوان هدر</label><input className="input" value={settings.heroTitle ?? ""} onChange={e => set("heroTitle", e.target.value)} /></div>
          <div><label className="label">زیرعنوان هدر</label><input className="input" value={settings.heroSubtitle ?? ""} onChange={e => set("heroSubtitle", e.target.value)} /></div>
          <div>
            <label className="label">بنر</label>
            <div className="flex gap-2">
              <input className="input flex-1 text-xs" value={settings.bannerImageUrl ?? ""} onChange={e => set("bannerImageUrl", e.target.value)} />
              <label className="btn-secondary cursor-pointer flex items-center gap-1 text-sm px-3">
                <Upload size={14} /> {uploading === "bannerImageUrl" ? "..." : "آپلود"}
                <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload("bannerImageUrl", e.target.files[0])} />
              </label>
            </div>
            {settings.bannerImageUrl && <img src={settings.bannerImageUrl} className="mt-2 h-24 w-full object-cover rounded-lg" />}
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm">متون</h2>
          <div><label className="label">درباره ما</label><textarea className="input min-h-[100px] resize-none" value={settings.aboutText ?? ""} onChange={e => set("aboutText", e.target.value)} /></div>
          <div><label className="label">متن فوتر</label><input className="input" value={settings.footerText ?? ""} onChange={e => set("footerText", e.target.value)} /></div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm">🤖 هوش مصنوعی — چت‌بات</h2>
          <SecretInput
            label="کلید API — Avalai (چت‌بات)"
            value={settings.avalai_api_key ?? ""}
            onChange={v => set("avalai_api_key", v)}
            placeholder="sk-..."
            hint="از پنل Avalai.ir دریافت کنید — برای پاسخ‌دهی هوشمند چت‌بات"
          />
          <div>
            <label className="label">مدل هوش مصنوعی چت‌بات</label>
            <input
              className="input font-mono text-sm"
              value={settings.chatbot_model ?? ""}
              onChange={e => set("chatbot_model", e.target.value)}
              placeholder="gpt-4o"
            />
            <p className="text-xs text-muted-foreground mt-1">پیش‌فرض: gpt-4o — مقادیر مثال: gpt-4o-mini، gpt-3.5-turbo</p>
          </div>
        </div>

        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <h2 className="font-semibold text-sm">🎙️ هوش مصنوعی — تماس صوتی سارا</h2>
          <SecretInput
            label="کلید API — OpenAI (تشخیص گفتار Whisper)"
            value={settings.openai_api_key ?? ""}
            onChange={v => set("openai_api_key", v)}
            placeholder="sk-..."
            hint="از platform.openai.com دریافت کنید — برای تبدیل صدا به متن"
          />
          <SecretInput
            label="کلید API — ElevenLabs (صدای سارا)"
            value={settings.elevenlabs_api_key ?? ""}
            onChange={v => set("elevenlabs_api_key", v)}
            placeholder="el-..."
            hint="از ElevenLabs.io دریافت کنید — برای تبدیل متن به صدا"
          />
          <div>
            <label className="label">شناسه صدای سارا (Voice ID)</label>
            <input
              className="input font-mono text-sm"
              value={settings.elevenlabs_voice_id ?? ""}
              onChange={e => set("elevenlabs_voice_id", e.target.value)}
              placeholder="pjcYQlDFKMbcOUp6F5GD"
            />
            <p className="text-xs text-muted-foreground mt-1">پیش‌فرض: pjcYQlDFKMbcOUp6F5GD — از پنل ElevenLabs قابل تغییر است</p>
          </div>
        </div>

        {/* ── درگاه پرداخت زرین‌پال ── */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <CreditCard size={18} className="text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">💳 درگاه پرداخت — زرین‌پال</h2>
              <p className="text-xs text-muted-foreground mt-1">
                کد مرچنت زرین‌پال را وارد کنید تا پرداخت‌های آنلاین فعال شود.
                اگر این فیلد خالی بماند، مقدار از متغیر محیطی <code className="bg-muted px-1 rounded text-[11px]">ZARINPAL_MERCHANT_ID</code> استفاده می‌شود.
              </p>
            </div>
          </div>
          <div>
            <label className="label">آدرس دامنه سایت (Callback Domain)</label>
            <input
              className="input"
              value={settings.site_url ?? ""}
              onChange={e => set("site_url", e.target.value)}
              placeholder="shivafaracademy.ir"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-1">دامنه‌ای که در پنل زرین‌پال ثبت کرده‌اید — بدون https:// — مثال: <code className="bg-muted px-1 rounded text-[11px]">shivafaracademy.ir</code></p>
          </div>
          <SecretInput
            label="کد مرچنت زرین‌پال (Merchant ID)"
            value={settings.zarinpal_merchant_id ?? ""}
            onChange={v => set("zarinpal_merchant_id", v)}
            placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
            hint="از پنل زرین‌پال → تنظیمات → درگاه پرداخت دریافت کنید"
          />
          <ToggleSwitch
            label="حالت آزمایشی (Sandbox)"
            description="فقط برای تست — تراکنش‌های واقعی انجام نمی‌شود"
            value={settings.zarinpal_sandbox === "true"}
            onChange={v => set("zarinpal_sandbox", v ? "true" : "false")}
          />
        </div>

        {/* ── پیامک ── */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <MessageSquare size={18} className="text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">📱 سرویس پیامک — مدیرپیامک</h2>
              <p className="text-xs text-muted-foreground mt-1">
                برای ارسال کد OTP و پیامک‌های سیستمی استفاده می‌شود.
              </p>
            </div>
          </div>
          <SecretInput
            label="کلید API — مدیرپیامک"
            value={settings.sms_api_key ?? ""}
            onChange={v => set("sms_api_key", v)}
            placeholder="کلید API مدیرپیامک"
            hint="از پنل modir-payamak.ir دریافت کنید"
          />
          <div>
            <label className="label">شماره فرستنده</label>
            <input
              className="input font-mono text-sm"
              value={settings.sms_from ?? ""}
              onChange={e => set("sms_from", e.target.value)}
              placeholder="300xxxxx"
              dir="ltr"
            />
          </div>
          <div>
            <label className="label">کد الگوی پیامک (Pattern Code)</label>
            <input
              className="input font-mono text-sm"
              value={settings.sms_pattern_code ?? ""}
              onChange={e => set("sms_pattern_code", e.target.value)}
              placeholder="کد الگوی OTP"
              dir="ltr"
            />
            <p className="text-xs text-muted-foreground mt-1">کد الگو برای ارسال رمز یکبارمصرف</p>
          </div>
        </div>

        {/* ── IPPanel (fallback پیامک) ── */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <MessageSquare size={18} className="text-sky-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">📱 سرویس پیامک — آی‌پی‌پنل (پشتیبان)</h2>
              <p className="text-xs text-muted-foreground mt-1">
                اگر مدیرپیامک در دسترس نبود، به‌عنوان گزینه پشتیبان استفاده می‌شود.
              </p>
            </div>
          </div>
          <SecretInput
            label="کلید API — آی‌پی‌پنل"
            value={settings.ippanel_api_key ?? ""}
            onChange={v => set("ippanel_api_key", v)}
            placeholder="کلید API آی‌پی‌پنل"
            hint="از پنل ippanel.com دریافت کنید"
          />
        </div>

        {/* ── Social Proof Timing ── */}
        <div className="bg-card rounded-xl border border-border p-5 space-y-4">
          <div className="flex items-start gap-2.5">
            <ShoppingBag size={18} className="text-yellow-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="font-semibold text-sm">📣 تنظیم بازه زمانی — پیام Social Proof</h2>
              <p className="text-xs text-muted-foreground mt-1">
                پیام‌های «در لحظات اخیر X نفر این دوره را خریداری کردند» — مقادیر را به دقیقه وارد کنید
              </p>
            </div>
          </div>

          <div className="bg-muted/20 border border-border rounded-lg p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">نحوه کارکرد:</p>
            <ul className="space-y-0.5 list-disc list-inside">
              <li>پس از ورود کاربر، <strong>اولین پیام</strong> با تأخیر تصادفی بین حداقل و حداکثر بازه اول نمایش داده می‌شود</li>
              <li><strong>پیام‌های بعدی</strong> با فاصله تصادفی بین حداقل و حداکثر بازه چرخه‌ای برنامه‌ریزی می‌شوند</li>
              <li>بستن پیام چرخه را متوقف <strong>نمی‌کند</strong> — فقط پیام فعلی بسته می‌شود</li>
            </ul>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">تأخیر اول — حداقل (دقیقه)</label>
              <input
                className="input"
                type="number"
                min="0.5"
                max="60"
                step="0.5"
                value={spSec(settings.sp_first_delay_min, 90)}
                onChange={e => set("sp_first_delay_min", String(Math.round(parseFloat(e.target.value) * 60)))}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">پیش‌فرض: ۱.۵ دقیقه</p>
            </div>
            <div>
              <label className="label">تأخیر اول — حداکثر (دقیقه)</label>
              <input
                className="input"
                type="number"
                min="0.5"
                max="60"
                step="0.5"
                value={spSec(settings.sp_first_delay_max, 180)}
                onChange={e => set("sp_first_delay_max", String(Math.round(parseFloat(e.target.value) * 60)))}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">پیش‌فرض: ۳ دقیقه</p>
            </div>
            <div>
              <label className="label">بازه چرخه‌ای — حداقل (دقیقه)</label>
              <input
                className="input"
                type="number"
                min="0.5"
                max="120"
                step="0.5"
                value={spSec(settings.sp_interval_min, 60)}
                onChange={e => set("sp_interval_min", String(Math.round(parseFloat(e.target.value) * 60)))}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">پیش‌فرض: ۱ دقیقه</p>
            </div>
            <div>
              <label className="label">بازه چرخه‌ای — حداکثر (دقیقه)</label>
              <input
                className="input"
                type="number"
                min="1"
                max="120"
                step="0.5"
                value={spSec(settings.sp_interval_max, 600)}
                onChange={e => set("sp_interval_max", String(Math.round(parseFloat(e.target.value) * 60)))}
                dir="ltr"
              />
              <p className="text-xs text-muted-foreground mt-1">پیش‌فرض: ۱۰ دقیقه</p>
            </div>
          </div>
        </div>

        <button type="submit" disabled={saving} className="btn-primary flex items-center gap-2 w-full justify-center">
          <Save size={16} /> {saving ? "در حال ذخیره..." : "ذخیره تنظیمات"}
        </button>
        {saved && <p className="text-green-600 text-sm text-center">✓ تنظیمات ذخیره شد</p>}
      </form>
    </div>
  );
}
