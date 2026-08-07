import { db, usersTable } from "@workspace/db";
import { gte, count } from "drizzle-orm";
import { sendEmail } from "./mailer";
import { logger } from "./logger";

const REPORT_TO_EMAIL = "soheil.shivafar@gmail.com";
const ONE_HOUR_MS = 60 * 60 * 1000;

export async function runNewUsersHourlyReport() {
  try {
    const since = new Date(Date.now() - ONE_HOUR_MS);
    const [row] = await db
      .select({ value: count() })
      .from(usersTable)
      .where(gte(usersTable.createdAt, since));

    const newUsersCount = row?.value ?? 0;

    const now = new Date();
    const rangeLabel = `${since.toLocaleString("fa-IR")} تا ${now.toLocaleString("fa-IR")}`;

    const html = `
      <div dir="rtl" style="font-family: Tahoma, sans-serif; padding: 20px;">
        <h2>گزارش ساعتی کاربران جدید — آکادمی شیوافر</h2>
        <p>در یک ساعت اخیر (<strong>${rangeLabel}</strong>) تعداد <strong>${newUsersCount}</strong> کاربر جدید به اپلیکیشن اضافه شده است.</p>
      </div>
    `;

    const sent = await sendEmail(
      REPORT_TO_EMAIL,
      `گزارش ساعتی کاربران جدید: ${newUsersCount} کاربر`,
      html,
    );

    if (sent) {
      logger.info(`[new-users-report] Sent hourly report: ${newUsersCount} new users`);
    }
  } catch (err) {
    logger.error({ err }, "[new-users-report] Failed to run hourly report");
  }
}

export function startNewUsersHourlyReportJob() {
  // Run once shortly after boot, then every hour.
  setTimeout(() => { void runNewUsersHourlyReport(); }, 30_000);
  setInterval(() => { void runNewUsersHourlyReport(); }, ONE_HOUR_MS);
  logger.info("[new-users-report] Hourly new-users email report job scheduled");
}
