# Shivafer Academy

پلتفرم آموزشی شیوافر با PWA کاربر، پنل مدیریت، API، کتابخانه‌های مشترک و موتور امتیازدهی تست‌ها.

## Run & Operate

- `pnpm install --frozen-lockfile` — نصب وابستگی‌ها
- `pnpm --filter @workspace/shivafer-pwa run dev` — اجرای PWA
- `pnpm --filter @workspace/admin-panel run dev` — اجرای پنل مدیریت
- `pnpm --filter @workspace/api-server run dev` — اجرای API
- `pnpm run typecheck` — بررسی TypeScript پروژه
- `pnpm --filter @workspace/shivafer-pwa run build` — build PWA
- `pnpm --filter @workspace/admin-panel run build` — build پنل مدیریت
- `pnpm --filter @workspace/api-server run build` — build bundle مستقل API

## Product

- PWA فارسی و RTL برای کاربران
- مدیریت کاربران، محصولات، دوره‌ها، تست‌ها و محتوای آموزشی
- API Express با PostgreSQL و Drizzle
- موتور امتیازدهی تست با امتیاز نهایی، شاخص‌ها و سطح کاربر
- صفحه نتیجه تست Responsive با خلاصه، امتیاز نهایی، سطح کاربر و نمودار عملکرد
- گزارش AI در صفحه نتیجه عمداً فعال نشده و برای توسعهٔ بعدی جدا نگه داشته شده است

## Architecture decisions

- قراردادهای API در `lib/api-spec/openapi.yaml` نگهداری و با Orval تولید می‌شوند.
- API production به صورت bundle مستقل ESM در `artifacts/api-server/dist/` ساخته می‌شود.
- خروجی deploy وب مستقیماً از `dist/public/` به ریشهٔ PWA و Admin منتقل می‌شود.
- اطلاعات سطح نهایی تست از `globalLevels` تست خوانده می‌شود و در نبود آن از شاخص اصلی fallback می‌گیرد.

## User preferences

- صفحه نتیجه حرفه‌ای، فارسی، RTL و کاملاً Responsive باشد.
- در این مرحله گزارش AI اضافه نشود.
- خروجی سورس و build کم‌حجم و مناسب توسعه و deploy تحویل شود.

## Gotchas

- buildهای Vite به `PORT` و `BASE_PATH` نیاز دارند.
- API production باید workerهای Pino کنار `index.mjs` را نگه دارد.
- قبل از deploy، `DATABASE_URL` و متغیرهای محیطی راهنمای `DEPLOY_GUIDE.md` تنظیم شوند.