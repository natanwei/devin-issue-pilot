import { describe, it, expect } from "vitest";
import {
  parseStructuredOutput,
  parseSessionResponse,
  interpretPollResult,
  parsePRUrl,
} from "@/lib/parsers";
import type { DashboardIssue } from "@/lib/types";

// ---------------------------------------------------------------------------
// Fixtures — realistic raw API response shapes
// ---------------------------------------------------------------------------

const NOW = "2026-02-08T12:00:00Z";

const RAW_SCOPING_COMPLETE = {
  session_id: "ses_scope_abc123",
  status: "session has finished",
  status_enum: "finished" as const,
  title: "Scope: natanwei/devin-issue-pilot#14 — Fix health endpoint",
  created_at: "2026-02-08T10:00:00Z",
  updated_at: "2026-02-08T10:05:00Z",
  pull_request: null,
  structured_output: {
    confidence: "green",
    confidence_reason: "Clear bug with obvious fix",
    current_behavior: "Health endpoint returns 500 when DB is down",
    requested_fix: "Add try-catch around DB call in health handler",
    files_to_modify: ["src/routes/health.ts", "src/middleware/error.ts"],
    tests_needed: "Add health endpoint integration test",
    action_plan: [
      "Add try-catch in health handler",
      "Return 503 on DB failure",
      "Add integration test",
    ],
    risks: ["Might mask other DB errors"],
    open_questions: [],
  },
};

const RAW_FIX_WITH_PR = {
  session_id: "ses_fix_def456",
  status: "session has finished",
  status_enum: "finished" as const,
  title: "Fix: natanwei/devin-issue-pilot#14 — Fix health endpoint",
  created_at: "2026-02-08T10:10:00Z",
  updated_at: "2026-02-08T10:25:00Z",
  pull_request: { url: "https://github.com/natanwei/devin-issue-pilot/pull/42" },
  structured_output: null,
};

const RAW_BLOCKED = {
  session_id: "ses_blocked_ghi789",
  status: "Need access to staging environment to test changes",
  status_enum: "blocked" as const,
  title: "Fix: natanwei/devin-issue-pilot#21 — Migrate DB",
  created_at: "2026-02-08T10:30:00Z",
  updated_at: "2026-02-08T10:35:00Z",
  pull_request: null,
  structured_output: null,
};

const RAW_FIX_STOPPED = {
  session_id: "ses_stopped_jkl012",
  status: "Session stopped due to error in test suite",
  status_enum: "stopped" as const,
  title: "Fix: natanwei/devin-issue-pilot#15 — Fix rate limiter",
  created_at: "2026-02-08T10:40:00Z",
  updated_at: "2026-02-08T10:50:00Z",
  pull_request: null,
  structured_output: null,
};

const RAW_EXPIRED = {
  session_id: "ses_expired_mno345",
  status: "session has expired",
  status_enum: "expired" as const,
  title: "Scope: natanwei/devin-issue-pilot#10 — Implement webhooks",
  created_at: "2026-02-08T08:00:00Z",
  updated_at: "2026-02-08T08:30:00Z",
  pull_request: null,
  structured_output: null,
};

const DEFAULT_CONTEXT = {
  issueNumber: 14,
  sessionStartedAt: "2026-02-08T11:55:00Z", // 5 min before NOW (within timeout)
  timeoutLimit: 15 * 60_000,
  now: NOW,
};

// ---------------------------------------------------------------------------
// Full data flow: scoping completion
// ---------------------------------------------------------------------------

describe("Full data flow: scoping completion", () => {
  it("raw API → parseSessionResponse → interpretPollResult → scoped with correct patch", () => {
    // Step 1: Parse raw response
    const parsed = parseSessionResponse(RAW_SCOPING_COMPLETE);
    expect(parsed.sessionId).toBe("ses_scope_abc123");
    expect(parsed.statusEnum).toBe("finished");
    expect(parsed.isTerminal).toBe(true);
    expect(parsed.structuredOutput).not.toBeNull();
    expect(parsed.pullRequest).toBeNull();

    // Step 2: Interpret poll result
    const result = interpretPollResult(parsed, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("scoped");

    // Step 3: Verify DashboardIssue patch
    if (result.action === "scoped") {
      expect(result.patch.status).toBe("scoped");
      expect(result.patch.confidence).toBe("green");
      expect(result.patch.scoping).not.toBeNull();
      expect(result.patch.scoped_at).toBe(NOW);

      // Verify scoping result fields
      const scoping = result.patch.scoping!;
      expect(scoping.confidence).toBe("green");
      expect(scoping.confidence_reason).toBe("Clear bug with obvious fix");
      expect(scoping.current_behavior).toBe("Health endpoint returns 500 when DB is down");
      expect(scoping.requested_fix).toBe("Add try-catch around DB call in health handler");
      expect(scoping.files_to_modify).toEqual(["src/routes/health.ts", "src/middleware/error.ts"]);
      expect(scoping.action_plan).toHaveLength(3);
      expect(scoping.risks).toEqual(["Might mask other DB errors"]);
      expect(scoping.open_questions).toEqual([]);
    }
  });

  it("structured_output is independently parseable", () => {
    const scoping = parseStructuredOutput(RAW_SCOPING_COMPLETE.structured_output);
    expect(scoping).not.toBeNull();
    expect(scoping!.confidence).toBe("green");
    expect(scoping!.files_to_modify).toHaveLength(2);
    expect(scoping!.action_plan).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// Full data flow: fix with PR
// ---------------------------------------------------------------------------

describe("Full data flow: fix with PR", () => {
  it("raw API → parseSessionResponse → interpretPollResult → done with PR", () => {
    const parsed = parseSessionResponse(RAW_FIX_WITH_PR);
    expect(parsed.sessionId).toBe("ses_fix_def456");
    expect(parsed.isTerminal).toBe(true);
    expect(parsed.pullRequest?.url).toBe(
      "https://github.com/natanwei/devin-issue-pilot/pull/42",
    );

    const result = interpretPollResult(parsed, "fixing", {
      ...DEFAULT_CONTEXT,
      sessionStartedAt: "2026-02-08T11:50:00Z", // 10 min before NOW
    });
    expect(result.action).toBe("done");

    if (result.action === "done") {
      expect(result.patch.status).toBe("done");
      expect(result.patch.completed_at).toBe(NOW);
      expect(result.patch.pr).not.toBeNull();
      expect(result.patch.pr!.number).toBe(42);
      expect(result.patch.pr!.url).toBe(
        "https://github.com/natanwei/devin-issue-pilot/pull/42",
      );
    }
  });

  it("PR URL is parsed correctly from the raw response", () => {
    const prUrl = RAW_FIX_WITH_PR.pull_request.url;
    const parsed = parsePRUrl(prUrl);
    expect(parsed).toEqual({
      owner: "natanwei",
      repo: "devin-issue-pilot",
      prNumber: 42,
    });
  });

  it("fix completion duration is calculated correctly", () => {
    const parsed = parseSessionResponse(RAW_FIX_WITH_PR);
    const created = new Date(parsed.createdAt).getTime();
    const updated = new Date(parsed.updatedAt).getTime();
    const durationMin = (updated - created) / 60_000;
    expect(durationMin).toBe(15); // 10:10 → 10:25 = 15 minutes
  });
});

// ---------------------------------------------------------------------------
// Full data flow: blocked session
// ---------------------------------------------------------------------------

describe("Full data flow: blocked session", () => {
  it("produces correct blocker info", () => {
    const parsed = parseSessionResponse(RAW_BLOCKED);
    expect(parsed.statusEnum).toBe("blocked");
    expect(parsed.isTerminal).toBe(false);

    const result = interpretPollResult(parsed, "fixing", {
      ...DEFAULT_CONTEXT,
      sessionStartedAt: "2026-02-08T11:50:00Z", // 10 min before NOW
    });
    expect(result.action).toBe("blocked");

    if (result.action === "blocked") {
      expect(result.patch.status).toBe("blocked");
      expect(result.patch.blocker).toEqual({
        what_happened: "Need access to staging environment to test changes",
        suggestion: "Please provide guidance to continue",
      });
    }
  });

  it("uses Devin message over status text when messages are present", () => {
    const parsed = parseSessionResponse({
      ...RAW_BLOCKED,
      status: "running",
      messages: [
        { type: "devin_message", message: "I need GitHub authentication to push the branch." },
      ],
    });
    expect(parsed.blockerMessage).toBe("I need GitHub authentication to push the branch.");

    const result = interpretPollResult(parsed, "fixing", {
      ...DEFAULT_CONTEXT,
      sessionStartedAt: "2026-02-08T11:50:00Z",
    });
    expect(result.action).toBe("blocked");
    if (result.action === "blocked") {
      expect(result.patch.blocker?.what_happened).toBe(
        "I need GitHub authentication to push the branch."
      );
    }
  });
});

// ---------------------------------------------------------------------------
// Full data flow: sleeping session (suspend_requested)
// ---------------------------------------------------------------------------

describe("Full data flow: sleeping session", () => {
  it("maps suspend_requested to blocked with sleeping message", () => {
    const parsed = parseSessionResponse({
      ...RAW_BLOCKED,
      status_enum: "suspend_requested",
      status: "Session is being suspended",
    });
    expect(parsed.statusEnum).toBe("suspend_requested");
    expect(parsed.isTerminal).toBe(false);

    const result = interpretPollResult(parsed, "fixing", {
      ...DEFAULT_CONTEXT,
      sessionStartedAt: "2026-02-08T11:50:00Z",
    });
    expect(result.action).toBe("blocked");

    if (result.action === "blocked") {
      expect(result.patch.status).toBe("blocked");
      expect(result.patch.blocker?.what_happened).toContain("went to sleep");
      expect(result.patch.blocker?.suggestion).toContain("Retry");
    }
  });
});

// ---------------------------------------------------------------------------
// Full data flow: failed fix (stopped)
// ---------------------------------------------------------------------------

describe("Full data flow: failed fix (stopped)", () => {
  it("maps stopped + no PR to failed status", () => {
    const parsed = parseSessionResponse(RAW_FIX_STOPPED);
    expect(parsed.statusEnum).toBe("stopped");
    expect(parsed.isTerminal).toBe(true);

    const result = interpretPollResult(parsed, "fixing", {
      ...DEFAULT_CONTEXT,
      sessionStartedAt: "2026-02-08T11:50:00Z", // 10 min before NOW
    });
    expect(result.action).toBe("failed");

    if (result.action === "failed") {
      expect(result.patch.status).toBe("failed");
      expect(result.patch.fix_progress).not.toBeNull();
      expect(result.patch.fix_progress!.blockers).toContain(
        "Session stopped due to error in test suite",
      );
      expect(result.patch.fix_progress!.status).toBe("blocked");
      expect(result.patch.fix_progress!.pr_url).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Full data flow: expired session
// ---------------------------------------------------------------------------

describe("Full data flow: expired session", () => {
  it("maps expired status_enum to timed_out", () => {
    const parsed = parseSessionResponse(RAW_EXPIRED);
    expect(parsed.statusEnum).toBe("expired");
    expect(parsed.isTerminal).toBe(true);

    const result = interpretPollResult(parsed, "scoping", {
      ...DEFAULT_CONTEXT,
      sessionStartedAt: "2026-02-08T11:55:00Z", // within timeout; expired comes from status_enum
    });
    expect(result.action).toBe("timed_out");

    if (result.action === "timed_out") {
      expect(result.patch.status).toBe("timed_out");
    }
  });
});

// ---------------------------------------------------------------------------
// Edge case: confidence fallback
// ---------------------------------------------------------------------------

describe("Edge case: confidence fallback in pipeline", () => {
  it("missing confidence in structured_output defaults to yellow through full pipeline", () => {
    const raw = {
      ...RAW_SCOPING_COMPLETE,
      structured_output: {
        ...RAW_SCOPING_COMPLETE.structured_output,
        confidence: undefined,
      },
    };
    const parsed = parseSessionResponse(raw);
    const result = interpretPollResult(parsed, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("scoped");
    if (result.action === "scoped") {
      expect(result.patch.confidence).toBe("yellow");
    }
  });

  it("invalid confidence in structured_output defaults to yellow", () => {
    const raw = {
      ...RAW_SCOPING_COMPLETE,
      structured_output: {
        ...RAW_SCOPING_COMPLETE.structured_output,
        confidence: "VERY HIGH",
      },
    };
    const parsed = parseSessionResponse(raw);
    const result = interpretPollResult(parsed, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("scoped");
    if (result.action === "scoped") {
      expect(result.patch.confidence).toBe("yellow");
    }
  });
});

// ---------------------------------------------------------------------------
// Confidence → UI state mapping
// ---------------------------------------------------------------------------

describe("Confidence → UI state mapping", () => {
  it("green confidence → Start Fix button visible (no open_questions)", () => {
    const scoping = parseStructuredOutput(RAW_SCOPING_COMPLETE.structured_output);
    expect(scoping!.confidence).toBe("green");
    expect(scoping!.open_questions).toEqual([]);
    // In IssueDetail ScopedView: Start Fix hidden only when confidence === "red"
    // Green + no open_questions → Start Fix visible, no DevinQuestions
  });

  it("yellow confidence → DevinQuestions + MessageInput shown", () => {
    const scoping = parseStructuredOutput({
      ...RAW_SCOPING_COMPLETE.structured_output,
      confidence: "yellow",
      open_questions: ["Which database to use?", "Is migration needed?"],
    });
    expect(scoping!.confidence).toBe("yellow");
    expect(scoping!.open_questions).toHaveLength(2);
    // In IssueDetail ScopedView: yellow shows DevinQuestions + MessageInput + Start Fix
  });

  it("red confidence → no Start Fix button", () => {
    const scoping = parseStructuredOutput({
      ...RAW_SCOPING_COMPLETE.structured_output,
      confidence: "red",
      open_questions: ["Requirements unclear"],
    });
    expect(scoping!.confidence).toBe("red");
    // In IssueDetail ScopedView: red hides Start Fix button
  });
});

// ---------------------------------------------------------------------------
// Wall-clock timeout through pipeline
// ---------------------------------------------------------------------------

describe("Wall-clock timeout through pipeline", () => {
  it("scoping session that exceeds 15 min → timed_out", () => {
    const parsed = parseSessionResponse({
      ...RAW_SCOPING_COMPLETE,
      status_enum: "working",
      structured_output: null,
    });

    const result = interpretPollResult(parsed, "scoping", {
      issueNumber: 14,
      sessionStartedAt: "2026-02-08T11:40:00Z", // 20 min before NOW
      timeoutLimit: 15 * 60_000,
      now: NOW,
    });
    expect(result.action).toBe("timed_out");
  });

  it("fixing session within 30 min → continues", () => {
    const parsed = parseSessionResponse({
      ...RAW_SCOPING_COMPLETE,
      status_enum: "working",
      structured_output: null,
    });

    const result = interpretPollResult(parsed, "fixing", {
      issueNumber: 14,
      sessionStartedAt: "2026-02-08T11:50:00Z", // 10 min before NOW
      timeoutLimit: 30 * 60_000,
      now: NOW,
    });
    expect(result.action).toBe("continue");
  });
});
