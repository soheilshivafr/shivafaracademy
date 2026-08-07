import { useEffect, useState } from "react";
import { get, post, del } from "@/lib/api";
import { Search, UserX, BookOpen, ShoppingBag, Smartphone, UserPlus, KeyRound } from "lucide-react";

interface User {
  id: number; phone: string; name?: string | null; createdAt: string;
  courseIds?: number[]; productIds?: number[];
  boundDeviceId?: string | null;
}

interface LeadProfile {
  userId: number;
  leadStatus: string;
  leadScore?: number;
  buyerIntentScore?: number;
  favoriteProduct?: string | null;
  vipStatus: boolean;
  ambassadorStatus: boolean;
}

function buyerIntentBadge(score: number): { label: string; color: string } {
  if (score >= 80) return { label: `قصد خرید ${score} 🔥`, color: "bg-red-100 text-red-700" };
  if (score >= 50) return { label: `قصد خرید ${score}`, color: "bg-orange-100 text-orange-700" };
  if (score >= 30) return { label: `قصد خرید ${score}`, color: "bg-yellow-100 text-yellow-700" };
  return { label: `قصد خرید ${score}`, color: "bg-slate-100 text-slate-500" };
}

const LEAD_STATUS_LABELS: Record<string, { label: string; color: string }> = {
  cold:       { label: "سرد",      color: "bg-slate-100 text-slate-600"   },
  warm:       { label: "ولرم",     color: "bg-yellow-100 text-yellow-700" },
  hot:        { label: "داغ 🔥",   color: "bg-orange-100 text-orange-700" },
  customer:   { label: "مشتری",   color: "bg-green-100 text-green-700"   },
  vip:        { label: "VIP ⭐",   color: "bg-purple-100 text-purple-700" },
  ambassador: { label: "سفیر 👑",  color: "bg-amber-100 text-amber-700"   },
};
const STAGE_FILTERS: { key: string; label: string }[] = [
  { key: "all",        label: "همه" },
  { key: "cold",       label: "سرد" },
  { key: "warm",       label: "ولرم" },
  { key: "hot",        label: "داغ 🔥" },
  { key: "customer",   label: "مشتری" },
  { key: "vip",        label: "VIP ⭐" },
  { key: "ambassador", label: "سفیر 👑" },
];
interface Course { id: number; title: string; }
interface Product { id: number; title: string; }

function toPersianDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric" });
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 p-4 overflow-y-auto">
      <div className="bg-card rounded-xl border border-border w-full max-w-lg my-8 shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function UserDetail({ user, courses, products, onRefresh, onClose }: { user: User; courses: Course[]; products: Product[]; onRefresh: () => void; onClose: () => void }) {
  const [grantCourseId, setGrantCourseId] = useState("");
  const [grantProductId, setGrantProductId] = useState("");
  const [busy, setBusy] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  async function changePassword() {
    if (newPassword.length < 6) { setPwMsg({ type: "err", text: "رمز باید حداقل ۶ کاراکتر باشد" }); return; }
    setPwBusy(true); setPwMsg(null);
    try {
      await post(`/admin/users/${user.id}/change-password`, { password: newPassword });
      setNewPassword("");
      setPwMsg({ type: "ok", text: "رمز عبور با موفقیت تغییر کرد ✓" });
    } catch (e: any) {
      setPwMsg({ type: "err", text: e.message });
    } finally { setPwBusy(false); }
  }

  async function grantCourse() {
    if (!grantCourseId) return;
    setBusy(true);
    try { await post(`/admin/users/${user.id}/grant-course/${grantCourseId}`); onRefresh(); setGrantCourseId(""); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }
  async function grantProduct() {
    if (!grantProductId) return;
    setBusy(true);
    try { await post(`/admin/users/${user.id}/grant-product/${grantProductId}`); onRefresh(); setGrantProductId(""); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }
  async function clearDevice() {
    if (!confirm("پاک کردن دستگاه این کاربر؟")) return;
    setBusy(true);
    try { await del(`/admin/users/${user.id}/device`); onRefresh(); }
    catch (e: any) { alert(e.message); } finally { setBusy(false); }
  }

  const ownedCourseIds = new Set(user.courseIds ?? []);
  const ownedProductIds = new Set(user.productIds ?? []);
  const availableCourses = courses.filter(c => !ownedCourseIds.has(c.id));
  const availableProducts = products.filter(p => !ownedProductIds.has(p.id));

  return (
    <div className="space-y-5">
      <div className="space-y-1 text-sm">
        <div className="flex gap-2"><span className="text-muted-foreground w-20">شماره:</span><span className="font-medium">{user.phone}</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-20">نام:</span><span>{user.name ?? "—"}</span></div>
        <div className="flex gap-2"><span className="text-muted-foreground w-20">عضویت:</span><span>{toPersianDate(user.createdAt)}</span></div>
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5"><BookOpen size={14} /> دوره‌های دسترسی‌دار</h4>
        {(user.courseIds ?? []).length === 0
          ? <p className="text-xs text-muted-foreground">هیچ دوره‌ای ندارد</p>
          : <div className="flex flex-wrap gap-1">{(user.courseIds ?? []).map(id => <span key={id} className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">{courses.find(c => c.id === id)?.title ?? `#${id}`}</span>)}</div>
        }
        {availableCourses.length > 0 && (
          <div className="flex gap-2 mt-2">
            <select value={grantCourseId} onChange={e => setGrantCourseId(e.target.value)} className="input flex-1 text-xs">
              <option value="">اعطای دسترسی به دوره...</option>
              {availableCourses.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
            <button onClick={grantCourse} disabled={!grantCourseId || busy} className="btn-primary text-xs px-3">اعطا</button>
          </div>
        )}
      </div>

      <div>
        <h4 className="text-sm font-medium mb-2 flex items-center gap-1.5"><ShoppingBag size={14} /> محصولات دسترسی‌دار</h4>
        {(user.productIds ?? []).length === 0
          ? <p className="text-xs text-muted-foreground">هیچ محصولی ندارد</p>
          : <div className="flex flex-wrap gap-1">{(user.productIds ?? []).map(id => <span key={id} className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded">{products.find(p => p.id === id)?.title ?? `#${id}`}</span>)}</div>
        }
        {availableProducts.length > 0 && (
          <div className="flex gap-2 mt-2">
            <select value={grantProductId} onChange={e => setGrantProductId(e.target.value)} className="input flex-1 text-xs">
              <option value="">اعطای دسترسی به محصول...</option>
              {availableProducts.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
            <button onClick={grantProduct} disabled={!grantProductId || busy} className="btn-primary text-xs px-3">اعطا</button>
          </div>
        )}
      </div>

      <div className="pt-1 border-t border-border space-y-2">
        <h4 className="text-sm font-medium flex items-center gap-1.5"><KeyRound size={14} /> تغییر رمز عبور</h4>
        <div className="flex gap-2">
          <input
            className="input flex-1 text-sm"
            type="text"
            placeholder="رمز عبور جدید (حداقل ۶ کاراکتر)"
            value={newPassword}
            onChange={e => { setNewPassword(e.target.value); setPwMsg(null); }}
          />
          <button
            onClick={changePassword}
            disabled={pwBusy || newPassword.length === 0}
            className="btn-primary text-xs px-3 shrink-0"
          >
            {pwBusy ? "..." : "ذخیره"}
          </button>
        </div>
        {pwMsg && (
          <p className={`text-xs ${pwMsg.type === "ok" ? "text-green-600" : "text-destructive"}`}>{pwMsg.text}</p>
        )}
      </div>

      <div className="pt-1 border-t border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Smartphone size={13} className={user.boundDeviceId ? "text-green-600" : "text-muted-foreground"} />
            {user.boundDeviceId
              ? <span className="text-green-700">دستگاه bind شده: <span className="font-mono text-[10px] opacity-70">{user.boundDeviceId.slice(0, 8)}…</span></span>
              : <span className="text-muted-foreground">هنوز هیچ دستگاهی bind نشده</span>
            }
          </div>
          {user.boundDeviceId && (
            <button onClick={clearDevice} disabled={busy} className="text-xs text-destructive hover:bg-destructive/10 px-2 py-1 rounded transition-colors">
              آزادسازی دستگاه
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateUserForm({ onCreated, onClose }: { onCreated: () => void; onClose: () => void }) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setError("");
    if (!/^09\d{9}$/.test(phone.trim())) { setError("شماره موبایل نامعتبر است (مثال: 09123456789)"); return; }
    if (password.length < 6) { setError("رمز عبور باید حداقل ۶ کاراکتر باشد"); return; }
    setBusy(true);
    try {
      await post("/admin/users", { phone: phone.trim(), password, name: name.trim() || null });
      onCreated();
      onClose();
    } catch (e: any) { setError(e.message); } finally { setBusy(false); }
  }

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm font-medium block mb-1">شماره موبایل *</label>
        <input className="input w-full text-sm" inputMode="numeric" placeholder="09123456789" value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">رمز عبور *</label>
        <input className="input w-full text-sm" type="text" placeholder="حداقل ۶ کاراکتر" value={password} onChange={e => setPassword(e.target.value)} />
      </div>
      <div>
        <label className="text-sm font-medium block mb-1">نام (اختیاری)</label>
        <input className="input w-full text-sm" placeholder="نام کاربر" value={name} onChange={e => setName(e.target.value)} />
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex gap-2 justify-end pt-1">
        <button onClick={onClose} className="text-sm px-4 py-2 rounded-lg bg-muted text-muted-foreground">انصراف</button>
        <button onClick={submit} disabled={busy} className="btn-primary text-sm px-4 py-2">{busy ? "در حال ساخت..." : "ساخت حساب"}</button>
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState<User[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [leadProfiles, setLeadProfiles] = useState<LeadProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<string>(() => new URLSearchParams(window.location.search).get("stage") ?? "all");
  const [selected, setSelected] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const [u, c, p, lp] = await Promise.all([
      get<User[]>("/admin/users"),
      get<Course[]>("/admin/courses"),
      get<Product[]>("/admin/products"),
      get<LeadProfile[]>("/admin/leads").catch(() => [] as LeadProfile[]),
    ]);
    setUsers(u); setCourses(c); setProducts(p);
    setLeadProfiles(lp); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function remove(id: number) {
    if (!confirm("حذف این کاربر؟ تمام داده‌ها از بین می‌رود.")) return;
    await del(`/admin/users/${id}`); await load();
  }

  const leadProfileMap = new Map(leadProfiles.map(lp => [lp.userId, lp]));

  const filtered = users.filter(u => {
    const matchesSearch = u.phone.includes(search) || (u.name ?? "").includes(search);
    if (!matchesSearch) return false;
    if (stageFilter === "all") return true;
    return leadProfileMap.get(u.id)?.leadStatus === stageFilter;
  });

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-bold shrink-0">کاربران <span className="text-muted-foreground text-base font-normal">({users.length})</span></h1>
        <div className="flex items-center gap-2 flex-1 justify-end">
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input className="input pr-8 text-sm" placeholder="جستجو..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <button onClick={() => setCreating(true)} className="btn-primary text-sm px-3 py-2 flex items-center gap-1.5 shrink-0">
            <UserPlus size={15} /> کاربر جدید
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap">
        {STAGE_FILTERS.map(f => {
          const cnt = f.key === "all" ? users.length : leadProfiles.filter(lp => lp.leadStatus === f.key).length;
          const active = stageFilter === f.key;
          return (
            <button
              key={f.key}
              onClick={() => setStageFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"}`}
            >
              {f.label} <span className="opacity-70">{cnt.toLocaleString("fa-IR")}</span>
            </button>
          );
        })}
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="divide-y divide-border">
          {filtered.length === 0 && <p className="text-muted-foreground text-sm p-6 text-center">کاربری یافت نشد</p>}
          {filtered.map(u => {
            const lp = leadProfileMap.get(u.id);
            const statusInfo = lp ? (LEAD_STATUS_LABELS[lp.leadStatus] ?? LEAD_STATUS_LABELS.cold) : null;
            return (
            <div key={u.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
              <div className="cursor-pointer flex-1 min-w-0" onClick={() => setSelected(u)}>
                <p className="text-sm font-medium">{u.name ?? "بدون نام"}</p>
                <p className="text-xs text-muted-foreground">{u.phone} · {toPersianDate(u.createdAt)}</p>
                <div className="flex gap-1 mt-1 flex-wrap">
                  {statusInfo && (
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${statusInfo.color}`}>{statusInfo.label}</span>
                  )}
                  {lp && typeof lp.buyerIntentScore === "number" && lp.buyerIntentScore > 0 && (() => {
                    const b = buyerIntentBadge(lp.buyerIntentScore!);
                    return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${b.color}`}>{b.label}</span>;
                  })()}
                  {(u.courseIds ?? []).length > 0 && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">{u.courseIds!.length} دوره</span>}
                  {(u.productIds ?? []).length > 0 && <span className="text-xs bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded">{u.productIds!.length} محصول</span>}
                  {u.boundDeviceId
                    ? <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded flex items-center gap-0.5"><Smartphone size={10} /> دستگاه فعال</span>
                    : <span className="text-xs bg-muted text-muted-foreground px-1.5 py-0.5 rounded flex items-center gap-0.5"><Smartphone size={10} /> بدون دستگاه</span>
                  }
                </div>
              </div>
              <button onClick={() => remove(u.id)} className="p-2 text-muted-foreground hover:text-destructive rounded hover:bg-muted shrink-0"><UserX size={15} /></button>
            </div>
            );
          })}
        </div>
      </div>

      {selected && (
        <Modal title={`${selected.name ?? selected.phone}`} onClose={() => setSelected(null)}>
          <UserDetail user={selected} courses={courses} products={products}
            onRefresh={async () => { await load(); setSelected(users.find(u => u.id === selected.id) ?? null); }}
            onClose={() => setSelected(null)}
          />
        </Modal>
      )}

      {creating && (
        <Modal title="ساخت کاربر جدید" onClose={() => setCreating(false)}>
          <CreateUserForm onCreated={load} onClose={() => setCreating(false)} />
        </Modal>
      )}
    </div>
  );
}
