-- Run this in the NeonDB SQL editor to check which required columns exist.
-- Every row should show column_exists = true.
-- Any row showing false is the root cause of the SCHEMA_NOT_READY error.

SELECT
  'patient_doctor_links table'                          AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'patient_doctor_links'
  )                                                     AS exists

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
  'users.clinician_code column',
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'users'
      AND column_name  = 'clinician_code'
  );
