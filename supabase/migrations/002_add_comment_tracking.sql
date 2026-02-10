ALTER TABLE issue_sessions
  ADD COLUMN IF NOT EXISTS last_devin_comment_id   BIGINT,
  ADD COLUMN IF NOT EXISTS last_devin_comment_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS github_comment_url      TEXT,
  ADD COLUMN IF NOT EXISTS forwarded_comment_ids   JSONB DEFAULT '[]'::JSONB;
