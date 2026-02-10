import { DashboardIssue } from "@/lib/types";

interface RawGitHubIssue {
  number: number;
  title: string;
  body?: string | null;
  labels: { name: string; color: string }[];
  created_at: string;
  updated_at: string;
  html_url: string;
}

/** Build a fresh DashboardIssue from raw GitHub API data with all fields at defaults. */
export function createPendingIssue(r: RawGitHubIssue): DashboardIssue {
  return {
    number: r.number,
    title: r.title,
    body: r.body || "",
    labels: r.labels,
    created_at: r.created_at,
    updated_at: r.updated_at,
    github_url: r.html_url,
    status: "pending" as const,
    confidence: null,
    scoping: null,
    files_info: [],
    fix_progress: null,
    blocker: null,
    pr: null,
    steps: [],
    messages: [],
    scoping_session: null,
    fix_session: null,
    last_devin_comment_id: null,
    last_devin_comment_at: null,
    github_comment_url: null,
    forwarded_comment_ids: [],
    scoped_at: null,
    fix_started_at: null,
    completed_at: null,
  };
}
