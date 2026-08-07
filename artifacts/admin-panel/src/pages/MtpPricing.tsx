import { useEffect, useState } from "react";
import { get, put } from "@/lib/api";
import { Tag, Save, Percent, Clock, BadgeDollarSign } from "lucide-react";

interface Variant { key: string; label: string; fullPrice: number; floorPrice: number; sortOrder: number; }
interface Config {
  courseId: number | null;
  courseId2: number | null;
  variants: Variant[];
  windows: { firstWindowSec: number; recurringWindowSec: number; recurringMinDays: number; recurringMaxDays: number };
  global: { enabled: boolean; percent: number; endsAt: string | null };
}

function secToParts(sec: number) {
  return { d: Math.floor(sec / 86400), h: Math.floor((sec % 86400) / 3600), m: Math.floor((sec % 3600) / 60) };
}
function partsToSec(d: number, h: number, m: number) { return d * 86400 + h * 3600 + m * 60; }

function fa(n: number) { return n.toLocaleString("fa-IR"); }

export default function MtpPricing() {
  const [cfg, setCfg] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingMsg, setSavingMsg] = useState("");

  // local editable state
  const [courseId, setCourseId] = useState("");
  const [courseId2, setCourseId2] = useState("");
  const [variants, setVariants] = useState<Variant[]>([]);
  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalPercent, setGlobalPercent] = useState(0);
  const [globalEndsAt, setGlobalEndsAt] = useState("");
  const [firstW, setFirstW] = useState({ d: 1, h: 19, m: 21 });
  const [recurW, setRecurW] = useState({ d: 1, h: 19, m: 21 });
  const [minDays, setMinDays] = useState(20);
  const [maxDays, setMaxDays] = useState(90);

  async function load() {
    setLoading(true);
    const data = await get<Config>("/admin/mtp/config");
    setCfg(data);
    setCourseId(data.courseId ? String(data.courseId) : "");
    setCourseId2(data.courseId2 ? String(data.courseId2) : "");
    setVariants(data.variants);
    setGlobalEnabled(data.global.enabled);
    setGlobalPercent(data.global.percent);
    setGlobalEndsAt(data.global.endsAt ? new Date(data.global.endsAt).toISOString().slice(0, 16) : "");
    setFirstW(secToParts(data.windows.firstWindowSec));
    setRecurW(secToParts(data.windows.recurringWindowSec));
    setMinDays(data.windows.recurringMinDays);
    setMaxDays(data.windows.recurringMaxDays);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function flash(msg: string) { setSavingMsg(msg); setTimeout(() => setSavingMsg(""), 2500); }

  async function saveCourse() {
    await put("/admin/mtp/course", {
      courseId: Number(courseId),
      courseId2: courseId2 ? Number(courseId2) : null,
    });
    flash("دوره‌های MTP ذخیره شدند");
  }
  async function saveVariants() {
    await put("/admin/mtp/variants", {
      variants: variants.map(v => ({ key: v.key, label: v.label, fullPrice: v.fullPrice, floorPrice: v.floorPrice })),
    });
    flash("قیمت گزینه‌ها ذخیره شد");
  }
  async function saveGlobal() {
    await put("/admin/mtp/global", {
      enabled: globalEnabled,
      percent: globalPercent,
      endsAt: globalEndsAt ? new Date(globalEndsAt).toISOString() : null,
    });
    flash("تخفیف سراسری ذخیره شد");
  }
  async function saveWindows() {
    await put("/admin/mtp/windows", {
      firstWindowSec: partsToSec(firstW.d, firstW.h, firstW.m),
      recurringWindowSec: partsToSec(recurW.d, recurW.h, recurW.m),
      recurringMinDays: minDays,
      recurringMaxDays: maxDays,
    });
    flash("تنظیمات زمان‌بندی ذخیره شد");
  }

  function updateVariant(key: string, field: "label" | "fullPrice" | "floorPrice", value: string) {
    setVariants(prev => prev.map(v => v.key === key
      ? { ...v, [field]: field === "label" ? value : Number(value) }
      : v));
  }

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;
  if (!cfg) return null;

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2"><Tag size={20} /> قیمت‌گذاری و تخفیف دوره MTP</h1>
        {savingMsg && <span className="text-sm text-green-600 font-medium">{savingMsg}</span>}
      </div>

      {/* Course selection */}
      <section className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-2"><BadgeDollarSign size={16} /> دوره‌های MTP</h2>
        <p className="text-xs text-muted-foreground">شناسه دوره‌هایی که سیستم تخفیف روی آن‌ها اعمال می‌شود. هر دو دوره از همان جدول قیمت و پنجره تخفیف استفاده می‌کنند.</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">دوره اول — اینستاگرام / پلتفرم‌های خارجی</label>
            <input className="input" type="number" value={courseId} onChange={e => setCourseId(e.target.value)} placeholder="مثلاً 5" />
          </div>
          <div>
            <label className="label">دوره دوم — پلتفرم‌های داخلی (اختیاری)</label>
            <input className="input" type="number" value={courseId2} onChange={e => setCourseId2(e.target.value)} placeholder="مثلاً 7" />
          </div>
        </div>
        <button onClick={saveCourse} className="btn-primary flex items-center gap-1"><Save size={15} /> ذخیره دوره‌ها</button>
      </section>

      {/* Variants */}
      <section className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h2 className="font-bold text-sm">گزینه‌های خرید (۴ مورد)</h2>
        <p className="text-xs text-muted-foreground">قیمت کامل و کف قیمت (قیمت در تخفیف ۸۰٪) برای هر گزینه.</p>
        <div className="space-y-3">
          {variants.map(v => (
            <div key={v.key} className="rounded-lg border border-border p-3 space-y-2">
              <input className="input text-sm font-medium" value={v.label} onChange={e => updateVariant(v.key, "label", e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">قیمت کامل (تومان)</label>
                  <input className="input" type="number" value={v.fullPrice} onChange={e => updateVariant(v.key, "fullPrice", e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-0.5">{fa(v.fullPrice)} تومان</p>
                </div>
                <div>
                  <label className="label text-xs">کف قیمت / ۸۰٪ (تومان)</label>
                  <input className="input" type="number" value={v.floorPrice} onChange={e => updateVariant(v.key, "floorPrice", e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-0.5">{fa(v.floorPrice)} تومان</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <button onClick={saveVariants} className="btn-primary flex items-center gap-1"><Save size={15} /> ذخیره قیمت‌ها</button>
      </section>

      {/* Global discount */}
      <section className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-2"><Percent size={16} /> تخفیف سراسری (برای همه کاربران)</h2>
        <p className="text-xs text-muted-foreground">وقتی فعال باشد، این درصد تخفیف به همه کاربران (صرف‌نظر از تخفیف شخصی) نمایش داده می‌شود.</p>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={globalEnabled} onChange={e => setGlobalEnabled(e.target.checked)} className="w-4 h-4 rounded" />
          فعال کردن تخفیف سراسری
        </label>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">درصد تخفیف (۰ تا ۱۰۰)</label>
            <input className="input" type="number" min={0} max={100} value={globalPercent} onChange={e => setGlobalPercent(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">تاریخ پایان (اختیاری)</label>
            <input className="input" type="datetime-local" value={globalEndsAt} onChange={e => setGlobalEndsAt(e.target.value)} />
          </div>
        </div>
        <button onClick={saveGlobal} className="btn-primary flex items-center gap-1"><Save size={15} /> ذخیره تخفیف سراسری</button>
      </section>

      {/* Windows */}
      <section className="bg-card rounded-xl border border-border p-5 space-y-3">
        <h2 className="font-bold text-sm flex items-center gap-2"><Clock size={16} /> زمان‌بندی تخفیف‌ها</h2>
        <div className="space-y-2">
          <label className="label">مدت تخفیف اولین ورود (۸۰٪)</label>
          <div className="grid grid-cols-3 gap-2">
            <div><span className="text-xs text-muted-foreground">روز</span><input className="input" type="number" min={0} value={firstW.d} onChange={e => setFirstW(p => ({ ...p, d: Number(e.target.value) }))} /></div>
            <div><span className="text-xs text-muted-foreground">ساعت</span><input className="input" type="number" min={0} max={23} value={firstW.h} onChange={e => setFirstW(p => ({ ...p, h: Number(e.target.value) }))} /></div>
            <div><span className="text-xs text-muted-foreground">دقیقه</span><input className="input" type="number" min={0} max={59} value={firstW.m} onChange={e => setFirstW(p => ({ ...p, m: Number(e.target.value) }))} /></div>
          </div>
        </div>
        <div className="space-y-2">
          <label className="label">مدت هر تخفیف دوره‌ای (تکرارشونده)</label>
          <div className="grid grid-cols-3 gap-2">
            <div><span className="text-xs text-muted-foreground">روز</span><input className="input" type="number" min={0} value={recurW.d} onChange={e => setRecurW(p => ({ ...p, d: Number(e.target.value) }))} /></div>
            <div><span className="text-xs text-muted-foreground">ساعت</span><input className="input" type="number" min={0} max={23} value={recurW.h} onChange={e => setRecurW(p => ({ ...p, h: Number(e.target.value) }))} /></div>
            <div><span className="text-xs text-muted-foreground">دقیقه</span><input className="input" type="number" min={0} max={59} value={recurW.m} onChange={e => setRecurW(p => ({ ...p, m: Number(e.target.value) }))} /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">حداقل فاصله تا تخفیف بعدی (روز)</label>
            <input className="input" type="number" min={1} value={minDays} onChange={e => setMinDays(Number(e.target.value))} />
          </div>
          <div>
            <label className="label">حداکثر فاصله تا تخفیف بعدی (روز)</label>
            <input className="input" type="number" min={1} value={maxDays} onChange={e => setMaxDays(Number(e.target.value))} />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">پس از پایان تخفیف اولیه، هر کاربر به‌صورت تصادفی هر {fa(minDays)} تا {fa(maxDays)} روز یک تخفیف جدید (۳۰٪ تا ۸۰٪، با تمایل به درصدهای بالا) دریافت می‌کند.</p>
        <button onClick={saveWindows} className="btn-primary flex items-center gap-1"><Save size={15} /> ذخیره زمان‌بندی</button>
      </section>
    </div>
  );
}
