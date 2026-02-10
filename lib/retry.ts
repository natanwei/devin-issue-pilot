import type { DashboardIssue } from "./types";

export type RetryDecision =
  | { path: "wake"; sessionId: string; message: string }
  | { path: "recreate"; previousContext: string | undefined; sessionId: string | undefined };

export function buildWakeMessage(
  blocker: DashboardIssue["blocker"],
  pendingUserMessage?: string,
): string {
  if (!blocker && !pendingUserMessage) {
    return "Please continue working on this fix.";
  }

  const parts: string[] = [];

  if (blocker && pendingUserMessage) {
    parts.push(
      `The user has responded to your blocker ("${blocker.what_happened}").`,
      `Here is their guidance: "${pendingUserMessage}"`,
      "Please continue working on the fix.",
    );
  } else if (pendingUserMessage) {
    parts.push(
      `The user has provided additional guidance: "${pendingUserMessage}"`,
      "Please continue working on the fix.",
    );
  } else if (blocker) {
    parts.push(
      `Previous blocker: "${blocker.what_happened}"`,
      "Please continue working on the fix.",
    );
  }

  return parts.join("\n");
}

export function decideRetryPath(
  issue: DashboardIssue,
  pendingUserMessage?: string,
): RetryDecision {
  const sessionId = issue.fix_session?.session_id;
  const isWakeable = issue.status === "blocked" && !!sessionId;

  if (isWakeable) {
    const message = buildWakeMessage(issue.blocker, pendingUserMessage);
    return { path: "wake", sessionId: sessionId!, message };
  }

  let previousContext: string | undefined;
  if (issue.blocker || pendingUserMessage) {
    const parts: string[] = [];
    if (issue.blocker) {
      parts.push(`A previous session asked: "${issue.blocker.what_happened}"`);
      parts.push(`Suggestion was: "${issue.blocker.suggestion}"`);
    }
    if (pendingUserMessage) {
      parts.push(`The user responded: "${pendingUserMessage}"`);
    }
    previousContext = parts.join("\n");
  }

  return { path: "recreate", previousContext, sessionId };
}
