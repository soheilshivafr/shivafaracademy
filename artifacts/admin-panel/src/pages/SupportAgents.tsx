import { useEffect, useState } from "react";
import { get, post, put, del, uploadFile } from "@/lib/api";
import { Plus, Pencil, Trash2, UserRound, Upload, ToggleLeft, ToggleRight } from "lucide-react";

interface Agent {
  id: number;
  name: string;
  avatarUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-card rounded-xl border border-border w-full max-w-md my-8 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function AgentForm({
  initial,
  onSave,
  onClose,
}: {
  initial?: Partial<Agent>;
  onSave: (data: { name: string; avatarUrl: string | null; isActive: boolean }) => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initial?.avatarUrl ?? null);
  const [isActive, setIsActive] = useState(initial?.isActive !== false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleUpload(file: File) {
    setUploading(true);
    try {
      const { url } = await uploadFile("/upload/file", file);
      setAvatarUrl(url);
    } catch (e: any) {
      alert(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ name: name.trim(), avatarUrl, isActive });
      onClose();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="flex flex-col items-center gap-3">
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center overflow-hidden border-2 border-dashed border-border cursor-pointer relative group"
          onClick={() => document.getElementById("agent-avatar-upload")?.click()}
        >
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <UserRound size={32} className="text-muted-foreground" />
          )}
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-full">
            <Upload size={18} className="text-white" />
          </div>
          {uploading && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center rounded-full">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
        <input
          id="agent-avatar-upload"
          type="file"
          accept="image/*"
          className="hidden"
          onChange={e => { if (e.target.files?.[0]) handleUpload(e.target.files[0]); }}
        />
        <p className="text-xs text-muted-foreground">برای آپلود عکس کلیک کنید</p>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">نام پشتیبان</label>
        <input
          className="input w-full"
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder="مثلاً: سارا رضایی"
          required
        />
      </div>

      <div className="flex items-center gap-3">
        <span className="text-sm font-medium">وضعیت فعال</span>
        <button type="button" onClick={() => setIsActive(!isActive)}>
          {isActive
            ? <ToggleRight size={28} className="text-primary" />
            : <ToggleLeft size={28} className="text-muted-foreground" />}
        </button>
        <span className="text-sm text-muted-foreground">{isActive ? "فعال — در چت نمایش داده می‌شود" : "غیرفعال"}</span>
      </div>

      <div className="flex gap-2 pt-2">
        <button type="submit" disabled={busy || !name.trim()} className="btn-primary flex-1">
          {busy ? "در حال ذخیره..." : "ذخیره"}
        </button>
        <button type="button" onClick={onClose} className="btn-secondary flex-1">انصراف</button>
      </div>
    </form>
  );
}

export default function SupportAgents() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<null | "create" | Agent>(null);

  async function load() {
    try {
      const data = await get<Agent[]>("/admin/support-agents");
      setAgents(data);
    } catch { /* ignore */ } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleCreate(data: { name: string; avatarUrl: string | null; isActive: boolean }) {
    await post("/admin/support-agents", data);
    load();
  }

  async function handleUpdate(id: number, data: { name: string; avatarUrl: string | null; isActive: boolean }) {
    await put(`/admin/support-agents/${id}`, data);
    load();
  }

  async function handleDelete(id: number) {
    if (!confirm("پشتیبان حذف شود؟")) return;
    await del(`/admin/support-agents/${id}`);
    load();
  }

  async function toggleActive(agent: Agent) {
    await put(`/admin/support-agents/${agent.id}`, { isActive: !agent.isActive });
    load();
  }

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">پشتیبان‌های فرضی</h1>
          <p className="text-sm text-muted-foreground mt-0.5">هر بار که کاربر چت را باز می‌کند، یک پشتیبان رندوم انتخاب می‌شود</p>
        </div>
        <button onClick={() => setModal("create")} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> پشتیبان جدید
        </button>
      </div>

      {agents.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <UserRound size={40} className="mx-auto mb-3 opacity-30" />
          <p>هنوز پشتیبانی اضافه نشده</p>
          <p className="text-xs mt-1">اگر پشتیبانی وجود نداشته باشد، نام «پشتیبانی شیوافر» به صورت پیش‌فرض نمایش داده می‌شود</p>
        </div>
      )}

      <div className="grid gap-3">
        {agents.map(agent => (
          <div key={agent.id} className="flex items-center gap-3 p-4 rounded-xl border border-border bg-card">
            <div className="relative shrink-0">
              {agent.avatarUrl ? (
                <img src={agent.avatarUrl} alt={agent.name} className="w-12 h-12 rounded-full object-cover" />
              ) : (
                <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold text-lg">
                  {agent.name.slice(0, 1)}
                </div>
              )}
              <span
                className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-card ${agent.isActive ? "bg-green-500" : "bg-gray-400"}`}
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="font-semibold truncate">{agent.name}</p>
              <p className="text-xs text-muted-foreground">{agent.isActive ? "فعال" : "غیرفعال"}</p>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => toggleActive(agent)}
                className="p-2 rounded-lg hover:bg-muted transition-colors"
                title={agent.isActive ? "غیرفعال کن" : "فعال کن"}
              >
                {agent.isActive
                  ? <ToggleRight size={20} className="text-primary" />
                  : <ToggleLeft size={20} className="text-muted-foreground" />}
              </button>
              <button
                onClick={() => setModal(agent)}
                className="p-2 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
              >
                <Pencil size={16} />
              </button>
              <button
                onClick={() => handleDelete(agent.id)}
                className="p-2 rounded-lg hover:bg-destructive/10 transition-colors text-muted-foreground hover:text-destructive"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>

      {modal === "create" && (
        <Modal title="پشتیبان جدید" onClose={() => setModal(null)}>
          <AgentForm onSave={handleCreate} onClose={() => setModal(null)} />
        </Modal>
      )}

      {modal && modal !== "create" && (
        <Modal title="ویرایش پشتیبان" onClose={() => setModal(null)}>
          <AgentForm
            initial={modal as Agent}
            onSave={(data) => handleUpdate((modal as Agent).id, data)}
            onClose={() => setModal(null)}
          />
        </Modal>
      )}
    </div>
  );
}
