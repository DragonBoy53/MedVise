BEGIN;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS clinician_code TEXT UNIQUE;

CREATE TABLE IF NOT EXISTS patient_doctor_links (
  id BIGSERIAL PRIMARY KEY,
  patient_user_id TEXT NOT NULL,
  doctor_user_id TEXT NOT NULL,
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

CREATE INDEX IF NOT EXISTS idx_patient_doctor_links_patient_status
  ON patient_doctor_links(patient_user_id, status);

CREATE INDEX IF NOT EXISTS idx_patient_doctor_links_doctor_status
  ON patient_doctor_links(doctor_user_id, status);

COMMIT;
