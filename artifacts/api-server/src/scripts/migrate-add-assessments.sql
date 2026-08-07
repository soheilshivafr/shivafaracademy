-- Migration: Add Assessments & Tests System
-- Run this on your production database before deploying the new code

-- ─── assessments ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessments (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT,
  description TEXT,
  cover_image TEXT,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  category TEXT,
  estimated_minutes INTEGER DEFAULT 10,
  start_text TEXT,
  end_text TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  requires_auth BOOLEAN NOT NULL DEFAULT FALSE,
  collect_contact_info BOOLEAN NOT NULL DEFAULT FALSE,
  has_ai_report BOOLEAN NOT NULL DEFAULT FALSE,
  ai_report_price INTEGER DEFAULT 0,
  disclaimer TEXT,
  participant_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── assessment_indices ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessment_indices (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  weight INTEGER NOT NULL DEFAULT 1,
  min_score INTEGER NOT NULL DEFAULT 0,
  max_score INTEGER NOT NULL DEFAULT 100,
  levels JSONB DEFAULT '[]',
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── assessment_questions ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessment_questions (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_required BOOLEAN NOT NULL DEFAULT TRUE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  index_ids JSONB DEFAULT '[]',
  options JSONB DEFAULT '[]',
  conditional_logic JSONB DEFAULT NULL,
  special_message TEXT,
  answer_label TEXT,
  scale_min_label TEXT,
  scale_max_label TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── assessment_sessions ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessment_sessions (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  guest_phone TEXT,
  device_fingerprint TEXT,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  completed_at TIMESTAMP,
  answers JSONB DEFAULT '{}',
  index_scores JSONB DEFAULT '{}',
  total_lead_score_impact INTEGER DEFAULT 0,
  ai_report_purchased BOOLEAN NOT NULL DEFAULT FALSE,
  ai_report_order_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  ai_report TEXT,
  ai_report_generated_at TIMESTAMP,
  ip_address TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── assessment_contact_leads ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assessment_contact_leads (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  session_id INTEGER REFERENCES assessment_sessions(id) ON DELETE SET NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  interested_product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- ─── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assessment_questions_assessment_id ON assessment_questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_assessment_id ON assessment_sessions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user_id ON assessment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_contact_leads_assessment_id ON assessment_contact_leads(assessment_id);

-- ─── Extend orders.item_type to allow 'ai_report' ─────────────────────────────
-- orders.item_type is TEXT, no constraint — no ALTER needed.
-- Just ensure the payment routes accept 'ai_report' as a valid itemType.

SELECT 'Migration complete: assessments system tables created' AS status;
