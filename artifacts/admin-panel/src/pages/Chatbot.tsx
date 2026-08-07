import { useEffect, useState } from "react";
import { get, post, put, del } from "@/lib/api";
import { Plus, Pencil, Trash2, Bot, Save, MessageSquare, ChevronDown, ChevronUp, User, BookOpen, Download } from "lucide-react";

interface Knowledge {
  id: number; category: string; question: string;
  answer: string; courseId?: string | null; createdAt: string;
}

const KNOWLEDGE_CATEGORIES = [
  { value: "courses", label: "📚 دوره‌ها و محصولات" },
  { value: "about_site", label: "🏫 معرفی آکادمی" },
  { value: "faqs", label: "❓ سوالات متداول" },
  { value: "objections", label: "💬 پاسخ به اعتراضات" },
  { value: "persona", label: "🎭 شخصیت سارا" },
  { value: "about_soheil", label: "👤 معرفی سهیل شیوافر" },
  { value: "techniques", label: "🎯 تکنیک‌های فروش و مذاکره" },
  { value: "success_stories", label: "⭐ داستان‌های موفقیت" },
  { value: "communication_style", label: "💭 سبک صحبت" },
];

const CATEGORY_DISPLAY: Record<string, string> = Object.fromEntries(
  KNOWLEDGE_CATEGORIES.map(c => [c.value, c.label])
);

interface Course {
  id: number; title: string;
}

interface ChatLog {
  id: number; userId: number; userName: string | null; userPhone: string | null;
  role: string; content: string; sessionId: string | null; createdAt: string;
}

interface ConversationGroup {
  userId: number; userName: string | null; userPhone: string | null;
  messages: ChatLog[];
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-card rounded-xl border border-border w-full max-w-lg shadow-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground text-xl leading-none">×</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function KnowledgeForm({ init, onSave, onCancel, courses }: { init?: Partial<Knowledge>; onSave: (d: any) => Promise<void>; onCancel: () => void; courses: Course[] }) {
  const [d, setD] = useState({ category: init?.category ?? KNOWLEDGE_CATEGORIES[0].value, question: init?.question ?? "", answer: init?.answer ?? "", courseId: init?.courseId ?? "" });
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setSaving(true);
    try { await onSave({ category: d.category, question: d.question, answer: d.answer, courseId: d.courseId || null }); }
    catch (e: any) { alert(e.message); setSaving(false); }
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div>
        <label className="label">دسته‌بندی *</label>
        <select className="input" value={d.category} onChange={e => setD(p => ({ ...p, category: e.target.value }))} required>
          {KNOWLEDGE_CATEGORIES.map(c => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="label">عنوان / موضوع *</label>
        <input className="input" value={d.question} onChange={e => setD(p => ({ ...p, question: e.target.value }))} required placeholder="مثلاً: ضمانت برگشت وجه، قیمت دوره MTP" />
      </div>
      <div>
        <label className="label">محتوا *</label>
        <textarea className="input min-h-[140px] resize-none text-sm" value={d.answer} onChange={e => setD(p => ({ ...p, answer: e.target.value }))} required placeholder="توضیحات کامل این موضوع را اینجا بنویس..." />
      </div>
      <div>
        <label className="label">اختصاصی به دوره <span className="text-muted-foreground font-normal">(اختیاری)</span></label>
        <select className="input" value={d.courseId} onChange={e => setD(p => ({ ...p, courseId: e.target.value }))}>
          <option value="">عمومی — هر دو سارا و چت‌بات</option>
          {courses.map(c => (
            <option key={c.id} value={String(c.id)}>{c.title}</option>
          ))}
        </select>
        <p className="text-xs text-muted-foreground mt-1">اگه دوره‌ای انتخاب کنی، این آیتم فقط برای دانشجویان اون دوره در چت‌بات فعال میشه.</p>
      </div>
      <div className="flex gap-2 justify-end pt-1">
        <button type="button" onClick={onCancel} className="btn-secondary">انصراف</button>
        <button type="submit" disabled={saving} className="btn-primary">{saving ? "..." : "ذخیره"}</button>
      </div>
    </form>
  );
}

function ChatbotSettings() {
  const [model, setModel] = useState("gpt-4o");
  const [topics, setTopics] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    get<Record<string, string>>("/admin/settings").then(s => {
      if (s.chatbot_model) setModel(s.chatbot_model);
      if (s.chatbot_allowed_topics !== undefined) setTopics(s.chatbot_allowed_topics);
    });
  }, []);

  async function save() {
    setSaving(true);
    try {
      const current = await get<Record<string, string>>("/admin/settings");
      await put("/admin/settings", { ...current, chatbot_model: model, chatbot_allowed_topics: topics });
      setSaved(true); setTimeout(() => setSaved(false), 3000);
    } finally { setSaving(false); }
  }

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <Bot size={18} className="text-violet-400" />
        <h2 className="font-semibold">تنظیمات هوش مصنوعی</h2>
      </div>
      <div>
        <label className="label">مدل هوش مصنوعی</label>
        <select className="input" value={model} onChange={e => setModel(e.target.value)}>
          <option value="gpt-4o">GPT-4o (قوی‌ترین)</option>
          <option value="gpt-4o-mini">GPT-4o Mini (سریع‌تر، اقتصادی‌تر)</option>
          <option value="gpt-4-turbo">GPT-4 Turbo</option>
          <option value="claude-3-5-sonnet-20241022">Claude 3.5 Sonnet</option>
        </select>
      </div>
      <div>
        <label className="label">موضوعات مجاز <span className="text-muted-foreground font-normal">(اختیاری — اگه خالی باشه همه موضوعات)</span></label>
        <textarea
          className="input min-h-[80px] resize-none text-sm"
          value={topics}
          onChange={e => setTopics(e.target.value)}
          placeholder="مثال: یادگیری زبان انگلیسی، موفقیت و توسعه فردی، سوالات مربوط به دوره‌ها"
        />
        <p className="text-xs text-muted-foreground mt-1">اگه تعریف کنید، چت‌بات فقط در این موضوعات پاسخ می‌ده و سوالات خارج از آن رو رد می‌کنه.</p>
      </div>
      <div className="flex justify-end">
        <button onClick={save} disabled={saving} className="btn-primary flex items-center gap-2">
          <Save size={14} />{saved ? "ذخیره شد ✓" : saving ? "..." : "ذخیره تنظیمات"}
        </button>
      </div>
    </div>
  );
}

function ChatLogs() {
  const [logs, setLogs] = useState<ChatLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<number | null>(null);

  async function load(p: number) {
    setLoading(true);
    try { setLogs(await get<ChatLog[]>(`/admin/ai-chat/logs?page=${p}`)); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(page); }, [page]);

  const groups: ConversationGroup[] = [];
  for (const msg of logs) {
    const existing = groups.find(g => g.userId === msg.userId);
    if (existing) { existing.messages.push(msg); }
    else { groups.push({ userId: msg.userId, userName: msg.userName, userPhone: msg.userPhone, messages: [msg] }); }
  }

  function fmt(d: string) {
    return new Date(d).toLocaleString("fa-IR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  if (loading) return <div className="flex justify-center py-8"><div className="loader" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <MessageSquare size={16} className="text-violet-400" />
          مکالمات کاربران
          <span className="text-xs text-muted-foreground font-normal">({logs.length} پیام آخر)</span>
        </h2>
        <button onClick={() => load(page)} className="text-xs text-muted-foreground hover:text-foreground">↻ بروزرسانی</button>
      </div>

      {groups.length === 0 && (
        <p className="text-muted-foreground text-center py-8 text-sm">هیچ مکالمه‌ای یافت نشد</p>
      )}

      {groups.map(group => (
        <div key={group.userId} className="bg-card rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setExpanded(expanded === group.userId ? null : group.userId)}
            className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors text-right"
          >
            <div className="w-8 h-8 rounded-full bg-violet-500/20 flex items-center justify-center shrink-0">
              <User size={14} className="text-violet-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{group.userName || "بدون نام"}</p>
              <p className="text-xs text-muted-foreground">{group.userPhone} · {group.messages.length} پیام</p>
            </div>
            <div className="text-xs text-muted-foreground shrink-0">
              {fmt(group.messages[0].createdAt)}
            </div>
            {expanded === group.userId ? <ChevronUp size={14} className="text-muted-foreground shrink-0" /> : <ChevronDown size={14} className="text-muted-foreground shrink-0" />}
          </button>

          {expanded === group.userId && (
            <div className="border-t border-border px-4 py-3 space-y-2 max-h-96 overflow-y-auto">
              {[...group.messages].reverse().map(msg => (
                <div key={msg.id} className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                    msg.role === "user"
                      ? "bg-violet-600/20 text-foreground"
                      : "bg-muted/40 text-foreground"
                  }`}>
                    <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    <p className="text-[10px] text-muted-foreground mt-1 text-left">{fmt(msg.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center justify-center gap-3 pt-2">
        <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="btn-secondary text-sm disabled:opacity-40">قبلی</button>
        <span className="text-sm text-muted-foreground">صفحه {page}</span>
        <button onClick={() => setPage(p => p + 1)} disabled={logs.length < 50} className="btn-secondary text-sm disabled:opacity-40">بعدی</button>
      </div>
    </div>
  );
}

export default function Chatbot() {
  const [items, setItems] = useState<Knowledge[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState<"create" | { item: Knowledge } | null>(null);
  const [tab, setTab] = useState<"knowledge" | "logs">("knowledge");
  const [seeding, setSeeding] = useState(false);

  async function load() {
    const [knowledge, courseList] = await Promise.all([
      get<Knowledge[]>("/admin/chatbot-knowledge"),
      get<Course[]>("/admin/courses"),
    ]);
    setItems(knowledge);
    setCourses(courseList);
    setLoading(false);
  }
  useEffect(() => { load(); }, []);

  async function create(data: any) { await post("/admin/chatbot-knowledge", data); await load(); setModal(null); }
  async function update(id: number, data: any) { await put(`/admin/chatbot-knowledge/${id}`, data); await load(); setModal(null); }
  async function remove(id: number) { if (!confirm("حذف این آیتم؟")) return; await del(`/admin/chatbot-knowledge/${id}`); await load(); }

  async function seedKnowledge(force = false) {
    const msg = force
      ? "این کار محتوای پیش‌فرض را به لیست موجود اضافه می‌کند. ادامه دهید؟"
      : "آیا می‌خواهید محتوای پیش‌فرض Master Script را بارگذاری کنید؟ (۳۰+ آیتم)";
    if (!confirm(msg)) return;
    setSeeding(true);
    try {
      const url = force ? "/admin/chatbot-knowledge/seed?force=1" : "/admin/chatbot-knowledge/seed";
      const res = await post<{ ok?: boolean; inserted?: number; error?: string }>(url, {});
      if (res.error && !force) {
        if (confirm(`${res.error}\nبرای اضافه کردن به محتوای موجود تأیید کنید.`)) {
          await seedKnowledge(true);
          return;
        }
      } else {
        alert(`✅ ${res.inserted ?? 0} آیتم با موفقیت بارگذاری شد`);
        await load();
      }
    } catch (e: any) {
      alert("خطا: " + e.message);
    } finally {
      setSeeding(false);
    }
  }

  const grouped = items.reduce((acc, item) => {
    const k = item.category;
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<string, Knowledge[]>);

  return (
    <div className="space-y-4">
      <ChatbotSettings />

      <div className="flex gap-1 bg-muted/30 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("knowledge")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "knowledge" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          دانش‌نامه
        </button>
        <button
          onClick={() => setTab("logs")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${tab === "logs" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground hover:text-foreground"}`}
        >
          مکالمات
        </button>
      </div>

      {tab === "logs" && <ChatLogs />}

      {tab === "knowledge" && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl font-bold">پایگاه دانش</h1>
              <p className="text-xs text-muted-foreground mt-0.5">مشترک بین سارا (صوتی) و چت‌بات · {items.length} آیتم</p>
            </div>
            <div className="flex items-center gap-2">
              {items.length === 0 && (
                <button
                  onClick={() => seedKnowledge(false)}
                  disabled={seeding}
                  className="btn-secondary flex items-center gap-2 text-sm border-violet-500/40 text-violet-400 hover:bg-violet-500/10"
                >
                  <Download size={14} />
                  {seeding ? "در حال بارگذاری..." : "بارگذاری محتوای پیش‌فرض"}
                </button>
              )}
              <button onClick={() => setModal("create")} className="btn-primary flex items-center gap-2"><Plus size={16} /> آیتم جدید</button>
            </div>
          </div>
          {items.length === 0 && !loading && (
            <div className="bg-violet-500/10 border border-violet-500/30 rounded-xl p-4 text-sm">
              <p className="font-medium text-violet-300 mb-1">📚 پایگاه دانش خالی است</p>
              <p className="text-muted-foreground">با کلیک روی «بارگذاری محتوای پیش‌فرض» می‌توانید ۳۰+ آیتم از Master Script را در ۹ دسته‌بندی (شخصیت سارا، محصولات، اعتراضات، FAQ و...) بارگذاری کنید.</p>
            </div>
          )}

          {loading && <div className="flex justify-center py-20"><div className="loader" /></div>}
          {!loading && items.length === 0 && <p className="text-muted-foreground text-center py-10">هیچ آیتمی یافت نشد</p>}

          {!loading && Object.entries(grouped).map(([cat, catItems]) => (
            <div key={cat} className="bg-card rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-3 bg-muted/30 border-b border-border flex items-center justify-between">
                <h3 className="font-semibold text-sm">{CATEGORY_DISPLAY[cat] ?? cat} <span className="text-muted-foreground font-normal">({catItems.length})</span></h3>
              </div>
              <div className="divide-y divide-border">
                {catItems.map(item => {
                  const linkedCourse = item.courseId ? courses.find(c => String(c.id) === item.courseId) : null;
                  return (
                    <div key={item.id} className="px-4 py-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="text-sm font-medium">{item.question}</p>
                          {linkedCourse && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-500/15 text-violet-400 text-[10px] font-medium shrink-0">
                              <BookOpen size={9} /> {linkedCourse.title}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground line-clamp-2">{item.answer}</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => setModal({ item })} className="p-1.5 text-muted-foreground hover:text-foreground rounded"><Pencil size={13} /></button>
                        <button onClick={() => remove(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={13} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </>
      )}

      {modal === "create" && <Modal title="آیتم جدید" onClose={() => setModal(null)}><KnowledgeForm courses={courses} onSave={create} onCancel={() => setModal(null)} /></Modal>}
      {modal && modal !== "create" && <Modal title="ویرایش آیتم" onClose={() => setModal(null)}><KnowledgeForm courses={courses} init={modal.item} onSave={d => update(modal.item.id, d)} onCancel={() => setModal(null)} /></Modal>}
    </div>
  );
}
