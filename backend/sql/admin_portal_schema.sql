BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_2fa_required BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_admin_login_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'users_role_check'
  ) THEN
    ALTER TABLE users
      ADD CONSTRAINT users_role_check
      CHECK (role IN ('user', 'admin', 'clinician'));
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS admin_2fa_secrets (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  totp_secret_encrypted TEXT NOT NULL,
  recovery_codes_hash_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled_at TIMESTAMPTZ,
  last_verified_at TIMESTAMPTZ,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS admin_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  clerk_session_id TEXT,
  session_token_id TEXT,
  mfa_verified_at TIMESTAMPTZ,
  mfa_expires_at TIMESTAMPTZ,
  ip_address INET,
  user_agent TEXT,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGSERIAL PRIMARY KEY,
  actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS model_versions (
  id BIGSERIAL PRIMARY KEY,
  specialty TEXT NOT NULL,
  model_name TEXT NOT NULL,
  algorithm TEXT NOT NULL,
  version_tag TEXT NOT NULL,
  artifact_uri TEXT,
  dataset_version TEXT,
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  deployed_at TIMESTAMPTZ,
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (specialty, version_tag)
);

CREATE TABLE IF NOT EXISTS backup_jobs (
  id BIGSERIAL PRIMARY KEY,
  initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  storage_uri TEXT,
  checksum TEXT,
  size_bytes BIGINT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS recovery_jobs (
  id BIGSERIAL PRIMARY KEY,
  backup_job_id BIGINT NOT NULL REFERENCES backup_jobs(id) ON DELETE RESTRICT,
  initiated_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'queued',
  target_env TEXT NOT NULL DEFAULT 'staging',
  validation_report_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confirmed_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  channel TEXT NOT NULL DEFAULT 'mobile-app',
  specialty TEXT,
  status TEXT NOT NULL DEFAULT 'completed',
  summary TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_messages (
  id BIGSERIAL PRIMARY KEY,
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender_role TEXT NOT NULL,
  content_redacted TEXT,
  content_encrypted TEXT,
  token_count INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_tool_calls (
  id BIGSERIAL PRIMARY KEY,
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  message_id BIGINT REFERENCES chat_messages(id) ON DELETE SET NULL,
  tool_name TEXT NOT NULL,
  request_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chat_reviews (
  id BIGSERIAL PRIMARY KEY,
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  reviewed_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  quality_score SMALLINT,
  compliance_status TEXT,
  issue_type TEXT,
  notes TEXT,
  flagged_for_retraining BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS retraining_feedback_queue (
  id BIGSERIAL PRIMARY KEY,
  chat_session_id UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  submitted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  exported_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prediction_events (
  id BIGSERIAL PRIMARY KEY,
  chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  model_version_id BIGINT REFERENCES model_versions(id) ON DELETE SET NULL,
  specialty TEXT NOT NULL,
  predicted_label TEXT NOT NULL,
  predicted_value INTEGER,
  probabilities_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  input_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  response_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS prediction_ground_truth (
  id BIGSERIAL PRIMARY KEY,
  prediction_event_id BIGINT NOT NULL REFERENCES prediction_events(id) ON DELETE CASCADE,
  actual_label TEXT NOT NULL,
  actual_value INTEGER,
  label_source TEXT,
  entered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE prediction_events
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT,
  ADD COLUMN IF NOT EXISTS predicted_value INTEGER,
  ADD COLUMN IF NOT EXISTS input_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS response_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE prediction_ground_truth
  ADD COLUMN IF NOT EXISTS actual_value INTEGER,
  ADD COLUMN IF NOT EXISTS entered_by_clerk_user_id TEXT,
  ADD COLUMN IF NOT EXISTS is_prediction_correct BOOLEAN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'prediction_ground_truth_prediction_event_id_key'
  ) THEN
    ALTER TABLE prediction_ground_truth
      ADD CONSTRAINT prediction_ground_truth_prediction_event_id_key UNIQUE (prediction_event_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS model_baseline_metrics (
  id BIGSERIAL PRIMARY KEY,
  model_version_id BIGINT NOT NULL REFERENCES model_versions(id) ON DELETE CASCADE,
  accuracy NUMERIC(6, 5),
  precision NUMERIC(6, 5),
  recall NUMERIC(6, 5),
  false_alarm_rate NUMERIC(6, 5),
  roc_auc NUMERIC(6, 5),
  evaluation_sample_size INTEGER,
  metric_scope TEXT NOT NULL DEFAULT 'test_set',
  class_metrics_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confusion_matrix_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  source_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (model_version_id)
);

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id BIGSERIAL PRIMARY KEY,
  model_version_id BIGINT REFERENCES model_versions(id) ON DELETE SET NULL,
  window_start TIMESTAMPTZ,
  window_end TIMESTAMPTZ,
  accuracy NUMERIC(6, 5) NOT NULL DEFAULT 0,
  precision NUMERIC(6, 5) NOT NULL DEFAULT 0,
  recall NUMERIC(6, 5) NOT NULL DEFAULT 0,
  false_alarm_rate NUMERIC(6, 5) NOT NULL DEFAULT 0,
  sample_size INTEGER NOT NULL DEFAULT 0,
  confusion_matrix_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created_at
  ON audit_logs(actor_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_jobs_created_at
  ON backup_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_recovery_jobs_created_at
  ON recovery_jobs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_sessions_started_at
  ON chat_sessions(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created_at
  ON chat_messages(chat_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_reviews_session_created_at
  ON chat_reviews(chat_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_events_created_at
  ON prediction_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_prediction_events_clerk_user_id_created_at
  ON prediction_events(clerk_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_model_baseline_metrics_model_version_id
  ON model_baseline_metrics(model_version_id);

CREATE INDEX IF NOT EXISTS idx_metric_snapshots_window_end
  ON metric_snapshots(window_end DESC, created_at DESC);

COMMIT;
