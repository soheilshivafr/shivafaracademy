# Shivafer Academy — Source Package

این بسته شامل سورس کامل قابل توسعه پروژه است:

- `artifacts/shivafer-pwa` — PWA کاربر
- `artifacts/admin-panel` — پنل مدیریت
- `artifacts/api-server` — API و منطق Backend
- `lib/db` — schema، migrationها و Drizzle
- `lib/api-spec` — قرارداد OpenAPI
- `lib/api-client-react` — client و hookهای تولیدشده
- `lib/api-zod` — schemaهای Zod تولیدشده
- `lib/scoring-engine` — موتور امتیازدهی مشترک
- `lib/integrations-openai-ai-*` — کتابخانه‌های AI
- `scripts` — ابزارهای migration و smoke test

## شروع توسعه

```bash
pnpm install --frozen-lockfile
pnpm run typecheck
pnpm --filter @workspace/api-server run build
```

## اجرای سرویس‌ها

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/shivafer-pwa run dev
pnpm --filter @workspace/admin-panel run dev
```

## Recommendation Engine

هسته Recommendation در این فایل‌ها قرار دارد:

- `artifacts/api-server/src/lib/recommendation-engine.ts`
- `artifacts/api-server/src/lib/recommendation-service.ts`
- `artifacts/api-server/src/lib/recommendation-engine.test.ts`
- `lib/db/src/schema/assessment-rules.ts`
- `lib/api-spec/openapi.yaml`

## عمداً داخل بسته نیست

- `node_modules`
- خروجی‌های `dist` و `build`
- cache و فایل‌های موقت
- فایل‌های محیطی دارای secret

بعد از استخراج، وابستگی‌ها با `pnpm install --frozen-lockfile` نصب می‌شوند.
