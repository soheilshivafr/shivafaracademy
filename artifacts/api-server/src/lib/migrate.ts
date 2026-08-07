import { pool } from "@workspace/db";
import { logger } from "./logger";

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL UNIQUE,
  name TEXT,
  avatar TEXT,
  password_hash TEXT,
  bound_device_id TEXT,
  wallet_balance INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS otp_codes (
  id SERIAL PRIMARY KEY,
  phone TEXT NOT NULL,
  code TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS admin_users (
  id SERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS courses (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image TEXT,
  thumbnail TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  results TEXT[],
  is_published BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS course_faqs (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  "order" INTEGER DEFAULT 0 NOT NULL
);

CREATE TABLE IF NOT EXISTS course_lessons (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  video_url TEXT,
  duration INTEGER,
  "order" INTEGER DEFAULT 0 NOT NULL,
  is_free BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS course_licenses (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  course_id INTEGER NOT NULL,
  used_by_user_id INTEGER,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_courses (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  course_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image TEXT,
  price INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_products (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  transaction_id TEXT,
  zarinpal_authority TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS reels (
  id SERIAL PRIMARY KEY,
  title TEXT,
  video_url TEXT NOT NULL,
  "order" INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS site_settings (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS chatbot_knowledge (
  id SERIAL PRIMARY KEY,
  category TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  course_id TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tribes (
  id SERIAL PRIMARY KEY,
  chief_user_id INTEGER NOT NULL UNIQUE,
  name TEXT NOT NULL,
  logo TEXT,
  referral_code TEXT NOT NULL UNIQUE,
  bank_card TEXT,
  sheba TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS tribe_members (
  id SERIAL PRIMARY KEY,
  tribe_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL UNIQUE,
  joined_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL,
  reference_id INTEGER,
  description TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS withdrawal_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  amount INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  kyc_national_id_img TEXT,
  kyc_selfie_img TEXT,
  kyc_verified TEXT DEFAULT 'no',
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
`;

const AUDIO_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS audio_posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  audio_url TEXT NOT NULL,
  cover_url TEXT,
  is_published BOOLEAN DEFAULT TRUE NOT NULL,
  fake_views_target INTEGER NOT NULL DEFAULT 5000,
  fake_likes_target INTEGER NOT NULL DEFAULT 300,
  real_views INTEGER NOT NULL DEFAULT 0,
  real_likes INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS audio_likes (
  id SERIAL PRIMARY KEY,
  audio_post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(audio_post_id, user_id)
);

CREATE TABLE IF NOT EXISTS audio_comments (
  id SERIAL PRIMARY KEY,
  audio_post_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  content TEXT NOT NULL,
  approved BOOLEAN DEFAULT FALSE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
`;

// Add columns that may be missing from older deployments
const ALTER_SQL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_balance INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bound_device_id TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS bank_card TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS sheba TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS account_name TEXT;
ALTER TABLE courses ADD COLUMN IF NOT EXISTS thumbnail TEXT;
ALTER TABLE course_licenses ADD COLUMN IF NOT EXISTS course_ids INTEGER[];
ALTER TABLE course_licenses ALTER COLUMN course_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS product_categories (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

ALTER TABLE products ADD COLUMN IF NOT EXISTS category_id INTEGER REFERENCES product_categories(id) ON DELETE SET NULL;
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type TEXT NOT NULL DEFAULT 'other';
ALTER TABLE products ADD COLUMN IF NOT EXISTS files JSONB NOT NULL DEFAULT '[]';
ALTER TABLE products ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}';

INSERT INTO product_categories (name, slug, sort_order) VALUES
  ('کالای فیزیکی', 'physical', 1),
  ('کتاب الکترونیکی', 'ebook', 2),
  ('کتاب چاپی', 'printed-book', 3),
  ('ابزارهای پرمیوم', 'premium-tools', 4),
  ('سمینار', 'seminar', 5),
  ('خدمات', 'services', 6),
  ('مشاوره', 'consulting', 7),
  ('فایل‌های دیجیتال کاربردی', 'digital-files', 8),
  ('عضویت VIP', 'vip-membership', 9),
  ('هیپنوتراپی و جذب خواسته‌ها', 'hypnotherapy', 10),
  ('کوچینگ', 'coaching', 11)
ON CONFLICT (slug) DO NOTHING;

-- One-time welcome proactive flag. When the column is first created, mark all
-- EXISTING users as already-onboarded so they do NOT receive the first-login
-- welcome message. Brand-new rows default to FALSE and qualify on first login.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'welcome_proactive_sent'
  ) THEN
    ALTER TABLE users ADD COLUMN welcome_proactive_sent BOOLEAN NOT NULL DEFAULT FALSE;
    UPDATE users SET welcome_proactive_sent = TRUE;
  END IF;
END $$;
`;

// Seed default admin (username=09354505225, password=s123456)
const SEED_ADMIN_SQL = `
INSERT INTO admin_users (username, password_hash)
VALUES ('09354505225', '$2b$10$zzO60IMHQ/N/NWXRPkD8Wu2UM4cPPmOmnIeLQmFnZMPWOG3VyHubG')
ON CONFLICT (username) DO NOTHING;

INSERT INTO users (phone, password_hash)
VALUES ('09354505225', '$2b$10$zzO60IMHQ/N/NWXRPkD8Wu2UM4cPPmOmnIeLQmFnZMPWOG3VyHubG')
ON CONFLICT (phone) DO NOTHING;
`;

const FINANCIAL_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS financial_transactions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  category_name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT,
  payment_method TEXT,
  receipt_url TEXT,
  is_recurring BOOLEAN DEFAULT FALSE NOT NULL,
  recurring_type TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_categories (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS financial_goals (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  monthly_income_target INTEGER NOT NULL DEFAULT 0,
  monthly_expense_cap INTEGER,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_financial_transactions_user_date
  ON financial_transactions(user_id, date);
`;

const MTP_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS mtp_variants (
  id SERIAL PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  label TEXT NOT NULL,
  full_price INTEGER NOT NULL,
  floor_price INTEGER NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_mtp_discounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  discount_percent INTEGER NOT NULL,
  window_starts_at TIMESTAMP NOT NULL,
  window_ends_at TIMESTAMP NOT NULL,
  source TEXT NOT NULL DEFAULT 'first_login',
  next_offer_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS variant_key TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_percent INTEGER;
`;

const VOICE_CALL_GATE_SQL = `
CREATE TABLE IF NOT EXISTS voice_call_gate (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  tier VARCHAR(1) NOT NULL DEFAULT 'B',
  score INTEGER NOT NULL DEFAULT 0,
  total_calls INTEGER NOT NULL DEFAULT 0,
  calls_this_week INTEGER NOT NULL DEFAULT 0,
  week_start_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_call_at TIMESTAMP,
  next_call_allowed_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

ALTER TABLE voice_call_gate ADD COLUMN IF NOT EXISTS short_calls_forgiven INTEGER NOT NULL DEFAULT 0;
`;

const PAGES_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS page_media (
  id SERIAL PRIMARY KEY,
  page TEXT NOT NULL,
  kind TEXT NOT NULL,
  url TEXT NOT NULL,
  caption TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS student_results (
  id SERIAL PRIMARY KEY,
  type TEXT NOT NULL,
  name TEXT,
  body TEXT,
  media_url TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS page_faqs (
  id SERIAL PRIMARY KEY,
  page TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_published BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
`;

const AI_CHAT_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS support_agents (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_chat_messages (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  session_id VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS user_lead_profiles (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  lead_status VARCHAR(20) NOT NULL DEFAULT 'cold',
  lifecycle_stage VARCHAR(30) NOT NULL DEFAULT 'visitor',
  lead_score INTEGER NOT NULL DEFAULT 0,
  qualification_score INTEGER NOT NULL DEFAULT 0,
  buyer_intent_score INTEGER NOT NULL DEFAULT 0,
  goals TEXT,
  motivations TEXT,
  pains TEXT,
  pleasures TEXT,
  objections TEXT,
  financial_personality VARCHAR(20),
  readiness_score INTEGER,
  conversation_stage VARCHAR(20),
  marital_status VARCHAR(20),
  current_income VARCHAR(20),
  job_status VARCHAR(20),
  investment_capacity VARCHAR(20),
  favorite_product TEXT,
  last_interested_product TEXT,
  vip_status BOOLEAN NOT NULL DEFAULT FALSE,
  ambassador_status BOOLEAN NOT NULL DEFAULT FALSE,
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS lead_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_type VARCHAR(50) NOT NULL,
  product_name TEXT,
  metadata TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS advisor_requests (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  interested_product TEXT,
  source VARCHAR(20) NOT NULL DEFAULT 'chatbot',
  status VARCHAR(20) NOT NULL DEFAULT 'new',
  notes TEXT,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

ALTER TABLE tribes ADD COLUMN IF NOT EXISTS last_leaderboard_rank INTEGER;
`;

const EXTRA_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS knowledge_base (
  id SERIAL PRIMARY KEY,
  category VARCHAR(40) NOT NULL,
  question TEXT NOT NULL,
  answer TEXT NOT NULL,
  action_route VARCHAR(200),
  action_label VARCHAR(60),
  tags TEXT[],
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_tasks (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category VARCHAR(30) NOT NULL DEFAULT 'personal',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  priority VARCHAR(20) NOT NULL DEFAULT 'normal',
  due_at TIMESTAMP,
  reminded_at TIMESTAMP,
  repeat_type VARCHAR(20) NOT NULL DEFAULT 'none',
  repeat_days TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assistant_reminders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id INTEGER,
  task_title TEXT NOT NULL,
  task_category VARCHAR(30) NOT NULL DEFAULT 'personal',
  fired_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP,
  expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS avatar_purchases (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avatar_id VARCHAR(30) NOT NULL,
  price_paid INTEGER NOT NULL DEFAULT 199000,
  purchased_at TIMESTAMP DEFAULT NOW(),
  expires_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS avatar_orders (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  avatar_id VARCHAR(30) NOT NULL,
  amount INTEGER NOT NULL DEFAULT 199000,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  gateway VARCHAR(30),
  gateway_authority VARCHAR(200),
  gateway_ref_id VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS assistant_chat_history (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  kb_entry_id INTEGER REFERENCES knowledge_base(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS leaderboard_campaigns (
  id SERIAL PRIMARY KEY,
  prize_title TEXT NOT NULL,
  award_at TIMESTAMP NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  winner_tribe_id INTEGER,
  winner_tribe_name TEXT,
  winner_chief_name TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS channel_posts (
  id SERIAL PRIMARY KEY,
  content TEXT NOT NULL,
  media_url TEXT,
  media_type TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  view_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS conversations (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id SERIAL PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_faqs (
  id SERIAL PRIMARY KEY,
  question TEXT NOT NULL,
  short_answer TEXT NOT NULL,
  detailed_answer TEXT,
  category VARCHAR(50) NOT NULL DEFAULT 'general',
  product VARCHAR(100),
  intent VARCHAR(100),
  keywords TEXT,
  tags TEXT,
  related_faqs TEXT,
  access_level VARCHAR(20) NOT NULL DEFAULT 'sales',
  priority VARCHAR(10) NOT NULL DEFAULT 'medium',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  shown_count INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_objections (
  id SERIAL PRIMARY KEY,
  objection_name TEXT NOT NULL,
  objection_type VARCHAR(50) NOT NULL,
  discovery_question TEXT,
  response_framework TEXT NOT NULL,
  proof_assets TEXT,
  escalation_rule TEXT,
  product VARCHAR(100),
  access_level VARCHAR(20) NOT NULL DEFAULT 'sales',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  used_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_proof_assets (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  proof_type VARCHAR(30) NOT NULL,
  product VARCHAR(100),
  description TEXT,
  result_type VARCHAR(50),
  tags TEXT,
  objection_tags TEXT,
  priority INTEGER NOT NULL DEFAULT 5,
  visibility VARCHAR(20) NOT NULL DEFAULT 'sales',
  file_url TEXT,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  shown_count INTEGER NOT NULL DEFAULT 0,
  used_count INTEGER NOT NULL DEFAULT 0,
  conversion_impact INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_success_stories (
  id SERIAL PRIMARY KEY,
  student_name TEXT NOT NULL,
  product VARCHAR(100),
  before_state TEXT,
  challenges TEXT,
  actions TEXT,
  results TEXT NOT NULL,
  proof_asset_ids TEXT,
  result_type VARCHAR(50),
  tags TEXT,
  objection_tags TEXT,
  success_score INTEGER NOT NULL DEFAULT 0,
  proof_quality VARCHAR(10) NOT NULL DEFAULT 'bronze',
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  shown_count INTEGER NOT NULL DEFAULT 0,
  conversion_impact INTEGER NOT NULL DEFAULT 0,
  story_date TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS kb_knowledge_items (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  category VARCHAR(50) NOT NULL,
  sub_category VARCHAR(100),
  content TEXT NOT NULL,
  product VARCHAR(100),
  intent VARCHAR(100),
  keywords TEXT,
  tags TEXT,
  access_level VARCHAR(20) NOT NULL DEFAULT 'sales',
  priority INTEGER NOT NULL DEFAULT 5,
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  shown_count INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS proactive_messages (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  endpoint TEXT NOT NULL UNIQUE,
  keys JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS voice_advisor_logs (
  id SERIAL PRIMARY KEY,
  session_id TEXT NOT NULL UNIQUE,
  user_id INTEGER NOT NULL,
  user_phone TEXT,
  user_name TEXT,
  started_at TIMESTAMP DEFAULT NOW() NOT NULL,
  last_activity_at TIMESTAMP DEFAULT NOW() NOT NULL,
  turn_count INTEGER NOT NULL DEFAULT 0,
  gpt_input_tokens INTEGER NOT NULL DEFAULT 0,
  gpt_output_tokens INTEGER NOT NULL DEFAULT 0,
  elevenlabs_chars INTEGER NOT NULL DEFAULT 0,
  estimated_cost_usd REAL NOT NULL DEFAULT 0,
  messages JSON DEFAULT '[]'::json
);
`;

const COURSE_PHASE_ATTACH_SQL = `
ALTER TABLE courses ADD COLUMN IF NOT EXISTS is_phased BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS phase_id INTEGER;

CREATE TABLE IF NOT EXISTS course_phases (
  id SERIAL PRIMARY KEY,
  course_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS lesson_attachments (
  id SERIAL PRIMARY KEY,
  lesson_id INTEGER NOT NULL,
  title TEXT,
  file_url TEXT NOT NULL,
  file_type TEXT,
  file_name TEXT,
  file_size INTEGER,
  "order" INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_course_phases_course ON course_phases(course_id);
CREATE INDEX IF NOT EXISTS idx_lesson_attachments_lesson ON lesson_attachments(lesson_id);
`;

// Step 1: add columns only (no UPDATE here — rows may not exist yet on fresh DB)
const ADMIN_PERMISSIONS_SQL = `
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS is_super_admin BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS permissions TEXT[] NOT NULL DEFAULT '{}';
`;

const ITEM_DISCOUNTS_SQL = `
CREATE TABLE IF NOT EXISTS user_item_discounts (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL,
  item_type TEXT NOT NULL,
  item_id INTEGER NOT NULL,
  discount_percent INTEGER NOT NULL,
  window_starts_at TIMESTAMP NOT NULL,
  window_ends_at TIMESTAMP NOT NULL,
  source TEXT NOT NULL DEFAULT 'first_login',
  next_offer_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL,
  UNIQUE(user_id, item_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_user_item_discounts_lookup ON user_item_discounts(user_id, item_type, item_id);
`;

const ANALYTICS_SQL = `
CREATE TABLE IF NOT EXISTS analytics_events (
  id BIGSERIAL PRIMARY KEY,
  event_type TEXT NOT NULL,
  page TEXT,
  session_id TEXT NOT NULL,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON analytics_events(created_at);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type_page ON analytics_events(event_type, page);

CREATE TABLE IF NOT EXISTS online_sessions (
  session_id TEXT PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  last_seen TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_online_sessions_last_seen ON online_sessions(last_seen);
`;

const CATEGORY_REORDER_SQL = `
UPDATE product_categories SET sort_order = 2  WHERE slug = 'hypnotherapy';
UPDATE product_categories SET sort_order = 10 WHERE slug = 'ebook';
`;

// Step 2: after seeding, guarantee the default super-admins always have is_super_admin = TRUE.
// Runs AFTER SEED_ADMIN_SQL so it covers both fresh-DB (just inserted) and old-DB (existing row).
const FINAL_SUPERADMIN_SQL = `
UPDATE admin_users SET is_super_admin = TRUE
WHERE username IN ('09354505225', 'admin');
`;

// ─── Tracking Links (advertising short-links + attribution) ────────────────
// Idempotent, additive only. No DROP/DELETE/TRUNCATE. Safe to run repeatedly.
const TRACKING_LINKS_SQL = `
CREATE TABLE IF NOT EXISTS tracking_links (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  destination_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  starts_at TIMESTAMP,
  expires_at TIMESTAMP,
  created_by INTEGER,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracking_links_slug ON tracking_links(slug);
CREATE INDEX IF NOT EXISTS idx_tracking_links_active ON tracking_links(is_active);

CREATE TABLE IF NOT EXISTS tracking_clicks (
  id SERIAL PRIMARY KEY,
  tracking_link_id INTEGER NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  user_id INTEGER,
  referrer TEXT,
  user_agent TEXT,
  ip_hash TEXT,
  is_unique BOOLEAN NOT NULL DEFAULT FALSE,
  is_bot BOOLEAN NOT NULL DEFAULT FALSE,
  clicked_at TIMESTAMP DEFAULT NOW() NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracking_clicks_link ON tracking_clicks(tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_tracking_clicks_session ON tracking_clicks(tracking_link_id, session_id);
CREATE INDEX IF NOT EXISTS idx_tracking_clicks_clicked_at ON tracking_clicks(clicked_at);

CREATE TABLE IF NOT EXISTS tracking_attributions (
  id SERIAL PRIMARY KEY,
  tracking_link_id INTEGER NOT NULL REFERENCES tracking_links(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  user_id INTEGER,
  attribution_type TEXT NOT NULL,
  order_id INTEGER,
  amount INTEGER,
  attributed_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tracking_attr_session ON tracking_attributions(session_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_tracking_attr_link ON tracking_attributions(tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_tracking_attr_user ON tracking_attributions(user_id);

-- Nullable, additive columns linking existing entities to their attributed campaign.
-- No existing data is touched; both columns default to NULL for pre-existing rows.
ALTER TABLE users ADD COLUMN IF NOT EXISTS signup_tracking_link_id INTEGER REFERENCES tracking_links(id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_link_id INTEGER REFERENCES tracking_links(id);
CREATE INDEX IF NOT EXISTS idx_users_signup_tracking_link ON users(signup_tracking_link_id);
CREATE INDEX IF NOT EXISTS idx_orders_tracking_link ON orders(tracking_link_id);
`;

const ASSESSMENTS_SCHEMA_SQL = `
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

CREATE INDEX IF NOT EXISTS idx_assessment_questions_assessment_id ON assessment_questions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_assessment_id ON assessment_sessions(assessment_id);
CREATE INDEX IF NOT EXISTS idx_assessment_sessions_user_id ON assessment_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_assessment_contact_leads_assessment_id ON assessment_contact_leads(assessment_id);
`;

const AI_ASSESSMENT_REPORTS_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS assessment_ai_report_configs (
  id SERIAL PRIMARY KEY,
  assessment_id INTEGER NOT NULL UNIQUE REFERENCES assessments(id) ON DELETE CASCADE,
  is_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  title TEXT NOT NULL DEFAULT 'گزارش حرفه‌ای AI',
  sales_description TEXT NOT NULL DEFAULT '',
  value_description TEXT NOT NULL DEFAULT '',
  features JSONB NOT NULL DEFAULT '[]',
  price INTEGER NOT NULL DEFAULT 0,
  prompt TEXT NOT NULL DEFAULT '',
  model VARCHAR(100) NOT NULL DEFAULT 'gpt-4o-mini',
  max_tokens INTEGER NOT NULL DEFAULT 1500,
  temperature NUMERIC(3,2) NOT NULL DEFAULT 0.70,
  tone VARCHAR(40) NOT NULL DEFAULT 'professional',
  language VARCHAR(20) NOT NULL DEFAULT 'fa',
  prompt_version VARCHAR(50) NOT NULL DEFAULT 'v1',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_assessment_ai_report_configs_assessment_id
  ON assessment_ai_report_configs(assessment_id);

CREATE TABLE IF NOT EXISTS ai_assessment_reports (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  assessment_id INTEGER NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
  attempt_id INTEGER NOT NULL UNIQUE REFERENCES assessment_sessions(id) ON DELETE CASCADE,
  payment_id INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  model VARCHAR(100) NOT NULL,
  prompt_version VARCHAR(50) NOT NULL,
  generated_content JSONB,
  token_usage JSONB,
  estimated_cost NUMERIC(12,6),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMP,
  error TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_assessment_reports_assessment_id
  ON ai_assessment_reports(assessment_id);
CREATE INDEX IF NOT EXISTS idx_ai_assessment_reports_user_id
  ON ai_assessment_reports(user_id);
`;

export async function runMigrations(): Promise<void> {
  const client = await pool.connect();
  try {
    logger.info("Running DB migrations...");
    await client.query(SCHEMA_SQL);
    await client.query(AUDIO_SCHEMA_SQL);
    await client.query(ALTER_SQL);
    await client.query(FINANCIAL_SCHEMA_SQL);
    await client.query(MTP_SCHEMA_SQL);
    await client.query(VOICE_CALL_GATE_SQL);
    await client.query(PAGES_SCHEMA_SQL);
    await client.query(AI_CHAT_SCHEMA_SQL);
    await client.query(EXTRA_SCHEMA_SQL);
    await client.query(COURSE_PHASE_ATTACH_SQL);
    await client.query(ADMIN_PERMISSIONS_SQL);  // add columns
    await client.query(ITEM_DISCOUNTS_SQL);      // per-item discount windows
    await client.query(ANALYTICS_SQL);           // analytics tracking tables
    await client.query(CATEGORY_REORDER_SQL);    // reorder: hypnotherapy before ebook
    await client.query(SEED_ADMIN_SQL);          // insert default admin (if not exists)
    await client.query(FINAL_SUPERADMIN_SQL);    // guarantee is_super_admin = TRUE
    await client.query(TRACKING_LINKS_SQL);      // advertising tracking links + attribution
    await client.query(ASSESSMENTS_SCHEMA_SQL);  // tests & assessments system
    await client.query(AI_ASSESSMENT_REPORTS_SCHEMA_SQL); // professional AI report data layer
    logger.info("DB migrations complete");
  } catch (err) {
    logger.error({ err }, "DB migration failed");
    throw err;
  } finally {
    client.release();
  }
}
