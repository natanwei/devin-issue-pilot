import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { decideRetryPath, buildWakeMessage } from "@/lib/retry";
import type { DashboardIssue, IssueStatus } from "@/lib/types";

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
      suggestion: "Click Retry to wake this session and resume where it left off",
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

describe("decideRetryPath: wake vs recreate decision", () => {
  it("chooses wake path when session is blocked with a fix_session", () => {
    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");
    if (decision.path === "wake") {
      expect(decision.sessionId).toBe("ses_fix_abc123");
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
    }
  });

  it("sends default wake message when no blocker or pending message", () => {
    const issue = makeIssue({ status: "blocked", blocker: null });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");
    if (decision.path === "wake") {
      expect(decision.message).toBe("Please continue working on this fix.");
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

describe("decideRetryPath: wake path fetch behavior", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn();
    globalThis.fetch = mockFetch as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("wake decision produces correct sessionId for /api/devin/message", async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => null });

    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");

    if (decision.path === "wake") {
      await fetch("/api/devin/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: decision.sessionId,
          message: decision.message,
        }),
      });

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/devin/message");
      expect(opts.method).toBe("POST");
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("ses_fix_abc123");
    }
  });

  it("404 from wake -> should fall back to recreate", async () => {
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

  it("200 with detail response -> should be treated as wake failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ detail: "Session is suspended and cannot receive messages" }),
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

      expect(res.ok).toBe(true);
      const body = await res.json();
      expect(body).toHaveProperty("detail");
    }
  });

  it("recreate decision produces correct sessionId for /api/devin/terminate", async () => {
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

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toBe("/api/devin/terminate");
      const body = JSON.parse(opts.body);
      expect(body.sessionId).toBe("ses_old_session");
    }
  });
});

describe("decideRetryPath: status-based routing completeness", () => {
  const TERMINAL_STATUSES: IssueStatus[] = ["timed_out", "failed", "aborted", "done"];

  for (const status of TERMINAL_STATUSES) {
    it(`${status} without fix_session -> recreate`, () => {
      const issue = makeIssue({ status, fix_session: null });
      const decision = decideRetryPath(issue);
      expect(decision.path).toBe("recreate");
    });
  }

  it("blocked with fix_session -> wake", () => {
    const issue = makeIssue({ status: "blocked" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("wake");
  });

  it("scoped status -> recreate (not wakeable)", () => {
    const issue = makeIssue({ status: "scoped" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });

  it("fixing status -> recreate (not wakeable)", () => {
    const issue = makeIssue({ status: "fixing" });
    const decision = decideRetryPath(issue);
    expect(decision.path).toBe("recreate");
  });
});

describe("buildWakeMessage", () => {
  it("returns generic message when no blocker or pending message", () => {
    const msg = buildWakeMessage(null);
    expect(msg).toBe("Please continue working on this fix.");
  });

  it("includes blocker context and user guidance when both present", () => {
    const msg = buildWakeMessage(
      { what_happened: "Need staging access", suggestion: "Provide credentials" },
      "Here are the credentials: ...",
    );
    expect(msg).toContain("responded to your blocker");
    expect(msg).toContain("Need staging access");
    expect(msg).toContain("Here are the credentials: ...");
    expect(msg).toContain("Please continue working on the fix");
  });

  it("includes only user guidance when no blocker", () => {
    const msg = buildWakeMessage(null, "Try a different approach");
    expect(msg).toContain("Try a different approach");
    expect(msg).toContain("Please continue working on the fix");
  });

  it("includes only blocker when no pending message", () => {
    const msg = buildWakeMessage(
      { what_happened: "Went to sleep", suggestion: "Retry" },
    );
    expect(msg).toContain("Went to sleep");
    expect(msg).toContain("Please continue working on the fix");
  });
});
