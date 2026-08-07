-- Migration v57 — Rules Engine برای Tests & Assessments
-- ایمن است: جدول جدید، هیچ تغییری در جداول قدیمی ندارد

CREATE TABLE IF NOT EXISTS assessment_rules (
  id               SERIAL PRIMARY KEY,
  assessment_id    INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  condition_mode   VARCHAR(3) NOT NULL DEFAULT 'all',  -- 'all' (AND) | 'any' (OR)
  conditions       JSONB NOT NULL DEFAULT '[]',
  actions          JSONB NOT NULL DEFAULT '{}',
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_rules_assessment_id
  ON assessment_rules(assessment_id);

CREATE INDEX IF NOT EXISTS idx_assessment_rules_active
  ON assessment_rules(assessment_id, is_active, sort_order);

COMMENT ON TABLE assessment_rules IS 'Rules Engine v57 — قوانین داینامیک برای هر تست';
COMMENT ON COLUMN assessment_rules.condition_mode IS '''all'' = AND (همه شروط) | ''any'' = OR (حداقل یک شرط)';
COMMENT ON COLUMN assessment_rules.conditions IS 'آرایه شروط: [{type, operator, value, indexId?, questionId?}]';
COMMENT ON COLUMN assessment_rules.actions IS 'اقدامات: {suggestedProductIds, suggestedCourseIds, suggestedAssessmentIds, ctaText, ctaUrl, ctaStyle, messageTitle, messageBody, messageBadge, messageBadgeColor, messageIcon}';
