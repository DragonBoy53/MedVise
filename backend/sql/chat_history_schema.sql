BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS chat_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id INTEGER,
  clerk_user_id TEXT,
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
  attachment_type TEXT,
  attachment_bucket TEXT,
  attachment_path TEXT,
  attachment_mime_type TEXT,
  attachment_size_bytes BIGINT,
  attachment_original_name TEXT,
  token_count INTEGER,
  latency_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

ALTER TABLE chat_messages
  ADD COLUMN IF NOT EXISTS attachment_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_bucket TEXT,
  ADD COLUMN IF NOT EXISTS attachment_path TEXT,
  ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT,
  ADD COLUMN IF NOT EXISTS attachment_size_bytes BIGINT,
  ADD COLUMN IF NOT EXISTS attachment_original_name TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_clerk_user_last_message
  ON chat_sessions(clerk_user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created_at
  ON chat_messages(chat_session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_attachment_path
  ON chat_messages(attachment_bucket, attachment_path)
  WHERE attachment_path IS NOT NULL;

COMMIT;
