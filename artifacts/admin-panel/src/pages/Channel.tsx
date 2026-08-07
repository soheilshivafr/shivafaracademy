import { useEffect, useState, useRef } from "react";
import { get, post, put, del } from "@/lib/api";
import { Plus, Pencil, Trash2, Pin, PinOff, Image, Video, Upload, Check } from "lucide-react";

function getToken() { return localStorage.getItem("shivafer_admin_token") ?? ""; }
const BASE = "/api";

interface ChannelPost {
  id: number;
  content: string;
  mediaUrl: string | null;
  mediaType: string | null;
  isPinned: boolean;
  viewCount: number;
  createdAt: string;
}

async function uploadImage(file: File): Promise<string> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${BASE}/upload/image`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}` },
    body: form,
  });
  if (!res.ok) throw new Error("خطا در آپلود تصویر");
  const data = await res.json();
  return data.url as string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b">
          <h2 className="text-lg font-bold">{title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ─── Channel Profile Settings Section ────────────────────────────────────────
function ChannelProfileCard() {
  const [avatar, setAvatar] = useState<string | null>(null);
  const [name, setName] = useState("سهیل شیوافر");
  const [nameInput, setNameInput] = useState("سهیل شیوافر");
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [nameSaving, setNameSaving] = useState(false);
  const [msg, setMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);
  const avatarRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`${BASE}/admin/channel/settings`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    })
      .then(r => r.json())
      .then((d: { channel_avatar: string | null; channel_name: string | null }) => {
        if (d.channel_avatar) setAvatar(d.channel_avatar);
        if (d.channel_name) { setName(d.channel_name); setNameInput(d.channel_name); }
      })
      .catch(() => {});
  }, []);

  function flash(type: "ok" | "err", text: string) {
    setMsg({ type, text });
    setTimeout(() => setMsg(null), 4000);
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const uploadRes = await fetch(`${BASE}/upload/admin-channel-avatar`, {
        method: "POST",
        headers: { Authorization: `Bearer ${getToken()}` },
        body: fd,
      });
      if (!uploadRes.ok) throw new Error("آپلود ناموفق بود");
      const { url } = await uploadRes.json() as { url: string };
      const saveRes = await fetch(`${BASE}/admin/channel/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ channel_avatar: url }),
      });
      if (!saveRes.ok) throw new Error("ذخیره ناموفق بود");
      setAvatar(url);
      flash("ok", "عکس کانال با موفقیت تغییر کرد ✅");
    } catch (err: any) {
      flash("err", err.message ?? "خطا در آپلود");
    }
    setAvatarUploading(false);
  }

  async function handleSaveName() {
    if (!nameInput.trim() || nameInput.trim() === name) return;
    setNameSaving(true);
    try {
      const res = await fetch(`${BASE}/admin/channel/settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ channel_name: nameInput.trim() }),
      });
      if (!res.ok) throw new Error("ذخیره ناموفق بود");
      setName(nameInput.trim());
      flash("ok", "نام کانال ذخیره شد ✅");
    } catch (err: any) {
      flash("err", err.message ?? "خطا");
    }
    setNameSaving(false);
  }

  return (
    <div className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm mb-6">
      <h2 className="text-base font-bold text-gray-700 mb-4">🖼️ پروفایل کانال</h2>

      {msg && (
        <div className={`mb-4 px-4 py-2.5 rounded-xl text-sm font-medium ${
          msg.type === "ok"
            ? "bg-green-50 text-green-700 border border-green-200"
            : "bg-red-50 text-red-700 border border-red-200"
        }`}>
          {msg.text}
        </div>
      )}

      <div className="flex flex-col sm:flex-row gap-6 items-start">
        {/* آواتار */}
        <div className="flex flex-col items-center gap-3">
          <div className="relative">
            <img
              src={avatar ?? "/icon-192.png"}
              alt="آواتار کانال"
              className="w-20 h-20 rounded-full object-cover border-2 border-gray-200 shadow"
              onError={e => { (e.target as HTMLImageElement).src = "/icon-192.png"; }}
            />
            {avatarUploading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-full">
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
          <button
            onClick={() => avatarRef.current?.click()}
            disabled={avatarUploading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Upload className="w-3 h-3" />
            {avatarUploading ? "در حال آپلود..." : "تغییر عکس"}
          </button>
          <input ref={avatarRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
        </div>

        {/* نام کانال */}
        <div className="flex-1 w-full">
          <label className="block text-sm font-bold text-gray-600 mb-1.5">نام کانال</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSaveName()}
              placeholder="نام کانال..."
              className="flex-1 border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 text-right"
            />
            <button
              onClick={handleSaveName}
              disabled={nameSaving || !nameInput.trim() || nameInput.trim() === name}
              className="flex items-center gap-1 px-3 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 text-white text-sm font-bold rounded-xl transition-colors"
            >
              <Check className="w-4 h-4" />
              {nameSaving ? "..." : "ذخیره"}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-1">نام فعلی: <span className="font-semibold text-gray-600">{name}</span></p>
        </div>
      </div>
    </div>
  );
}

export default function Channel() {
  const [posts, setPosts] = useState<ChannelPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<ChannelPost | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingMedia, setUploadingMedia] = useState(false);

  const [form, setForm] = useState({ content: "", mediaUrl: "", mediaType: "", isPinned: false });
  const imageRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    const data = await get<ChannelPost[]>("/admin/channel/posts");
    setPosts(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  function openNew() {
    setEditing(null);
    setForm({ content: "", mediaUrl: "", mediaType: "", isPinned: false });
    setShowForm(true);
  }

  function openEdit(p: ChannelPost) {
    setEditing(p);
    setForm({ content: p.content, mediaUrl: p.mediaUrl ?? "", mediaType: p.mediaType ?? "", isPinned: p.isPinned });
    setShowForm(true);
  }

  async function handleImageUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingMedia(true);
    try {
      const url = await uploadImage(file);
      setForm(f => ({ ...f, mediaUrl: url, mediaType: "image" }));
    } catch (err: any) {
      alert(err.message);
    } finally {
      setUploadingMedia(false);
    }
  }

  async function handleSave() {
    if (!form.content.trim()) return alert("متن پست الزامی است");
    setSaving(true);
    try {
      const payload = {
        content: form.content,
        mediaUrl: form.mediaUrl || null,
        mediaType: form.mediaType || null,
        isPinned: form.isPinned,
      };
      if (editing) {
        await put(`/admin/channel/posts/${editing.id}`, payload);
      } else {
        await post("/admin/channel/posts", payload);
      }
      setShowForm(false);
      await load();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: number) {
    if (!confirm("حذف شود؟")) return;
    await del(`/admin/channel/posts/${id}`);
    await load();
  }

  async function handlePin(p: ChannelPost) {
    await fetch(`${BASE}/admin/channel/posts/${p.id}/pin`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
      body: JSON.stringify({ isPinned: !p.isPinned }),
    });
    await load();
  }

  function formatDate(s: string) {
    return new Date(s).toLocaleDateString("fa-IR", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  return (
    <div className="p-6" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">مدیریت کانال</h1>
        <button onClick={openNew} className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-4 py-2 rounded-xl font-bold transition-colors">
          <Plus className="w-4 h-4" />
          پست جدید
        </button>
      </div>

      {/* ── پروفایل کانال ────────────────────────────────────────────── */}
      <ChannelProfileCard />

      {/* ── لیست پست‌ها ─────────────────────────────────────────────── */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 rounded-full border-4 border-violet-500 border-t-transparent animate-spin" />
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center text-gray-400 py-16">هیچ پستی وجود ندارد</div>
      ) : (
        <div className="space-y-4">
          {posts.map(p => (
            <div key={p.id} className="bg-white border border-gray-100 rounded-2xl p-5 shadow-sm">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    {p.isPinned && <span className="flex items-center gap-1 text-xs font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full"><Pin className="w-3 h-3" />پین‌شده</span>}
                    <span className="text-xs text-gray-400">{formatDate(p.createdAt)}</span>
                    <span className="text-xs text-gray-400">• {p.viewCount} بازدید</span>
                  </div>
                  <p className="text-sm text-gray-800 leading-6 whitespace-pre-wrap line-clamp-4">{p.content}</p>
                  {p.mediaUrl && (
                    <div className="mt-3">
                      {p.mediaType === "image" ? (
                        <img src={p.mediaUrl} alt="" className="w-40 h-28 object-cover rounded-xl border" />
                      ) : p.mediaType === "video" ? (
                        <div className="flex items-center gap-2 text-xs text-gray-500">
                          <Video className="w-4 h-4" /> ویدیو پیوست‌شده
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-2 flex-shrink-0">
                  <button onClick={() => handlePin(p)} title={p.isPinned ? "آنپین" : "پین"} className={`p-2 rounded-xl transition-colors ${p.isPinned ? "text-violet-600 bg-violet-50 hover:bg-violet-100" : "text-gray-400 hover:text-violet-600 hover:bg-violet-50"}`}>
                    {p.isPinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                  </button>
                  <button onClick={() => openEdit(p)} className="p-2 rounded-xl text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-2 rounded-xl text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <Modal title={editing ? "ویرایش پست" : "پست جدید"} onClose={() => setShowForm(false)}>
          <div className="space-y-4" dir="rtl">
            <div>
              <label className="block text-sm font-bold mb-1">متن پست *</label>
              <textarea
                rows={6}
                value={form.content}
                onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder="متن پست را بنویسید..."
                className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 resize-none"
              />
            </div>

            <div>
              <label className="block text-sm font-bold mb-1">تصویر / رسانه</label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => imageRef.current?.click()}
                  disabled={uploadingMedia}
                  className="flex items-center gap-2 px-3 py-2 border border-dashed border-gray-300 rounded-xl text-sm text-gray-500 hover:border-violet-400 hover:text-violet-600 transition-colors"
                >
                  <Image className="w-4 h-4" />
                  {uploadingMedia ? "در حال آپلود..." : "آپلود تصویر"}
                </button>
                {form.mediaUrl && (
                  <button
                    type="button"
                    onClick={() => setForm(f => ({ ...f, mediaUrl: "", mediaType: "" }))}
                    className="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-xl transition-colors"
                  >
                    حذف رسانه
                  </button>
                )}
              </div>
              <input ref={imageRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
              {form.mediaUrl && form.mediaType === "image" && (
                <img src={form.mediaUrl} alt="" className="mt-2 w-40 h-28 object-cover rounded-xl border" />
              )}
              {form.mediaUrl && form.mediaType !== "image" && (
                <div className="mt-2 text-xs text-gray-500 flex items-center gap-1">
                  <Video className="w-3 h-3" /> رسانه انتخاب‌شده
                </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isPinned"
                checked={form.isPinned}
                onChange={e => setForm(f => ({ ...f, isPinned: e.target.checked }))}
                className="w-4 h-4 accent-violet-600"
              />
              <label htmlFor="isPinned" className="text-sm font-bold cursor-pointer">پین کردن پست</label>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-300 text-white py-2.5 rounded-xl font-bold transition-colors"
              >
                {saving ? "در حال ذخیره..." : editing ? "ذخیره تغییرات" : "انتشار پست"}
              </button>
              <button onClick={() => setShowForm(false)} className="px-4 py-2.5 border border-gray-200 rounded-xl text-sm hover:bg-gray-50 transition-colors">
                انصراف
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
