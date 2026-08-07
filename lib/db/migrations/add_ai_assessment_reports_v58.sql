-- Migration v58 — Generic AI Assessment Reports data layer
-- Additive and backward-compatible. Existing assessment AI fields remain readable.

CREATE TABLE IF NOT EXISTS assessment_ai_report_configs (
  id             SERIAL PRIMARY KEY,
  assessment_id  INTEGER NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  is_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  title          TEXT NOT NULL DEFAULT 'گزارش حرفه‌ای AI',
  sales_description TEXT NOT NULL DEFAULT '',
  value_description TEXT NOT NULL DEFAULT '',
  features       JSONB NOT NULL DEFAULT '[]',
  price          INTEGER NOT NULL DEFAULT 0,
  prompt         TEXT NOT NULL DEFAULT '',
  model          VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  max_tokens     INTEGER NOT NULL DEFAULT 1500,
  temperature    NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  tone           VARCHAR(40) NOT NULL DEFAULT 'professional',
  language       VARCHAR(20) NOT NULL DEFAULT 'fa',
  prompt_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  created_at     TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assessment_ai_report_configs_assessment_id
  ON assessment_ai_report_configs(assessment_id);

CREATE TABLE IF NOT EXISTS ai_assessment_reports (
  id                SERIAL PRIMARY KEY,
  user_id           INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assessment_id     INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  attempt_id        INTEGER NOT NULL UNIQUE REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  payment_id        INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  status            VARCHAR(20) NOT NULL DEFAULT 'pending',
  model             VARCHAR(100) NOT NULL,
  prompt_version    VARCHAR(50) NOT NULL,
  generated_content JSONB,
  token_usage      JSONB,
  estimated_cost   NUMERIC(12,6),
  created_at       TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at     TIMESTAMP,
  error            TEXT
);

CREATE INDEX IF NOT EXISTS idx_ai_assessment_reports_assessment_id
  ON ai_assessment_reports(assessment_id);

CREATE INDEX IF NOT EXISTS idx_ai_assessment_reports_user_id
  ON ai_assessment_reports(user_id);