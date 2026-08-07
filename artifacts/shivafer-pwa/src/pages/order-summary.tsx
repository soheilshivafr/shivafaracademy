import { useState, useEffect } from "react";
import { useLocation, Redirect } from "wouter";
import { CachedImage } from "@/components/ui/cached-image";
import { useAuth } from "@/lib/auth";
import { formatPrice } from "@/lib/persian";
import { Button } from "@/components/ui/button";
import { ChevronRight, ShoppingBag, PlayCircle, Loader2, AlertCircle, CheckCircle2, Tag, Wallet, Gift } from "lucide-react";
import { toast } from "sonner";

const API = import.meta.env.VITE_API_BASE_URL ?? "";

// Hidden gift code (hardcoded in source, never displayed). Entering it at MTP
// checkout deducts a flat extra discount from the payable amount.
const GIFT_CODE = "bagheri7430";
const GIFT_DISCOUNT = 200_000;

export default function OrderSummary() {
  const { token } = useAuth();
  const [, navigate] = useLocation();

  const params = new URLSearchParams(window.location.search);
  const itemType = params.get("type") as "course" | "product" | null;
  const itemId = Number(params.get("id"));
  const variantKey = params.get("variant") || null;

  const [item, setItem] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState(false);
  const [wallet, setWallet] = useState<{ balance: number } | null>(null);
  const [mtpVariant, setMtpVariant] = useState<{ label: string; fullPrice: number; price: number; discountPercent: number } | null>(null);
  const [giftInput, setGiftInput] = useState("");
  const [giftApplied, setGiftApplied] = useState(false);
  const [giftMsg, setGiftMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [itemDiscount, setItemDiscount] = useState<{ percent: number; active: boolean } | null>(null);

  const applyGift = () => {
    if (giftInput.trim().toLowerCase() === GIFT_CODE) {
      setGiftApplied(true);
      setGiftMsg({ ok: true, text: `کد هدیه اعمال شد ✅ ${formatPrice(GIFT_DISCOUNT)} تخفیف بیشتر` });
    } else {
      setGiftApplied(false);
      setGiftMsg({ ok: false, text: "کد هدیه نامعتبر است" });
    }
  };

  useEffect(() => {
    if (!itemType || !itemId || !token) { setLoading(false); return; }
    const endpoint = itemType === "course" ? `/api/courses/${itemId}` : `/api/products/${itemId}`;
    Promise.all([
      fetch(`${API}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(`${API}/api/wallet/me`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).catch(() => null),
      variantKey
        ? fetch(`${API}/api/mtp/pricing`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
      !variantKey
        ? fetch(`${API}/api/discounts/${itemType}/${itemId}`, { headers: { Authorization: `Bearer ${token}` } }).then(r => r.ok ? r.json() : null).catch(() => null)
        : Promise.resolve(null),
    ]).then(([itemData, walletData, pricing, discountData]) => {
      setItem(itemData);
      setWallet(walletData);
      const mtpIds: number[] = pricing?.courseIds ?? (pricing?.courseId ? [pricing.courseId] : []);
      if (variantKey && pricing && mtpIds.includes(itemId)) {
        const v = pricing.variants.find((x: any) => x.key === variantKey);
        if (v) setMtpVariant({ label: v.label, fullPrice: v.fullPrice, price: v.price, discountPercent: pricing.discount?.active ? pricing.discount.percent : 0 });
      }
      if (!variantKey && discountData?.active && discountData.percent > 0) {
        setItemDiscount({ percent: discountData.percent, active: true });
      }
    }).finally(() => setLoading(false));
  }, [itemType, itemId, token, variantKey]);

  const basePrice = mtpVariant ? mtpVariant.price : (item?.price ?? 0);
  const discountedBase = !mtpVariant && itemDiscount?.active && itemDiscount.percent > 0
    ? Math.round(basePrice * (1 - itemDiscount.percent / 100) / 1000) * 1000
    : basePrice;
  const price = discountedBase;
  const giftActive = mtpVariant != null && giftApplied;
  const finalPrice = giftActive ? Math.max(0, price - GIFT_DISCOUNT) : price;

  const handlePay = async () => {
    if (!token || !itemType || !itemId) return;
    setPaying(true);
    try {
      const res = await fetch(`${API}/api/payment/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ itemType, itemId, ...(variantKey ? { variantKey } : {}), ...(giftActive ? { giftCode: GIFT_CODE } : {}) }),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data.error ?? "خطا در ایجاد سفارش"); return; }
      if (data.paymentUrl) {
        window.location.href = data.paymentUrl;
      }
    } catch {
      toast.error("خطا در اتصال به سرور");
    } finally {
      setPaying(false);
    }
  };

  if (!token) return <Redirect to="/login" />;

  if (!itemType || !itemId) {
    return (
      <div className="p-6 pt-16 flex flex-col items-center gap-4 text-center">
        <AlertCircle className="w-12 h-12 text-destructive opacity-60" />
        <p className="text-muted-foreground text-sm">اطلاعات سفارش نامعتبر است</p>
        <Button variant="outline" onClick={() => navigate("/products")}>بازگشت</Button>
      </div>
    );
  }

  const walletBalance = wallet?.balance ?? 0;

  return (
    <div className="p-4 pt-6 pb-24 max-w-md mx-auto space-y-5" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-2">
        <button onClick={() => { if (window.history.length > 1) window.history.back(); else navigate("/products"); }} className="w-9 h-9 rounded-xl bg-card border border-card-border flex items-center justify-center active:scale-90 transition-transform">
          <ChevronRight className="w-5 h-5" />
        </button>
        <h1 className="text-xl font-black">خلاصه سفارش</h1>
      </div>

      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-card rounded-2xl animate-pulse" />)}
        </div>
      ) : !item ? (
        <div className="flex flex-col items-center gap-4 py-16 text-center">
          <AlertCircle className="w-12 h-12 text-destructive opacity-60" />
          <p className="text-muted-foreground text-sm">محصول یافت نشد</p>
          <Button variant="outline" onClick={() => navigate("/products")}>بازگشت</Button>
        </div>
      ) : (
        <>
          {/* Product card */}
          <div className="bg-card border border-card-border rounded-2xl overflow-hidden">
            <div className="flex gap-4 p-4">
              {item.image || item.thumbnail ? (
                <CachedImage src={item.image || item.thumbnail} alt={item.title} className="w-20 h-20 rounded-xl object-cover shrink-0" />
              ) : (
                <div className="w-20 h-20 rounded-xl bg-secondary flex items-center justify-center shrink-0">
                  {itemType === "course"
                    ? <PlayCircle className="w-8 h-8 text-muted-foreground opacity-40" />
                    : <ShoppingBag className="w-8 h-8 text-muted-foreground opacity-40" />}
                </div>
              )}
              <div className="flex-1 space-y-1">
                <div className="text-xs text-muted-foreground">{itemType === "course" ? "دوره آموزشی" : "محصول"}</div>
                <h2 className="font-black text-base leading-snug">{item.title}</h2>
                {item.description && (
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{item.description}</p>
                )}
              </div>
            </div>
          </div>

          {/* Price breakdown */}
          <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm flex items-center gap-2">
              <Tag className="w-4 h-4 text-primary" />
              جزئیات پرداخت
            </h3>
            <div className="space-y-2 text-sm">
              {mtpVariant && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">گزینه انتخابی</span>
                  <span className="font-bold">{mtpVariant.label}</span>
                </div>
              )}
              {mtpVariant && mtpVariant.discountPercent > 0 && mtpVariant.price < mtpVariant.fullPrice && (
                <>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">قیمت اصلی</span>
                    <span className="text-muted-foreground line-through" dir="rtl">{formatPrice(mtpVariant.fullPrice)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">تخفیف</span>
                    <span className="font-bold text-green-500">{mtpVariant.discountPercent}٪</span>
                  </div>
                </>
              )}
              {!mtpVariant && (
                <>
                  {itemDiscount?.active && itemDiscount.percent > 0 && (item?.price ?? 0) > 0 ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">قیمت اصلی</span>
                        <span className="text-muted-foreground line-through" dir="rtl">{formatPrice(item?.price ?? 0)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">تخفیف ویژه</span>
                        <span className="font-bold text-green-500">{itemDiscount.percent}٪</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-muted-foreground">قیمت با تخفیف</span>
                        <span className="font-bold text-primary" dir="rtl">{formatPrice(price)}</span>
                      </div>
                    </>
                  ) : (
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">قیمت</span>
                      <span className="font-bold" dir="rtl">{formatPrice(price)}</span>
                    </div>
                  )}
                </>
              )}

              {/* Gift code — MTP registration only */}
              {mtpVariant && (
                <div className="border-t border-border pt-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Gift className="w-4 h-4 text-primary" />
                    <span className="text-sm font-bold">کد هدیه</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    اگر کد هدیه دارید آن را وارد کنید و {formatPrice(GIFT_DISCOUNT)} تخفیف بیشتر بگیرید. (اختیاری)
                  </p>
                  <div className="flex gap-2">
                    <input
                      value={giftInput}
                      onChange={(e) => { setGiftInput(e.target.value); setGiftApplied(false); setGiftMsg(null); }}
                      placeholder="کد هدیه"
                      className="flex-1 h-11 rounded-xl bg-secondary border border-card-border px-3 text-sm outline-none focus:border-primary"
                      dir="ltr"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      onClick={applyGift}
                      disabled={!giftInput.trim() || giftApplied}
                      className="h-11 px-4 rounded-xl shrink-0"
                    >
                      اعمال کد
                    </Button>
                  </div>
                  {giftMsg && (
                    <p className={`text-xs font-bold ${giftMsg.ok ? "text-green-500" : "text-destructive"}`}>
                      {giftMsg.text}
                    </p>
                  )}
                </div>
              )}

              {giftActive && (
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">تخفیف کد هدیه</span>
                  <span className="font-bold text-green-500" dir="rtl">−{formatPrice(GIFT_DISCOUNT)}</span>
                </div>
              )}

              <div className="border-t border-border pt-2 flex justify-between items-center">
                <span className="font-black">مبلغ قابل پرداخت</span>
                <span className="font-black text-lg text-primary" dir="rtl">{formatPrice(finalPrice)}</span>
              </div>
            </div>
          </div>

          {/* Wallet info */}
          {walletBalance > 0 && (
            <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/20 rounded-xl px-4 py-3">
              <Wallet className="w-4 h-4 text-green-500 shrink-0" />
              <div className="text-sm">
                <span className="text-muted-foreground">موجودی کیف پول: </span>
                <span className="font-bold text-green-500" dir="rtl">{walletBalance.toLocaleString("fa-IR")} تومان</span>
              </div>
            </div>
          )}

          {/* What you get */}
          <div className="bg-card border border-card-border rounded-2xl p-4 space-y-3">
            <h3 className="font-bold text-sm">چه چیزی دریافت می‌کنید</h3>
            <ul className="space-y-2">
              {itemType === "course" ? (
                <>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    دسترسی کامل به تمام جلسات دوره
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    دسترسی مادام‌العمر
                  </li>
                  <li className="flex items-center gap-2 text-sm text-muted-foreground">
                    <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                    پشتیبانی آنلاین
                  </li>
                </>
              ) : (
                <li className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="w-4 h-4 text-green-500 shrink-0" />
                  دسترسی فوری به محصول
                </li>
              )}
            </ul>
          </div>

          {/* Pay button */}
          <Button
            onClick={handlePay}
            disabled={paying}
            className="w-full h-14 text-base font-black rounded-2xl gap-2"
          >
            {paying ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> در حال انتقال...</>
            ) : (
              <>پرداخت {formatPrice(finalPrice)}</>
            )}
          </Button>

          <p className="text-xs text-center text-muted-foreground pb-2">
            پس از کلیک، به درگاه امن زرین‌پال منتقل می‌شوید
          </p>
        </>
      )}
    </div>
  );
}
