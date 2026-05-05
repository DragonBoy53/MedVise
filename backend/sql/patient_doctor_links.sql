BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS clinician_code TEXT UNIQUE;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_sessions'
  ) THEN
    ALTER TABLE chat_sessions
      ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS patient_doctor_links (
  id BIGSERIAL PRIMARY KEY,
  patient_user_id TEXT NOT NULL,
  doctor_user_id TEXT NOT NULL,
  patient_email_snapshot TEXT,
  patient_name_snapshot TEXT,
  doctor_email_snapshot TEXT,
  doctor_name_snapshot TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT patient_doctor_links_status_check
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT patient_doctor_links_distinct_users_check
    CHECK (patient_user_id <> doctor_user_id),
  CONSTRAINT patient_doctor_links_patient_doctor_key
    UNIQUE (patient_user_id, doctor_user_id)
);

-- Backfill columns that may be missing from tables created before snapshot
-- columns were added to the CREATE TABLE definition above.
ALTER TABLE patient_doctor_links
  ADD COLUMN IF NOT EXISTS patient_email_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS patient_name_snapshot  TEXT,
  ADD COLUMN IF NOT EXISTS doctor_email_snapshot   TEXT,
  ADD COLUMN IF NOT EXISTS doctor_name_snapshot    TEXT;

CREATE INDEX IF NOT EXISTS idx_patient_doctor_links_patient_status
  ON patient_doctor_links(patient_user_id, status);

CREATE INDEX IF NOT EXISTS idx_patient_doctor_links_doctor_status
  ON patient_doctor_links(doctor_user_id, status);

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'chat_sessions'
  ) THEN
    CREATE INDEX IF NOT EXISTS idx_chat_sessions_clerk_user_last_message
      ON chat_sessions(clerk_user_id, last_message_at DESC);
  END IF;
END $$;

COMMIT;
