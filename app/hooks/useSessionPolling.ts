import { useCallback, useEffect, useRef, type MutableRefObject, type Dispatch } from "react";
import { DashboardState, DashboardAction, BlockerInfo } from "@/lib/types";
import { POLLING_INTERVALS } from "@/lib/constants";
import { interpretPollResult } from "@/lib/parsers";
import type { PollResult } from "@/lib/parsers";
import { apiKeyHeaders, type ApiKeys } from "@/lib/api-keys";
import {
  formatScopingComment,
  formatReadyComment,
  formatGreenScopedComment,
  formatBlockedComment,
  formatDoneComment,
} from "@/lib/comment-templates";
import type { PostGitHubComment, PollInboundComments } from "./useGitHubCommentBridge";

function getPollingInterval(status: string): number {
  return POLLING_INTERVALS[status] ?? POLLING_INTERVALS.default;
}

export function useSessionPolling(
  stateRef: MutableRefObject<DashboardState>,
  keysRef: MutableRefObject<ApiKeys>,
  dispatch: Dispatch<DashboardAction>,
  postGitHubComment: PostGitHubComment,
  pollInboundComments: PollInboundComments,
): { scheduleNextPoll: (status: string) => void } {
  const pollingRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollSessionRef = useRef(async () => {});

  const scheduleNextPoll = useCallback((status: string) => {
    if (pollingRef.current) clearTimeout(pollingRef.current);
    pollingRef.current = setTimeout(() => pollSessionRef.current(), getPollingInterval(status));
  }, []);

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

      const result = interpretPollResult(data, type, {
        issueNumber,
      });

      switch (result.action) {
        case "timed_out":
        case "failed":
          dispatch({ type: "UPDATE_ISSUE", issueNumber, patch: result.patch });
          dispatch({ type: "CLEAR_SESSION" });
          if (current.repo) {
            fetch("/api/supabase/sessions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repo: `${current.repo.owner}/${current.repo.name}`,
                issue_number: issueNumber,
                status: result.patch.status,
                fix_session_updated_at: result.patch.fix_session_updated_at,
              }),
            }).catch(() => {});
          }
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
            patchScoping.open_questions.length > 0
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
          } else if (
            patchConf === "green" &&
            patchScoping &&
            issue.forwarded_comment_ids.length > 0
          ) {
            // Re-scope after user reply came back green — confirm on GitHub
            const body = formatReadyComment(issueNumber, patchScoping);
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
          } else if (patchScoping) {
            // Green confidence, no prior conversation — post summary on GitHub
            const body = formatGreenScopedComment(issueNumber, patchScoping);
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
          // Persist enriched PR data and timing to Supabase
          if (current.repo) {
            fetch("/api/supabase/sessions", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                repo: `${current.repo.owner}/${current.repo.name}`,
                issue_number: issueNumber,
                status: "done",
                ...(finalPatch.pr ? { pr: finalPatch.pr } : {}),
                fix_session_updated_at: finalPatch.fix_session_updated_at,
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
  const state = stateRef.current;
  useEffect(() => {
    const current = stateRef.current;
    if (current.mode === "live" && current.activeSession) {
      const type = current.activeSession.type;
      scheduleNextPoll(type === "scoping" ? "scoping" : "fixing");
    }
    return () => {
      if (pollingRef.current) clearTimeout(pollingRef.current);
    };
  }, [state.mode, state.activeSession, scheduleNextPoll, stateRef]);

  // Poll for inbound GitHub comments on issues awaiting replies
  useEffect(() => {
    const current = stateRef.current;
    if (current.mode !== "live") return;

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
  }, [state.mode, pollInboundComments, stateRef]);

  return { scheduleNextPoll };
}
