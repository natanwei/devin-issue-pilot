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
import { useApiKeys, apiKeyHeaders } from "@/lib/api-keys";
import { getDemoIssues } from "@/lib/demo-data";
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
        issues: state.issues.map((i) =>
          i.number === action.issueNumber ? { ...i, ...action.patch } : i
        ),
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
    if (filter.status === "fixing") {
      filtered = filtered.filter(
        (i) => i.status === "fixing" || i.status === "blocked"
      );
    } else if (filter.status === "done") {
      filtered = filtered.filter(
        (i) => i.status === "done" || i.status === "pr_open"
      );
    } else {
      filtered = filtered.filter((i) => i.status === filter.status);
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

  // --- Demo mode toast ---
  const [demoToast, setDemoToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showDemoToast = useCallback(() => {
    setDemoToast("Switch to Live mode to use this action");
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setDemoToast(null), 2000);
  }, []);

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
          scoping_session: null,
          fix_session: null,
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
                scoped_at: p.scoped_at || null,
                fix_started_at: p.fix_started_at || null,
                completed_at: p.completed_at || null,
              };
            }
          }
        }
      } catch {
        // Supabase hydration failure is non-critical
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
    if (scopingInProgressRef.current) return;
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
  }, []);

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
          scoping_session: null,
          fix_session: null,
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
        case "scoped":
        case "failed":
          dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: result.patch });
          dispatch({ type: "CLEAR_SESSION" });
          break;

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
          break;
        }

        case "blocked":
          dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: result.patch });
          scheduleNextPoll("blocked");
          break;

        case "continue":
          scheduleNextPoll(result.nextPollCategory);
          break;
      }
    } catch (err) {
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

      // Trigger immediate re-poll so blocker updates show quickly
      if (pollingRef.current) clearTimeout(pollingRef.current);
      scheduleNextPoll("fixing");
    },
    [state.mode, showDemoToast, scheduleNextPoll]
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
      onAbort: handleAbort,
      onRetry: handleRetry,
      onApprove: handleApprove,
      onOpenSettings: handleOpenSettings,
    }),
    [handleStartFix, handleStartScope, handleSendMessage, handleAbort, handleRetry, handleApprove, handleOpenSettings]
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
            No custom API keys configured — only public repos can be scoped.
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

      {/* Demo mode toast */}
      {demoToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-dp-card border border-border-subtle rounded-lg px-4 py-2.5 shadow-lg">
          <span className="text-text-secondary text-sm">{demoToast}</span>
        </div>
      )}
    </div>
  );
}
