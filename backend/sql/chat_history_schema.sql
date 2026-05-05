BEGIN;

ALTER TABLE chat_sessions
  ADD COLUMN IF NOT EXISTS clerk_user_id TEXT;

CREATE INDEX IF NOT EXISTS idx_chat_sessions_clerk_user_last_message
  ON chat_sessions(clerk_user_id, last_message_at DESC);

CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created_at
  ON chat_messages(chat_session_id, created_at DESC);

COMMIT;
