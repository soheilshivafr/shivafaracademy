import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { get, post, put, del } from "@/lib/api";
import { Plus, Pencil, Trash2, Eye, EyeOff, Save, X, Database, HelpCircle, AlertCircle, Star, BookOpen, CheckCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// ── Types ────────────────────────────────────────────────────────────────────

interface KbStats {
  faqs: { total: number; published: number };
  objections: { total: number; published: number };
  proofAssets: { total: number; published: number };
  successStories: { total: number; verified: number; published: number };
  knowledgeItems: { total: number; published: number };
}

interface KbFaq {
  id: number; question: string; shortAnswer: string; detailedAnswer?: string;
  category: string; product?: string; keywords?: string; tags?: string;
  accessLevel: string; priority: string; isPublished: boolean;
  shownCount: number; usedCount: number; createdAt: string;
}

interface KbObjection {
  id: number; objectionName: string; objectionType: string;
  discoveryQuestion?: string; responseFramework: string;
  escalationRule?: string; product?: string; accessLevel: string;
  isPublished: boolean; usedCount: number; createdAt: string;
}

interface KbProofAsset {
  id: number; title: string; proofType: string; product?: string;
  description?: string; resultType?: string; tags?: string; objectionTags?: string;
  priority: number; visibility: string; fileUrl?: string;
  isPublished: boolean; shownCount: number; usedCount: number; createdAt: string;
}

interface KbSuccessStory {
  id: number; studentName: string; product?: string; beforeState?: string;
  challenges?: string; actions?: string; results: string; resultType?: string;
  tags?: string; objectionTags?: string; successScore: number;
  proofQuality: string; isVerified: boolean; isPublished: boolean;
  shownCount: number; conversionImpact: number; createdAt: string;
}

interface KbKnowledgeItem {
  id: number; title: string; category: string; subCategory?: string;
  content: string; product?: string; intent?: string; keywords?: string;
  tags?: string; accessLevel: string; priority: number;
  isPublished: boolean; shownCount: number; version: number; createdAt: string;
}

interface ProductOption { value: string; label: string }

// ── Persian label maps ────────────────────────────────────────────────────────

const FAQ_CATEGORY_LABELS: Record<string, string> = {
  general:   "عمومی",
  sales:     "فروش",
  pricing:   "قیمت‌گذاری",
  guarantee: "ضمانت",
  loan:      "وام",
  product:   "محصول",
  student:   "هنرجو",
  technical: "فنی",
};

const OBJECTION_TYPE_LABELS: Record<string, string> = {
  price:          "قیمت",
  trust:          "اعتماد",
  saturation:     "اشباع بازار",
  time:           "وقت ندارم",
  spouse:         "مخالفت همسر",
  risk:           "ریسک",
  bad_experience: "تجربه بد",
  no_capital:     "نداشتن سرمایه",
  no_skill:       "نداشتن مهارت",
};

const PROOF_TYPE_LABELS: Record<string, string> = {
  video_testimonial: "ویدیو گواهی",
  voice_testimonial: "صوت گواهی",
  income_proof:      "مدرک درآمد",
  success_story:     "داستان موفقیت",
  social_proof:      "مدرک اجتماعی",
  guarantee_proof:   "مدرک ضمانت",
};

const RESULT_TYPE_LABELS: Record<string, string> = {
  first_income:     "اولین درآمد",
  first_customer:   "اولین مشتری",
  sales_growth:     "رشد فروش",
  income_growth:    "رشد درآمد",
  business_growth:  "رشد کسب‌وکار",
  career_change:    "تغییر مسیر شغلی",
  lifestyle_change: "تغییر سبک زندگی",
};

const PROOF_QUALITY_LABELS: Record<string, string> = {
  platinum: "پلاتین",
  gold:     "طلا",
  silver:   "نقره",
  bronze:   "برنز",
};

const KB_CATEGORY_LABELS: Record<string, string> = {
  academy_intro:       "معرفی آکادمی",
  sara_persona:        "شخصیت سارا",
  about_soheil:        "درباره سهیل",
  sales_techniques:    "تکنیک‌های فروش",
  communication_style: "سبک ارتباطی",
  product_kb:          "دانش محصولات",
};

const ACCESS_LEVEL_LABELS: Record<string, string> = {
  sales:   "فروش",
  support: "پشتیبانی",
  admin:   "ادمین",
};

/** Returns the Persian label for a value, or the value itself if unknown */
function fa(map: Record<string, string>, value: string): string {
  return map[value] ?? value;
}

// ── Static option lists (value = backend value, label = Persian) ──────────────

const FAQ_CATEGORY_OPTIONS    = Object.entries(FAQ_CATEGORY_LABELS).map(([v, l])    => ({ value: v, label: l }));
const OBJECTION_TYPE_OPTIONS  = Object.entries(OBJECTION_TYPE_LABELS).map(([v, l])  => ({ value: v, label: l }));
const PROOF_TYPE_OPTIONS      = Object.entries(PROOF_TYPE_LABELS).map(([v, l])      => ({ value: v, label: l }));
const RESULT_TYPE_OPTIONS     = Object.entries(RESULT_TYPE_LABELS).map(([v, l])     => ({ value: v, label: l }));
const PROOF_QUALITY_OPTIONS   = Object.entries(PROOF_QUALITY_LABELS).map(([v, l])   => ({ value: v, label: l }));
const KB_CATEGORY_OPTIONS     = Object.entries(KB_CATEGORY_LABELS).map(([v, l])     => ({ value: v, label: l }));

// ── Hook: dynamic product + course options from DB ────────────────────────────

function useProductOptions(): ProductOption[] {
  const { data: products = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["admin-products-list"],
    queryFn: () => get("/admin/products"),
    staleTime: 5 * 60 * 1000,
  });
  const { data: courses = [] } = useQuery<{ id: number; title: string }[]>({
    queryKey: ["admin-courses-list"],
    queryFn: () => get("/admin/courses"),
    staleTime: 5 * 60 * 1000,
  });
  return [
    { value: "", label: "همه محصولات" },
    ...products.map(p => ({ value: p.title, label: p.title })),
    ...courses.map(c => ({ value: c.title, label: c.title })),
  ];
}

// ── Tabs ──────────────────────────────────────────────────────────────────────

const TABS = [
  { id: "faqs",       label: "سوالات متداول",    icon: HelpCircle,  color: "text-blue-400"   },
  { id: "objections", label: "مدیریت اعتراضات",  icon: AlertCircle, color: "text-orange-400" },
  { id: "proof",      label: "مرکز مدارک",        icon: Star,        color: "text-yellow-400" },
  { id: "stories",    label: "داستان‌های موفقیت", icon: CheckCircle, color: "text-green-400"  },
  { id: "items",      label: "دانش عمومی",        icon: BookOpen,    color: "text-purple-400" },
] as const;

type TabId = typeof TABS[number]["id"];

// ── UI primitives ─────────────────────────────────────────────────────────────

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-card rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-border">
          <h2 className="text-base font-bold text-foreground">{title}</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-xs text-muted-foreground font-medium">{label}</label>
      {children}
    </div>
  );
}

function Input({ ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${props.className ?? ""}`} />;
}

function Textarea({ ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={`w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-none ${props.className ?? ""}`} />;
}

function Select({ children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select {...props} className={`w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary ${props.className ?? ""}`}>
      {children}
    </select>
  );
}

function Toggle({ value, onChange, label }: { value: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer select-none">
      <div onClick={() => onChange(!value)} className={`w-10 h-5 rounded-full transition-colors flex items-center px-0.5 ${value ? "bg-primary" : "bg-muted"}`}>
        <div className={`w-4 h-4 rounded-full bg-white transition-transform ${value ? "translate-x-5" : "translate-x-0"}`} />
      </div>
      <span className="text-xs text-muted-foreground">{label}</span>
    </label>
  );
}

// ── Stats Bar ─────────────────────────────────────────────────────────────────

function StatsBar({ stats }: { stats: KbStats }) {
  return (
    <div className="grid grid-cols-5 gap-3 mb-6">
      {[
        { label: "سوالات متداول",  total: stats.faqs.total,          pub: stats.faqs.published,          color: "border-blue-500/30"   },
        { label: "اعتراضات",       total: stats.objections.total,     pub: stats.objections.published,    color: "border-orange-500/30" },
        { label: "مدارک",          total: stats.proofAssets.total,    pub: stats.proofAssets.published,   color: "border-yellow-500/30" },
        { label: "داستان موفقیت",  total: stats.successStories.total, pub: stats.successStories.published,color: "border-green-500/30"  },
        { label: "دانش عمومی",     total: stats.knowledgeItems.total, pub: stats.knowledgeItems.published,color: "border-purple-500/30" },
      ].map(s => (
        <div key={s.label} className={`bg-card border ${s.color} rounded-lg p-3 text-center`}>
          <div className="text-2xl font-bold text-foreground">{s.total}</div>
          <div className="text-xs text-muted-foreground">{s.label}</div>
          <div className="text-xs text-green-400">{s.pub} منتشر</div>
        </div>
      ))}
    </div>
  );
}

// ── FAQ Tab ───────────────────────────────────────────────────────────────────

function FaqTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const productOptions = useProductOptions();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: KbFaq } | null>(null);
  const [form, setForm] = useState<Partial<KbFaq>>({});

  const { data: faqs = [], isLoading } = useQuery<KbFaq[]>({ queryKey: ["kb-faqs"], queryFn: () => get("/admin/kb/faqs") });

  const save = useMutation({
    mutationFn: (d: Partial<KbFaq>) => modal?.mode === "edit" ? put(`/admin/kb/faqs/${d.id}`, d) : post("/admin/kb/faqs", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-faqs"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); setModal(null); toast({ title: "ذخیره شد" }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/kb/faqs/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-faqs"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); },
  });
  const togglePublish = (item: KbFaq) =>
    put(`/admin/kb/faqs/${item.id}`, { ...item, isPublished: !item.isPublished })
      .then(() => qc.invalidateQueries({ queryKey: ["kb-faqs"] }));

  function openCreate() { setForm({ category: "general", accessLevel: "sales", priority: "medium", isPublished: false }); setModal({ mode: "create" }); }
  function openEdit(item: KbFaq) { setForm(item); setModal({ mode: "edit", item }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">سوالات متداول ({faqs.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن سوال
        </button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">در حال بارگذاری...</div> : (
        <div className="space-y-2">
          {faqs.map(f => (
            <div key={f.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${f.isPublished ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {f.isPublished ? "منتشر" : "پیش‌نویس"}
                  </span>
                  <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full">{fa(FAQ_CATEGORY_LABELS, f.category)}</span>
                  {f.product && <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{f.product}</span>}
                </div>
                <p className="text-sm font-medium text-foreground truncate">{f.question}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{f.shortAnswer}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => togglePublish(f)} className="p-1.5 text-muted-foreground hover:text-foreground rounded">{f.isPublished ? <EyeOff size={14} /> : <Eye size={14} />}</button>
                <button onClick={() => openEdit(f)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
                <button onClick={() => remove.mutate(f.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {faqs.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">هنوز سوالی ثبت نشده</div>}
        </div>
      )}
      {modal && (
        <Modal title={modal.mode === "create" ? "افزودن سوال متداول" : "ویرایش سوال"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="سوال *">
              <Input value={form.question ?? ""} onChange={e => setForm(p => ({ ...p, question: e.target.value }))} placeholder="سوالی که کاربر می‌پرسد..." />
            </Field>
            <Field label="جواب کوتاه *">
              <Textarea rows={3} value={form.shortAnswer ?? ""} onChange={e => setForm(p => ({ ...p, shortAnswer: e.target.value }))} placeholder="پاسخ مختصر..." />
            </Field>
            <Field label="جواب کامل">
              <Textarea rows={4} value={form.detailedAnswer ?? ""} onChange={e => setForm(p => ({ ...p, detailedAnswer: e.target.value }))} placeholder="توضیحات بیشتر (اختیاری)..." />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="دسته‌بندی">
                <Select value={form.category ?? "general"} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {FAQ_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="محصول">
                <Select value={form.product ?? ""} onChange={e => setForm(p => ({ ...p, product: e.target.value || undefined }))}>
                  {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="سطح دسترسی">
                <Select value={form.accessLevel ?? "sales"} onChange={e => setForm(p => ({ ...p, accessLevel: e.target.value }))}>
                  {Object.entries(ACCESS_LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="اولویت">
                <Select value={form.priority ?? "medium"} onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                  <option value="high">بالا</option>
                  <option value="medium">متوسط</option>
                  <option value="low">پایین</option>
                </Select>
              </Field>
            </div>
            <Field label="کلیدواژه‌ها">
              <Input value={form.keywords ?? ""} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))} placeholder="کلمات جداشده با کاما..." />
            </Field>
            <Toggle value={form.isPublished ?? false} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="منتشر کردن" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || !form.question || !form.shortAnswer}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Objections Tab ────────────────────────────────────────────────────────────

function ObjectionsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const productOptions = useProductOptions();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: KbObjection } | null>(null);
  const [form, setForm] = useState<Partial<KbObjection>>({});

  const { data: items = [], isLoading } = useQuery<KbObjection[]>({ queryKey: ["kb-objections"], queryFn: () => get("/admin/kb/objections") });
  const save = useMutation({
    mutationFn: (d: Partial<KbObjection>) => modal?.mode === "edit" ? put(`/admin/kb/objections/${d.id}`, d) : post("/admin/kb/objections", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-objections"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); setModal(null); toast({ title: "ذخیره شد" }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/kb/objections/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-objections"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); },
  });

  function openCreate() { setForm({ objectionType: "price", accessLevel: "sales", isPublished: false }); setModal({ mode: "create" }); }
  function openEdit(item: KbObjection) { setForm(item); setModal({ mode: "edit", item }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">اعتراضات ({items.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن اعتراض
        </button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">در حال بارگذاری...</div> : (
        <div className="space-y-2">
          {items.map(obj => (
            <div key={obj.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${obj.isPublished ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {obj.isPublished ? "فعال" : "غیرفعال"}
                  </span>
                  <span className="text-xs text-orange-400 bg-orange-500/10 px-2 py-0.5 rounded-full">{fa(OBJECTION_TYPE_LABELS, obj.objectionType)}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{obj.objectionName}</p>
                {obj.discoveryQuestion && <p className="text-xs text-muted-foreground mt-0.5">سوال کشف: {obj.discoveryQuestion}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(obj)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
                <button onClick={() => remove.mutate(obj.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">هنوز اعتراضی ثبت نشده</div>}
        </div>
      )}
      {modal && (
        <Modal title={modal.mode === "create" ? "افزودن اعتراض" : "ویرایش اعتراض"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="نام اعتراض *">
              <Input value={form.objectionName ?? ""} onChange={e => setForm(p => ({ ...p, objectionName: e.target.value }))} placeholder="مثلاً: گرونه، وقت ندارم..." />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="نوع اعتراض">
                <Select value={form.objectionType ?? "price"} onChange={e => setForm(p => ({ ...p, objectionType: e.target.value }))}>
                  {OBJECTION_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="محصول">
                <Select value={form.product ?? ""} onChange={e => setForm(p => ({ ...p, product: e.target.value || undefined }))}>
                  {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="سوال کشف علت">
              <Input value={form.discoveryQuestion ?? ""} onChange={e => setForm(p => ({ ...p, discoveryQuestion: e.target.value }))} placeholder="سوالی که علت رو کشف می‌کنه..." />
            </Field>
            <Field label="چارچوب پاسخ *">
              <Textarea rows={5} value={form.responseFramework ?? ""} onChange={e => setForm(p => ({ ...p, responseFramework: e.target.value }))} placeholder="روش پاسخ به این اعتراض..." />
            </Field>
            <Field label="قانون ارجاع (در صورت شکست)">
              <Input value={form.escalationRule ?? ""} onChange={e => setForm(p => ({ ...p, escalationRule: e.target.value }))} />
            </Field>
            <Toggle value={form.isPublished ?? false} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="فعال" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || !form.objectionName || !form.responseFramework}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Proof Assets Tab ──────────────────────────────────────────────────────────

function ProofTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const productOptions = useProductOptions();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: KbProofAsset } | null>(null);
  const [form, setForm] = useState<Partial<KbProofAsset>>({});

  const { data: items = [], isLoading } = useQuery<KbProofAsset[]>({ queryKey: ["kb-proof"], queryFn: () => get("/admin/kb/proof-assets") });
  const save = useMutation({
    mutationFn: (d: Partial<KbProofAsset>) => modal?.mode === "edit" ? put(`/admin/kb/proof-assets/${d.id}`, d) : post("/admin/kb/proof-assets", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-proof"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); setModal(null); toast({ title: "ذخیره شد" }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/kb/proof-assets/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-proof"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); },
  });

  function openCreate() { setForm({ proofType: "video_testimonial", priority: 5, visibility: "sales", isPublished: false }); setModal({ mode: "create" }); }
  function openEdit(item: KbProofAsset) { setForm(item); setModal({ mode: "edit", item }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">مدارک اعتمادسازی ({items.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن مدرک
        </button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">در حال بارگذاری...</div> : (
        <div className="space-y-2">
          {items.map(p => (
            <div key={p.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.isPublished ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {p.isPublished ? "فعال" : "غیرفعال"}
                  </span>
                  <span className="text-xs text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full">{fa(PROOF_TYPE_LABELS, p.proofType)}</span>
                  <span className="text-xs text-muted-foreground">اولویت: {p.priority}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{p.title}</p>
                {p.description && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{p.description}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(p)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
                <button onClick={() => remove.mutate(p.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">هنوز مدرکی ثبت نشده</div>}
        </div>
      )}
      {modal && (
        <Modal title={modal.mode === "create" ? "افزودن مدرک جدید" : "ویرایش مدرک"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="عنوان *">
              <Input value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} placeholder="عنوان مدرک..." />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="نوع مدرک">
                <Select value={form.proofType ?? "video_testimonial"} onChange={e => setForm(p => ({ ...p, proofType: e.target.value }))}>
                  {PROOF_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="محصول">
                <Select value={form.product ?? ""} onChange={e => setForm(p => ({ ...p, product: e.target.value || undefined }))}>
                  {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="نوع نتیجه">
                <Select value={form.resultType ?? ""} onChange={e => setForm(p => ({ ...p, resultType: e.target.value || undefined }))}>
                  <option value="">انتخاب...</option>
                  {RESULT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="اولویت (۱=بالاترین)">
                <Input type="number" min={1} max={10} value={form.priority ?? 5} onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) }))} />
              </Field>
            </div>
            <Field label="توضیحات">
              <Textarea rows={3} value={form.description ?? ""} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} />
            </Field>
            <Field label="تگ‌های اعتراض (مثلاً: [«اعتماد»، «قیمت»])">
              <Input value={form.objectionTags ?? ""} onChange={e => setForm(p => ({ ...p, objectionTags: e.target.value }))} placeholder='["trust","price"]' />
            </Field>
            <Field label="آدرس فایل">
              <Input value={form.fileUrl ?? ""} onChange={e => setForm(p => ({ ...p, fileUrl: e.target.value }))} />
            </Field>
            <Toggle value={form.isPublished ?? false} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="منتشر" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || !form.title}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Success Stories Tab ───────────────────────────────────────────────────────

function StoriesTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const productOptions = useProductOptions();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: KbSuccessStory } | null>(null);
  const [form, setForm] = useState<Partial<KbSuccessStory>>({});

  const { data: items = [], isLoading } = useQuery<KbSuccessStory[]>({ queryKey: ["kb-stories"], queryFn: () => get("/admin/kb/success-stories") });
  const save = useMutation({
    mutationFn: (d: Partial<KbSuccessStory>) => modal?.mode === "edit" ? put(`/admin/kb/success-stories/${d.id}`, d) : post("/admin/kb/success-stories", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-stories"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); setModal(null); toast({ title: "ذخیره شد" }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/kb/success-stories/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-stories"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); },
  });

  const QUALITY_COLORS: Record<string, string> = {
    platinum: "text-cyan-400",
    gold:     "text-yellow-400",
    silver:   "text-gray-300",
    bronze:   "text-orange-700",
  };

  function openCreate() { setForm({ proofQuality: "bronze", isVerified: false, isPublished: false }); setModal({ mode: "create" }); }
  function openEdit(item: KbSuccessStory) { setForm(item); setModal({ mode: "edit", item }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">داستان‌های موفقیت ({items.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن داستان
        </button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">در حال بارگذاری...</div> : (
        <div className="space-y-2">
          {items.map(s => (
            <div key={s.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-bold ${QUALITY_COLORS[s.proofQuality] ?? "text-muted-foreground"}`}>{fa(PROOF_QUALITY_LABELS, s.proofQuality)}</span>
                  {s.isVerified && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">تأیید شده</span>}
                  {s.product && <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{s.product}</span>}
                  <span className="text-xs text-muted-foreground">امتیاز: {s.successScore}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{s.studentName}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{s.results}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(s)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
                <button onClick={() => remove.mutate(s.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">هنوز داستانی ثبت نشده</div>}
        </div>
      )}
      {modal && (
        <Modal title={modal.mode === "create" ? "افزودن داستان موفقیت" : "ویرایش داستان"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="نام هنرجو *">
              <Input value={form.studentName ?? ""} onChange={e => setForm(p => ({ ...p, studentName: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="محصول">
                <Select value={form.product ?? ""} onChange={e => setForm(p => ({ ...p, product: e.target.value || undefined }))}>
                  {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="نوع نتیجه">
                <Select value={form.resultType ?? ""} onChange={e => setForm(p => ({ ...p, resultType: e.target.value || undefined }))}>
                  <option value="">انتخاب...</option>
                  {RESULT_TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="کیفیت مدرک">
                <Select value={form.proofQuality ?? "bronze"} onChange={e => setForm(p => ({ ...p, proofQuality: e.target.value }))}>
                  {PROOF_QUALITY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="وضعیت قبل از آکادمی">
              <Textarea rows={2} value={form.beforeState ?? ""} onChange={e => setForm(p => ({ ...p, beforeState: e.target.value }))} />
            </Field>
            <Field label="اقدامات انجام‌شده">
              <Textarea rows={2} value={form.actions ?? ""} onChange={e => setForm(p => ({ ...p, actions: e.target.value }))} />
            </Field>
            <Field label="نتایج *">
              <Textarea rows={3} value={form.results ?? ""} onChange={e => setForm(p => ({ ...p, results: e.target.value }))} placeholder="نتیجه‌ای که هنرجو به آن رسید..." />
            </Field>
            <Field label="تگ‌های اعتراض (مثلاً: [«اعتماد»، «قیمت»])">
              <Input value={form.objectionTags ?? ""} onChange={e => setForm(p => ({ ...p, objectionTags: e.target.value }))} placeholder='["trust","price"]' />
            </Field>
            <div className="flex gap-4">
              <Toggle value={form.isVerified ?? false} onChange={v => setForm(p => ({ ...p, isVerified: v }))} label="تأیید شده" />
              <Toggle value={form.isPublished ?? false} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="منتشر" />
            </div>
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || !form.studentName || !form.results}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Knowledge Items Tab ───────────────────────────────────────────────────────

function KnowledgeItemsTab() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const productOptions = useProductOptions();
  const [modal, setModal] = useState<{ mode: "create" | "edit"; item?: KbKnowledgeItem } | null>(null);
  const [form, setForm] = useState<Partial<KbKnowledgeItem>>({});

  const { data: items = [], isLoading } = useQuery<KbKnowledgeItem[]>({ queryKey: ["kb-items"], queryFn: () => get("/admin/kb/items") });
  const save = useMutation({
    mutationFn: (d: Partial<KbKnowledgeItem>) => modal?.mode === "edit" ? put(`/admin/kb/items/${d.id}`, d) : post("/admin/kb/items", d),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-items"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); setModal(null); toast({ title: "ذخیره شد" }); },
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/admin/kb/items/${id}`),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["kb-items"] }); qc.invalidateQueries({ queryKey: ["kb-stats"] }); },
  });

  function openCreate() { setForm({ category: "product_kb", accessLevel: "sales", priority: 5, isPublished: false }); setModal({ mode: "create" }); }
  function openEdit(item: KbKnowledgeItem) { setForm(item); setModal({ mode: "edit", item }); }

  return (
    <div>
      <div className="flex justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">آیتم‌های دانش ({items.length})</h3>
        <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90">
          <Plus size={14} /> افزودن آیتم
        </button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground text-sm">در حال بارگذاری...</div> : (
        <div className="space-y-2">
          {items.map(item => (
            <div key={item.id} className="bg-card border border-border rounded-lg p-3 flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.isPublished ? "bg-green-500/20 text-green-400" : "bg-muted text-muted-foreground"}`}>
                    {item.isPublished ? "منتشر" : "پیش‌نویس"}
                  </span>
                  <span className="text-xs text-purple-400 bg-purple-500/10 px-2 py-0.5 rounded-full">{fa(KB_CATEGORY_LABELS, item.category)}</span>
                  {item.product && <span className="text-xs text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded-full">{item.product}</span>}
                  <span className="text-xs text-muted-foreground">{fa(ACCESS_LEVEL_LABELS, item.accessLevel)}</span>
                </div>
                <p className="text-sm font-medium text-foreground">{item.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{item.content}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => openEdit(item)} className="p-1.5 text-muted-foreground hover:text-primary rounded"><Pencil size={14} /></button>
                <button onClick={() => remove.mutate(item.id)} className="p-1.5 text-muted-foreground hover:text-destructive rounded"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
          {items.length === 0 && <div className="text-center py-8 text-muted-foreground text-sm">هنوز آیتمی ثبت نشده</div>}
        </div>
      )}
      {modal && (
        <Modal title={modal.mode === "create" ? "افزودن آیتم دانش" : "ویرایش آیتم"} onClose={() => setModal(null)}>
          <div className="space-y-4">
            <Field label="عنوان *">
              <Input value={form.title ?? ""} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
            </Field>
            <div className="grid grid-cols-2 gap-4">
              <Field label="دسته‌بندی">
                <Select value={form.category ?? "product_kb"} onChange={e => setForm(p => ({ ...p, category: e.target.value }))}>
                  {KB_CATEGORY_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="زیردسته">
                <Input value={form.subCategory ?? ""} onChange={e => setForm(p => ({ ...p, subCategory: e.target.value }))} />
              </Field>
              <Field label="محصول">
                <Select value={form.product ?? ""} onChange={e => setForm(p => ({ ...p, product: e.target.value || undefined }))}>
                  {productOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </Select>
              </Field>
              <Field label="سطح دسترسی">
                <Select value={form.accessLevel ?? "sales"} onChange={e => setForm(p => ({ ...p, accessLevel: e.target.value }))}>
                  {Object.entries(ACCESS_LEVEL_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <Field label="اولویت (۱=بالاترین)">
                <Input type="number" min={1} max={10} value={form.priority ?? 5} onChange={e => setForm(p => ({ ...p, priority: parseInt(e.target.value) }))} />
              </Field>
            </div>
            <Field label="محتوا *">
              <Textarea rows={6} value={form.content ?? ""} onChange={e => setForm(p => ({ ...p, content: e.target.value }))} placeholder="محتوای دانش..." />
            </Field>
            <Field label="کلیدواژه‌ها">
              <Input value={form.keywords ?? ""} onChange={e => setForm(p => ({ ...p, keywords: e.target.value }))} placeholder="کلمات جداشده با کاما..." />
            </Field>
            <Toggle value={form.isPublished ?? false} onChange={v => setForm(p => ({ ...p, isPublished: v }))} label="منتشر" />
            <div className="flex gap-2 pt-2">
              <button onClick={() => save.mutate(form)} disabled={save.isPending || !form.title || !form.content}
                className="flex-1 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-primary/90 flex items-center justify-center gap-2">
                <Save size={14} />{save.isPending ? "در حال ذخیره..." : "ذخیره"}
              </button>
              <button onClick={() => setModal(null)} className="px-4 py-2 bg-muted text-foreground rounded-lg text-sm hover:bg-muted/70">لغو</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function KnowledgeBase() {
  const [activeTab, setActiveTab] = useState<TabId>("faqs");

  const { data: stats } = useQuery<KbStats>({
    queryKey: ["kb-stats"],
    queryFn: () => get("/admin/kb/stats"),
  });

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center">
          <Database size={20} className="text-primary" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-foreground">پایگاه دانش</h1>
          <p className="text-xs text-muted-foreground">مدیریت دانش سارا و چت‌بات</p>
        </div>
      </div>

      {stats && <StatsBar stats={stats} />}

      <div className="flex gap-1 bg-muted rounded-xl p-1 mb-6 overflow-x-auto">
        {TABS.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${activeTab === tab.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            <tab.icon size={13} className={activeTab === tab.id ? tab.color : ""} />
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-muted/30 rounded-xl border border-border p-4">
        {activeTab === "faqs"       && <FaqTab />}
        {activeTab === "objections" && <ObjectionsTab />}
        {activeTab === "proof"      && <ProofTab />}
        {activeTab === "stories"    && <StoriesTab />}
        {activeTab === "items"      && <KnowledgeItemsTab />}
      </div>
    </div>
  );
}
