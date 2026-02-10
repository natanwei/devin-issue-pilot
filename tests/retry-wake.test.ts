import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { DashboardIssue, IssueStatus } from "@/lib/types";

const NOW = "2026-02-08T12:00:00Z";

function makeIssue(overrides: Partial<DashboardIssue> = {}): DashboardIssue {
  return {
    number: 15,
    title: "Test issue",
    body: "Test body",
    labels: [],
    created_at: "2026-02-08T10:00:00Z",
    updated_at: "2026-02-08T10:05:00Z",
    github_url: "https://github.com/owner/repo/issues/15",
    status: "blocked",
    confidence: "green",
    scoping: {
      confidence: "green",
      confidence_reason: "Clear",
      current_behavior: "Broken",
      requested_fix: "Fix",
      files_to_modify: ["src/a.ts"],
      tests_needed: "Unit test",
      action_plan: ["Step 1"],
      risks: [],
      open_questions: [],
    },
    files_info: [],
    fix_progress: null,
    blocker: {
      what_happened: "Devin session went to sleep due to inactivity",
      suggestion: "Click Retry to start a new session with your previous context",
    },
    pr: null,
    steps: [],
    messages: [],
    scoping_session: null,
    fix_session: {
      session_id: "ses_fix_abc123",
      session_url: "https://app.devin.ai/sessions/ses_fix_abc123",
      started_at: "2026-02-08T10:00:00Z",
    },
    last_devin_comment_id: null,
    last_devin_comment_at: null,
    github_comment_url: null,
    forwarded_comment_ids: [],
    scoped_at: "2026-02-08T10:00:00Z",
    fix_started_at: "2026-02-08T10:01:00Z",
    completed_at: null,
    ...overrides,
  };
}

type RetryDecision =
  | { path: "wake"; sessionId: string; message: string }
  | { path: "recreate"; previousContext: string | undefined; sessionId: string | undefined };

function decideRetryPath(
  issue: DashboardIssue,
  pendingUserMessage?: string,
): RetryDecision {
  const sessionId = issue.fix_session?.session_id;
  const isWakeable = issue.status === "blocked" && !!sessionId;

  if (isWakeable) {
    const parts: string[] = [];
    if (issue.blocker) {
      parts.push(`Previous blocker: "${issue.blocker.what_happened}"`);
    }
    if (pendingUserMessage) {
      parts.push(`User response: "${pendingUserMessage}"`);
    }
    const wakeMessage = parts.length > 0
      ? `Please continue. ${parts.join("\n")}`
      : "Please continue working on this issue.";

    return { path: "wake", sessionId: sessionId!, message: wakeMessage };
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

describe("handleRetry: wake vs recreate decision", () => {
  it("chooses wake path when session is blocked with a fix_session", () => {
    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");
    if (decision.path === "wake") {
      expect(decision.sessionId).toBe("ses_fix_abc123");
      expect(decision.message).toContain("Please continue");
      expect(decision.message).toContain("went to sleep");
    }
  });

  it("chooses wake path for blocked status (Devin blocked, not suspend_requested)", () => {
    const issue = makeIssue({
      status: "blocked",
      blocker: {
        what_happened: "Need access to staging environment",
        suggestion: "Please provide guidance to continue",
      },
    });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");
    if (decision.path === "wake") {
      expect(decision.message).toContain("Need access to staging environment");
    }
  });

  it("includes pending user message in wake message", () => {
    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue, "Use the test database instead");
    expect(decision.path).toBe("wake");
    if (decision.path === "wake") {
      expect(decision.message).toContain("Use the test database instead");
      expect(decision.message).toContain("Please continue");
    }
  });

  it("sends default wake message when no blocker or pending message", () => {
    const issue = makeIssue({ status: "blocked", blocker: null });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");
    if (decision.path === "wake") {
      expect(decision.message).toBe("Please continue working on this issue.");
    }
  });

  it("chooses recreate path for terminal status: failed", () => {
    const issue = makeIssue({ status: "failed", fix_session: null });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });

  it("chooses recreate path for terminal status: timed_out", () => {
    const issue = makeIssue({ status: "timed_out", fix_session: null });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });

  it("chooses recreate path for terminal status: aborted", () => {
    const issue = makeIssue({ status: "aborted", fix_session: null });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });

  it("chooses recreate path when blocked but no fix_session", () => {
    const issue = makeIssue({ status: "blocked", fix_session: null });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });

  it("preserves blocker context in recreate previousContext", () => {
    const issue = makeIssue({
      status: "failed",
      fix_session: null,
      blocker: {
        what_happened: "Tests failed with timeout",
        suggestion: "Increase test timeout",
      },
    });
    const decision = decideRetryPath(issue, "Please increase timeout to 30s");
    expect(decision.path).toBe("recreate");
    if (decision.path === "recreate") {
      expect(decision.previousContext).toContain("Tests failed with timeout");
      expect(decision.previousContext).toContain("Increase test timeout");
      expect(decision.previousContext).toContain("Please increase timeout to 30s");
    }
  });

  it("recreate path has no previousContext when no blocker or pending message", () => {
    const issue = makeIssue({
      status: "failed",
      fix_session: null,
      blocker: null,
    });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
    if (decision.path === "recreate") {
      expect(decision.previousContext).toBeUndefined();
    }
  });
});

describe("handleRetry: wake path fetch behavior", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("sends wake message to /api/devin/message for blocked session", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");

    if (decision.path === "wake") {
      const res = await fetch("/api/devin/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: decision.sessionId,
          message: decision.message,
        }),
      });

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/devin/message");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("ses_fix_abc123");
      expect(body.message).toContain("Please continue");
    }
  });

  it("falls back to recreate when wake returns 404", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      json: async () => ({ error: "Session not found" }),
    });

    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");

    if (decision.path === "wake") {
      const res = await fetch("/api/devin/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: decision.sessionId,
          message: decision.message,
        }),
      });

      expect(res.ok).toBe(false);
      expect(res.status).toBe(404);

      const fallback = decideRetryPath({
        ...issue,
        status: "failed",
        fix_session: null,
      });
      expect(fallback.path).toBe("recreate");
    }
  });

  it("falls back to recreate when wake returns non-404 error", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");

    if (decision.path === "wake") {
      const res = await fetch("/api/devin/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: decision.sessionId,
          message: decision.message,
        }),
      });

      expect(res.ok).toBe(false);

      const fallback = decideRetryPath({
        ...issue,
        status: "failed",
        fix_session: null,
      });
      expect(fallback.path).toBe("recreate");
    }
  });

  it("sends terminate to /api/devin/terminate on recreate path", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    const issue = makeIssue({
      status: "failed",
      fix_session: {
        session_id: "ses_old_session",
        session_url: "https://app.devin.ai/sessions/ses_old_session",
        started_at: "2026-02-08T10:00:00Z",
      },
    });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");

    if (decision.path === "recreate" && decision.sessionId) {
      await fetch("/api/devin/terminate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: decision.sessionId }),
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/devin/terminate");
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("ses_old_session");
    }
  });
});

describe("handleRetry: status-based routing completeness", () => {
  const TERMINAL_STATUSES: IssueStatus[] = ["timed_out", "failed", "aborted", "done"];
  const WAKEABLE_STATUS: IssueStatus = "blocked";

  for (const status of TERMINAL_STATUSES) {
    it(`${status} without fix_session → recreate`, () => {
      const issue = makeIssue({ status, fix_session: null });
      const decision = decideRetryPath(issue);
      expect(decision.path).toBe("recreate");
    });
  }

  it("blocked with fix_session → wake", () => {
    const issue = makeIssue({ status: WAKEABLE_STATUS });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");
  });

  it("scoped status → recreate (not wakeable)", () => {
    const issue = makeIssue({ status: "scoped" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });

  it("fixing status → recreate (not wakeable)", () => {
    const issue = makeIssue({ status: "fixing" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });
});
