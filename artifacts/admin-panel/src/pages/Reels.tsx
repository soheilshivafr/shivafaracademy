import { useEffect, useState, useRef } from "react";
import { get, post, put, del } from "@/lib/api";
import { Plus, Pencil, Trash2, GripVertical } from "lucide-react";

const BASE = "/api";
function getToken() { return localStorage.getItem("shivafer_admin_token") ?? ""; }

const CHUNK_SIZE = 5 * 1024 * 1024; // 5 MB

async function uploadVideoChunked(
  file: File,
  onProgress: (pct: number) => void,
): Promise<string> {
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  const uploadId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const ext = file.name.includes(".") ? `.${file.name.split(".").pop()}` : ".mp4";

  for (let i = 0; i < totalChunks; i++) {
    const blob = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const form = new FormData();
    form.append("chunk", blob, `chunk-${i}`);
    const res = await fetch(
      `${BASE}/upload/chunk?uploadId=${uploadId}&chunkIndex=${i}`,
      { method: "POST", headers: { Authorization: `Bearer ${getToken()}` }, body: form },
    );
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      throw new Error((d as any).error ?? `خطا در تکه ${i + 1}`);
    }
    onProgress(Math.round(((i + 1) / totalChunks) * 95));
  }

  const res = await fetch(`${BASE}/upload/chunk/finalize`, {
    method: "POST",
    headers: { Authorization: `Bearer ${getToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({ uploadId, totalChunks, ext }),
  });
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw new Error((d as any).error ?? "خطا در نهایی‌سازی");
  }
  onProgress(100);
  const data = await res.json();
  return data.url as string;
}

interface Reel { id: number; title?: string | null; videoUrl: string; order: number; createdAt: string; }

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-md shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function ReelForm({ init, nextOrder, onSave, onCancel }: {
  init?: Partial<Reel>;
  nextOrder: number;
  onSave: (d: any) => Promise<void>;
  onCancel: () => void;
}) {
  const [d, setD] = useState({
    title: init?.title ?? "",
    videoUrl: init?.videoUrl ?? "",
    order: init?.order ?? nextOrder,
  });
  const [saving, setSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function pickVideo(f: File) {
    setUploadProgress(0);
    try {
      const url = await uploadVideoChunked(f, setUploadProgress);
      setD(p => ({ ...p, videoUrl: url }));
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploadProgress(null);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!d.videoUrl.trim()) { alert("لینک یا آپلود ویدیو الزامی است"); return; }
    setSaving(true);
    try { await onSave({ title: d.title || null, videoUrl: d.videoUrl, order: Number(d.order) }); }
    catch (e: any) { alert(e.message); setSaving(false); }
  }

  const uploading = uploadProgress !== null;

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <label className="label">عنوان (اختیاری)</label>
        <input className="input" value={d.title} onChange={e => setD(p => ({ ...p, title: e.target.value }))} />
      </div>
      <div>
        <label className="label">ویدیو *</label>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-xs"
            placeholder="آدرس ویدیو"
            value={d.videoUrl}
            onChange={e => setD(p => ({ ...p, videoUrl: e.target.value }))}
            disabled={uploading}
          />
          <label className={`btn-secondary cursor-pointer flex items-center gap-1 text-sm px-3 whitespace-nowrap ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
            {uploading ? `${uploadProgress}%` : "آپلود از گالری"}
            <input
              ref={fileRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={e => e.target.files?.[0] && pickVideo(e.target.files[0])}
            />
          </label>
        </div>
        {uploading && (
          <div className="mt-2 h-2 bg-muted rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        )}
        {d.videoUrl && !uploading && (
          <p className="text-xs text-green-500 mt-1 truncate">✓ {d.videoUrl}</p>
        )}
      </div>
      <div>
        <label className="label">ترتیب نمایش</label>
        <input type="number" className="input" value={d.order} onChange={e => setD(p => ({ ...p, order: Number(e.target.value) }))} />
      </div>
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={onCancel} className="btn-secondary" disabled={uploading}>انصراف</button>
        <button type="submit" disabled={saving || uploading} className="btn-primary">
          {saving ? "در حال ذخیره..." : uploading ? "در حال آپلود..." : "ذخیره"}
        </button>
      </div>
    </form>
  );
}

export default function Reels() {
  const [reels, setReels] = useState<Reel[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | { reel: Reel } | null>(null);

  async function load() {
    const data = await get<Reel[]>("/admin/reels");
    setReels(data.sort((a, b) => a.order - b.order));
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  const nextOrder = reels.length > 0 ? Math.max(...reels.map(r => r.order)) + 1 : 1;

  async function create(data: any) { await post("/admin/reels", data); await load(); setModal(null); }
  async function update(id: number, data: any) { await put(`/admin/reels/${id}`, data); await load(); setModal(null); }
  async function remove(id: number) { if (!confirm("حذف این ریل؟")) return; await del(`/admin/reels/${id}`); await load(); }

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">ریلز</h1>
        <button onClick={() => setModal("create")} className="btn-primary flex items-center gap-2"><Plus size={16} /> ریل جدید</button>
      </div>

      {reels.length === 0 && <p className="text-muted-foreground text-center py-10">هیچ ریلی یافت نشد</p>}

      <div className="space-y-2">
        {reels.map(r => (
          <div key={r.id} className="bg-card rounded-xl border border-border flex items-center gap-3 p-3">
            <GripVertical size={16} className="text-muted-foreground/40 shrink-0" />
            <div className="w-8 h-8 rounded bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground">{r.order}</div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{r.title || "بدون عنوان"}</p>
              <p className="text-xs text-muted-foreground truncate">{r.videoUrl}</p>
            </div>
            <div className="flex gap-1 shrink-0">
              <button onClick={() => setModal({ reel: r })} className="p-2 text-muted-foreground hover:text-foreground rounded hover:bg-muted"><Pencil size={14} /></button>
              <button onClick={() => remove(r.id)} className="p-2 text-muted-foreground hover:text-destructive rounded hover:bg-muted"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {modal === "create" && (
        <Modal title="ریل جدید" onClose={() => setModal(null)}>
          <ReelForm nextOrder={nextOrder} onSave={create} onCancel={() => setModal(null)} />
        </Modal>
      )}
      {modal && modal !== "create" && (
        <Modal title="ویرایش ریل" onClose={() => setModal(null)}>
          <ReelForm init={modal.reel} nextOrder={nextOrder} onSave={d => update(modal.reel.id, d)} onCancel={() => setModal(null)} />
        </Modal>
      )}
    </div>
  );
}
