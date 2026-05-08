BEGIN;

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
