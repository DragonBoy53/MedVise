-- Run this in the Supabase SQL editor to check which required tables/columns exist.
-- Every required application row should show exists = true.
-- A false value for supabase_migrations.schema_migrations is safe unless you use
-- Supabase CLI migrations; do not query that table directly without to_regclass().

SELECT
  'supabase_migrations.schema_migrations table (optional)' AS check_name,
  to_regclass('supabase_migrations.schema_migrations') IS NOT NULL AS exists

UNION ALL

SELECT
  'patient_doctor_links table',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'patient_doctor_links'
  )

UNION ALL

SELECT
  'backup_jobs table',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'backup_jobs'
  )

UNION ALL

SELECT
  'recovery_jobs table',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'recovery_jobs'
  )

UNION ALL

SELECT
  'worker_heartbeats table',
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'worker_heartbeats'
  )

UNION ALL

SELECT
  'prediction_events.clerk_user_id column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'prediction_events'
      AND column_name  = 'clerk_user_id'
  )

UNION ALL

SELECT
  'chat_sessions.clerk_user_id column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_sessions'
      AND column_name  = 'clerk_user_id'
  )

UNION ALL

SELECT
  'chat_messages.attachment_type column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'attachment_type'
  )

UNION ALL

SELECT
  'chat_messages.attachment_bucket column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'attachment_bucket'
  )

UNION ALL

SELECT
  'chat_messages.attachment_path column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'chat_messages'
      AND column_name  = 'attachment_path'
  )

UNION ALL

SELECT
  'backup_jobs.started_at column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'backup_jobs'
      AND column_name  = 'started_at'
  )

UNION ALL

SELECT
  'recovery_jobs.started_at column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'recovery_jobs'
      AND column_name  = 'started_at'
  )

UNION ALL

SELECT
  'users.clinician_code column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'clinician_code'
  )

UNION ALL

SELECT
  'patient_doctor_links.patient_email_snapshot column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'patient_doctor_links'
      AND column_name  = 'patient_email_snapshot'
  )

UNION ALL

SELECT
  'patient_doctor_links.patient_name_snapshot column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'patient_doctor_links'
      AND column_name  = 'patient_name_snapshot'
  )

UNION ALL

SELECT
  'patient_doctor_links.doctor_email_snapshot column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'patient_doctor_links'
      AND column_name  = 'doctor_email_snapshot'
  )

UNION ALL

SELECT
  'patient_doctor_links.doctor_name_snapshot column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'patient_doctor_links'
      AND column_name  = 'doctor_name_snapshot'
  )

ORDER BY check_name;
