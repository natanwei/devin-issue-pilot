import { createClient, SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;

  client = createClient(url, key);
  return client;
}

export interface IssueSessionRow {
  repo: string;
  issue_number: number;
  status?: string;
  confidence?: string | null;
  scoping?: Record<string, unknown> | null;
  scoping_session?: Record<string, unknown> | null;
  fix_session?: Record<string, unknown> | null;
  fix_progress?: Record<string, unknown> | null;
  blocker?: Record<string, unknown> | null;
  pr?: Record<string, unknown> | null;
  steps?: Record<string, unknown>[];
  files_info?: Record<string, unknown>[];
  scoped_at?: string | null;
  fix_started_at?: string | null;
  completed_at?: string | null;
  last_devin_comment_id?: number | null;
  last_devin_comment_at?: string | null;
  github_comment_url?: string | null;
  forwarded_comment_ids?: number[];
  fix_session_updated_at?: string | null;
}

/** Upsert a session row — creates if new, merges if existing */
export async function upsertIssueSession(
  row: IssueSessionRow,
): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;

  const normalized = { ...row, repo: row.repo.toLowerCase() };
  const { error } = await supabase
    .from("issue_sessions")
    .upsert(normalized, { onConflict: "repo,issue_number" });

  if (error) {
    console.error("Supabase upsert error:", error.message);
  }
}

/** Load all session rows for a given repo */
export async function getIssueSessionsByRepo(
  repo: string,
): Promise<IssueSessionRow[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase
    .from("issue_sessions")
    .select("*")
    .eq("repo", repo);

  if (error) {
    console.error("Supabase select error:", error.message);
    return [];
  }

  return (data ?? []) as IssueSessionRow[];
}

/** Find a session row by Devin session ID (checks both scoping and fix sessions) */
export async function getIssueSessionByDevinId(
  sessionId: string,
): Promise<IssueSessionRow | null> {
  const supabase = getSupabase();
  if (!supabase) return null;

  // Try scoping_session first
  const { data: scopeData } = await supabase
    .from("issue_sessions")
    .select("*")
    .eq("scoping_session->>session_id", sessionId)
    .limit(1);

  if (scopeData && scopeData.length > 0) return scopeData[0] as IssueSessionRow;

  // Try fix_session
  const { data: fixData } = await supabase
    .from("issue_sessions")
    .select("*")
    .eq("fix_session->>session_id", sessionId)
    .limit(1);

  if (fixData && fixData.length > 0) return fixData[0] as IssueSessionRow;

  return null;
}
