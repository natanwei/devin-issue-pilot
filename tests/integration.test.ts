import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isTerminal } from "@/lib/devin";
import {
  parseStructuredOutput,
  parsePRUrl,
  parseSessionResponse,
  interpretPollResult,
  extractStructuredOutputFromMessages,
  type StatusRouteResponse,
} from "@/lib/parsers";
import type { ConfidenceLevel, ScopingResult } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const NOW = "2025-02-08T12:00:00Z";

/** Build a minimal StatusRouteResponse for testing interpretPollResult. */
function makeStatus(overrides: Partial<StatusRouteResponse> = {}): StatusRouteResponse {
  return {
    sessionId: "ses_test",
    statusEnum: "working",
    status: "running",
    isTerminal: false,
    createdAt: "2025-02-08T10:00:00Z",
    updatedAt: "2025-02-08T10:05:30Z",
    pullRequest: null,
    structuredOutput: null,
    messages: [],
    ...overrides,
  };
}

const DEFAULT_CONTEXT = {
  issueNumber: 14,
  now: NOW,
};

// ---------------------------------------------------------------------------
// parseDevinStatus mapping (via interpretPollResult)
// ---------------------------------------------------------------------------

describe("parseDevinStatus mapping", () => {
  it("working → continue (stays scoping)", () => {
    const data = makeStatus({ statusEnum: "working", isTerminal: false });
    const result = interpretPollResult(data, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("continue");
    if (result.action === "continue") {
      expect(result.nextPollCategory).toBe("scoping");
    }
  });

  it("working → continue (stays fixing)", () => {
    const data = makeStatus({ statusEnum: "working", isTerminal: false });
    const result = interpretPollResult(data, "fixing", DEFAULT_CONTEXT);
    expect(result.action).toBe("continue");
    if (result.action === "continue") {
      expect(result.nextPollCategory).toBe("fixing");
    }
  });

  it("blocked → blocked status", () => {
    const data = makeStatus({ statusEnum: "blocked", isTerminal: false });
    const result = interpretPollResult(data, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("blocked");
    if (result.action === "blocked") {
      expect(result.patch.status).toBe("blocked");
    }
  });

  it("finished + scoping → scoped", () => {
    const data = makeStatus({
      statusEnum: "finished",
      isTerminal: true,
      structuredOutput: {
        confidence: "green",
        confidence_reason: "Clear bug",
        current_behavior: "Broken",
        requested_fix: "Fix it",
        files_to_modify: ["src/a.ts"],
        tests_needed: "Unit test",
        action_plan: ["Step 1"],
        risks: [],
        open_questions: [],
      },
    });
    const result = interpretPollResult(data, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("scoped");
    if (result.action === "scoped") {
      expect(result.patch.status).toBe("scoped");
      expect(result.patch.confidence).toBe("green");
    }
  });

  it("finished + fixing + PR → done", () => {
    const data = makeStatus({
      statusEnum: "finished",
      isTerminal: true,
      pullRequest: { url: "https://github.com/owner/repo/pull/42" },
    });
    const result = interpretPollResult(data, "fixing", DEFAULT_CONTEXT);
    expect(result.action).toBe("done");
    if (result.action === "done") {
      expect(result.patch.status).toBe("done");
      expect(result.patch.pr?.number).toBe(42);
    }
  });

  it("stopped + scoping + output → scoped", () => {
    const data = makeStatus({
      statusEnum: "stopped",
      isTerminal: true,
      structuredOutput: {
        confidence: "yellow",
        confidence_reason: "Partially clear",
        current_behavior: "Slow",
        requested_fix: "Optimize",
        files_to_modify: [],
        tests_needed: "",
        action_plan: [],
        risks: [],
        open_questions: ["Which DB?"],
      },
    });
    const result = interpretPollResult(data, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("scoped");
    if (result.action === "scoped") {
      expect(result.patch.confidence).toBe("yellow");
    }
  });

  it("stopped + fixing + no PR → failed", () => {
    const data = makeStatus({
      statusEnum: "stopped",
      isTerminal: true,
      status: "Session terminated",
    });
    const result = interpretPollResult(data, "fixing", DEFAULT_CONTEXT);
    expect(result.action).toBe("failed");
    if (result.action === "failed") {
      expect(result.patch.status).toBe("failed");
      expect(result.patch.fix_progress?.blockers).toContain("Session terminated");
    }
  });

  it("expired → timed_out", () => {
    const data = makeStatus({ statusEnum: "expired", isTerminal: true });
    const result = interpretPollResult(data, "scoping", DEFAULT_CONTEXT);
    expect(result.action).toBe("timed_out");
    if (result.action === "timed_out") {
      expect(result.patch.status).toBe("timed_out");
    }
  });

  it("null status_enum does not crash, defaults to continue", () => {
    const data = makeStatus({
      statusEnum: null as unknown as "working",
      isTerminal: false,
    });
    expect(() => {
      const result = interpretPollResult(data, "scoping", DEFAULT_CONTEXT);
      // With null statusEnum, it's not terminal, not blocked, no output → continue
      expect(result.action).toBe("continue");
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// parseStructuredOutput — valid input
// ---------------------------------------------------------------------------

describe("parseStructuredOutput", () => {
  const VALID_OUTPUT: Record<string, unknown> = {
    confidence: "green",
    confidence_reason: "Clear bug with obvious fix",
    current_behavior: "Health endpoint returns 500",
    requested_fix: "Add try-catch around DB call",
    files_to_modify: ["src/routes/health.ts", "src/middleware/error.ts"],
    tests_needed: "Add health endpoint test",
    action_plan: ["Add try-catch in health handler", "Return 503 on DB failure", "Add test"],
    risks: ["Might mask other DB errors"],
    open_questions: [],
  };

  it("parses valid scoping output with all fields", () => {
    const result = parseStructuredOutput(VALID_OUTPUT);
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("green");
    expect(result!.confidence_reason).toBe("Clear bug with obvious fix");
    expect(result!.current_behavior).toBe("Health endpoint returns 500");
    expect(result!.requested_fix).toBe("Add try-catch around DB call");
    expect(result!.tests_needed).toBe("Add health endpoint test");
  });

  it("confidence maps to ConfidenceLevel correctly", () => {
    const result = parseStructuredOutput(VALID_OUTPUT);
    const validLevels: ConfidenceLevel[] = ["green", "yellow", "red"];
    expect(validLevels).toContain(result!.confidence);
  });

  it("files_to_modify is string[]", () => {
    const result = parseStructuredOutput(VALID_OUTPUT);
    expect(Array.isArray(result!.files_to_modify)).toBe(true);
    expect(result!.files_to_modify).toEqual(["src/routes/health.ts", "src/middleware/error.ts"]);
  });

  it("action_plan is string[]", () => {
    const result = parseStructuredOutput(VALID_OUTPUT);
    expect(Array.isArray(result!.action_plan)).toBe(true);
    expect(result!.action_plan).toHaveLength(3);
  });

  it("empty open_questions → no DevinQuestions shown", () => {
    const result = parseStructuredOutput(VALID_OUTPUT);
    expect(result!.open_questions).toEqual([]);
    // In the UI, DevinQuestions is only rendered if open_questions.length > 0
  });

  it("all fields populate ScopingResult interface", () => {
    const result = parseStructuredOutput(VALID_OUTPUT) as ScopingResult;
    expect(result).toHaveProperty("confidence");
    expect(result).toHaveProperty("confidence_reason");
    expect(result).toHaveProperty("current_behavior");
    expect(result).toHaveProperty("requested_fix");
    expect(result).toHaveProperty("files_to_modify");
    expect(result).toHaveProperty("tests_needed");
    expect(result).toHaveProperty("action_plan");
    expect(result).toHaveProperty("risks");
    expect(result).toHaveProperty("open_questions");
  });
});

// ---------------------------------------------------------------------------
// parseStructuredOutput — partial / malformed data
// ---------------------------------------------------------------------------

describe("parseStructuredOutput with partial/malformed data", () => {
  it("null → returns null, no crash", () => {
    expect(parseStructuredOutput(null)).toBeNull();
  });

  it("plain string → returns null", () => {
    expect(parseStructuredOutput("I found the issue and here is my analysis..." as unknown)).toBeNull();
  });

  it("missing fields → fills with defaults", () => {
    const result = parseStructuredOutput({});
    expect(result).not.toBeNull();
    expect(result!.confidence).toBe("yellow"); // default
    expect(result!.confidence_reason).toBe("");
    expect(result!.current_behavior).toBe("");
    expect(result!.requested_fix).toBe("");
    expect(result!.files_to_modify).toEqual([]);
    expect(result!.tests_needed).toBe("");
    expect(result!.action_plan).toEqual([]);
    expect(result!.risks).toEqual([]);
    expect(result!.open_questions).toEqual([]);
  });

  it("'GREEN' (uppercase) → normalizes to 'green'", () => {
    const result = parseStructuredOutput({ confidence: "GREEN" });
    expect(result!.confidence).toBe("green");
  });

  it("'high' (non-standard) → defaults to 'yellow'", () => {
    const result = parseStructuredOutput({ confidence: "high" });
    expect(result!.confidence).toBe("yellow");
  });

  it("files_to_modify is string → wraps in array", () => {
    const result = parseStructuredOutput({ files_to_modify: "src/index.ts" });
    expect(result!.files_to_modify).toEqual(["src/index.ts"]);
  });

  it("files_to_modify is number → defaults to empty array", () => {
    const result = parseStructuredOutput({ files_to_modify: 42 });
    expect(result!.files_to_modify).toEqual([]);
  });

  it("action_plan is string → wraps in array", () => {
    const result = parseStructuredOutput({ action_plan: "Fix the bug" });
    expect(result!.action_plan).toEqual(["Fix the bug"]);
  });

  it("extra unknown fields are ignored", () => {
    const result = parseStructuredOutput({
      confidence: "red",
      unknown_field: "foo",
      another: 123,
    });
    expect(result!.confidence).toBe("red");
    expect(result).not.toHaveProperty("unknown_field");
    expect(result).not.toHaveProperty("another");
  });

  it("undefined input → returns null", () => {
    expect(parseStructuredOutput(undefined)).toBeNull();
  });

  it("array input → returns null", () => {
    expect(parseStructuredOutput([1, 2, 3] as unknown)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// parseSessionResponse
// ---------------------------------------------------------------------------

describe("parseSessionResponse", () => {
  const RAW_RESPONSE = {
    created_at: "2025-02-08T10:00:00Z",
    session_id: "session-abc123",
    status: "running",
    updated_at: "2025-02-08T10:05:30Z",
    playbook_id: null,
    pull_request: { url: "https://github.com/owner/repo/pull/42" },
    snapshot_id: null,
    status_enum: "finished" as const,
    structured_output: {
      confidence: "green",
      confidence_reason: "Clear",
      current_behavior: "Broken",
      requested_fix: "Fix",
      files_to_modify: ["src/a.ts"],
      tests_needed: "Test",
      action_plan: ["Step 1"],
      risks: [],
      open_questions: [],
    },
    tags: ["scoping", "issue-14"],
    title: "Scope #14: Fix health endpoint",
  };

  it("session_id extracted as sessionId", () => {
    const parsed = parseSessionResponse(RAW_RESPONSE);
    expect(parsed.sessionId).toBe("session-abc123");
  });

  it("status_enum (not status string) used for isTerminal", () => {
    const parsed = parseSessionResponse(RAW_RESPONSE);
    expect(parsed.statusEnum).toBe("finished");
    expect(parsed.isTerminal).toBe(true);
    // status string "running" would be false if used, confirming status_enum is used
  });

  it("pull_request.url extracted (not whole object)", () => {
    const parsed = parseSessionResponse(RAW_RESPONSE);
    expect(parsed.pullRequest).toEqual({ url: "https://github.com/owner/repo/pull/42" });
    expect(parsed.pullRequest?.url).toBe("https://github.com/owner/repo/pull/42");
  });

  it("structured_output passed through", () => {
    const parsed = parseSessionResponse(RAW_RESPONSE);
    expect(parsed.structuredOutput).not.toBeNull();
    expect(parsed.structuredOutput).toHaveProperty("confidence", "green");
  });

  it("created_at and updated_at used for duration calculation", () => {
    const parsed = parseSessionResponse(RAW_RESPONSE);
    const created = new Date(parsed.createdAt).getTime();
    const updated = new Date(parsed.updatedAt).getTime();
    const durationSec = (updated - created) / 1000;
    expect(durationSec).toBe(330); // 5m 30s
  });

  it("normalises null/undefined pull_request to null", () => {
    const parsed = parseSessionResponse({
      ...RAW_RESPONSE,
      pull_request: undefined,
    });
    expect(parsed.pullRequest).toBeNull();
  });

  it("normalises null/undefined structured_output to null", () => {
    const parsed = parseSessionResponse({
      ...RAW_RESPONSE,
      structured_output: undefined,
    });
    expect(parsed.structuredOutput).toBeNull();
  });

  it("url is NOT expected in GET response (only in POST create)", () => {
    // The raw GET response should not have a `url` field.
    // Our parseSessionResponse does not extract it, confirming correct behavior.
    const parsed = parseSessionResponse(RAW_RESPONSE);
    expect(parsed).not.toHaveProperty("url");
  });

  it("isTerminal=false for working status_enum", () => {
    const parsed = parseSessionResponse({
      ...RAW_RESPONSE,
      status_enum: "working",
    });
    expect(parsed.isTerminal).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// parsePRUrl
// ---------------------------------------------------------------------------

describe("parsePRUrl", () => {
  it("extracts owner/repo/prNumber from standard GitHub PR URL", () => {
    const result = parsePRUrl("https://github.com/owner/repo/pull/42");
    expect(result).toEqual({ owner: "owner", repo: "repo", prNumber: 42 });
  });

  it("null → returns null", () => {
    expect(parsePRUrl(null)).toBeNull();
  });

  it("undefined → returns null", () => {
    expect(parsePRUrl(undefined)).toBeNull();
  });

  it("empty string → returns null", () => {
    expect(parsePRUrl("")).toBeNull();
  });

  it("malformed URL → returns null, no crash", () => {
    expect(parsePRUrl("not-a-url")).toBeNull();
    expect(parsePRUrl("https://example.com/something")).toBeNull();
  });

  it("GitHub URL without /pull/ segment → returns null", () => {
    expect(parsePRUrl("https://github.com/owner/repo/issues/42")).toBeNull();
  });

  it("handles URLs with additional path segments", () => {
    const result = parsePRUrl("https://github.com/owner/repo/pull/42/files");
    expect(result).toEqual({ owner: "owner", repo: "repo", prNumber: 42 });
  });

  it("handles URLs with org-scoped repos", () => {
    const result = parsePRUrl("https://github.com/my-org/my-repo/pull/123");
    expect(result).toEqual({ owner: "my-org", repo: "my-repo", prNumber: 123 });
  });
});

// ---------------------------------------------------------------------------
// isTerminal
// ---------------------------------------------------------------------------

describe("isTerminal", () => {
  it("returns true for 'finished'", () => {
    expect(isTerminal("finished")).toBe(true);
  });

  it("returns true for 'stopped'", () => {
    expect(isTerminal("stopped")).toBe(true);
  });

  it("returns true for 'expired'", () => {
    expect(isTerminal("expired")).toBe(true);
  });

  it("returns false for 'working'", () => {
    expect(isTerminal("working")).toBe(false);
  });

  it("returns false for 'blocked'", () => {
    expect(isTerminal("blocked")).toBe(false);
  });

  it("returns false for 'suspend_requested'", () => {
    expect(isTerminal("suspend_requested")).toBe(false);
  });

  it("returns false for 'resumed'", () => {
    expect(isTerminal("resumed")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// createSession request shape
// ---------------------------------------------------------------------------

describe("createSession request shape", () => {
  const originalFetch = globalThis.fetch;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ session_id: "mock-id", url: "https://app.devin.ai/mock" }),
    });
    globalThis.fetch = mockFetch as unknown as typeof fetch;
    vi.stubEnv("DEVIN_API_KEY", "test-key-123");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("builds correct scoping request body shape", async () => {
    const { createScopingSession } = await import("@/lib/devin");
    await createScopingSession({
      issueTitle: "Fix health endpoint",
      issueBody: "The health endpoint returns 500",
      issueNumber: 14,
      repo: "owner/repo",
      acuLimit: 3,
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("/sessions");
    const body = JSON.parse(opts.body);
    expect(body).toHaveProperty("prompt");
    expect(body).toHaveProperty("idempotent", true);
    expect(body).toHaveProperty("max_acu_limit", 3);
    expect(body).toHaveProperty("tags");
    expect(body).toHaveProperty("title");
  });

  it("idempotent is always true", async () => {
    const { createScopingSession } = await import("@/lib/devin");
    await createScopingSession({
      issueTitle: "Test",
      issueBody: "",
      issueNumber: 1,
      repo: "test/repo",
      acuLimit: 5,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.idempotent).toBe(true);
  });

  it("max_acu_limit matches passed acuLimit", async () => {
    const { createScopingSession } = await import("@/lib/devin");
    await createScopingSession({
      issueTitle: "Test",
      issueBody: "",
      issueNumber: 1,
      repo: "test/repo",
      acuLimit: 7,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.max_acu_limit).toBe(7);
  });

  it("tags include repo and issue number", async () => {
    const { createScopingSession } = await import("@/lib/devin");
    await createScopingSession({
      issueTitle: "Test",
      issueBody: "",
      issueNumber: 14,
      repo: "owner/repo",
      acuLimit: 3,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.tags).toEqual(expect.arrayContaining([
      expect.stringContaining("owner/repo"),
    ]));
    expect(body.tags[0]).toContain("14");
  });

  it("title includes issue number and title", async () => {
    const { createScopingSession } = await import("@/lib/devin");
    await createScopingSession({
      issueTitle: "Fix health endpoint",
      issueBody: "",
      issueNumber: 14,
      repo: "owner/repo",
      acuLimit: 3,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.title).toContain("14");
    expect(body.title).toContain("Fix health endpoint");
  });

  it("prompt contains structured output JSON schema", async () => {
    const { createScopingSession } = await import("@/lib/devin");
    await createScopingSession({
      issueTitle: "Test",
      issueBody: "Body",
      issueNumber: 1,
      repo: "test/repo",
      acuLimit: 3,
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    const prompt: string = body.prompt;
    // Should include the JSON schema for structured output
    expect(prompt).toContain('"confidence"');
    expect(prompt).toContain('"files_to_modify"');
    expect(prompt).toContain('"action_plan"');
    expect(prompt).toContain('"open_questions"');
    expect(prompt).toContain("green");
    expect(prompt).toContain("yellow");
    expect(prompt).toContain("red");
  });

  it("fix session uses correct acuLimit and tags", async () => {
    const { createFixSession } = await import("@/lib/devin");
    await createFixSession({
      issueTitle: "Fix health endpoint",
      issueBody: "Body",
      issueNumber: 14,
      repo: "owner/repo",
      acuLimit: 15,
      scopingResult: {
        current_behavior: "Broken",
        requested_fix: "Fix it",
        files_to_modify: ["src/a.ts"],
        action_plan: ["Step 1"],
        tests_needed: "Test",
      },
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.idempotent).toBe(true);
    expect(body.max_acu_limit).toBe(15);
    expect(body.tags[0]).toContain("fix");
    expect(body.tags[0]).toContain("14");
    expect(body.title).toContain("Fix");
    expect(body.title).toContain("14");
  });
});

// ---------------------------------------------------------------------------
// extractStructuredOutputFromMessages
// ---------------------------------------------------------------------------

describe("extractStructuredOutputFromMessages", () => {
  const VALID_JSON = JSON.stringify({
    confidence: "green",
    confidence_reason: "Clear bug",
    current_behavior: "Broken",
    requested_fix: "Fix it",
    files_to_modify: ["src/a.ts"],
    tests_needed: "Unit test",
    action_plan: ["Step 1"],
    risks: [],
    open_questions: [],
  }, null, 2);

  it("extracts JSON from ```json fenced code block", () => {
    const messages = [
      {
        type: "devin_message",
        message: `Here is my analysis:\n\n\`\`\`json\n${VALID_JSON}\n\`\`\`\n\nLet me know if you have questions.`,
      },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("confidence", "green");
    expect(result).toHaveProperty("files_to_modify");
  });

  it("extracts JSON from bare ``` fenced code block (no json label)", () => {
    const messages = [
      {
        type: "devin_message",
        message: `Analysis:\n\n\`\`\`\n${VALID_JSON}\n\`\`\``,
      },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("confidence", "green");
  });

  it("picks the most recent devin_message with JSON", () => {
    const oldJson = JSON.stringify({ confidence: "red", old: true });
    const messages = [
      {
        type: "devin_message",
        message: `Old analysis:\n\`\`\`json\n${oldJson}\n\`\`\``,
      },
      { type: "devin_message", message: "Some intermediate message" },
      {
        type: "devin_message",
        message: `Updated analysis:\n\`\`\`json\n${VALID_JSON}\n\`\`\``,
      },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("confidence", "green");
  });

  it("ignores user messages with JSON (only devin_message type)", () => {
    const messages = [
      {
        type: "user_message",
        message: `Here:\n\`\`\`json\n${VALID_JSON}\n\`\`\``,
      },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).toBeNull();
  });

  it("returns null when no messages have JSON", () => {
    const messages = [
      { type: "devin_message", message: "I analyzed the issue and found it clear." },
      { type: "devin_message", message: "The fix involves updating src/a.ts." },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).toBeNull();
  });

  it("returns null for malformed JSON, no crash", () => {
    const messages = [
      {
        type: "devin_message",
        message: "Analysis:\n```json\n{ confidence: green, broken json }\n```",
      },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).toBeNull();
  });

  it("returns null for JSON without 'confidence' field (not our schema)", () => {
    const otherJson = JSON.stringify({ status: "ok", data: [1, 2, 3] });
    const messages = [
      {
        type: "devin_message",
        message: `Result:\n\`\`\`json\n${otherJson}\n\`\`\``,
      },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).toBeNull();
  });

  it("returns null for null messages array", () => {
    expect(extractStructuredOutputFromMessages(null)).toBeNull();
  });

  it("returns null for undefined messages array", () => {
    expect(extractStructuredOutputFromMessages(undefined)).toBeNull();
  });

  it("returns null for empty messages array", () => {
    expect(extractStructuredOutputFromMessages([])).toBeNull();
  });

  it("handles messages with no type field (treats as devin_message)", () => {
    const messages = [
      {
        message: `Analysis:\n\`\`\`json\n${VALID_JSON}\n\`\`\``,
      },
    ];
    const result = extractStructuredOutputFromMessages(messages);
    expect(result).not.toBeNull();
    expect(result).toHaveProperty("confidence", "green");
  });
});

// ---------------------------------------------------------------------------
// Fallback chain: parseSessionResponse with message extraction
// ---------------------------------------------------------------------------

describe("parseSessionResponse fallback chain", () => {
  const VALID_JSON_STR = JSON.stringify({
    confidence: "yellow",
    confidence_reason: "Needs investigation",
    current_behavior: "Slow",
    requested_fix: "Optimize",
    files_to_modify: ["src/db.ts"],
    tests_needed: "Perf test",
    action_plan: ["Profile", "Optimize"],
    risks: ["May break cache"],
    open_questions: ["Which DB?"],
  }, null, 2);

  it("structured_output null + messages have JSON → structuredOutput populated", () => {
    const raw = {
      session_id: "ses_fallback",
      status: "running",
      status_enum: "finished" as const,
      created_at: "2025-02-08T10:00:00Z",
      updated_at: "2025-02-08T10:05:00Z",
      structured_output: null,
      messages: [
        {
          type: "devin_message",
          message: `Here is my analysis:\n\`\`\`json\n${VALID_JSON_STR}\n\`\`\``,
        },
      ],
    };
    const parsed = parseSessionResponse(raw);
    expect(parsed.structuredOutput).not.toBeNull();
    expect(parsed.structuredOutput).toHaveProperty("confidence", "yellow");

    // Further validate through parseStructuredOutput
    const scoping = parseStructuredOutput(parsed.structuredOutput);
    expect(scoping).not.toBeNull();
    expect(scoping!.confidence).toBe("yellow");
    expect(scoping!.files_to_modify).toEqual(["src/db.ts"]);
  });

  it("structured_output populated + messages also have JSON → structured_output takes priority", () => {
    const raw = {
      session_id: "ses_priority",
      status: "running",
      status_enum: "finished" as const,
      created_at: "2025-02-08T10:00:00Z",
      updated_at: "2025-02-08T10:05:00Z",
      structured_output: {
        confidence: "green",
        confidence_reason: "From structured_output",
        current_behavior: "Direct",
        requested_fix: "Direct fix",
        files_to_modify: ["src/direct.ts"],
        tests_needed: "",
        action_plan: [],
        risks: [],
        open_questions: [],
      },
      messages: [
        {
          type: "devin_message",
          message: `Fallback:\n\`\`\`json\n${VALID_JSON_STR}\n\`\`\``,
        },
      ],
    };
    const parsed = parseSessionResponse(raw);
    // structured_output should take priority over messages
    expect(parsed.structuredOutput).toHaveProperty("confidence", "green");
    expect(parsed.structuredOutput).toHaveProperty("confidence_reason", "From structured_output");
  });

  it("structured_output null + no messages → structuredOutput null", () => {
    const raw = {
      session_id: "ses_none",
      status: "running",
      status_enum: "working" as const,
      created_at: "2025-02-08T10:00:00Z",
      updated_at: "2025-02-08T10:01:00Z",
      structured_output: null,
      messages: [],
    };
    const parsed = parseSessionResponse(raw);
    expect(parsed.structuredOutput).toBeNull();
  });
});
