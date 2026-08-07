# راهنمای ایجنت — شیوافر آکادمی

## وضعیت نسخه v58 — Production Standalone Bundle (2026-08-05)

### مشکل production و راه‌حل نهایی

در نسخه v57، bundle API به‌طور کامل مستقل نبود:

- sourcemapهای لینک‌شده مسیرهای workspace را در artifact production نگه می‌داشتند.
- مسیر workerهای Pino به پوشه‌ی build روی سیستم توسعه اشاره می‌کردند.
- بعد از deploy با `rsync`، sourcemapهای قدیمی می‌توانستند در `dist/` باقی بمانند.

در v58، این موارد در خود build اصلاح شده‌اند:

- `sourcemap: false` و `minify: true`
- bundle کردن dependencyهای workspace داخل `index.mjs`
- حذف مسیرهای build-machine از تمام فایل‌های worker
- resolve کردن مسیر workerها نسبت به `import.meta.url`
- validation اجباری برای نبودن `lib/api-zod/src`، `generated/api.ts`،
  `src/`، مسیرهای workspace و sourcemapهای production

فایل‌های API production باید شامل `index.mjs` و workerهای Pino باشند:

```text
index.mjs
thread-stream-worker.mjs
pino-worker.mjs
pino-file.mjs
pino-pretty.mjs
```

پس از deploy، endpoint زیر باید پاسخ `200` بدهد:

```text
GET http://localhost:8090/api/healthz
```

---

## تغییرات نسخه (v57 — Rules Engine داینامیک — 2026-08-05)

### پیاده‌سازی Rules Engine — موتور قوانین داینامیک Generic

**فایل‌های جدید/تغییریافته:**

| فایل | نوع |
|------|-----|
| `lib/db/src/schema/assessment-rules.ts` | **جدید** — schema جدول قوانین |
| `lib/db/src/schema/index.ts` | تغییر — export جدید |
| `lib/db/migrations/add_assessment_rules_v57.sql` | **جدید** — migration |
| `artifacts/api-server/src/lib/rules-engine.ts` | **جدید** — موتور ارزیابی |
| `artifacts/api-server/src/routes/assessments.ts` | تغییر — API CRUD + ادغام در submit/result |
| `artifacts/admin-panel/src/pages/AssessmentBuilder.tsx` | تغییر — تب «قوانین» جدید |

---

#### ۱. Schema — `assessment_rules`

```sql
CREATE TABLE assessment_rules (
  id               SERIAL PRIMARY KEY,
  assessment_id    INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  condition_mode   VARCHAR(3) NOT NULL DEFAULT 'all',  -- 'all' (AND) | 'any' (OR)
  conditions       JSONB NOT NULL DEFAULT '[]',
  actions          JSONB NOT NULL DEFAULT '{}'
);
```

---

#### ۲. ساختار Condition

```typescript
interface RuleCondition {
  type: "finalScore" | "indexScore" | "finalLevel" | "indexLevel" | "answer" | "leadScore";
  operator: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in" | "between" | "contains";
  value: unknown;       // عدد | رشته | آرایه | [min,max]
  indexId?: number;     // برای indexScore / indexLevel
  questionId?: number;  // برای answer
}
```

**Condition Types:**
- `finalScore` — امتیاز نهایی ترکیبی (۰–۱۰۰)
- `indexScore` — امتیاز شاخص مشخص (indexId الزامی)
- `finalLevel` — برچسب سطح نهایی ("ضعیف" / "متوسط" / "خوب" / ...)
- `indexLevel` — برچسب سطح یک شاخص (indexId الزامی)
- `answer` — پاسخ کاربر به سوال مشخص (questionId الزامی)
- `leadScore` — lead score فعلی کاربر

**Operators:** eq, neq, gt, gte, lt, lte, in, between, contains

---

#### ۳. ساختار Action

```typescript
interface RuleAction {
  suggestedProductIds?: number[];      // محصولات پیشنهادی
  suggestedCourseIds?: number[];       // دوره‌های پیشنهادی
  suggestedAssessmentIds?: number[];   // تست‌های بعدی پیشنهادی
  ctaText?: string;                    // متن دکمه CTA
  ctaUrl?: string;                     // لینک CTA
  ctaStyle?: "primary" | "success" | "warning" | "danger" | "info";
  messageTitle?: string;               // عنوان پیام
  messageBody?: string;                // متن پیام
  messageBadge?: string;               // برچسب badge
  messageBadgeColor?: string;          // رنگ badge
  messageIcon?: string;                // آیکون emoji
}
```

---

#### ۴. API‌های جدید

| Method | Endpoint | دسترسی | توضیح |
|--------|----------|---------|-------|
| `GET` | `/api/admin/assessments/:id/rules` | ادمین | لیست قوانین یک تست |
| `POST` | `/api/admin/assessments/:id/rules` | ادمین | ایجاد قانون جدید |
| `PUT` | `/api/admin/assessments/rules/:ruleId` | ادمین | ویرایش قانون |
| `DELETE` | `/api/admin/assessments/rules/:ruleId` | ادمین | حذف قانون |
| `PUT` | `/api/admin/assessments/:id/rules/reorder` | ادمین | تغییر ترتیب |
| `POST` | `/api/admin/assessments/rules/:ruleId/preview` | ادمین | dry-run با پاسخ‌های تستی |

**ادغام در submit endpoint:**
- پس از محاسبه امتیاز، قوانین فعال تست ارزیابی می‌شوند
- نتیجه در فیلد `rulesResult` به پاسخ اضافه می‌شود
- `rulesResult.matchedRules` — قوانین منطبق
- `rulesResult.merged` — اقدامات ادغام‌شده (products, courses, assessments, ctas, messages)

---

#### ۵. ادمین پنل — تب «قوانین»

AssessmentBuilder حالا ۴ تب دارد:
1. اطلاعات تست
2. سوالات
3. شاخص‌ها
4. **قوانین** (جدید)

در تب قوانین:
- لیست قوانین با badge شروط و اقدامات
- ایجاد/ویرایش قانون با Dialog کامل
- انتخاب شروط داینامیک با نوع، operator، مقدار
- حالت AND/OR برای ترکیب شروط
- انتخاب محصول/دوره/تست از لیست با search
- فرم CTA (متن، لینک، رنگ)
- فرم پیام (عنوان، متن، badge، آیکون)
- toggle فعال/غیرفعال بدون حذف
- جابجایی ترتیب با arrow

---

#### ۶. قوانین v57

- فقط فایل‌های بالا تغییر کرده‌اند
- هیچ تغییری در PWA نیست (نتایج قوانین در API موجود‌اند ولی هنوز در UI نمایش داده نمی‌شوند)
- API‌های قدیمی backward compatible هستند
- RulesEngine کاملاً Generic است — برای همه تست‌ها کار می‌کند

---

#### ۷. Migration روی سرور

```bash
cd /var/www/shivafer
psql -U shivafer -d shivafer -f lib/db/migrations/add_assessment_rules_v57.sql
# یا:
pnpm --filter @workspace/db run push
```

ایمن است — فقط جدول جدید اضافه می‌شود، هیچ تغییری در جداول موجود نیست.

---

## تغییرات نسخه (v56 — موتور امتیازدهی حرفه‌ای — 2026-08-05)

### پیاده‌سازی ScoringEngine — موتور امتیازدهی کاملاً Generic

**فایل‌های جدید/تغییریافته:**

| فایل | نوع |
|------|-----|
| `artifacts/api-server/src/lib/scoring-engine.ts` | **جدید** — موتور امتیازدهی |
| `lib/db/src/schema/assessments.ts` | تغییر — ستون‌های جدید |
| `artifacts/api-server/src/routes/assessments.ts` | تغییر — ادغام موتور + API جدید |
| `lib/db/migrations/add_scoring_v56.sql` | **جدید** — migration |

---

#### ۱. ScoringEngine (`artifacts/api-server/src/lib/scoring-engine.ts`)

کلاس `ScoringEngine` با متد اصلی `ScoringEngine.compute()`:

```typescript
const result = ScoringEngine.compute(questions, indices, answers, globalLevels?);
// result: { indexResults, finalScore, finalLevel, leadScoreImpact, scoringVersion: "v56" }
```

**ویژگی‌های موتور:**

- **وزن سوال** (`questionWeight`): ضریب تأثیر سوال روی هر شاخص
- **وزن شاخص** (`index.weight`): در میانگین وزن‌دار امتیاز نهایی
- **نرمال‌سازی تئوری**: حداقل/حداکثر ممکن محاسبه می‌شود → بهترین پاسخ = ۱۰۰، بدترین = ۰
- **سطح per-index**: از `index.levels` → `[{ label, minPct, maxPct, description, suggestion }]`
- **سطح نهایی کلی**: از `assessment.globalLevels` یا شاخص پراهمیت‌ترین
- **سازگاری کامل**: با v54 (indexScores map) و سیستم قدیمی (score+indexIds)

**فرمول امتیاز نهایی:**
```
finalScore = Σ(normalizedScore_i × indexWeight_i) / Σ(indexWeight_i)
```

**فرمول نرمال‌سازی:**
```
normalized = (rawScore - minPossible) / (maxPossible - minPossible) × 100
```

---

#### ۲. تغییرات Schema

**`assessmentSessionsTable` — دو ستون جدید:**
```sql
ALTER TABLE assessment_sessions ADD COLUMN final_score INTEGER DEFAULT NULL;
ALTER TABLE assessment_sessions ADD COLUMN scoring_version VARCHAR(10) DEFAULT NULL;
```

**`assessmentsTable` — یک ستون جدید:**
```sql
ALTER TABLE assessments ADD COLUMN global_levels JSONB DEFAULT NULL;
```
ساختار: `[{ label, minPct, maxPct, description, suggestion }]`

---

#### ۳. API‌های جدید

| Method | Endpoint | دسترسی | توضیح |
|--------|----------|---------|-------|
| `GET` | `/api/assessments/result/:sessionId` | عمومی | نتایج با `finalScore` و `finalLevel` |
| `POST` | `/api/admin/assessments/sessions/:id/recalculate` | ادمین | محاسبه مجدد یک session |
| `POST` | `/api/admin/assessments/:id/recalculate-all` | ادمین | محاسبه مجدد همه session‌ها |
| `POST` | `/api/admin/assessments/:id/score-preview` | ادمین | dry-run بدون ذخیره |

**پاسخ submit endpoint (بهبود یافته):**
```json
{
  "sessionId": 42,
  "indexScores": { "1": 78, "2": 55 },
  "finalScore": 68,
  "finalLevel": { "label": "متوسط", "description": "...", "suggestion": "..." },
  "indexResults": [{ "indexId": 1, "normalizedScore": 78, "level": {...}, ... }],
  "hasAiReport": true,
  "aiReportPrice": 50000,
  "endText": "..."
}
```

---

#### ۴. Migration روی سرور

```bash
cd /var/www/shivafer
psql -U shivafer -d shivafer -f lib/db/migrations/add_scoring_v56.sql
# یا:
pnpm --filter @workspace/db run push
```

ایمن است — همه ستون‌ها nullable هستند، داده‌های قدیمی دست‌نخورده باقی می‌مانند.

---

#### ۵. قوانین v56

- فقط API (`assessments.ts`) و lib جدید تغییر کرده‌اند
- هیچ تغییری در PWA (`artifacts/shivafer-pwa`) نیست
- هیچ تغییری در Admin Panel (`artifacts/admin-panel`) نیست
- API‌های قدیمی همان رفتار دارند — فقط پاسخ غنی‌تر شده
- `ScoringEngine.toLegacyIndexScores()` برای backward compatibility ادامه دارد

---


## تغییرات نسخه فعلی (v55 — رفع باگ پخش صوت — 2026-08-05)

### باگ: صوت‌ها بعد از چند ساعت پخش نمی‌شوند

**فایل تغییریافته:** `artifacts/api-server/src/routes/stream.ts`

**علت ریشه‌ای:**
تابع `streamAudioFile()` تمام صوت‌ها (جلسات دوره، پادکست، محصول، دوره) را از طریق AWS SDK
به صورت stream به مرورگر proxy می‌کرد. هر بار که کاربر:
- فایل را pause می‌کرد
- به جلو/عقب می‌کشید (seek)
- تب را می‌بست

مرورگر اتصال HTTP را قطع می‌کرد اما `result.body` (stream از AWS SDK) هرگز `destroy()` نمی‌شد.
اتصال S3 باز می‌ماند و به pool برنمی‌گشت. بعد از O(50-100) چنین رویدادی، pool پر می‌شد
و همه درخواست‌های جدید صوتی در صف می‌ماندند. restart سرور → pool پاک → دوباره کار می‌کند.

ویدیوها (lesson) مشکل نداشتند چون از **presigned URL redirect** (302) استفاده می‌کردند.

**دو تغییر اعمال‌شده:**

**۱. `streamAudioFile()` → presigned URL redirect (اصلاح ریشه‌ای)**
```
قبل: GetObjectCommand → stream → pipe به response (proxy)
بعد: getSignedUrl(key, 4h) → 302 redirect → مرورگر مستقیم از parspack دانلود می‌کند
```
مرورگر مستقیماً با parspack صحبت می‌کند. سرور هیچ بایتی از صوت را لمس نمی‌کند.
هیچ connection pool exhaustion امکان‌پذیر نیست.
TTL: 4 ساعت — کافی برای یک جلسه گوش‌دادن کامل شامل seek.

**۲. `streamViaStorage()` → cleanup درست (defensive fix برای reels و /stream/media)**
```typescript
// اضافه شد:
const destroyBody = () => { try { result.body.destroy(); } catch { } };
req.on("close", destroyBody);
req.on("aborted", destroyBody);
res.on("close", destroyBody);
```
برای محتوایی که هنوز proxy می‌شود (reels)، در صورت disconnect کاربر، stream S3 بلافاصله
destroy می‌شود و اتصال به pool برمی‌گردد.

**نیاز به مهاجرت DB:** ندارد.
**تغییر در PWA یا Admin:** ندارد.

---

## تغییرات نسخه (v54 — Phase 1 Tests & Assessments — 2026-08-04)

### ارتقاء موتور سوال‌ساز (Question Builder) — Phase 1

**فایل‌های تغییریافته:**

| فایل | نوع تغییر |
|------|-----------|
| `lib/db/src/schema/assessments.ts` | اضافه‌شدن سه ستون جدید + بازنویسی `QuestionOption` |
| `artifacts/api-server/src/routes/assessments.ts` | بازنویسی `computeIndexScores()` + پشتیبانی فیلدهای جدید |
| `artifacts/admin-panel/src/pages/AssessmentBuilder.tsx` | بازنویسی کامل `QuestionDialog` + کامپوننت `ScoringPreview` |

---

#### ۱. تغییرات Schema (`lib/db/src/schema/assessments.ts`)

**سه ستون جدید به `assessmentQuestionsTable` اضافه شد:**

```sql
-- مهاجرت ایمن — تمام ستون‌ها nullable/defaulted هستند
ALTER TABLE assessment_questions ADD COLUMN question_weight INTEGER NOT NULL DEFAULT 1;
ALTER TABLE assessment_questions ADD COLUMN question_category VARCHAR(30);
ALTER TABLE assessment_questions ADD COLUMN question_goal TEXT;
```

- **`questionWeight`** (`integer`, default 1): ضریب تأثیر سوال در scoring engine. عدد بزرگ‌تر = تأثیر بیشتر.
- **`questionCategory`** (`varchar(30)`, nullable): دسته‌بندی محتوایی سوال (مستقل از نوع پاسخ).
  - مقادیر مجاز: `behavioral` / `knowledge` / `attitude` / `situational` / `self_assessment` / `demographic`
- **`questionGoal`** (`text`, nullable): هدف داخلی سوال. **فقط برای ادمین — هرگز به کاربر ارسال نمی‌شود.**

**`QuestionOption` interface بازنویسی شد (backward-compatible):**

```typescript
interface QuestionOption {
  id: string;
  label: string;
  score: number;        // backward compat
  weight: number;       // backward compat
  leadScore: number;
  indexIds: number[];   // backward compat
  indexScores?: Record<string, number>; // v54 NEW: { "indexId": score }
}
```

اولویت در scoring engine:
1. اگر `indexScores` حداقل یک entry داشته باشد → سیستم جدید (v54)
2. در غیر این صورت → fallback به `score + indexIds` (سیستم قدیم)

---

#### ۲. تغییرات API (`artifacts/api-server/src/routes/assessments.ts`)

**`computeIndexScores()` بازنویسی شد:**
- برای هر سوال، `questionWeight` را اعمال می‌کند (ضریب روی امتیاز شاخص‌ها).
- برای هر گزینه، اگر `indexScores` موجود باشد از آن استفاده می‌کند، وگرنه به `score + indexIds` برمی‌گردد.
- سازگاری کامل با سوالات قدیمی حفظ شده.

**`POST /admin/assessments/:id/questions` آپدیت شد:**
- سه فیلد جدید `questionWeight`, `questionCategory`, `questionGoal` را می‌پذیرد.

**`GET /assessments/:slug`** (public):
- `questionGoal` هرگز در پاسخ‌های عمومی گنجانده نمی‌شود.
- داده‌های scoring (امتیاز، وزن‌ها، indexScores) قبلاً از پاسخ عمومی حذف می‌شدند؛ این رفتار حفظ شده.

---

#### ۳. تغییرات Admin Panel (`artifacts/admin-panel/src/pages/AssessmentBuilder.tsx`)

**کامپوننت `QuestionDialog` بازنویسی کامل شد:**

1. **انتخاب نوع پاسخ:** گرید بصری ۳ ستونه با آیکون (جایگزین dropdown).
2. **کارت v54 metadata** (مجزا):
   - فیلد **وزن سوال** (`questionWeight`): input عددی + دکمه‌های سریع (1×, 2×, 3×, 5×).
   - **دسته‌بندی محتوایی** (`questionCategory`): Select با توضیح هر دسته.
   - **هدف داخلی** (`questionGoal`): accordion مخفی — متن آزاد، برچسب «فقط برای ادمین».
3. **ماتریس امتیازدهی per-option per-index** (جایگزین toggle قدیمی):
   - هر گزینه یک ردیف input عددی به ازای هر شاخص دارد.
   - امتیازات مثبت (سبز) / صفر (خاکستری) / منفی (قرمز) رنگ‌بندی می‌شوند.
   - **`updateOptionIndexScore()`**: `indexScores` را آپدیت می‌کند و `indexIds` legacy را sync می‌کند.
4. **`ScoringPreview`** (کامپوننت جدید):
   - جدول گزینه × شاخص با مقادیر امتیاز.
   - با دکمه toggle نمایش/پنهان می‌شود.
   - فقط وقتی حداقل یک امتیاز غیرصفر وجود داشته باشد نمایش داده می‌شود.
5. **کارت سوال در لیست** بازطراحی شد:
   - Badge «وزن ×N» (amber) برای سوالات با وزن > 1.
   - Badge دسته‌بندی محتوایی (blue).
   - شمارنده «N گزینه امتیازدهی‌شده» (سبز).
   - نمایش `questionGoal` در خط زیر عنوان (italic/muted، فقط اگر پر باشد).

---

#### ۴. مهاجرت پایگاه داده (روی سرور)

```bash
cd /var/www/shivafer
pnpm --filter @workspace/db run push
```

این دستور سه ستون جدید را به جدول `assessment_questions` اضافه می‌کند.  
**ایمن است** — هر سه ستون nullable یا دارای default value هستند؛ داده‌های قدیمی بدون تغییر باقی می‌مانند.

---

#### ۵. قوانین Phase 1

- فقط ۴ فایل بالا تغییر کرده‌اند.
- هیچ تغییری در PWA (`artifacts/shivafer-pwa`) نیست.
- هیچ تغییری در سایر ماژول‌ها (courses, products, users, ...) نیست.
- API‌های عمومی PWA همان رفتار قبلی دارند — فقط scoring engine قوی‌تر شده.

---

## تغییرات نسخه (v53 — ۱۴۰۵-۰۵-۱۳)

### بهبود صفحه جدول رتبه‌بندی قبایل

**فایل‌های تغییریافته:**
- `artifacts/api-server/src/routes/leaderboard.ts` — امتیاز به عدد صحیح گرد می‌شود
- `artifacts/shivafer-pwa/src/pages/leaderboard.tsx` — تمام تغییرات ظاهری

**تغییرات:**

1. **رنگ رتبه ۴ تا ۱۰ — آبی فیروزه‌ای (Teal):**
   - توکن‌های `CH` (CommanderHiCard) از بنفش/ارغوانی به آبی فیروزه‌ای تغییر کرد
   - `bg`, `bdr`, `glow`, `badge`, `top`, `txt`, `sub`, `rnk`, `lbl` همه با رنگ teal جدید

2. **امتیازها بدون اعشار:**
   - Backend: `Math.round(score)` به جای `Math.round(score * 100) / 100`
   - Frontend: همه نمایش‌های `fa(tribe.score)` به `fa(Math.round(tribe.score))` تبدیل شدند
   - `ScorePill`، `CommanderHiCard`، `CommanderLoCard`، `KnightCard`، `CitizenCard` همه آپدیت شدند

3. **عکس پروفایل قبیله روی تمام کارت‌ها:**
   - کامپوننت جدید `DefaultTribeIcon` — SVG قبیله با سپر و تاج برای قبیله‌های بدون لوگو
   - کامپوننت جدید `SmallTribeAvatar` — آواتار کوچک برای کارت‌های tier
   - `AvatarCircle` بازنویسی شد: به جای تصویر crest به عنوان default، از `DefaultTribeIcon` استفاده می‌کند
   - کارت‌های رتبه ۱ تا ۳: آواتار سمت راست دیگر تصویر crest را نشان نمی‌دهد — لوگوی قبیله یا آیکون پیشفرض
   - کارت‌های tier (رتبه ۴+): `SmallTribeAvatar` بین badge شماره رتبه و اطلاعات قبیله اضافه شد

4. **لوگوهای سمت چپ رتبه ۱-۳ دست‌نخورده:**
   - `CachedImage lion-crest-hq.webp`، `silver-crest.webp`، `bronze-crest.webp` همچنان در جای خود

**جریان آواتار:**
```
tribe.logo موجود → نمایش لوگوی آپلودشده (از طریق proxy)
tribe.logo = null → نمایش DefaultTribeIcon (SVG با سپر و تاج طلایی/نقره/برنز/فیروزه‌ای)
```

---

## تغییرات نسخه فعلی (v51 — دیپلوی تأیید‌شده ۱۴۰۵-۰۵-۱۳)

### فیکس آپلود عکس قبیله (tribe logo)

**مشکل:** هنگام ساخت یا ویرایش قبیله، آپلود عکس قبیله خطا می‌داد و تصویر نمایش داده نمی‌شد.

**علت ریشه‌ای (دو باگ):**

1. **Backend (`artifacts/api-server/src/routes/upload.ts` — `POST /upload/tribe-logo`):**
   - endpoint عکس قبیله برخلاف endpoint‌های صوتی، تابع `toProxyUrl()` را اعمال نمی‌کرد
   - URL خام S3 (`https://c163573.parspack.net/images/xxx.webp`) مستقیم برمی‌گشت
   - چون bucket خصوصی (private-ACL) است، مرورگر هنگام نمایش تصویر **403 Forbidden** می‌گرفت

2. **Frontend (`artifacts/shivafer-pwa/src/pages/tribe.tsx` — `handleCreate`):**
   - چک `tribeLogo.startsWith("http")` در `handleCreate` وجود داشت
   - URL‌های proxy با `/api/stream/media?key=...` شروع می‌شوند نه `http`
   - نتیجه: لوگو پس از آپلود موفق در ایجاد قبیله drop می‌شد

**فایل‌های تغییریافته:**
- `artifacts/api-server/src/routes/upload.ts` — اضافه شدن `toProxyUrl(url)` در پاسخ endpoint تصویر قبیله
- `artifacts/shivafer-pwa/src/pages/tribe.tsx` — حذف شرط `startsWith("http")` از `handleCreate`

**جریان درست (v51+):**
```
کاربر عکس انتخاب کند → فشرده‌سازی در مرورگر → POST /upload/tribe-logo
→ S3 آپلود → toProxyUrl → /api/stream/media?key=images%2Fxxx.webp
→ ذخیره در DB → نمایش از طریق Backend proxy ✅
```

---

## تغییرات نسخه فعلی (v46)

### نوار پیشرفت آپلود صوتی توضیحات — پنل ادمین

**مشکل:** هنگام آپلود فایل صوتی توضیحات دوره یا محصول، فقط متن «در حال آپلود...» نمایش داده می‌شد و درصد پیشرفت مشخص نبود.

**فایل‌های تغییریافته:**
- `artifacts/admin-panel/src/pages/Courses.tsx` — `CourseForm`
- `artifacts/admin-panel/src/pages/Products.tsx` — `ProductForm`

**تغییرات:**
1. State جدید `audioUploadProgress` (عدد ۰ تا ۱۰۰) اضافه شد
2. `uploadFile` به `uploadFileWithProgress` تبدیل شد با callback پیشرفت
3. UI: متن «در حال آپلود... ۴۲٪» + نوار پیشرفت طلایی زیر label

**رفتار جدید:**
- متن: «در حال آپلود... X%»
- نوار پیشرفت به رنگ primary (طلایی) با `transition-all duration-200`
- بعد از اتمام، state ریست می‌شود

---

## تغییرات نسخه (v45)

### فیکس Product Audio و Course Intro Audio — پروکسی کامل از طریق Backend

**مشکل:** پنل ادمین هنگام آپلود فایل صوتی توضیحات محصول یا دوره، URL خام Object Storage
(`https://c163573.parspack.net/audios/...`) را مستقیم در `<audio src>` استفاده می‌کرد.
چون bucket خصوصی (private-ACL) است، مرورگر 403 Forbidden دریافت می‌کرد.

**ریشه مشکل:**
- `POST /upload/audio` پس از آپلود، URL خام S3 را برمی‌گرداند (`res.json({ url })`)
- `Products.tsx` و `Courses.tsx` این URL را مستقیم در state و `<audio src>` می‌گذارند
- bucket خصوصی → مرورگر 403 می‌گیرد

**راه‌حل پیاده‌سازی‌شده:**

**۱. `streamAudioFile()` در `stream.ts` — پشتیبانی از سه فرمت URL در دیتابیس:**
| فرمت | مثال | نحوه مدیریت |
|------|------|-------------|
| Proxy URL (جدید v45+) | `/api/stream/media?key=audios%2Fxxx.mp3` | استخراج key و stream مستقیم از S3 |
| Raw S3 URL (قدیمی) | `https://c163573.parspack.net/audios/xxx.mp3` | `keyFromUrl()` + stream از S3 |
| Local disk (dev) | `/api/uploads/audios/xxx.mp3` | stream از دیسک |

**۲. `POST /upload/audio` در `upload.ts` — بازگشت Proxy URL:**
- قبلاً: `res.json({ url })` — URL خام S3
- حالا: `res.json({ url: toProxyUrl(url) ?? url })` — URL پروکسی‌شده

**۳. همین fix برای `POST /upload/podcast-audio` و `POST /upload/channel-voice` هم اعمال شد.**

**فایل‌های تغییریافته:**
- `artifacts/api-server/src/routes/stream.ts` — `streamAudioFile()` با پشتیبانی از proxy URL
- `artifacts/api-server/src/routes/upload.ts` — `toProxyUrl` import + هر سه endpoint صوتی

**سازگاری با نسخه‌های قدیمی:**
- URL‌های خام S3 قدیمی در دیتابیس (اگر وجود داشته باشند) همچنان کار می‌کنند
- URL‌های local disk همچنان کار می‌کنند
- Frontend (PWA) نیازی به هیچ تغییری ندارد — `sanitizeProduct/sanitizeCourse` همچنان `/api/stream/audio/product/:id` برمی‌گردانند

**جریان کامل Product/Course Audio (v45+):**
```
Admin آپلود → POST /upload/audio → S3 store → toProxyUrl → /api/stream/media?key=audios%2Fxxx.mp3
                                                              ↓
Admin preview:  <audio src="/api/stream/media?key=..."> → GET /stream/media?key=... → S3 proxy ✅
DB store:       audioUrl = "/api/stream/media?key=audios%2Fxxx.mp3"
GET /products:  sanitizeProduct → audioUrl = "/api/stream/audio/product/:id"
Stream:         GET /stream/audio/product/:id → DB read → streamAudioFile(proxy URL) → S3 proxy ✅
```

---

    ## تغییرات نسخه فعلی (v44)

    ### معماری استاندارد Media Service — احراز هویت از طریق HttpOnly Cookie

    **هدف:** Frontend هیچ JWT، Authorization Header یا Query Token به URL فایل‌های Media اضافه نکند. تمام احراز هویت داخل Backend انجام شود.

    **علت مشکل قبلی:**
    - `course-detail.tsx` به `/api/stream/lesson/:id?token=...` توکن اضافه می‌کرد
    - `stream.ts` تابع `acceptTokenFromQuery` داشت که توکن را از query string می‌خواند
    - این روش ناامن، غیراستاندارد و غیرقابل توسعه بود

    **راه‌حل پیاده‌سازی‌شده:**
    - هنگام login/register، Backend یک HttpOnly Cookie (`shivafer_media`) با همان JWT تنظیم می‌کند
    - مرورگر این کوکی را به‌صورت خودکار با تمام درخواست‌ها (از جمله `<video src>` و `<audio src>`) ارسال می‌کند
    - Frontend فقط URL ساده بدون هیچ token ارسال می‌کند

    **فایل‌های تغییریافته:**
    - `artifacts/api-server/src/middlewares/auth.ts` — `requireUserViaMedia` + `setMediaCookie` + `clearMediaCookie`
    - `artifacts/api-server/src/routes/auth.ts` — `setMediaCookie` در verify-otp، login-password، register-verify + endpoint جدید `POST /auth/logout`
    - `artifacts/api-server/src/routes/stream.ts` — حذف `acceptTokenFromQuery`؛ جایگزینی با `requireUserViaMedia`
    - `artifacts/shivafer-pwa/src/pages/course-detail.tsx` — حذف `?token=...` از URL ویدیو و offline cache
    - `artifacts/shivafer-pwa/src/lib/auth.tsx` — logout اکنون `POST /api/auth/logout` صدا می‌زند تا کوکی پاک شود

    **Endpoint جدید:**
    - `POST /api/auth/logout` — کوکی `shivafer_media` را پاک می‌کند

    **معماری Media Cookie:**
    | Cookie | shivafer_media |
    |--------|---------------|
    | HttpOnly | true (JavaScript نمی‌تواند بخواند/بنویسد) |
    | Secure | true (فقط HTTPS — production) |
    | SameSite | Lax |
    | MaxAge | 30 روز (همسان با JWT expiry) |

    **معماری نهایی Media Auth:**
    | نوع درخواست | روش Auth |
    |------------|----------|
    | API call (fetch/axios) | Authorization: Bearer header |
    | `<video src="...">` | HttpOnly cookie (خودکار توسط مرورگر) |
    | `<audio src="...">` | HttpOnly cookie (خودکار توسط مرورگر) |
    | Offline cache fetch | HttpOnly cookie (خودکار) |
    | آینده: PDF، تصاویر خصوصی | HttpOnly cookie (خودکار) |

    **برای اضافه کردن Media type جدید:**
    فقط از `requireUserViaMedia` روی endpoint جدید استفاده کن — Frontend هیچ تغییری نمی‌خواهد.

    ---

    ## تغییرات نسخه فعلی (v43)

### پروکسی کامل Object Storage — تمام رسانه‌ها

**هدف:** هیچ URL مستقیم S3 (parspack.net) به Frontend ارسال نشود — برای تمام انواع رسانه.

**فایل‌های تغییریافته:**
- `artifacts/api-server/src/lib/storage/index.ts` — تابع `toProxyUrl(url)` اضافه شد
- `artifacts/api-server/src/routes/stream.ts` — Endpoint جدید `/api/stream/media` + فیکس Reel proxy
- `artifacts/api-server/src/routes/courses.ts` — پروکسی imageUrl و audioUrl در تمام response‌ها
- `artifacts/api-server/src/routes/products.ts` — پروکسی imageUrl و audioUrl در تمام response‌ها
- `artifacts/api-server/src/routes/audio.ts` — پروکسی coverUrl پادکست‌ها

**Endpoint جدید:**
- `GET /api/stream/media?key=<encoded_s3_key>` — پروکسی عمومی برای تصاویر و فایل‌ها

**فیکس‌های مهم:**
- Reel‌ها به‌جای redirect، از streamViaStorage استفاده می‌کنند (bucket خصوصی → 403 رفع شد)
- GET /courses: imageUrl و audioUrl همه دوره‌ها تبدیل می‌شوند
- GET /products: imageUrl و audioUrl همه محصولات تبدیل می‌شوند
- attachments.fileUrl در جلسات دوره هم از طریق proxy ارسال می‌شود

**معماری نهایی پروکسی:**
| نوع | Endpoint |
|-----|---------|
| ویدیوی جلسه (خصوصی) | /api/stream/lesson/:id |
| صوت جلسه | /api/stream/audio/lesson/:id |
| صوت دوره | /api/stream/audio/course/:id |
| صوت محصول | /api/stream/audio/product/:id |
| صوت پادکست | /api/stream/audio/podcast/:id |
| ریل ویدیو | /api/stream/reel/:id (اکنون proxy، نه redirect) |
| تصویر / فایل | /api/stream/media?key=... (جدید v43) |

---

## تغییرات نسخه قبلی (v42)

### دسترسی امن به Object Storage — پروکسی صوتی

**هدف:** هیچ URL مستقیم S3 (parspack.net) به Frontend ارسال نشود. تمام فایل‌های صوتی از طریق Backend پروکسی می‌شوند.

**فایل‌های تغییریافته:**
- `artifacts/api-server/src/routes/stream.ts` — چهار endpoint جدید برای پروکسی صوتی
- `artifacts/api-server/src/routes/courses.ts` — بازنویسی `audioUrl` جلسات به proxy endpoint
- `artifacts/api-server/src/routes/audio.ts` — بازنویسی `audioUrl` پادکست‌ها به proxy endpoint
- `artifacts/api-server/src/routes/products.ts` — بازنویسی `audioUrl` محصولات به proxy endpoint

**Endpoint های جدید:**
- `GET /api/stream/audio/lesson/:lessonId` — صوت جلسه (نیاز به auth برای جلسات غیررایگان)
- `GET /api/stream/audio/course/:courseId` — صوت توضیحات دوره (عمومی)
- `GET /api/stream/audio/product/:productId` — صوت توضیحات محصول (عمومی)
- `GET /api/stream/audio/podcast/:postId` — پست صوتی (عمومی)

**معماری:**
- تابع `streamAudioFile()` در stream.ts برای هر دو نوع فایل: محلی و Object Storage
- اگر فایل در S3 باشد: از `streamViaStorage()` موجود استفاده می‌شود (همان مکانیزم ویدیو)
- اگر فایل محلی باشد (`/api/uploads/...`): مستقیم از دیسک stream می‌شود
- Frontend نیازی به تغییر ندارد — فقط Endpoint داخلی Backend فراخوانی می‌شود

**جداول پوشش‌داده‌شده:**
| جدول | Endpoint پروکسی |
|------|----------------|
| `course_lessons.audio_url` | `/api/stream/audio/lesson/:id` |
| `courses.audio_url` | `/api/stream/audio/course/:id` |
| `products.audio_url` | `/api/stream/audio/product/:id` |
| `audio_posts.audio_url` | `/api/stream/audio/podcast/:id` |

**Backward Compatibility:**
- فایل‌های صوتی قدیمی محلی (`/api/uploads/audios/xxx.mp3`) همچنان بدون تغییر کار می‌کنند
- فایل‌های Object Storage بدون Public بودن Bucket قابل پخش هستند

---

## تغییرات نسخه v41 (قبلی)

### یکپارچه‌سازی کامل آپلود صوتی با Object Storage

**هدف:** هر فایل صوتی دقیقاً مانند ویدیو باید از Object Storage (S3) ذخیره و سرو شود.

**فایل‌های تغییریافته:**
- `artifacts/api-server/src/routes/upload.ts` — سه endpoint آپلود صوتی

**تغییرات:**
- حذف کامل fallback ذخیره‌سازی محلی از هر سه endpoint:
  - `POST /upload/audio` (admin)
  - `POST /upload/podcast-audio`
  - `POST /upload/channel-voice`
- اگر S3 پیکربندی نشده باشد، پاسخ `503` برمی‌گردد (به‌جای ذخیره روی دیسک)
- اضافه شدن `cacheControl: "public, max-age=31536000, immutable"` به دو endpoint که نداشتند
- تمام فایل‌های صوتی جدید مستقیماً زیر `audios/` در Object Storage ذخیره می‌شوند

**فایل جدید:** `scripts/src/migrate-audio-urls.ts`

اسکریپت migration برای انتقال فایل‌های صوتی قدیمی از دیسک سرور به Object Storage.

**جداول پوشش‌داده‌شده:**
- `products.audio_url`
- `courses.audio_url`
- `course_lessons.audio_url`
- `audio_posts.audio_url`

**رفتار:**
- فایل را از `$UPLOAD_DIR/audios/<filename>` می‌خواند
- آپلود به S3 زیر `audios/<filename>`
- بعد از تأیید موفقیت آپلود (HeadObject)، URL دیتابیس آپدیت می‌شود
- idempotent — اگر فایل قبلاً در S3 بود، فقط URL دیتابیس آپدیت می‌شود
- فایل‌هایی که روی دیسک پیدا نمی‌شوند skip می‌شوند و گزارش می‌شوند

**دستور اجرا:**
```bash
S3_ENDPOINT=https://c163573.parspack.net \
S3_REGION=us-east-1 \
S3_BUCKET=c163573 \
S3_ACCESS_KEY=... \
S3_SECRET_KEY=... \
S3_PUBLIC_BASE_URL=https://c163573.parspack.net \
DATABASE_URL=... \
UPLOAD_DIR=/var/www/uploads \
pnpm --filter @workspace/scripts run migrate-audio-urls
```

**به‌روزرسانی scripts/package.json:**
- اضافه شدن script: `"migrate-audio-urls": "tsx ./src/migrate-audio-urls.ts"`

**معماری نهایی رسانه:**
| نوع | ذخیره‌سازی | fallback محلی |
|-----|------------|----------------|
| تصویر | دیسک سرور | دارد (عمداً تغییر نمی‌کند) |
| ویدیو | Object Storage | دارد (برای dev بدون S3) |
| صوت | Object Storage | **ندارد** — v41+ |

---


## تغییرات نسخه فعلی (v40)

### اسکریپت Migration ویدیوها به Object Storage

**فایل جدید:** `scripts/src/migrate-video-urls.ts`

این اسکریپت تمام URL‌های ویدیویی قدیمی (فرمت local) را در دیتابیس به فرمت جدید Object Storage تبدیل می‌کند.

**جداول پوشش‌داده‌شده:**
- `course_lessons.video_url`
- `reels.video_url`

**URL قدیمی:** `https://shivafaracademy.ir/api/uploads/videos/<filename>`
**URL جدید:** `<S3_PUBLIC_BASE_URL>/videos/<filename>`

**ویژگی‌ها:**
- idempotent — چندین بار اجرا کردن مشکلی ندارد
- قبل از آپدیت هر رکورد، وجود فایل در S3 بررسی می‌شود (HeadObject)
- رکوردهایی که فایلشان در S3 نیست آپدیت **نمی‌شوند** (فقط گزارش می‌شوند)
- گزارش کامل: Total scanned / Updated / Already correct / Missing in S3 / Failed

**دستور اجرا:**
```bash
S3_ENDPOINT=https://c163573.parspack.net \
S3_REGION=us-east-1 \
S3_BUCKET=c163573 \
S3_ACCESS_KEY=... \
S3_SECRET_KEY=... \
S3_PUBLIC_BASE_URL=https://c163573.parspack.net \
DATABASE_URL=... \
pnpm --filter @workspace/scripts run migrate-video-urls
```

**validation:** بعد از اجرا، لاگ `stream/lesson` باید `stream: fetching from storage` نشان دهد نه `URL not from current storage, redirecting`.

**تغییرات در scripts/package.json:**
- اضافه شدن script: `"migrate-video-urls": "tsx ./src/migrate-video-urls.ts"`
- اضافه شدن dependency: `"@aws-sdk/client-s3": "^3.830.0"`

---


## تغییرات نسخه فعلی (v37)

### معماری جدید Object Storage (S3-Compatible)

تمام آپلودهای پروژه از این نسخه از طریق **StorageService** انجام می‌شود.

**فایل‌های جدید:**
- `artifacts/api-server/src/lib/storage/provider.ts` — StorageProvider interface
- `artifacts/api-server/src/lib/storage/s3-provider.ts` — S3StorageProvider (برای AWS S3، Cloudflare R2، MinIO، ParsPack و غیره)
- `artifacts/api-server/src/lib/storage/service.ts` — StorageService (Dependency Injection)
- `artifacts/api-server/src/lib/storage/index.ts` — singleton factory + `isStorageConfigured()`

**فایل‌های تغییریافته:**
- `artifacts/api-server/src/routes/upload.ts` — تمام endpointها از S3 استفاده می‌کنند؛ تصاویر با in-memory sharp به WebP تبدیل می‌شوند؛ ویدیوها پس از پردازش ffmpeg آپلود می‌شوند
- `artifacts/api-server/src/routes/stream.ts` — پشتیبانی از URL‌های Object Storage در کنار فایل‌های local (backward compat)؛ ویدیوهای دوره proxy-stream می‌شوند؛ reelها به public URL هدایت می‌شوند
- `artifacts/api-server/src/routes/payment.ts` — رسید پرداخت مستقیماً به S3 آپلود می‌شود
- `artifacts/api-server/package.json` — اضافه شدن `@aws-sdk/client-s3` و `@aws-sdk/s3-request-presigner`
- `artifacts/api-server/build.mjs` — حذف `@aws-sdk/*` از externals (اکنون داخل bundle قرار می‌گیرد)

**متغیرهای ENV جدید (به فایل `.env` سرور اضافه شوند):**
```env
S3_ENDPOINT=https://c163573.parspack.net
S3_REGION=us-east-1
S3_BUCKET=c163573
S3_ACCESS_KEY=...
S3_SECRET_KEY=...
S3_PUBLIC_BASE_URL=https://c163573.parspack.net
```

**Backward Compatibility:**
- اگر متغیرهای S3 تنظیم نشده باشند، سیستم به‌صورت خودکار به دیسک fallback می‌کند (هیچ تغییری در رفتار فعلی)
- URL‌های قدیمی `/api/uploads/...` در دیتابیس همچنان پشتیبانی می‌شوند
- Frontend هیچ تغییری نیاز ندارد

---

## تغییرات نسخه قبلی (v33)

### یکپارچه‌سازی کامل پایگاه دانش جدید در چت‌بات
- چت‌بات حالا از **تمام** جداول پایگاه دانش جدید استفاده می‌کند: `kb_knowledge_items`، `kb_faqs`، `kb_objections`، `kb_success_stories`
- RAG بهبود یافته: جستجو در همه جداول، حداکثر ۸ نتیجه برتر
- پیام‌های proactive هم از دانش کامل پایگاه جدید بهره می‌برند

---

### بهبود Wizard ثبت تراکنش
- دکمه شناور طلایی ثبت تراکنش کمی بالاتر از لبه پایین صفحه قرار گرفته است.
- Wizard ثبت تراکنش به‌صورت پنجره مرکزی باز می‌شود و دیگر به پایین صفحه نمی‌چسبد.
- فوکوس خودکار فیلد مبلغ حذف شده است؛ کیبورد فقط پس از لمس فیلد توسط کاربر باز می‌شود.

### Wizard ثبت تراکنش درآمد و هزینه
- فرم ثبت/ویرایش تراکنش در PWA به سه مرحله تبدیل شده است: مبلغ، دسته‌بندی و تاریخ.
- دکمه‌های ادامه/مرحله قبل، نمایش پیشرفت مراحل، اعتبارسنجی مرحله‌ای و خلاصه پیش از ثبت اضافه شده‌اند.
- فیلد توضیحات از UI، API و گزارش Admin حذف شده است.
- ستون قدیمی `note` برای حفظ داده‌های موجود در دیتابیس حذف اجباری نشده؛ داده‌های جدید دیگر آن را نمی‌خوانند یا ذخیره نمی‌کنند.
- buildهای PWA، Admin و API بعد از تغییر تولید می‌شوند.

## تغییرات v33 (2026-07-27)

### یکپارچه‌سازی کامل پایگاه دانش جدید در چت‌بات

**فایل:** `artifacts/api-server/src/routes/ai-chat.ts`

**مشکل:** چت‌بات فقط از جداول قدیمی `knowledge_base` و `chatbot_knowledge` استفاده می‌کرد و جداول جدید
(`kb_knowledge_items`، `kb_faqs`، `kb_objections`، `kb_proof_assets`، `kb_success_stories`) کاملاً نادیده گرفته می‌شدند.

**فیکس:**
1. **Import جداول جدید** — پنج جدول جدید به imports اضافه شدند:
   `kbKnowledgeItemsTable`، `kbFaqsTable`، `kbObjectionsTable`، `kbProofAssetsTable`، `kbSuccessStoriesTable`

2. **RAG (جستجوی متنی)** — بخش RAG که پیام کاربر رو با پایگاه دانش match می‌کنه حالا از همه جداول query می‌گیره:
   - `kb_knowledge_items` → عنوان و محتوا score می‌گیرن
   - `kb_faqs` → سوال و پاسخ کوتاه/کامل score می‌گیرن
   - `kb_objections` → نام اعتراض و چارچوب پاسخ score می‌گیرن
   - `kb_success_stories` → نام دانشجو و نتایج score می‌گیرن
   - حداکثر ۸ نتیجه برتر (به‌جای ۶) به context پرامپت اضافه می‌شن

3. **پیام proactive** — تابع `getChatbotKnowledgeBlock()` (که برای context پیام‌های پیشگیرانه استفاده می‌شه) حالا همه جداول جدید رو هم لود می‌کنه:
   - دانش‌نامه عمومی (`kb_knowledge_items`) به‌صورت دسته‌بندی‌شده
   - سوالات متداول (`kb_faqs`)
   - پاسخ به اعتراضات (`kb_objections`)
   - داستان‌های موفقیت (`kb_success_stories`)

**نتیجه:** چت‌بات و پیام‌های proactive حالا از تمام اطلاعاتی که در پنل ادمین ثبت می‌شه (دانش عمومی، داستان‌های موفقیت، مدارک، سوالات متداول، اعتراضات) استفاده می‌کنند.

---

## به ایجنت بعدی

این پکیج سورس کامل پروژه **شیوافر آکادمی** است. قبل از هر تغییری، فایل `DEPLOY_GUIDE.md` را کامل بخوان.

---

## خلاصه پروژه

یک پلتفرم آموزش آنلاین (آکادمی شیوافر) با:
- **PWA** — اپ موبایل‌وار برای کاربران (React + Vite)
- **Admin Panel** — پنل مدیریت (React + Vite)
- **API Server** — Express 5 + TypeScript + PostgreSQL + Drizzle ORM
- **AI/Voice** — مشاور صوتی سارا (OpenAI GPT-4o + ElevenLabs TTS)

---

## ساختار سورس

```
artifacts/
  api-server/        ← Express API (TypeScript)
  shivafer-pwa/      ← PWA کاربران (React)
    src/assets/
      logo-gold.webp ← لوگوی اصلی با پس‌زمینه شفاف (flood-fill شده)
  admin-panel/       ← پنل ادمین (React)
lib/
  api-client-react/  ← React Query hooks (codegen از OpenAPI)
  api-spec/          ← OpenAPI spec (منبع اصلی contract)
  api-zod/           ← Zod schemas (codegen)
  db/                ← Drizzle ORM schema + migrations
  integrations-openai-ai-react/   ← audio/voice hooks کلاینت
  integrations-openai-ai-server/  ← OpenAI client سرور
```

---

## Stack

| لایه | تکنولوژی |
|------|----------|
| Package manager | pnpm workspaces |
| TypeScript | 5.9 |
| API | Express 5 |
| DB ORM | Drizzle ORM + PostgreSQL |
| Validation | Zod v4 |
| Frontend | React + Vite + Tailwind |
| AI | OpenAI GPT-4o (chat) + ElevenLabs (TTS) + Whisper (STT) |
| API codegen | Orval (از OpenAPI spec) |
| Build API | esbuild |

---

## دستورات توسعه

```bash
# نصب dependencies
pnpm install

# codegen — همیشه قبل از build اجرا کن (فایل‌های generated را می‌سازد)
pnpm --filter @workspace/api-spec run codegen

# اجرای API (dev)
pnpm --filter @workspace/api-server run dev

# build API
pnpm --filter @workspace/api-server run build

# build PWA
PORT=3000 BASE_PATH="/" pnpm --filter @workspace/shivafer-pwa run build

# build Admin
PORT=3001 BASE_PATH="/" pnpm --filter @workspace/admin-panel run build

# push schema به DB
pnpm --filter @workspace/db run push
```

> ⚠️ اگر بعد از `pnpm install` خطای `Could not resolve "./generated/api"` دیدی،
> ابتدا `pnpm --filter @workspace/api-spec run codegen` اجرا کن — فایل‌های generated
> در سورس commit نشده‌اند و باید هر بار ساخته شوند.

---

## تغییرات v9 (2026-07-25)

### ۱. Social Proof Toast — تایم ۱۵ ثانیه
فایل: `artifacts/shivafer-pwa/src/components/social-proof-toast.tsx`
- تایم auto-close از ۸ ثانیه به **۱۵ ثانیه** افزایش یافت

### ۲. Social Proof Toast — صدای اعلان
فایل: `artifacts/shivafer-pwa/src/components/social-proof-toast.tsx`
- تابع `playSocialProofSound()` اضافه شد (سه نت صعودی C5-E5-C6 با Web Audio API)
- هر بار که toast نشون داده می‌شه، صدا پخش می‌شه

### ۳. Social Proof Toast — فیکس محصولات
فایل: `artifacts/shivafer-pwa/src/components/social-proof-toast.tsx`
- `GET /api/products` یک object `{categories:[{products:[]}], uncategorized:[]}` برمی‌گردونه، نه array
- کد قبلی `Array.isArray(products) → false` → هیچ محصولی نشون داده نمی‌شد
- **فیکس:** استخراج از `categories[].products` + `uncategorized` → همه محصولات نشون داده می‌شن

### ۴. Social Proof Toast — جلوگیری از ریست تایمر
- **مشکل:** `SocialProofToast` داخل `Layout` بود؛ Layout در سه Route جداگانه mount می‌شد
  (`/courses/:id`، `/product/:id`، `/:rest*`) → هر navigate = unmount+remount = ریست تایمر
- **فیکس:** `SocialProofToast` از `layout.tsx` حذف و به `App.tsx` منتقل شد (یک بار mount، هرگز ریست نمی‌شه)
- فایل‌های تغییریافته: `layout.tsx` (حذف)، `App.tsx` (اضافه در سطح global)

### ۵. لوگوی Splash Screen
فایل: `artifacts/shivafer-pwa/src/assets/logo-gold.webp`
- لوگوی اصلی آکادمی با پس‌زمینه شفاف (flood-fill از ۴ گوشه با fuzz 25%)
- Vite این فایل را bundle می‌کند با hash: `logo-gold-BtGCB3fL.webp`

---

## نکته مهم deploy (v9+)

**در rsync مربوط به PWA، دیگر `--exclude='*.webp'` ننویس!**
چون لوگوی لوگو bundle شده داخل `assets/` است و باید deploy شود.
به جای آن فقط `icons/` را exclude کن:

```bash
# ✅ درست (v9+)
rsync -a \
  --exclude='icons/*.webp' --exclude='icons/*.png' \
  --exclude='icons/*.jpg' --exclude='icons/*.svg' \
  --exclude='*.mp3' --exclude='*.wav' --exclude='*.ogg' \
  /tmp/shivafer-new/pwa/public/ /var/www/html/

# ❌ اشتباه (قدیمی — لوگو را exclude می‌کرد)
rsync -a \
  --exclude='*.webp' --exclude='*.jpg' ...
```

---

## باگ‌فیکس مهم (v6)

### صدای سارا (TTS)
فایل: `artifacts/api-server/src/routes/openai/voice-advisor.ts`
تابع `openaiTTS` دو مسیر دارد:
1. اگر `VOICE_GATEWAY_SECRET` تنظیم باشد → Gateway اختصاصی استفاده می‌شود
2. اگر نباشد → مستقیم با `ELEVENLABS_API_KEY` به ElevenLabs وصل می‌شود

---

## اطلاعات سرور Production

برای اطلاعات کامل سرور، دستورات بکاپ، deploy و rollback:
👉 **فایل `DEPLOY_GUIDE.md` را بخوان**

خلاصه:
- سرور: Ubuntu 22.04 — IP: 194.180.11.215
- دامنه: shivafaracademy.ir
- API port: **8090**
- ENV: `/var/www/shivafer-deploy/.env`
- سرویس: `systemctl restart shivafer-api`

---

## تغییرات v11 (2026-07-26)

### ۱. فیکس فونت وزیر پنل ادمین
فایل: `artifacts/admin-panel/src/index.css`
- خط `@import "@fontsource-variable/vazirmatn";` اضافه شد (مانند PWA)
- علت مشکل: پکیج نصب بود ولی import در CSS وجود نداشت

### ۲. فیکس صفحه سفید پنل ادمین
- **مشکل:** build با `BASE_PATH="/"` انجام شده بود → asset paths در `index.html` به `/assets/...` اشاره می‌کردند
- **اما:** nginx ادمین را روی `/admin/` سرو می‌کند → JS/CSS لود نمی‌شد → صفحه سفید
- **فیکس:** باید با `BASE_PATH="/admin/"` build شود

## ⚠️ نکته مهم build

| آرتیفکت | دستور صحیح |
|---------|------------|
| PWA | `PORT=3000 BASE_PATH="/" pnpm --filter @workspace/shivafer-pwa run build` |
| Admin | `PORT=3001 BASE_PATH="/admin/" pnpm --filter @workspace/admin-panel run build` |
| API | `pnpm --filter @workspace/api-server run build` |

---

## تغییرات v12 (2026-07-26)

### فیکس صدای Social Proof Toast
فایل: `artifacts/shivafer-pwa/src/components/social-proof-toast.tsx`
- **مشکل:** مرورگر AudioContext جدید بدون gesture کاربر را بلاک می‌کرد
- **فیکس:** یک `_sharedCtx` در سطح module نگه داری می‌شود
- `setupAudioUnlock()` هنگام اولین `click/touchstart/keydown` کاربر AudioContext را resume می‌کند
- `playSocialProofSound()` از context آنلاک‌شده استفاده می‌کند — اگر هنوز gesture نبوده، بی‌صدا رد می‌شود

---

## تغییرات v13 (2026-07-26)

### فیکس صدای Social Proof Toast — روش صحیح
فایل: `artifacts/shivafer-pwa/src/components/social-proof-toast.tsx`
- **مشکل v12:** shared AudioContext پیچیده بود و کار نمی‌کرد
- **فیکس:** دقیقاً همان pattern `playProactiveChime` در layout.tsx — هر بار ctx جدید می‌سازد و بعد از 900ms می‌بندد
- **صدای متفاوت:** G5→C6→E6 با oscillator نوع `triangle` (رنگ فلزی/سکه) در مقابل دینگ-دینگ چت‌بات (A5→D6، نوع `sine`)

---

## تغییرات v14 (2026-07-26)

### فیکس نهایی پخش صدای اعلان‌ها در موبایل

فایل‌های مرتبط:
- `artifacts/shivafer-pwa/src/lib/audio-unlock.ts`
- `artifacts/shivafer-pwa/src/components/layout.tsx`
- `artifacts/shivafer-pwa/src/components/social-proof-toast.tsx`
- `artifacts/shivafer-pwa/src/main.tsx`

- **مشکل:** اگر پیام پیش‌گیرانه‌ی Chatbot یا Social Proof بعد از یک timer/API callback نمایش داده می‌شد، ساختن `AudioContext` جدید ممکن بود در iOS/Safari به‌دلیل محدودیت autoplay در حالت `suspended` بماند و صدا پخش نشود.
- **فیکس:** یک `AudioContext` مشترک در سطح ماژول نگه‌داری می‌شود و با اولین `click`، `touchstart` یا `keydown` کاربر unlock می‌شود.
- هر دو صدای `playProactiveChime` و `playSocialProofSound` فقط از همین context فعال استفاده می‌کنند و دیگر برای هر اعلان context جدید نمی‌سازند یا آن را می‌بندند.
- اگر کاربر تا زمان نمایش اعلان هیچ تعامل مستقیمی با صفحه نداشته باشد، محدودیت autoplay مرورگر همچنان مانع پخش خودکار صدا می‌شود.

### خروجی‌های آماده

- بسته‌ی توسعه: سورس کامل PWA، API، Admin، libها، قرارداد OpenAPI، schema دیتابیس، configها و lockfile؛ بدون `node_modules` و build cache.
- بسته‌ی deploy: خروجی build شده‌ی API، PWA و Admin در ساختار مناسب دستورات `DEPLOY_GUIDE.md`.

---

## تغییرات v17 (2026-07-26)

### فیکس آیکون بلندگو در صفحه Reels
فایل: `artifacts/shivafer-pwa/src/pages/reels.tsx`
- **مشکل:** آیکون‌های `Volume2` و `VolumeX` روی تم روشن دیده نمی‌شدند
- **فیکس:** اضافه کردن `color="white"` مستقیم روی هر دو آیکون (prop مستقیم SVG، مستقل از CSS inheritance)

---

## تغییرات v18 (2026-07-26)

### فیکس رنگ طلایی در تم روشن
فایل: `artifacts/shivafer-pwa/src/index.css`
- **مشکل:** در light mode آیکون‌ها، عنوان‌ها، نوار ناوبری و دکمه‌های طلایی به رنگ قهوه‌ای تاریک دیده می‌شدند
- **فیکس:** همه متغیرهای رنگ primary در light mode به رنگ طلایی واقعی اصلاح شدند:

| متغیر | قبل | بعد |
|--------|------|------|
| `--color-gold` | `#7a5400` | `#c49a00` |
| `--primary` | `hsl(43,95%,30%)` | `hsl(43,88%,40%)` |
| `--nav-icon-active` | `hsl(43,95%,28%)` | `hsl(43,88%,40%)` |
| `--nav-label-active` | `hsl(43,95%,28%)` | `hsl(43,88%,40%)` |
| `--btn-gold-mid` | `#cc7a00` | `#e8b800` |
| `--brand-name-gradient` | قهوه‌ای تاریک | طلایی |
| `--nav-active-pill-*` | `rgba(140,85,0,...)` | `rgba(196,154,0,...)` |

---

## تغییرات v19 (2026-07-26)

### پنل ادمین — هدر sticky و غیرفعال کردن zoom

**فایل ۱:** `artifacts/admin-panel/src/components/Layout.tsx`
- **مشکل:** هدر موبایل (همبرگر منو) با اسکرول صفحه حرکت می‌کرد
- **فیکس:** اضافه کردن `sticky top-0 z-40` به className هدر

**فایل ۲:** `artifacts/admin-panel/index.html`
- **مشکل:** تپ روی المان‌ها باعث زوم می‌شد
- **فیکس:** اضافه کردن `maximum-scale=1.0, user-scalable=no` به viewport meta tag

---

## تغییرات v20 (2026-07-26)

### فیکس تم روشن — صفحه جزئیات محصول (product-detail)

**فایل ۱:** `artifacts/shivafer-pwa/src/index.css`
- **مشکل ۱:** کلاس‌های Tailwind `text-white/90` در تم روشن override نمی‌شدند → متن‌های "محتوای محصول شما"، "پارت یک" و سایر عناوین با این کلاس روی پس‌زمینه روشن ناپدید می‌شدند
- **فیکس ۱:** اضافه کردن `text-white/90` به لیست light-mode overrides: `color: rgba(0,0,0,0.82)`
- **مشکل ۲:** دکمه «شما این محصول رو دارین» با رنگ سبز روشن `#4ade80` روی پس‌زمینه روشن به سختی دیده می‌شد
- **فیکس ۲:** اضافه کردن کلاس `product-owned-btn` + override در CSS با سبز تیره `#15803d`

**فایل ۲:** `artifacts/shivafer-pwa/src/pages/product-detail.tsx`
- اضافه کردن کلاس `product-owned-btn` به div دکمه owned (برای هدف‌گیری CSS override)

---

## تغییرات v21 (2026-07-26)

### ۱. انیمیشن peek توضیحات محصول
فایل: `artifacts/shivafer-pwa/src/pages/product-detail.tsx`
- کامپوننت `DescriptionSection` انیمیشن peek دارد: ۳.۸ ثانیه بعد از لود، باکس توضیحات کمی باز می‌شود و نرم برمی‌گردد
- هر ۳.۸ ثانیه یک‌بار تکرار می‌شود (فقط وقتی باکس بسته است)
- دکمه پخش صدا داخل توضیحات: اگر `audioUrl` داشته باشد، visualizer متحرک نشان می‌دهد

### ۲. فیلد صدای توضیحات در پنل ادمین — Products
فایل: `artifacts/admin-panel/src/pages/Products.tsx`
- فیلد آپلود فایل صوتی اضافه شد (هم ایجاد، هم ویرایش)
- محصولات موجود هم می‌توانند صدا داشته باشند

### ۳. فیلد صدای توضیحات در پنل ادمین — Courses
فایل: `artifacts/admin-panel/src/pages/Courses.tsx`
- همان فیلد برای دوره‌ها (هم ایجاد، هم ویرایش)

### ۴. API — audioUrl
- `audioUrl` قبلاً در POST/PUT پشتیبانی می‌شد — نیازی به تغییر API نبود

---

## ⚠️ باگ مهم deploy (v21) — فیکس شده در DEPLOY_GUIDE

**مشکل:** ساختار tar دیپلوی از v21 به بعد تغییر کرد:
- فایل‌های build مستقیماً در `pwa/`، `admin/`، `api/` هستند
- **بدون** زیرپوشه‌ی `public/` یا `dist/`

**اشتباه رایج:** استفاده از مسیرهای قدیمی (`pwa/public/`، `admin/public/`، `api/dist/`) باعث می‌شود rsync exit code 0 برگرداند ولی **هیچ‌چیزی کپی نشود** — deploy به‌نظر موفق می‌آید اما تغییرات روی سرور اعمال نمی‌شوند.

**مسیرهای صحیح (v21+):**

| بخش | مسیر اشتباه (قدیمی) | مسیر صحیح |
|-----|---------------------|------------|
| API | `api/dist/` | `api/` |
| PWA | `pwa/public/` | `pwa/` |
| Admin | `admin/public/` | `admin/` |

👉 **دستورات کامل در `DEPLOY_GUIDE.md`**

---

## تغییرات v26 (2026-07-27)

### رفع رنگ متن در تم روشن (AudioDescriptionPlayer)

**علت ریشه‌ای:** `index.css` دارای override با `!important` است که تمام کلاس‌های `text-white/XX` را در `:root.light` به رنگ تیره تبدیل می‌کند. این override حتی از `style={{ color }}` روی container قوی‌تر است.

**راه‌حل:** حذف تمام کلاس‌های `text-white/XX` و جایگزینی با inline `style={{ color: "rgba(255,255,255,X)" }}` روی هر element:
- عنوان محصول/دوره در کارت دعوت
- دکمه بستن (X) کارت دعوت
- متن سوال کارت دعوت + span صوتی
- عنوان در پلیر شناور
- زمان در پلیر شناور
- دکمه بستن (X) پلیر شناور

---

## تغییرات v25 (2026-07-27)

### رفع سه باگ در AudioDescriptionPlayer

**فایل:** `artifacts/shivafer-pwa/src/components/audio-description-player.tsx`

1. **نوار پیشرفت از چپ به راست** — `right:0` → `left:0`، gradient از `270deg` → `90deg`، thumb از `right:` → `left:`، ratio کلیک: حذف `1 -`
2. **رنگ متن در تم روشن (invite card)** — `style={{ color: "#ffffff" }}` به container `<div dir="rtl">` اضافه شد تا همه متن‌ها همیشه سفید باشند
3. **رنگ متن در تم روشن (floating player)** — همان fix برای `<div dir="rtl">` پلیر شناور

---

## تغییرات v24 (2026-07-27)

### رفع دو باگ در AudioDescriptionPlayer

**فایل:** `artifacts/shivafer-pwa/src/components/audio-description-player.tsx`

1. **جهت shimmer تصحیح شد** — مقادیر `initial`/`animate` جابجا شدند تا در layout راست‌چین از چپ به راست برود (`x: "130%"` → `x: "-130%"`)
2. **تداخل پلیر با دکمه خرید رفع شد** — مقدار default `bottomStyle` از `+12px` به `+96px` افزایش یافت تا پلیر بالای دکمه‌های خرید product-detail و course-detail قرار گیرد

---

## تغییرات v23 (2026-07-26)

### کارت دعوت صوتی + پلیر شناور در صفحات جزئیات

**فایل جدید:** `artifacts/shivafer-pwa/src/components/audio-description-player.tsx`

کامپوننت `<AudioDescriptionPlayer>` دو بخش دارد:

#### ۱. کارت دعوت (Invite Card)
- **شرط نمایش:** کاربر آیتم را نداشته باشد (`!owned`) و آیتم `audioUrl` داشته باشد
- **تایم:** ۲ تا ۵ ثانیه بعد از ورود به صفحه (random delay)
- **طراحی:** glassmorphism تیره با بوردر رنگی محصول/دوره، دکمه Play بزرگ + shimmer، نوارهای صوتی دکوراتیو متحرک، انیمیشن ورود Spring
- **پیام:** «تمایل دارید توضیحات این محصول/دوره را صوتی بشنوید؟»
- دکمه ✕ برای dismiss

#### ۲. پلیر شناور (Floating Player)
- هنگام کلیک Play، کارت دعوت بسته می‌شود و پلیر شناور باز می‌شود
- پلیر fixed در پایین صفحه (بالای نوار ناوبری)، z-index=70
- دکمه Play/Pause + Close + نوار پیشرفت قابل کلیک (scrubbing)
- نوارهای صوتی متحرک در حین پخش
- نمایش زمان جاری / کل
- کاربر می‌تواند همزمان در صفحه scroll کند

**فایل‌های تغییریافته:**
- `artifacts/shivafer-pwa/src/pages/product-detail.tsx` — اضافه کردن `<AudioDescriptionPlayer>` برای محصولات با `audioUrl` که کاربر ندارد
- `artifacts/shivafer-pwa/src/pages/course-detail.tsx` — همان برای دوره‌ها

**رنگ‌بندی:**
- محصول: از `meta.color` (رنگ دسته‌بندی محصول)
- دوره: بنفش `#7c3aed`

---

## تغییرات v22 (2026-07-26)

### فیکس زمان‌بندی انیمیشن peek توضیحات محصول
فایل: `artifacts/shivafer-pwa/src/pages/product-detail.tsx`

| پارامتر | قبلی | جدید |
|---------|------|------|
| وقفه باز ماندن | ۱۳۰۰ ms | ۲۵۰۰ ms |
| سرعت بسته شدن | ۰.۴s | ۰.۸s |
| سرعت باز شدن | ۰.۵۵s | ۰.۹s |

- انیمیشن باز/بسته با `variants` جداگانه پیاده شد تا هر مرحله duration مستقل داشته باشد
- ease بسته شدن: `[0.4, 0, 0.2, 1]` (smooth ease-out)
- ease باز شدن: `[0.34, 1.2, 0.64, 1]` (spring bounce ملایم)

---

## تغییرات v29 (2026-07-27)

### ۱. آیکون خودکار برای دسته‌بندی‌های سفارشی
فایل: `artifacts/shivafer-pwa/src/pages/income-expense.tsx`
- تابع `getCatIcon(name)` اضافه شد که برای دسته‌بندی‌های پیشفرض آیکون مشخص، و برای سفارشی‌ها یک آیکون ثابت (از `FALLBACK_ICON_POOL`) بر اساس hash نام انتخاب می‌کند
- آیکون برای هر دسته سفارشی همیشه یکسان است (deterministic) و با rerender تغییر نمی‌کند
- `CATEGORY_ICONS[c]` جایگزین `getCatIcon(c)` شد در لیست دسته‌بندی‌ها

### ۲. دکمه حذف برای دسته‌بندی‌های سفارشی
فایل: `artifacts/shivafer-pwa/src/pages/income-expense.tsx`
- **قبلاً:** فقط دسته‌بندی‌های پیشفرض (`ALL_DEFAULT_CATS`) دکمه X داشتند
- **حالا:** همه دسته‌بندی‌ها (پیشفرض و سفارشی) دکمه X دارند
- قبل از حذف، dialog تایید نمایش داده می‌شود («بله، حذف» / «خیر»)
- منطق حذف:
  - دسته پیشفرض → پنهان در localStorage
  - دسته سفارشی API → `DELETE /api/financial/categories/:id`، در صورت خطا fallback به localStorage
  - دسته سفارشی local-only → حذف از state
- `customCatIds` map (نام → id) از `categoriesData.custom` برای شناسایی دسته‌های API

### ۳. برچسب «امروز» در مرحله تاریخ
فایل: `artifacts/shivafer-pwa/src/pages/income-expense.tsx`
- وقتی تاریخ انتخابی برابر امروز باشد، بج «امروز» (طلایی) کنار عنوان «تاریخ (شمسی)» نشان داده می‌شود
- اگر کاربر تاریخ را دستی به روز دیگری تغییر دهد، بج بلافاصله ناپدید می‌شود
- محاسبه از `todayJ` (isoToJalali امروز) انجام می‌شود و با `jYear/jMonth/jDay` state مقایسه می‌شود

---

## تغییرات v30 (2026-07-27)

### ۱. برچسب «امروز» بزرگ‌تر و Bold
فایل: `artifacts/shivafer-pwa/src/pages/income-expense.tsx`
- font-size از `text-[10px]` به `text-sm` افزایش یافت
- padding بزرگتر (`px-3 py-1`) و border ضخیم‌تر (`1.5px`)
- label کل از `text-xs` به `text-sm font-bold` ارتقا یافت

### ۲. کارت امتیاز مالی فشرده و جمع‌وجور
فایل: `artifacts/shivafer-pwa/src/pages/income-expense.tsx`
- padding از `p-4` به `px-3 py-2` کاهش یافت
- آیکون از `w-12 h-12` به `w-7 h-7` کوچک‌تر شد
- عنوان سطح از `text-lg` به `text-sm` کاهش یافت
- اطلاعات «بعدی» درون همان ردیف قرار گرفت — دیگر فضای جداگانه نمی‌گیرد

### ۳. کارت تحلیل هوشمند — طراحی Glassy Liquid
فایل: `artifacts/shivafer-pwa/src/pages/income-expense.tsx`
- پس‌زمینه: gradient ارغوانی-بنفش-آبی با `backdropFilter: blur(16px)`
- سه لایه liquid blob (radial gradient) دکوراتیو در گوشه‌ها
- خط shimmer انعکاسی در بالای کارت
- عنوان «تحلیل هوشمند» با gradient text بنفش-آبی + glow، سایز `text-base font-black`
- آیکون مغز (🧠) با بک‌گراند glassmorphism
- هر پیام در قاب شفاف مجزا با رنگ bullet ترکیبی (بنفش/آبی)

---

## تغییرات v31 (2026-07-27)

### فیکس رنگ متن کارت «تحلیل هوشمند» در تم روشن
فایل‌ها: `artifacts/shivafer-pwa/src/pages/income-expense.tsx`، `src/index.css`

- **مشکل:** پس‌زمینه کارت `rgba(99,102,241,0.18)` در light mode روی صفحه سفید تقریباً شفاف می‌شد → متن سفید ناپدید می‌شد
- **فیکس ۱:** کلاس `smart-analysis-card` به outer div اضافه شد
- **فیکس ۲:** در `index.css` override اضافه شد:
  - `:root.light .smart-analysis-card` → پس‌زمینه تیره بنفش-آبی opaque `rgba(67,56,202,0.88)`
  - `:root.light .smart-analysis-card p, span` → `color: #ffffff !important`
  - `:root.light .smart-analysis-msg-row` → background و border روشن‌تر برای قاب هر پیام
- **نتیجه:** در dark mode ظاهر شفاف/glassy حفظ می‌شود؛ در light mode به رنگ تیره بنفش تبدیل می‌شود تا متن سفید خوانا باشد

---

## v50 — سیستم تخفیف مهمان (Guest Discount)

### فایل‌های جدید/تغییر‌یافته
- `lib/db/src/schema/guest-item-discounts.ts` — جدول `guest_item_discounts`
- `lib/db/src/schema/index.ts` — export جدول جدید
- `lib/db/migrations/add_guest_item_discounts.sql` — migration برای production
- `artifacts/api-server/src/lib/guest-item-discount.ts` — منطق تخفیف مهمان + migration به user
- `artifacts/api-server/src/routes/item-discount.ts` — endpoint: `GET /api/discounts/guest/:type/:id`
- `artifacts/api-server/src/routes/auth.ts` — migration گuestId→userId در هر ۳ endpoint لاگین
- `artifacts/shivafer-pwa/src/lib/guest-id.ts` — utility: `getOrCreateGuestId`, `clearGuestId`, `getGuestId`
- `artifacts/shivafer-pwa/src/pages/product-detail.tsx` — نمایش تخفیف برای مهمان
- `artifacts/shivafer-pwa/src/pages/course-detail.tsx` — نمایش تخفیف برای مهمان
- `artifacts/shivafer-pwa/src/pages/login.tsx` — ارسال `X-Guest-Id` هنگام لاگین
- `artifacts/shivafer-pwa/src/pages/register.tsx` — ارسال `X-Guest-Id` هنگام ثبت‌نام

### نحوه عملکرد
1. مهمان صفحه محصول/دوره را باز می‌کند → guestId در localStorage ساخته می‌شود
2. سرور endpoint `GET /api/discounts/guest/:type/:id` را با `X-Guest-Id` header صدا می‌زند
3. پنجره تخفیف شخصی‌سازی‌شده (مشابه کاربران لاگین‌شده) نمایش داده می‌شود
4. هنگام ثبت‌نام/لاگین، `X-Guest-Id` header ارسال می‌شود → سرور تخفیف‌ها را به کاربر واقعی منتقل می‌کند
5. بعد از لاگین موفق، guestId از localStorage پاک می‌شود

### migration production
```bash
psql -U shivafer -d shivafer -f add_guest_item_discounts.sql
```
