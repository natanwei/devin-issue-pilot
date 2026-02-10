"use client";

import { useReducer, useMemo, useCallback, useEffect, useRef, useState } from "react";
import {
  DashboardState,
  DashboardAction,
  DashboardIssue,
  FilterState,
  IssueStatus,
  ConfidenceLevel,
  ScopingResult,
  SessionInfo,
  FixProgress,
  BlockerInfo,
  PRInfo,
  StepItem,
  FileInfo,
} from "@/lib/types";
import {
  CONFIDENCE_SORT_ORDER,
  POLLING_INTERVALS,
  TIMEOUT_LIMITS,
  ACU_LIMITS,
  ISSUE_REFRESH_INTERVAL,
} from "@/lib/constants";
import { interpretPollResult } from "@/lib/parsers";
import type { PollResult } from "@/lib/parsers";
import { useApiKeys, apiKeyHeaders } from "@/lib/api-keys";
import { getDemoIssues } from "@/lib/demo-data";
import {
  formatScopingComment,
  formatBlockedComment,
  formatDoneComment,
  isDevinComment,
  isDuplicateMessage,
} from "@/lib/comment-templates";
import TopBar from "./TopBar";
import FilterBar from "./FilterBar";
import IssueList from "./IssueList";
import ACUModal from "./ACUModal";
import SettingsPanel from "./SettingsPanel";
import ActiveSessionBanner from "./ActiveSessionBanner";
import { IssueActions } from "./IssueDetail";

interface DashboardProps {
  repo: { owner: string; name: string };
  initialMode: "demo" | "live";
  onDisconnect: () => void;
}

function createInitialState(
  repo: { owner: string; name: string },
  mode: "demo" | "live"
): DashboardState {
  return {
    mode,
    repo,
    issues: mode === "demo" ? getDemoIssues() : [],
    expandedIssueId: null,
    activeSession: null,
    filter: { confidence: "all", status: "all" },
    sortBy: "confidence",
    acuModalOpen: false,
    scopingApproved: mode === "demo",
    loading: mode === "live",
    error: null,
    lastMainCommitDate: null,
  };
}

function dashboardReducer(
  state: DashboardState,
  action: DashboardAction
): DashboardState {
  switch (action.type) {
    case "SET_MODE":
      return {
        ...state,
        mode: action.mode,
        issues: action.mode === "demo" ? getDemoIssues() : state.issues,
        loading: action.mode === "live",
        scopingApproved: action.mode === "demo",
      };

    case "SET_REPO":
      return { ...state, repo: action.repo };

    case "DISCONNECT":
      return { ...state, repo: null };

    case "SET_ISSUES":
      return { ...state, issues: action.issues, loading: false };

    case "UPDATE_ISSUE":
      return {
        ...state,
        issues: state.issues.map((i) => {
          if (i.number !== action.issueNumber) return i;
          const patch = action.patch as Partial<DashboardIssue>;
          if (patch && patch.messages) {
            const existing = i.messages || [];
            const incoming = patch.messages || [];
            const mergedMap = new Map<string, typeof existing[number]>();
            for (const m of [...existing, ...incoming]) {
              const key = `${m.role}|${m.text}|${m.timestamp}`;
              mergedMap.set(key, m);
            }
            const merged = Array.from(mergedMap.values()).sort(
              (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime(),
            );
            return { ...i, ...patch, messages: merged } as DashboardIssue;
          }
          return { ...i, ...patch } as DashboardIssue;
        }),
      };

    case "TOGGLE_EXPAND":
      return {
        ...state,
        expandedIssueId:
          state.expandedIssueId === action.issueNumber
            ? null
            : action.issueNumber,
      };

    case "SET_FILTER":
      return { ...state, filter: { ...state.filter, ...action.filter } };

    case "SET_SORT":
      return { ...state, sortBy: action.sortBy };

    case "SET_SESSION":
      return {
        ...state,
        activeSession: {
          sessionId: action.sessionId,
          sessionUrl: action.sessionUrl,
          issueNumber: action.issueNumber,
          type: action.sessionType,
        },
      };

    case "CLEAR_SESSION":
      return { ...state, activeSession: null };

    case "TOGGLE_ACU_MODAL":
      return { ...state, acuModalOpen: !state.acuModalOpen };

    case "APPROVE_SCOPING":
      return { ...state, scopingApproved: true };

    case "SET_LOADING":
      return { ...state, loading: action.loading };

    case "SET_ERROR":
      return { ...state, error: action.error };

    case "ADD_ISSUES": {
      const existingNumbers = new Set(state.issues.map((i) => i.number));
      const fresh = action.issues.filter((i) => !existingNumbers.has(i.number));
      if (fresh.length === 0) return state;
      return { ...state, issues: [...state.issues, ...fresh] };
    }

    case "SET_MAIN_COMMIT_DATE":
      return { ...state, lastMainCommitDate: action.date };

    default:
      return state;
  }
}

function filterAndSortIssues(
  issues: DashboardIssue[],
  filter: FilterState,
  sortBy: DashboardState["sortBy"]
): DashboardIssue[] {
  let filtered = issues;

  // Filter by confidence
  if (filter.confidence !== "all") {
    filtered = filtered.filter((i) => i.confidence === filter.confidence);
  }

  // Filter by status (group related statuses)
  if (filter.status !== "all") {
    if (filter.status === "pending") {
      filtered = filtered.filter(
        (i) => i.status === "pending" || i.status === "scoped"
      );
    } else if (filter.status === "active") {
      filtered = filtered.filter(
        (i) =>
          i.status === "scoping" ||
          i.status === "fixing" ||
          i.status === "blocked" ||
          i.status === "awaiting_reply"
      );
    } else if (filter.status === "closed") {
      filtered = filtered.filter(
        (i) =>
          i.status === "done" ||
          i.status === "pr_open" ||
          i.status === "timed_out" ||
          i.status === "failed" ||
          i.status === "aborted"
      );
    }
  }

  // Sort
  return [...filtered].sort((a, b) => {
    if (sortBy === "confidence") {
      const aOrder = a.confidence
        ? CONFIDENCE_SORT_ORDER[a.confidence]
        : 3;
      const bOrder = b.confidence
        ? CONFIDENCE_SORT_ORDER[b.confidence]
        : 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.number - b.number;
    }
    if (sortBy === "number") {
      return a.number - b.number;
    }
    // sortBy === "status"
    return a.status.localeCompare(b.status);
  });
}

function getPollingInterval(status: string): number {
  return POLLING_INTERVALS[status] ?? POLLING_INTERVALS.default;
}

export default function Dashboard({
  repo,
  initialMode,
  onDisconnect,
}: DashboardProps) {
  const [state, dispatch] = useReducer(
    dashboardReducer,
    { repo, mode: initialMode },
    ({ repo, mode }) => createInitialState(repo, mode)
  );

  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const issueRefreshRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scopingInProgressRef = useRef(false);
  const pendingMessagesRef = useRef<Map<number, string>>(new Map());
  const stateRef = useRef(state);
  stateRef.current = state;

  const { keys, setKeys, clearKeys, hasKeys } = useApiKeys();
  const keysRef = useRef(keys);
  keysRef.current = keys;

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [keysBannerDismissed, setKeysBannerDismissed] = useState(false);

  const filteredIssues = useMemo(
    () => filterAndSortIssues(state.issues, state.filter, state.sortBy),
    [state.issues, state.filter, state.sortBy]
  );

  // --- Toast (demo mode + 403 warnings) ---
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, durationMs = 2000) => {
    setToastMessage(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(null), durationMs);
  }, []);

  const showDemoToast = useCallback(() => {
    showToast("Switch to Live mode to use this action");
  }, [showToast]);

  useEffect(() => {
    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
  }, []);

  // --- Fetch issues from GitHub (live mode) ---
  const fetchIssues = useCallback(async () => {
    if (stateRef.current.mode !== "live" || !stateRef.current.repo) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const { owner, name } = stateRef.current.repo;
      const res = await fetch(
        `/api/github/issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
        { headers: apiKeyHeaders(keysRef.current) },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to fetch issues");
      }
      const raw = await res.json();

      const issues: DashboardIssue[] = raw.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (r: any) => ({
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
        })
      );

      // Hydrate from Supabase (merge persisted session data onto fresh GitHub issues)
      try {
        const sessionsRes = await fetch(
          `/api/supabase/sessions?repo=${encodeURIComponent(`${owner}/${name}`)}`
        );
        if (sessionsRes.ok) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sessions: any[] = await sessionsRes.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const sessionMap = new Map<number, any>();
          for (const s of sessions) {
            sessionMap.set(s.issue_number, s);
          }
          for (let i = 0; i < issues.length; i++) {
            const p = sessionMap.get(issues[i].number);
            if (p) {
              issues[i] = {
                ...issues[i],
                status: (p.status as IssueStatus) || issues[i].status,
                confidence: (p.confidence as ConfidenceLevel) || null,
                scoping: (p.scoping as ScopingResult) || null,
                scoping_session: (p.scoping_session as SessionInfo) || null,
                fix_session: (p.fix_session as SessionInfo) || null,
                fix_progress: (p.fix_progress as FixProgress) || null,
                blocker: (p.blocker as BlockerInfo) || null,
                pr: (p.pr as PRInfo) || null,
                steps: (p.steps as StepItem[]) || [],
                files_info: (p.files_info as FileInfo[]) || [],
                messages: (p.messages as DashboardIssue["messages"]) || [],
                last_devin_comment_id: p.last_devin_comment_id ?? null,
                last_devin_comment_at: p.last_devin_comment_at ?? null,
                github_comment_url: p.github_comment_url ?? null,
                forwarded_comment_ids: (p.forwarded_comment_ids as number[]) || [],
                scoped_at: p.scoped_at || null,
                fix_started_at: p.fix_started_at || null,
                completed_at: p.completed_at || null,
              };
            }
          }

          // Fetch closed issues that exist in Supabase but not in GitHub (open) list
          const matchedNumbers = new Set(issues.map((i) => i.number));
          const missingSessions = sessions.filter(
            (s) => !matchedNumbers.has(s.issue_number)
          );
          for (const s of missingSessions) {
            try {
              const issueRes = await fetch(
                `/api/github/issue?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}&number=${s.issue_number}`,
                { headers: apiKeyHeaders(keysRef.current) },
              );
              if (issueRes.ok) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const r: any = await issueRes.json();
                issues.push({
                  number: r.number,
                  title: r.title,
                  body: r.body || "",
                  labels: r.labels,
                  created_at: r.created_at,
                  updated_at: r.updated_at,
                  github_url: r.html_url,
                  status: (s.status as IssueStatus) || "pending",
                  confidence: (s.confidence as ConfidenceLevel) || null,
                  scoping: (s.scoping as ScopingResult) || null,
                  scoping_session: (s.scoping_session as SessionInfo) || null,
                  fix_session: (s.fix_session as SessionInfo) || null,
                  fix_progress: (s.fix_progress as FixProgress) || null,
                  blocker: (s.blocker as BlockerInfo) || null,
                  pr: (s.pr as PRInfo) || null,
                  steps: (s.steps as StepItem[]) || [],
                  files_info: (s.files_info as FileInfo[]) || [],
                  messages: (s.messages as DashboardIssue["messages"]) || [],
                  last_devin_comment_id: s.last_devin_comment_id ?? null,
                  last_devin_comment_at: s.last_devin_comment_at ?? null,
                  github_comment_url: s.github_comment_url ?? null,
                  forwarded_comment_ids: (s.forwarded_comment_ids as number[]) || [],
                  scoped_at: s.scoped_at || null,
                  fix_started_at: s.fix_started_at || null,
                  completed_at: s.completed_at || null,
                });
              }
            } catch {
              // Individual closed-issue fetch failure is non-critical
            }
          }
        }
      } catch {
        // Supabase hydration failure is non-critical
      }

      // Re-enrich any issues with incomplete PR data (url but no files_changed)
      const incompletePRIssues = issues.filter(
        (i) => i.pr?.url && (!i.pr.files_changed || i.pr.files_changed.length === 0)
      );
      for (const issue of incompletePRIssues) {
        const prMatch = issue.pr!.url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
        if (!prMatch) continue;
        try {
          const prRes = await fetch(
            `/api/github/pr-details?owner=${encodeURIComponent(prMatch[1])}&repo=${encodeURIComponent(prMatch[2])}&pr=${prMatch[3]}`,
            { headers: apiKeyHeaders(keysRef.current) },
          );
          if (prRes.ok) {
            const prData = await prRes.json();
            issue.pr = {
              ...issue.pr!,
              number: issue.pr!.number || parseInt(prMatch[3], 10),
              title: prData.title || issue.pr!.title || `PR #${prMatch[3]}`,
              branch: prData.branch || issue.pr!.branch || "",
              files_changed: prData.files || [],
            };
            // Persist enriched PR back to Supabase
            fetch("/api/supabase/sessions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repo: `${owner}/${name}`,
                issue_number: issue.number,
                pr: issue.pr,
              }),
            }).catch(() => {});
          }
        } catch {
          // PR re-enrichment failure is non-critical
        }
      }

      dispatch({ type: "SET_ISSUES", issues });

      // Resume polling for any in-progress session
      const activeIssue = issues.find(
        (i) => (i.status === "scoping" || i.status === "fixing" || i.status === "blocked") &&
               (i.scoping_session || i.fix_session)
      );
      if (activeIssue) {
        const sessionType = activeIssue.status === "scoping" ? "scoping" as const : "fixing" as const;
        const session = sessionType === "scoping"
          ? activeIssue.scoping_session
          : activeIssue.fix_session;
        if (session) {
          dispatch({
            type: "SET_SESSION",
            sessionId: session.session_id,
            sessionUrl: session.session_url,
            issueNumber: activeIssue.number,
            sessionType,
          });
        }
      }

      if (!stateRef.current.scopingApproved) {
        const hasPending = issues.some((i) => i.status === "pending");
        if (hasPending) {
          dispatch({ type: "TOGGLE_ACU_MODAL" });
        } else {
          dispatch({ type: "APPROVE_SCOPING" });
        }
      }
    } catch (err) {
      dispatch({
        type: "SET_ERROR",
        error: err instanceof Error ? err.message : "Failed to load issues",
      });
      dispatch({ type: "SET_LOADING", loading: false });
    }
  }, []);

  // Fetch issues when switching to live mode
  useEffect(() => {
    if (state.mode === "live" && state.loading) {
      fetchIssues();
    }
  }, [state.mode, state.loading, fetchIssues]);

  // --- Auto-scoping pipeline ---
  const handleStartScope = useCallback(async (issue: DashboardIssue) => {
    if (scopingInProgressRef.current) {
      showToast("Another issue is being scoped \u2014 this one will be scoped next automatically");
      return;
    }
    if (stateRef.current.mode !== "live" || !stateRef.current.repo) return;

    scopingInProgressRef.current = true;

    dispatch({
      type: "UPDATE_ISSUE",
      issueNumber: issue.number,
      patch: { status: "scoping" },
    });

    try {
      const res = await fetch("/api/devin/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(keysRef.current) },
        body: JSON.stringify({
          issueTitle: issue.title,
          issueBody: issue.body,
          issueNumber: issue.number,
          repo: `${stateRef.current.repo.owner}/${stateRef.current.repo.name}`,
          acuLimit: ACU_LIMITS.scoping,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to start scoping");
      }
      const data = await res.json();

      dispatch({
        type: "UPDATE_ISSUE",
        issueNumber: issue.number,
        patch: {
          scoping_session: {
            session_id: data.sessionId,
            session_url: data.sessionUrl,
            started_at: new Date().toISOString(),
          },
        },
      });

      dispatch({
        type: "SET_SESSION",
        sessionId: data.sessionId,
        sessionUrl: data.sessionUrl,
        issueNumber: issue.number,
        sessionType: "scoping",
      });
    } catch (err) {
      scopingInProgressRef.current = false;
      dispatch({
        type: "UPDATE_ISSUE",
        issueNumber: issue.number,
        patch: { status: "failed" },
      });
      dispatch({
        type: "SET_ERROR",
        error: err instanceof Error ? err.message : "Failed to start scoping",
      });
    }
  }, [showToast]);

  // Reset scoping guard when session clears (so auto-scope picks up next issue)
  useEffect(() => {
    if (!state.activeSession) {
      scopingInProgressRef.current = false;
    }
  }, [state.activeSession]);

  // Auto-scope: pick up next pending issue when no session is active
  useEffect(() => {
    if (state.mode !== "live" || state.activeSession || state.loading || !state.scopingApproved) return;

    const pendingIssue = state.issues.find((i) => i.status === "pending");
    if (pendingIssue) {
      handleStartScope(pendingIssue);
    }
  }, [state.mode, state.activeSession, state.loading, state.scopingApproved, state.issues, handleStartScope]);

  // --- Periodic issue refresh (every 60s in live mode) ---
  const refreshIssues = useCallback(async () => {
    if (stateRef.current.mode !== "live" || !stateRef.current.repo) return;

    const { owner, name } = stateRef.current.repo;

    try {
      // Fetch new issues and latest commit in parallel
      const [issuesRes, commitRes] = await Promise.all([
        fetch(
          `/api/github/issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
          { headers: apiKeyHeaders(keysRef.current) },
        ),
        fetch(
          `/api/github/latest-commit?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`,
          { headers: apiKeyHeaders(keysRef.current) },
        ),
      ]);

      if (issuesRes.ok) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const raw: any[] = await issuesRes.json();
        const newIssues: DashboardIssue[] = raw.map((r) => ({
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
        }));
        dispatch({ type: "ADD_ISSUES", issues: newIssues });
      }

      if (commitRes.ok) {
        const commit = await commitRes.json();
        if (commit.date) {
          dispatch({ type: "SET_MAIN_COMMIT_DATE", date: commit.date });
        }
      }
    } catch {
      // Silent failure — refresh is best-effort
    }
  }, []);

  useEffect(() => {
    if (state.mode !== "live" || state.loading) return;

    const scheduleRefresh = () => {
      issueRefreshRef.current = setTimeout(async () => {
        await refreshIssues();
        scheduleRefresh();
      }, ISSUE_REFRESH_INTERVAL);
    };

    scheduleRefresh();

    return () => {
      if (issueRefreshRef.current) clearTimeout(issueRefreshRef.current);
    };
  }, [state.mode, state.loading, refreshIssues]);

  // --- Polling for active sessions ---
  const scheduleNextPoll = useCallback((status: string) => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    pollingRef.current = setTimeout(() => pollSessionRef.current(), getPollingInterval(status));
  }, []);

  // --- GitHub Comment Bridge helpers ---
  const postGitHubComment = useCallback(
    async (
      issueNumber: number,
      commentBody: string,
    ): Promise<{ id: number; created_at: string; html_url: string } | null> => {
      const current = stateRef.current;
      if (!current.repo) return null;
      try {
        const res = await fetch("/api/github/comments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...apiKeyHeaders(keysRef.current),
          },
          body: JSON.stringify({
            owner: current.repo.owner,
            repo: current.repo.name,
            issueNumber,
            comment: commentBody,
          }),
        });
        if (!res.ok) {
          if (res.status === 403) {
            showToast("GitHub comments disabled \u2014 token missing write access", 4000);
            return null;
          }
          return null;
        }
        return await res.json();
      } catch {
        return null;
      }
    },
    [showToast],
  );

  const pollInboundComments = useCallback(
    async (issue: DashboardIssue, sessionId: string): Promise<boolean> => {
      const current = stateRef.current;
      if (!current.repo || !issue.last_devin_comment_at) return false;
      try {
        const res = await fetch(
          `/api/github/comments?owner=${encodeURIComponent(current.repo.owner)}&repo=${encodeURIComponent(current.repo.name)}&issueNumber=${issue.number}&since=${encodeURIComponent(issue.last_devin_comment_at)}`,
          { headers: apiKeyHeaders(keysRef.current) },
        );
        if (!res.ok) return false;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const comments: any[] = await res.json();

        const alreadyForwarded = new Set(issue.forwarded_comment_ids);
        const newForwardedIds: number[] = [];

        const pendingMsg = pendingMessagesRef.current.get(issue.number);

        for (const c of comments) {
          if (alreadyForwarded.has(c.id)) continue;
          if (isDevinComment(c.body)) continue;

          if (pendingMsg && isDuplicateMessage(c.body, pendingMsg, c.created_at, new Date().toISOString())) {
            newForwardedIds.push(c.id);
            continue;
          }

          try {
            await fetch("/api/devin/message", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...apiKeyHeaders(keysRef.current),
              },
              body: JSON.stringify({
                sessionId,
                message: `The user has provided the following clarification to your open questions (via GitHub comment from @${c.user?.login || "unknown"}):\n"${c.body}"\n\nPlease re-analyze the issue with this new information and output an UPDATED JSON analysis wrapped in \`\`\`json fences (same schema). Update your confidence level accordingly.\nDo NOT start implementing the fix — only provide the updated analysis.`,
              }),
            });
            newForwardedIds.push(c.id);
          } catch {
            // Forward failure is non-critical
          }
        }

        if (newForwardedIds.length > 0) {
          const updatedIds = [...issue.forwarded_comment_ids, ...newForwardedIds];
          dispatch({
            type: "UPDATE_ISSUE",
            issueNumber: issue.number,
            patch: { forwarded_comment_ids: updatedIds },
          });

          // Trigger re-scoping so the dashboard polls for Devin's updated analysis
          dispatch({
            type: "UPDATE_ISSUE",
            issueNumber: issue.number,
            patch: { status: "scoping" as const },
          });
          dispatch({
            type: "SET_SESSION",
            sessionId,
            sessionUrl: issue.scoping_session?.session_url || "",
            issueNumber: issue.number,
            sessionType: "scoping",
          });

          if (current.repo) {
            fetch("/api/supabase/sessions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repo: `${current.repo.owner}/${current.repo.name}`,
                issue_number: issue.number,
                forwarded_comment_ids: updatedIds,
                status: "scoping",
                scoping: null,
                scoped_at: null,
              }),
            }).catch(() => {});
          }
          return true;
        }
        return false;
      } catch {
        // Inbound comment polling failure is non-critical
        return false;
      }
    },
    [],
  );

  const pollSessionRef = useRef(async () => {});
  pollSessionRef.current = async () => {
    const current = stateRef.current;
    if (current.mode !== "live" || !current.activeSession) return;

    const { sessionId, issueNumber, type } = current.activeSession;

    try {
      const repoStr = current.repo ? `${current.repo.owner}/${current.repo.name}` : "";
      const res = await fetch(
        `/api/devin/status?sessionId=${encodeURIComponent(sessionId)}&repo=${encodeURIComponent(repoStr)}&issueNumber=${issueNumber}`,
        { headers: apiKeyHeaders(keysRef.current) },
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        if (res.status === 404) {
          dispatch({ type: "SET_ERROR", error: data.error || "Session expired" });
          dispatch({ type: "CLEAR_SESSION" });
          return;
        }
        throw new Error(data.error || "Polling failed");
      }
      const data = await res.json();

      // Find the issue being worked on
      const issue = current.issues.find((i) => i.number === issueNumber);
      if (!issue) return;

      // Determine session timing context
      const sessionStart = type === "scoping"
        ? issue.scoping_session?.started_at
        : issue.fix_session?.started_at;
      const timeoutLimit = type === "scoping"
        ? TIMEOUT_LIMITS.scoping
        : TIMEOUT_LIMITS.fixing;

      const result = interpretPollResult(data, type, {
        issueNumber,
        sessionStartedAt: sessionStart,
        timeoutLimit,
      });

      switch (result.action) {
        case "timed_out":
        case "failed":
          dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: result.patch });
          dispatch({ type: "CLEAR_SESSION" });
          break;

        case "scoped": {
          dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: result.patch });
          dispatch({ type: "CLEAR_SESSION" });

          // Outbound: post scoping questions on GitHub for yellow/red
          const patchConf = result.patch.confidence;
          const patchScoping = result.patch.scoping;
          if (
            patchScoping &&
            (patchConf === "yellow" || patchConf === "red") &&
            patchScoping.open_questions.length > 0 &&
            !issue.last_devin_comment_id
          ) {
            const body = formatScopingComment(issueNumber, patchScoping);
            const posted = await postGitHubComment(issueNumber, body);
            if (posted) {
              dispatch({
                type: "UPDATE_ISSUE",
                issueNumber,
                patch: {
                  status: "awaiting_reply",
                  last_devin_comment_id: posted.id,
                  last_devin_comment_at: posted.created_at,
                  github_comment_url: posted.html_url,
                },
              });
              if (current.repo) {
                fetch("/api/supabase/sessions", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    repo: `${current.repo.owner}/${current.repo.name}`,
                    issue_number: issueNumber,
                    status: "awaiting_reply",
                    last_devin_comment_id: posted.id,
                    last_devin_comment_at: posted.created_at,
                    github_comment_url: posted.html_url,
                  }),
                }).catch(() => {});
              }
            }
          }
          break;
        }

        case "done": {
          // Enrich PR data from GitHub API if available
          let finalPatch = result.patch;
          if (result.patch.pr && current.repo) {
            try {
              const prRes = await fetch(
                `/api/github/pr-details?owner=${encodeURIComponent(current.repo.owner)}&repo=${encodeURIComponent(current.repo.name)}&pr=${result.patch.pr.number}`,
                { headers: apiKeyHeaders(keysRef.current) },
              );
              if (prRes.ok) {
                const prData = await prRes.json();
                finalPatch = {
                  ...finalPatch,
                  pr: {
                    ...result.patch.pr,
                    title: prData.title || result.patch.pr.title,
                    branch: prData.branch || result.patch.pr.branch,
                    files_changed: prData.files || [],
                  },
                };
              }
            } catch {
              // PR enrichment failure is non-critical
            }
          }
          dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: finalPatch });
          dispatch({ type: "CLEAR_SESSION" });
          // Persist enriched PR data to Supabase
          if (finalPatch.pr && current.repo) {
            fetch("/api/supabase/sessions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repo: `${current.repo.owner}/${current.repo.name}`,
                issue_number: issueNumber,
                pr: finalPatch.pr,
              }),
            }).catch(() => {});
          }

          // Outbound: post fix completion comment on GitHub
          if (finalPatch.pr?.url) {
            const body = formatDoneComment(
              issueNumber,
              finalPatch.pr.url,
              finalPatch.pr.title || `Fix for #${issueNumber}`,
            );
            postGitHubComment(issueNumber, body).catch(() => {});
          }
          break;
        }

        case "blocked": {
          const wasAlreadyBlocked = issue.status === "blocked";
          dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: result.patch });

          // Outbound: post blocker comment on GitHub (only for new blockers)
          if (!wasAlreadyBlocked && result.patch.blocker) {
            const blocker = result.patch.blocker as BlockerInfo;
            const body = formatBlockedComment(issueNumber, blocker);
            const posted = await postGitHubComment(issueNumber, body);
            if (posted) {
              dispatch({
                type: "UPDATE_ISSUE",
                issueNumber,
                patch: {
                  last_devin_comment_id: posted.id,
                  last_devin_comment_at: posted.created_at,
                  github_comment_url: posted.html_url,
                },
              });
              if (current.repo) {
                fetch("/api/supabase/sessions", {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    repo: `${current.repo.owner}/${current.repo.name}`,
                    issue_number: issueNumber,
                    last_devin_comment_id: posted.id,
                    last_devin_comment_at: posted.created_at,
                    github_comment_url: posted.html_url,
                  }),
                }).catch(() => {});
              }
            }
          }

          // Inbound: poll for GitHub replies on blocked issues
          if (issue.last_devin_comment_at) {
            await pollInboundComments(issue, sessionId);
          }

          scheduleNextPoll("blocked");
          break;
        }

        case "continue": {
          const cont = result as Extract<PollResult, { action: "continue" }>;
          if (cont.patch) {
            dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: cont.patch });
          }
          scheduleNextPoll(cont.nextPollCategory);
          break;
        }
      }
    } catch(err) {
      console.error("Polling error:", err);
      scheduleNextPoll("default");
    }
  };

  // Start/stop polling based on active session
  useEffect(() => {
    if (state.mode === "live" && state.activeSession) {
      const type = state.activeSession.type;
      scheduleNextPoll(type === "scoping" ? "scoping" : "fixing");
    }
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [state.mode, state.activeSession, scheduleNextPoll]);

  // Poll for inbound GitHub comments on issues awaiting replies
  useEffect(() => {
    if (state.mode !== "live") return;

    const interval = setInterval(async () => {
      const current = stateRef.current;
      if (!current.repo) return;

      for (const issue of current.issues) {
        if (!issue.last_devin_comment_id || !issue.last_devin_comment_at) continue;
        if (issue.status !== "awaiting_reply" && issue.status !== "scoped") continue;

        const sessionId =
          issue.scoping_session?.session_id || issue.fix_session?.session_id;
        if (!sessionId) continue;

        const forwarded = await pollInboundComments(issue, sessionId);
        if (forwarded) break; // Re-scoping triggered, process one at a time
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, [state.mode, pollInboundComments]);

  // --- Action Handlers ---
  const handleStartFix = useCallback(
    async (issue: DashboardIssue, previousContext?: string) => {
      if (state.mode === "demo") { showDemoToast(); return; }
      if (!state.repo || !issue.scoping) return;

      dispatch({
        type: "UPDATE_ISSUE",
        issueNumber: issue.number,
        patch: { status: "fixing", fix_started_at: new Date().toISOString() },
      });

      try {
        const res = await fetch("/api/devin/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...apiKeyHeaders(keysRef.current) },
          body: JSON.stringify({
            issueTitle: issue.title,
            issueBody: issue.body,
            issueNumber: issue.number,
            repo: `${state.repo.owner}/${state.repo.name}`,
            acuLimit: ACU_LIMITS.fixing,
            scopingResult: issue.scoping,
            previousContext,
          }),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to start fix session");
        }
        const data = await res.json();

        dispatch({
          type: "UPDATE_ISSUE",
          issueNumber: issue.number,
          patch: {
            fix_session: {
              session_id: data.sessionId,
              session_url: data.sessionUrl,
              started_at: new Date().toISOString(),
            },
          },
        });

        dispatch({
          type: "SET_SESSION",
          sessionId: data.sessionId,
          sessionUrl: data.sessionUrl,
          issueNumber: issue.number,
          sessionType: "fixing",
        });
      } catch (err) {
        dispatch({
          type: "UPDATE_ISSUE",
          issueNumber: issue.number,
          patch: { status: "failed" },
        });
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to start fix",
        });
      }
    },
    [state.mode, state.repo, showDemoToast]
  );

  const handleSendMessage = useCallback(
    async (sessionId: string, message: string) => {
      if (state.mode === "demo") { showDemoToast(); return; }

      const activeIssueNumber = stateRef.current.activeSession?.issueNumber;
      if (activeIssueNumber) {
        pendingMessagesRef.current.set(activeIssueNumber, message);
      }

      // Optimistically append user's message to the issue's local thread
      const current = stateRef.current;
      const target = current.issues.find((iss) => iss.fix_session?.session_id === sessionId || iss.scoping_session?.session_id === sessionId);
      if (target) {
        const optimistic = {
          role: "user" as const,
          text: message,
          timestamp: new Date().toISOString(),
          source: "app" as const,
        };
        dispatch({ type: "UPDATE_ISSUE", issueNumber: target.number, patch: { messages: [optimistic] } });
      }

      const res = await fetch("/api/devin/message", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...apiKeyHeaders(keysRef.current) },
        body: JSON.stringify({ sessionId, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const errorMsg = data.error || `Message failed (${res.status})`;
        dispatch({ type: "SET_ERROR", error: errorMsg });
        throw new Error(errorMsg);
      }

      // Trigger immediate re-poll so updates show quickly
      if (pollingRef.current) clearTimeout(pollingRef.current);
      const type = stateRef.current.activeSession?.type || (target && target.scoping_session?.session_id === sessionId ? "scoping" : "fixing");
      scheduleNextPoll(type === "scoping" ? "scoping" : "fixing");
    },
    [state.mode, showDemoToast, scheduleNextPoll]
  );

  const handleSendClarification = useCallback(
    async (issue: DashboardIssue, message: string) => {
      if (state.mode === "demo") { showDemoToast(); return; }
      if (!state.repo) return;

      const sessionId = issue.scoping_session?.session_id;
      if (!sessionId) {
        dispatch({ type: "SET_ERROR", error: "No scoping session found for clarification" });
        return;
      }

      const wrappedMessage = `The user has provided the following clarification to your open questions:
"${message}"

Please re-analyze the issue with this new information and output an UPDATED JSON analysis wrapped in \`\`\`json fences (same schema). Update your confidence level accordingly.
Do NOT start implementing the fix — only provide the updated analysis.`;

      // 1. Set issue status back to "scoping"
      dispatch({
        type: "UPDATE_ISSUE",
        issueNumber: issue.number,
        patch: { status: "scoping" as const },
      });

      // 2. Re-establish the active session for polling
      dispatch({
        type: "SET_SESSION",
        sessionId,
        sessionUrl: issue.scoping_session!.session_url,
        issueNumber: issue.number,
        sessionType: "scoping",
      });

      // 3. Clear the Supabase cache so polling picks up fresh data
      const repoStr = `${state.repo.owner}/${state.repo.name}`;
      fetch("/api/supabase/sessions", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          repo: repoStr,
          issue_number: issue.number,
          status: "scoping",
          scoping: null,
          scoped_at: null,
        }),
      }).catch(() => {});

      // 4. Send the wrapped clarification message to Devin
      try {
        const res = await fetch("/api/devin/message", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...apiKeyHeaders(keysRef.current) },
          body: JSON.stringify({ sessionId, message: wrappedMessage }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Clarification message failed (${res.status})`);
        }
      } catch (err) {
        // Revert to scoped state on failure
        dispatch({
          type: "UPDATE_ISSUE",
          issueNumber: issue.number,
          patch: { status: "scoped" as const },
        });
        dispatch({ type: "CLEAR_SESSION" });
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to send clarification",
        });
      }
    },
    [state.mode, state.repo, showDemoToast]
  );

  const handleAbort = useCallback(
    async (issueNumber: number, sessionId: string) => {
      if (state.mode === "demo") { showDemoToast(); return; }

      try {
        const res = await fetch("/api/devin/terminate", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...apiKeyHeaders(keysRef.current) },
          body: JSON.stringify({ sessionId }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Abort failed (${res.status})`);
        }

        dispatch({
          type: "UPDATE_ISSUE",
          issueNumber,
          patch: { status: "aborted" },
        });
        dispatch({ type: "CLEAR_SESSION" });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error: err instanceof Error ? err.message : "Failed to abort",
        });
      }
    },
    [state.mode, showDemoToast]
  );

  const handleRetry = useCallback(
    async (issue: DashboardIssue) => {
      if (state.mode === "demo") { showDemoToast(); return; }

      // Build context from the previous session (blocker Q + pending user answer)
      let previousContext: string | undefined;
      const pendingMsg = pendingMessagesRef.current.get(issue.number);
      if (issue.blocker || pendingMsg) {
        const parts: string[] = [];
        if (issue.blocker) {
          parts.push(`A previous session asked: "${issue.blocker.what_happened}"`);
          parts.push(`Suggestion was: "${issue.blocker.suggestion}"`);
        }
        if (pendingMsg) {
          parts.push(`The user responded: "${pendingMsg}"`);
          pendingMessagesRef.current.delete(issue.number);
        }
        previousContext = parts.join("\n");
      }

      // Terminate the old session to avoid idempotent reuse
      if (issue.fix_session?.session_id) {
        try {
          await fetch("/api/devin/terminate", {
            method: "POST",
            headers: { "Content-Type": "application/json", ...apiKeyHeaders(keysRef.current) },
            body: JSON.stringify({ sessionId: issue.fix_session.session_id }),
          });
        } catch {
          // Best effort — session may already be terminated
        }
      }

      // Reset to scoped state and trigger a new fix
      dispatch({
        type: "UPDATE_ISSUE",
        issueNumber: issue.number,
        patch: {
          status: "scoped",
          fix_progress: null,
          blocker: null,
          fix_session: null,
          steps: [],
          completed_at: null,
        },
      });
      // Start fix with previous context
      handleStartFix({
        ...issue,
        status: "scoped",
        fix_progress: null,
        blocker: null,
        fix_session: null,
        steps: [],
      }, previousContext);
    },
    [handleStartFix, state.mode, showDemoToast]
  );

  const handleApprove = useCallback(
    async (issueNumber: number, sessionId: string) => {
      if (state.mode === "demo") { showDemoToast(); return; }

      // Send approval message to Devin
      try {
        const res = await fetch("/api/devin/message", {
          method: "POST",
          headers: { "Content-Type": "application/json", ...apiKeyHeaders(keysRef.current) },
          body: JSON.stringify({
            sessionId,
            message:
              "Approved. Please proceed with the suggested approach.",
          }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `Approval failed (${res.status})`);
        }

        dispatch({
          type: "UPDATE_ISSUE",
          issueNumber,
          patch: { status: "fixing", blocker: null },
        });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error:
            err instanceof Error ? err.message : "Failed to approve",
        });
      }
    },
    [state.mode, showDemoToast]
  );

  const handleOpenSettings = useCallback(() => setSettingsOpen(true), []);

  const actions: IssueActions = useMemo(
    () => ({
      onStartFix: handleStartFix,
      onStartScope: handleStartScope,
      onSendMessage: handleSendMessage,
      onSendClarification: handleSendClarification,
      onAbort: handleAbort,
      onRetry: handleRetry,
      onApprove: handleApprove,
      onOpenSettings: handleOpenSettings,
    }),
    [handleStartFix, handleStartScope, handleSendMessage, handleSendClarification, handleAbort, handleRetry, handleApprove, handleOpenSettings]
  );

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <TopBar
        repo={repo}
        mode={state.mode}
        issues={state.issues}
        onDisconnect={onDisconnect}
        onRefresh={fetchIssues}
        onOpenSettings={() => setSettingsOpen(true)}
        hasUserKeys={hasKeys}
        loading={state.loading}
        onToggleMode={() => {
          if (state.mode === "demo") {
            const hasPending = state.issues.some((i) => i.status === "pending");
            if (hasPending) {
              dispatch({ type: "TOGGLE_ACU_MODAL" });
            } else {
              dispatch({ type: "SET_MODE", mode: "live" });
            }
          } else {
            dispatch({ type: "SET_MODE", mode: "demo" });
          }
        }}
      />

      {state.activeSession && (
        <ActiveSessionBanner
          issueNumber={state.activeSession.issueNumber}
          sessionType={state.activeSession.type}
          sessionUrl={state.activeSession.sessionUrl}
          onDismiss={() => dispatch({ type: "CLEAR_SESSION" })}
        />
      )}

      {state.error && (
        <div className="w-full bg-accent-red/10 border-b border-accent-red/20 px-4 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-accent-red text-sm">{state.error}</span>
            {state.error.includes("Settings") && (
              <button
                onClick={() => { dispatch({ type: "SET_ERROR", error: null }); setSettingsOpen(true); }}
                className="text-accent-blue text-xs font-medium hover:underline whitespace-nowrap"
              >
                Open Settings
              </button>
            )}
          </div>
          <button
            onClick={() => dispatch({ type: "SET_ERROR", error: null })}
            className="text-accent-red text-xs hover:underline whitespace-nowrap"
          >
            Dismiss
          </button>
        </div>
      )}

      {state.mode === "live" && !hasKeys && !keysBannerDismissed && (
        <div className="w-full bg-accent-blue/10 border-b border-accent-blue/20 px-4 py-2 flex items-center justify-between gap-3">
          <span className="text-accent-blue text-sm">
            No custom API keys configured — only public repos can be scoped and PRs cannot be created.
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-accent-blue text-xs font-medium hover:underline whitespace-nowrap"
            >
              Open Settings
            </button>
            <button
              onClick={() => setKeysBannerDismissed(true)}
              className="text-accent-blue/60 text-xs hover:underline whitespace-nowrap"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      <FilterBar
        filter={state.filter}
        issues={state.issues}
        onFilterChange={(f) => dispatch({ type: "SET_FILTER", filter: f })}
        sortBy={state.sortBy}
        onSortChange={(s) => dispatch({ type: "SET_SORT", sortBy: s })}
        onScopeAll={() => dispatch({ type: "TOGGLE_ACU_MODAL" })}
      />

      {state.loading ? (
        <div className="flex-1 flex items-center justify-center">
          <span className="text-text-muted text-sm animate-pulse">
            Loading issues...
          </span>
        </div>
      ) : (
        <div className="flex-1 flex justify-center">
          <IssueList
            issues={filteredIssues}
            expandedIssueId={state.expandedIssueId}
            dispatch={dispatch}
            mode={state.mode}
            actions={actions}
            lastMainCommitDate={state.lastMainCommitDate}
            activeSession={state.activeSession}
          />
        </div>
      )}

      <ACUModal
        issueCount={
          state.issues.filter((i) => i.status === "pending").length
        }
        open={state.acuModalOpen}
        onClose={() => dispatch({ type: "TOGGLE_ACU_MODAL" })}
        onConfirm={() => {
          dispatch({ type: "TOGGLE_ACU_MODAL" });
          dispatch({ type: "APPROVE_SCOPING" });
          if (state.mode === "demo") {
            dispatch({ type: "SET_MODE", mode: "live" });
          }
        }}
      />

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        keys={keys}
        onSave={setKeys}
        onClear={clearKeys}
      />

      {/* Toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-dp-card border border-border-subtle rounded-lg px-4 py-2.5 shadow-lg">
          <span className="text-text-secondary text-sm">{toastMessage}</span>
        </div>
      )}
    </div>
  );
}
