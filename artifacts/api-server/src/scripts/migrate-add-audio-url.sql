-- Migration: Add audio_url column to course_lessons table
-- Run this once on your production database before deploying the new version.
ALTER TABLE course_lessons ADD COLUMN IF NOT EXISTS audio_url TEXT;
