import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { interpretPollResult, type StatusRouteResponse } from "@/lib/parsers";
import {
  formatScopingComment,
  formatBlockedComment,
  formatDoneComment,
  isDevinComment,
  isDuplicateMessage,
} from "@/lib/comment-templates";
import type { DashboardIssue, ScopingResult, BlockerInfo } from "@/lib/types";
import { createPendingIssue } from "@/lib/factories";

const NOW = "2026-02-08T12:00:00Z";

function makeStatus(overrides: Partial<StatusRouteResponse> = {}): StatusRouteResponse {
  return {
    sessionId: "ses_test",
    statusEnum: "working",
    status: "running",
    isTerminal: false,
    createdAt: "2026-02-08T10:00:00Z",
    updatedAt: "2026-02-08T10:05:30Z",
    pullRequest: null,
    structuredOutput: null,
    messages: [],
    ...overrides,
  };
}

const YELLOW_SCOPING_OUTPUT: Record<string, unknown> = {
  confidence: "yellow",
  confidence_reason: "Mostly clear but questions remain",
  current_behavior: "No rate limiting exists",
  requested_fix: "Add rate limiting middleware",
  files_to_modify: ["src/middleware/rateLimit.ts"],
  tests_needed: "Rate limit tests",
  action_plan: ["Create middleware", "Add config"],
  risks: ["Could block legitimate users"],
  open_questions: [
    "What are the desired rate limits?",
    "Should we use Redis or in-memory?",
  ],
};

const GREEN_SCOPING_OUTPUT: Record<string, unknown> = {
  confidence: "green",
  confidence_reason: "Clear bug with obvious fix",
  current_behavior: "Health endpoint returns 500",
  requested_fix: "Return 200 with degraded status",
  files_to_modify: ["src/routes/health.ts"],
  tests_needed: "Health endpoint test",
  action_plan: ["Add try-catch", "Return degraded"],
  risks: [],
  open_questions: [],
};

describe("Outbound: scoping questions trigger awaiting_reply", () => {
  it("yellow scoping with open_questions produces scoped action with questions", () => {
    const data = makeStatus({
      statusEnum: "finished",
      isTerminal: true,
      structuredOutput: YELLOW_SCOPING_OUTPUT,
    });
    const result = interpretPollResult(data, "scoping", {
      issueNumber: 21,
      now: NOW,
    });
    expect(result.action).toBe("scoped");
    if (result.action === "scoped") {
      expect(result.patch.confidence).toBe("yellow");
      expect(result.patch.scoping?.open_questions).toHaveLength(2);
      expect(result.patch.status).toBe("scoped");
    }
  });

  it("scoping comment body is formatted correctly for yellow confidence", () => {
    const scoping: ScopingResult = {
      confidence: "yellow",
      confidence_reason: "Mostly clear but questions remain",
      current_behavior: "No rate limiting exists",
      requested_fix: "Add rate limiting middleware",
      files_to_modify: ["src/middleware/rateLimit.ts"],
      tests_needed: "Rate limit tests",
      action_plan: ["Create middleware", "Add config"],
      risks: [],
      open_questions: [
        "What are the desired rate limits?",
        "Should we use Redis or in-memory?",
      ],
    };
    const body = formatScopingComment(21, scoping);
    expect(body).toContain("Devin scoped this issue");
    expect(body).toContain("**Confidence:** yellow");
    expect(body).toContain("What are the desired rate limits?");
    expect(body).toContain("Should we use Redis or in-memory?");
    expect(body).toContain("Reply to this comment");
    expect(isDevinComment(body)).toBe(true);
  });

  it("green scoping does NOT trigger awaiting_reply (no open questions)", () => {
    const data = makeStatus({
      statusEnum: "finished",
      isTerminal: true,
      structuredOutput: GREEN_SCOPING_OUTPUT,
    });
    const result = interpretPollResult(data, "scoping", {
      issueNumber: 14,
      now: NOW,
    });
    expect(result.action).toBe("scoped");
    if (result.action === "scoped") {
      expect(result.patch.confidence).toBe("green");
      expect(result.patch.scoping?.open_questions).toEqual([]);
    }
  });
});

describe("Outbound: blocked comment posted", () => {
  it("blocked status produces blocker info in patch", () => {
    const data = makeStatus({
      statusEnum: "blocked",
      isTerminal: false,
      status: "Need access to staging environment",
    });
    const result = interpretPollResult(data, "fixing", {
      issueNumber: 3,
      now: NOW,
    });
    expect(result.action).toBe("blocked");
    if (result.action === "blocked") {
      expect(result.patch.status).toBe("blocked");
      expect(result.patch.blocker).toBeDefined();
      expect(result.patch.blocker?.what_happened).toContain(
        "Need access to staging environment",
      );
    }
  });

  it("blocked comment body is formatted correctly", () => {
    const blocker: BlockerInfo = {
      what_happened: "Database pool wrapper lacks health check method",
      suggestion: "Add .isHealthy() method to DBPool class",
    };
    const body = formatBlockedComment(3, blocker);
    expect(body).toContain("Devin is blocked and needs input");
    expect(body).toContain("Database pool wrapper");
    expect(body).toContain("Add .isHealthy()");
    expect(body).toContain("Reply to this comment to unblock Devin");
    expect(isDevinComment(body)).toBe(true);
  });

  it("suspend_requested maps to blocked with sleeping message", () => {
    const data = makeStatus({
      statusEnum: "suspend_requested",
      isTerminal: false,
      status: "Session being suspended",
    });
    const result = interpretPollResult(data, "fixing", {
      issueNumber: 7,
      now: NOW,
    });
    expect(result.action).toBe("blocked");
    if (result.action === "blocked") {
      expect(result.patch.blocker?.what_happened).toContain("went to sleep");
    }
  });
});

describe("Outbound: done comment with PR link", () => {
  it("fix completion with PR produces done action", () => {
    const data = makeStatus({
      statusEnum: "finished",
      isTerminal: true,
      pullRequest: {
        url: "https://github.com/owner/repo/pull/42",
      },
    });
    const result = interpretPollResult(data, "fixing", {
      issueNumber: 14,
      now: NOW,
    });
    expect(result.action).toBe("done");
    if (result.action === "done") {
      expect(result.patch.pr?.url).toBe(
        "https://github.com/owner/repo/pull/42",
      );
      expect(result.patch.pr?.number).toBe(42);
    }
  });

  it("done comment body includes PR link", () => {
    const body = formatDoneComment(
      14,
      "https://github.com/owner/repo/pull/42",
      "Fix health endpoint",
    );
    expect(body).toContain("Devin created a fix");
    expect(body).toContain(
      "[Fix health endpoint](https://github.com/owner/repo/pull/42)",
    );
    expect(isDevinComment(body)).toBe(true);
  });
});

describe("Inbound: deduplication prevents duplicate messages", () => {
  it("same text within 60s window is duplicate", () => {
    expect(
      isDuplicateMessage(
        "Use Redis for rate limiting",
        "Use Redis for rate limiting",
        "2026-02-08T12:00:00Z",
        "2026-02-08T12:00:30Z",
      ),
    ).toBe(true);
  });

  it("same text outside 60s window is NOT duplicate", () => {
    expect(
      isDuplicateMessage(
        "Use Redis for rate limiting",
        "Use Redis for rate limiting",
        "2026-02-08T12:00:00Z",
        "2026-02-08T12:02:00Z",
      ),
    ).toBe(false);
  });

  it("different text within 60s window is NOT duplicate", () => {
    expect(
      isDuplicateMessage(
        "Use Redis for rate limiting",
        "Use in-memory storage",
        "2026-02-08T12:00:00Z",
        "2026-02-08T12:00:30Z",
      ),
    ).toBe(false);
  });

  it("whitespace and case normalization works", () => {
    expect(
      isDuplicateMessage(
        "  Use  REDIS  ",
        "use redis",
        "2026-02-08T12:00:00Z",
        "2026-02-08T12:00:10Z",
      ),
    ).toBe(true);
  });
});

describe("Inbound: Devin comments are filtered out", () => {
  it("isDevinComment returns true for scoping comment", () => {
    const scoping: ScopingResult = {
      confidence: "yellow",
      confidence_reason: "Questions remain",
      current_behavior: "No rate limiting",
      requested_fix: "Add rate limiting",
      files_to_modify: [],
      tests_needed: "",
      action_plan: [],
      risks: [],
      open_questions: ["What limits?"],
    };
    expect(isDevinComment(formatScopingComment(9, scoping))).toBe(true);
  });

  it("isDevinComment returns true for blocked comment", () => {
    const blocker: BlockerInfo = {
      what_happened: "Stuck",
      suggestion: "Help",
    };
    expect(isDevinComment(formatBlockedComment(3, blocker))).toBe(true);
  });

  it("isDevinComment returns true for done comment", () => {
    expect(
      isDevinComment(
        formatDoneComment(8, "https://github.com/o/r/pull/1", "Fix"),
      ),
    ).toBe(true);
  });

  it("isDevinComment returns false for human comment", () => {
    expect(isDevinComment("Use Redis, limit to 100 req/min")).toBe(false);
  });

  it("isDevinComment returns false for empty string", () => {
    expect(isDevinComment("")).toBe(false);
  });
});

describe("Comment tracking fields on DashboardIssue", () => {
  it("createPendingIssue initializes all comment tracking fields", () => {
    const issue = createPendingIssue({
      number: 42,
      title: "Test issue",
      body: "Test body",
      labels: [],
      created_at: "2026-02-08T10:00:00Z",
      updated_at: "2026-02-08T10:00:00Z",
      html_url: "https://github.com/owner/repo/issues/42",
    });
    expect(issue.last_devin_comment_id).toBeNull();
    expect(issue.last_devin_comment_at).toBeNull();
    expect(issue.github_comment_url).toBeNull();
    expect(issue.forwarded_comment_ids).toEqual([]);
  });
});

vi.mock("@/lib/github", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/github")>();
  return { ...actual };
});

describe("API route: POST /api/github/comments", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  async function callPost(
    body: Record<string, unknown>,
    headers: Record<string, string> = {},
  ) {
    const mod = await import("@/app/api/github/comments/route");
    const req = new Request("http://localhost/api/github/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    });
    return mod.POST(req as never);
  }

  it("returns 400 when required fields are missing", async () => {
    const res = await callPost({ owner: "natanwei" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing");
  });

  it("returns 400 when comment is empty", async () => {
    const res = await callPost({
      owner: "natanwei",
      repo: "devin-issue-pilot",
      issueNumber: 9,
    });
    expect(res.status).toBe(400);
  });

  it("returns 403 when GitHub token lacks write permissions", async () => {
    const github = await import("@/lib/github");
    vi.spyOn(github, "createIssueComment").mockRejectedValueOnce(
      new Error("Resource not accessible by integration - 403"),
    );

    const mod = await import("@/app/api/github/comments/route");
    const req = new Request("http://localhost/api/github/comments", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-github-token": "ghp_readonly",
      },
      body: JSON.stringify({
        owner: "natanwei",
        repo: "devin-issue-pilot",
        issueNumber: 9,
        comment: "test comment",
      }),
    });
    const res = await mod.POST(req as never);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.isAuth).toBe(true);
  });
});

describe("API route: GET /api/github/comments", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function callGet(params: Record<string, string>) {
    const mod = await import("@/app/api/github/comments/route");
    const url = new URL("http://localhost/api/github/comments");
    for (const [k, v] of Object.entries(params)) {
      url.searchParams.set(k, v);
    }
    const req = new Request(url.toString());
    return mod.GET(req as never);
  }

  it("returns 400 when owner is missing", async () => {
    const res = await callGet({ repo: "devin-issue-pilot", issueNumber: "9" });
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toContain("Missing");
  });

  it("returns 400 when repo is missing", async () => {
    const res = await callGet({ owner: "natanwei", issueNumber: "9" });
    expect(res.status).toBe(400);
  });

  it("returns 400 when issueNumber is missing", async () => {
    const res = await callGet({ owner: "natanwei", repo: "devin-issue-pilot" });
    expect(res.status).toBe(400);
  });
});

describe("Graceful degradation: token permissions", () => {
  it("403 from GitHub is translated to auth error with helpful message", async () => {
    const { translateError } = await import("@/lib/error-messages");
    const result = translateError("Resource not accessible by integration - 403");
    expect(result.isAuth).toBe(true);
    expect(result.message).toContain("GitHub access denied");
  });

  it("401 from GitHub is translated to invalid token message", async () => {
    const { translateError } = await import("@/lib/error-messages");
    const result = translateError("Bad credentials - 401");
    expect(result.isAuth).toBe(true);
    expect(result.message).toContain("Invalid GitHub token");
  });

  it("Devin API 401 is translated separately from GitHub 401", async () => {
    const { translateError } = await import("@/lib/error-messages");
    const result = translateError("Devin API error 401: Unauthorized");
    expect(result.isAuth).toBe(true);
    expect(result.message).toContain("Invalid Devin API key");
  });
});

describe("AwaitingReplyView activation", () => {
  it("awaiting_reply is a valid IssueStatus", () => {
    const issue = createPendingIssue({
      number: 20,
      title: "Test",
      body: "",
      labels: [],
      created_at: NOW,
      updated_at: NOW,
      html_url: "https://github.com/o/r/issues/20",
    });
    issue.status = "awaiting_reply";
    expect(issue.status).toBe("awaiting_reply");
  });

  it("awaiting_reply issue has comment tracking fields populated in demo data", async () => {
    const { getDemoIssues } = await import("@/lib/demo-data");
    const issues = getDemoIssues();
    const awaitingIssue = issues.find((i) => i.status === "awaiting_reply");
    expect(awaitingIssue).toBeDefined();
    expect(awaitingIssue!.last_devin_comment_id).not.toBeNull();
    expect(awaitingIssue!.last_devin_comment_at).not.toBeNull();
    expect(awaitingIssue!.github_comment_url).not.toBeNull();
    expect(awaitingIssue!.github_comment_url).toContain("issuecomment-");
  });

  it("demo awaiting_reply issue has scoping questions", async () => {
    const { getDemoIssues } = await import("@/lib/demo-data");
    const issues = getDemoIssues();
    const awaitingIssue = issues.find((i) => i.status === "awaiting_reply");
    expect(awaitingIssue).toBeDefined();
    expect(awaitingIssue!.scoping?.open_questions.length).toBeGreaterThan(0);
    expect(awaitingIssue!.confidence).toBe("yellow");
  });
});

describe("Outbound flow: early scoping with open questions continues polling", () => {
  it("non-terminal scoping with structured output + open questions returns continue", () => {
    const data = makeStatus({
      statusEnum: "working",
      isTerminal: false,
      structuredOutput: YELLOW_SCOPING_OUTPUT,
    });
    const result = interpretPollResult(data, "scoping", {
      issueNumber: 9,
      now: NOW,
    });
    expect(result.action).toBe("continue");
    if (result.action === "continue") {
      expect(result.nextPollCategory).toBe("scoping");
      expect(result.patch?.confidence).toBe("yellow");
      expect(result.patch?.scoping?.open_questions).toHaveLength(2);
    }
  });

  it("non-terminal scoping with green output (no questions) returns scoped", () => {
    const data = makeStatus({
      statusEnum: "working",
      isTerminal: false,
      structuredOutput: GREEN_SCOPING_OUTPUT,
    });
    const result = interpretPollResult(data, "scoping", {
      issueNumber: 14,
      now: NOW,
    });
    expect(result.action).toBe("scoped");
  });
});
