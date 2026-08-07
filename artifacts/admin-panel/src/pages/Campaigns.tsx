import { useEffect, useState } from "react";
import { get, post, del } from "@/lib/api";
import { Plus, Trash2, Trophy, Clock, CheckCircle, Loader2 } from "lucide-react";

interface Campaign {
  id: number;
  prizeTitle: string;
  awardAt: string;
  status: "active" | "ended";
  winnerTribeName: string | null;
  winnerChiefName: string | null;
  createdAt: string;
}

function statusBadge(s: Campaign["status"]) {
  if (s === "active") return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700"><Clock size={11} />فعال</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-600"><CheckCircle size={11} />پایان یافته</span>;
}

function fmt(iso: string) {
  return new Date(iso).toLocaleString("fa-IR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function Campaigns() {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ prizeTitle: "", awardAt: "" });

  async function load() {
    setLoading(true);
    try { setCampaigns(await get<Campaign[]>("/admin/leaderboard-campaigns")); }
    catch { } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await post("/admin/leaderboard-campaigns", {
        prizeTitle: form.prizeTitle,
        awardAt: new Date(form.awardAt).toISOString(),
      });
      setForm({ prizeTitle: "", awardAt: "" });
      await load();
    } catch (err: any) {
      setError(err.message ?? "خطا");
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (!confirm("این کمپین حذف شود؟")) return;
    await del(`/admin/leaderboard-campaigns/${id}`);
    await load();
  }

  return (
    <div dir="rtl" className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Trophy size={20} className="text-yellow-500" />
        <h1 className="text-xl font-bold">کمپین‌های جدول قبایل</h1>
      </div>

      {/* Create form */}
      <div className="bg-white border border-border rounded-xl p-5 shadow-sm">
        <h2 className="font-semibold mb-4 text-sm text-muted-foreground">ایجاد کمپین جدید</h2>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">عنوان جایزه</label>
              <input
                type="text"
                required
                placeholder="مثال: لپ‌تاپ گیمینگ"
                value={form.prizeTitle}
                onChange={e => setForm(p => ({ ...p, prizeTitle: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">تاریخ و ساعت اعطای جایزه</label>
              <input
                type="datetime-local"
                required
                value={form.awardAt}
                onChange={e => setForm(p => ({ ...p, awardAt: e.target.value }))}
                className="w-full border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
              ایجاد کمپین
            </button>
          </div>
        </form>
        <p className="text-xs text-muted-foreground mt-3 border-t pt-3">
          ⚠️ با ایجاد کمپین جدید، کمپین فعال قبلی به‌طور خودکار پایان می‌یابد و برنده لحظه ثبت مشخص می‌شود.
        </p>
      </div>

      {/* List */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border">
          <h2 className="font-semibold text-sm">کمپین‌ها ({campaigns.length})</h2>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="animate-spin text-muted-foreground" /></div>
        ) : campaigns.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">کمپینی ثبت نشده</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-muted/30 text-muted-foreground text-xs">
                <th className="px-4 py-2.5 text-right font-medium">عنوان جایزه</th>
                <th className="px-4 py-2.5 text-right font-medium">موعد</th>
                <th className="px-4 py-2.5 text-right font-medium">وضعیت</th>
                <th className="px-4 py-2.5 text-right font-medium">برنده</th>
                <th className="px-4 py-2.5 text-center font-medium">حذف</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map(c => (
                <tr key={c.id} className="border-t border-border hover:bg-muted/10 transition-colors">
                  <td className="px-4 py-3 font-medium">{c.prizeTitle}</td>
                  <td className="px-4 py-3 text-muted-foreground">{fmt(c.awardAt)}</td>
                  <td className="px-4 py-3">{statusBadge(c.status)}</td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">
                    {c.winnerTribeName
                      ? <span className="text-yellow-700 font-medium">{c.winnerTribeName}<br /><span className="text-gray-400">{c.winnerChiefName}</span></span>
                      : "—"}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => remove(c.id)}
                      className="text-red-400 hover:text-red-600 transition-colors"
                    >
                      <Trash2 size={15} />
                    </button>
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
