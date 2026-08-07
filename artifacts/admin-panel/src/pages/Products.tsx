import { useEffect, useState } from "react";
import { get, post, put, del, uploadFile, uploadFileWithProgress } from "@/lib/api";
import { Plus, Pencil, Trash2, Upload, Tag, X, File, Headphones } from "lucide-react";
import { DiscountPanel } from "@/components/DiscountPanel";

interface Category { id: number; name: string; slug: string; sortOrder: number; }
interface ProductFile { url: string; name: string; size?: number; fileType?: string; title?: string; description?: string; }
interface HypnoPart {
  id: string;
  title: string;
  description: string;
  video?: ProductFile;
  audio?: ProductFile;
}

interface Product {
  id: number; title: string; description?: string | null;
  image?: string | null; audioUrl?: string | null;
  price: number; isPublished: boolean;
  categoryId?: number | null; productType: string;
  files?: ProductFile[]; metadata?: Record<string, unknown>;
}

// ── Category-specific extra fields ────────────────────────────────────────────
type FieldDef =
  | { key: string; label: string; type: "text" | "number" }
  | { key: string; label: string; type: "select"; options: string[] }
  | { key: string; label: string; type: "textarea" };

const CATEGORY_EXTRA_FIELDS: Record<string, FieldDef[]> = {
  "physical": [
    { key: "weight", label: "وزن (گرم)", type: "number" },
    { key: "dimensions", label: "ابعاد (مثال: ۲۰×۱۵×۵ سانتی‌متر)", type: "text" },
    { key: "stock", label: "موجودی (عدد)", type: "number" },
    { key: "shippingDays", label: "مدت ارسال (روز)", type: "number" },
  ],
  "ebook": [
    { key: "pageCount", label: "تعداد صفحات", type: "number" },
    { key: "format", label: "فرمت فایل", type: "select", options: ["PDF", "EPUB", "MOBI", "PDF + EPUB", "PDF + EPUB + MOBI"] },
    { key: "fileSize", label: "حجم فایل (MB)", type: "number" },
    { key: "language", label: "زبان", type: "text" },
  ],
  "printed-book": [
    { key: "pageCount", label: "تعداد صفحات", type: "number" },
    { key: "publisher", label: "ناشر", type: "text" },
    { key: "isbn", label: "شابک (ISBN)", type: "text" },
    { key: "edition", label: "ویرایش", type: "text" },
    { key: "shippingDays", label: "مدت ارسال (روز)", type: "number" },
  ],
  "premium-tools": [
    { key: "licenseType", label: "نوع لایسنس", type: "select", options: ["دائمی", "سالانه", "ماهانه", "اشتراکی"] },
    { key: "validityDays", label: "مدت اعتبار (روز)", type: "number" },
    { key: "userCount", label: "تعداد کاربر مجاز", type: "number" },
    { key: "platform", label: "پلتفرم", type: "text" },
  ],
  "seminar": [
    { key: "eventDate", label: "تاریخ برگزاری", type: "text" },
    { key: "location", label: "مکان برگزاری", type: "text" },
    { key: "capacity", label: "ظرفیت (نفر)", type: "number" },
    { key: "medium", label: "نحوه برگزاری", type: "select", options: ["آنلاین", "حضوری", "هیبریدی"] },
    { key: "duration", label: "مدت (ساعت)", type: "number" },
  ],
  "services": [
    { key: "deliveryDays", label: "زمان تحویل (روز)", type: "number" },
    { key: "revisions", label: "تعداد ویرایش رایگان", type: "number" },
    { key: "supportDays", label: "پشتیبانی پس از تحویل (روز)", type: "number" },
    { key: "deliverables", label: "دستاوردهای قابل تحویل", type: "textarea" },
  ],
  "consulting": [
    { key: "sessionDuration", label: "مدت جلسه (دقیقه)", type: "number" },
    { key: "sessionCount", label: "تعداد جلسات", type: "number" },
    { key: "medium", label: "نحوه مشاوره", type: "select", options: ["آنلاین", "حضوری", "تلفنی", "ترکیبی"] },
    { key: "responseTime", label: "زمان پاسخگویی", type: "text" },
    { key: "specialty", label: "حوزه تخصصی", type: "text" },
  ],
  "digital-files": [
    { key: "fileCount", label: "تعداد فایل", type: "number" },
    { key: "format", label: "فرمت‌ها", type: "text" },
    { key: "totalSize", label: "حجم کل (MB)", type: "number" },
    { key: "accessType", label: "نوع دسترسی", type: "select", options: ["دانلود مستقیم", "لینک دانلود", "دسترسی آنلاین"] },
  ],
  "vip-membership": [
    { key: "validityDays", label: "مدت عضویت (روز)", type: "number" },
    { key: "benefits", label: "مزایای عضویت (هر خط یک مزیت)", type: "textarea" },
    { key: "accessLevel", label: "سطح دسترسی", type: "text" },
  ],
  "hypnotherapy": [
    { key: "sessionDuration", label: "مدت جلسه (دقیقه)", type: "number" },
    { key: "sessionCount", label: "تعداد جلسات", type: "number" },
    { key: "medium", label: "نحوه برگزاری", type: "select", options: ["آنلاین", "حضوری"] },
    { key: "technique", label: "تکنیک استفاده‌شده", type: "text" },
    { key: "goal", label: "هدف درمانی", type: "text" },
  ],
  "coaching": [
    { key: "sessionDuration", label: "مدت جلسه (دقیقه)", type: "number" },
    { key: "sessionCount", label: "تعداد جلسات", type: "number" },
    { key: "programDuration", label: "مدت دوره (هفته)", type: "number" },
    { key: "medium", label: "نحوه برگزاری", type: "select", options: ["آنلاین", "حضوری", "ترکیبی"] },
    { key: "specialty", label: "حوزه کوچینگ", type: "text" },
  ],
};

const PRODUCT_TYPES = [
  { value: "video", label: "ویدیو" },
  { value: "audio", label: "فایل صوتی" },
  { value: "pdf", label: "PDF / کتاب" },
  { value: "physical", label: "محصول فیزیکی" },
  { value: "other", label: "سایر" },
];

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border sticky top-0 bg-card">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function CategoryForm({ init, onSave, onCancel }: { init: Partial<Category>; onSave: (d: any) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState({ name: init.name ?? "", slug: init.slug ?? "", sortOrder: init.sortOrder ?? 0 });
  const [saving, setSaving] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await onSave(d); } catch (e: any) { alert(e.message); setSaving(false); }
  }
  return (
    <form onSubmit={submit} className="space-y-3">
      <div><label className="label">نام دسته‌بندی *</label><input className="input" value={d.name} onChange={e => setD(p => ({ ...p, name: e.target.value }))} required /></div>
      <div><label className="label">Slug (انگلیسی) *</label><input className="input ltr" value={d.slug} onChange={e => setD(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, "-") }))} placeholder="e.g. ebook" required /></div>
      <div><label className="label">ترتیب نمایش</label><input type="number" className="input" value={d.sortOrder} onChange={e => setD(p => ({ ...p, sortOrder: Number(e.target.value) }))} /></div>
      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">انصراف</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "ذخیره..." : "ذخیره"}</button>
      </div>
    </form>
  );
}

function ProductForm({ init, categories, onSave, onCancel }: {
  init: Partial<Product>; categories: Category[];
  onSave: (d: any) => Promise<void>; onCancel: () => void;
}) {
  const [d, setD] = useState({
    title: init.title ?? "",
    description: init.description ?? "",
    image: init.image ?? "",
    audioUrl: init.audioUrl ?? "",
    price: init.price ?? 0,
    isPublished: init.isPublished ?? false,
    categoryId: init.categoryId ?? null as number | null,
    productType: init.productType ?? "other",
    files: (init.files ?? []) as ProductFile[],
    metadata: (init.metadata ?? {}) as Record<string, unknown>,
  });
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({});

  // ── HypnoPart state ────────────────────────────────
  function initParts(files: ProductFile[]): HypnoPart[] {
    const vids = files.filter(f => f.fileType === "video");
    const auds = files.filter(f => f.fileType === "audio");
    const count = Math.max(vids.length, auds.length, 1);
    return Array.from({ length: count }, (_, i) => ({
      id: `part-${Date.now()}-${i}`,
      title: vids[i]?.title || auds[i]?.title || "",
      description: vids[i]?.description || auds[i]?.description || "",
      video: vids[i],
      audio: auds[i],
    }));
  }
  const [hypnoParts, setHypnoParts] = useState<HypnoPart[]>(() => initParts(init.files ?? []));

  function addPart() {
    setHypnoParts(p => [...p, { id: `part-${Date.now()}`, title: "", description: "", video: undefined, audio: undefined }]);
  }
  function removePart(id: string) {
    setHypnoParts(p => p.filter(x => x.id !== id));
  }
  function updatePart(id: string, changes: Partial<HypnoPart>) {
    setHypnoParts(p => p.map(x => x.id === id ? { ...x, ...changes } : x));
  }
  async function uploadPartFile(partId: string, type: "video" | "audio", file: File) {
    const key = `${partId}-${type}`;
    setUploadProgress(p => ({ ...p, [key]: 0 }));
    try {
      const r = await uploadFileWithProgress("/upload/file", file, (pct) => {
        setUploadProgress(p => ({ ...p, [key]: pct }));
      });
      const pf: ProductFile = { url: r.url, name: file.name, size: file.size, fileType: type };
      updatePart(partId, { [type]: pf });
    } catch (e: any) { alert(e.message); }
    finally { setUploadProgress(p => { const n = { ...p }; delete n[key]; return n; }); }
  }

  const selectedCatSlug = categories.find(c => c.id === d.categoryId)?.slug ?? null;
  const isHypnotherapy = selectedCatSlug === "hypnotherapy";
  const extraFields: FieldDef[] = selectedCatSlug ? (CATEGORY_EXTRA_FIELDS[selectedCatSlug] ?? []) : [];

  function setMeta(key: string, value: unknown) {
    setD(p => ({ ...p, metadata: { ...p.metadata, [key]: value } }));
  }
  const getMeta = (key: string) => d.metadata[key] ?? "";

  async function uploadImage(f: File) {
    setUploading(true);
    try { const r = await uploadFile("/upload/image", f); setD(p => ({ ...p, image: r.url })); }
    catch (e: any) { alert(e.message); } finally { setUploading(false); }
  }

  async function uploadDescriptionAudio(f: File) {
    setUploadingAudio(true);
    setAudioUploadProgress(0);
    try {
      const r = await uploadFileWithProgress("/upload/audio", f, pct => setAudioUploadProgress(pct));
      setD(p => ({ ...p, audioUrl: r.url }));
    } catch (e: any) { alert(e.message); } finally { setUploadingAudio(false); setAudioUploadProgress(0); }
  }

  async function uploadProductFile(f: File, fileType?: string) {
    setUploadingFile(true);
    try {
      const r = await uploadFile("/upload/file", f);
      setD(p => ({ ...p, files: [...p.files, { url: r.url, name: f.name, size: f.size, ...(fileType ? { fileType } : {}) }] }));
    } catch (e: any) { alert(e.message); } finally { setUploadingFile(false); }
  }

  function removeFile(idx: number) {
    setD(p => ({ ...p, files: p.files.filter((_, i) => i !== idx) }));
  }

  function updateFile(idx: number, changes: Partial<ProductFile>) {
    setD(p => ({ ...p, files: p.files.map((f, i) => i === idx ? { ...f, ...changes } : f) }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    // sync hypno parts → files
    const finalFiles = isHypnotherapy
      ? hypnoParts.flatMap(p => [
          p.video ? { ...p.video, title: p.title, description: p.description, fileType: "video" } : null,
          p.audio ? { ...p.audio, title: p.title, description: p.description, fileType: "audio" } : null,
        ].filter(Boolean) as ProductFile[])
      : d.files;
    try {
      await onSave({
        title: d.title, description: d.description || null,
        image: d.image || null, audioUrl: d.audioUrl || null,
        price: Number(d.price),
        isPublished: d.isPublished, categoryId: d.categoryId,
        productType: d.productType, files: finalFiles, metadata: d.metadata,
      });
    } catch (e: any) { alert(e.message); setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div><label className="label">عنوان *</label><input className="input" value={d.title} onChange={e => setD(p => ({ ...p, title: e.target.value }))} required /></div>
      <div><label className="label">توضیحات</label><textarea className="input min-h-[80px] resize-none" value={d.description} onChange={e => setD(p => ({ ...p, description: e.target.value }))} /></div>

      {/* ── فایل صوتی توضیحات ── */}
      <div>
        <label className="label flex items-center gap-1.5"><Headphones size={13} />فایل صوتی توضیحات (اختیاری)</label>
        <p className="text-xs text-muted-foreground mb-2">کاربران می‌توانند به جای خواندن توضیحات، به آن گوش دهند</p>
        {d.audioUrl ? (
          <div className="flex flex-col gap-2">
            <audio src={d.audioUrl} controls className="w-full h-9 rounded" />
            <button type="button" onClick={() => setD(p => ({ ...p, audioUrl: "" }))}
              className="text-xs text-destructive hover:underline text-right">
              حذف فایل صوتی توضیحات
            </button>
          </div>
        ) : (
          <label className="flex flex-col w-full rounded-lg border border-dashed border-border cursor-pointer hover:bg-muted/40 transition-colors overflow-hidden">
            <span className="flex items-center justify-center gap-2 py-2.5 text-sm text-muted-foreground">
              <Headphones size={14} />
              {uploadingAudio ? `در حال آپلود... ${audioUploadProgress}%` : "آپلود فایل صوتی توضیحات"}
            </span>
            {uploadingAudio && (
              <div className="w-full h-1 bg-muted">
                <div className="h-1 transition-all duration-200" style={{ width: `${audioUploadProgress}%`, background: "hsl(var(--primary))" }} />
              </div>
            )}
            <input type="file" accept="audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus" className="hidden"
              disabled={uploadingAudio}
              onChange={e => e.target.files?.[0] && uploadDescriptionAudio(e.target.files[0])} />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">نوع محصول</label>
          <select className="input" value={d.productType} onChange={e => setD(p => ({ ...p, productType: e.target.value }))}>
            {PRODUCT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
        </div>
        <div>
          <label className="label">دسته‌بندی</label>
          <select className="input" value={d.categoryId ?? ""} onChange={e => setD(p => ({ ...p, categoryId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">بدون دسته‌بندی</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">قیمت (تومان)</label><input type="number" className="input" value={d.price} onChange={e => setD(p => ({ ...p, price: Number(e.target.value) }))} /></div>
        <div className="flex items-end pb-1"><label className="flex items-center gap-2 cursor-pointer text-sm"><input type="checkbox" checked={d.isPublished} onChange={e => setD(p => ({ ...p, isPublished: e.target.checked }))} className="w-4 h-4 rounded" />منتشر شده</label></div>
      </div>

      <div>
        <label className="label">تصویر کاور (مربعی)</label>
        <div className="flex gap-2">
          <input className="input flex-1" placeholder="آدرس URL" value={d.image} onChange={e => setD(p => ({ ...p, image: e.target.value }))} />
          <label className="btn-secondary cursor-pointer flex items-center gap-1 text-sm px-3">
            <Upload size={14} /> {uploading ? "..." : "آپلود"}
            <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0])} />
          </label>
        </div>
        {d.image && <img src={d.image} className="mt-2 h-20 w-20 rounded-lg object-cover" />}
      </div>

      {/* ── Category-specific extra fields ── */}
      {extraFields.length > 0 && (
        <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
            اطلاعات اختصاصی · {categories.find(c => c.id === d.categoryId)?.name}
          </p>
          {extraFields.map(field => (
            <div key={field.key}>
              <label className="label">{field.label}</label>
              {field.type === "textarea" ? (
                <textarea
                  className="input min-h-[70px] resize-none text-sm"
                  value={String(getMeta(field.key))}
                  onChange={e => setMeta(field.key, e.target.value)}
                  placeholder={field.label}
                />
              ) : field.type === "select" ? (
                <select className="input" value={String(getMeta(field.key))} onChange={e => setMeta(field.key, e.target.value)}>
                  <option value="">انتخاب کنید</option>
                  {field.options.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : field.type === "number" ? (
                <input
                  type="number"
                  className="input"
                  value={getMeta(field.key) === "" ? "" : Number(getMeta(field.key))}
                  onChange={e => setMeta(field.key, e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder={field.label}
                />
              ) : (
                <input
                  type="text"
                  className="input"
                  value={String(getMeta(field.key))}
                  onChange={e => setMeta(field.key, e.target.value)}
                  placeholder={field.label}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── File upload — همیشه اختیاری ── */}
      <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">فایل‌های دیجیتال (اختیاری)</p>
        {isHypnotherapy ? (
          <div className="space-y-3">
            {hypnoParts.map((part, pi) => (
              <div key={part.id} className="rounded-xl border border-border bg-background p-4 space-y-3">
                {/* سربرگ پارت */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold">پارت {pi + 1}</span>
                  {hypnoParts.length > 1 && (
                    <button type="button" onClick={() => removePart(part.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full text-destructive hover:bg-destructive/10">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* عنوان و توضیحات */}
                <input className="input text-sm" placeholder="عنوان پارت *"
                  value={part.title} onChange={e => updatePart(part.id, { title: e.target.value })} />
                <textarea className="input text-sm resize-none" placeholder="توضیحات (اختیاری)" rows={2}
                  value={part.description} onChange={e => updatePart(part.id, { description: e.target.value })} />

                {/* ویدیو */}
                <div className="space-y-1">
                  <label className="label text-xs">🎬 ویدیو</label>
                  {part.video ? (
                    <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 rounded-lg px-3 py-2">
                      <File size={13} className="text-blue-400 shrink-0" />
                      <span className="text-xs flex-1 truncate text-muted-foreground">{part.video.name}</span>
                      {part.video.size && <span className="text-xs text-muted-foreground">{(part.video.size/1024/1024).toFixed(1)} MB</span>}
                      <button type="button" onClick={() => updatePart(part.id, { video: undefined })}
                        className="text-destructive hover:text-destructive/80"><X size={13} /></button>
                    </div>
                  ) : uploadProgress[`${part.id}-video`] !== undefined ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>در حال آپلود ویدیو...</span>
                        <span>{uploadProgress[`${part.id}-video`]}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full bg-blue-500 transition-all duration-300"
                          style={{ width: `${uploadProgress[`${part.id}-video`]}%` }} />
                      </div>
                    </div>
                  ) : (
                    <label className="btn-secondary cursor-pointer flex items-center gap-2 text-xs w-full justify-center py-2">
                      <Upload size={13} /> آپلود ویدیو
                      <input type="file" accept="video/*" className="hidden"
                        onChange={e => e.target.files?.[0] && uploadPartFile(part.id, "video", e.target.files[0])} />
                    </label>
                  )}
                </div>

                {/* صوت */}
                <div className="space-y-1">
                  <label className="label text-xs">🎧 فایل صوتی</label>
                  {part.audio ? (
                    <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
                      <File size={13} className="text-green-400 shrink-0" />
                      <span className="text-xs flex-1 truncate text-muted-foreground">{part.audio.name}</span>
                      {part.audio.size && <span className="text-xs text-muted-foreground">{(part.audio.size/1024/1024).toFixed(1)} MB</span>}
                      <button type="button" onClick={() => updatePart(part.id, { audio: undefined })}
                        className="text-destructive hover:text-destructive/80"><X size={13} /></button>
                    </div>
                  ) : uploadProgress[`${part.id}-audio`] !== undefined ? (
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>در حال آپلود صوت...</span>
                        <span>{uploadProgress[`${part.id}-audio`]}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                        <div className="h-2 rounded-full bg-green-500 transition-all duration-300"
                          style={{ width: `${uploadProgress[`${part.id}-audio`]}%` }} />
                      </div>
                    </div>
                  ) : (
                    <label className="btn-secondary cursor-pointer flex items-center gap-2 text-xs w-full justify-center py-2">
                      <Upload size={13} /> آپلود صوت
                      <input type="file" accept="audio/*,.mp3,.wav,.ogg,.aac,.flac,.m4a,.wma,.opus,.aiff,.mp4a" className="hidden"
                        onChange={e => e.target.files?.[0] && uploadPartFile(part.id, "audio", e.target.files[0])} />
                    </label>
                  )}
                </div>
              </div>
            ))}

            {/* دکمه افزودن پارت جدید */}
            <button type="button" onClick={addPart}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border-2 border-dashed border-border text-muted-foreground hover:border-primary hover:text-primary transition-colors text-sm font-medium">
              <Plus size={16} /> افزودن پارت جدید
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {d.files.map((f, i) => (
              <div key={i} className="bg-background rounded-lg p-3 border border-border space-y-2">
                <div className="flex items-center gap-2">
                  <File size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-xs flex-1 truncate text-muted-foreground">{f.name}</span>
                  {f.size && <span className="text-xs text-muted-foreground">{(f.size/1024/1024).toFixed(1)} MB</span>}
                  <button type="button" onClick={() => removeFile(i)} className="text-destructive hover:text-destructive/80"><X size={14} /></button>
                </div>
                <input className="input text-sm" placeholder="عنوان فایل *" value={f.title ?? ""} onChange={e => updateFile(i, { title: e.target.value })} />
                <input className="input text-sm" placeholder="توضیحات (اختیاری)" value={f.description ?? ""} onChange={e => updateFile(i, { description: e.target.value })} />
              </div>
            ))}
            <label className="btn-secondary cursor-pointer flex items-center gap-2 text-sm w-full justify-center py-2">
              <Upload size={14} /> {uploadingFile ? "در حال آپلود..." : "افزودن فایل"}
              <input type="file" accept="video/*,audio/*,.pdf,.zip,.rar,.epub,.mobi" className="hidden" onChange={e => e.target.files?.[0] && uploadProductFile(e.target.files[0])} disabled={uploadingFile} />
            </label>
          </div>
        )}
      </div>

      {(init as any).id && <DiscountPanel type="product" id={(init as any).id} />}

      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">انصراف</button>
        <button type="submit" disabled={saving || uploading} className="btn-primary">{saving ? "در حال ذخیره..." : "ذخیره"}</button>
      </div>
    </form>
  );
}

type ModalState = null | "create-product" | "create-cat" | { type: "edit-product"; item: Product } | { type: "edit-cat"; item: Category };

const SLUG_ICON: Record<string, string> = {
  "physical": "📦", "ebook": "📱", "printed-book": "📚",
  "premium-tools": "💎", "seminar": "🎤", "services": "⚙️",
  "consulting": "💬", "digital-files": "☁️", "vip-membership": "👑",
  "hypnotherapy": "🧠", "coaching": "🏆",
};

export default function Products() {
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<ModalState>(null);
  const [tab, setTab] = useState<"products" | "categories">("products");

  async function load() {
    const [p, c] = await Promise.all([get<Product[]>("/admin/products"), get<Category[]>("/admin/product-categories")]);
    setProducts(p); setCategories(c); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const getCatName = (id: number | null | undefined) => categories.find(c => c.id === id)?.name ?? "—";
  const getCatSlug = (id: number | null | undefined) => categories.find(c => c.id === id)?.slug ?? "";

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">محصولات</h1>
        <div className="flex gap-2">
          <button onClick={() => setModal("create-cat")} className="btn-secondary flex items-center gap-2 text-sm"><Tag size={14} /> دسته‌بندی جدید</button>
          <button onClick={() => setModal("create-product")} className="btn-primary flex items-center gap-2"><Plus size={16} /> محصول جدید</button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-border pb-2">
        <button onClick={() => setTab("products")} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${tab === "products" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          محصولات ({products.length})
        </button>
        <button onClick={() => setTab("categories")} className={`text-sm font-medium px-3 py-1.5 rounded-lg transition-colors ${tab === "categories" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}>
          دسته‌بندی‌ها ({categories.length})
        </button>
      </div>

      {tab === "categories" && (
        <div className="space-y-2">
          {categories.length === 0 && <p className="text-muted-foreground text-center py-10">هیچ دسته‌بندی‌ای یافت نشد</p>}
          {categories.map(cat => (
            <div key={cat.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-xl">{SLUG_ICON[cat.slug] ?? "🏷️"}</span>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold">{cat.name}</span>
                    <span className="text-xs text-muted-foreground ltr bg-secondary rounded px-1.5 py-0.5">{cat.slug}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs text-muted-foreground">ترتیب: {cat.sortOrder}</span>
                    {CATEGORY_EXTRA_FIELDS[cat.slug] && (
                      <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">
                        {CATEGORY_EXTRA_FIELDS[cat.slug].length} فیلد اختصاصی
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1">
                <button onClick={() => setModal({ type: "edit-cat", item: cat })} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil size={14} /></button>
                <button onClick={async () => { if (!confirm("حذف این دسته‌بندی؟")) return; await del(`/admin/product-categories/${cat.id}`); await load(); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "products" && (
        <>
          {products.length === 0 && <p className="text-muted-foreground text-center py-10">هیچ محصولی یافت نشد</p>}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {products.map(item => {
              const slug = getCatSlug(item.categoryId);
              const extraCount = slug ? Object.keys(item.metadata ?? {}).filter(k => (item.metadata as any)[k] !== "" && (item.metadata as any)[k] !== null && (item.metadata as any)[k] !== undefined).length : 0;
              return (
                <div key={item.id} className="bg-card rounded-xl border border-border p-4">
                  {item.image && <img src={item.image} className="w-full aspect-square rounded-lg object-cover mb-3" />}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 mb-1">
                        {slug && <span className="text-base">{SLUG_ICON[slug] ?? "🏷️"}</span>}
                        <h3 className="font-semibold text-sm truncate">{item.title}</h3>
                      </div>
                      <p className="text-sm text-muted-foreground">{item.price.toLocaleString("fa-IR")} تومان</p>
                      <div className="flex gap-1 mt-1.5 flex-wrap">
                        <span className="text-xs bg-secondary rounded px-1.5 py-0.5">{PRODUCT_TYPES.find(t => t.value === item.productType)?.label ?? item.productType}</span>
                        {item.categoryId && <span className="text-xs bg-primary/10 text-primary rounded px-1.5 py-0.5">{getCatName(item.categoryId)}</span>}
                        {item.isPublished ? <span className="text-xs bg-green-500/10 text-green-500 rounded px-1.5 py-0.5">منتشر</span> : <span className="text-xs bg-secondary rounded px-1.5 py-0.5">پیش‌نویس</span>}
                        {extraCount > 0 && <span className="text-xs bg-blue-500/10 text-blue-400 rounded px-1.5 py-0.5">{extraCount} فیلد تکمیل شده</span>}
                      </div>
                      {item.files && item.files.length > 0 && <p className="text-xs text-muted-foreground mt-1">{item.files.length} فایل پیوست</p>}
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <button onClick={() => setModal({ type: "edit-product", item })} className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground"><Pencil size={14} /></button>
                      <button onClick={async () => { if (!confirm("حذف این محصول؟")) return; await del(`/admin/products/${item.id}`); await load(); }} className="p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"><Trash2 size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {modal === "create-cat" && (
        <Modal title="دسته‌بندی جدید" onClose={() => setModal(null)}>
          <CategoryForm init={{}} onSave={async d => { await post("/admin/product-categories", d); await load(); setModal(null); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal && typeof modal === "object" && modal.type === "edit-cat" && (
        <Modal title="ویرایش دسته‌بندی" onClose={() => setModal(null)}>
          <CategoryForm init={modal.item} onSave={async d => { await put(`/admin/product-categories/${modal.item.id}`, d); await load(); setModal(null); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal === "create-product" && (
        <Modal title="محصول جدید" onClose={() => setModal(null)}>
          <ProductForm init={{}} categories={categories} onSave={async d => { await post("/admin/products", d); await load(); setModal(null); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal && typeof modal === "object" && modal.type === "edit-product" && (
        <Modal title="ویرایش محصول" onClose={() => setModal(null)}>
          <ProductForm init={modal.item} categories={categories} onSave={async d => { await put(`/admin/products/${modal.item.id}`, d); await load(); setModal(null); }} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
