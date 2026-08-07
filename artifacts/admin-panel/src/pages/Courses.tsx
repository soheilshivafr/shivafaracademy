import { useEffect, useState } from "react";
import { get, post, put, del, uploadFile, uploadFileWithProgress, normalizeImageUrl } from "@/lib/api";
import { Plus, Pencil, Trash2, ChevronDown, ChevronUp, Upload, Paperclip, X, FileText, Headphones, Video } from "lucide-react";
import { DiscountPanel } from "@/components/DiscountPanel";

interface Faq { question: string; answer: string; order?: number; }
interface Phase { id: number; courseId: number; title: string; order: number; }
interface Attachment { id?: number; lessonId?: number; title?: string | null; fileUrl: string; fileType?: string | null; fileName?: string | null; fileSize?: number | null; order?: number; }
interface Course {
  id: number; title: string; description?: string | null; image?: string | null;
  thumbnail?: string | null; audioUrl?: string | null;
  price: number; isPublished: boolean;
  results?: string[] | null; faqs?: Faq[];
  isPhased?: boolean; phases?: Phase[];
}
interface Lesson {
  id: number; courseId: number; title: string; description?: string | null;
  videoUrl?: string | null; audioUrl?: string | null; duration?: number | null; order: number; isFree: boolean;
  phaseId?: number | null; attachments?: Attachment[];
}

const empty: Omit<Course, "id"> = { title: "", description: "", image: "", thumbnail: "", price: 0, isPublished: false, results: [], faqs: [], isPhased: false, phases: [] };

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-card rounded-xl border border-border w-full max-w-xl my-4 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ImageUploadField({ label, value, field, onChange }: {
  label: string;
  value: string;
  field: "image" | "thumbnail";
  onChange: (url: string) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  async function upload(f: File) {
    setUploading(true);
    setProgress(0);
    try {
      const r = await uploadFileWithProgress("/upload/image", f, (pct) => setProgress(pct));
      onChange(normalizeImageUrl(r.url));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  const displayUrl = normalizeImageUrl(value);

  return (
    <div>
      <label className="label">{label}</label>
      <div className="flex gap-2">
        <input
          className="input flex-1"
          placeholder="آدرس URL"
          value={value}
          onChange={e => onChange(e.target.value)}
          disabled={uploading}
        />
        <label className={`btn-secondary cursor-pointer flex items-center gap-1 text-sm px-3 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
          <Upload size={14} />
          {uploading ? `${progress}%` : "آپلود"}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={e => e.target.files?.[0] && upload(e.target.files[0])}
            disabled={uploading}
          />
        </label>
      </div>
      {uploading && (
        <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-200"
            style={{ width: `${progress}%`, background: "hsl(var(--primary))" }}
          />
        </div>
      )}
      {displayUrl && !uploading && (
        <img
          src={displayUrl}
          className="mt-2 h-20 rounded object-cover bg-muted"
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
        />
      )}
    </div>
  );
}

function CourseForm({ init, onSave, onCancel }: { init: Partial<Course>; onSave: (d: any) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState({
    title: init.title ?? "", description: init.description ?? "",
    image: init.image ?? "", thumbnail: init.thumbnail ?? "",
    audioUrl: init.audioUrl ?? "",
    price: init.price ?? 0, isPublished: init.isPublished ?? false,
    isPhased: init.isPhased ?? false,
    results: (init.results ?? []).join("\n"),
    faqs: init.faqs ?? [] as Faq[]
  });
  const [saving, setSaving] = useState(false);
  const [uploadingAudio, setUploadingAudio] = useState(false);
  const [audioUploadProgress, setAudioUploadProgress] = useState(0);

  async function uploadDescriptionAudio(f: File) {
    setUploadingAudio(true);
    setAudioUploadProgress(0);
    try {
      const r = await uploadFileWithProgress("/upload/audio", f, pct => setAudioUploadProgress(pct));
      setD(p => ({ ...p, audioUrl: r.url }));
    } catch (e: any) { alert(e.message); } finally { setUploadingAudio(false); setAudioUploadProgress(0); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await onSave({
        title: d.title, description: d.description || null, image: d.image || null,
        thumbnail: d.thumbnail || null, audioUrl: d.audioUrl || null,
        price: Number(d.price), isPublished: d.isPublished,
        isPhased: d.isPhased,
        results: d.results ? d.results.split("\n").map(s => s.trim()).filter(Boolean) : [],
        faqs: d.faqs,
      });
    } catch (e: any) { alert(e.message); setSaving(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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
          <label className="label">قیمت (تومان)</label>
          <input type="number" className="input" value={d.price} onChange={e => setD(p => ({ ...p, price: Number(e.target.value) }))} />
        </div>
        <div className="flex items-end pb-1">
          <label className="flex items-center gap-2 cursor-pointer text-sm">
            <input type="checkbox" checked={d.isPublished} onChange={e => setD(p => ({ ...p, isPublished: e.target.checked }))} className="w-4 h-4 rounded" />
            منتشر شده
          </label>
        </div>
      </div>
      <div>
        <label className="flex items-center gap-2 cursor-pointer text-sm">
          <input type="checkbox" checked={d.isPhased} onChange={e => setD(p => ({ ...p, isPhased: e.target.checked }))} className="w-4 h-4 rounded" />
          فازبندی دوره (گروه‌بندی جلسات در فازها)
        </label>
      </div>

      <ImageUploadField
        label="تصویر اصلی (بزرگ - صفحه دوره)"
        value={d.image}
        field="image"
        onChange={url => setD(p => ({ ...p, image: url }))}
      />

      <div>
        <ImageUploadField
          label="تصویر کوچک (لیست محصولات)"
          value={d.thumbnail}
          field="thumbnail"
          onChange={url => setD(p => ({ ...p, thumbnail: url }))}
        />
        {!d.thumbnail && <p className="text-xs text-muted-foreground mt-1">اگر خالی باشد، تصویر اصلی استفاده می‌شود</p>}
      </div>

      <div>
        <label className="label">نتایج یادگیری (هر خط یک مورد)</label>
        <textarea className="input min-h-[70px] resize-none" value={d.results} onChange={e => setD(p => ({ ...p, results: e.target.value }))} placeholder="مهارت اول&#10;مهارت دوم" />
      </div>
      {init.id && <DiscountPanel type="course" id={init.id} />}

      <div className="flex gap-2 justify-end pt-2">
        <button type="button" onClick={onCancel} className="btn-secondary">انصراف</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "در حال ذخیره..." : "ذخیره"}</button>
      </div>
    </form>
  );
}

function LessonRow({ lesson, displayNumber, onEdit, onDelete }: { lesson: Lesson; displayNumber: number; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center justify-between py-2 px-3 bg-muted/50 rounded-lg text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-muted-foreground text-xs w-5 text-center shrink-0">{displayNumber}</span>
        <span className="font-medium truncate">{lesson.title}</span>
        {lesson.isFree && <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded shrink-0">رایگان</span>}
        {lesson.videoUrl && <span className="text-xs bg-violet-100 text-violet-700 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0"><Video size={10} />ویدیو</span>}
        {lesson.audioUrl && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded flex items-center gap-0.5 shrink-0"><Headphones size={10} />صدا</span>}
        {lesson.duration && <span className="text-xs text-muted-foreground shrink-0">{lesson.duration} دقیقه</span>}
        {!!(lesson.attachments?.length) && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5 shrink-0"><Paperclip size={11} /> {lesson.attachments.length}</span>
        )}
      </div>
      <div className="flex gap-1 shrink-0">
        <button onClick={onEdit} className="p-1.5 text-muted-foreground hover:text-foreground rounded"><Pencil size={13} /></button>
        <button onClick={onDelete} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={13} /></button>
      </div>
    </div>
  );
}

const AUDIO_EXTENSIONS = ["mp3", "wav", "ogg", "m4a", "aac", "flac", "opus", "wma", "aiff", "webm"];
const AUDIO_MIMES = ["audio/"];

function isAudioFile(file: File) {
  if (file.type && AUDIO_MIMES.some(m => file.type.startsWith(m))) return true;
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  return AUDIO_EXTENSIONS.includes(ext);
}

function LessonForm({ init, phases, isPhased, onSave, onCancel }: { init?: Partial<Lesson>; phases: Phase[]; isPhased: boolean; onSave: (d: any) => Promise<void>; onCancel: () => void }) {
  const [d, setD] = useState({
    title: init?.title ?? "", description: init?.description ?? "",
    videoUrl: init?.videoUrl ?? "", audioUrl: init?.audioUrl ?? "",
    duration: init?.duration ?? "", order: init?.order ?? 0,
    isFree: init?.isFree ?? false, phaseId: init?.phaseId ?? null as number | null,
    mediaType: init?.audioUrl ? "audio" : "video" as "video" | "audio",
  });
  const [attachments, setAttachments] = useState<Attachment[]>(init?.attachments ?? []);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [attUploading, setAttUploading] = useState(false);

  async function uploadVid(f: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const r = await uploadFileWithProgress("/upload/video", f, pct => setUploadProgress(pct));
      setD(p => ({ ...p, videoUrl: r.url }));
    } catch (e: any) { alert(e.message); }
    finally { setUploading(false); }
  }

  async function uploadAud(f: File) {
    setUploading(true);
    setUploadProgress(0);
    try {
      const r = await uploadFileWithProgress("/upload/audio", f, pct => setUploadProgress(pct));
      setD(p => ({ ...p, audioUrl: r.url }));
    } catch (e: any) { alert(e.message); }
    finally { setUploading(false); }
  }

  async function handleMediaFile(f: File) {
    if (isAudioFile(f)) {
      setD(p => ({ ...p, mediaType: "audio" }));
      await uploadAud(f);
    } else {
      setD(p => ({ ...p, mediaType: "video" }));
      await uploadVid(f);
    }
  }

  async function addAttachments(files: FileList) {
    setAttUploading(true);
    try {
      for (const f of Array.from(files)) {
        const r = await uploadFileWithProgress("/upload/file", f, () => {});
        setAttachments(prev => [...prev, { fileUrl: r.url, fileName: f.name, fileType: f.type, fileSize: f.size, title: f.name }]);
      }
    } catch (e: any) { alert(e.message); }
    finally { setAttUploading(false); }
  }

  function removeAttachment(idx: number) { setAttachments(prev => prev.filter((_, i) => i !== idx)); }
  function setAttachmentTitle(idx: number, title: string) { setAttachments(prev => prev.map((a, i) => i === idx ? { ...a, title } : a)); }

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try {
      await onSave({
        title: d.title, description: d.description || null,
        videoUrl: d.mediaType === "video" ? (d.videoUrl || null) : null,
        audioUrl: d.mediaType === "audio" ? (d.audioUrl || null) : null,
        duration: d.duration ? Number(d.duration) : null,
        order: Number(d.order), isFree: d.isFree,
        phaseId: isPhased ? (d.phaseId ? Number(d.phaseId) : null) : null,
        attachments: attachments.map((a, i) => ({ title: a.title || null, fileUrl: a.fileUrl, fileType: a.fileType ?? null, fileName: a.fileName ?? null, fileSize: a.fileSize ?? null, order: i })),
      });
    } catch (e: any) { alert(e.message); setSaving(false); }
  }

  const currentMediaUrl = d.mediaType === "audio" ? d.audioUrl : d.videoUrl;

  return (
    <form onSubmit={submit} className="space-y-3">
      <div><label className="label">عنوان درس *</label><input className="input" value={d.title} onChange={e => setD(p => ({ ...p, title: e.target.value }))} required /></div>
      <div><label className="label">توضیحات</label><textarea className="input min-h-[60px] resize-none" value={d.description} onChange={e => setD(p => ({ ...p, description: e.target.value }))} /></div>
      {isPhased && (
        <div>
          <label className="label">فاز</label>
          <select className="input" value={d.phaseId ?? ""} onChange={e => setD(p => ({ ...p, phaseId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— بدون فاز —</option>
            {phases.map(ph => <option key={ph.id} value={ph.id}>{ph.title}</option>)}
          </select>
        </div>
      )}

      {/* Media type selector */}
      <div>
        <label className="label">نوع محتوا</label>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setD(p => ({ ...p, mediaType: "video" }))}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${d.mediaType === "video" ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            <Video size={14} /> ویدیو
          </button>
          <button
            type="button"
            onClick={() => setD(p => ({ ...p, mediaType: "audio" }))}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm border transition-colors ${d.mediaType === "audio" ? "bg-primary/10 border-primary text-primary" : "border-border text-muted-foreground"}`}
          >
            <Headphones size={14} /> صوتی
          </button>
        </div>
      </div>

      {/* Media upload */}
      <div>
        <label className="label">{d.mediaType === "audio" ? "فایل صوتی" : "ویدیو"}</label>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-xs"
            placeholder={d.mediaType === "audio" ? "آدرس فایل صوتی" : "آدرس ویدیو"}
            value={currentMediaUrl}
            onChange={e => setD(p => d.mediaType === "audio" ? { ...p, audioUrl: e.target.value } : { ...p, videoUrl: e.target.value })}
          />
          <label className={`btn-secondary cursor-pointer flex items-center gap-1 text-sm px-3 ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            <Upload size={14} />
            {uploading ? `${uploadProgress}%` : "آپلود"}
            <input
              type="file"
              accept={d.mediaType === "audio"
                ? "audio/*,.mp3,.wav,.ogg,.m4a,.aac,.flac,.opus,.wma,.aiff"
                : "video/*"}
              className="hidden"
              disabled={uploading}
              onChange={e => {
                const f = e.target.files?.[0];
                if (!f) return;
                if (d.mediaType === "audio") uploadAud(f);
                else uploadVid(f);
              }}
            />
          </label>
        </div>
        {uploading && (
          <div className="mt-2 h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-200"
              style={{ width: `${uploadProgress}%`, background: "hsl(var(--primary))" }}
            />
          </div>
        )}
        {d.mediaType === "audio" && (
          <p className="text-xs text-muted-foreground mt-1">
            فرمت‌های پشتیبانی‌شده: MP3، WAV، OGG، M4A، AAC، FLAC، Opus، WMA، AIFF
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div><label className="label">مدت (دقیقه)</label><input type="number" className="input" value={d.duration} onChange={e => setD(p => ({ ...p, duration: e.target.value }))} /></div>
        <div><label className="label">ترتیب</label><input type="number" className="input" value={d.order} onChange={e => setD(p => ({ ...p, order: Number(e.target.value) }))} /></div>
      </div>

      <div>
        <label className="label flex items-center gap-1"><Paperclip size={13} /> پیوست‌ها</label>
        <div className="space-y-2">
          {attachments.map((a, i) => (
            <div key={i} className="flex items-center gap-2 py-1.5 px-2 bg-muted/50 rounded-lg text-sm">
              <FileText size={14} className="text-muted-foreground shrink-0" />
              <input className="input flex-1 h-8 text-xs" value={a.title ?? ""} placeholder={a.fileName ?? "عنوان پیوست"} onChange={e => setAttachmentTitle(i, e.target.value)} />
              <span className="text-xs text-muted-foreground truncate max-w-[120px] shrink-0">{a.fileName}</span>
              <button type="button" onClick={() => removeAttachment(i)} className="p-1 text-muted-foreground hover:text-destructive rounded shrink-0"><X size={14} /></button>
            </div>
          ))}
          <label className="btn-secondary cursor-pointer flex items-center gap-1 text-sm px-3 w-fit">
            <Plus size={14} /> {attUploading ? "در حال آپلود..." : "افزودن پیوست"}
            <input type="file" multiple className="hidden" onChange={e => e.target.files?.length && addAttachments(e.target.files)} />
          </label>
        </div>
      </div>

      <label className="flex items-center gap-2 cursor-pointer text-sm">
        <input type="checkbox" checked={d.isFree} onChange={e => setD(p => ({ ...p, isFree: e.target.checked }))} className="w-4 h-4 rounded" />
        درس رایگان (قابل مشاهده بدون خرید)
      </label>

      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary text-sm">انصراف</button>
        <button type="submit" disabled={saving || uploading || attUploading} className="btn-primary text-sm">
          {saving ? "..." : "ذخیره"}
        </button>
      </div>
    </form>
  );
}

export default function Courses() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | { course: Course } | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [lessons, setLessons] = useState<Record<number, Lesson[]>>({});
  const [lessonModal, setLessonModal] = useState<{ courseId: number; lesson?: Lesson } | null>(null);

  async function load() { setCourses(await get<Course[]>("/admin/courses")); setLoading(false); }
  useEffect(() => { load(); }, []);

  async function loadLessons(courseId: number, force = false) {
    if (lessons[courseId] && !force) return;
    const data = await get<Lesson[]>(`/admin/courses/${courseId}/lessons`);
    setLessons(p => ({ ...p, [courseId]: data }));
  }

  async function toggleExpand(id: number) {
    if (expanded === id) { setExpanded(null); return; }
    setExpanded(id);
    await loadLessons(id);
  }

  async function createCourse(data: any) { await post("/admin/courses", data); await load(); setModal(null); }
  async function updateCourse(id: number, data: any) { await put(`/admin/courses/${id}`, data); await load(); setModal(null); }
  async function deleteCourse(id: number) {
    if (!confirm("حذف این دوره؟")) return;
    await del(`/admin/courses/${id}`); await load();
  }
  async function createLesson(courseId: number, data: any) {
    await post<Lesson>(`/admin/courses/${courseId}/lessons`, data);
    await loadLessons(courseId, true);
    setLessonModal(null);
  }
  async function updateLesson(id: number, courseId: number, data: any) {
    await put(`/admin/lessons/${id}`, data);
    await loadLessons(courseId, true);
    setLessonModal(null);
  }
  async function deleteLesson(id: number, courseId: number) {
    if (!confirm("حذف این درس؟")) return;
    await del(`/admin/lessons/${id}`);
    setLessons(p => ({ ...p, [courseId]: (p[courseId] ?? []).filter(l => l.id !== id) }));
  }

  async function addPhase(courseId: number) {
    const title = prompt("عنوان فاز جدید:");
    if (!title || !title.trim()) return;
    const existing = courses.find(c => c.id === courseId)?.phases ?? [];
    await post(`/admin/courses/${courseId}/phases`, { title: title.trim(), order: existing.length });
    await load();
  }
  async function renamePhase(phase: Phase) {
    const title = prompt("عنوان جدید فاز:", phase.title);
    if (!title || !title.trim() || title.trim() === phase.title) return;
    await put(`/admin/phases/${phase.id}`, { title: title.trim(), order: phase.order });
    await load();
  }
  async function deletePhase(phase: Phase, courseId: number) {
    if (!confirm("حذف این فاز؟ (جلسات این فاز حذف نمی‌شوند و بدون فاز خواهند شد)")) return;
    await del(`/admin/phases/${phase.id}`);
    await load();
    await loadLessons(courseId, true);
  }

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  function renderExpanded(c: Course) {
    const courseLessons = lessons[c.id] ?? [];
    const addBtn = (
      <button onClick={() => setLessonModal({ courseId: c.id })} className="flex items-center gap-1 text-xs bg-primary/10 text-primary px-2.5 py-1.5 rounded-lg hover:bg-primary/20">
        <Plus size={12} /> درس جدید
      </button>
    );

    if (c.isPhased) {
      const phases = (c.phases ?? []).slice().sort((a, b) => a.order - b.order);
      const noPhase = courseLessons.filter(l => l.phaseId == null).sort((a, b) => a.order - b.order);
      return (
        <div className="border-t border-border p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-sm">فازها و درس‌ها</h4>
            <div className="flex items-center gap-2">
              <button onClick={() => addPhase(c.id)} className="flex items-center gap-1 text-xs bg-muted text-foreground px-2.5 py-1.5 rounded-lg hover:bg-muted/70">
                <Plus size={12} /> افزودن فاز
              </button>
              {addBtn}
            </div>
          </div>
          {phases.length === 0 && noPhase.length === 0 && (
            <p className="text-muted-foreground text-xs text-center py-4">هنوز فاز یا درسی اضافه نشده</p>
          )}
          {phases.map(ph => {
            const phaseLessons = courseLessons.filter(l => l.phaseId === ph.id).sort((a, b) => a.order - b.order);
            return (
              <div key={ph.id} className="space-y-2">
                <div className="flex items-center justify-between bg-primary/5 rounded-lg px-3 py-2">
                  <h5 className="font-semibold text-sm">{ph.title}</h5>
                  <div className="flex gap-1">
                    <button onClick={() => renamePhase(ph)} className="p-1.5 text-muted-foreground hover:text-foreground rounded"><Pencil size={13} /></button>
                    <button onClick={() => deletePhase(ph, c.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={13} /></button>
                  </div>
                </div>
                {phaseLessons.length === 0
                  ? <p className="text-muted-foreground text-xs text-center py-2">درسی در این فاز نیست</p>
                  : phaseLessons.map((l, i) => (
                    <LessonRow key={l.id} lesson={l} displayNumber={i + 1}
                      onEdit={() => setLessonModal({ courseId: c.id, lesson: l })}
                      onDelete={() => deleteLesson(l.id, c.id)}
                    />
                  ))
                }
              </div>
            );
          })}
          {noPhase.length > 0 && (
            <div className="space-y-2">
              <div className="bg-muted/50 rounded-lg px-3 py-2">
                <h5 className="font-semibold text-sm text-muted-foreground">بدون فاز</h5>
              </div>
              {noPhase.map((l, i) => (
                <LessonRow key={l.id} lesson={l} displayNumber={i + 1}
                  onEdit={() => setLessonModal({ courseId: c.id, lesson: l })}
                  onDelete={() => deleteLesson(l.id, c.id)}
                />
              ))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div className="border-t border-border p-4 space-y-2">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-sm">درس‌ها</h4>
          {addBtn}
        </div>
        {courseLessons.length === 0
          ? <p className="text-muted-foreground text-xs text-center py-4">هیچ درسی اضافه نشده</p>
          : courseLessons.map(l => (
            <LessonRow key={l.id} lesson={l} displayNumber={l.order}
              onEdit={() => setLessonModal({ courseId: c.id, lesson: l })}
              onDelete={() => deleteLesson(l.id, c.id)}
            />
          ))
        }
      </div>
    );
  }

  const activeCourse = lessonModal ? courses.find(c => c.id === lessonModal.courseId) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">دوره‌ها</h1>
        <button onClick={() => setModal("create")} className="btn-primary flex items-center gap-2"><Plus size={16} /> دوره جدید</button>
      </div>

      {courses.length === 0 && <p className="text-muted-foreground text-center py-10">هیچ دوره‌ای یافت نشد</p>}

      <div className="space-y-2">
        {courses.map(c => (
          <div key={c.id} className="bg-card rounded-xl border border-border overflow-hidden">
            <div className="flex items-center gap-3 p-4">
              {c.image && (
                <img
                  src={normalizeImageUrl(c.image)}
                  className="w-12 h-12 rounded-lg object-cover shrink-0 bg-muted"
                  onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-semibold text-sm">{c.title}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${c.isPublished ? "bg-green-100 text-green-700" : "bg-muted text-muted-foreground"}`}>{c.isPublished ? "منتشر" : "پیش‌نویس"}</span>
                  {c.isPhased && <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">فازبندی شده</span>}
                  <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 font-mono">ID: {c.id}</span>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{c.price.toLocaleString("fa-IR")} تومان</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => setModal({ course: c })} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted"><Pencil size={15} /></button>
                <button onClick={() => deleteCourse(c.id)} className="p-2 text-muted-foreground hover:text-destructive rounded-lg hover:bg-muted"><Trash2 size={15} /></button>
                <button onClick={() => toggleExpand(c.id)} className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-muted">
                  {expanded === c.id ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>
            </div>
            {expanded === c.id && renderExpanded(c)}
          </div>
        ))}
      </div>

      {modal === "create" && (
        <Modal title="دوره جدید" onClose={() => setModal(null)}>
          <CourseForm init={empty} onSave={createCourse} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal !== "create" && (
        <Modal title="ویرایش دوره" onClose={() => setModal(null)}>
          <CourseForm init={modal.course} onSave={d => updateCourse(modal.course.id, d)} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {lessonModal && (
        <Modal title={lessonModal.lesson ? "ویرایش درس" : "درس جدید"} onClose={() => setLessonModal(null)}>
          <LessonForm
            init={lessonModal.lesson}
            phases={(activeCourse?.phases ?? []).slice().sort((a, b) => a.order - b.order)}
            isPhased={!!activeCourse?.isPhased}
            onSave={d => lessonModal.lesson ? updateLesson(lessonModal.lesson.id, lessonModal.courseId, d) : createLesson(lessonModal.courseId, d)}
            onCancel={() => setLessonModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
