import { useEffect, useState } from "react";
import { get, post, del } from "@/lib/api";
import { Plus, Trash2, Copy, Check, User, Phone, Smartphone } from "lucide-react";

interface Course { id: number; title: string; }
interface License {
  id: number; code: string;
  courseId?: number | null; courseIds?: number[] | null;
  courseTitle?: string; courseTitles?: string[];
  usedByUserId?: number | null;
  userPhone?: string | null; userName?: string | null; userDevice?: string | null;
  usedAt?: string | null; createdAt: string;
}

function toPersianDate(iso: string) {
  return new Date(iso).toLocaleDateString("fa-IR", { year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  function copy() {
    navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  }
  return (
    <button onClick={copy} className="p-1.5 text-muted-foreground hover:text-primary rounded transition-colors" title="کپی">
      {copied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
    </button>
  );
}

export default function Licenses() {
  const [licenses, setLicenses] = useState<License[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [generating, setGenerating] = useState(false);
  const [newLicense, setNewLicense] = useState<License | null>(null);

  async function load() {
    const [l, c] = await Promise.all([get<License[]>("/admin/licenses"), get<Course[]>("/admin/courses")]);
    setLicenses(l); setCourses(c); setLoading(false);
  }
  useEffect(() => { load(); }, []);

  function toggleCourse(id: number) {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  }

  async function generate() {
    if (selectedIds.length === 0) return;
    setGenerating(true);
    try {
      const result = await post<License>("/admin/licenses/generate", { courseIds: selectedIds });
      setNewLicense(result);
      setSelectedIds([]);
      setShowCreate(false);
      await load();
    } catch (e: any) { alert(e.message); }
    finally { setGenerating(false); }
  }

  async function remove(id: number) {
    if (!confirm("حذف این لایسنس؟")) return;
    await del(`/admin/licenses/${id}`); await load();
  }

  const used = licenses.filter(l => l.usedByUserId);
  const unused = licenses.filter(l => !l.usedByUserId);

  if (loading) return <div className="flex justify-center py-20"><div className="loader" /></div>;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold">لایسنس‌ها</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{unused.length} فعال · {used.length} استفاده شده</p>
        </div>
        <button onClick={() => { setShowCreate(true); setNewLicense(null); }} className="btn-primary flex items-center gap-2">
          <Plus size={16} /> لایسنس جدید
        </button>
      </div>

      {showCreate && (
        <div className="bg-card rounded-xl border border-primary/30 p-5 space-y-4">
          <h3 className="font-semibold text-sm">انتخاب دوره‌ها برای لایسنس</h3>
          <p className="text-xs text-muted-foreground">می‌توانید چند دوره همزمان انتخاب کنید — یک کد برای همه فعال می‌شود</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {courses.map(c => (
              <label key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                selectedIds.includes(c.id) ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}>
                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition-colors ${
                  selectedIds.includes(c.id) ? "border-primary bg-primary" : "border-muted-foreground/40"
                }`}>
                  {selectedIds.includes(c.id) && <Check size={10} className="text-white" />}
                </div>
                <input type="checkbox" className="hidden" checked={selectedIds.includes(c.id)} onChange={() => toggleCourse(c.id)} />
                <span className="text-sm">{c.title}</span>
              </label>
            ))}
          </div>
          {selectedIds.length > 0 && (
            <div className="text-sm text-primary bg-primary/5 px-3 py-2 rounded-lg">
              {selectedIds.length} دوره انتخاب شده: {selectedIds.map(id => courses.find(c => c.id === id)?.title).join(" + ")}
            </div>
          )}
          <div className="flex gap-2">
            <button onClick={() => { setShowCreate(false); setSelectedIds([]); }} className="btn-secondary">انصراف</button>
            <button onClick={generate} disabled={selectedIds.length === 0 || generating} className="btn-primary">
              {generating ? "در حال ساخت..." : "ساخت لایسنس"}
            </button>
          </div>
        </div>
      )}

      {newLicense && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4">
          <p className="text-green-700 font-medium text-sm mb-2">✓ لایسنس جدید ساخته شد</p>
          <div className="flex items-center gap-2">
            <code className="text-lg font-mono font-bold tracking-widest text-green-800 bg-green-100 px-3 py-1.5 rounded-lg">{newLicense.code}</code>
            <CopyButton text={newLicense.code} />
          </div>
          {newLicense.courseTitles && newLicense.courseTitles.length > 1 && (
            <p className="text-xs text-green-600 mt-1">دوره‌ها: {newLicense.courseTitles.join(" · ")}</p>
          )}
        </div>
      )}

      {licenses.length === 0 && <p className="text-muted-foreground text-center py-10">هیچ لایسنسی وجود ندارد</p>}

      {unused.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">لایسنس‌های فعال ({unused.length})</h3>
          {unused.map(l => (
            <div key={l.id} className="bg-card rounded-xl border border-border p-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <code className="font-mono font-bold tracking-wider text-sm">{l.code}</code>
                  <CopyButton text={l.code} />
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {l.courseTitles && l.courseTitles.length > 1
                    ? l.courseTitles.join(" + ")
                    : l.courseTitle ?? "—"}
                </p>
                <p className="text-xs text-muted-foreground">{toPersianDate(l.createdAt)}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">استفاده نشده</span>
                <button onClick={() => remove(l.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded hover:bg-muted"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {used.length > 0 && (
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground">لایسنس‌های استفاده شده ({used.length})</h3>
          {used.map(l => (
            <div key={l.id} className="bg-card rounded-xl border border-border p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <code className="font-mono font-bold tracking-wider text-sm text-muted-foreground line-through">{l.code}</code>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {l.courseTitles && l.courseTitles.length > 1
                      ? l.courseTitles.join(" + ")
                      : l.courseTitle ?? "—"}
                  </p>
                </div>
                <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full shrink-0">استفاده شده</span>
              </div>

              <div className="mt-3 pt-3 border-t border-border space-y-1.5">
                <h4 className="text-xs font-medium text-muted-foreground mb-2">اطلاعات کاربر</h4>
                {l.userName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User size={13} className="text-muted-foreground shrink-0" />
                    <span>{l.userName}</span>
                  </div>
                )}
                {l.userPhone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={13} className="text-muted-foreground shrink-0" />
                    <span dir="ltr">{l.userPhone}</span>
                  </div>
                )}
                {l.userDevice && (
                  <div className="flex items-center gap-2 text-sm">
                    <Smartphone size={13} className="text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground break-all">{l.userDevice}</span>
                  </div>
                )}
                {l.usedAt && (
                  <p className="text-xs text-muted-foreground">زمان استفاده: {toPersianDate(l.usedAt)}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
