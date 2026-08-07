import { staticAssetUrl } from "@/lib/static-assets";
import { useTheme } from "@/lib/theme-context";
import { useState, useRef, useEffect } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { useAuth } from "@/lib/auth";
import { useGetChannelPosts, useIncrementChannelPostView } from "@workspace/api-client-react";
import {
  Pin, PinOff, Eye, ChevronDown, ChevronUp, Megaphone,
  Pencil, Trash2, Send, ImageIcon, Video, Mic, MicOff,
  Paperclip, X, Play, Pause, Wrench,
} from "lucide-react";
import { useLocation } from "wouter";
import { formatDistanceToNow } from "date-fns";
import { faIR } from "date-fns/locale";

const OWNER_PHONE = "09354505225";
const DEFAULT_CHANNEL_NAME = "سهیل شیوافر";
const DEFAULT_CHANNEL_AVATAR = "/icon-192.png";

function timeAgo(date: string) {
  try {
    return formatDistanceToNow(new Date(date), { addSuffix: true, locale: faIR });
  } catch {
    return "";
  }
}

// ─── Member count — deterministic daily growth from base date ──────────────
function calcMemberCount(): number {
  const BASE_DATE = new Date("2026-05-29T00:00:00Z");
  const BASE_COUNT = 1032;
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  BASE_DATE.setUTCHours(0, 0, 0, 0);
  const diffDays = Math.max(0, Math.floor((today.getTime() - BASE_DATE.getTime()) / 86400000));
  let count = BASE_COUNT;
  for (let i = 1; i <= diffDays; i++) {
    const d = new Date(BASE_DATE.getTime() + i * 86400000);
    const seed = d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate();
    const r = ((seed * 1664525 + 1013904223) >>> 0) % 81 + 20; // [20, 100]
    count += r;
  }
  return count;
}

// ─── Post view count — grows over 48h to 83% of members, ticks live ────────
function calcPostViews(createdAt: string, memberCount: number, tick: number): number {
  const created = new Date(createdAt).getTime();
  const hoursSince = Math.max(0, (Date.now() - created) / 3600000);
  const maxViews = Math.floor(memberCount * 0.83);

  if (hoursSince >= 48) {
    // Mature post — sit at max with ±1 live jitter
    return maxViews + (tick % 3 === 0 ? 1 : 0);
  }

  // Sqrt growth curve feels natural (fast start, slows near 48h)
  const progress = Math.sqrt(hoursSince / 48);
  const base = Math.floor(maxViews * progress);
  // Each 4-sec tick nudges views by ~0.05% of max for fresh posts
  const tickBoost = Math.floor(tick * maxViews * 0.0005 * (1 - progress));
  return Math.min(base + tickBoost, maxViews);
}

// ─── Channel header (Telegram-style glassmorphism) ─────────────────────────
function ChannelHeader({ memberCount, channelAvatar, channelName }: { memberCount: number; channelAvatar: string; channelName: string }) {
  const formatted = memberCount.toLocaleString("fa-IR");
  const [, setLocation] = useLocation();
  return (
    <div
      className="sticky top-0 z-40 flex items-center justify-between gap-3 px-4"
      dir="rtl"
      style={{
        height: 64,
        background: "var(--channel-header-bg)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
        borderBottom: "1px solid var(--channel-header-border)",
        boxShadow: "0 2px 24px rgba(0,0,0,0.25)",
      }}
    >
      {/* tools shortcut — first in JSX → RIGHT side in RTL */}
      <button
        onClick={() => setLocation("/tools")}
        aria-label="ابزارها"
        className="flex items-center gap-1.5 rounded-full px-3 py-1.5 shrink-0 active:scale-95 transition-transform"
        style={{ background: "var(--channel-tools-btn-bg)", border: "1px solid var(--channel-tools-btn-border)" }}
      >
        <Wrench className="w-4 h-4" style={{ color: "var(--channel-tools-btn-icon)" }} />
        <span className="text-xs font-semibold" style={{ color: "var(--channel-tools-btn-text)" }}>ابزارها</span>
      </button>

      {/* profile group — mirrors the chatbot header exactly */}
      <div className="flex items-center gap-2.5">
        {/* text first in flex → RIGHT side in RTL */}
        <div className="min-w-0">
          <div className="flex items-center justify-end gap-1">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="shrink-0">
              <circle cx="12" cy="12" r="12" fill="#3b82f6" />
              <path d="M7 12.5l3.5 3.5 6.5-7" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span className="font-bold text-sm leading-tight truncate" style={{ color: "var(--post-text)" }}>{channelName}</span>
          </div>
          <p className="text-xs mt-0.5 text-left" style={{ color: "var(--post-meta)" }}>
            {formatted} عضو
          </p>
        </div>
        {/* avatar second in flex → LEFT side in RTL */}
        <img
          src={channelAvatar}
          alt=""
          className="rounded-full object-cover shrink-0"
          style={{ width: 42, height: 42 }}
        />
      </div>
    </div>
  );
}

// ─── Voice Player ─────────────────────────────────────────────────────────────
function VoicePlayer({ url }: { url: string }) {
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    playing ? a.pause() : a.play();
  }

  function fmt(s: number) {
    const m = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${m}:${ss.toString().padStart(2, "0")}`;
  }

  const BARS = [3, 5, 8, 4, 7, 10, 6, 4, 9, 5, 3, 8, 6, 10, 4, 7, 5, 9, 3, 8, 6, 4, 7, 5, 10, 3, 8, 4, 6, 5];

  return (
    <div
      className="flex items-center gap-3 p-3 rounded-2xl mt-2"
      style={{ background: "rgba(139,92,246,0.12)", border: "1px solid rgba(139,92,246,0.22)" }}
    >
      <audio
        ref={audioRef}
        src={url}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => { setPlaying(false); setProgress(0); setCurrentTime(0); }}
        onLoadedMetadata={() => setDuration(audioRef.current?.duration ?? 0)}
        onTimeUpdate={() => {
          const a = audioRef.current;
          if (!a) return;
          setCurrentTime(a.currentTime);
          setProgress(a.duration ? a.currentTime / a.duration : 0);
        }}
      />
      <button
        onClick={toggle}
        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-transform"
        style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
      >
        {playing
          ? <Pause className="w-4 h-4 text-white" />
          : <Play className="w-4 h-4 text-white" style={{ marginLeft: 2 }} />}
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-end gap-px h-7">
          {BARS.map((h, i) => {
            const filled = progress > 0 && i / BARS.length <= progress;
            return (
              <div
                key={i}
                style={{
                  width: 2.5, height: `${h * 2 + 4}px`, borderRadius: 2, flexShrink: 0,
                  background: filled ? "#7c3aed" : "rgba(139,92,246,0.3)",
                  transition: "background 0.15s",
                }}
              />
            );
          })}
        </div>
        <p className="text-[10px] mt-1 text-muted-foreground">
          {playing || currentTime > 0 ? fmt(currentTime) : fmt(duration)}
        </p>
      </div>
    </div>
  );
}

// ─── Circle Video ──────────────────────────────────────────────────────────────
function CircleVideo({ url }: { url: string }) {
  return (
    <div className="mt-3 flex justify-center">
      <video
        src={url}
        controls
        playsInline
        style={{
          width: 220, height: 220, borderRadius: "50%",
          objectFit: "cover", display: "block", background: "#000",
          boxShadow: "0 4px 24px rgba(124,58,237,0.3)",
        }}
      />
    </div>
  );
}

// ─── Post Media ────────────────────────────────────────────────────────────────
function PostMedia({ mediaUrl, mediaType }: { mediaUrl?: string | null; mediaType?: string | null }) {
  if (!mediaUrl) return null;
  if (mediaType === "image") return <CachedImage src={mediaUrl} alt="" className="w-full rounded-2xl object-cover max-h-96 mt-3" loading="lazy" />;
  if (mediaType === "video") return <video src={mediaUrl} controls playsInline className="w-full rounded-2xl mt-3 max-h-80 bg-black" />;
  if (mediaType === "video_circle") return <CircleVideo url={mediaUrl} />;
  if (mediaType === "voice") return <VoicePlayer url={mediaUrl} />;
  return null;
}

// ─── Post Card ─────────────────────────────────────────────────────────────────
function PostCard({
  post, isOwner, onEdit, onDelete, onPin, memberCount, tick, channelName,
}: {
  post: any;
  isOwner: boolean;
  onEdit: (p: any) => void;
  onDelete: (id: number) => void;
  onPin: (id: number, v: boolean) => void;
  memberCount: number;
  tick: number;
  channelName: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const { mutate: trackView } = useIncrementChannelPostView();
  const viewed = useRef(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const LIMIT = 280;
  const isLong = (post.content?.length ?? 0) > LIMIT;
  const display = isLong && !expanded ? post.content.slice(0, LIMIT) + "…" : post.content;

  useEffect(() => {
    if (viewed.current) return;
    const el = cardRef.current;
    if (!el) return;
    const obs = new IntersectionObserver(([e]) => {
      if (e.isIntersecting && !viewed.current) {
        viewed.current = true;
        trackView({ id: post.id });
        // Mark channel post as seen in localStorage
        const sid = String(post.id);
        const seen = new Set<string>(
          JSON.parse(localStorage.getItem("seenChannelIds") || "[]"),
        );
        if (!seen.has(sid)) {
          seen.add(sid);
          localStorage.setItem("seenChannelIds", JSON.stringify([...seen]));
          window.dispatchEvent(new Event("shivafer-seen-update"));
        }
        obs.disconnect();
      }
    }, { threshold: 0.5 });
    obs.observe(el);
    return () => obs.disconnect();
  }, [post.id, trackView]);

  return (
    // dir="ltr" forces left-anchor regardless of parent RTL container
    <div ref={cardRef} className="px-3 mb-1.5" dir="ltr">
      {post.isPinned && (
        <div className="flex items-center gap-1.5 mb-1 text-xs font-bold" style={{ color: "rgba(139,92,246,0.75)" }}>
          <Pin className="w-3 h-3" />
          پیام پین‌شده
        </div>
      )}
      <div className="flex">
      <div
        className="rounded-2xl px-3.5 pt-3 pb-2.5 max-w-[85%]"
        style={{ background: "hsl(var(--card))", boxShadow: "0 2px 12px rgba(0,0,0,0.35)" }}
      >
        {/* Channel name row */}
        <div className="flex items-center gap-1.5 mb-1">
          <span className="font-bold text-[17px]" style={{ color: "#a78bfa" }}>{channelName}</span>
        </div>

        {/* Content — RTL for Persian text */}
        {post.content ? (
          <>
            <p className="text-[15px] leading-6 whitespace-pre-wrap" dir="rtl" style={{ color: "var(--post-text)", textAlign: "right" }}>
              {display}
            </p>
            {isLong && (
              <div dir="rtl" className="text-right">
                <button onClick={() => setExpanded(e => !e)} className="inline-flex items-center gap-1 mt-0.5 text-xs font-bold" style={{ color: "rgba(139,92,246,0.85)" }}>
                  {expanded ? <><ChevronUp className="w-3 h-3" />کمتر</> : <><ChevronDown className="w-3 h-3" />بیشتر</>}
                </button>
              </div>
            )}
          </>
        ) : null}

        <PostMedia mediaUrl={post.mediaUrl} mediaType={post.mediaType} />

        {/* Footer — stats right, owner controls left */}
        <div className="flex items-center mt-2.5">
          {isOwner && (
            <div className="flex items-center gap-3">
              <button onClick={() => onPin(post.id, !post.isPinned)} className="active:opacity-50 transition-opacity" style={{ color: post.isPinned ? "var(--post-pinned-color)" : "var(--post-btn-muted)" }}>
                {post.isPinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
              </button>
              <button onClick={() => onEdit(post)} className="active:opacity-50" style={{ color: "rgba(139,92,246,0.7)" }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDelete(post.id)} className="active:opacity-50" style={{ color: "rgba(239,68,68,0.6)" }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          <div className="flex items-center gap-3 ml-auto">
            <span className="text-[11px]" dir="rtl" style={{ color: "var(--post-meta)", unicodeBidi: "embed" }}>{timeAgo(post.createdAt)}</span>
            <div className="flex items-center gap-1 text-[11px]" style={{ color: "var(--post-meta)" }}>
              <Eye className="w-3 h-3" />
              {calcPostViews(post.createdAt, memberCount, tick).toLocaleString("fa-IR")}
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

// ─── Posts localStorage cache ──────────────────────────────────────────────────
const POSTS_CACHE_KEY = "shivafer_channel_posts_cache";
const POSTS_CACHE_TS_KEY = "shivafer_channel_posts_ts";

function readPostsCache(): { posts: any[]; updatedAt: number } {
  try {
    const raw = localStorage.getItem(POSTS_CACHE_KEY);
    const ts = Number(localStorage.getItem(POSTS_CACHE_TS_KEY) ?? "0");
    if (raw && ts) return { posts: JSON.parse(raw), updatedAt: ts };
  } catch {}
  return { posts: [], updatedAt: 0 };
}

function writePostsCache(posts: any[]) {
  try {
    localStorage.setItem(POSTS_CACHE_KEY, JSON.stringify(posts));
    localStorage.setItem(POSTS_CACHE_TS_KEY, String(Date.now()));
  } catch {}
}

// ─── Main Page ─────────────────────────────────────────────────────────────────
export default function ChannelPage() {
  const { token, user } = useAuth();
  const { resolved: themeResolved } = useTheme();
  const isOwner = user?.phone === OWNER_PHONE;

  // Read localStorage cache once at module-load time (sync, before first render)
  const { posts: cachedPosts, updatedAt: cacheTs } = readPostsCache();

  const { data: postsRaw = cachedPosts, refetch: refetchPostsRaw, isPending: postsPending } = useGetChannelPosts({
    staleTime: 30_000,
    gcTime: 10 * 60_000,
    initialData: cachedPosts.length > 0 ? cachedPosts : undefined,
    initialDataUpdatedAt: cacheTs,
  });

  // True only on absolute first visit — no cache AND fetch in flight
  const postsLoading = postsPending && cachedPosts.length === 0;

  // Keep localStorage in sync whenever fresh data arrives
  const posts = postsRaw;
  useEffect(() => {
    if (postsRaw && postsRaw.length > 0) writePostsCache(postsRaw);
  }, [postsRaw]);

  const refetchPosts = refetchPostsRaw;

  // Live tick — increments every 4 seconds to animate view counts
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 4000);
    return () => clearInterval(id);
  }, []);

  // Deterministic member count (grows daily 20-100)
  const memberCount = calcMemberCount();

  // Composer
  const [composerText, setComposerText] = useState("");
  const [attachOpen, setAttachOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);

  // Voice recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingSecs, setRecordingSecs] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const recTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // File inputs
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const circleVideoInputRef = useRef<HTMLInputElement>(null);

  // Edit / delete
  const [editingPost, setEditingPost] = useState<any>(null);
  const [editText, setEditText] = useState("");
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const postsEndRef = useRef<HTMLDivElement>(null);

  // ── scroll to bottom when posts load or new post arrives ────────────────────
  useEffect(() => {
    postsEndRef.current?.scrollIntoView({ behavior: "instant" });
  }, [(posts as any[]).length]);

  // ── helpers ─────────────────────────────────────────────────────────────────
  async function uploadFile(file: File, endpoint: string): Promise<string> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(`/api${endpoint}`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error((err as any).error ?? "آپلود ناموفق بود");
    }
    const data = await res.json() as { url: string };
    return data.url;
  }

  async function createPost(content: string, mediaUrl?: string, mediaType?: string) {
    const res = await fetch("/api/channel/owner/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ content: content.trim(), mediaUrl: mediaUrl ?? null, mediaType: mediaType ?? null }),
    });
    if (!res.ok) throw new Error("ارسال ناموفق");
  }

  // ── send text ────────────────────────────────────────────────────────────────
  async function handleSendText() {
    const text = composerText.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      await createPost(text);
      setComposerText("");
      if (textareaRef.current) { textareaRef.current.style.height = "auto"; }
      await refetchPosts();
    } catch { /* ignore */ }
    setSending(false);
  }

  // ── send image ───────────────────────────────────────────────────────────────
  async function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAttachOpen(false);
    setSending(true);
    setUploadMsg("در حال آپلود تصویر...");
    try {
      const url = await uploadFile(file, "/upload/channel-image");
      await createPost(composerText.trim(), url, "image");
      setComposerText("");
      await refetchPosts();
    } catch { /* ignore */ }
    setUploadMsg(null);
    setSending(false);
  }

  // ── send video ───────────────────────────────────────────────────────────────
  async function handleVideoChange(e: React.ChangeEvent<HTMLInputElement>, circle: boolean) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAttachOpen(false);
    setSending(true);
    setUploadMsg("در حال آپلود ویدیو...");
    try {
      const url = await uploadFile(file, "/upload/channel-video");
      await createPost(composerText.trim(), url, circle ? "video_circle" : "video");
      setComposerText("");
      await refetchPosts();
    } catch { /* ignore */ }
    setUploadMsg(null);
    setSending(false);
  }

  // ── voice recording ──────────────────────────────────────────────────────────
  async function toggleRecording() {
    if (isRecording) {
      mediaRecorderRef.current?.stop();
      if (recTimerRef.current) clearInterval(recTimerRef.current);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/mp4") ? "audio/mp4" : "";
      const mr = new MediaRecorder(stream, mimeType ? { mimeType } : {});
      audioChunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) audioChunksRef.current.push(ev.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(audioChunksRef.current, { type: mimeType || "audio/webm" });
        const ext = mimeType?.includes("mp4") ? ".mp4" : ".webm";
        const file = new File([blob], `voice${ext}`, { type: blob.type });
        setSending(true);
        setUploadMsg("در حال ارسال پیام صوتی...");
        try {
          const url = await uploadFile(file, "/upload/channel-voice");
          await createPost("", url, "voice");
          await refetchPosts();
        } catch { /* ignore */ }
        setUploadMsg(null);
        setSending(false);
        setIsRecording(false);
        setRecordingSecs(0);
      };
      mr.start(100);
      mediaRecorderRef.current = mr;
      setIsRecording(true);
      setRecordingSecs(0);
      recTimerRef.current = setInterval(() => setRecordingSecs(s => s + 1), 1000);
    } catch {
      alert("دسترسی به میکروفن رد شد. لطفاً اجازه دسترسی بدهید.");
    }
  }

  // ── edit ─────────────────────────────────────────────────────────────────────
  async function handleEditSave() {
    if (!editingPost) return;
    try {
      await fetch(`/api/channel/owner/posts/${editingPost.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: editText }),
      });
      await refetchPosts();
    } catch { /* ignore */ }
    setEditingPost(null);
  }

  // ── delete ───────────────────────────────────────────────────────────────────
  async function handleDelete(id: number) {
    try {
      await fetch(`/api/channel/owner/posts/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      await refetchPosts();
    } catch { /* ignore */ }
    setDeletingId(null);
  }

  // ── pin ──────────────────────────────────────────────────────────────────────
  async function handlePin(id: number, isPinned: boolean) {
    try {
      await fetch(`/api/channel/owner/posts/${id}/pin`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ isPinned }),
      });
      await refetchPosts();
    } catch { /* ignore */ }
  }

  // ── textarea auto-resize ─────────────────────────────────────────────────────
  function handleTextChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setComposerText(e.target.value);
    const el = textareaRef.current;
    if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight, 120)}px`; }
  }

  // ── Channel profile (avatar + name) from settings ──────────────────────────
  // Read from localStorage immediately (no flash on repeat visits)
  const SETTINGS_CACHE = "shivafer_channel_settings";
  function readSettingsCache(): { channel_avatar?: string; channel_name?: string } {
    try { return JSON.parse(localStorage.getItem(SETTINGS_CACHE) ?? "{}"); } catch { return {}; }
  }
  const [channelAvatar, setChannelAvatar] = useState(() => readSettingsCache().channel_avatar ?? DEFAULT_CHANNEL_AVATAR);
  const [channelName, setChannelName] = useState(() => readSettingsCache().channel_name ?? DEFAULT_CHANNEL_NAME);

  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s: Record<string, string | null>) => {
        if (s.channel_avatar) setChannelAvatar(s.channel_avatar);
        if (s.channel_name) setChannelName(s.channel_name);
        try { localStorage.setItem(SETTINGS_CACHE, JSON.stringify({ channel_avatar: s.channel_avatar, channel_name: s.channel_name })); } catch {}
      })
      .catch(() => {});
  }, []);

    const pinnedPost = (posts as any[]).find((p) => p.isPinned);

  return (
    <div className="flex flex-col channel-container" style={{ minHeight: "100dvh", backgroundColor: "var(--channel-page-bg)", backgroundImage: "linear-gradient(var(--channel-bg-overlay), var(--channel-bg-overlay)), url('" + staticAssetUrl.asset(themeResolved === "light" ? "channel-bg-light-v2.webp" : "channel-bg-v6.webp") + "')", backgroundSize: "cover", backgroundPosition: "center top", backgroundAttachment: "local" }} dir="rtl">

      {/* ── Telegram-style channel header ─────────────────────────────────────── */}
      <ChannelHeader memberCount={memberCount} channelAvatar={channelAvatar} channelName={channelName} />

      {/* ── Pinned bar ────────────────────────────────────────────────────────── */}
      {pinnedPost && (
        <div
          className="mx-3 mt-3 mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2.5 cursor-pointer active:opacity-70"
          style={{ background: "rgba(139,92,246,0.1)", border: "1px solid rgba(139,92,246,0.2)" }}
        >
          <div className="w-0.5 h-8 rounded-full bg-violet-500 flex-shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-bold mb-0.5" style={{ color: "#a78bfa" }}>پیام پین‌شده</p>
            <p className="text-xs truncate" style={{ color: "var(--post-meta)" }}>
              {pinnedPost.content?.slice(0, 70) || (pinnedPost.mediaType === "voice" ? "🎙️ پیام صوتی" : "📷 رسانه")}
            </p>
          </div>
          <Pin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "#a78bfa" }} />
        </div>
      )}

      {/* ── Upload progress ──────────────────────────────────────────────────── */}
      {uploadMsg && (
        <div className="mx-3 mt-2 flex items-center gap-2 rounded-xl px-3.5 py-2" style={{ background: "rgba(139,92,246,0.12)" }}>
          <div className="w-3.5 h-3.5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          <p className="text-xs font-medium" style={{ color: "#a78bfa" }}>{uploadMsg}</p>
        </div>
      )}

      {/* ── Posts ────────────────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col justify-end" style={{ paddingTop: "0.75rem", paddingBottom: isOwner ? "calc(5rem + env(safe-area-inset-bottom) + 8px)" : "8px" }}>
        {postsLoading ? (
          /* ── Skeleton placeholders while fetching for the first time ── */
          <div className="flex flex-col gap-3 px-3 pb-2">
            {[110, 72, 90].map((h, i) => (
              <div key={i} className="rounded-2xl overflow-hidden animate-pulse"
                style={{ background: "var(--glass-card-bg)", border: "1px solid var(--glass-card-border)" }}>
                {/* header row */}
                <div className="flex items-center gap-2 px-3.5 pt-3 pb-2">
                  <div className="w-8 h-8 rounded-full" style={{ background: "rgba(139,92,246,0.18)" }} />
                  <div className="h-3 rounded-full w-24" style={{ background: "rgba(139,92,246,0.15)" }} />
                </div>
                {/* body lines */}
                <div className="px-3.5 pb-3 space-y-2">
                  <div className="h-3 rounded-full" style={{ width: "90%", background: "rgba(139,92,246,0.12)" }} />
                  {h > 80 && <div className="h-3 rounded-full" style={{ width: "70%", background: "rgba(139,92,246,0.10)" }} />}
                  {h > 95 && <div className="h-3 rounded-full" style={{ width: "55%", background: "rgba(139,92,246,0.08)" }} />}
                </div>
                {/* footer */}
                <div className="flex items-center gap-3 px-3.5 pb-3">
                  <div className="h-2.5 rounded-full w-14" style={{ background: "rgba(139,92,246,0.10)" }} />
                  <div className="h-2.5 rounded-full w-10" style={{ background: "rgba(139,92,246,0.08)" }} />
                </div>
              </div>
            ))}
          </div>
        ) : (posts as any[]).length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 gap-3">
            <div className="w-16 h-16 rounded-full flex items-center justify-center" style={{ background: "rgba(139,92,246,0.12)" }}>
              <Megaphone className="w-8 h-8" style={{ color: "rgba(139,92,246,0.5)" }} />
            </div>
            <p className="text-sm" style={{ color: "var(--post-meta)" }}>هنوز پستی منتشر نشده</p>
            {isOwner && (
              <p className="text-xs" style={{ color: "rgba(139,92,246,0.6)" }}>اولین پست رو از پایین بفرست 👇</p>
            )}
          </div>
        ) : (
          (posts as any[]).map((p: any) => (
            <PostCard
              key={p.id}
              post={p}
              isOwner={isOwner}
              onEdit={(post) => { setEditingPost(post); setEditText(post.content ?? ""); }}
              onDelete={(id) => setDeletingId(id)}
              onPin={handlePin}
              memberCount={memberCount}
              tick={tick}
              channelName={channelName}
            />
          ))
        )}
        <div ref={postsEndRef} />
      </div>

      {/* ── Owner Composer ───────────────────────────────────────────────────── */}
      {isOwner && (
        <div
          className="fixed left-1/2 -translate-x-1/2 w-full max-w-[430px] z-40"
          style={{
            bottom: "calc(5rem + env(safe-area-inset-bottom))",
            background: "var(--channel-composer-bg)",
            backdropFilter: "blur(16px)",
            borderTop: "1px solid var(--channel-composer-border)",
          }}
        >
          {/* Attach menu */}
          {attachOpen && (
            <div className="flex items-center gap-2 px-4 py-3" style={{ borderBottom: "1px solid var(--channel-attach-border)" }}>
              <button
                onClick={() => imageInputRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}
              >
                <ImageIcon className="w-4 h-4" />
                تصویر
              </button>
              <button
                onClick={() => videoInputRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}
              >
                <Video className="w-4 h-4" />
                ویدیو
              </button>
              <button
                onClick={() => circleVideoInputRef.current?.click()}
                className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold active:scale-95 transition-transform"
                style={{ background: "rgba(139,92,246,0.15)", color: "#c4b5fd" }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
                </svg>
                ویدیو گرد
              </button>
            </div>
          )}

          {/* Recording indicator */}
          {isRecording && (
            <div className="flex items-center justify-between px-4 py-2.5" style={{ borderBottom: "1px solid rgba(239,68,68,0.15)" }}>
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                <span className="text-sm font-bold" style={{ color: "#ef4444" }}>در حال ضبط</span>
                <span className="text-sm tabular-nums text-muted-foreground">
                  {Math.floor(recordingSecs / 60)}:{(recordingSecs % 60).toString().padStart(2, "0")}
                </span>
              </div>
              <button
                onClick={toggleRecording}
                className="w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition-transform"
                style={{ background: "#dc2626" }}
              >
                <MicOff className="w-4 h-4 text-white" />
              </button>
            </div>
          )}

          {/* Input row */}
          {!isRecording && (
            <div className="flex items-end gap-2 px-3 py-2.5">
              <button
                onClick={() => setAttachOpen(o => !o)}
                className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-all"
                style={{
                  background: attachOpen ? "rgba(139,92,246,0.3)" : "var(--glass-toggle-bg)",
                  color: "#a78bfa",
                }}
              >
                {attachOpen ? <X className="w-4 h-4" /> : <Paperclip className="w-4 h-4" />}
              </button>

              <textarea
                ref={textareaRef}
                value={composerText}
                onChange={handleTextChange}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    handleSendText();
                  }
                }}
                placeholder="پیام بنویس..."
                rows={1}
                dir="rtl"
                className="flex-1 rounded-2xl px-3.5 py-2 text-sm outline-none resize-none"
                style={{
                  color: "var(--channel-textarea-text)",
                  background: "var(--channel-textarea-bg)",
                  border: "1px solid var(--channel-textarea-border)",
                  caretColor: "#a78bfa",
                  lineHeight: "1.55",
                  maxHeight: 120,
                  overflowY: "auto",
                  fontSize: "16px",
                }}
              />

              {composerText.trim() ? (
                <button
                  onClick={handleSendText}
                  disabled={sending}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-all"
                  style={{
                    background: sending ? "rgba(124,58,237,0.4)" : "linear-gradient(135deg, #7c3aed, #4f46e5)",
                  }}
                >
                  <Send className="w-4 h-4 text-white" />
                </button>
              ) : (
                <button
                  onClick={toggleRecording}
                  className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 active:scale-90 transition-all"
                  style={{ background: "rgba(139,92,246,0.18)", color: "#a78bfa" }}
                >
                  <Mic className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Hidden file inputs */}
      <input ref={imageInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageChange} />
      <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleVideoChange(e, false)} />
      <input ref={circleVideoInputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleVideoChange(e, true)} />

      {/* ── Edit Modal ───────────────────────────────────────────────────────── */}
      {editingPost && (
        <div
          className="fixed inset-0 z-50 flex items-end"
          style={{ background: "var(--glass-overlay-bg)" }}
          onClick={() => setEditingPost(null)}
        >
          <div
            className="w-full rounded-t-2xl p-4 pb-10 flex flex-col gap-3"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-foreground">ویرایش پست</h3>
              <button onClick={() => setEditingPost(null)} className="text-muted-foreground"><X className="w-4 h-4" /></button>
            </div>
            <textarea
              value={editText}
              onChange={(e) => setEditText(e.target.value)}
              rows={5}
              dir="rtl"
              autoFocus
              className="w-full rounded-xl px-3 py-2.5 text-sm text-foreground outline-none resize-none"
              style={{ background: "var(--channel-textarea-bg)", border: "1px solid var(--channel-textarea-border)", caretColor: "#a78bfa" }}
            />
            <div className="flex gap-2">
              <button
                onClick={handleEditSave}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform"
                style={{ background: "linear-gradient(135deg, #7c3aed, #4f46e5)" }}
              >
                ذخیره تغییرات
              </button>
              <button
                onClick={() => setEditingPost(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform text-muted-foreground bg-secondary"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirm ───────────────────────────────────────────────────── */}
      {deletingId !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center px-6"
          style={{ background: "var(--glass-overlay-bg)" }}
          onClick={() => setDeletingId(null)}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5 flex flex-col gap-4"
            style={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-bold text-foreground text-center">حذف پست</h3>
            <p className="text-sm text-center text-muted-foreground">
              مطمئنی که می‌خوای این پست رو حذف کنی؟
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => handleDelete(deletingId!)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold text-white active:scale-95 transition-transform"
                style={{ background: "#dc2626" }}
              >
                حذف
              </button>
              <button
                onClick={() => setDeletingId(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold active:scale-95 transition-transform text-muted-foreground bg-secondary"
              >
                انصراف
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
