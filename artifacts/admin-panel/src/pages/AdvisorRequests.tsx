import { useEffect, useState } from "react";
import { get, patch, del } from "@/lib/api";
import { Phone, CheckCircle, Clock, XCircle, MessageCircle, PhoneCall, Trash2, ChevronDown } from "lucide-react";

type Status = "new" | "assigned" | "contacted" | "closed";
type Source = "chatbot" | "sara" | "form";

interface AdvisorRequest {
  id: number;
  userId: number | null;
  name: string;
  phone: string;
  interestedProduct: string | null;
  source: Source;
  status: Status;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const STATUS_MAP: Record<Status, { label: string; color: string; icon: React.ElementType }> = {
  new:      { label: "جدید",      color: "bg-blue-100 text-blue-700",   icon: Clock       },
  assigned: { label: "اختصاص‌یافته", color: "bg-yellow-100 text-yellow-700", icon: Phone },
  contacted:{ label: "تماس گرفته",color: "bg-green-100 text-green-700", icon: CheckCircle },
  closed:   { label: "بسته‌شده",  color: "bg-muted text-muted-foreground", icon: XCircle   },
};

const SOURCE_MAP: Record<Source, { label: string; icon: React.ElementType }> = {
  chatbot: { label: "چت‌بات", icon: MessageCircle },
  sara:    { label: "سارا",   icon: PhoneCall      },
  form:    { label: "فرم",    icon: Phone          },
};

function toPersianDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", {
    year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function AdvisorRequests() {
  const [rows, setRows]           = useState<AdvisorRequest[]>([]);
  const [loading, setLoading]     = useState(true);
  const [filterStatus, setFilter] = useState<string>("all");
  const [editNotes, setEditNotes] = useState<Record<number, string>>({});
  const [busy, setBusy]           = useState<number | null>(null);

  async function load() {
    setLoading(true);
    try {
      const data = await get<AdvisorRequest[]>("/admin/advisor-requests");
      setRows(data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, []);

  async function updateStatus(id: number, status: Status) {
    setBusy(id);
    try {
      await patch(`/admin/advisor-requests/${id}`, { status });
      setRows(prev => prev.map(r => r.id === id ? { ...r, status } : r));
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(null); }
  }

  async function saveNotes(id: number) {
    setBusy(id);
    try {
      await patch(`/admin/advisor-requests/${id}`, { notes: editNotes[id] ?? "" });
      setRows(prev => prev.map(r => r.id === id ? { ...r, notes: editNotes[id] ?? "" } : r));
      setEditNotes(prev => { const n = { ...prev }; delete n[id]; return n; });
    } catch (e: unknown) { alert((e as Error).message); }
    finally { setBusy(null); }
  }

  async function remove(id: number) {
    if (!confirm("حذف این درخواست؟")) return;
    await del(`/admin/advisor-requests/${id}`);
    setRows(prev => prev.filter(r => r.id !== id));
  }

  const filtered = filterStatus === "all"
    ? rows
    : rows.filter(r => r.status === filterStatus);

  const counts = rows.reduce<Record<string, number>>((acc, r) => {
    acc[r.status] = (acc[r.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h1 className="text-xl font-bold">
          درخواست‌های مشاور
          <span className="text-muted-foreground text-base font-normal mr-2">({rows.length})</span>
        </h1>

        <div className="flex gap-2 flex-wrap">
          {[
            { key: "all",      label: "همه" },
            { key: "new",      label: `جدید (${counts.new ?? 0})` },
            { key: "assigned", label: `اختصاص‌یافته (${counts.assigned ?? 0})` },
            { key: "contacted",label: `تماس گرفته (${counts.contacted ?? 0})` },
            { key: "closed",   label: `بسته (${counts.closed ?? 0})` },
          ].map(f => (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${
                filterStatus === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border bg-card hover:bg-muted"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><div className="loader" /></div>
      ) : filtered.length === 0 ? (
        <div className="bg-card rounded-xl border border-border p-10 text-center text-muted-foreground text-sm">
          درخواستی یافت نشد
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(req => {
            const s = STATUS_MAP[req.status];
            const src = SOURCE_MAP[req.source] ?? SOURCE_MAP.form;
            const SIcon = s.icon;
            const SrcIcon = src.icon;
            const isEditingNotes = editNotes[req.id] !== undefined;

            return (
              <div key={req.id} className="bg-card rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0">
                    <p className="font-semibold">{req.name}</p>
                    <a href={`tel:${req.phone}`} className="text-sm text-primary flex items-center gap-1 hover:underline">
                      <Phone size={13} /> {req.phone}
                    </a>
                    {req.interestedProduct && (
                      <p className="text-xs text-muted-foreground">محصول: {req.interestedProduct}</p>
                    )}
                    <p className="text-xs text-muted-foreground">{toPersianDate(req.createdAt)}</p>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 ${s.color}`}>
                      <SIcon size={11} /> {s.label}
                    </span>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <SrcIcon size={11} /> {src.label}
                    </span>
                  </div>
                </div>

                {req.notes && !isEditingNotes && (
                  <p className="text-xs bg-muted/50 rounded px-3 py-2 text-muted-foreground">{req.notes}</p>
                )}
                {isEditingNotes && (
                  <div className="flex gap-2">
                    <textarea
                      className="input text-xs flex-1 h-16 resize-none"
                      value={editNotes[req.id]}
                      onChange={e => setEditNotes(prev => ({ ...prev, [req.id]: e.target.value }))}
                      placeholder="یادداشت..."
                    />
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => saveNotes(req.id)}
                        disabled={busy === req.id}
                        className="btn-primary text-xs px-3 py-1"
                      >ذخیره</button>
                      <button
                        onClick={() => setEditNotes(prev => { const n = { ...prev }; delete n[req.id]; return n; })}
                        className="text-xs px-3 py-1 border border-border rounded-lg hover:bg-muted"
                      >لغو</button>
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <div className="relative">
                    <select
                      value={req.status}
                      onChange={e => updateStatus(req.id, e.target.value as Status)}
                      disabled={busy === req.id}
                      className="input text-xs pr-2 pl-6 appearance-none"
                    >
                      <option value="new">جدید</option>
                      <option value="assigned">اختصاص‌یافته</option>
                      <option value="contacted">تماس گرفته</option>
                      <option value="closed">بسته‌شده</option>
                    </select>
                    <ChevronDown size={12} className="absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                  </div>

                  {!isEditingNotes && (
                    <button
                      onClick={() => setEditNotes(prev => ({ ...prev, [req.id]: req.notes ?? "" }))}
                      className="text-xs px-3 py-1.5 border border-border rounded-lg hover:bg-muted transition-colors"
                    >یادداشت</button>
                  )}

                  <button
                    onClick={() => remove(req.id)}
                    className="mr-auto p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted transition-colors"
                  ><Trash2 size={14} /></button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
