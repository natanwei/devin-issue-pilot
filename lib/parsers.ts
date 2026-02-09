import { isTerminal } from "./devin";
import type {
  ConfidenceLevel,
  DashboardIssue,
  DevinStatusEnum,
  PRFileChange,
  ScopingResult,
} from "./types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Camel-cased version of the Devin GET /v1/sessions/{id} response.
 *  Mirrors what /api/devin/status returns to the client. */
export interface StatusRouteResponse {
  sessionId: string;
  statusEnum: DevinStatusEnum;
  status: string;
  isTerminal: boolean;
  createdAt: string;
  updatedAt: string;
  pullRequest: { url: string } | null;
  structuredOutput: Record<string, unknown> | null;
  blockerMessage?: string | null;
}

/** Discriminated union of all possible poll-interpretation outcomes. */
export type PollResult =
  | { action: "scoped"; patch: Partial<DashboardIssue> }
  | { action: "done"; patch: Partial<DashboardIssue> }
  | { action: "failed"; patch: Partial<DashboardIssue> }
  | { action: "blocked"; patch: Partial<DashboardIssue> }
  | { action: "timed_out"; patch: Partial<DashboardIssue> }
  | { action: "continue"; nextPollCategory: string };

// ---------------------------------------------------------------------------
// parseStructuredOutput
// ---------------------------------------------------------------------------

const VALID_CONFIDENCE: ConfidenceLevel[] = ["green", "yellow", "red"];

/** Parse raw Devin structured_output into a validated ScopingResult.
 *  Returns null for null / non-object input. Normalises confidence,
 *  wraps scalar arrays, and defaults missing fields. */
export function parseStructuredOutput(
  raw: unknown,
): ScopingResult | null {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;

  const obj = raw as Record<string, unknown>;

  // Normalise confidence: lowercase, validate, default "yellow"
  const rawConf =
    typeof obj.confidence === "string" ? obj.confidence.toLowerCase() : "";
  const confidence: ConfidenceLevel = VALID_CONFIDENCE.includes(
    rawConf as ConfidenceLevel,
  )
    ? (rawConf as ConfidenceLevel)
    : "yellow";

  return {
    confidence,
    confidence_reason: typeof obj.confidence_reason === "string" ? obj.confidence_reason : "",
    current_behavior: typeof obj.current_behavior === "string" ? obj.current_behavior : "",
    requested_fix: typeof obj.requested_fix === "string" ? obj.requested_fix : "",
    files_to_modify: toStringArray(obj.files_to_modify),
    tests_needed: typeof obj.tests_needed === "string" ? obj.tests_needed : "",
    action_plan: toStringArray(obj.action_plan),
    risks: toStringArray(obj.risks),
    open_questions: toStringArray(obj.open_questions),
  };
}

/** Coerce a value to string[]. Wraps a bare string, defaults non-arrays. */
function toStringArray(val: unknown): string[] {
  if (Array.isArray(val)) return val.filter((v) => typeof v === "string");
  if (typeof val === "string") return [val];
  return [];
}

// ---------------------------------------------------------------------------
// extractStructuredOutputFromMessages
// ---------------------------------------------------------------------------

/** Devin sometimes puts JSON analysis in messages instead of structured_output.
 *  This function scans messages (most recent first) for a JSON code block
 *  containing our schema marker ("confidence" field). */
export function extractStructuredOutputFromMessages(
  messages: Array<{ type?: string; message?: string; content?: string }> | undefined | null,
): Record<string, unknown> | null {
  if (!messages || messages.length === 0) return null;

  // Iterate reverse (most recent first)
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];

    // Only consider Devin's own messages
    if (msg.type && msg.type !== "devin_message") continue;

    const text = msg.message || msg.content || "";
    if (!text) continue;

    // Try ```json fenced block first
    const jsonFence = text.match(/```json\s*\n([\s\S]*?)\n```/);
    if (jsonFence) {
      const parsed = tryParseSchemaJson(jsonFence[1]);
      if (parsed) return parsed;
    }

    // Try bare ``` fenced block containing an object
    const bareFence = text.match(/```\s*\n(\{[\s\S]*?\})\n```/);
    if (bareFence) {
      const parsed = tryParseSchemaJson(bareFence[1]);
      if (parsed) return parsed;
    }
  }

  return null;
}

/** Try to parse a string as JSON. Returns the object only if it has a
 *  "confidence" field (our ScopingResult schema marker). */
function tryParseSchemaJson(text: string): Record<string, unknown> | null {
  try {
    const obj = JSON.parse(text);
    if (obj && typeof obj === "object" && !Array.isArray(obj) && "confidence" in obj) {
      return obj as Record<string, unknown>;
    }
  } catch {
    // malformed JSON
  }
  return null;
}

// ---------------------------------------------------------------------------
// parsePRUrl
// ---------------------------------------------------------------------------

/** Extract owner, repo, and PR number from a GitHub pull-request URL.
 *  Returns null for null / malformed input. */
export function parsePRUrl(
  url: string | null | undefined,
): { owner: string; repo: string; prNumber: number } | null {
  if (!url) return null;
  const match = url.match(/github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2], prNumber: parseInt(match[3], 10) };
}

// ---------------------------------------------------------------------------
// parseSessionResponse
// ---------------------------------------------------------------------------

/** Raw shape returned by GET /v1/sessions/{id}. */
interface RawSessionResponse {
  session_id: string;
  status: string;
  status_enum: DevinStatusEnum;
  title?: string;
  created_at: string;
  updated_at: string;
  pull_request?: { url: string } | null;
  structured_output?: Record<string, unknown> | null;
  messages?: Array<{ type?: string; message?: string; content?: string }> | null;
}

/** Transform the raw snake_case Devin response into our camelCase shape.
 *  Mirrors the transformation in /api/devin/status/route.ts. */
export function parseSessionResponse(raw: RawSessionResponse): StatusRouteResponse {
  const lastDevinMessage = raw.messages
    ?.filter((m) => m.type === "devin_message" || !m.type)
    ?.at(-1);

  return {
    sessionId: raw.session_id,
    statusEnum: raw.status_enum,
    status: raw.status,
    isTerminal: isTerminal(raw.status_enum),
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    pullRequest: raw.pull_request || null,
    structuredOutput: raw.structured_output || extractStructuredOutputFromMessages(raw.messages) || null,
    blockerMessage: lastDevinMessage?.message || lastDevinMessage?.content || null,
  };
}

// ---------------------------------------------------------------------------
// interpretPollResult
// ---------------------------------------------------------------------------

/** Given a parsed status response, session type, and timing context,
 *  determine the next action for the dashboard polling loop. */
export function interpretPollResult(
  data: StatusRouteResponse,
  sessionType: "scoping" | "fixing",
  context: {
    issueNumber: number;
    sessionStartedAt: string | undefined;
    timeoutLimit: number;
    now?: string; // for testability; defaults to current time
  },
): PollResult {
  const now = context.now ?? new Date().toISOString();

  // 1. Timeout check (wall-clock)
  if (context.sessionStartedAt) {
    const elapsed =
      new Date(now).getTime() - new Date(context.sessionStartedAt).getTime();
    if (elapsed > context.timeoutLimit) {
      return { action: "timed_out", patch: { status: "timed_out" } };
    }
  }

  // 2. Expired status → timed_out (semantic: Devin itself gave up)
  if (data.statusEnum === "expired") {
    return { action: "timed_out", patch: { status: "timed_out" } };
  }

  // 3. Terminal states (finished / stopped)
  if (data.isTerminal) {
    if (sessionType === "scoping") {
      return scopingTerminal(data, now);
    } else {
      return fixingTerminal(data, context.issueNumber, now);
    }
  }

  // 4. Non-terminal: early scoping completion (output appeared before session ended)
  if (sessionType === "scoping" && data.structuredOutput) {
    return scopingTerminal(data, now);
  }

  // 5. Blocked
  if (data.statusEnum === "blocked") {
    return {
      action: "blocked",
      patch: {
        status: "blocked",
        blocker: {
          what_happened: (data.blockerMessage || data.status || "Devin needs input").replace(/\[\/?\w+\]/g, "").trim(),
          suggestion: "Please provide guidance to continue",
        },
      },
    };
  }

  // 5b. Session sleeping (suspend_requested)
  if (data.statusEnum === "suspend_requested") {
    return {
      action: "blocked",
      patch: {
        status: "blocked",
        blocker: {
          what_happened: "Devin session went to sleep due to inactivity",
          suggestion: "Click Retry to start a new session with your previous context",
        },
      },
    };
  }

  // 6. Continue polling
  return {
    action: "continue",
    nextPollCategory: sessionType === "scoping" ? "scoping" : "fixing",
  };
}

// --- helpers ---

function scopingTerminal(
  data: StatusRouteResponse,
  now: string,
): PollResult {
  const output = data.structuredOutput;
  if (output) {
    const parsed = parseStructuredOutput(output);
    return {
      action: "scoped",
      patch: {
        status: "scoped",
        confidence: parsed?.confidence ?? "yellow",
        scoping: parsed,
        scoped_at: now,
      },
    };
  }
  return {
    action: "scoped",
    patch: { status: "scoped", scoped_at: now },
  };
}

function fixingTerminal(
  data: StatusRouteResponse,
  issueNumber: number,
  now: string,
): PollResult {
  if (data.pullRequest?.url) {
    const prParsed = parsePRUrl(data.pullRequest.url);
    const prNumber = prParsed?.prNumber ?? null;
    const prInfo = prNumber
      ? {
          url: data.pullRequest.url,
          number: prNumber,
          title: `Fix for #${issueNumber}`,
          branch: `devin/fix-${issueNumber}`,
          files_changed: [] as PRFileChange[],
        }
      : null;
    return {
      action: "done",
      patch: { status: "done", completed_at: now, pr: prInfo },
    };
  }

  if (data.statusEnum === "stopped") {
    return {
      action: "failed",
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
    };
  }

  return {
    action: "done",
    patch: { status: "done", completed_at: now },
  };
}
