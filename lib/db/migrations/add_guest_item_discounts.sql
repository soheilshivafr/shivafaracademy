-- Migration: اضافه کردن جدول تخفیف‌های کاربران مهمان
-- تاریخ: ۱۴۰۵-۰۵-۰۸
-- روی سرور production اجرا کنید:
--   psql -U shivafer -d shivafer -f add_guest_item_discounts.sql

CREATE TABLE IF NOT EXISTS guest_item_discounts (
  id                  SERIAL PRIMARY KEY,
  guest_id            TEXT NOT NULL,
  item_type           TEXT NOT NULL,
  item_id             INTEGER NOT NULL,
  discount_percent    INTEGER NOT NULL,
  window_starts_at    TIMESTAMP NOT NULL,
  window_ends_at      TIMESTAMP NOT NULL,
  source              TEXT NOT NULL,
  next_offer_at       TIMESTAMP NOT NULL,
  migrated_to_user_id INTEGER,
  created_at          TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ایندکس برای جستجوی سریع بر اساس guestId
CREATE INDEX IF NOT EXISTS idx_guest_item_discounts_guest_id
  ON guest_item_discounts (guest_id);

-- ایندکس برای جستجوی ترکیبی (مهم‌ترین query)
CREATE INDEX IF NOT EXISTS idx_guest_item_discounts_lookup
  ON guest_item_discounts (guest_id, item_type, item_id)
  WHERE migrated_to_user_id IS NULL;

COMMENT ON TABLE guest_item_discounts IS 'تخفیف‌های شخصی‌سازی‌شده برای کاربران مهمان (بدون نیاز به لاگین)';
