import { useState, useRef, useEffect, useCallback } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import {
  useGetCourseById,
  getGetCourseByIdQueryKey,
  useGetUserCourses,
  getGetUserCoursesQueryKey,
  Lesson,
  CoursePhase,
  LessonAttachment,
} from "@workspace/api-client-react";
import { useGetCourseLessons, getGetCourseLessonsQueryKey } from "@workspace/api-client-react";
import { useRoute, useLocation } from "wouter";
import { formatPrice, toPersianDigits } from "@/lib/persian";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, PlayCircle, BookOpen, HelpCircle, CheckCircle2, Loader2, Lock, Play, Plus, Pencil, Trash2, Upload, X, Settings, Download, WifiOff, Sparkles, Flame, ChevronDown, ShieldCheck, Tag, MessageCircle, Phone, FileText, Image as ImageIcon, Music, Paperclip, Layers } from "lucide-react";
import { useSingleMediaCache } from "@/hooks/use-media-cache";
import { Link } from "wouter";
import { useAuth } from "@/lib/auth";
import { getOrCreateGuestId } from "@/lib/guest-id";
import { VideoPlayer } from "@/components/VideoPlayer";
import { AudioPlayer } from "@/components/AudioPlayer";
import { AudioDescriptionPlayer } from "@/components/audio-description-player";

interface DiscountInfo {
  active: boolean;
  percent: number;
  source: string;
  endsAt: string | null;
  remainingSeconds: number;
}

function formatCountdown(sec: number) {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (d > 0) return `${d}روز ${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
}

const API = import.meta.env.VITE_API_BASE_URL ?? "";
const LESSON_ADMIN_PHONE = "09354505225";
const CHUNK_SIZE = 20 * 1024 * 1024; // 20 MB per chunk — fewer round-trips, more reliable on VPS
const MAX_RETRIES = 5;

// ─── Chunked Video Upload ─────────────────────────────────────────────────────

async function uploadVideoChunked(
  file: File,
  token: string,
  onProgress: (pct: number) => void
): Promise<string> {
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()!.toLowerCase()}` : ".mp4";

  for (let i = 0; i < totalChunks; i++) {
    const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    let lastErr: Error | null = null;
    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const form = new FormData();
        form.append("chunk", chunk);
        const r = await fetch(
          `${API}/api/upload/chunk-lesson?uploadId=${uploadId}&chunkIndex=${i}`,
          { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: form }
        );
        if (!r.ok) { const d = await r.json(); throw new Error(d.error || "خطا در آپلود"); }
        lastErr = null;
        break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < MAX_RETRIES - 1) {
          await new Promise(res => setTimeout(res, 1500 * (attempt + 1)));
        }
      }
    }
    if (lastErr) throw lastErr;
    onProgress(Math.round(((i + 1) / totalChunks) * 90));
  }

  let finalRes: Response | null = null;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      finalRes = await fetch(`${API}/api/upload/chunk-lesson/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ uploadId, totalChunks, ext }),
      });
      break;
    } catch {
      if (attempt < MAX_RETRIES - 1) await new Promise(res => setTimeout(res, 2000));
    }
  }
  if (!finalRes || !finalRes.ok) {
    const d = finalRes ? await finalRes.json().catch(() => ({})) : {};
    throw new Error(d.error || "خطا در ترکیب فایل");
  }
  onProgress(100);
  const { url } = await finalRes.json();
  return url as string;
}

// ─── Lesson type for admin ────────────────────────────────────────────────────

type AdminLesson = {
  id: number; title: string; description?: string | null;
  videoUrl?: string | null; audioUrl?: string | null; duration?: number | null;
  order: number; isFree: boolean; courseId: number;
  phaseId?: number | null;
};

// ─── Admin Lesson Modal ───────────────────────────────────────────────────────

function LessonModal({ courseId, lesson, token, phases, onClose, onSaved }: {
  courseId: number; lesson: AdminLesson | null;
  token: string; phases: CoursePhase[]; onClose: () => void; onSaved: () => void;
}) {
  const isEdit = !!lesson;
  const [title, setTitle] = useState(lesson?.title ?? "");
  const [description, setDescription] = useState(lesson?.description ?? "");
  const [videoUrl, setVideoUrl] = useState(lesson?.videoUrl ?? "");
  const [audioUrl, setAudioUrl] = useState(lesson?.audioUrl ?? "");
  const [mediaType, setMediaType] = useState<"video" | "audio">(lesson?.audioUrl ? "audio" : "video");
  const [duration, setDuration] = useState(lesson?.duration?.toString() ?? "");
  const [order, setOrder] = useState(lesson?.order?.toString() ?? "0");
  const [isFree, setIsFree] = useState(lesson?.isFree ?? false);
  const [phaseId, setPhaseId] = useState<string>(lesson?.phaseId != null ? String(lesson.phaseId) : "");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [saving, setSaving] = useState(false);

  const pickVideo = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true); setUploadPct(0);
    try {
      const url = await uploadVideoChunked(file, token, setUploadPct);
      setVideoUrl(url);
      toast.success("ویدیو آپلود شد");
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); }
  };

  const save = async () => {
    if (!title.trim()) { toast.error("عنوان الزامی است"); return; }
    setSaving(true);
    try {
      const body = {
        title: title.trim(), description: description.trim() || null,
        videoUrl: mediaType === "video" ? (videoUrl.trim() || null) : null,
        audioUrl: mediaType === "audio" ? (audioUrl.trim() || null) : null,
        duration: duration ? parseInt(duration) : null,
        order: parseInt(order) || 0, isFree,
        ...(phases.length > 0 ? { phaseId: phaseId ? parseInt(phaseId) : null } : {}),
      };
      const url = isEdit
        ? `${API}/api/lessons-manage/lesson/${lesson!.id}`
        : `${API}/api/lessons-manage/${courseId}`;
      const r = await fetch(url, {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || "خطا"); }
      toast.success(isEdit ? "جلسه ویرایش شد" : "جلسه اضافه شد");
      onSaved();
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <motion.div className="fixed inset-0 z-50 flex items-end justify-center"
      initial={false} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div className="relative w-full max-w-[430px] rounded-t-3xl overflow-hidden"
        style={{ background: "var(--sheet-bg)", border: "1px solid var(--sheet-border)", borderBottom: "none" }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}>
        <div className="overflow-y-auto max-h-[88dvh] p-5" style={{ paddingBottom: "calc(5rem + env(safe-area-inset-bottom) + 1rem)" }}>
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-black text-foreground">{isEdit ? "ویرایش جلسه" : "جلسه جدید"}</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          <div className="space-y-3" dir="rtl">
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="عنوان جلسه *"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50" />
            <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="توضیحات (اختیاری)" rows={2}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50 resize-none" />
            <div className="flex gap-2">
              <input value={order} onChange={e => setOrder(e.target.value)} placeholder="ترتیب" type="number" min="0"
                className="w-20 bg-white/5 border border-white/10 rounded-xl px-3 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50 text-center" />
              <input value={duration} onChange={e => setDuration(e.target.value)} placeholder="مدت (ثانیه)" type="number" min="0"
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50" />
            </div>
            {phases.length > 0 && (
              <div>
                <label className="block text-xs font-bold text-muted-foreground mb-1.5">فاز (مرحله)</label>
                <select
                  value={phaseId}
                  onChange={e => setPhaseId(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground outline-none focus:border-violet-500/50"
                >
                  <option value="" className="bg-background">بدون فاز (سایر جلسات)</option>
                  {[...phases].sort((a, b) => a.order - b.order).map(p => (
                    <option key={p.id} value={p.id} className="bg-background">{p.title}</option>
                  ))}
                </select>
              </div>
            )}
            <label className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 cursor-pointer">
              <input type="checkbox" checked={isFree} onChange={e => setIsFree(e.target.checked)} className="w-4 h-4 rounded" />
              <span className="text-sm text-foreground">جلسه رایگان (پیش‌نمایش)</span>
            </label>

            {/* Video upload */}
            <div>
              <label className={`flex items-center gap-2 rounded-xl px-4 py-3 border cursor-pointer transition-colors ${videoUrl && videoUrl !== (lesson?.videoUrl ?? "") ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-white/10 bg-white/5 text-muted-foreground"}`}>
                <input type="file" accept="video/*,.mp4,.mkv,.avi,.mov,.webm" className="hidden" onChange={pickVideo} disabled={uploading} />
                {uploading ? <Loader2 className="w-4 h-4 animate-spin shrink-0" /> : <Upload className="w-4 h-4 shrink-0" />}
                <span className="text-xs font-bold truncate">
                  {uploading ? `آپلود ${uploadPct}%...` : videoUrl && videoUrl !== (lesson?.videoUrl ?? "") ? "ویدیو آپلود شد ✓" : lesson?.videoUrl ? "تغییر ویدیو" : "آپلود ویدیو"}
                </span>
              </label>
              {uploading && (
                <div className="mt-2 h-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-300" style={{ width: `${uploadPct}%`, background: "linear-gradient(90deg, #7c3aed, #4f46e5)" }} />
                </div>
              )}
              {!uploading && (
                <input value={videoUrl} onChange={e => setVideoUrl(e.target.value)} placeholder="یا URL ویدیو را وارد کنید"
                  className="mt-2 w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50" dir="ltr" />
              )}
            </div>

            <button onClick={save} disabled={saving || uploading || !title.trim()}
              className="w-full py-3 rounded-xl font-black text-white text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : isEdit ? "ذخیره تغییرات" : "افزودن جلسه"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Admin Lesson Manager ─────────────────────────────────────────────────────

function AdminLessonManager({ courseId, token, phases }: { courseId: number; token: string; phases: CoursePhase[] }) {
  const [lessons, setLessons] = useState<AdminLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [editLesson, setEditLesson] = useState<AdminLesson | null | "new">(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/lessons-manage/${courseId}`, { headers: { Authorization: `Bearer ${token}` } });
      if (r.ok) setLessons(await r.json());
    } finally { setLoading(false); }
  }, [courseId, token]);

  useEffect(() => { load(); }, [load]);

  const deleteLesson = async (id: number) => {
    if (!confirm("این جلسه حذف شود؟")) return;
    setDeleting(id);
    try {
      const r = await fetch(`${API}/api/lessons-manage/lesson/${id}`, {
        method: "DELETE", headers: { Authorization: `Bearer ${token}` }
      });
      if (r.ok) { setLessons(prev => prev.filter(l => l.id !== id)); toast.success("جلسه حذف شد"); }
    } finally { setDeleting(null); }
  };

  const fmtDur = (s?: number | null) => { if (!s) return null; const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, "0")}`; };

  return (
    <div className="mt-8 mb-4 rounded-2xl overflow-hidden" style={{ border: "1px solid rgba(232,184,0,0.2)", background: "rgba(232,184,0,0.03)" }}>
      <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid rgba(232,184,0,0.15)" }}>
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4" style={{ color: "#e8b800" }} />
          <span className="text-sm font-black" style={{ color: "#e8b800" }}>مدیریت جلسات</span>
          <span className="text-xs text-muted-foreground">({lessons.length})</span>
        </div>
        <button onClick={() => setEditLesson("new")}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-black active:scale-95 transition-transform"
          style={{ background: "linear-gradient(135deg, #fef08a, #e8b800)" }}>
          <Plus className="w-3.5 h-3.5" /> جلسه جدید
        </button>
      </div>

      <div className="p-3 space-y-2">
        {loading ? (
          [1, 2, 3].map(i => <div key={i} className="h-14 rounded-xl animate-pulse bg-white/5" />)
        ) : lessons.length === 0 ? (
          <div className="text-center py-6 text-muted-foreground text-sm">هنوز جلسه‌ای نیست</div>
        ) : lessons.map((l) => (
          <div key={l.id} className="flex items-center gap-2 p-3 rounded-xl bg-white/4 border border-white/8" dir="rtl">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs font-bold text-muted-foreground">#{l.order}</span>
                {l.isFree && <span className="px-1.5 py-0.5 rounded text-[10px] bg-green-500/20 text-green-400 font-bold">رایگان</span>}
                {l.videoUrl && <span className="px-1.5 py-0.5 rounded text-[10px] bg-violet-500/20 text-violet-400 font-bold">ویدیو</span>}
                {l.audioUrl && <span className="px-1.5 py-0.5 rounded text-[10px] bg-blue-500/20 text-blue-400 font-bold">صدا</span>}
                {l.phaseId != null && phases.find(p => p.id === l.phaseId) && (
                  <span className="px-1.5 py-0.5 rounded text-[10px] bg-amber-500/20 text-amber-400 font-bold">
                    {phases.find(p => p.id === l.phaseId)!.title}
                  </span>
                )}
              </div>
              <p className="text-sm font-bold text-foreground truncate mt-0.5">{l.title}</p>
              {fmtDur(l.duration) && <p className="text-[10px] text-muted-foreground">{fmtDur(l.duration)}</p>}
            </div>
            <button onClick={() => setEditLesson(l)}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "rgba(124,58,237,0.2)", border: "1px solid rgba(124,58,237,0.3)" }}>
              <Pencil className="w-3.5 h-3.5 text-violet-400" />
            </button>
            <button onClick={() => deleteLesson(l.id)} disabled={deleting === l.id}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:scale-90 transition-transform"
              style={{ background: "rgba(239,68,68,0.15)", border: "1px solid rgba(239,68,68,0.25)" }}>
              {deleting === l.id ? <Loader2 className="w-3.5 h-3.5 text-red-400 animate-spin" /> : <Trash2 className="w-3.5 h-3.5 text-red-400" />}
            </button>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {editLesson !== null && (
          <LessonModal
            courseId={courseId}
            lesson={editLesson === "new" ? null : editLesson}
            token={token}
            phases={phases}
            onClose={() => setEditLesson(null)}
            onSaved={() => { setEditLesson(null); load(); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Media Player Modal wrapper (video or audio) ─────────────────────────────

function MediaPlayerModal({ lesson, onClose }: { lesson: Lesson; onClose: () => void }) {
  const { user, token } = useAuth();

  // Prefer video stream, fall back to audioUrl
  const hasVideo = !!lesson.videoUrl;
  const hasAudio = !!lesson.audioUrl;

  // Auth via HttpOnly cookie (shivafer_media) — browser sends automatically with <video src>.
  const streamUrl = lesson.id && hasVideo
    ? `/api/stream/lesson/${lesson.id}`
    : lesson.videoUrl ?? "";

  const audioUrl = lesson.audioUrl ?? undefined;

  if (!streamUrl && !audioUrl) {
    return (
      <div className="fixed inset-0 z-50 bg-black flex items-center justify-center" onClick={onClose}>
        <div className="text-white/60 text-center">
          <PlayCircle className="w-16 h-16 mx-auto mb-3 opacity-50" />
          <p>محتوایی برای این جلسه آپلود نشده است</p>
        </div>
      </div>
    );
  }

  if (hasVideo && streamUrl) {
    return (
      <VideoPlayer
        src={streamUrl}
        title={lesson.title ?? ""}
        description={lesson.description ?? undefined}
        watermarkName={user?.name ?? ""}
        watermarkPhone={user?.phone ?? ""}
        onClose={onClose}
      />
    );
  }

  if (hasAudio && audioUrl) {
    return (
      <AudioPlayer
        src={audioUrl}
        title={lesson.title ?? ""}
        description={lesson.description ?? undefined}
        onClose={onClose}
      />
    );
  }

  return null;
}

// ─── Course Description — Glacy Liquid theme ─────────────────────────────────

const COLLAPSED_LINES = 4;

function CourseDescription({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight || "24");
    setNeedsToggle(el.scrollHeight > lineHeight * COLLAPSED_LINES + 4);
  }, [description]);

  return (
    <div className="mb-8 relative rounded-3xl overflow-hidden" style={{
      background: "var(--glass-card-bg)",
      border: "1px solid var(--glass-card-border)",
      boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
      backdropFilter: "blur(20px)",
    }}>
      {/* liquid blobs */}
      <div className="pointer-events-none absolute -top-8 -right-8 w-36 h-36 rounded-full opacity-25"
        style={{ background: "radial-gradient(circle at 40% 40%, #7c3aed, transparent 70%)" }} />
      <div className="pointer-events-none absolute -bottom-10 -left-10 w-28 h-28 rounded-full opacity-20"
        style={{ background: "radial-gradient(circle at 60% 60%, #4f46e5, transparent 70%)" }} />
      <div className="pointer-events-none absolute top-1/2 right-1/3 w-20 h-20 rounded-full opacity-10"
        style={{ background: "radial-gradient(circle, #10b981, transparent 70%)" }} />

      <div className="relative p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="w-1 h-5 rounded-full" style={{ background: "linear-gradient(to bottom, #7c3aed, #4f46e5)" }} />
          <span className="text-xs font-black text-muted-foreground tracking-widest uppercase">درباره دوره</span>
        </div>

        <div className="relative overflow-hidden transition-all duration-500"
          style={{ maxHeight: expanded ? "999px" : `${COLLAPSED_LINES * 1.75}rem` }}>
          <p ref={ref} className="text-foreground/75 leading-loose whitespace-pre-wrap text-sm" style={{ lineHeight: "1.85" }}>
            {description}
          </p>
          {!expanded && needsToggle && (
            <div className="absolute bottom-0 left-0 right-0 h-12"
              style={{ background: "var(--course-desc-fade)" }} />
          )}
        </div>

        {needsToggle && (
          <button onClick={() => setExpanded(!expanded)}
            className="mt-3 flex items-center gap-1.5 text-xs font-black active:scale-95 transition-transform"
            style={{ color: "#a78bfa" }}>
            <motion.span animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.25 }}>
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.span>
            {expanded ? "نمایش کمتر" : "نمایش بیشتر"}
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Lesson Item ──────────────────────────────────────────────────────────────

function LessonOfflineButton({ lessonId, token }: { lessonId: number; token: string | null }) {
  const cacheKey = `/api/stream/lesson/${lessonId}`;
  // Cookie sent automatically — no token needed in URL for offline cache fetch.
  const fetchUrl = cacheKey;
  const { status, progress, toggle } = useSingleMediaCache(cacheKey, fetchUrl);

  return (
    <button
      onClick={(e) => { e.stopPropagation(); toggle(); }}
      className="w-8 h-8 flex items-center justify-center rounded-full shrink-0 transition-all active:scale-90"
      style={{
        background: status === "cached" ? "rgba(74,222,128,0.15)" : "var(--glass-toggle-bg)",
        border: status === "cached" ? "1px solid rgba(74,222,128,0.4)" : "1px solid var(--glass-toggle-border)",
      }}
      title={status === "cached" ? "حذف از حافظه آفلاین" : "ذخیره برای آفلاین"}
    >
      {status === "idle" && <Download className="w-3.5 h-3.5 text-muted-foreground" />}
      {status === "downloading" && (
        <div className="relative flex items-center justify-center">
          <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
          <span className="absolute text-[6px] font-bold text-primary">{progress > 0 ? progress : ""}</span>
        </div>
      )}
      {status === "cached" && <WifiOff className="w-3.5 h-3.5 text-green-400" />}
    </button>
  );
}

function attachmentIcon(att: LessonAttachment) {
  const t = (att.fileType ?? "").toLowerCase();
  const name = (att.fileName ?? att.fileUrl ?? "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  const has = (...keys: string[]) => keys.some((k) => t.includes(k) || ext === k);
  if (has("pdf", "doc", "docx", "txt", "rtf")) return FileText;
  if (has("image", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp")) return ImageIcon;
  if (has("audio", "mp3", "wav", "ogg", "m4a", "aac", "flac")) return Music;
  return Paperclip;
}

function ImageLightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);
  return (
    <div
      className="fixed inset-0 z-[999] flex flex-col items-center justify-center"
      style={{ background: "rgba(0,0,0,0.96)" }}
      onClick={onClose}
    >
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-10" dir="rtl">
        <button
          onClick={onClose}
          className="w-10 h-10 rounded-full flex items-center justify-center text-white active:scale-90 transition-transform"
          style={{ background: "rgba(255,255,255,0.15)", backdropFilter: "blur(8px)" }}
        >
          <X className="w-5 h-5" />
        </button>
        <a
          href={url}
          download
          onClick={(e) => e.stopPropagation()}
          className="flex items-center gap-2 px-4 py-2 rounded-xl font-bold text-sm text-white active:scale-95 transition-transform"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 4px 16px rgba(124,58,237,0.4)" }}
        >
          <Download className="w-4 h-4" />
          ذخیره
        </a>
      </div>
      <img
        src={url}
        alt=""
        className="max-w-full max-h-[80vh] object-contain rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{ boxShadow: "0 12px 48px rgba(0,0,0,0.6)" }}
      />
    </div>
  );
}

function isImageAttachment(att: LessonAttachment): boolean {
  const t = (att.fileType ?? "").toLowerCase();
  const name = (att.fileName ?? att.fileUrl ?? "").toLowerCase();
  const ext = name.includes(".") ? name.split(".").pop()! : "";
  return ["image", "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].some(k => t.includes(k) || ext === k);
}

function LessonAttachments({ attachments }: { attachments: LessonAttachment[] }) {
  const [open, setOpen] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  if (!attachments.length) return null;

  const images = attachments.filter(isImageAttachment);
  const others = attachments.filter(a => !isImageAttachment(a));

  return (
    <>
      {lightbox && <ImageLightbox url={lightbox} onClose={() => setLightbox(null)} />}
      <div className="mt-2.5 border-t pt-2" style={{ borderColor: "var(--color-border)" }} dir="rtl">
        <button
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o); }}
          className="w-full flex items-center justify-between px-1 py-1 rounded-lg transition-colors active:opacity-70"
        >
          <div className="flex items-center gap-2">
            <Paperclip className="w-3.5 h-3.5" style={{ color: "var(--gold-primary)" }} />
            <span className="text-xs font-bold" style={{ color: "var(--gold-primary)" }}>فایل‌های ضمیمه</span>
            {images.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "rgba(124,58,237,0.12)", color: "#7c3aed" }}>
                {toPersianDigits(String(images.length))} تصویر
              </span>
            )}
            {others.length > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: "var(--gold-bg)", color: "var(--gold-primary)" }}>
                {toPersianDigits(String(others.length))} فایل
              </span>
            )}
          </div>
          <ChevronDown
            className="w-4 h-4 transition-transform duration-200 text-muted-foreground"
            style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
          />
        </button>

        <AnimatePresence initial={false}>
          {open && (
            <motion.div
              key="attach-body"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: "easeInOut" }}
              style={{ overflow: "hidden" }}
            >
              <div className="pt-2.5 space-y-2.5 pb-1">
                {images.length > 0 && (
                  <div className="grid grid-cols-3 gap-1.5">
                    {images.map((att) => (
                      <button
                        key={att.id}
                        onClick={(e) => { e.stopPropagation(); setLightbox(att.fileUrl); }}
                        className="relative rounded-xl overflow-hidden active:scale-95 transition-transform"
                        style={{ aspectRatio: "1/1", background: "var(--color-muted)", border: "1px solid var(--color-border)" }}
                      >
                        <img
                          src={att.fileUrl}
                          alt={att.title || att.fileName || "تصویر"}
                          className="w-full h-full object-cover"
                          loading="lazy"
                        />
                        <div className="absolute inset-0 flex items-end justify-end p-1 opacity-0 hover:opacity-100 transition-opacity"
                          style={{ background: "linear-gradient(to top, rgba(0,0,0,0.45), transparent)" }}>
                          <ImageIcon className="w-3.5 h-3.5 text-white/80" />
                        </div>
                      </button>
                    ))}
                  </div>
                )}
                {others.length > 0 && (
                  <div className="space-y-1.5">
                    {others.map((att) => {
                      const Icon = attachmentIcon(att);
                      return (
                        <a
                          key={att.id}
                          href={att.fileUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          download
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors"
                          style={{ background: "rgba(124,58,237,0.07)", border: "1px solid rgba(124,58,237,0.18)" }}
                        >
                          <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                            style={{ background: "rgba(124,58,237,0.15)" }}>
                            <Icon className="w-3.5 h-3.5" style={{ color: "#7c3aed" }} />
                          </div>
                          <span className="flex-1 min-w-0 text-xs font-semibold text-foreground truncate">
                            {att.title || att.fileName || "پیوست"}
                          </span>
                          <Download className="w-3.5 h-3.5 shrink-0" style={{ color: "#7c3aed" }} />
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}

function LessonItem({
  lesson,
  index,
  owned,
  onClick,
  token,
  sessionNumber,
}: {
  lesson: Lesson;
  index: number;
  owned: boolean;
  onClick: () => void;
  token: string | null;
  sessionNumber?: number;
}) {
  const canPlay = owned || lesson.isFree;
  const formatDuration = (sec?: number | null) => {
    if (!sec) return null;
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  };

  const hasAttachments = lesson.attachments && lesson.attachments.length > 0;

  return (
    <motion.div
      initial={false}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <div
        className={`w-full rounded-xl border text-right transition-all ${
          canPlay
            ? "border-border bg-card hover:bg-primary/5 hover:border-primary/30"
            : "border-border/50 bg-muted/30 opacity-70"
        }`}
        dir="rtl"
      >
        <div className="flex items-center gap-3 p-3">
          <button
            onClick={canPlay ? onClick : undefined}
            disabled={!canPlay}
            className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${canPlay ? "bg-primary/15 text-primary cursor-pointer active:scale-95" : "bg-muted text-muted-foreground cursor-not-allowed"}`}
          >
            {canPlay ? (
              <Play className="w-4 h-4 mr-[-2px]" />
            ) : (
              <Lock className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={canPlay ? onClick : undefined}
            disabled={!canPlay}
            className={`flex-1 min-w-0 text-right ${canPlay ? "cursor-pointer" : "cursor-not-allowed"}`}
          >
            <div className="flex items-center gap-2 flex-wrap">
              {sessionNumber != null && (
                <span className="text-xs font-bold text-primary">جلسه {toPersianDigits(String(sessionNumber))}</span>
              )}
              {lesson.isFree && !owned && (
                <span className="px-1.5 py-0.5 rounded text-xs bg-green-100 text-green-700 font-bold">رایگان</span>
              )}
            </div>
            <p className="font-semibold text-sm text-foreground leading-tight mt-0.5 truncate">{lesson.title}</p>
            {lesson.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{lesson.description}</p>}
          </button>

          <div className="flex items-center gap-1.5 shrink-0">
            {formatDuration(lesson.duration) && <span className="text-xs text-muted-foreground">{formatDuration(lesson.duration)}</span>}
            {(lesson.videoUrl || lesson.audioUrl) && canPlay && !owned && <PlayCircle className="w-4 h-4 text-primary opacity-60" />}
            {!lesson.videoUrl && lesson.audioUrl && <span className="text-xs bg-blue-500/20 text-blue-300 px-1.5 py-0.5 rounded shrink-0">صوتی</span>}
          </div>
        </div>

        {hasAttachments && (
          <div className="px-3 pb-3">
            <LessonAttachments attachments={lesson.attachments!} />
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── MTP discount pricing types & components ──────────────────────────────────

type MtpVariant = { key: string; label: string; fullPrice: number; price: number };
type MtpDiscount = {
  active: boolean;
  percent: number;
  source: "first_login" | "recurring" | "global" | "none";
  endsAt: string | null;
  remainingSeconds: number;
};
type MtpPricing = { courseId: number | null; courseIds?: number[]; discount: MtpDiscount; variants: MtpVariant[] };

function useMtpPricing(courseId: number, token: string | null) {
  const [pricing, setPricing] = useState<MtpPricing | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let cancelled = false;
    if (!token) { setLoading(false); return; }
    fetch(`${API}/api/mtp/pricing`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (!cancelled) setPricing(d); })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [courseId, token]);
  const ids = pricing?.courseIds ?? (pricing?.courseId ? [pricing.courseId] : []);
  const isMtp = !!pricing && ids.includes(courseId);
  return { pricing: isMtp ? pricing : null, loading };
}

function CountdownTimer({ initialSeconds }: { initialSeconds: number }) {
  const [seconds, setSeconds] = useState(initialSeconds);
  useEffect(() => { setSeconds(initialSeconds); }, [initialSeconds]);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds <= 0]);

  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  const Box = ({ value, label, pulse }: { value: number; label: string; pulse?: boolean }) => (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative min-w-[3rem] px-2 py-2 rounded-2xl text-center overflow-hidden"
        style={{ background: "rgba(0,0,0,0.28)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.3), 0 4px 12px rgba(0,0,0,0.2)" }}>
        <span className="absolute inset-x-0 top-0 h-1/2 bg-white/10" />
        <motion.span
          key={value}
          initial={pulse ? { y: -10, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.25 }}
          className="relative block text-xl font-black tabular-nums drop-shadow"
          style={{ color: "#ffffff" }}
          dir="ltr"
        >
          {toPersianDigits(String(value).padStart(2, "0"))}
        </motion.span>
      </div>
      <span className="text-[10px] font-bold" style={{ color: "rgba(255,255,255,0.9)" }}>{label}</span>
    </div>
  );
  const Sep = () => <span className="font-black text-lg pb-5 animate-pulse" style={{ color: "rgba(255,255,255,0.6)" }}>:</span>;
  return (
    <div className="flex items-center justify-center gap-1.5" dir="ltr">
      <Box value={d} label="روز" />
      <Sep />
      <Box value={h} label="ساعت" />
      <Sep />
      <Box value={m} label="دقیقه" />
      <Sep />
      <Box value={s} label="ثانیه" pulse />
    </div>
  );
}

function VariantSelect({
  variants,
  selectedKey,
  onSelect,
  showDiscount,
}: {
  variants: MtpVariant[];
  selectedKey: string;
  onSelect: (key: string) => void;
  showDiscount: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = variants.find(v => v.key === selectedKey) ?? variants[0];

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("touchstart", onDown);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref} dir="rtl">
      {/* Trigger button */}
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between gap-2 bg-background/60 border-2 border-primary/30 rounded-2xl pr-4 pl-3 py-3.5 text-right outline-none focus:border-primary transition-colors active:scale-[0.99]"
        data-testid="select-mtp-variant"
        aria-expanded={open}
      >
        <span className="text-sm font-black text-foreground truncate">{selected?.label}</span>
        <motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.2 }} className="shrink-0 grid place-items-center w-7 h-7 rounded-lg bg-primary/15 text-primary">
          <ChevronDown className="w-4 h-4" />
        </motion.span>
      </button>

      {/* Animated options panel */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute z-30 left-0 right-0 mt-2 rounded-2xl p-1.5 overflow-hidden"
            style={{
              background: "var(--color-card)",
              border: "1px solid var(--color-border)",
              boxShadow: "0 18px 40px -10px rgba(0,0,0,0.25), 0 0 0 1px rgba(0,0,0,0.06)",
            }}
          >
            {variants.map((v, i) => {
              const isSel = v.key === selected?.key;
              const hasDisc = showDiscount && v.price < v.fullPrice;
              return (
                <motion.button
                  key={v.key}
                  type="button"
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => { onSelect(v.key); setOpen(false); }}
                  className={`w-full flex items-center justify-between gap-3 rounded-xl px-3 py-3 text-right transition-colors ${isSel ? "bg-primary/15" : "hover:bg-muted/60 active:bg-muted"}`}
                  data-testid={`option-mtp-${v.key}`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className={`shrink-0 grid place-items-center w-5 h-5 rounded-full border-2 ${isSel ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/30"}`}>
                      {isSel && <CheckCircle2 className="w-3.5 h-3.5" strokeWidth={3} />}
                    </span>
                    <span className={`text-sm font-bold truncate ${isSel ? "text-primary" : "text-foreground"}`}>{v.label}</span>
                  </div>
                  <div className="shrink-0 flex flex-col items-end leading-tight">
                    {hasDisc && (
                      <span className="text-[10px] text-muted-foreground/70 line-through" dir="ltr">{formatPrice(v.fullPrice)}</span>
                    )}
                    <span className={`text-xs font-black ${isSel ? "text-primary" : "text-foreground/90"}`} dir="ltr">{formatPrice(v.price)}</span>
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MtpPurchaseBox({
  pricing,
  selectedKey,
  onSelect,
}: {
  pricing: MtpPricing;
  selectedKey: string;
  onSelect: (key: string) => void;
}) {
  const { discount, variants } = pricing;
  const selected = variants.find(v => v.key === selectedKey) ?? variants[0];
  const hasDiscount = discount.active && selected && selected.price < selected.fullPrice;
  const savings = hasDiscount ? selected.fullPrice - selected.price : 0;

  return (
    <div className="mb-8 space-y-4">
      {/* Countdown banner */}
      {discount.active && discount.remainingSeconds > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }}
          className="relative rounded-3xl p-4 text-center overflow-hidden"
          style={{ background: "linear-gradient(135deg, #7c3aed 0%, #6d28d9 45%, #4f46e5 100%)", boxShadow: "0 12px 32px rgba(124,58,237,0.45)" }}
        >
          {/* shimmer sweep */}
          <motion.span
            className="pointer-events-none absolute inset-0"
            style={{ background: "linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.18) 50%, transparent 65%)" }}
            initial={{ x: "-120%" }} animate={{ x: "120%" }}
            transition={{ duration: 2.4, repeat: Infinity, repeatDelay: 1.2, ease: "easeInOut" }}
          />
          <div className="relative">
            <div className="inline-flex items-center gap-2 mb-3 px-3 py-1 rounded-full bg-white/15 border border-white/25">
              <motion.span animate={{ scale: [1, 1.18, 1] }} transition={{ duration: 1.1, repeat: Infinity }}>
                <Flame className="w-4 h-4 text-amber-300" fill="currentColor" />
              </motion.span>
              <span className="font-black text-sm" style={{ color: "#ffffff" }}>
                {toPersianDigits(String(discount.percent))}٪ تخفیف ویژه فعال است
              </span>
            </div>
            <p className="text-xs font-bold mb-3" style={{ color: "rgba(255,255,255,0.85)" }}>فقط تا پایان شمارش معکوس باقی مانده</p>
            <CountdownTimer initialSeconds={discount.remainingSeconds} />
          </div>
        </motion.div>
      )}
      {discount.active && discount.remainingSeconds === 0 && discount.source === "global" && (
        <div className="rounded-2xl p-3 text-center text-white font-black text-sm flex items-center justify-center gap-2" style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}>
          <Sparkles className="w-4 h-4" /> {toPersianDigits(String(discount.percent))}٪ تخفیف ویژه فعال است
        </div>
      )}

      {/* Premium purchase card with animated gold border */}
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="relative rounded-3xl p-[1.5px] overflow-hidden"
        style={{ background: "linear-gradient(135deg, hsl(47 88% 52%), hsl(38 70% 35%) 40%, hsl(47 88% 52%))", boxShadow: "0 10px 30px -8px hsl(47 88% 52% / 0.45)" }}
      >
        {/* rotating glow */}
        <motion.span
          className="pointer-events-none absolute -inset-[60%]"
          style={{ background: "conic-gradient(from 0deg, transparent 0deg, hsl(47 90% 60% / 0.55) 40deg, transparent 90deg)" }}
          animate={{ rotate: 360 }}
          transition={{ duration: 6, repeat: Infinity, ease: "linear" }}
        />
        <div className="relative rounded-[calc(1.5rem-1.5px)] bg-card p-4 space-y-4" dir="rtl">
          {/* header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="grid place-items-center w-8 h-8 rounded-xl bg-primary/15 text-primary">
                <Tag className="w-4 h-4" />
              </span>
              <span className="text-sm font-black text-foreground">گزینه خرید را انتخاب کنید</span>
            </div>
            {hasDiscount && (
              <motion.span
                animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 1.4, repeat: Infinity }}
                className="px-2.5 py-1 rounded-full text-[11px] font-black text-primary-foreground"
                style={{ background: "var(--gold-gradient)", boxShadow: "0 4px 12px rgba(239,68,68,0.4)" }}
              >
                {toPersianDigits(String(discount.percent))}٪ تخفیف
              </motion.span>
            )}
          </div>

          {/* custom dropdown */}
          <VariantSelect
            variants={variants}
            selectedKey={selected?.key ?? ""}
            onSelect={onSelect}
            showDiscount={!!hasDiscount}
          />

          {/* price display */}
          {selected && (
            <div
              className="relative rounded-2xl p-4 overflow-hidden"
              style={{ background: "linear-gradient(135deg, hsl(47 88% 52% / 0.16), hsl(47 88% 52% / 0.04))", border: "1px solid hsl(47 88% 52% / 0.3)" }}
            >
              <div className="flex items-end justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground font-bold">قیمت این گزینه</span>
                  {hasDiscount && (
                    <span className="text-xs text-muted-foreground/80 line-through" dir="ltr">{formatPrice(selected.fullPrice)}</span>
                  )}
                  <motion.span
                    key={selected.price}
                    initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                    className="text-2xl font-black text-primary leading-tight drop-shadow"
                    dir="ltr"
                  >
                    {formatPrice(selected.price)}
                  </motion.span>
                </div>
                {hasDiscount && (
                  <div className="flex flex-col items-center justify-center text-center px-3 py-2 rounded-xl" style={{ background: "linear-gradient(135deg, #16a34a, #15803d)" }}>
                    <span className="text-[10px] text-white font-bold">سود شما</span>
                    <span className="text-sm font-black text-white" dir="ltr">{formatPrice(savings)}</span>
                  </div>
                )}
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground font-bold">
                <ShieldCheck className="w-3.5 h-3.5 text-green-500" />
                پرداخت امن و دسترسی فوری پس از خرید
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CourseDetail() {
  const [, params] = useRoute("/courses/:id");
  const courseId = params?.id ? parseInt(params.id) : 0;
  const { token, user } = useAuth();
  const isAdmin = user?.phone === LESSON_ADMIN_PHONE;
  const [, navigate] = useLocation();
  const [activeLesson, setActiveLesson] = useState<Lesson | null>(null);

  const { data: course, isLoading } = useGetCourseById(courseId, {
    query: {
      enabled: !!courseId,
      queryKey: getGetCourseByIdQueryKey(courseId),
    }
  });

  const { data: userCourses } = useGetUserCourses({
    query: { enabled: !!token, queryKey: getGetUserCoursesQueryKey() }
  });

  const owned = !!userCourses?.some((c) => c.id === courseId);

  const { data: lessons, isLoading: lessonsLoading } = useGetCourseLessons(courseId, {
    query: { enabled: owned && !!courseId, queryKey: getGetCourseLessonsQueryKey(courseId) }
  });

  const { pricing: mtpPricing } = useMtpPricing(courseId, token ?? null);

  const [discountInfo, setDiscountInfo] = useState<DiscountInfo | null>(null);
  const [discountSec, setDiscountSec] = useState(0);

  useEffect(() => {
    if (!courseId || owned || mtpPricing) return;
    if (token) {
      // کاربر لاگین‌کرده — endpoint معمولی
      if (userCourses === undefined) return;
      fetch(`${API}/api/discounts/course/${courseId}`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.ok ? r.json() : null)
        .then((d: DiscountInfo | null) => {
          if (d?.active && d.percent > 0) {
            setDiscountInfo(d);
            setDiscountSec(Math.max(0, d.remainingSeconds ?? 0));
            const key = `disc_shown_course_${courseId}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              toast.success(`🏷️ ${d.percent}٪ تخفیف ویژه برای این دوره فعال است!`, { duration: 6000, position: "top-center" });
            }
          }
        })
        .catch(() => {});
    } else {
      // کاربر مهمان — از endpoint مهمان استفاده کن
      const guestId = getOrCreateGuestId();
      fetch(`${API}/api/discounts/guest/course/${courseId}`, { headers: { "x-guest-id": guestId } })
        .then(r => r.ok ? r.json() : null)
        .then((d: DiscountInfo | null) => {
          if (d?.active && d.percent > 0) {
            setDiscountInfo(d);
            setDiscountSec(Math.max(0, d.remainingSeconds ?? 0));
            const key = `disc_shown_course_guest_${courseId}`;
            if (!sessionStorage.getItem(key)) {
              sessionStorage.setItem(key, "1");
              toast.success(`🏷️ ${d.percent}٪ تخفیف ویژه برای این دوره فعال است!`, { duration: 6000, position: "top-center" });
            }
          }
        })
        .catch(() => {});
    }
  }, [token, courseId, userCourses, owned, mtpPricing]);

  useEffect(() => {
    if (discountSec <= 0) return;
    const t = setInterval(() => setDiscountSec(s => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [discountSec > 0]);

  const [selectedVariant, setSelectedVariant] = useState<string>("");
  useEffect(() => {
    if (mtpPricing && mtpPricing.variants.length > 0 && !selectedVariant) {
      setSelectedVariant(mtpPricing.variants[0].key);
    }
  }, [mtpPricing, selectedVariant]);
  const selectedMtp = mtpPricing?.variants.find(v => v.key === selectedVariant);

  const [isPaymentPending] = useState(false);

  const handleBuy = () => {
    if (!token) { navigate("/login"); return; }
    if (mtpPricing && selectedVariant) {
      navigate(`/order-summary?type=course&id=${courseId}&variant=${encodeURIComponent(selectedVariant)}`);
      return;
    }
    navigate(`/order-summary?type=course&id=${courseId}`);
  };

  if (isLoading) {
    return (
      <div className="flex flex-col h-full w-full">
        <Skeleton className="h-64 w-full rounded-none" />
        <div className="p-4 space-y-4">
          <Skeleton className="h-8 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-muted-foreground h-full">
        <p>دوره یافت نشد</p>
        <Link href="/courses" className="mt-4 text-primary underline">بازگشت به دوره‌ها</Link>
      </div>
    );
  }

  return (
    <>
      <motion.div
        initial={false}
        animate={{ opacity: 1 }}
        className="pb-28"
      >
        {/* ─── Nav bar — جدا از تصویر، هیچ عنصری روی کاور نمی‌افتد ─── */}
        <div className="flex items-center gap-3 px-4 py-3 sticky top-0 z-20" style={{
          background: "var(--glass-header-bg)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderBottom: "1px solid var(--glass-header-border)",
        }}>
          <button
            onClick={() => window.history.back()}
            className="w-9 h-9 rounded-full flex items-center justify-center active:scale-90 transition-transform shrink-0 bg-secondary border border-border"
          >
            <ChevronRight className="w-5 h-5 text-foreground" />
          </button>
          <span className="text-sm font-bold text-muted-foreground truncate flex-1">جزئیات دوره</span>
        </div>

        {/* ─── Cover image — کاملاً پاک، بدون هیچ المان روکش ─── */}
        <div className="w-full bg-muted" style={{ height: "260px", position: "relative" }}>
          {course.image ? (
            <CachedImage src={course.image} alt={course.title} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-secondary">
              <PlayCircle className="w-16 h-16 text-muted-foreground opacity-30" />
            </div>
          )}
          <div className="absolute inset-0" style={{ background: "var(--course-cover-overlay)" }} />
        </div>

        {/* ─── Content — لیبل‌ها زیر تصویر، نه روی آن ─── */}
        <div className="px-5 pt-4 relative z-10">
          {/* badges row */}
          <div className="flex items-center gap-2 flex-wrap mb-3">
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold"
              style={{ background: "var(--badge-course-type-bg)", color: "var(--badge-course-type-color)", border: "1px solid var(--badge-course-type-border)" }}>
              <BookOpen className="w-3.5 h-3.5" />
              دوره آموزشی
            </span>
            {owned && (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold"
                style={{ background: "var(--badge-owned-bg)", color: "var(--badge-owned-color)", border: "1px solid var(--badge-owned-border)" }}>
                <CheckCircle2 className="w-3.5 h-3.5" />
                خریداری شده
              </span>
            )}
          </div>

          <h1 className="text-xl font-black mb-4 text-foreground truncate">{course.title}</h1>

          {!owned && !mtpPricing && (
            discountInfo?.active && discountInfo.percent > 0 && course.price > 0 ? (
              <div className="mb-6 rounded-2xl overflow-hidden"
                style={{ background: "linear-gradient(135deg,rgba(239,68,68,0.15),rgba(220,38,38,0.06))", border: "1px solid rgba(239,68,68,0.35)" }}>
                <div className="px-4 pt-3 pb-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-foreground/55 text-sm font-bold">قیمت دوره</span>
                    <span className="flex items-center gap-1.5 text-xs font-black px-2.5 py-1 rounded-full"
                      style={{ background: "rgba(239,68,68,0.25)", color: "#fca5a5", border: "1px solid rgba(239,68,68,0.4)" }}>
                      <Tag className="w-3 h-3" />
                      {discountInfo.percent}٪ تخفیف
                    </span>
                  </div>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <div className="text-foreground/40 text-sm line-through mb-0.5">{formatPrice(course.price)} تومان</div>
                      <div className="text-accent font-bold text-xl">
                        {formatPrice(Math.round(course.price * (1 - discountInfo.percent / 100) / 1000) * 1000)} تومان
                      </div>
                    </div>
                    {discountSec > 0 && (
                      <div className="text-left">
                        <div className="text-xs text-muted-foreground mb-0.5">اتمام تخفیف</div>
                        <div className="font-black text-red-400 text-base tabular-nums" dir="ltr">
                          {formatCountdown(discountSec)}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2 mb-6 text-accent font-bold text-lg" dir="rtl">
                {formatPrice(course.price)}
              </div>
            )
          )}

          {!owned && mtpPricing && (
            <MtpPurchaseBox pricing={mtpPricing} selectedKey={selectedVariant} onSelect={setSelectedVariant} />
          )}

          {course.description && <CourseDescription description={course.description} />}

          {/* ── بخش سارا (فقط برای دوره‌های نخریده‌شده) ── */}
          {!owned && (
          <div className="rounded-2xl overflow-hidden mb-6" style={{
            background: "linear-gradient(135deg, rgba(124,58,237,0.18) 0%, rgba(79,70,229,0.08) 100%)",
            border: "1px solid rgba(124,58,237,0.3)",
            backdropFilter: "blur(12px)",
          }}>
            <div className="px-5 py-4">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center"
                  style={{ background: "rgba(196,181,253,0.15)", border: "1px solid rgba(196,181,253,0.25)" }}>
                  <Sparkles className="w-4 h-4 text-violet-300" />
                </div>
                <h3 className="text-sm font-black text-foreground">سوالی درباره این دوره دارید؟</h3>
              </div>
              <p className="text-xs text-muted-foreground mb-4 leading-relaxed pr-1">
                می‌توانید سوال‌تان را از طریق گفتگوی متنی یا تماس صوتی با سارا بپرسید.
              </p>
              <div className="flex gap-2.5">
                <button
                  onClick={() => {
                    try { localStorage.setItem("coursePrefill", JSON.stringify({ title: course.title })); } catch { /* ignore */ }
                    navigate("/ai-chat");
                  }}
                  className="flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm active:scale-[0.97] transition-transform"
                  style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)", boxShadow: "0 4px 15px rgba(124,58,237,0.35)", color: "#ffffff" }}
                >
                  <MessageCircle className="w-4 h-4" />
                  گفتگوی متنی
                </button>
                <button
                  onClick={() => navigate("/advisor")}
                  className="sara-call-btn flex-1 flex items-center justify-center gap-2 h-11 rounded-xl font-bold text-sm active:scale-[0.97] transition-transform"
                style={{ border: "1px solid rgba(124,58,237,0.5)", background: "rgba(124,58,237,0.25)", color: "#ffffff" }}
                >
                  <Phone className="w-4 h-4" />
                  تماس با سارا
                </button>
              </div>
            </div>
          </div>
          )}

          {/* Lessons Section */}
          {owned && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2" dir="rtl">
                <PlayCircle className="w-5 h-5 text-primary" />
                جلسات دوره
                {lessons && <span className="text-sm font-normal text-muted-foreground">({lessons.length} جلسه)</span>}
              </h2>
              {lessonsLoading ? (
                <div className="space-y-2">
                  {[1,2,3].map(i => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}
                </div>
              ) : !lessons?.length ? (
                <div className="text-center py-10 text-muted-foreground border border-dashed border-border rounded-xl">
                  <PlayCircle className="w-8 h-8 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">جلسات این دوره به‌زودی اضافه می‌شوند</p>
                </div>
              ) : course.isPhased && course.phases?.length ? (
                <div className="space-y-6">
                  {[...course.phases].sort((a, b) => a.order - b.order).map((phase) => {
                    const phaseLessons = lessons.filter((l) => l.phaseId === phase.id);
                    if (!phaseLessons.length) return null;
                    return (
                      <div key={phase.id}>
                        <div className="flex items-center gap-2 mb-3" dir="rtl">
                          <span className="grid place-items-center w-7 h-7 rounded-lg bg-primary/15 text-primary shrink-0">
                            <Layers className="w-4 h-4" />
                          </span>
                          <h3 className="text-sm font-black text-foreground">{phase.title}</h3>
                          <span className="text-xs text-muted-foreground">({toPersianDigits(String(phaseLessons.length))} جلسه)</span>
                        </div>
                        <div className="space-y-2">
                          {phaseLessons.map((lesson, i) => (
                            <LessonItem
                              key={lesson.id}
                              lesson={lesson}
                              index={i}
                              sessionNumber={i + 1}
                              owned={owned}
                              onClick={() => setActiveLesson(lesson)}
                              token={token ?? null}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {(() => {
                    const phaseIds = new Set(course.phases.map((p) => p.id));
                    const others = lessons.filter((l) => l.phaseId == null || !phaseIds.has(l.phaseId));
                    if (!others.length) return null;
                    return (
                      <div>
                        <div className="flex items-center gap-2 mb-3" dir="rtl">
                          <span className="grid place-items-center w-7 h-7 rounded-lg bg-white/5 text-muted-foreground shrink-0">
                            <Layers className="w-4 h-4" />
                          </span>
                          <h3 className="text-sm font-black text-foreground">سایر جلسات</h3>
                          <span className="text-xs text-muted-foreground">({toPersianDigits(String(others.length))} جلسه)</span>
                        </div>
                        <div className="space-y-2">
                          {others.map((lesson, i) => (
                            <LessonItem
                              key={lesson.id}
                              lesson={lesson}
                              index={i}
                              sessionNumber={i + 1}
                              owned={owned}
                              onClick={() => setActiveLesson(lesson)}
                              token={token ?? null}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <div className="space-y-2">
                  {lessons.map((lesson, i) => (
                    <LessonItem
                      key={lesson.id}
                      lesson={lesson}
                      index={i}
                      owned={owned}
                      onClick={() => setActiveLesson(lesson)}
                      token={token ?? null}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview lessons for non-owners */}
          {!owned && lessons === undefined && (
            <div className="mb-8">
              <div className="p-4 rounded-xl border border-primary/20 bg-primary/5 text-center">
                <Lock className="w-6 h-6 mx-auto mb-2 text-primary opacity-60" />
                <p className="text-sm text-muted-foreground">پس از خرید به تمام جلسات دسترسی خواهید داشت</p>
              </div>
            </div>
          )}

          {course.results && course.results.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" />
                چه چیزی یاد می‌گیرید
              </h2>
              <ul className="space-y-2">
                {course.results.map((result, i) => (
                  <li key={i} className="flex items-start gap-3 bg-primary/5 border border-primary/10 rounded-lg px-4 py-3">
                    <CheckCircle2 className="w-4 h-4 text-primary mt-0.5 shrink-0" />
                    <span className="text-sm text-foreground leading-relaxed">{result}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {course.faqs && course.faqs.length > 0 && (
            <div className="mb-8">
              <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                <HelpCircle className="w-5 h-5 text-primary" />
                سوالات متداول
              </h2>
              <Accordion type="single" collapsible className="w-full space-y-2">
                {course.faqs.map((faq) => (
                  <AccordionItem key={faq.id} value={`faq-${faq.id}`} className="bg-card border border-card-border rounded-lg px-4">
                    <AccordionTrigger className="text-sm font-bold text-right hover:no-underline py-4">
                      {faq.question}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed pb-4">
                      {faq.answer}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          )}

          {/* Admin lesson manager — only visible to the admin phone */}
          {isAdmin && token && (
            <AdminLessonManager courseId={courseId} token={token} phases={course.phases ?? []} />
          )}
        </div>

        {!owned && (
          <div className="fixed left-0 right-0 p-4 bg-background/80 backdrop-blur-xl border-t border-border z-40 max-w-[430px] mx-auto" style={{ bottom: "calc(5rem + env(safe-area-inset-bottom))" }}>
            <Button
              onClick={handleBuy}
              disabled={isPaymentPending}
              className="w-full h-12 font-bold text-lg shadow-lg rounded-xl disabled:opacity-70"
              style={discountInfo?.active && discountInfo.percent > 0 && !selectedMtp && course.price > 0
                ? { background: "linear-gradient(135deg,#dc2626,#b91c1c)", color: "#fff", boxShadow: "0 6px 28px rgba(220,38,38,0.4)" }
                : undefined
              }
              data-testid="button-buy-course"
            >
              {isPaymentPending ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  در حال ثبت سفارش...
                </span>
              ) : selectedMtp ? (
                `خرید دوره — ${formatPrice(selectedMtp.price)}`
              ) : discountInfo?.active && discountInfo.percent > 0 && course.price > 0 ? (
                `خرید دوره — ${formatPrice(Math.round(course.price * (1 - discountInfo.percent / 100) / 1000) * 1000)} تومان`
              ) : (
                `خرید دوره — ${formatPrice(course.price)}`
              )}
            </Button>
          </div>
        )}
      </motion.div>

      {/* ── پلیر توضیحات صوتی (فقط برای غیرخریداران) ── */}
      {!owned && (course as { audioUrl?: string | null }).audioUrl && (
        <AudioDescriptionPlayer
          audioUrl={(course as { audioUrl?: string | null }).audioUrl!}
          title={course.title}
          color="#7c3aed"
          itemType="course"
        />
      )}

      {activeLesson && (
        <MediaPlayerModal lesson={activeLesson} onClose={() => setActiveLesson(null)} />
      )}

    </>
  );
}
