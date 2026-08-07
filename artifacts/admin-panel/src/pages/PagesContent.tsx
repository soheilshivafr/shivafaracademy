import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { get, post, put, del, uploadFile } from "@/lib/api";
import {
  Plus, Pencil, Trash2, Eye, EyeOff, Save, X, Save as SaveIcon,
  FileText, Image as ImageIcon, MessageSquare, Trophy, Upload, Loader2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface PageMedia {
  id: number; page: string; kind: string; url: string;
  caption: string | null; sortOrder: number; isPublished: boolean;
}

interface StudentResult {
  id: number; type: string; name: string | null; body: string | null;
  mediaUrl: string | null; sortOrder: number; isPublished: boolean;
}

interface PageFaq {
  id: number; page: string; question: string; answer: string;
  sortOrder: number; isPublished: boolean;
}

interface AdminPagePayload {
  slug: string;
  content: Record<string, string>;
  media?: PageMedia[];
  results?: StudentResult[];
  faqs?: PageFaq[];
}

// ── Constants ────────────────────────────────────────────────────────────────

const PAGES = [
  { slug: "guarantee", label: "ضمانت‌نامه", route: "/guarantee", icon: FileText },
  { slug: "results", label: "نتایج دانشجوها", route: "/student-results", icon: Trophy },
  { slug: "collab", label: "همکاری ۳۵ نفر", route: "/collaboration", icon: MessageSquare },
  { slug: "mtp", label: "بیزینس MTP", route: "/mtp-business", icon: ImageIcon },
] as const;

type Slug = typeof PAGES[number]["slug"];

// Persian labels + rendering hints for each editable text field per page.
const CONTENT_FIELDS: Record<Slug, { key: string; label: string; multiline?: boolean }[]> = {
  guarantee: [
    { key: "title", label: "عنوان صفحه" },
    { key: "intro", label: "مقدمه", multiline: true },
    { key: "body", label: "متن اصلی", multiline: true },
    { key: "terms", label: "شرایط (هر مورد در یک خط)", multiline: true },
    { key: "note", label: "یادداشت پایانی", multiline: true },
  ],
  results: [
    { key: "title", label: "عنوان صفحه" },
    { key: "intro", label: "مقدمه", multiline: true },
  ],
  collab: [
    { key: "title", label: "عنوان صفحه" },
    { key: "intro", label: "مقدمه", multiline: true },
    { key: "body", label: "متن اصلی", multiline: true },
    { key: "criteria", label: "معیارهای انتخاب (هر مورد در یک خط)", multiline: true },
  ],
  mtp: [
    { key: "title", label: "عنوان صفحه" },
    { key: "intro", label: "مقدمه", multiline: true },
    { key: "body", label: "متن اصلی", multiline: true },
    { key: "advantages", label: "مزایا (هر مورد در یک خط)", multiline: true },
    { key: "extras", label: "امکانات دوره (هر مورد در یک خط)", multiline: true },
    { key: "income", label: "توضیح درآمد", multiline: true },
  ],
};

const RESULT_TYPES = [
  { value: "text", label: "متن" },
  { value: "screenshot", label: "اسکرین‌شات" },
  { value: "audio", label: "صوت" },
  { value: "video", label: "ویدیو" },
];

// ── Shared UI helpers ────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      {children}
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${props.className ?? ""}`} />;
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y ${props.className ?? ""}`} />;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!value)} className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${value ? "bg-primary" : "bg-muted"}`}>
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  );
}

function PublishBadge({ on }: { on: boolean }) {
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${on ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>{on ? "منتشر" : "پیش‌نویس"}</span>;
}

// File upload button → returns the uploaded url.
function UploadButton({ endpoint, accept, label, onUploaded }: { endpoint: string; accept: string; label: string; onUploaded: (url: string) => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  return (
    <label className="inline-flex items-center gap-1.5 px-3 py-2 bg-muted text-foreground rounded-lg text-xs font-medium cursor-pointer hover:bg-muted/70">
      {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
      {busy ? "در حال آپلود..." : label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={busy}
        onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          try {
            const r = await uploadFile(endpoint, file);
            onUploaded(r.url);
          } catch (err) {
            toast({ title: "خطای آپلود", description: (err as Error).message, variant: "destructive" });
          } finally {
            setBusy(false);
            e.target.value = "";
          }
        }}
      />
    </label>
  );
}

// ── Text content editor ──────────────────────────────────────────────────────

function ContentEditor({ slug, content }: { slug: Slug; content: Record<string, string> }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [form, setForm] = useState<Record<string, string>>(content);

  const save = useMutation({
    mutationFn: (d: Record<string, string>) => put(`/admin/pages/${slug}/content`, d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["admin-page", slug] }); toast({ title: "متن ذخیره شد" }); },
    onError: (err) => toast({ title: "خطا", description: (err as Error).message, variant: "destructive" }),
  });

  return (
    <div className="bg-card border border-border rounded-xl p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><FileText size={16} /> متن صفحه</h3>
      {CONTENT_FIELDS[slug].map(f => (
        <Field key={f.key} label={f.label}>
          {f.multiline
            ? <Textarea rows={f.key === "title" ? 1 : 4} value={form[f.key] ?? ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />
            : <Input value={form[f.key] ?? ""} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} />}
        </Field>
      ))}
      <button onClick={() => save.mutate(form)} disabled={save.isPending}
        className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90">
        <SaveIcon size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره متن"}
      </button>
    </div>
  );
}

// ── Media manager (images for guarantee, audio/video for mtp) ────────────────

function MediaManager({ slug, kind, items, title, accept, uploadEndpoint }: {
  slug: Slug; kind: string; items: PageMedia[]; title: string; accept: string; uploadEndpoint: string;
}) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: PageMedia } | null>(null);
  const [form, setForm] = useState<Partial<PageMedia>>({});

  const list = items.filter(m => m.kind === kind);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-page", slug] });

  const save = useMutation({
    mutationFn: (d: Partial<PageMedia>) =>
      modal?.mode === "edit"
        ? put(`/admin/page-media/${d.id}`, d)
        : post(`/admin/page-media`, { ...d, page: slug, kind }),
    onSuccess: () => { invalidate(); setModal(null); toast({ title: "ذخیره شد" }); },
    onError: (err) => toast({ title: "خطا", description: (err as Error).message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/page-media/${id}`),
    onSuccess: invalidate,
  });
  const togglePublish = (m: PageMedia) => put(`/admin/page-media/${m.id}`, { isPublished: !m.isPublished }).then(invalidate);

  function openCreate() { setForm({ url: "", caption: "", sortOrder: list.length, isPublished: true }); setModal({ mode: "create" }); }
  function openEdit(m: PageMedia) { setForm(m); setModal({ mode: "edit", item: m }); }

  const isImage = kind === "image";

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><ImageIcon size={16} /> {title} ({list.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن
        </button>
      </div>
      <div className="space-y-2">
        {list.map(m => (
          <div key={m.id} className="bg-muted/40 border border-border rounded-lg p-3 flex items-center gap-3">
            {isImage
              ? <img src={m.url} alt="" className="w-14 h-14 rounded-lg object-cover shrink-0 bg-muted" />
              : <div className="w-14 h-14 rounded-lg bg-muted flex items-center justify-center shrink-0 text-muted-foreground text-xs">{kind === "audio" ? "صوت" : "ویدیو"}</div>}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1"><PublishBadge on={m.isPublished} /><span className="text-xs text-muted-foreground">ترتیب: {m.sortOrder}</span></div>
              <p className="text-sm text-foreground truncate">{m.caption || m.url}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => togglePublish(m)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">{m.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              <button onClick={() => openEdit(m)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
              <button onClick={() => remove.mutate(m.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {list.length === 0 && <div className="text-center py-6 text-muted-foreground text-sm">هنوز موردی اضافه نشده</div>}
      </div>

      {modal && (
        <Modal title={modal.mode === "create" ? `افزودن ${title}` : `ویرایش ${title}`} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="فایل">
              <div className="flex items-center gap-2">
                <UploadButton endpoint={uploadEndpoint} accept={accept} label="آپلود فایل" onUploaded={url => setForm(p => ({ ...p, url }))} />
                {form.url && <span className="text-xs text-green-400 truncate">{form.url}</span>}
              </div>
            </Field>
            <Field label="آدرس فایل (URL)">
              <Input value={form.url ?? ""} onChange={e => setForm(p => ({ ...p, url: e.target.value }))} placeholder="/uploads/..." />
            </Field>
            {isImage && form.url && <img src={form.url} alt="" className="w-full max-h-48 object-contain rounded-lg bg-muted" />}
            <Field label="توضیح / کپشن">
              <Input value={form.caption ?? ""} onChange={e => setForm(p => ({ ...p, caption: e.target.value }))} />
            </Field>
            <Field label="ترتیب نمایش">
              <Input type="number" value={form.sortOrder ?? 0} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} />
            </Field>
            <Toggle value={form.isPublished ?? true} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="منتشر کردن" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || !form.url}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Student results manager (results page) ───────────────────────────────────

function ResultsManager({ items }: { items: StudentResult[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: StudentResult } | null>(null);
  const [form, setForm] = useState<Partial<StudentResult>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-page", "results"] });

  const save = useMutation({
    mutationFn: (d: Partial<StudentResult>) =>
      modal?.mode === "edit" ? put(`/admin/student-results/${d.id}`, d) : post(`/admin/student-results`, d),
    onSuccess: () => { invalidate(); setModal(null); toast({ title: "ذخیره شد" }); },
    onError: (err) => toast({ title: "خطا", description: (err as Error).message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/student-results/${id}`),
    onSuccess: invalidate,
  });
  const togglePublish = (r: StudentResult) => put(`/admin/student-results/${r.id}`, { isPublished: !r.isPublished }).then(invalidate);

  function openCreate() { setForm({ type: "text", name: "", body: "", mediaUrl: "", sortOrder: items.length, isPublished: true }); setModal({ mode: "create" }); }
  function openEdit(r: StudentResult) { setForm(r); setModal({ mode: "edit", item: r }); }

  const type = form.type ?? "text";
  const needsMedia = type === "audio" || type === "video" || type === "screenshot";
  const uploadEndpoint = type === "audio" ? "/upload/audio" : type === "video" ? "/upload/video" : "/upload/image";
  const accept = type === "audio" ? "audio/*" : type === "video" ? "video/*" : "image/*";

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><Trophy size={16} /> نتایج دانشجوها ({items.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن نتیجه
        </button>
      </div>
      <div className="space-y-2">
        {items.map(r => (
          <div key={r.id} className="bg-muted/40 border border-border rounded-lg p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <PublishBadge on={r.isPublished} />
                <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{RESULT_TYPES.find(t => t.value === r.type)?.label ?? r.type}</span>
                <span className="text-xs text-muted-foreground">ترتیب: {r.sortOrder}</span>
              </div>
              {r.name && <p className="text-sm font-medium text-foreground">{r.name}</p>}
              {r.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{r.body}</p>}
              {r.mediaUrl && <p className="text-xs text-green-400 mt-0.5 truncate">{r.mediaUrl}</p>}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => togglePublish(r)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">{r.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              <button onClick={() => openEdit(r)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
              <button onClick={() => remove.mutate(r.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-center py-6 text-muted-foreground text-sm">هنوز نتیجه‌ای ثبت نشده</div>}
      </div>

      {modal && (
        <Modal title={modal.mode === "create" ? "افزودن نتیجه" : "ویرایش نتیجه"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="نوع">
              <Select value={type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))}>
                {RESULT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </Select>
            </Field>
            <Field label="نام / برچسب">
              <Input value={form.name ?? ""} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="مثلاً: علی، ۳۵ ساله" />
            </Field>
            {type === "text" && (
              <Field label="متن پیام">
                <Textarea rows={4} value={form.body ?? ""} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />
              </Field>
            )}
            {needsMedia && (
              <>
                <Field label="فایل">
                  <div className="flex items-center gap-2">
                    <UploadButton endpoint={uploadEndpoint} accept={accept} label="آپلود فایل" onUploaded={url => setForm(p => ({ ...p, mediaUrl: url }))} />
                    {form.mediaUrl && <span className="text-xs text-green-400 truncate">{form.mediaUrl}</span>}
                  </div>
                </Field>
                <Field label="آدرس فایل (URL)">
                  <Input value={form.mediaUrl ?? ""} onChange={e => setForm(p => ({ ...p, mediaUrl: e.target.value }))} placeholder="/uploads/..." />
                </Field>
                {type === "screenshot" && form.mediaUrl && <img src={form.mediaUrl} alt="" className="w-full max-h-48 object-contain rounded-lg bg-muted" />}
                <Field label="توضیح (اختیاری)">
                  <Textarea rows={2} value={form.body ?? ""} onChange={e => setForm(p => ({ ...p, body: e.target.value }))} />
                </Field>
              </>
            )}
            <Field label="ترتیب نمایش">
              <Input type="number" value={form.sortOrder ?? 0} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} />
            </Field>
            <Toggle value={form.isPublished ?? true} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="منتشر کردن" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || (needsMedia && !form.mediaUrl) || (type === "text" && !form.body)}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── FAQ manager (mtp page) ───────────────────────────────────────────────────

function FaqManager({ slug, items }: { slug: Slug; items: PageFaq[] }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: PageFaq } | null>(null);
  const [form, setForm] = useState<Partial<PageFaq>>({});

  const invalidate = () => qc.invalidateQueries({ queryKey: ["admin-page", slug] });

  const save = useMutation({
    mutationFn: (d: Partial<PageFaq>) =>
      modal?.mode === "edit" ? put(`/admin/page-faqs/${d.id}`, d) : post(`/admin/page-faqs`, { ...d, page: slug }),
    onSuccess: () => { invalidate(); setModal(null); toast({ title: "ذخیره شد" }); },
    onError: (err) => toast({ title: "خطا", description: (err as Error).message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/page-faqs/${id}`),
    onSuccess: invalidate,
  });
  const togglePublish = (f: PageFaq) => put(`/admin/page-faqs/${f.id}`, { isPublished: !f.isPublished }).then(invalidate);

  function openCreate() { setForm({ question: "", answer: "", sortOrder: items.length, isPublished: true }); setModal({ mode: "create" }); }
  function openEdit(f: PageFaq) { setForm(f); setModal({ mode: "edit", item: f }); }

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground flex items-center gap-2"><MessageSquare size={16} /> سوالات متداول ({items.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن سوال
        </button>
      </div>
      <div className="space-y-2">
        {items.map(f => (
          <div key={f.id} className="bg-muted/40 border border-border rounded-lg p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1"><PublishBadge on={f.isPublished} /><span className="text-xs text-muted-foreground">ترتیب: {f.sortOrder}</span></div>
              <p className="text-sm font-medium text-foreground">{f.question}</p>
              <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{f.answer}</p>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <button onClick={() => togglePublish(f)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">{f.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}</button>
              <button onClick={() => openEdit(f)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
              <button onClick={() => remove.mutate(f.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
        {items.length === 0 && <div className="text-center py-6 text-muted-foreground text-sm">هنوز سوالی ثبت نشده</div>}
      </div>

      {modal && (
        <Modal title={modal.mode === "create" ? "افزودن سوال" : "ویرایش سوال"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="سوال *">
              <Input value={form.question ?? ""} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} />
            </Field>
            <Field label="پاسخ *">
              <Textarea rows={4} value={form.answer ?? ""} onChange={e => setForm(p => ({ ...p, answer: e.target.value }))} />
            </Field>
            <Field label="ترتیب نمایش">
              <Input type="number" value={form.sortOrder ?? 0} onChange={e => setForm(p => ({ ...p, sortOrder: Number(e.target.value) }))} />
            </Field>
            <Toggle value={form.isPublished ?? true} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="منتشر کردن" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || !form.question || !form.answer}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Page body for the active slug ────────────────────────────────────────────

function PageBody({ slug }: { slug: Slug }) {
  const { data, isLoading, isError, error, refetch } = useQuery<AdminPagePayload>({
    queryKey: ["admin-page", slug],
    queryFn: () => get(`/admin/pages/${slug}`),
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });

  // Surface real failures instead of spinning forever.
  if (isError && !data) return (
    <div className="text-center py-10 space-y-3">
      <p className="text-sm text-destructive">خطا در بارگذاری صفحه: {(error as Error)?.message ?? "خطای ناشناخته"}</p>
      <button onClick={() => refetch()} className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90">
        تلاش دوباره
      </button>
    </div>
  );

  // Never render a payload that belongs to a different slug (can happen briefly
  // with keepPreviousData when a tab isn't prefetched yet) — show the spinner instead.
  if (isLoading || !data || data.slug !== slug) return <div className="text-center py-10 text-muted-foreground text-sm">در حال بارگذاری...</div>;

  return (
    <div className="space-y-6" key={slug}>
      <ContentEditor slug={slug} content={data.content} />

      {slug === "guarantee" && (
        <MediaManager slug="guarantee" kind="image" title="تصاویر ضمانت‌نامه" accept="image/*" uploadEndpoint="/upload/image" items={data.media ?? []} />
      )}

      {slug === "results" && (
        <ResultsManager items={data.results ?? []} />
      )}

      {slug === "mtp" && (
        <>
          <MediaManager slug="mtp" kind="audio" title="فایل‌های صوتی" accept="audio/*" uploadEndpoint="/upload/audio" items={data.media ?? []} />
          <MediaManager slug="mtp" kind="video" title="فایل‌های ویدیویی" accept="video/*" uploadEndpoint="/upload/video" items={data.media ?? []} />
          <FaqManager slug="mtp" items={data.faqs ?? []} />
        </>
      )}
    </div>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function PagesContent() {
  const [active, setActive] = useState<Slug>("guarantee");
  const qc = useQueryClient();

  // Prefetch all four pages once so switching tabs is instant (no repeated spinner).
  useEffect(() => {
    for (const p of PAGES) {
      qc.prefetchQuery({
        queryKey: ["admin-page", p.slug],
        queryFn: () => get(`/admin/pages/${p.slug}`),
        staleTime: 5 * 60_000,
      });
    }
  }, [qc]);

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-foreground">محتوای صفحات معرفی</h1>
        <p className="text-sm text-muted-foreground mt-1">
          مدیریت متن، تصاویر، صوت، ویدیو و سوالات صفحات ضمانت‌نامه، نتایج، همکاری و بیزینس MTP. این صفحات در منوی اپ نیستند و فقط سارا و چت‌بات کاربران را به آن‌ها ارجاع می‌دهند.
        </p>
      </div>

      <div className="flex flex-wrap gap-2 mb-6">
        {PAGES.map(p => {
          const Icon = p.icon;
          const isActive = active === p.slug;
          return (
            <button
              key={p.slug}
              onClick={() => setActive(p.slug)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive ? "bg-primary text-primary-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={15} /> {p.label}
            </button>
          );
        })}
      </div>

      <div className="mb-4 text-xs text-muted-foreground">
        آدرس صفحه: <code className="bg-muted px-1.5 py-0.5 rounded">{PAGES.find(p => p.slug === active)?.route}</code>
      </div>

      <PageBody slug={active} />
    </div>
  );
}
