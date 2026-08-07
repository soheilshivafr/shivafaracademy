# راهنمای کامل دیپلوی — شیوافر آکادمی

---

## اطلاعات سرور

| مشخصه | مقدار |
|--------|-------|
| OS | Ubuntu 22.04.5 LTS |
| IP | 194.180.11.215 |
| دامنه اصلی | shivafaracademy.ir |
| دامنه بتا | beta.shivafaracademy.ir |
| Node.js | v20.20.2 |
| پورت API | 8090 |
| سرویس | `shivafer-api` (systemd) |

---

## مسیرهای مهم سرور

| بخش | مسیر |
|-----|------|
| API dist (اجرایی) | `/var/www/shivafer-deploy/artifacts/api-server/dist/` |
| PWA (فایل‌های استاتیک) | `/var/www/html/` |
| Admin Panel | `/var/www/admin/` |
| فایل ENV | `/var/www/shivafer-deploy/.env` |
| آپلودهای کاربران | `/var/www/uploads/` |
| Static Assets (canonical — served by Express) | `/var/www/static-assets/` |
| تنظیمات nginx | `/etc/nginx/sites-enabled/shivafer` |
| تنظیمات systemd | `/etc/systemd/system/shivafer-api.service` |

---

## ساختار Nginx و Static Assets

مسیر canonical تمام فایل‌های استاتیک در Production این است:

```text
/var/www/static-assets
```

سرو فایل‌های استاتیک فقط توسط Express انجام می‌شود. Nginx برای درخواست‌های
مربوط به Static Assets صرفاً به Express Proxy می‌کند و نباید فایل تصویر را
مستقیماً از دیسک بخواند.

```
shivafaracademy.ir:443
  /api          → proxy → localhost:8090 (shivafer-api)
  /api/uploads  → alias /var/www/uploads/
  /admin/       → alias /var/www/admin/
  /r/           → proxy → localhost:8090 (tracking links)
  /static-assets/ → proxy → localhost:8090/static-assets/
  /             → root /var/www/html/ (PWA)
```

برای Static Assets هیچ `alias` اختصاصی برای فایل‌های تکی یا پوشه‌های تصاویر
نباید در Nginx وجود داشته باشد؛ از جمله برای avatarها، channel background،
tutorial cards، icons یا هر فایل WebP دیگر. مسیر `/static-assets/` باید فقط به
Express Proxy شود.

---

## ساختار tar دیپلوی (مهم — v21+)

> ⚠️ از v21 به بعد، فایل‌های build مستقیماً در پوشه‌های `pwa/`، `admin/` و `api/` قرار دارند — **بدون** زیرپوشه‌ی `public/` یا `dist/`

```
shivafer-deploy-vX.tar.gz
├── pwa/              ← فایل‌های build شده PWA (index.html, assets/, icons/, ...)
├── admin/            ← فایل‌های build شده Admin (index.html, assets/, ...)
└── api/              ← فایل‌های bundle شده API (index.mjs, pino-*.mjs, ...)
```

---

## متغیرهای ENV مهم

فایل: `/var/www/shivafer-deploy/.env`

```env
DATABASE_URL=...
JWT_SECRET=...
PORT=8090
NODE_ENV=production
UPLOAD_DIR=/var/www/uploads
SITE_URL=https://shivafaracademy.ir
STATIC_ASSETS_PATH=/var/www/static-assets

# SMS
MODIRPAYAMAK_API_KEY=...
IPPANEL_API_KEY=...

# پرداخت
ZARINPAL_MERCHANT_ID=...

# Push Notifications
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...

# صدای سارا (یکی از دو روش زیر الزامی است)
# روش ۱ — Gateway اختصاصی:
VOICE_GATEWAY_URL=http://154.91.170.66:3100/tts/stream
VOICE_GATEWAY_SECRET=...
# روش ۲ — مستقیم با ElevenLabs (fallback):
ELEVENLABS_API_KEY=...
ELEVENLABS_VOICE_ID=pjcYQlDFKMbcOUp6F5GD
```

---

## معماری نهایی Static Assets و جریان خودکار Deploy

این بخش وضعیت نهایی و مرجع معماری Static Assets در همین پروژه است. در
Production مقدار `STATIC_ASSETS_PATH` اجباری است و باید دقیقاً به مسیر
canonical زیر اشاره کند:

```env
STATIC_ASSETS_PATH=/var/www/static-assets
```

این مسیر باید قبل از Startup وجود داشته باشد و برای کاربر اجرای API قابل خواندن
باشد. اگر مسیر تنظیم نشده باشد، وجود نداشته باشد، قابل خواندن نباشد یا پوشه
نباشد، API در Production عمداً Startup را Fail می‌کند. در Development، fallback
فعلی به `dist/public/static-assets/` حفظ می‌شود.

## ترتیب واقعی مراحل

ترتیب اجرای خودکار در تنظیمات فعلی پروژه چنین است:

1. سرویس API با دستور Build خودش ساخته می‌شود.
2. `artifacts/api-server/build.mjs` بعد از Bundle، Build Validation را اجرا
   می‌کند. این مرحله خروجی `dist/public/`، ساختار assetها و فایل‌های حیاتی را
   بررسی می‌کند.
3. فقط در صورت موفقیت کامل Build، بخش `[deployment.postBuild]` در `.replit`
   اجرا می‌شود.
4. این بخش ابتدا Store را پاک‌سازی می‌کند و سپس اسکریپت Synchronize را اجرا
   می‌کند:

```text
pnpm store prune && node scripts/sync-static-assets.mjs
```

5. اسکریپت Synchronize کل محتوای زیر را:

```text
artifacts/api-server/dist/public/static-assets/
```

با `rsync` و حفظ ساختار پوشه‌ها در مسیر زیر Synchronize می‌کند:

```text
/var/www/static-assets/
```

همگام‌سازی کل پوشه است و به فهرست ثابت فایل‌ها وابسته نیست؛ فایل‌های جدید و
تغییرکرده به صورت خودکار منتقل می‌شوند. گزینه حذف فعال نیست، بنابراین فایل‌های
Production که فقط روی سرور وجود دارند حفظ می‌شوند.

Express تمام Static Assets را از `/var/www/static-assets` سرو می‌کند و Nginx
فقط Reverse Proxy است. برای `/static-assets/` هیچ Nginx Alias وجود ندارد.
هیچ Copy دستی Static Asset بعد از Deploy، Symlink دستی یا SSH Fix بعد از Deploy
جزء این معماری نیست.

### Build Validation — قبل از Deploy

قبل از Synchronize، Build Validation وجود فایل‌های زیر را بررسی می‌کند و در
صورت نبودن هرکدام Build/Deploy را Fail می‌کند:

```text
channel-bg-v6.webp
channel-bg-light-v2.webp
support-avatar-v2.webp
sara-avatar.webp
icons/tool-sara.webp
icons/tool-assistant.webp
icons/tool-finance.webp
```

### Startup Validation — هنگام اجرای Production

در شروع API، قبل از اجرای Migration و قبل از Listen شدن سرویس، `src/index.ts`
بررسی می‌کند که:

- `STATIC_ASSETS_PATH` تنظیم شده باشد.
- مسیر وجود داشته باشد.
- مسیر یک Directory باشد.
- مسیر برای کاربر اجرای API قابل خواندن باشد.

اگر هرکدام از این شرط‌ها برقرار نباشد، Startup در Production Fail می‌شود. در
Development، fallback به `dist/public/static-assets/` بدون تغییر حفظ شده است.

### Post-Deploy Smoke Test — بعد از Synchronize

بعد از Synchronize، Smoke Test در همان اسکریپت Deploy اجرا می‌شود و این ۷ مسیر
را بررسی می‌کند:

- HTTP 200
- `Content-Type: image/webp`
- پاسخ HTML نباشد

اگر هر تست Fail شود، اسکریپت با کد خطا خارج می‌شود و Deploy ناموفق اعلام
می‌شود. بنابراین هم Build Validation و هم Smoke Test شرط موفقیت Deploy هستند.
گزارش انتهایی اسکریپت Deploy فقط شامل این چهار مورد است:

```text
synchronized files
validation result
smoke test result
deployment status
```

این معماری Future-proof است: هر فایل جدیدی که بعداً در `static-assets` اضافه
شود، بدون تغییر کد در Synchronize وارد Production می‌شود. فهرست ۷ فایل بالا فقط
برای Build Validation و Smoke Test فایل‌های حیاتی است، نه برای محدود کردن
Synchronize.

### قوانین ممنوع در معماری نهایی

برای Static Assets موارد زیر مجاز نیست:

- تعریف Nginx Alias برای `/static-assets/` یا فایل‌های داخل آن
- Copy دستی بعد از Deploy
- ساخت Symlink دستی
- اجرای SSH Fix برای انتقال یا اصلاح Static Assets
- قرار دادن مسیر canonical روی PWA، Admin یا مسیر دیگری به‌جای
  `/var/www/static-assets`

---

## دستورات بک‌اپ

> این snapshot برای نگهداری دائمی است و با `rollback-*` قاطی نمی‌شود.
> ویدیو و صوت حجیم عمداً حذف می‌شوند؛ مسیرهای uploads و static-assets هم جدا هستند.

```bash
SNAP=$(date +%Y%m%d_%H%M%S) && mkdir -p /root/shivafer-snapshots/$SNAP && \
rsync -a \
  --exclude='*.mp4' --exclude='*.mkv' --exclude='*.avi' --exclude='*.mov' \
  --exclude='*.mp3' --exclude='*.wav' --exclude='*.ogg' --exclude='*.aac' \
  /var/www/shivafer-deploy/artifacts/api-server/dist/ \
  /root/shivafer-snapshots/$SNAP/api-dist/ && \
rsync -a \
  --exclude='*.mp4' --exclude='*.mp3' --exclude='*.wav' \
  /var/www/html/ /root/shivafer-snapshots/$SNAP/pwa-html/ && \
rsync -a /var/www/admin/ /root/shivafer-snapshots/$SNAP/admin/ && \
pg_dump "$DATABASE_URL" | gzip > /root/shivafer-snapshots/$SNAP/database.sql.gz && \
printf '%s\n' "snapshot=$SNAP" "created_at=$(date -Is)" \
  > /root/shivafer-snapshots/$SNAP/manifest.txt && \
echo "✅ Permanent snapshot: /root/shivafer-snapshots/$SNAP"
```

برای بکاپ دائمی فعلی که قبلاً ساخته شده است:

```text
/root/rollback-20260805_121931
/root/shivafer-db-before-v57-20260805.sql
```

---

## دستورات دیپلوی

> ⚠️ قانون مهم: هیچ تصویری از سایت حذف یا جایگزین نمی‌شود

### مرحله ۰ — بررسی مسیر اجرای systemd

قبل از هر deploy، مطمئن شوید سرویس از bundle اجرا می‌شود، نه از سورس workspace:

```bash
set -e
WD=$(systemctl show shivafer-api -p WorkingDirectory --value)
EXEC=$(systemctl show shivafer-api -p ExecStart --value)

test "$WD" = "/var/www/shivafer-deploy/artifacts/api-server"
test -f "$WD/dist/index.mjs"
test "$(readlink -f "$WD/dist/index.mjs")" = \
  "/var/www/shivafer-deploy/artifacts/api-server/dist/index.mjs"

case "$EXEC" in
  *tsx*|*lib/api-zod*|*src/index*)
    echo "❌ systemd points to workspace source"
    exit 1
    ;;
esac

echo "WorkingDirectory: $WD"
echo "ExecStart: $EXEC"
echo "✅ systemd points to the bundled API"
```

> اگر این مرحله fail شد، سرویس را restart نکنید. ابتدا unit را اصلاح کنید.
> مقدار صحیح `WorkingDirectory` باید `/var/www/shivafer-deploy/artifacts/api-server`
> و فایل اجرایی باید `dist/index.mjs` باشد؛
> اجرای `lib/api-zod/src/generated/api.ts` یا `src/index.ts` روش deploy معتبر نیست.

### مرحله ۱ — بکاپ (اجباری قبل از هر deploy)
```bash
BKTS=$(date +%Y%m%d_%H%M%S) && mkdir -p /root/rollback-$BKTS && \
rsync -a \
  --exclude='*.mp4' --exclude='*.mkv' --exclude='*.avi' --exclude='*.mov' \
  --exclude='*.mp3' --exclude='*.wav' --exclude='*.ogg' --exclude='*.aac' \
  /var/www/shivafer-deploy/artifacts/api-server/dist/ \
  /root/rollback-$BKTS/api-dist/ && \
rsync -a \
  --exclude='*.mp4' --exclude='*.mp3' --exclude='*.wav' \
  /var/www/html/ /root/rollback-$BKTS/pwa-html/ && \
rsync -a /var/www/admin/ /root/rollback-$BKTS/admin/ && \
echo "✅ Backup: /root/rollback-$BKTS"
```

### مرحله ۲ — استخراج tar
```bash
# فایل tar دیپلوی را ابتدا به /root آپلود کنید
rm -rf /tmp/shivafer-new && mkdir -p /tmp/shivafer-new && \
tar -xzf ~/shivafer-deploy-vX.tar.gz --strip-components=1 -C /tmp/shivafer-new && \
echo "✅ Extract OK"
```

### مرحله ۲٫۵ — اعتبارسنجی آرشیو قبل از نصب

```bash
set -e
test -f /tmp/shivafer-new/api/index.mjs
test -f /tmp/shivafer-new/api/thread-stream-worker.mjs
test -f /tmp/shivafer-new/api/pino-worker.mjs
test -f /tmp/shivafer-new/api/pino-file.mjs
test -f /tmp/shivafer-new/api/pino-pretty.mjs
node --check /tmp/shivafer-new/api/index.mjs
for worker in /tmp/shivafer-new/api/*.mjs; do
  node --check "$worker"
done
! grep -qF 'lib/api-zod/src' /tmp/shivafer-new/api/index.mjs
! grep -qF 'generated/api.ts' /tmp/shivafer-new/api/index.mjs
! grep -qF 'src/' /tmp/shivafer-new/api/index.mjs
! grep -qF '/home/runner/workspace' /tmp/shivafer-new/api/index.mjs
! find /tmp/shivafer-new/api -maxdepth 1 -name '*.map' -print -quit | grep -q .
echo "✅ API bundle validation passed"
```

> این مرحله اجباری است. اگر fail شد، سرویس را restart نکنید؛ آرشیو را
> از build محلی دوباره بسازید.

> 💡 برای تأیید ساختار صحیح قبل از deploy:
> ```bash
> ls /tmp/shivafer-new/pwa/      # باید index.html و assets/ باشد
> ls /tmp/shivafer-new/admin/    # باید index.html و assets/ باشد
> ls /tmp/shivafer-new/api/      # باید index.mjs باشد
> ```

### مرحله ۳ — deploy API
```bash
# ⚠️ از api/ مستقیم — نه api/dist/
# ⚠️ حتماً از rsync استفاده کنید، نه cp با glob — cp با * گاهی index.mjs را کپی نمی‌کند
systemctl stop shivafer-api
systemctl reset-failed shivafer-api || true
rsync -a \
  --exclude='public/' \
  /tmp/shivafer-new/api/ \
  /var/www/shivafer-deploy/artifacts/api-server/dist/ && \
rm -f /var/www/shivafer-deploy/artifacts/api-server/dist/*.map && \
echo "✅ API deployed"

# تأیید کنید که bundle جدید و workerها درست کپی شده‌اند:
test -f /var/www/shivafer-deploy/artifacts/api-server/dist/index.mjs
test -f /var/www/shivafer-deploy/artifacts/api-server/dist/thread-stream-worker.mjs
node --check /var/www/shivafer-deploy/artifacts/api-server/dist/index.mjs
! grep -qF 'lib/api-zod/src' \
  /var/www/shivafer-deploy/artifacts/api-server/dist/index.mjs
! grep -qF 'generated/api.ts' \
  /var/www/shivafer-deploy/artifacts/api-server/dist/index.mjs
! grep -qF '/home/runner/workspace' \
  /var/www/shivafer-deploy/artifacts/api-server/dist/index.mjs
echo "✅ Standalone API bundle installed"
```

> در Production، متغیر `STATIC_ASSETS_PATH` باید در محیط سرویس API تنظیم شده
> باشد و دقیقاً به مسیر canonical زیر اشاره کند:
> `/var/www/static-assets`
>
> قبل از start یا restart سرویس، این شرط را بررسی کنید:
>
> ```bash
> test "${STATIC_ASSETS_PATH:-}" = "/var/www/static-assets"
> test -d "/var/www/static-assets"
> test -r "/var/www/static-assets"
> ```
>
> اگر این مقدار تنظیم نشده باشد یا مسیر قابل خواندن نباشد، API عمداً در
> Production شروع نمی‌شود. فایل‌های Static Assets را به PWA، Admin یا
> `dist/public/` کپی نکنید؛ Express مستقیماً از canonical path سرو می‌کند.

### مرحله ۴ — deploy PWA (حفظ تصاویر موجود و انتقال assetهای bundle)
```bash
# ⚠️ از pwa/ مستقیم — نه pwa/public/
rsync -a \
  --exclude='icons/*.webp' --exclude='icons/*.png' \
  --exclude='icons/*.jpg' --exclude='icons/*.svg' \
  --exclude='*.mp3' --exclude='*.wav' --exclude='*.ogg' \
  /tmp/shivafer-new/pwa/ /var/www/html/ && \
echo "✅ PWA deployed"
```

> نکته: `assets/*.webp` شامل لوگوی bundle‌شده‌ی Splash Screen است و نباید exclude شود. فقط تصاویر پوشه‌ی `icons/` و فایل‌های صوتی کنار گذاشته می‌شوند.

### مرحله ۵ — deploy Admin (بدون جایگزینی تصویر)
```bash
# ⚠️ از admin/ مستقیم — نه admin/public/
rsync -a \
  --exclude='*.webp' --exclude='*.jpg' --exclude='*.jpeg' \
  --exclude='*.png' --exclude='*.gif' --exclude='*.svg' \
  /tmp/shivafer-new/admin/ /var/www/admin/ && \
echo "✅ Admin deployed"
```

### مرحله ۶ — restart و تأیید
```bash
set -e
systemctl start shivafer-api
sleep 5
systemctl is-active --quiet shivafer-api
curl --fail --silent --show-error http://localhost:8090/api/healthz
curl --fail --silent --show-error \
  -H 'Accept: image/webp' \
  -D /tmp/shivafer-static-asset-headers.txt \
  -o /dev/null \
  https://shivafaracademy.ir/static-assets/channel-bg-v6.webp
grep -qi '^content-type: image/webp' /tmp/shivafer-static-asset-headers.txt
echo
echo "✅ Deploy and health check passed"
journalctl -u shivafer-api -n 20 --no-pager
```

---

## دستور Rollback (بازگشت کامل)

```bash
# BKTS را از خروجی مرحله بکاپ بردارید (مثلاً rollback-20260725_124727)
BKTS=rollback-XXXXXXXX_XXXXXX

rsync -a /root/$BKTS/api-dist/ \
      /var/www/shivafer-deploy/artifacts/api-server/dist/ && \
rsync -a /root/$BKTS/pwa-html/ /var/www/html/ && \
rsync -a /root/$BKTS/admin/ /var/www/admin/ && \
systemctl restart shivafer-api && sleep 3 && \
systemctl is-active shivafer-api && echo "✅ Rollback done"
```

> قبل از rollback، ابتدا یک snapshot جدید بگیرید تا وضعیت فعلی از بین نرود.

---

## بررسی وضعیت سرور

```bash
# وضعیت سرویس
systemctl status shivafer-api --no-pager | head -15

# لاگ زنده
journalctl -u shivafer-api -f --no-pager

# لاگ صدای سارا (برای debug)
journalctl -u shivafer-api -f --no-pager | grep -E "voice-advisor|TTS|gateway|elevenlabs|ERROR|WARN"

# پورت‌های در حال listen
ss -tlnp | grep node

# تست API
curl -s http://localhost:8090/api/tribe/earnings | head -50
```

---

## نکته‌های مهم

1. **npm install workspace:** بعد از deploy API لازم نیست `npm install` بزنید — `dist/index.mjs` کاملاً bundle شده
2. **health endpoint:** endpoint سلامت `/api/healthz` است و باید بعد از deploy با status 200 پاسخ دهد
3. **تصاویر:** هرگز `--delete` بدون `--exclude` image برای PWA و Admin استفاده نکنید
4. **uploads:** مسیر `/var/www/uploads/` هرگز در deploy لمس نمی‌شود
5. **static-assets:** مسیر canonical `/var/www/static-assets/` است و فایل‌های آن فقط توسط Express سرو می‌شوند
6. **ENV:** فایل `.env` در `/var/www/shivafer-deploy/.env` است نه داخل dist
7. **ساختار tar:** فایل‌های build مستقیماً در `pwa/`، `admin/`، `api/` هستند — بدون زیرپوشه‌ی `public/` یا `dist/`
8. **Zod:** این پروژه Zod 3 دارد؛ `override.zod.version: 3` در Orval نباید حذف شود
9. **Standalone API:** build production با `sourcemap: false` و `minify: true` تولید می‌شود؛
   هیچ sourcemap یا مسیر workspace نباید در `dist/` باقی بماند.
10. **Pino workers:** فایل‌های `thread-stream-worker.mjs`، `pino-worker.mjs`،
    `pino-file.mjs` و `pino-pretty.mjs` باید همراه `index.mjs` deploy شوند.
    build آن‌ها را با مسیر runtime-relative تولید می‌کند؛ مسیر `/home/runner/workspace`
    نباید در هیچ فایل API وجود داشته باشد.
11. **STATIC_ASSETS_PATH:** در Production اجباری است و باید روی
    `/var/www/static-assets` تنظیم شود.
12. **Nginx Static Assets:** Nginx فقط `/static-assets/` را به Express Proxy
    می‌کند؛ برای تصاویر تکی یا پوشه‌های Static Assets هیچ alias اختصاصی ایجاد
    نکنید.
