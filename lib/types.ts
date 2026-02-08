export type IssueStatus =
  | "pending"
  | "scoping"
  | "scoped"
  | "fixing"
  | "blocked"
  | "pr_open"
  | "awaiting_reply"
  | "timed_out"
  | "failed"
  | "aborted"
  | "done";

export type ConfidenceLevel = "green" | "yellow" | "red";

export type DevinStatusEnum =
  | "working"
  | "blocked"
  | "finished"
  | "stopped"
  | "expired"
  | "suspend_requested"
  | "resumed";

// --- GitHub types ---

export interface GitHubLabel {
  name: string;
  color: string;
}

// --- Scoping types ---

export interface ScopingResult {
  confidence: ConfidenceLevel;
  confidence_reason: string;
  current_behavior: string;
  requested_fix: string;
  files_to_modify: string[];
  tests_needed: string;
  action_plan: string[];
  risks: string[];
  open_questions: string[];
}

export interface FileInfo {
  path: string;
  lines: number | null;
}

// --- Fix/Session types ---

export interface StepItem {
  label: string;
  status: "done" | "in_progress" | "pending" | "failed" | "blocked";
}

export interface FixProgress {
  status: "in_progress" | "completed" | "blocked";
  current_step: string;
  completed_steps: string[];
  pr_url: string | null;
  blockers: string[];
}

export interface BlockerInfo {
  what_happened: string;
  suggestion: string;
}

export interface DiffLine {
  type: "add" | "remove" | "context";
  content: string;
}

export interface PRFileChange {
  path: string;
  additions: number;
  deletions: number;
  is_new: boolean;
  diff_lines?: DiffLine[];
}

export interface PRInfo {
  url: string;
  number: number;
  title: string;
  branch: string;
  files_changed: PRFileChange[];
}

export interface SessionInfo {
  session_id: string;
  session_url: string; // Only from POST /sessions — must store at creation
  started_at: string;
  updated_at?: string;
}

// --- Main enriched issue type ---

export interface DashboardIssue {
  // From GitHub
  number: number;
  title: string;
  body: string;
  labels: GitHubLabel[];
  created_at: string;
  updated_at: string;
  github_url: string;

  // From scoping
  status: IssueStatus;
  confidence: ConfidenceLevel | null;
  scoping: ScopingResult | null;
  files_info: FileInfo[];

  // From fix session
  fix_progress: FixProgress | null;
  blocker: BlockerInfo | null;
  pr: PRInfo | null;
  steps: StepItem[];

  // Session tracking
  scoping_session: SessionInfo | null;
  fix_session: SessionInfo | null;

  // Timestamps
  scoped_at: string | null;
  fix_started_at: string | null;
  completed_at: string | null;
}

// --- Dashboard state (useReducer) ---

export interface FilterState {
  confidence: ConfidenceLevel | "all";
  status: IssueStatus | "all";
}

export interface DashboardState {
  mode: "demo" | "live";
  repo: { owner: string; name: string } | null;
  issues: DashboardIssue[];
  expandedIssueId: number | null;
  activeSession: {
    sessionId: string;
    sessionUrl: string;
    issueNumber: number;
    type: "scoping" | "fixing";
  } | null;
  filter: FilterState;
  sortBy: "confidence" | "number" | "status";
  acuModalOpen: boolean;
  scopingApproved: boolean;
  loading: boolean;
  error: string | null;
}

export type DashboardAction =
  | { type: "SET_MODE"; mode: "demo" | "live" }
  | { type: "SET_REPO"; repo: { owner: string; name: string } }
  | { type: "DISCONNECT" }
  | { type: "SET_ISSUES"; issues: DashboardIssue[] }
  | {
      type: "UPDATE_ISSUE";
      issueNumber: number;
      patch: Partial<DashboardIssue>;
    }
  | { type: "TOGGLE_EXPAND"; issueNumber: number }
  | { type: "SET_FILTER"; filter: Partial<FilterState> }
  | { type: "SET_SORT"; sortBy: DashboardState["sortBy"] }
  | {
      type: "SET_SESSION";
      sessionId: string;
      sessionUrl: string;
      issueNumber: number;
      sessionType: "scoping" | "fixing";
    }
  | { type: "CLEAR_SESSION" }
  | { type: "TOGGLE_ACU_MODAL" }
  | { type: "APPROVE_SCOPING" }
  | { type: "SET_LOADING"; loading: boolean }
  | { type: "SET_ERROR"; error: string | null };
