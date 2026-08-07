import { useRef, useState } from "react";
import { CachedImage } from "@/components/ui/cached-image";
import { Button } from "@/components/ui/button";
import { Copy, Check, Shield, Wallet, Upload, ImageIcon, X, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/persian";

interface CardToCardInfoProps {
  orderId: number;
  cardNumber: string;
  cardHolder: string;
  bankName?: string;
  shebaNumber?: string;
  amount: number;
  trackingCode: string;
  onDone?: () => void;
  walletDeducted?: number;
}

function BlueBankLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-label="بلو بانک">
      <rect width="64" height="64" rx="16" fill="white" fillOpacity="0.15" />
      <path d="M16 32C16 23.163 23.163 16 32 16C40.837 16 48 23.163 48 32C48 40.837 40.837 48 32 48C23.163 48 16 40.837 16 32Z" fill="white" fillOpacity="0.2" />
      <path d="M24 26h6c2.2 0 4 1.8 4 4s-1.8 4-4 4h-6V26z" fill="white" fillOpacity="0.9" />
      <path d="M24 34h7c2.5 0 4.5 2 4.5 4.5S33.5 43 31 43h-7V34z" fill="white" />
      <circle cx="42" cy="26" r="4" fill="white" fillOpacity="0.85" />
    </svg>
  );
}

type UploadState = "idle" | "selected" | "uploading" | "done" | "error";

export function CardToCardInfo({
  orderId, cardNumber, cardHolder, bankName, shebaNumber,
  amount, trackingCode, onDone, walletDeducted,
}: CardToCardInfoProps) {
  const [copiedCard, setCopiedCard] = useState(false);
  const [copiedAmount, setCopiedAmount] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSheba, setCopiedSheba] = useState(false);

  const [uploadState, setUploadState] = useState<UploadState>("idle");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const copy = async (text: string, setCopied: (v: boolean) => void) => {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const el = document.createElement("input");
      el.value = text; document.body.appendChild(el); el.select();
      document.execCommand("copy"); document.body.removeChild(el);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setUploadState("selected");
    setUploadError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploadState("uploading");
    setUploadError(null);
    try {
      const token = localStorage.getItem("shivafer_token") || "";
      const form = new FormData();
      form.append("receipt", selectedFile);
      const res = await fetch(`/api/orders/${orderId}/receipt`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const d = data as { error?: string; message?: string };
        throw new Error(d.error || d.message || "خطا در آپلود");
      }
      setUploadState("done");
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "خطا در آپلود");
      setUploadState("error");
    }
  };

  const handleClearFile = () => {
    setSelectedFile(null);
    setPreviewUrl(null);
    setUploadState("idle");
    setUploadError(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const formattedCard = cardNumber.replace(/(.{4})/g, "$1  ").trim();
  const isBlueBank = (bankName || "").includes("بلو");
  const cardGradient = isBlueBank
    ? "linear-gradient(135deg, #0057FF 0%, #0041CC 45%, #002B99 100%)"
    : "linear-gradient(135deg, #e31837 0%, #b71430 40%, #8b0f24 100%)";

  return (
    <div className="space-y-3" dir="rtl">
      {walletDeducted && walletDeducted > 0 && (
        <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-2.5 flex items-center gap-2">
          <Wallet className="w-4 h-4 text-green-500 shrink-0" />
          <p className="text-xs text-green-700 dark:text-green-300">
            <span className="font-bold">{formatPrice(walletDeducted)}</span> از کیف پول کسر شد.
          </p>
        </div>
      )}

      {/* Bank Card */}
      <button
        type="button"
        className="relative w-full overflow-hidden rounded-2xl p-3.5 select-none active:scale-[0.98] transition-transform text-right focus:outline-none"
        style={{ background: cardGradient }}
        onClick={() => copy(cardNumber, setCopiedCard)}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-12 -left-12 w-48 h-48 rounded-full bg-white/5" />
          <div className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full bg-white/5" />
          {isBlueBank && (
            <>
              <div className="absolute top-0 right-0 w-full h-full opacity-10" style={{ background: "radial-gradient(ellipse at 80% 20%, #60a5fa 0%, transparent 60%)" }} />
              <div className="absolute bottom-0 left-0 w-1/2 h-1/2 opacity-10" style={{ background: "radial-gradient(ellipse at 20% 80%, #93c5fd 0%, transparent 60%)" }} />
            </>
          )}
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-2.5">
            <div className="flex items-center gap-2">
              {isBlueBank
                ? <BlueBankLogo className="w-7 h-7" />
                : <div className="w-7 h-7 rounded-xl bg-white/20 flex items-center justify-center"><span className="text-white font-bold text-xs">🏦</span></div>
              }
              <span className="text-white font-bold text-sm">{bankName || "بانک"}</span>
            </div>
            <div className={cn(
              "flex items-center gap-1.5 rounded-full px-2.5 py-1 backdrop-blur-sm transition-colors",
              copiedCard ? "bg-green-500/30 border border-green-300/40" : "bg-white/15 border border-white/25 animate-pulse"
            )}>
              {copiedCard
                ? <><Check className="w-3 h-3 text-green-200" /><span className="text-[11px] text-green-100 font-bold">کپی شد!</span></>
                : <><Copy className="w-3 h-3 text-white" /><span className="text-[11px] text-white font-bold">تپ = کپی</span></>
              }
            </div>
          </div>
          <div className="mb-2">
            <div className="w-8 h-6 rounded-md border-2 border-white/30 bg-white/10 backdrop-blur-sm grid grid-cols-2 gap-px p-0.5">
              <div className="bg-yellow-300/60 rounded-sm" /><div className="bg-yellow-300/60 rounded-sm" />
              <div className="bg-yellow-300/60 rounded-sm" /><div className="bg-yellow-300/60 rounded-sm" />
            </div>
          </div>
          <div className="mb-2">
            <p className="text-white/50 text-[10px] mb-0.5">شماره کارت</p>
            <p className="text-white text-lg font-bold tracking-[0.15em] font-mono text-center" dir="ltr">{formattedCard}</p>
          </div>
          {shebaNumber && (
            <div className="mb-2 border-t border-white/15 pt-2">
              <div className="flex items-center justify-between mb-0.5">
                <p className="text-white/50 text-[10px]">شماره شبا</p>
                <button type="button" className={cn("flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold transition-colors", copiedSheba ? "bg-green-500/30 text-green-200" : "bg-white/20 text-white")}
                  onClick={(e) => { e.stopPropagation(); copy(shebaNumber.replace(/\s/g, ""), setCopiedSheba); }}>
                  {copiedSheba ? <><Check className="w-3 h-3" /> کپی شد!</> : <><Copy className="w-3 h-3" /> کپی</>}
                </button>
              </div>
              <p className="text-white/90 text-xs font-mono tracking-wider text-center" dir="ltr">{shebaNumber}</p>
            </div>
          )}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-white/50 text-[10px] mb-0.5">به نام</p>
              <p className="text-white text-sm font-bold">{cardHolder}</p>
            </div>
            <div className="flex items-center">
              <div className="w-7 h-7 rounded-full bg-red-500/70 backdrop-blur-sm" />
              <div className="w-7 h-7 rounded-full bg-orange-400/70 backdrop-blur-sm -mr-3.5" />
            </div>
          </div>
        </div>
      </button>

      {/* Amount & Tracking */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="bg-card rounded-xl p-3 border border-border/50 text-right active:scale-[0.97] transition-transform" onClick={() => copy(String(amount), setCopiedAmount)}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">مبلغ واریز</span>
            {copiedAmount ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground/50" />}
          </div>
          <p className="text-lg font-extrabold text-primary">{formatPrice(amount)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">تومان</p>
        </button>
        <button type="button" className="bg-card rounded-xl p-3 border border-border/50 text-right active:scale-[0.97] transition-transform" onClick={() => copy(trackingCode, setCopiedCode)}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-[10px] text-muted-foreground">کد پیگیری</span>
            {copiedCode ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5 text-muted-foreground/50" />}
          </div>
          <p className="text-sm font-bold font-mono" dir="ltr">{trackingCode}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">تپ برای کپی</p>
        </button>
      </div>

      {/* Notes */}
      <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 space-y-1.5">
        <div className="flex items-center gap-1.5">
          <Shield className="w-3.5 h-3.5 text-amber-500 shrink-0" />
          <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400">نکات مهم</p>
        </div>
        <ul className="text-[10px] text-amber-700 dark:text-amber-300 space-y-1 pr-1">
          <li className="flex items-start gap-1.5"><span className="mt-0.5 text-amber-500">●</span>حتماً <span className="font-bold">دقیقاً همین مبلغ</span> را واریز کنید</li>
          <li className="flex items-start gap-1.5"><span className="mt-0.5 text-amber-500">●</span>پس از واریز، سفارش ظرف ۲۴ ساعت بررسی می‌شود</li>
          <li className="flex items-start gap-1.5"><span className="mt-0.5 text-amber-500">●</span>کد پیگیری را نزد خود نگه دارید</li>
        </ul>
      </div>

      {/* Receipt Upload */}
      <div className={cn(
        "rounded-2xl border p-4 space-y-3 transition-colors",
        uploadState === "done"
          ? "bg-green-500/10 border-green-500/30"
          : "bg-card border-border/50"
      )}>
        <div className="flex items-center gap-2">
          {uploadState === "done"
            ? <Check className="w-4 h-4 text-green-500 shrink-0" />
            : <Upload className="w-4 h-4 text-primary shrink-0" />
          }
          <p className="text-sm font-bold">
            {uploadState === "done" ? "رسید ارسال شد" : "آپلود رسید واریز"}
          </p>
        </div>

        {uploadState === "done" ? (
          <p className="text-xs text-green-700 dark:text-green-300">
            رسید شما دریافت شد. پس از بررسی توسط ادمین، دسترسی به محصول فعال می‌شود.
          </p>
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              بعد از واریز، تصویر رسید را آپلود کنید تا سریع‌تر تأیید شود.
            </p>

            {/* File preview */}
            {previewUrl && (
              <div className="relative w-full rounded-xl overflow-hidden border border-border/50 bg-muted/30">
                <CachedImage src={previewUrl} alt="رسید" className="w-full max-h-48 object-contain" />
                <button
                  type="button"
                  className="absolute top-2 left-2 w-7 h-7 bg-background/80 backdrop-blur-sm rounded-full flex items-center justify-center border border-border/50"
                  onClick={handleClearFile}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {uploadError && (
              <p className="text-xs text-red-500">{uploadError}</p>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />

            {(uploadState === "selected" || uploadState === "error" || uploadState === "uploading") ? (
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 rounded-xl text-xs"
                  onClick={handleClearFile}
                  disabled={uploadState === "uploading"}
                >
                  تغییر تصویر
                </Button>
                <Button
                  size="sm"
                  className="flex-1 rounded-xl text-xs font-bold"
                  onClick={handleUpload}
                  disabled={uploadState === "uploading"}
                >
                  {uploadState === "uploading"
                    ? <><Loader2 className="w-3.5 h-3.5 ml-1.5 animate-spin" />در حال ارسال...</>
                    : <><Upload className="w-3.5 h-3.5 ml-1.5" />ارسال رسید</>
                  }
                </Button>
              </div>
            ) : (
              <button
                type="button"
                className="w-full flex items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border/60 py-4 text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors active:scale-[0.98]"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImageIcon className="w-5 h-5" />
                <span className="text-sm font-medium">انتخاب تصویر رسید</span>
              </button>
            )}
          </>
        )}
      </div>

      {onDone && (
        <Button
          className="w-full h-11 rounded-xl text-sm font-bold"
          variant={uploadState === "done" ? "default" : "outline"}
          disabled={uploadState === "uploading"}
          onClick={onDone}
        >
          <Check className="w-5 h-5 ml-2" />
          {uploadState === "uploading"
            ? "در حال آپلود رسید..."
            : uploadState === "done"
              ? "بستن"
              : "واریز کردم — بستن"
          }
        </Button>
      )}
    </div>
  );
}
