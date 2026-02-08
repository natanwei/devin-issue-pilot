"use client";

import { useReducer, useMemo, useCallback, useEffect, useRef } from "react";
import {
  DashboardState,
  DashboardAction,
  DashboardIssue,
  FilterState,
} from "@/lib/types";
import {
  CONFIDENCE_SORT_ORDER,
  POLLING_INTERVALS,
  TIMEOUT_LIMITS,
  ACU_LIMITS,
} from "@/lib/constants";
import { getDemoIssues } from "@/lib/demo-data";
import TopBar from "./TopBar";
import FilterBar from "./FilterBar";
import IssueList from "./IssueList";
import ACUModal from "./ACUModal";
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
  const stateRef = useRef(state);
  stateRef.current = state;

  const filteredIssues = useMemo(
    () => filterAndSortIssues(state.issues, state.filter, state.sortBy),
    [state.issues, state.filter, state.sortBy]
  );

  // --- Fetch issues from GitHub (live mode) ---
  const fetchIssues = useCallback(async () => {
    if (stateRef.current.mode !== "live" || !stateRef.current.repo) return;
    dispatch({ type: "SET_LOADING", loading: true });
    try {
      const { owner, name } = stateRef.current.repo;
      const res = await fetch(
        `/api/github/issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(name)}`
      );
      if (!res.ok) throw new Error("Failed to fetch issues");
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

      dispatch({ type: "SET_ISSUES", issues });
      if (!stateRef.current.scopingApproved) {
        dispatch({ type: "TOGGLE_ACU_MODAL" });
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
    if (stateRef.current.mode !== "live" || !stateRef.current.repo) return;

    dispatch({
      type: "UPDATE_ISSUE",
      issueNumber: issue.number,
      patch: { status: "scoping" },
    });

    try {
      const res = await fetch("/api/devin/scope", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          issueTitle: issue.title,
          issueBody: issue.body,
          issueNumber: issue.number,
          repo: `${stateRef.current.repo.owner}/${stateRef.current.repo.name}`,
          acuLimit: ACU_LIMITS.scoping,
        }),
      });

      if (!res.ok) throw new Error("Failed to start scoping");
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

  // Auto-scope: pick up next pending issue when no session is active
  useEffect(() => {
    if (state.mode !== "live" || state.activeSession || state.loading || !state.scopingApproved) return;

    const pendingIssue = state.issues.find((i) => i.status === "pending");
    if (pendingIssue) {
      handleStartScope(pendingIssue);
    }
  }, [state.mode, state.activeSession, state.loading, state.scopingApproved, state.issues, handleStartScope]);

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
      const res = await fetch(
        `/api/devin/status?sessionId=${encodeURIComponent(sessionId)}`
      );
      if (!res.ok) throw new Error("Polling failed");
      const data = await res.json();

      // Find the issue being worked on
      const issue = current.issues.find((i) => i.number === issueNumber);
      if (!issue) return;

      // Check timeouts
      const sessionStart = type === "scoping"
        ? issue.scoping_session?.started_at
        : issue.fix_session?.started_at;
      if (sessionStart) {
        const elapsed = Date.now() - new Date(sessionStart).getTime();
        const limit = type === "scoping" ? TIMEOUT_LIMITS.scoping : TIMEOUT_LIMITS.fixing;
        if (elapsed > limit) {
          dispatch({
            type: "UPDATE_ISSUE",
            issueNumber,
            patch: { status: "timed_out" },
          });
          dispatch({ type: "CLEAR_SESSION" });
          return;
        }
      }

      if (data.isTerminal) {
        if (type === "scoping") {
          const output = data.structuredOutput;
          if (output) {
            dispatch({
              type: "UPDATE_ISSUE",
              issueNumber,
              patch: {
                status: "scoped",
                confidence: output.confidence || "yellow",
                scoping: output,
                scoped_at: new Date().toISOString(),
              },
            });
          } else {
            dispatch({
              type: "UPDATE_ISSUE",
              issueNumber,
              patch: { status: "scoped", scoped_at: new Date().toISOString() },
            });
          }
        } else {
          // Fix session finished
          if (data.pullRequest?.url) {
            const prMatch = data.pullRequest.url.match(/\/pull\/(\d+)/);
            const prNumber = prMatch ? parseInt(prMatch[1]) : null;

            // Enrich PR data from GitHub API
            let prInfo = prNumber
              ? {
                  url: data.pullRequest.url,
                  number: prNumber,
                  title: `Fix for #${issueNumber}`,
                  branch: `devin/fix-${issueNumber}`,
                  files_changed: [] as import("@/lib/types").PRFileChange[],
                }
              : null;

            if (prNumber && current.repo) {
              try {
                const prRes = await fetch(
                  `/api/github/pr-details?owner=${encodeURIComponent(current.repo.owner)}&repo=${encodeURIComponent(current.repo.name)}&pr=${prNumber}`
                );
                if (prRes.ok) {
                  const prData = await prRes.json();
                  prInfo = {
                    url: prData.url || data.pullRequest.url,
                    number: prNumber,
                    title: prData.title || `Fix for #${issueNumber}`,
                    branch: prData.branch || `devin/fix-${issueNumber}`,
                    files_changed: prData.files || [],
                  };
                }
              } catch {
                // PR enrichment failure is non-critical, keep placeholder
              }
            }

            dispatch({
              type: "UPDATE_ISSUE",
              issueNumber,
              patch: {
                status: "done",
                completed_at: new Date().toISOString(),
                pr: prInfo,
              },
            });
          } else if (data.statusEnum === "stopped") {
            dispatch({
              type: "UPDATE_ISSUE",
              issueNumber,
              patch: {
                status: "failed",
                fix_progress: {
                  status: "blocked",
                  current_step: "",
                  completed_steps: [],
                  pr_url: null,
                  blockers: [data.status || "Session stopped unexpectedly"],
                },
              },
            });
          } else {
            dispatch({
              type: "UPDATE_ISSUE",
              issueNumber,
              patch: {
                status: "done",
                completed_at: new Date().toISOString(),
              },
            });
          }
        }
        dispatch({ type: "CLEAR_SESSION" });
      } else if (type === "scoping" && data.structuredOutput) {
        // Scoping produced output but session is still running/blocked
        const output = data.structuredOutput;
        dispatch({
          type: "UPDATE_ISSUE",
          issueNumber,
          patch: {
            status: "scoped",
            confidence: output.confidence || "yellow",
            scoping: output,
            scoped_at: new Date().toISOString(),
          },
        });
        dispatch({ type: "CLEAR_SESSION" });
      } else if (data.statusEnum === "blocked") {
        dispatch({
          type: "UPDATE_ISSUE",
          issueNumber,
          patch: {
            status: "blocked",
            blocker: {
              what_happened: data.status || "Devin needs input",
              suggestion: "Please provide guidance to continue",
            },
          },
        });
        scheduleNextPoll("blocked");
      } else {
        scheduleNextPoll(type === "scoping" ? "scoping" : "fixing");
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
    async (issue: DashboardIssue) => {
      if (state.mode === "demo") return;
      if (!state.repo || !issue.scoping) return;

      dispatch({
        type: "UPDATE_ISSUE",
        issueNumber: issue.number,
        patch: { status: "fixing", fix_started_at: new Date().toISOString() },
      });

      try {
        const res = await fetch("/api/devin/fix", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            issueTitle: issue.title,
            issueBody: issue.body,
            issueNumber: issue.number,
            repo: `${state.repo.owner}/${state.repo.name}`,
            acuLimit: ACU_LIMITS.fixing,
            scopingResult: issue.scoping,
          }),
        });

        if (!res.ok) throw new Error("Failed to start fix session");
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
    [state.mode, state.repo]
  );

  const handleSendMessage = useCallback(
    async (sessionId: string, message: string) => {
      if (state.mode === "demo") return;

      try {
        await fetch("/api/devin/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId, message }),
        });
      } catch (err) {
        dispatch({
          type: "SET_ERROR",
          error:
            err instanceof Error ? err.message : "Failed to send message",
        });
      }
    },
    [state.mode]
  );

  const handleAbort = useCallback(
    async (issueNumber: number, sessionId: string) => {
      if (state.mode === "demo") return;

      try {
        await fetch("/api/devin/terminate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionId }),
        });

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
    [state.mode]
  );

  const handleRetry = useCallback(
    (issue: DashboardIssue) => {
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
      // Then start fix again
      handleStartFix({
        ...issue,
        status: "scoped",
        fix_progress: null,
        blocker: null,
        fix_session: null,
        steps: [],
      });
    },
    [handleStartFix]
  );

  const handleApprove = useCallback(
    async (issueNumber: number, sessionId: string) => {
      if (state.mode === "demo") return;

      // Send approval message to Devin
      try {
        await fetch("/api/devin/message", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sessionId,
            message:
              "Approved. Please proceed with the suggested approach.",
          }),
        });

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
    [state.mode]
  );

  const actions: IssueActions = useMemo(
    () => ({
      onStartFix: handleStartFix,
      onSendMessage: handleSendMessage,
      onAbort: handleAbort,
      onRetry: handleRetry,
      onApprove: handleApprove,
    }),
    [handleStartFix, handleSendMessage, handleAbort, handleRetry, handleApprove]
  );

  return (
    <div className="min-h-screen bg-page flex flex-col">
      <TopBar
        repo={repo}
        mode={state.mode}
        issues={state.issues}
        onDisconnect={onDisconnect}
        onRefresh={fetchIssues}
        loading={state.loading}
        onToggleMode={() => {
          if (state.mode === "demo") {
            dispatch({ type: "TOGGLE_ACU_MODAL" });
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
        <div className="w-full bg-accent-red/10 border-b border-accent-red/20 px-4 py-2 flex items-center justify-between">
          <span className="text-accent-red text-sm">{state.error}</span>
          <button
            onClick={() => dispatch({ type: "SET_ERROR", error: null })}
            className="text-accent-red text-xs hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <FilterBar
        filter={state.filter}
        issues={state.issues}
        onFilterChange={(f) => dispatch({ type: "SET_FILTER", filter: f })}
        sortBy={state.sortBy}
        onSortChange={(s) => dispatch({ type: "SET_SORT", sortBy: s })}
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
          />
        </div>
      )}

      <ACUModal
        issueCount={
          state.issues.filter((i) => i.status === "pending").length ||
          state.issues.length
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
    </div>
  );
}
