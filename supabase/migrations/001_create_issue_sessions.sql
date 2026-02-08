CREATE TABLE issue_sessions (
  id              UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  repo            TEXT NOT NULL,
  issue_number    INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending',
  confidence      TEXT,
  scoping         JSONB,
  scoping_session JSONB,
  fix_session     JSONB,
  fix_progress    JSONB,
  blocker         JSONB,
  pr              JSONB,
  steps           JSONB DEFAULT '[]'::JSONB,
  files_info      JSONB DEFAULT '[]'::JSONB,
  scoped_at       TIMESTAMPTZ,
  fix_started_at  TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(repo, issue_number)
);

CREATE INDEX idx_issue_sessions_repo ON issue_sessions(repo);
