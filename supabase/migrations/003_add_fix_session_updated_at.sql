ALTER TABLE issue_sessions
  ADD COLUMN IF NOT EXISTS fix_session_updated_at TIMESTAMPTZ;
