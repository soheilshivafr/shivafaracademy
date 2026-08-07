export interface PaymentInitResult {
  success: boolean;
  authority?: string;
  paymentUrl?: string;
  error?: string;
}

export interface PaymentVerifyResult {
  success: boolean;
  refId?: string;
  error?: string;
}

export class ZarinPalGateway {
  readonly name = "zarinpal";
  private merchantId: string;
  private sandbox: boolean;

  constructor(merchantId?: string, sandbox = false) {
    this.merchantId = merchantId || process.env.ZARINPAL_MERCHANT_ID || "";
    this.sandbox = sandbox;
  }

  private getApiUrl() {
    return this.sandbox
      ? "https://sandbox.zarinpal.com"
      : "https://api.zarinpal.com";
  }

  private getStartPayUrl(authority: string) {
    const base = this.sandbox
      ? "https://sandbox.zarinpal.com"
      : "https://www.zarinpal.com";
    return `${base}/pg/StartPay/${authority}`;
  }

  async initiatePayment(
    amount: number,
    description: string,
    callbackUrl: string,
    orderId: number,
  ): Promise<PaymentInitResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${this.getApiUrl()}/pg/v4/payment/request.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          merchant_id: this.merchantId,
          amount: amount * 10,
          description,
          callback_url: callbackUrl,
          metadata: { order_id: String(orderId) },
        }),
      });

      clearTimeout(timeout);
      const data = await response.json() as { data?: { code?: number; authority?: string }; errors?: { message?: string; validations?: string[]; code?: number } };

      if (data.data?.authority && (data.data.code === 100 || data.data.code === 101)) {
        const paymentUrl = this.getStartPayUrl(data.data.authority);
        return { success: true, authority: data.data.authority, paymentUrl };
      }

      // Error -35: active transaction exists — Zarinpal returns the existing authority
      const errCode = data.errors?.code ?? data.data?.code;
      if (errCode === -35 && data.data?.authority) {
        const paymentUrl = this.getStartPayUrl(data.data.authority);
        return { success: true, authority: data.data.authority, paymentUrl };
      }

      const errMsg =
        (data.errors as { message?: string } | undefined)?.message ||
        data.errors?.validations?.[0] ||
        "خطا در ایجاد تراکنش";
      return { success: false, error: errMsg };
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      const msg =
        e?.name === "AbortError"
          ? "درگاه زرین‌پال پاسخ نداد (timeout)"
          : "خطا در ارتباط با درگاه پرداخت";
      return { success: false, error: msg };
    }
  }

  async verifyPayment(authority: string, amount: number): Promise<PaymentVerifyResult> {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${this.getApiUrl()}/pg/v4/payment/verify.json`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          merchant_id: this.merchantId,
          amount: amount * 10,
          authority,
        }),
      });

      clearTimeout(timeout);
      const data = await response.json() as { data?: { code?: number; ref_id?: number }; errors?: { message?: string } };

      if (data.data && (data.data.code === 100 || data.data.code === 101)) {
        return { success: true, refId: String(data.data.ref_id) };
      }

      return { success: false, error: data.errors?.message || "پرداخت تأیید نشد" };
    } catch (err: unknown) {
      return { success: false, error: "خطا در تأیید پرداخت" };
    }
  }
}

export const zarinpal = new ZarinPalGateway();

/** ساخت نمونه پویا با کلید از دیتابیس (اولویت بالاتر از env var) */
export function createZarinPalGateway(merchantId?: string | null, sandbox?: boolean): ZarinPalGateway {
  return new ZarinPalGateway(merchantId || undefined, sandbox ?? false);
}
