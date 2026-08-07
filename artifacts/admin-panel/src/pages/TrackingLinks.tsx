import { useEffect, useState } from "react";
import { get, post, put, del } from "@/lib/api";
import { Plus, Trash2, Link2, Loader2, Copy, Pencil, X, BarChart2, Power, ExternalLink } from "lucide-react";

interface TrackingLink {
  id: number;
  title: string;
  slug: string;
  destinationUrl: string;
  isActive: boolean;
  startsAt: string | null;
  expiresAt: string | null;
  createdAt: string;
  shortUrl: string;
}

interface OverviewRow extends TrackingLink {
  totalClicks: number;
  uniqueClicks: number;
  onlineNow: number;
  newRegistrations: number;
  loggedInUsers: number;
  purchases: number;
  revenue: number;
  registrationConversionRate: number;
  purchaseConversionRate: number;
}

const EMPTY_FORM = { title: "", slug: "", destinationUrl: "" };

function fmtMoney(n: number) {
  return n.toLocaleString("fa-IR") + " تومان";
}

export default function TrackingLinks() {
  const [rows, setRows] = useState<OverviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try { setRows(await get<OverviewRow[]>("/admin/tracking-links/overview")); }
    catch { } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  function startEdit(row: OverviewRow) {
    setEditingId(row.id);
    setForm({ title: row.title, slug: row.slug, destinationUrl: row.destinationUrl });
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      if (editingId) {
        await put(`/admin/tracking-links/${editingId}`, form);
      } else {
        await post("/admin/tracking-links", form);
      }
      cancelEdit();
      await load();
    } catch (err: any) {
      setError(err.message ?? "خطا");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(row: OverviewRow) {
    await put(`/admin/tracking-links/${row.id}`, { isActive: !row.isActive });
    await load();
  }

  async function remove(id: number) {
    if (!confirm("این لینک حذف شود؟ آمار مربوط به آن نیز حذف خواهد شد.")) return;
    await del(`/admin/tracking-links/${id}`);
    await load();
  }

  function copyLink(row: OverviewRow) {
    navigator.clipboard?.writeText(row.shortUrl);
    setCopiedId(row.id);
    setTimeout(() => setCopiedId((v) => (v === row.id ? null : v)), 1500);
  }

  const totals = rows.reduce(
    (acc, r) => ({
      clicks: acc.clicks + r.totalClicks,
      registrations: acc.registrations + r.newRegistrations,
      purchases: acc.purchases + r.purchases,
      revenue: acc.revenue + r.revenue,
    }),
    { clicks: 0, registrations: 0, purchases: 0, revenue: 0 },
  );

  return (
    <div dir="rtl" className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link2 size={20} className="text-primary" />
        <h1 className="text-xl font-bold">لینک‌های ردیابی تبلیغاتی</h1>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "کل کلیک‌ها", value: totals.clicks.toLocaleString("fa-IR") },
          { label: "ثبت‌نام جدید", value: totals.registrations.toLocaleString("fa-IR") },
          { label: "خرید موفق", value: totals.purchases.toLocaleString("fa-IR") },
          { label: "درآمد", value: fmtMoney(totals.revenue) },
        ].map((s) => (
          <div key={s.label} className="bg-white border border-border rounded-xl p-4 shadow-sm">
            <div className="text-xs text-muted-foreground">{s.label}</div>
            <div className="text-lg font-bold mt-1">{s.value}</div>
          </div>
        ))}
      </div>

      {/* Create / edit form */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-sm text-muted-foreground">
            {editingId ? "ویرایش لینک" : "ایجاد لینک تبلیغاتی جدید"}
          </h2>
          {editingId && (
            <button onClick={cancelEdit} className="text-muted-foreground hover:text-foreground">
              <X size={16} />
            </button>
          )}
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">عنوان کمپین</label>
              <input
                type="text" required placeholder="مثال: تبلیغ اینستاگرام مرداد"
                value={form.title}
                onChange={(e) => setForm((p) => ({ ...p, title: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">کد کوتاه (اختیاری)</label>
              <input
                type="text" placeholder="instagram-mordad" dir="ltr"
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">مقصد (مسیر یا لینک کامل)</label>
              <input
                type="text" required placeholder="/courses یا https://..." dir="ltr"
                value={form.destinationUrl}
                onChange={(e) => setForm((p) => ({ ...p, destinationUrl: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit" disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : editingId ? <Pencil size={15} /> : <Plus size={15} />}
              {editingId ? "ذخیره تغییرات" : "ایجاد لینک"}
            </button>
          </div>
        </form>
      </div>

      {/* List */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm">لینک‌ها ({rows.length})</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">هنوز لینکی ایجاد نشده</div>
        ) : (
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs">
                <th className="px-4 py-2.5 text-right font-medium">کمپین</th>
                <th className="px-4 py-2.5 text-right font-medium">کلیک (کل/یکتا)</th>
                <th className="px-4 py-2.5 text-right font-medium">ثبت‌نام</th>
                <th className="px-4 py-2.5 text-right font-medium">خرید</th>
                <th className="px-4 py-2.5 text-right font-medium">درآمد</th>
                <th className="px-4 py-2.5 text-right font-medium">نرخ تبدیل</th>
                <th className="px-4 py-2.5 text-center font-medium">وضعیت</th>
                <th className="px-4 py-2.5 text-center font-medium">عملیات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground flex items-center gap-1" dir="ltr">
                      /r/{r.slug}
                      <button onClick={() => copyLink(r)} className="hover:text-foreground">
                        <Copy size={11} />
                      </button>
                      {copiedId === r.id && <span className="text-green-600">کپی شد</span>}
                      <a href={r.destinationUrl.startsWith("/") ? undefined : r.destinationUrl} target="_blank" rel="noreferrer" className="hover:text-foreground">
                        <ExternalLink size={11} />
                      </a>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.totalClicks.toLocaleString("fa-IR")} / {r.uniqueClicks.toLocaleString("fa-IR")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.newRegistrations.toLocaleString("fa-IR")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.purchases.toLocaleString("fa-IR")}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmtMoney(r.revenue)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    ثبت‌نام {r.registrationConversionRate}٪ · خرید {r.purchaseConversionRate}٪
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => toggleActive(r)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold ${r.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}
                    >
                      <Power size={11} />
                      {r.isActive ? "فعال" : "غیرفعال"}
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => startEdit(r)} className="text-muted-foreground hover:text-foreground" title="ویرایش">
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => remove(r.id)} className="text-red-400 hover:text-red-600" title="حذف">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
