import { useEffect, useState } from "react";
import { get, post, put, del } from "@/lib/api";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight, MessageCircle, ShieldCheck } from "lucide-react";

interface ProactiveMessage {
  id: number; title: string; content: string; isActive: boolean; createdAt: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function MessageForm({ init, onSave, onCancel }: { init?: Partial<ProactiveMessage>; onSave: (d: any) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState({ title: init?.title ?? "", content: init?.content ?? "", isActive: init?.isActive !== false });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await onSave(d); }
    catch (e: any) { alert(e.message); setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">عنوان داخلی (برای ادمین) *</label>
        <input className="input" value={d.title} onChange={e => setD(p => ({ ...p, title: e.target.value }))} placeholder="مثلاً: پیام فروش دوره آرامش" required />
      </div>
      <div>
        <label className="label">متن پیام *</label>
        <textarea
          className="input min-h-[120px] resize-none"
          value={d.content}
          onChange={e => setD(p => ({ ...p, content: e.target.value }))}
          placeholder={"سلام {اسم} جان! توی این روزا روحیه‌ات چطوره؟ 😊"}
          required
        />
        <p className="text-xs text-muted-foreground mt-1">می‌تونی از <code className="bg-muted px-1 rounded">{"{اسم}"}</code> استفاده کنی تا اسم کاربر جاش بیاد</p>
      </div>
      <div className="flex items-center gap-3">
        <label className="label mb-0">فعال</label>
        <button type="button" onClick={() => setD(p => ({ ...p, isActive: !p.isActive }))}>
          {d.isActive
            ? <ToggleRight size={28} className="text-green-500" />
            : <ToggleLeft size={28} className="text-muted-foreground" />}
        </button>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">انصراف</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "..." : "ذخیره"}</button>
      </div>
    </form>
  );
}

export default function ProactiveMessages() {
  const [items, setItems] = useState<ProactiveMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | { item: ProactiveMessage } | null>(null);

  // ─── proactive rules state ────────────────────────────────────────────────
  const [rules, setRules] = useState("");
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);

  async function loadRules() {
    try {
      const data = await get<{ rules: string }>("/admin/proactive-rules");
      setRules(data.rules ?? "");
    } catch { /* خطا را نادیده می‌گیریم */ }
    finally { setRulesLoading(false); }
  }

  async function saveRules(e: React.FormEvent) {
    e.preventDefault();
    setRulesSaving(true);
    try {
      await put("/admin/proactive-rules", { rules });
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2500);
    } catch (err: any) { alert(err.message); }
    finally { setRulesSaving(false); }
  }
  // ──────────────────────────────────────────────────────────────────────────

  async function load() { setItems(await get<ProactiveMessage[]>("/admin/proactive-messages")); setLoading(false); }
  useEffect(() => { load(); loadRules(); }, []);

  async function create(data: any) { await post("/admin/proactive-messages", data); await load(); setModal(null); }
  async function update(id: number, data: any) { await put(`/admin/proactive-messages/${id}`, data); await load(); setModal(null); }
  async function remove(id: number) { if (!confirm("حذف این پیام؟")) return; await del(`/admin/proactive-messages/${id}`); await load(); }
  async function toggle(item: ProactiveMessage) { await put(`/admin/proactive-messages/${item.id}`, { isActive: !item.isActive }); await load(); }

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-6">

      {/* ─── بخش قوانین پیام‌های پیشگیرانه ─────────────────────────────── */}
      <div className="bg-card rounded-xl border border-border p-5 space-y-4">
        <div className="flex items-center gap-2">
          <ShieldCheck size={18} className="text-primary shrink-0" />
          <div>
            <h2 className="font-bold text-base">قوانین پیام‌های پیشگیرانه</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              این قوانین اولویت بالاتری نسبت به سایر دستورالعمل‌ها دارند و مستقیماً روی لحن، سبک نوشتار و محدودیت‌های AI اعمال می‌شوند.
              تأثیری روی چت عادی سارا ندارند.
            </p>
          </div>
        </div>

        {rulesLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
            <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            در حال بارگذاری...
          </div>
        ) : (
          <form onSubmit={saveRules} className="space-y-3">
            <textarea
              className="input w-full min-h-[180px] resize-y font-sans text-sm leading-relaxed"
              value={rules}
              onChange={e => setRules(e.target.value)}
              placeholder={"نمونه قوانین:\n- کاملاً عامیانه صحبت کن.\n- مثل یک دوست صمیمی حرف بزن.\n- از لحن رسمی استفاده نکن.\n- پیام کوتاه باشد.\n- از ایموجی استفاده کن.\n- هیچ‌وقت درباره خرید مستقیم صحبت نکن."}
              dir="rtl"
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                هر قانون را در یک خط جداگانه وارد کنید. متن طولانی و چندخطی پشتیبانی می‌شود.
              </p>
              <button
                type="submit"
                disabled={rulesSaving}
                className={`btn-primary flex items-center gap-2 transition-all ${rulesSaved ? "bg-green-600 hover:bg-green-600" : ""}`}
              >
                {rulesSaving ? (
                  <><div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" /> در حال ذخیره...</>
                ) : rulesSaved ? (
                  <>✓ ذخیره شد</>
                ) : (
                  <>ذخیره قوانین</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
      {/* ──────────────────────────────────────────────────────────────────── */}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">پیام‌های پیشگیرانه چت‌بات</h1>
          <p className="text-sm text-muted-foreground mt-1">این پیام‌ها به صورت خودکار کنار دکمه چت ظاهر میشن و کاربر رو به مکالمه دعوت می‌کنن</p>
        </div>
        <button onClick={() => setModal("create")} className="btn-primary flex items-center gap-2"><Plus size={16} /> پیام جدید</button>
      </div>

      <div className="bg-muted/20 border border-border rounded-xl p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground mb-1">نحوه کارکرد:</p>
        <ul className="space-y-1 list-disc list-inside">
          <li>۳ ثانیه بعد از ورود کاربر، یک پیام تصادفی از لیست فعال‌ها کنار دکمه چت ظاهر میشه</li>
          <li>هر ۲۰-۳۰ دقیقه یک پیام جدید نشون داده میشه</li>
          <li>با کلیک روی پیام، صفحه چت باز میشه و پیام داخل چت ظاهر میشه</li>
          <li>از <code className="bg-muted px-1 rounded">{"{اسم}"}</code> برای شخصی‌سازی استفاده کن</li>
        </ul>
      </div>

      {items.length === 0 && <p className="text-muted-foreground text-center py-10">هیچ پیامی ثبت نشده</p>}

      <div className="space-y-2">
        {items.map(item => (
          <div key={item.id} className="bg-card rounded-xl border border-border px-4 py-3 flex items-start gap-3">
            <MessageCircle size={16} className={`mt-1 shrink-0 ${item.isActive ? "text-green-500" : "text-muted-foreground"}`} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{item.title}</p>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${item.isActive ? "bg-green-500/15 text-green-400" : "bg-muted text-muted-foreground"}`}>
                  {item.isActive ? "فعال" : "غیرفعال"}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.content}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => toggle(item)} className="p-1.5 text-muted-foreground hover:text-foreground rounded" title="تغییر وضعیت">
                {item.isActive ? <ToggleRight size={16} className="text-green-500" /> : <ToggleLeft size={16} />}
              </button>
              <button onClick={() => setModal({ item })} className="p-1.5 text-muted-foreground hover:text-foreground rounded"><Pencil size={13} /></button>
              <button onClick={() => remove(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal === "create" && <Modal title="پیام جدید" onClose={() => setModal(null)}><MessageForm onSave={create} onCancel={() => setModal(null)} /></Modal>}
      {modal && modal !== "create" && <Modal title="ویرایش پیام" onClose={() => setModal(null)}><MessageForm init={modal.item} onSave={d => update(modal.item.id, d)} onCancel={() => setModal(null)} /></Modal>}
    </div>
  );
}
