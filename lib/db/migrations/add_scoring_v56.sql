-- Migration v56: موتور امتیازدهی حرفه‌ای
-- تاریخ: 2026-08-05
-- ایمن است — همه ستون‌ها nullable یا دارای default value هستند

-- ۱. امتیاز نهایی ترکیبی در session (میانگین وزن‌دار شاخص‌ها، ۰–۱۰۰)
ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS final_score INTEGER DEFAULT NULL;

-- ۲. نسخهٔ موتور امتیازدهی که session با آن محاسبه شده
ALTER TABLE assessment_sessions
  ADD COLUMN IF NOT EXISTS scoring_version VARCHAR(10) DEFAULT NULL;

-- ۳. سطح‌های کلی تست (برای تعیین سطح نهایی بر اساس finalScore)
--    ساختار: [{ label, minPct, maxPct, description, suggestion }]
ALTER TABLE assessments
  ADD COLUMN IF NOT EXISTS global_levels JSONB DEFAULT NULL;

-- Index برای جستجوی سریع session‌های کامل‌شده با امتیاز
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_final_score
  ON assessment_sessions (assessment_id, final_score)
  WHERE completed_at IS NOT NULL;

-- نمایش وضعیت پس از اجرا
SELECT
  column_name,
  data_type,
  column_default
FROM information_schema.columns
WHERE table_name IN ('assessment_sessions', 'assessments')
  AND column_name IN ('final_score', 'scoring_version', 'global_levels')
ORDER BY table_name, column_name;
