import { useState, useRef, useEffect, useCallback } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Pause, Heart, MessageCircle, Eye, Mic, MicOff,
  Upload, X, Check, ChevronDown, ChevronUp, Send, Music2,
  Square, Loader2, ImagePlus, Plus, Pencil, Download, CheckCircle2, Trash2
} from "lucide-react";
import { useSingleMediaCache } from "@/hooks/use-media-cache";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { formatNumber } from "@/lib/persian";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

// ─── Like persistence (localStorage fallback) ─────────────────────────────────
const LIKED_KEY = "shivafer_liked_posts";
function getLikedSet(): Set<number> {
  try { return new Set(JSON.parse(localStorage.getItem(LIKED_KEY) ?? "[]") as number[]); }
  catch { return new Set(); }
}
function saveLikedSet(s: Set<number>) {
  localStorage.setItem(LIKED_KEY, JSON.stringify([...s]));
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AudioPost {
  id: number;
  title: string;
  description?: string;
  audioUrl: string;
  coverUrl?: string;
  views: number;
  likes: number;
  userLiked: boolean;
  createdAt: string;
}

interface Comment {
  id: number;
  content: string;
  user_name: string;
  user_avatar?: string;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string): string {
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "همین الان";
  if (diff < 3600) return `${Math.floor(diff / 60)} دقیقه پیش`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} ساعت پیش`;
  return `${Math.floor(diff / 86400)} روز پیش`;
}

function fmtNum(n: number): string {
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K`;
  return n.toLocaleString("fa");
}

// ─── Audio Player ─────────────────────────────────────────────────────────────

const SPEEDS = [1, 1.25, 1.5, 1.75, 2];

function AudioPlayer({ url, postId, onView }: { url: string; postId: number; onView: () => void }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [viewed, setViewed] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);

  const toggle = () => {
    const a = audioRef.current;
    if (!a) return;
    if (playing) { a.pause(); setPlaying(false); }
    else { a.play().then(() => setPlaying(true)).catch(() => {}); }
  };

  const cycleSpeed = () => {
    const a = audioRef.current;
    const next = (speedIdx + 1) % SPEEDS.length;
    setSpeedIdx(next);
    if (a) a.playbackRate = SPEEDS[next];
  };

  const handleTimeUpdate = () => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    setProgress(a.currentTime / a.duration);
    if (!viewed && a.currentTime > 5) { setViewed(true); onView(); }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audioRef.current;
    if (!a || !a.duration) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    a.currentTime = ratio * a.duration;
  };

  const fmt = (s: number) => {
    if (!s || !isFinite(s)) return "0:00";
    const m = Math.floor(s / 60), sec = Math.floor(s % 60);
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  const speed = SPEEDS[speedIdx];

  return (
    <div className="mt-3" dir="ltr">
      <audio
        ref={audioRef}
        src={url}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onEnded={() => setPlaying(false)}
        preload="metadata"
      />
      <div className="flex items-center gap-3">
        {/* Play/Pause — left side */}
        <button
          onClick={toggle}
          className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform active:scale-90"
          style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
        >
          {playing
            ? <Pause className="w-4 h-4 text-white fill-white" />
            : <Play className="w-4 h-4 text-white fill-white ml-0.5" />}
        </button>

        {/* Waveform + times */}
        <div className="flex-1 flex flex-col gap-1 min-w-0">
          <div
            className="relative h-8 flex items-center cursor-pointer group"
            onClick={seek}
          >
            <div className="absolute inset-0 flex items-center gap-px overflow-hidden rounded">
              {Array.from({ length: 48 }).map((_, i) => {
                const h = 20 + Math.sin(i * 0.7 + postId) * 12 + Math.sin(i * 1.3) * 8;
                const filled = i / 48 <= progress;
                return (
                  <div
                    key={i}
                    className="flex-1 rounded-sm transition-colors"
                    style={{
                      height: `${h}%`,
                      background: filled
                        ? "linear-gradient(180deg, #a78bfa, #7c3aed)"
                        : "var(--waveform-inactive)",
                    }}
                  />
                );
              })}
            </div>
          </div>
          <div className="flex justify-between text-[10px] text-muted-foreground font-mono">
            <span>{fmt(duration * progress)}</span>
            <span>{fmt(duration)}</span>
          </div>
        </div>

        {/* Speed button — right side */}
        <button
          onClick={cycleSpeed}
          className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-black transition-all active:scale-90"
          style={{
            background: speed !== 1 ? "rgba(124,58,237,0.25)" : "var(--speed-btn-bg-inactive)",
            border: speed !== 1 ? "1px solid rgba(167,139,250,0.4)" : "1px solid var(--speed-btn-border-inactive)",
            color: speed !== 1 ? "#a78bfa" : "var(--speed-btn-color-inactive)",
            minWidth: 36,
          }}
        >
          {speed === 1 ? "1×" : `${speed}×`}
        </button>
      </div>
    </div>
  );
}

// ─── Like Button ──────────────────────────────────────────────────────────────

function LikeButton({ liked, count, onLike }: { liked: boolean; count: number; onLike: () => void }) {
  const [burst, setBurst] = useState(false);

  const handleClick = () => {
    if (!liked) { setBurst(true); setTimeout(() => setBurst(false), 600); }
    onLike();
  };

  return (
    <button onClick={handleClick} className="relative flex items-center gap-1.5 group">
      <motion.div
        animate={liked ? { scale: [1, 1.4, 0.9, 1.15, 1] } : { scale: 1 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="relative"
      >
        {/* Pulse rings when liked */}
        <AnimatePresence>
          {burst && (
            <>
              {[0, 1].map((i) => (
                <motion.div
                  key={i}
                  className="absolute inset-0 rounded-full border-2 border-pink-400"
                  initial={{ scale: 1, opacity: 0.8 }}
                  animate={{ scale: 2.5 + i, opacity: 0 }}
                  exit={{}}
                  transition={{ duration: 0.5, delay: i * 0.08 }}
                />
              ))}
            </>
          )}
        </AnimatePresence>
        <Heart
          className={`w-5 h-5 transition-colors ${liked ? "text-pink-500 fill-pink-500" : "text-muted-foreground group-hover:text-pink-400"}`}
        />
      </motion.div>
      {/* Floating hearts on like */}
      <AnimatePresence>
        {burst && Array.from({ length: 4 }).map((_, i) => (
          <motion.div
            key={`h-${i}`}
            className="absolute pointer-events-none text-pink-400 text-xs"
            style={{ left: (i % 2 === 0 ? -8 : 8) + "px" }}
            initial={{ opacity: 1, y: 0, x: 0 }}
            animate={{ opacity: 0, y: -30 - i * 10, x: (i % 2 === 0 ? -10 : 10) }}
            exit={{}}
            transition={{ duration: 0.7, delay: i * 0.05 }}
          >
            ❤️
          </motion.div>
        ))}
      </AnimatePresence>
      <span className={`text-xs font-bold ${liked ? "text-pink-500" : "text-muted-foreground"}`}>
        {fmtNum(count)}
      </span>
    </button>
  );
}

// ─── Comments Section ─────────────────────────────────────────────────────────

function CommentsSection({ postId, token }: { postId: number; token: string | null }) {
  const [open, setOpen] = useState(false);
  const [comments, setComments] = useState<Comment[]>([]);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch(`${API}/api/audio/${postId}/comments`);
      if (r.ok) setComments(await r.json());
    } finally { setLoading(false); }
  }, [postId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const send = async () => {
    if (!text.trim() || !token) return;
    setSending(true);
    try {
      const r = await fetch(`${API}/api/audio/${postId}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: text.trim() }),
      });
      const d = await r.json();
      if (r.ok) { toast.success(d.message || "نظر ثبت شد"); setText(""); }
      else toast.error(d.error || "خطا");
    } finally { setSending(false); }
  };

  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
      >
        <MessageCircle className="w-5 h-5" />
        <span className="text-xs font-bold">{open ? "بستن" : "نظرات"}</span>
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="mt-3 space-y-2">
              {loading ? (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
              ) : comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">هنوز نظری ثبت نشده</p>
              ) : comments.map((c) => (
                <div key={c.id} className="flex gap-2 p-2 rounded-xl" style={{ background: "rgba(255,255,255,0.04)" }}>
                  <div className="w-7 h-7 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0 text-xs font-bold text-violet-400">
                    {c.user_name?.[0] ?? "؟"}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-bold text-foreground">{c.user_name}</div>
                    <div className="text-xs text-muted-foreground mt-0.5 break-words">{c.content}</div>
                  </div>
                </div>
              ))}

              {token && (
                <div className="flex gap-2 mt-2">
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") send(); }}
                    placeholder="نظر خود را بنویسید..."
                    className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/40"
                    dir="rtl"
                  />
                  <button
                    onClick={send}
                    disabled={sending || !text.trim()}
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
                  >
                    {sending ? <Loader2 className="w-4 h-4 text-white animate-spin" /> : <Send className="w-4 h-4 text-white" />}
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Podcast Offline Button ───────────────────────────────────────────────────

function PodcastOfflineButton({ audioUrl }: { audioUrl: string }) {
  const cacheKey = audioUrl.startsWith("/") ? audioUrl : new URL(audioUrl).pathname;
  const { status, progress, toggle } = useSingleMediaCache(cacheKey, audioUrl);

  return (
    <button
      onClick={toggle}
      className="w-7 h-7 flex items-center justify-center rounded-full transition-all active:scale-90"
      style={{
        background: status === "cached" ? "rgba(74,222,128,0.15)" : "rgba(255,255,255,0.06)",
        border: status === "cached" ? "1px solid rgba(74,222,128,0.35)" : "1px solid rgba(255,255,255,0.1)",
      }}
      title={status === "cached" ? "حذف از حافظه آفلاین" : "ذخیره برای آفلاین"}
    >
      {status === "idle" && <Download className="w-3 h-3 text-muted-foreground" />}
      {status === "downloading" && (
        <div className="relative w-4 h-4 flex items-center justify-center">
          <Loader2 className="w-4 h-4 text-primary animate-spin absolute" />
          <span className="text-[6px] text-white font-bold leading-none">{progress}</span>
        </div>
      )}
      {status === "cached" && <CheckCircle2 className="w-3 h-3 text-green-400" />}
    </button>
  );
}

// ─── Audio Card ───────────────────────────────────────────────────────────────

function AudioCard({ post, token, isAudioAdmin, onUpdate }: {
  post: AudioPost; token: string | null; isAudioAdmin: boolean;
  onUpdate: (id: number, patch: Partial<AudioPost>) => void;
}) {
  const [showEdit, setShowEdit] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const handleLike = async () => {
    if (!token) { toast.error("برای لایک کردن وارد شوید"); return; }
    const wasLiked = post.userLiked;
    const newLiked = !wasLiked;
    const liked = getLikedSet();
    if (newLiked) liked.add(post.id); else liked.delete(post.id);
    saveLikedSet(liked);
    onUpdate(post.id, { userLiked: newLiked, likes: post.likes + (wasLiked ? -1 : 1) });
    try {
      await fetch(`${API}/api/audio/${post.id}/like`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
    } catch {
      if (wasLiked) liked.add(post.id); else liked.delete(post.id);
      saveLikedSet(liked);
      onUpdate(post.id, { userLiked: wasLiked, likes: post.likes });
    }
  };

  const handleView = async () => {
    onUpdate(post.id, { views: post.views + 1 });
    fetch(`${API}/api/audio/${post.id}/view`, { method: "POST" }).catch(() => {});
  };

  return (
    <>
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(20px)",
        boxShadow: "0 4px 32px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.07)",
      }}
    >
      {/* Glass shimmer top */}
      <div className="absolute top-0 left-6 right-6 h-px"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.15), transparent)" }} />

      {/* Cover image (if present) */}
      {post.coverUrl && (
        <div className="relative w-full overflow-hidden" style={{ aspectRatio: "3/1" }}>
          <CachedImage src={post.coverUrl} alt={post.title} className="w-full h-full object-cover" />
        </div>
      )}

      <div className="p-4">
        {/* No cover: show music icon inline */}
        {!post.coverUrl && (
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: "linear-gradient(135deg, rgba(124,58,237,0.3), rgba(79,70,229,0.2))", border: "1px solid rgba(167,139,250,0.2)" }}>
              <Music2 className="w-6 h-6 text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-black text-base text-foreground leading-tight truncate">{post.title}</h3>
            </div>
            {isAudioAdmin && (
              <button onClick={() => setShowEdit(true)}
                className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform"
                style={{ background: "rgba(232,184,0,0.15)", border: "1px solid rgba(232,184,0,0.3)" }}>
                <Pencil className="w-3.5 h-3.5" style={{ color: "#e8b800" }} />
              </button>
            )}
          </div>
        )}

        {post.coverUrl && (
          <div className="flex items-start justify-between gap-2 mb-1">
            <h3 className="font-black text-base text-foreground leading-tight flex-1">{post.title}</h3>
            {isAudioAdmin && (
              <button onClick={() => setShowEdit(true)}
                className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 active:scale-90 transition-transform mt-0.5"
                style={{ background: "rgba(232,184,0,0.15)", border: "1px solid rgba(232,184,0,0.3)" }}>
                <Pencil className="w-3 h-3" style={{ color: "#e8b800" }} />
              </button>
            )}
          </div>
        )}

        {post.description && (
          <div className="mt-1 mb-2">
            <p
              className={`text-sm text-muted-foreground leading-relaxed transition-all duration-300 ${descExpanded ? "" : "line-clamp-1"}`}
            >
              {post.description}
            </p>
            <button
              onClick={() => setDescExpanded((v) => !v)}
              className="flex items-center gap-1 mt-1 text-[11px] font-bold active:opacity-70 transition-opacity"
              style={{ color: "rgba(167,139,250,0.8)" }}
            >
              {descExpanded ? (
                <><ChevronUp className="w-3 h-3" />بستن</>
              ) : (
                <><ChevronDown className="w-3 h-3" />بیشتر</>
              )}
            </button>
          </div>
        )}

        {/* Audio player */}
        <AudioPlayer url={post.audioUrl} postId={post.id} onView={handleView} />

        {/* Stats row — time + likes + comments + views + offline */}
        <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
          <div className="flex items-center gap-4">
            <LikeButton liked={post.userLiked} count={post.likes} onLike={handleLike} />
            <CommentsSection postId={post.id} token={token} />
          </div>
          <div className="flex items-center gap-3">
            <span className="text-[10px] text-muted-foreground/60">{timeAgo(post.createdAt)}</span>
            <div className="flex items-center gap-1 text-muted-foreground">
              <Eye className="w-3.5 h-3.5" />
              <span className="text-xs font-bold">{fmtNum(post.views)}</span>
            </div>
          </div>
        </div>
      </div>
    </motion.div>

    {/* Edit modal */}
    <AnimatePresence>
      {showEdit && (
        <AdminEditModal
          post={post}
          token={token!}
          onClose={() => setShowEdit(false)}
          onUpdated={(patch) => { onUpdate(post.id, patch); setShowEdit(false); }}
        />
      )}
    </AnimatePresence>
    </>
  );
}

// ─── Admin Upload Modal ───────────────────────────────────────────────────────

function AdminUploadModal({ token, onCreated, onClose }: {
  token: string;
  onCreated: (post: AudioPost) => void;
  onClose: () => void;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [audioUrl, setAudioUrl] = useState("");
  const [coverUrl, setCoverUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const adminToken = localStorage.getItem("shivafer_admin_token") ?? token;

  // authToken اختیاری: requireUser endpoints از token، requireAdmin از adminToken
  const uploadFile = async (file: File, endpoint: string, onProgress?: (pct: number) => void, authToken?: string): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText).url); } catch { reject(new Error("پاسخ نامعتبر")); }
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).error || "خطا در آپلود")); } catch { reject(new Error("خطا در آپلود")); }
        }
      };
      xhr.onerror = () => reject(new Error("اتصال قطع شد"));
      xhr.open("POST", `${API}/api/${endpoint}`);
      xhr.setRequestHeader("Authorization", `Bearer ${authToken ?? adminToken}`);
      xhr.send(fd);
    });
  };

  const pickAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadPct(0);
    try {
      // podcast-audio → requireUser → user token
      const url = await uploadFile(file, "upload/podcast-audio", setUploadPct, token);
      setAudioUrl(url);
      toast.success("فایل صوتی آپلود شد");
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); }
  };

  const pickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingCover(true);
    try {
      // podcast-image → requireUser → user token
      const url = await uploadFile(file, "upload/podcast-image", undefined, token);
      setCoverUrl(url);
      toast.success("کاور آپلود شد");
    } catch (err: any) { toast.error(err.message); }
    finally { setUploadingCover(false); }
  };

  const startRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        const file = new File([blob], `recording-${Date.now()}.webm`, { type: "audio/webm" });
        setUploading(true);
        try {
          // podcast-audio → requireUser → user token
          const url = await uploadFile(file, "upload/podcast-audio", undefined, token);
          setAudioUrl(url);
          toast.success("ضبط آپلود شد");
        } catch (err: any) { toast.error(err.message); }
        finally { setUploading(false); }
      };
      mr.start();
      mediaRef.current = mr;
      setRecording(true);
      setRecordingTime(0);
      timerRef.current = setInterval(() => setRecordingTime((t) => t + 1), 1000);
    } catch { toast.error("دسترسی به میکروفون رد شد"); }
  };

  const stopRecord = () => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    mediaRef.current?.stop();
    mediaRef.current = null;
    setRecording(false);
  };

  const save = async () => {
    if (!title.trim() || !audioUrl) { toast.error("عنوان و فایل صوتی الزامی است"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/admin/audio`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, audioUrl, coverUrl: coverUrl || undefined }),
      });
      if (!r.ok) { const d = await r.json(); toast.error(d.error || "خطا"); return; }
      const raw = await r.json();
      onCreated({ id: raw.id, title: raw.title, description: raw.description, audioUrl: raw.audio_url, coverUrl: raw.cover_url, views: 0, likes: 0, userLiked: false, createdAt: raw.created_at });
      toast.success("پست صوتی ساخته شد");
      onClose();
    } finally { setSaving(false); }
  };

  const fmtRec = (s: number) => `${Math.floor(s / 60).toString().padStart(2, "0")}:${(s % 60).toString().padStart(2, "0")}`;

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-[430px] rounded-t-3xl overflow-hidden"
        style={{ background: "var(--sheet-bg)", border: "1px solid var(--sheet-border)", borderBottom: "none" }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        {/* Scrollable content with safe area padding */}
        <div className="overflow-y-auto max-h-[85dvh] p-5" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
        {/* Handle */}
        <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />

        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-foreground">پست صوتی جدید</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>

        <div className="space-y-3">
          {/* Title */}
          <input
            value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="عنوان پست صوتی *"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50"
            dir="rtl"
          />
          {/* Description */}
          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="توضیحات (اختیاری)"
            rows={2}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50 resize-none"
            dir="rtl"
          />

          {/* Audio upload / record */}
          <div className="space-y-2">
          <div className="flex gap-2">
            <label className={`flex-1 flex items-center justify-center gap-2 rounded-xl px-3 py-3 border transition-colors cursor-pointer ${audioUrl ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"}`}>
              <input type="file" accept="audio/*,audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/flac,audio/x-m4a,.mp3,.m4a,.aac,.ogg,.wav,.flac,.opus,.wma" className="hidden" onChange={pickAudio} disabled={uploading} />
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : audioUrl ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
              <span className="text-xs font-bold">{uploading ? `آپلود ${uploadPct}%` : audioUrl ? "فایل آپلود شد" : "آپلود از گالری"}</span>
            </label>

            <button
              onClick={recording ? stopRecord : startRecord}
              className={`flex items-center gap-2 rounded-xl px-3 py-3 border transition-colors ${recording ? "border-red-500/40 bg-red-500/10 text-red-400" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"}`}
            >
              {recording ? <><Square className="w-4 h-4 fill-red-400" /><span className="text-xs font-bold font-mono">{fmtRec(recordingTime)}</span></> : <><Mic className="w-4 h-4" /><span className="text-xs font-bold">ضبط</span></>}
            </button>
          </div>
          {uploading && (
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div className="h-full rounded-full transition-all duration-200" style={{ width: `${uploadPct}%`, background: "linear-gradient(90deg, #7c3aed, #4f46e5)" }} />
            </div>
          )}
          </div>{/* end audio section */}

          {/* Cover */}
          <div>
            <label className={`flex items-center gap-2 rounded-xl px-4 py-3 border transition-colors cursor-pointer ${coverUrl ? "border-violet-500/40 bg-violet-500/10 text-violet-400" : "border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"}`}>
              <input type="file" accept="image/*" className="hidden" onChange={pickCover} />
              {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : coverUrl ? <Check className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
              <span className="text-xs font-bold">{coverUrl ? "کاور آپلود شد" : "تصویر کاور (اختیاری)"}</span>
              {coverUrl && <CachedImage src={coverUrl} alt="" className="w-8 h-8 rounded-lg object-cover mr-auto" />}
            </label>
            <p className="text-[11px] text-muted-foreground/60 mt-1 px-1">سایز پیشنهادی: ۱۲۰۰×۴۰۰ پیکسل — نسبت ۳:۱ (عریض و نازک)</p>
          </div>

          {/* Save button */}
          <button
            onClick={save}
            disabled={saving || uploading || !title.trim() || !audioUrl}
            className="w-full py-3 rounded-xl font-black text-white text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
            style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "انتشار پست صوتی"}
          </button>
        </div>
        </div>{/* end scrollable */}
      </motion.div>
    </motion.div>
  );
}

// ─── Admin Edit Modal ─────────────────────────────────────────────────────────

function AdminEditModal({ post, token, onClose, onUpdated }: {
  post: AudioPost; token: string;
  onClose: () => void;
  onUpdated: (patch: Partial<AudioPost>) => void;
}) {
  const [title, setTitle] = useState(post.title);
  const [description, setDescription] = useState(post.description ?? "");
  const [audioUrl, setAudioUrl] = useState(post.audioUrl);
  const [coverUrl, setCoverUrl] = useState(post.coverUrl ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [saving, setSaving] = useState(false);

  const uploadFile = (file: File, endpoint: string, onProgress?: (pct: number) => void): Promise<string> => {
    return new Promise((resolve, reject) => {
      const fd = new FormData();
      fd.append("file", file);
      const xhr = new XMLHttpRequest();
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
        };
      }
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText).url); } catch { reject(new Error("پاسخ نامعتبر")); }
        } else {
          try { reject(new Error(JSON.parse(xhr.responseText).error || "خطا در آپلود")); } catch { reject(new Error("خطا در آپلود")); }
        }
      };
      xhr.onerror = () => reject(new Error("اتصال قطع شد"));
      xhr.open("POST", `${API}/api/${endpoint}`);
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
      xhr.send(fd);
    });
  };

  const pickAudio = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploading(true);
    setUploadPct(0);
    try {
      const url = await uploadFile(file, "upload/podcast-audio", setUploadPct);
      setAudioUrl(url);
      toast.success("فایل صوتی جدید آپلود شد");
    } catch (err: any) { toast.error(err.message); }
    finally { setUploading(false); }
  };

  const pickCover = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setUploadingCover(true);
    try {
      const url = await uploadFile(file, "upload/podcast-image");
      setCoverUrl(url);
      toast.success("کاور جدید آپلود شد");
    } catch (err: any) { toast.error(err.message); }
    finally { setUploadingCover(false); }
  };

  const save = async () => {
    if (!title.trim()) { toast.error("عنوان الزامی است"); return; }
    setSaving(true);
    try {
      const r = await fetch(`${API}/api/audio/${post.id}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: title.trim(), description: description.trim() || undefined, audioUrl, coverUrl: coverUrl || undefined }),
      });
      if (!r.ok) { const d = await r.json(); throw new Error(d.error || "خطا"); }
      toast.success("پست ویرایش شد");
      onUpdated({ title: title.trim(), description: description.trim() || undefined, audioUrl, coverUrl: coverUrl || undefined });
    } catch (err: any) { toast.error(err.message); }
    finally { setSaving(false); }
  };

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end justify-center"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-[430px] rounded-t-3xl overflow-hidden"
        style={{ background: "var(--sheet-bg)", border: "1px solid rgba(180,130,0,0.20)", borderBottom: "none" }}
        initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      >
        <div className="overflow-y-auto max-h-[85dvh] p-5" style={{ paddingBottom: "calc(6rem + env(safe-area-inset-bottom))" }}>
          <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-4" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-black text-foreground">ویرایش پست صوتی</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          <div className="space-y-3">
            <input
              value={title} onChange={(e) => setTitle(e.target.value)}
              placeholder="عنوان پست صوتی *"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50"
              dir="rtl"
            />
            <textarea
              value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="توضیحات (اختیاری)"
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-violet-500/50 resize-none"
              dir="rtl"
            />

            {/* Audio file */}
            <div className="space-y-2">
              <label className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 border transition-colors cursor-pointer ${audioUrl !== post.audioUrl ? "border-green-500/40 bg-green-500/10 text-green-400" : "border-white/10 bg-white/5 text-muted-foreground"}`}>
                <input type="file" accept="audio/*,audio/mpeg,audio/mp3,audio/mp4,audio/aac,audio/ogg,audio/wav,audio/flac,audio/x-m4a,.mp3,.m4a,.aac,.ogg,.wav,.flac,.opus,.wma" className="hidden" onChange={pickAudio} disabled={uploading} />
                {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : audioUrl !== post.audioUrl ? <Check className="w-4 h-4" /> : <Upload className="w-4 h-4" />}
                <span className="text-xs font-bold">{uploading ? `آپلود ${uploadPct}%` : audioUrl !== post.audioUrl ? "فایل صوتی جدید آپلود شد" : "تغییر فایل صوتی"}</span>
              </label>
              {uploading && (
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.08)" }}>
                  <div className="h-full rounded-full transition-all duration-200" style={{ width: `${uploadPct}%`, background: "linear-gradient(90deg, #7c3aed, #4f46e5)" }} />
                </div>
              )}
            </div>

            {/* Cover */}
            <div>
              <label className={`flex items-center gap-2 rounded-xl px-4 py-3 border transition-colors cursor-pointer ${coverUrl && coverUrl !== post.coverUrl ? "border-violet-500/40 bg-violet-500/10 text-violet-400" : "border-white/10 bg-white/5 text-muted-foreground"}`}>
                <input type="file" accept="image/*" className="hidden" onChange={pickCover} />
                {uploadingCover ? <Loader2 className="w-4 h-4 animate-spin" /> : coverUrl ? <Check className="w-4 h-4" /> : <ImagePlus className="w-4 h-4" />}
                <span className="text-xs font-bold">{uploadingCover ? "در حال آپلود..." : coverUrl && coverUrl !== post.coverUrl ? "کاور جدید آپلود شد" : "تغییر تصویر کاور"}</span>
                {coverUrl && <CachedImage src={coverUrl} alt="" className="w-8 h-8 rounded-lg object-cover mr-auto" />}
              </label>
              <p className="text-[11px] text-muted-foreground/60 mt-1 px-1">سایز پیشنهادی: ۱۲۰۰×۴۰۰ پیکسل — نسبت ۳:۱</p>
            </div>

            <button
              onClick={save}
              disabled={saving || !title.trim()}
              className="w-full py-3 rounded-xl font-black text-black text-sm disabled:opacity-40 active:scale-[0.98] transition-transform"
              style={{ background: "linear-gradient(135deg, #fef08a, #e8b800)" }}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "ذخیره تغییرات"}
            </button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Module-level cache (survives route changes) ──────────────────────────────
let _cachedPosts: AudioPost[] = [];

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function Podcasts() {
  const { token, user } = useAuth();
  const [posts, setPosts] = useState<AudioPost[]>(_cachedPosts);
  const [loading, setLoading] = useState(_cachedPosts.length === 0);
  const [showUpload, setShowUpload] = useState(false);
  const isAdmin = !!localStorage.getItem("shivafer_admin_token");
  const AUDIO_ADMIN_PHONE = "09354505225";
  const isAudioAdmin = isAdmin || (user as any)?.phone === AUDIO_ADMIN_PHONE;

  const load = useCallback(async () => {
    if (_cachedPosts.length === 0) setLoading(true);
    try {
      const r = await fetch(`${API}/api/audio`, token ? { headers: { Authorization: `Bearer ${token}` } } : {});
      if (r.ok) {
        const data: AudioPost[] = await r.json();
        const liked = getLikedSet();
        const mapped = data.map((p) => ({ ...p, userLiked: p.userLiked || liked.has(p.id) }));
        _cachedPosts = mapped;
        setPosts(mapped);
      }
    } finally { setLoading(false); }
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const updatePost = (id: number, patch: Partial<AudioPost>) => {
    setPosts((prev) => prev.map((p) => p.id === id ? { ...p, ...patch } : p));
  };

  return (
    <div className="min-h-full pb-24" dir="rtl">
      {/* Admin FAB */}
      {isAudioAdmin && (
        <button
          onClick={() => setShowUpload(true)}
          className="fixed left-4 z-30 flex items-center gap-1.5 px-4 py-3 rounded-2xl text-sm font-bold text-white active:scale-95 transition-transform shadow-xl"
          style={{ bottom: "calc(5rem + env(safe-area-inset-bottom) + 0.75rem)", background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
        >
          <Plus className="w-4 h-4" />
          پست جدید
        </button>
      )}

      <div className="px-4 py-4 space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl h-52 animate-pulse"
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)" }} />
          ))
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="w-20 h-20 rounded-2xl flex items-center justify-center mb-4"
              style={{ background: "rgba(124,58,237,0.1)", border: "1px solid rgba(124,58,237,0.2)" }}>
              <Music2 className="w-10 h-10 text-violet-400" />
            </div>
            <p className="font-bold text-foreground text-lg mb-1">هنوز پستی نیست</p>
            <p className="text-sm text-muted-foreground">پادکست‌های آموزشی به‌زودی اضافه می‌شوند</p>
          </div>
        ) : posts.map((p, i) => (
          <motion.div key={p.id} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <AudioCard post={p} token={token} isAudioAdmin={isAudioAdmin} onUpdate={updatePost} />
          </motion.div>
        ))}
      </div>

      <AnimatePresence>
        {showUpload && (
          <AdminUploadModal
            token={token ?? ""}
            onCreated={(p) => setPosts((prev) => [p, ...prev])}
            onClose={() => setShowUpload(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
