import { useAuth } from "@/lib/auth";
import { useState, useEffect, useRef } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { Users, Crown, Copy, ChevronDown, ChevronUp, Coins, Trophy, Share2, ImagePlus, Loader2, Pencil, Download, Info, CheckCircle2, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Link } from "wouter";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

// فشرده‌سازی تصویر در مرورگر قبل از آپلود
// عکس‌های آیفون معمولاً ۳-۱۰ مگابایت هستند؛ Nginx پیش‌فرض بالای ۱MB رد می‌کند.
// این تابع تصویر را روی Canvas رسم کرده و با کیفیت ۸۲٪ به JPEG تبدیل می‌کند.
function compressImage(file: File, maxDimension = 1200, quality = 0.82): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      let { width, height } = img;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.round((height * maxDimension) / width);
          width = maxDimension;
        } else {
          width = Math.round((width * maxDimension) / height);
          height = maxDimension;
        }
      }
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas not supported")); return; }
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => blob ? resolve(blob) : reject(new Error("compress failed")),
        "image/jpeg",
        quality
      );
    };
    img.onerror = () => { URL.revokeObjectURL(objectUrl); reject(new Error("image load failed")); };
    img.src = objectUrl;
  });
}

const SHARE_APPS = [
  { name: "تلگرام", color: "#2AABEE", url: (t: string) => `https://t.me/share/url?text=${encodeURIComponent(t)}` },
  { name: "واتساپ", color: "#25D366", url: (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}` },
  { name: "روبیکا", color: "#7B5EA7", url: (t: string) => `rubika://share?text=${encodeURIComponent(t)}` },
  { name: "بله", color: "#1B7FC4", url: (t: string) => `bale://share?text=${encodeURIComponent(t)}` },
  { name: "ایتا", color: "#CC3333", url: (t: string) => `eitaa://msg?text=${encodeURIComponent(t)}` },
  { name: "سروش", color: "#F5A623", url: (t: string) => `soroush://send?text=${encodeURIComponent(t)}` },
  { name: "اینستاگرام", color: "#E1306C", url: () => `https://www.instagram.com/` },
];

function ShareModal({ tribe, onClose }: { tribe: any; onClose: () => void }) {
  const link = `https://shivafaracademy.ir/api/r/${tribe.referralCode}`;
  const text = `به قبیله «${tribe.name}» در آکادمی شیوافر بپیوندید!\nبا عضویت در این قبیله از آموزش‌های حرفه‌ای بهره‌مند شو.\n${link}`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-center font-black text-lg">دعوت به قبیله</h3>
        <p className="text-sm text-muted-foreground text-center">دوستان را به قبیله‌ات دعوت کن</p>
        <div className="bg-secondary rounded-xl p-3 text-xs text-muted-foreground line-clamp-3">{text}</div>
        <div className="grid grid-cols-4 gap-3">
          {SHARE_APPS.map(app => (
            <a key={app.name} href={app.url(text)} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-1 py-2 rounded-xl bg-secondary active:scale-95 transition-transform">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-base font-black" style={{ background: app.color }}>
                {app.name[0]}
              </div>
              <span className="text-xs text-muted-foreground">{app.name}</span>
            </a>
          ))}
          <button
            onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-secondary active:scale-95 transition-transform"
          >
            <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
              <Copy className="w-5 h-5" />
            </div>
            <span className="text-xs text-muted-foreground">{copied ? "کپی شد!" : "کپی"}</span>
          </button>
        </div>
        <Button className="w-full" variant="outline" onClick={onClose}>بستن</Button>
      </div>
    </div>
  );
}

function EditTribeModal({ tribe, token, onClose, onSaved }: { tribe: any; token: string | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(tribe.name ?? "");
  const [logo, setLogo] = useState(tribe.logo ?? "");
  const [logoPreview, setLogoPreview] = useState(tribe.logo ?? "");
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [saving, setSaving] = useState(false);

  const handleLogoUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setLogoPreview(URL.createObjectURL(file));
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch {
      blob = file;
    }
    const form = new FormData();
    form.append("file", blob, "logo.jpg");
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploading(false);
      setUploadProgress(0);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setLogo(data.url);
          toast.success("عکس آپلود شد");
        } else {
          toast.error(data.error || "خطا در آپلود عکس");
          setLogoPreview(tribe.logo ?? "");
          setLogo(tribe.logo ?? "");
        }
      } catch {
        toast.error(xhr.status === 413 ? "حجم عکس زیاد است" : "خطا در آپلود عکس");
        setLogoPreview(tribe.logo ?? "");
        setLogo(tribe.logo ?? "");
      }
    };
    xhr.onerror = () => {
      setUploading(false);
      toast.error("خطا در اتصال به سرور");
      setLogoPreview(tribe.logo ?? "");
      setLogo(tribe.logo ?? "");
    };
    xhr.open("POST", `${API}/api/upload/tribe-logo`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  };

  const handleSave = async () => {
    if (!name.trim() || name.trim().length < 2) { toast.error("نام قبیله باید حداقل ۲ کاراکتر باشد"); return; }
    setSaving(true);
    try {
      const res = await fetch(`${API}/api/tribe/update`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: name.trim(), logo: logo || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("قبیله ویرایش شد");
      onSaved();
      onClose();
    } catch (err: any) {
      toast.error(err.message ?? "خطا در ذخیره");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl px-5 pt-5 pb-24 space-y-4 max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-1" />
        <h3 className="text-center font-black text-lg">ویرایش قبیله</h3>

        {/* Logo upload */}
        <div>
          <input type="file" accept="image/*" id="edit-tribe-logo" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }} />
          <label htmlFor="edit-tribe-logo">
            <div className="flex items-center gap-3 rounded-xl border cursor-pointer px-4 py-3 border-input bg-background hover:border-primary/40 transition-all">
              {logoPreview ? (
                <CachedImage src={logoPreview} alt="لوگو" className="w-14 h-14 rounded-full object-cover border-2 border-primary/30 shrink-0" />
              ) : (
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center shrink-0">
                  {uploading ? <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /> : <ImagePlus className="w-6 h-6 text-muted-foreground" />}
                </div>
              )}
              <div className="flex-1 text-right">
                {uploading ? (
                  <div className="space-y-1">
                    <p className="text-sm text-muted-foreground">در حال آپلود... {uploadProgress}٪</p>
                    <div className="w-full bg-secondary rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all" style={{ width: `${uploadProgress}%` }} />
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    {logoPreview ? "برای تغییر عکس کلیک کن" : "عکس قبیله را انتخاب کنید"}
                  </p>
                )}
              </div>
            </div>
          </label>
        </div>

        {/* Name input */}
        <Input
          placeholder="نام قبیله *"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="h-11"
        />

        <div className="flex gap-2 pt-1">
          <Button onClick={handleSave} className="flex-1 h-11 font-bold" disabled={saving || uploading || !name.trim()}>
            {saving ? "در حال ذخیره..." : "ذخیره"}
          </Button>
          <Button variant="outline" onClick={onClose} className="flex-1 h-11">انصراف</Button>
        </div>
      </div>
    </div>
  );
}

function useApi<T>(path: string, token: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const load = () => {
    if (!token) { setLoading(false); return; }
    setLoading(true);
    fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, [path, token]);
  return { data, loading, refetch: load };
}

export default function TribePage() {
  const { token } = useAuth();
  const [, navigate] = useLocation();

  const { data: myTribe, loading: tribeLoading, refetch: refetchTribe } = useApi<any>("/api/tribe/me", token);
  const { data: myMembership, loading: membershipLoading } = useApi<any>("/api/tribe/my-membership", token);
  const { data: walletData } = useApi<any>("/api/wallet/me", token);

  // Auto-navigate to guide for logged-in users who haven't created a tribe (1s delay)
  // Shows every time user enters this tab, except right after closing the guide
  useEffect(() => {
    if (tribeLoading) return;

    if (!token) {
      // کاربر مهمان — اگر در این session رد کرده باشد نشان نده
      if (sessionStorage.getItem("tribe_guide_dismissed")) return;
      const t = setTimeout(() => navigate("/guide"), 2000);
      return () => clearTimeout(t);
    }

    // کاربر لاگین‌شده — اگر قبیله دارد نشان نده
    if (myTribe) return;
    if (sessionStorage.getItem("tribe_guide_dismissed")) {
      sessionStorage.removeItem("tribe_guide_dismissed");
      return;
    }
    const t = setTimeout(() => navigate("/guide"), 2000);
    return () => clearTimeout(t);
  }, [tribeLoading, myTribe, token]);

  // Create tribe form state
  const [creating, setCreating] = useState(false);
  const [tribeName, setTribeName] = useState("");
  const [tribeLogo, setTribeLogo] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoUploadProgress, setLogoUploadProgress] = useState(0);
  const [tribeBankCard, setTribeBankCard] = useState("");
  const [tribeSheba, setTribeSheba] = useState("");
  const [tribeAccountName, setTribeAccountName] = useState("");

  // کاربر مهمان می‌تواند صفحه قبیله را ببیند؛ فقط هنگام ساخت قبیله نیاز به ورود دارد

  const handleLogoUpload = async (file: File) => {
    setUploadingLogo(true);
    setLogoUploadProgress(0);
    setLogoPreview(URL.createObjectURL(file));
    let blob: Blob;
    try {
      blob = await compressImage(file);
    } catch {
      blob = file;
    }
    const form = new FormData();
    form.append("file", blob, "logo.jpg");
    const xhr = new XMLHttpRequest();
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) setLogoUploadProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      setUploadingLogo(false);
      setLogoUploadProgress(0);
      try {
        const data = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          setTribeLogo(data.url);
          toast.success("عکس قبیله آپلود شد");
        } else {
          toast.error(data.error || "خطا در آپلود عکس");
          setLogoPreview("");
          setTribeLogo("");
        }
      } catch {
        toast.error(xhr.status === 413 ? "حجم عکس زیاد است" : "خطا در آپلود عکس");
        setLogoPreview("");
        setTribeLogo("");
      }
    };
    xhr.onerror = () => {
      setUploadingLogo(false);
      setLogoUploadProgress(0);
      toast.error("خطا در اتصال به سرور");
      setLogoPreview("");
      setTribeLogo("");
    };
    xhr.open("POST", `${API}/api/upload/tribe-logo`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.send(form);
  };

  // Chief view state
  const [members, setMembers] = useState<any[]>([]);
  const [membersOpen, setMembersOpen] = useState(false);
  const [earnings, setEarnings] = useState<any[]>([]);
  const [showShare, setShowShare] = useState(false);
  const [showEdit, setShowEdit] = useState(false);

  // Bank info state
  const [bankCard, setBankCard] = useState("");
  const [sheba, setSheba] = useState("");
  const [accountName, setAccountName] = useState("");
  const [savingBank, setSavingBank] = useState(false);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const isChief = !!myTribe;

  useEffect(() => {
    if (isChief && token) {
      fetch(`${API}/api/tribe/members`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setMembers).catch(() => {});
      fetch(`${API}/api/tribe/earnings`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json()).then(setEarnings).catch(() => {});
      fetch(`${API}/api/auth/bank-info`, { headers: { Authorization: `Bearer ${token}` } })
        .then(r => r.json())
        .then(d => { setBankCard(d.bankCard ?? ""); setSheba(d.sheba ?? ""); setAccountName(d.accountName ?? ""); setBankLoaded(true); })
        .catch(() => setBankLoaded(true));
    }
  }, [isChief, token]);

  const handleSaveBank = async () => {
    setSavingBank(true);
    try {
      const res = await fetch(`${API}/api/auth/bank-info`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ bankCard, sheba, accountName }),
      });
      if (!res.ok) throw new Error();
      toast.success("اطلاعات بانکی ذخیره شد");
    } catch {
      toast.error("خطا در ذخیره اطلاعات بانکی");
    } finally {
      setSavingBank(false);
    }
  };

  const handleCreate = async () => {
    if (!token) { navigate("/login"); return; }
    if (!tribeName.trim()) { toast.error("نام قبیله را وارد کنید"); return; }
    setCreating(true);
    try {
      const res = await fetch(`${API}/api/tribe/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: tribeName.trim(),
          logo: tribeLogo.trim() || undefined,
          bankCard: tribeBankCard.trim() || undefined,
          sheba: tribeSheba.trim() || undefined,
          accountName: tribeAccountName.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("قبیله با موفقیت ساخته شد!");
      refetchTribe();
    } catch (err: any) {
      toast.error(err.message ?? "خطا در ساخت قبیله");
    } finally {
      setCreating(false);
    }
  };

  if (tribeLoading) {
    return <div className="p-6 pt-10 max-w-md mx-auto space-y-4">
      {[1, 2, 3].map(i => <div key={i} className="h-24 bg-card rounded-2xl animate-pulse" />)}
    </div>;
  }

  const totalCommission = earnings.reduce((sum: number, e: any) => sum + (e.amount ?? 0), 0);

  return (
    <div className="p-4 pt-8 pb-24 max-w-md mx-auto space-y-5" dir="rtl">
      {showShare && myTribe && <ShareModal tribe={myTribe} onClose={() => setShowShare(false)} />}
      {showEdit && myTribe && <EditTribeModal tribe={myTribe} token={token} onClose={() => setShowEdit(false)} onSaved={refetchTribe} />}

      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Crown className="text-primary w-6 h-6" />
          <h1 className="text-2xl font-black text-foreground">قبیله من</h1>
        </div>
        <button
          onClick={() => navigate("/guide")}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all active:scale-95"
          style={{
            background: "var(--tribe-guide-btn-bg)",
            border: "1px solid var(--tribe-guide-btn-border)",
            color: "var(--tribe-guide-btn-color)",
          }}
        >
          <BookOpen className="w-3.5 h-3.5" />
          راهنمای درآمدزایی
        </button>
      </div>

      {/* Leaderboard card — always at top */}
      <Link href="/leaderboard">
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-l from-violet-600/20 to-indigo-600/20 border border-violet-500/30 active:scale-[0.97] transition-transform">
          <div className="absolute -top-6 -left-6 w-24 h-24 bg-violet-500/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-4 -right-4 w-20 h-20 bg-indigo-500/10 rounded-full blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-violet-500/30 shrink-0">
              <Trophy className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1 text-right">
              <p className="font-black text-sm text-foreground">جدول رتبه‌بندی قبایل</p>
              <p className="text-xs text-muted-foreground mt-0.5">ببین قبیله‌ات کجا ایستاده</p>
            </div>
            <div className="text-muted-foreground">
              <svg className="w-4 h-4 rotate-180" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
            </div>
          </div>
        </div>
      </Link>

      {/* ─── Chief View ─────────────────────────────────────────────── */}
      {isChief && (
        <>
          <Card className="bg-gradient-to-bl from-primary/20 to-card border-primary/30 mt-3">
            <CardContent className="p-5 space-y-3">
              <div className="flex items-center gap-3">
                {myTribe.logo ? (
                  <CachedImage src={myTribe.logo} alt={myTribe.name} className="w-14 h-14 rounded-full object-cover border-2 border-primary/30" />
                ) : (
                  <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
                    <Crown className="text-primary w-7 h-7" />
                  </div>
                )}
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">رهبر قبیله</div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-black">{myTribe.name}</h2>
                    <button
                      onClick={() => setShowEdit(true)}
                      className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center active:scale-90 transition-transform shrink-0"
                    >
                      <Pencil className="w-3.5 h-3.5 text-primary" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Stats row */}
              <div className="grid grid-cols-3 gap-2 text-sm">
                <button
                  onClick={() => setMembersOpen(o => !o)}
                  className="bg-primary/10 rounded-xl px-3 py-2 text-center cursor-pointer hover:bg-primary/20 transition-colors"
                >
                  <div className="font-black text-lg">{myTribe.memberCount}</div>
                  <div className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Users className="w-3 h-3" /> عضو
                  </div>
                </button>
                <div className="bg-primary/10 rounded-xl px-3 py-2 text-center">
                  <div className="font-black text-base text-green-500">{walletData?.balance?.toLocaleString("fa") ?? "۰"}</div>
                  <div className="text-xs text-muted-foreground">موجودی</div>
                </div>
                <div className="bg-primary/10 rounded-xl px-3 py-2 text-center">
                  <div className="font-black text-base text-primary">{totalCommission.toLocaleString("fa")}</div>
                  <div className="text-xs text-muted-foreground">کل کمیسیون</div>
                </div>
              </div>

              {/* Referral link */}
              <div className="bg-secondary rounded-xl p-3">
                <div className="text-xs text-muted-foreground mb-2">لینک دعوت</div>
                <div className="flex gap-2 items-center">
                  <code className="text-xs flex-1 text-primary truncate" dir="ltr">
                    shivafaracademy.ir/api/r/{myTribe.referralCode}
                  </code>
                  <Button size="sm" variant="outline" className="shrink-0 h-7 text-xs gap-1"
                    onClick={() => setShowShare(true)}>
                    <Share2 className="w-3 h-3" />
                    اشتراک
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Members list — toggled from the member stat button */}
          {membersOpen && (
            <div className="bg-card border border-card-border rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-border flex items-center gap-2 text-sm font-bold">
                <Users className="w-4 h-4 text-primary" /> اعضای قبیله ({members.length})
              </div>
              {members.length === 0 ? (
                <div className="p-5 text-center text-sm text-muted-foreground">هنوز عضوی ندارید. لینک دعوت را به اشتراک بگذارید</div>
              ) : members.map((m, i) => (
                <div key={m.id} className={`flex items-center px-4 py-3 gap-3 ${i > 0 ? "border-t border-border" : ""}`}>
                  <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-black text-primary">{i + 1}</div>
                  <div>
                    <div className="text-sm font-bold">{m.name ?? "کاربر"}</div>
                    <div className="text-xs text-muted-foreground" dir="ltr">{m.phone}</div>
                  </div>
                  <div className="mr-auto text-xs text-muted-foreground">{new Date(m.joinedAt).toLocaleDateString("fa-IR")}</div>
                </div>
              ))}
            </div>
          )}

          {/* Earnings */}
          <div>
            <h3 className="font-bold text-sm mb-3 flex items-center gap-2 text-muted-foreground">
              <Coins className="w-4 h-4" /> تاریخچه کمیسیون
            </h3>
            {earnings.length === 0 ? (
              <div className="bg-card border border-card-border rounded-xl p-5 text-sm text-center text-muted-foreground">
                هنوز کمیسیونی دریافت نشده. عضو جذب کنید تا از خریدهای آن‌ها کمیسیون بگیرید
              </div>
            ) : (
              <div className="space-y-2">
                {earnings.map((e: any) => {
                  const dt = new Date(e.createdAt);
                  const dateStr = dt.toLocaleDateString("fa-IR");
                  const timeStr = dt.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
                  const isCoursePurchase = e.itemType === "course";
                  return (
                    <div key={e.id} className="bg-card border border-card-border rounded-2xl px-4 py-4 space-y-3">
                      {/* Row 1: buyer + type badge + datetime */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0"
                            style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.1)" }}>
                            <span className="text-xs">👤</span>
                          </div>
                          <span className="text-sm font-bold text-white/90 truncate">{e.buyerName ?? "عضو"}</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full flex-shrink-0 ${isCoursePurchase ? "bg-yellow-500/15 text-yellow-400 border border-yellow-500/25" : "bg-violet-500/15 text-violet-400 border border-violet-500/25"}`}>
                            {isCoursePurchase ? "دوره" : "محصول"}
                          </span>
                        </div>
                        <div className="text-[10px] text-muted-foreground flex-shrink-0 text-left">
                          <div>{dateStr}</div>
                          <div>{timeStr}</div>
                        </div>
                      </div>
                      {/* Row 2: item title */}
                      {e.itemTitle && (
                        <div className="text-xs text-white/60 pr-9 line-clamp-1">{e.itemTitle}</div>
                      )}
                      {/* Row 3: amounts */}
                      <div className="flex items-center justify-between pr-9">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <span>مبلغ خرید:</span>
                          <span className="text-white/70 font-semibold">{e.orderAmount?.toLocaleString("fa") ?? "—"} تومان</span>
                        </div>
                        <div className="flex items-center gap-1 text-sm font-black text-green-400">
                          <span>+{e.amount?.toLocaleString("fa")} تومان</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
          {/* Bank Info */}
          <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
            <button
              onClick={() => setBankOpen(o => !o)}
              className="w-full flex items-center justify-between p-5 text-right"
            >
              <h3 className="font-bold flex items-center gap-2">
                <Download className="w-4 h-4 text-primary" /> اطلاعات حساب بانکی
              </h3>
              {bankOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {bankOpen && (
              <div className="px-5 pb-5 space-y-4">
                <p className="text-xs text-muted-foreground">
                  برای درخواست برداشت کمیسیون، اطلاعات حساب بانکی خود را وارد کنید.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">شماره کارت (۱۶ رقم)</label>
                    <Input
                      placeholder="1234567890123456"
                      value={bankCard}
                      onChange={e => setBankCard(e.target.value.replace(/\D/g, "").slice(0, 16))}
                      dir="ltr"
                      className="h-11 tracking-wider"
                      maxLength={16}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">شماره شبا (با IR شروع می‌شود)</label>
                    <Input
                      placeholder="IR123456789012345678901234"
                      value={sheba}
                      onChange={e => setSheba(e.target.value.slice(0, 26))}
                      dir="ltr"
                      className="h-11 tracking-wider"
                      maxLength={26}
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">نام صاحب حساب</label>
                    <Input
                      placeholder="نام و نام‌خانوادگی صاحب حساب"
                      value={accountName}
                      onChange={e => setAccountName(e.target.value)}
                      className="h-11"
                    />
                  </div>
                </div>
                <Button
                  onClick={handleSaveBank}
                  disabled={savingBank || !bankLoaded}
                  className="w-full h-11 font-bold bg-green-600 hover:bg-green-700 text-white gap-2"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {savingBank ? "در حال ذخیره..." : "ذخیره اطلاعات بانکی"}
                </Button>
                <div className="flex items-start gap-2 bg-secondary rounded-xl p-3">
                  <Info className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                  <p className="text-xs text-muted-foreground">
                    اطلاعات بانکی هنگام ثبت درخواست برداشت به‌طور خودکار استفاده می‌شود.
                  </p>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* ─── No Tribe Yet ─────────────────────────────────────────────── */}
      {!isChief && (
        <div className="space-y-4 mt-4">
          <div className="bg-card border border-card-border rounded-2xl p-5 text-center space-y-3">
            <Crown className="w-10 h-10 text-primary/40 mx-auto" />
            <h2 className="text-lg font-black">قبیله خود را بسازید</h2>
            <p className="text-sm text-muted-foreground">
              با ساخت قبیله رییس یک گروه خواهید شد و می‌توانید قبیله خود را با اعضایی که دعوت می‌کنید پرجمعیت کنید و صاحب درآمد واقعی شوید
            </p>
            <div className="bg-primary/10 border border-primary/20 rounded-xl p-3 text-right">
              <p className="text-xs font-bold text-primary mb-1">درآمد به چه صورتیه؟</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                اعضای قبیله شما هر خریدی از آکادمی شیوافر کنند تا یک سال ده درصد مبلغ هر خرید برای شماست و به کیف پول شما واریز می‌شود و می‌توانید برداشت کنید
              </p>
            </div>
          </div>

          <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
            <h3 className="font-bold text-sm">اطلاعات قبیله</h3>
            <Input
              placeholder="نام قبیله *"
              value={tribeName}
              onChange={(e) => setTribeName(e.target.value)}
              className="h-11"
            />
            {/* Logo gallery upload */}
            <div>
              <input
                type="file"
                accept="image/*"
                id="tribe-logo-input"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogoUpload(f); }}
              />
              <label htmlFor="tribe-logo-input">
                <div className={`flex items-center gap-3 rounded-xl border cursor-pointer transition-all px-4 py-3 ${logoPreview ? "border-primary/40 bg-primary/5" : "border-input bg-background hover:border-primary/40"}`}>
                  {logoPreview ? (
                    <CachedImage src={logoPreview} alt="لوگو" className="w-10 h-10 rounded-lg object-cover shrink-0" />
                  ) : (
                    <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                      {uploadingLogo ? <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /> : <ImagePlus className="w-5 h-5 text-muted-foreground" />}
                    </div>
                  )}
                  <div className="flex-1 text-right">
                    {uploadingLogo ? (
                      <div className="space-y-1">
                        <p className="text-sm text-muted-foreground">در حال آپلود... {logoUploadProgress}٪</p>
                        <div className="w-full bg-secondary rounded-full h-1.5">
                          <div className="bg-primary h-1.5 rounded-full transition-all duration-200" style={{ width: `${logoUploadProgress}%` }} />
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        {logoPreview ? "عکس انتخاب شد — برای تغییر کلیک کن" : "لطفا یک عکس برای قبیله خود از گالری انتخاب کنید"}
                      </p>
                    )}
                  </div>
                </div>
              </label>
            </div>
            <div className="border-t border-border pt-3">
              <div className="text-xs text-muted-foreground mb-2">برای واریز درآمد شما</div>
              <div className="space-y-2">
                <Input
                  placeholder="نام و نام خانوادگی صاحب حساب (اختیاری)"
                  value={tribeAccountName}
                  onChange={(e) => setTribeAccountName(e.target.value)}
                  className="h-10 text-sm"
                />
                <Input
                  placeholder="شماره کارت (اختیاری)"
                  value={tribeBankCard}
                  onChange={(e) => setTribeBankCard(e.target.value)}
                  dir="ltr"
                  className="h-10 text-sm"
                  maxLength={19}
                />
                <Input
                  placeholder="شماره شبا IR... (اختیاری)"
                  value={tribeSheba}
                  onChange={(e) => setTribeSheba(e.target.value)}
                  dir="ltr"
                  className="h-10 text-sm"
                  maxLength={26}
                />
              </div>
            </div>
            <Button onClick={handleCreate} className="w-full h-12 font-bold" disabled={creating || !tribeName.trim()}>
              {creating ? "در حال ساخت..." : "ساخت قبیله"}
            </Button>
          </div>

        </div>
      )}
    </div>
  );
}
