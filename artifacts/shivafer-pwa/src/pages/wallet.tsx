import { useAuth } from "@/lib/auth";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Wallet, ArrowDownCircle, CheckCircle2, Clock, Copy, Download, Info, Crown, Share2, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Link, Redirect } from "wouter";

const API = import.meta.env.VITE_API_BASE_URL ?? "";
const MIN_WITHDRAWAL = 500_000;

const SHARE_APPS = [
  { name: "تلگرام", icon: "telegram", color: "#2AABEE", url: (t: string) => `https://t.me/share/url?text=${encodeURIComponent(t)}` },
  { name: "واتساپ", icon: "whatsapp", color: "#25D366", url: (t: string) => `https://wa.me/?text=${encodeURIComponent(t)}` },
  { name: "اینستاگرام", icon: "instagram", color: "#E1306C", url: (_t: string) => `https://www.instagram.com/` },
  { name: "روبیکا", icon: "rubika", color: "#7B5EA7", url: (t: string) => `rubika://share?text=${encodeURIComponent(t)}` },
  { name: "بله", icon: "bale", color: "#1B7FC4", url: (t: string) => `bale://share?text=${encodeURIComponent(t)}` },
  { name: "ایتا", icon: "eitaa", color: "#CC3333", url: (t: string) => `eitaa://msg?text=${encodeURIComponent(t)}` },
  { name: "سروش", icon: "soroush", color: "#F5A623", url: (t: string) => `soroush://send?text=${encodeURIComponent(t)}` },
];

function ShareModal({ amount, onClose }: { amount: number; onClose: () => void }) {
  const text = `من ${amount.toLocaleString("fa")} تومان از کیف پول آکادمی شیوافر برداشت کردم! 🎉\nبه آکادمی شیوافر بپیوندید: https://shivafaracademy.ir`;
  const [copied, setCopied] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl p-5 space-y-4" onClick={e => e.stopPropagation()}>
        <h3 className="text-center font-black text-lg">اشتراک‌گذاری برداشت</h3>
        <p className="text-sm text-muted-foreground text-center">موفقیت خود را با دیگران به اشتراک بگذارید</p>
        <div className="grid grid-cols-4 gap-3">
          {SHARE_APPS.map(app => (
            <a key={app.name} href={app.url(text)} target="_blank" rel="noreferrer"
              className="flex flex-col items-center gap-1 py-2 rounded-xl bg-secondary active:scale-95 transition-transform">
              <div className="w-10 h-10 rounded-full flex items-center justify-center text-white text-xl font-bold" style={{ background: app.color }}>
                {app.name[0]}
              </div>
              <span className="text-xs text-muted-foreground">{app.name}</span>
            </a>
          ))}
          <button onClick={() => { navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="flex flex-col items-center gap-1 py-2 rounded-xl bg-secondary active:scale-95 transition-transform">
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

function KycModal({ token, onClose, onSuccess }: { token: string; onClose: () => void; onSuccess: () => void }) {
  const [nationalIdImg, setNationalIdImg] = useState("");
  const [selfieImg, setSelfieImg] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!nationalIdImg || !selfieImg) { toast.error("هر دو تصویر الزامی است"); return; }
    setSubmitting(true);
    try {
      const res = await fetch(`${API}/api/kyc/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ nationalIdImg, selfieImg }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast.success("مدارک ارسال شد. پس از تأیید مطلع می‌شوید");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message ?? "خطا در ارسال مدارک");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-end" onClick={onClose}>
      <div className="w-full bg-background rounded-t-3xl p-5 space-y-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h3 className="text-center font-black text-lg">احراز هویت (KYC)</h3>
        <p className="text-sm text-muted-foreground text-center">برای برداشت از کیف پول، احراز هویت الزامی است</p>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-bold block mb-1">لینک تصویر کارت ملی</label>
            <Input placeholder="URL تصویر کارت ملی" value={nationalIdImg} onChange={e => setNationalIdImg(e.target.value)} dir="ltr" />
          </div>
          <div>
            <label className="text-sm font-bold block mb-1">لینک سلفی با کارت ملی</label>
            <Input placeholder="URL سلفی با کارت ملی" value={selfieImg} onChange={e => setSelfieImg(e.target.value)} dir="ltr" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">ابتدا تصویر را در پروفایل آپلود کرده و لینک آن را اینجا وارد کنید</p>
        <div className="flex gap-2">
          <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
            {submitting ? "ارسال..." : "ارسال مدارک"}
          </Button>
          <Button variant="outline" onClick={onClose}>انصراف</Button>
        </div>
      </div>
    </div>
  );
}

export default function WalletPage() {
  const { token } = useAuth();
  const [walletData, setWalletData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawing, setWithdrawing] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [shareAmount, setShareAmount] = useState(0);
  const [showKyc, setShowKyc] = useState(false);

  // Bank info state
  const [bankCard, setBankCard] = useState("");
  const [sheba, setSheba] = useState("");
  const [accountName, setAccountName] = useState("");
  const [savingBank, setSavingBank] = useState(false);
  const [bankLoaded, setBankLoaded] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);
  const [myTribe, setMyTribe] = useState<any>(null);

  if (!token) return <Redirect to="/login" />;

  const fetchWallet = () => {
    fetch(`${API}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(setWalletData)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  const fetchBankInfo = () => {
    fetch(`${API}/api/auth/bank-info`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => {
        setBankCard(d.bankCard ?? "");
        setSheba(d.sheba ?? "");
        setAccountName(d.accountName ?? "");
        setBankLoaded(true);
      })
      .catch(() => setBankLoaded(true));
  };

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

  useEffect(() => {
    fetchWallet();
    fetchBankInfo();
    fetch(`${API}/api/tribe/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => setMyTribe(d || null)).catch(() => {});
  }, [token]);

  const handleWithdraw = async () => {
    const amount = parseInt(withdrawAmount.replace(/[^\d]/g, ""));
    if (!amount || amount < MIN_WITHDRAWAL) {
      toast.error(`حداقل مبلغ برداشت ${MIN_WITHDRAWAL.toLocaleString("fa")} تومان است`);
      return;
    }
    if (amount > (walletData?.balance ?? 0)) {
      toast.error("موجودی کافی نیست");
      return;
    }
    setWithdrawing(true);
    try {
      const res = await fetch(`${API}/api/wallet/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ amount }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.error === "kyc_required") { setShowKyc(true); return; }
        throw new Error(data.error);
      }
      toast.success("درخواست برداشت ثبت شد");
      setShareAmount(amount);
      setShowShare(true);
      setWithdrawAmount("");
      fetchWallet();
    } catch (err: any) {
      toast.error(err.message ?? "خطا در ثبت درخواست");
    } finally {
      setWithdrawing(false);
    }
  };

  if (loading) {
    return <div className="p-6 pt-10 max-w-md mx-auto space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-24 bg-card rounded-2xl animate-pulse" />)}
    </div>;
  }

  const balance = walletData?.balance ?? 0;
  const transactions: any[] = walletData?.transactions ?? [];
  const hasPending = walletData?.hasPendingWithdrawal ?? false;

  return (
    <div className="p-4 pt-8 pb-24 max-w-md mx-auto space-y-5" dir="rtl">
      {showShare && <ShareModal amount={shareAmount} onClose={() => setShowShare(false)} />}
      {showKyc && <KycModal token={token} onClose={() => setShowKyc(false)} onSuccess={() => { setShowKyc(false); fetchWallet(); }} />}

      <div className="flex items-center gap-2 mb-2">
        <Wallet className="text-primary w-6 h-6" />
        <h1 className="text-2xl font-black">کیف پول</h1>
      </div>

      {/* Balance card */}
      <Card className="bg-gradient-to-bl from-primary/20 to-card border-primary/30">
        <CardContent className="p-6">
          <div className="text-sm text-muted-foreground mb-2">موجودی کیف پول</div>
          <div className="flex items-baseline gap-2" dir="rtl">
            <div className="text-4xl font-black text-primary">
              {balance.toLocaleString("fa")}
            </div>
            <div className="text-base font-bold text-muted-foreground">تومان</div>
          </div>
        </CardContent>
      </Card>

      {/* Earn with tribe */}
      <Link href="/tribe">
        <div className="relative overflow-hidden rounded-2xl p-4 bg-gradient-to-l from-emerald-600/15 to-teal-600/15 border border-emerald-500/25 active:scale-[0.97] transition-transform cursor-pointer">
          <div className="absolute -top-8 -right-8 w-28 h-28 bg-emerald-500/10 rounded-full blur-2xl" />
          <div className="absolute -bottom-4 -left-4 w-20 h-20 bg-teal-500/10 rounded-full blur-2xl" />
          <div className="relative flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 shrink-0">
              {myTribe ? <Share2 className="w-5 h-5 text-white" /> : <Crown className="w-5 h-5 text-white" />}
            </div>
            <div className="flex-1 text-right">
              <div className="flex items-center gap-1.5 mb-0.5">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                <p className="font-black text-sm text-foreground">
                  {myTribe ? "لینک قبیله‌ات رو بفرست، درآمد بساز" : "قبیله بساز و درآمدزایی کن"}
                </p>
              </div>
              <p className="text-xs text-muted-foreground">
                {myTribe
                  ? `قبیله «${myTribe.name}» — ۱۰٪ از هر خرید اعضا به کیف پولت واریز می‌شه`
                  : "با دعوت از دوستان ۱۰٪ کمیسیون از هر خریدشان دریافت کن"}
              </p>
            </div>
            <svg className="w-4 h-4 text-muted-foreground rotate-180 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Withdraw */}
      <div className="bg-card border border-card-border rounded-2xl p-5 space-y-3">
        <h3 className="font-bold flex items-center gap-2"><ArrowDownCircle className="w-4 h-4 text-primary" /> درخواست برداشت</h3>
        {hasPending ? (
          <div className="flex items-center gap-2 text-sm text-amber-500 bg-amber-500/10 rounded-xl p-3">
            <Clock className="w-4 h-4 shrink-0" />
            یک درخواست برداشت در حال بررسی است
          </div>
        ) : (
          <>
            <Input
              placeholder={`حداقل ${MIN_WITHDRAWAL.toLocaleString("fa")} تومان`}
              value={withdrawAmount}
              onChange={e => setWithdrawAmount(e.target.value)}
              type="number"
              dir="ltr"
            />
            <Button className="w-full" onClick={handleWithdraw} disabled={withdrawing || balance < MIN_WITHDRAWAL}>
              {withdrawing ? "در حال ثبت..." : "ثبت درخواست برداشت"}
            </Button>
            {balance < MIN_WITHDRAWAL && (
              <p className="text-xs text-muted-foreground text-center">
                موجودی شما برای برداشت کافی نیست (حداقل {MIN_WITHDRAWAL.toLocaleString("fa")} تومان)
              </p>
            )}
          </>
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

      {/* Transactions */}
      <div>
        <h3 className="font-bold mb-3 text-sm text-muted-foreground">تاریخچه تراکنش‌ها</h3>
        {transactions.length === 0 ? (
          <div className="bg-card border border-card-border rounded-xl p-5 text-center text-sm text-muted-foreground">
            هنوز تراکنشی ثبت نشده
          </div>
        ) : (
          <div className="space-y-2">
            {transactions.map((t: any) => (
              <div key={t.id} className="bg-card border border-card-border rounded-xl px-4 py-3 flex justify-between items-center">
                <div>
                  <div className={`text-sm font-bold ${t.amount > 0 ? "text-green-500" : "text-red-400"}`}>
                    {t.amount > 0 ? "+" : ""}{t.amount.toLocaleString("fa")} تومان
                  </div>
                  <div className="text-xs text-muted-foreground">{t.description}</div>
                </div>
                <div className="text-left">
                  <div className="text-xs text-muted-foreground">{new Date(t.createdAt).toLocaleDateString("fa-IR")}</div>
                  {t.type === "commission" ? (
                    <CheckCircle2 className="w-4 h-4 text-green-500 mr-auto" />
                  ) : (
                    <ArrowDownCircle className="w-4 h-4 text-primary mr-auto" />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
