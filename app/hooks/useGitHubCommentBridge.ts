import { useCallback, useRef, type MutableRefObject, type Dispatch } from "react";
import { DashboardIssue, DashboardAction, DashboardState } from "@/lib/types";
import { apiKeyHeaders, type ApiKeys } from "@/lib/api-keys";
import { isDevinComment, isDuplicateMessage } from "@/lib/comment-templates";

export type PostGitHubComment = (
  issueNumber: number,
  commentBody: string,
) => Promise<{ id: number; created_at: string; html_url: string } | null>;

export type PollInboundComments = (
  issue: DashboardIssue,
  sessionId: string,
) => Promise<boolean>;

export function useGitHubCommentBridge(
  stateRef: MutableRefObject<DashboardState>,
  keysRef: MutableRefObject<ApiKeys>,
  pendingMessagesRef: MutableRefObject<Map<number, string>>,
  dispatch: Dispatch<DashboardAction>,
  showToast: (msg: string, ms?: number) => void,
): { postGitHubComment: PostGitHubComment; pollInboundComments: PollInboundComments } {
  const forwardingRef = useRef<Set<number>>(new Set());

  const postGitHubComment: PostGitHubComment = useCallback(
    async (issueNumber, commentBody) => {
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
    [stateRef, keysRef, showToast],
  );

  const pollInboundComments: PollInboundComments = useCallback(
    async (issue, sessionId) => {
      if (forwardingRef.current.has(issue.number)) return false;
      forwardingRef.current.add(issue.number);
      try {
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
            // Acknowledge receipt with eyes reaction
            fetch("/api/github/reactions", {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...apiKeyHeaders(keysRef.current),
              },
              body: JSON.stringify({
                owner: current.repo!.owner,
                repo: current.repo!.name,
                commentId: c.id,
              }),
            }).catch(() => {});
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
            patch: {
              status: "scoping" as const,
              confidence: null,
              scoping: null,
              scoped_at: null,
            },
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
      } finally {
        forwardingRef.current.delete(issue.number);
      }
    },
    [stateRef, keysRef, pendingMessagesRef, dispatch],
  );

  return { postGitHubComment, pollInboundComments };
}
