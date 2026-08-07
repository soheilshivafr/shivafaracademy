import { useEffect, useState } from "react";
import { get, put } from "@/lib/api";

interface DiscountConfig {
  global: { enabled: boolean; percent: number; endsAt: string | null; active: boolean };
  windows: {
    enabled: boolean;
    firstWindowSec: number;
    recurringWindowSec: number;
    recurringMinDays: number;
    recurringMaxDays: number;
    firstWindowPercent: number;
    recurringMinPercent: number;
    recurringMaxPercent: number;
  };
}

function secToHMS(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return { d, h, m };
}
function hmsToSec(d: number, h: number, m: number) {
  return d * 86400 + h * 3600 + m * 60;
}

export function DiscountPanel({ type, id }: { type: "course" | "product"; id: number }) {
  const [cfg, setCfg] = useState<DiscountConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingGlobal, setSavingGlobal] = useState(false);
  const [savingWin, setSavingWin] = useState(false);
  const [open, setOpen] = useState(false);

  const [globalEnabled, setGlobalEnabled] = useState(false);
  const [globalPercent, setGlobalPercent] = useState(0);
  const [globalEndsAt, setGlobalEndsAt] = useState("");

  const [windowsEnabled, setWindowsEnabled] = useState(false);
  const [firstD, setFirstD] = useState(1); const [firstH, setFirstH] = useState(19); const [firstM, setFirstM] = useState(21);
  const [firstPercent, setFirstPercent] = useState(80);
  const [recurD, setRecurD] = useState(1); const [recurH, setRecurH] = useState(19); const [recurM, setRecurM] = useState(21);
  const [recurMinPercent, setRecurMinPercent] = useState(30);
  const [recurMaxPercent, setRecurMaxPercent] = useState(80);
  const [minDays, setMinDays] = useState(20);
  const [maxDays, setMaxDays] = useState(90);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    get<DiscountConfig>(`/admin/discounts/${type}/${id}`)
      .then(data => {
        setCfg(data);
        setGlobalEnabled(data.global.enabled);
        setGlobalPercent(data.global.percent);
        setGlobalEndsAt(data.global.endsAt ? data.global.endsAt.slice(0, 16) : "");
        setWindowsEnabled(data.windows.enabled ?? false);
        const f = secToHMS(data.windows.firstWindowSec);
        setFirstD(f.d); setFirstH(f.h); setFirstM(f.m);
        setFirstPercent(data.windows.firstWindowPercent ?? 80);
        const r = secToHMS(data.windows.recurringWindowSec);
        setRecurD(r.d); setRecurH(r.h); setRecurM(r.m);
        setRecurMinPercent(data.windows.recurringMinPercent ?? 30);
        setRecurMaxPercent(data.windows.recurringMaxPercent ?? 80);
        setMinDays(data.windows.recurringMinDays);
        setMaxDays(data.windows.recurringMaxDays);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open, type, id]);

  async function saveGlobal() {
    setSavingGlobal(true);
    try {
      await put(`/admin/discounts/${type}/${id}/global`, {
        enabled: globalEnabled,
        percent: globalPercent,
        endsAt: globalEndsAt ? new Date(globalEndsAt).toISOString() : null,
      });
      alert("تخفیف عمومی ذخیره شد");
    } catch (e: any) { alert(e.message); }
    finally { setSavingGlobal(false); }
  }

  async function saveWindows() {
    if (recurMinPercent > recurMaxPercent) {
      alert("حداقل درصد تخفیف تکراری نمی‌تواند بیشتر از حداکثر باشد");
      return;
    }
    setSavingWin(true);
    try {
      await put(`/admin/discounts/${type}/${id}/windows`, {
        windowsEnabled,
        firstWindowSec: hmsToSec(firstD, firstH, firstM),
        recurringWindowSec: hmsToSec(recurD, recurH, recurM),
        recurringMinDays: minDays,
        recurringMaxDays: maxDays,
        firstWindowPercent: firstPercent,
        recurringMinPercent: recurMinPercent,
        recurringMaxPercent: recurMaxPercent,
      });
      alert("پنجره‌های زمانی ذخیره شد");
    } catch (e: any) { alert(e.message); }
    finally { setSavingWin(false); }
  }

  const windowsActive = windowsEnabled;

  return (
    <div className="rounded-xl border border-border bg-background/40 overflow-hidden mt-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-semibold hover:bg-muted/40 transition-colors"
      >
        <span className="flex items-center gap-2">
          <span>🏷️</span>
          <span>تنظیمات تخفیف</span>
          {cfg?.global.active && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">عمومی فعال</span>
          )}
          {cfg?.windows.enabled && (
            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">پنجره شخصی فعال</span>
          )}
        </span>
        <span className="text-muted-foreground text-xs">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t border-border p-4 space-y-5">
          {loading ? (
            <p className="text-muted-foreground text-sm text-center py-4">در حال بارگذاری...</p>
          ) : (
            <>
              {/* تخفیف عمومی */}
              <div className="space-y-3">
                <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">تخفیف عمومی (همه کاربران)</p>
                <label className="flex items-center gap-2 cursor-pointer text-sm">
                  <input type="checkbox" checked={globalEnabled} onChange={e => setGlobalEnabled(e.target.checked)} className="w-4 h-4 rounded" />
                  فعال بودن تخفیف عمومی
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label text-xs">درصد تخفیف (۰-۱۰۰)</label>
                    <input type="number" min={0} max={100} className="input" value={globalPercent}
                      onChange={e => setGlobalPercent(Number(e.target.value))} />
                  </div>
                  <div>
                    <label className="label text-xs">تاریخ پایان تخفیف</label>
                    <input type="datetime-local" className="input" value={globalEndsAt}
                      onChange={e => setGlobalEndsAt(e.target.value)} />
                  </div>
                </div>
                <button type="button" onClick={saveGlobal} disabled={savingGlobal}
                  className="btn-primary text-sm">
                  {savingGlobal ? "در حال ذخیره..." : "ذخیره تخفیف عمومی"}
                </button>
              </div>

              {/* پنجره‌های زمانی */}
              <div className="space-y-4 border-t border-border pt-4">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">پنجره‌های تخفیف شخصی</p>
                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={windowsEnabled}
                      onChange={e => setWindowsEnabled(e.target.checked)}
                      className="w-4 h-4 rounded accent-blue-600"
                    />
                    <span className={`text-xs font-semibold ${windowsEnabled ? "text-blue-600" : "text-muted-foreground"}`}>
                      {windowsEnabled ? "✅ فعال" : "غیرفعال"}
                    </span>
                  </label>
                </div>

                {!windowsEnabled && (
                  <div className="rounded-lg bg-yellow-50 border border-yellow-200 p-3 text-xs text-yellow-700">
                    ⚠️ پنجره‌های شخصی غیرفعال هستند. این دوره برای کاربران هیچ تخفیف خودکاری نمایش نمی‌دهد.
                    برای فعال‌سازی، تیک «فعال» را بزنید و ذخیره کنید.
                  </div>
                )}

                {windowsActive && (
                  <>
                    {/* پنجره اول ورود */}
                    <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
                      <p className="text-xs font-semibold text-foreground">پنجره اول ورود</p>
                      <p className="text-xs text-muted-foreground">مدت و درصد تخفیف پس از اولین بازدید</p>
                      <div className="flex gap-2">
                        {[["روز", firstD, setFirstD], ["ساعت", firstH, setFirstH], ["دقیقه", firstM, setFirstM]].map(([lbl, val, setter]: any) => (
                          <div key={String(lbl)} className="flex-1">
                            <label className="label text-xs">{lbl}</label>
                            <input type="number" min={0} className="input text-sm" value={val} onChange={e => setter(Number(e.target.value))} />
                          </div>
                        ))}
                      </div>
                      <div>
                        <label className="label text-xs">درصد تخفیف اولین ورود (۱-۱۰۰)</label>
                        <input type="number" min={1} max={100} className="input" value={firstPercent}
                          onChange={e => setFirstPercent(Number(e.target.value))} />
                      </div>
                    </div>

                    {/* پنجره تکراری */}
                    <div className="space-y-2 p-3 rounded-lg bg-muted/30 border border-border">
                      <p className="text-xs font-semibold text-foreground">پنجره تکرار</p>
                      <p className="text-xs text-muted-foreground">مدت و بازه درصد تخفیف در دفعات بعدی (تصادفی)</p>
                      <div className="flex gap-2">
                        {[["روز", recurD, setRecurD], ["ساعت", recurH, setRecurH], ["دقیقه", recurM, setRecurM]].map(([lbl, val, setter]: any) => (
                          <div key={String(lbl)} className="flex-1">
                            <label className="label text-xs">{lbl}</label>
                            <input type="number" min={0} className="input text-sm" value={val} onChange={e => setter(Number(e.target.value))} />
                          </div>
                        ))}
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="label text-xs">حداقل درصد تخفیف تکراری</label>
                          <input type="number" min={1} max={100} className="input" value={recurMinPercent}
                            onChange={e => setRecurMinPercent(Number(e.target.value))} />
                        </div>
                        <div>
                          <label className="label text-xs">حداکثر درصد تخفیف تکراری</label>
                          <input type="number" min={1} max={100} className="input" value={recurMaxPercent}
                            onChange={e => setRecurMaxPercent(Number(e.target.value))} />
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">درصد تخفیف در هر دوره تکرار، به صورت تصادفی در این بازه انتخاب می‌شود</p>
                    </div>

                    {/* فاصله تکرار */}
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="label text-xs">حداقل فاصله تکرار (روز)</label>
                        <input type="number" min={1} className="input" value={minDays} onChange={e => setMinDays(Number(e.target.value))} />
                      </div>
                      <div>
                        <label className="label text-xs">حداکثر فاصله تکرار (روز)</label>
                        <input type="number" min={1} className="input" value={maxDays} onChange={e => setMaxDays(Number(e.target.value))} />
                      </div>
                    </div>
                  </>
                )}

                <button type="button" onClick={saveWindows} disabled={savingWin}
                  className="btn-primary text-sm">
                  {savingWin ? "در حال ذخیره..." : "ذخیره پنجره‌های زمانی"}
                </button>
              </div>

              <p className="text-xs text-muted-foreground">
                🔔 وقتی تخفیف فعال است، کاربران PWA یک نوتیفیکیشن درون‌برنامه‌ای دریافت می‌کنند.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
