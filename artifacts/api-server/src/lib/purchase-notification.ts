import { db, usersTable, coursesTable, productsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { sendEmail } from "./mailer";
import { logger } from "./logger";

const REPORT_TO_EMAIL = "soheil.shivafar@gmail.com";

function toRial(amount: number): string {
  return amount.toLocaleString("fa-IR");
}

export interface PurchaseNotificationInput {
  orderId: number;
  userId: number;
  itemType: string; // "course" | "product" | "avatar"
  itemId: number | string;
  amount: number;
  gateway: string | null; // "zarinpal" | "card_to_card" | ...
  transactionId?: string | null;
  variantKey?: string | null;
}

async function resolveItemName(itemType: string, itemId: number | string): Promise<string> {
  const numericId = Number(itemId);
  if (itemType === "course") {
    const [course] = await db.select({ title: coursesTable.title }).from(coursesTable).where(eq(coursesTable.id, numericId)).limit(1);
    return course?.title ?? `دوره #${itemId}`;
  }
  if (itemType === "product") {
    const [product] = await db.select({ title: productsTable.title }).from(productsTable).where(eq(productsTable.id, numericId)).limit(1);
    return product?.title ?? `محصول #${itemId}`;
  }
  if (itemType === "avatar") {
    return "آواتار دستیار هوشمند";
  }
  return `${itemType} #${itemId}`;
}

export async function sendPurchaseNotificationEmail(input: PurchaseNotificationInput): Promise<void> {
  try {
    const [buyer] = await db
      .select({ name: usersTable.name, phone: usersTable.phone })
      .from(usersTable)
      .where(eq(usersTable.id, input.userId))
      .limit(1);

    const itemName = await resolveItemName(input.itemType, input.itemId);
    const now = new Date();
    const dateLabel = now.toLocaleString("fa-IR");

    const gatewayLabel = input.gateway === "zarinpal"
      ? "زرین‌پال"
      : input.gateway === "card_to_card"
        ? "کارت به کارت"
        : input.gateway;

    const categoryLabel = input.itemType === "course"
      ? "دوره آموزشی"
      : input.itemType === "product"
        ? "محصول"
        : input.itemType === "avatar"
          ? "آواتار دستیار"
          : input.itemType;

    const html = `
      <div dir="rtl" style="font-family: Tahoma, sans-serif; padding: 20px;">
        <h2>🛒 خرید جدید — آکادمی شیوافر</h2>
        <table style="border-collapse: collapse; width: 100%; max-width: 500px;">
          <tr><td style="padding:6px 10px; font-weight:bold;">محصول/دوره:</td><td style="padding:6px 10px;">${itemName}</td></tr>
          <tr><td style="padding:6px 10px; font-weight:bold;">دسته‌بندی:</td><td style="padding:6px 10px;">${categoryLabel}</td></tr>
          <tr><td style="padding:6px 10px; font-weight:bold;">مبلغ پرداختی:</td><td style="padding:6px 10px;">${toRial(input.amount)} تومان</td></tr>
          <tr><td style="padding:6px 10px; font-weight:bold;">درگاه پرداخت:</td><td style="padding:6px 10px;">${gatewayLabel}</td></tr>
          <tr><td style="padding:6px 10px; font-weight:bold;">شماره سفارش:</td><td style="padding:6px 10px;">${input.orderId}</td></tr>
          <tr><td style="padding:6px 10px; font-weight:bold;">کد رهگیری:</td><td style="padding:6px 10px;">${input.transactionId ?? "-"}</td></tr>
          <tr><td style="padding:6px 10px; font-weight:bold;">خریدار:</td><td style="padding:6px 10px;">${buyer?.name ?? "-"} (${buyer?.phone ?? "-"})</td></tr>
          <tr><td style="padding:6px 10px; font-weight:bold;">تاریخ و ساعت:</td><td style="padding:6px 10px;">${dateLabel}</td></tr>
        </table>
      </div>
    `;

    const sent = await sendEmail(
      REPORT_TO_EMAIL,
      `خرید جدید: ${itemName} — ${toRial(input.amount)} تومان`,
      html,
    );

    if (sent) {
      logger.info(`[purchase-notification] Sent purchase email for order #${input.orderId}`);
    }
  } catch (err) {
    logger.error({ err }, "[purchase-notification] Failed to send purchase email");
  }
}
