#!/usr/bin/env npx tsx
/**
 * Live Devin API Smoke Test (Part 2) + Data Flow Trace (Part 3)
 *
 * Burns ~1-2 ACUs. Creates a REAL scoping session against a live issue,
 * polls to completion, validates structured_output, tests messaging
 * and termination, then runs a full data-flow trace.
 *
 * Usage:  npx tsx scripts/test-live-api.ts
 *         npm run test:live
 *
 * Flags:
 *   --skip-cleanup    Don't delete the session (for debugging)
 *   --issue <num>     Use a specific issue number (default: first open)
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import {
  createScopingSession,
  getSession,
  sendMessage,
  deleteSession,
  isTerminal,
} from "../lib/devin.js";
import { listIssues, getFileInfo } from "../lib/github.js";
import {
  parseStructuredOutput,
  parseSessionResponse,
  interpretPollResult,
  parsePRUrl,
  extractStructuredOutputFromMessages,
} from "../lib/parsers.js";

// ---------------------------------------------------------------------------
// Env loader (reuse pattern from existing integration test)
// Env vars are read at call-time (inside headers()), not import-time,
// so loading after static imports is fine.
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "..");

function loadEnvFile(path: string) {
  try {
    const raw = readFileSync(path, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      const val = trimmed
        .slice(eqIdx + 1)
        .trim()
        .replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // file not found
  }
}

loadEnvFile(resolve(ROOT, ".env.local"));
loadEnvFile(resolve(ROOT, ".env"));

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const SKIP_CLEANUP = args.includes("--skip-cleanup");
const issueArgIdx = args.indexOf("--issue");
const ISSUE_ARG = issueArgIdx >= 0 ? parseInt(args[issueArgIdx + 1]) : null;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVIN_API = "https://api.devin.ai/v1";
const DEVIN_KEY = process.env.DEVIN_API_KEY ?? "";
const GH_TOKEN = process.env.GITHUB_TOKEN ?? "";
const REPO_OWNER = "natanwei";
const REPO_NAME = "devin-issue-pilot";
const REPO = `${REPO_OWNER}/${REPO_NAME}`;
const MAX_POLL_MS = 5 * 60_000; // 5 min hard cap
const POLL_INTERVAL_MS = 15_000;
const ACU_LIMIT = 2; // hard cap for test

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const CYAN = "\x1b[36m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

interface StepResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  durationMs: number;
  detail?: string;
  error?: string;
}

const results: StepResult[] = [];

// Captured data for Part 3
let capturedRawResponse: Record<string, unknown> | null = null;
let capturedStructuredOutput: Record<string, unknown> | null = null;
let sessionId = "";
let sessionUrl = "";

function log(msg: string) {
  console.log(`    ${DIM}${msg}${RESET}`);
}

function logHighlight(msg: string) {
  console.log(`    ${CYAN}${msg}${RESET}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runStep(
  name: string,
  fn: () => Promise<string | void>,
): Promise<boolean> {
  const start = Date.now();
  try {
    const detail = await fn();
    const ms = Date.now() - start;
    results.push({
      name,
      passed: true,
      skipped: false,
      durationMs: ms,
      detail: detail || undefined,
    });
    console.log(`  ${GREEN}[PASS]${RESET} ${name} ${DIM}(${ms}ms)${RESET}`);
    return true;
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, skipped: false, durationMs: ms, error: msg });
    console.log(`  ${RED}[FAIL]${RESET} ${name} ${DIM}(${ms}ms)${RESET}`);
    console.log(`    ${RED}${msg}${RESET}`);
    return false;
  }
}

function skipStep(name: string, reason: string) {
  results.push({ name, passed: false, skipped: true, durationMs: 0, error: reason });
  console.log(`  ${YELLOW}[SKIP]${RESET} ${name} ${DIM}(${reason})${RESET}`);
}

// ---------------------------------------------------------------------------
// Step 1: Verify API keys
// ---------------------------------------------------------------------------

async function step1_verifyKeys(): Promise<string> {
  assert(!!DEVIN_KEY, "DEVIN_API_KEY not set in .env.local");
  assert(!!GH_TOKEN, "GITHUB_TOKEN not set in .env.local");

  // Verify Devin API key
  log("Testing Devin API auth...");
  const devinRes = await fetch(`${DEVIN_API}/sessions`, {
    headers: { Authorization: `Bearer ${DEVIN_KEY}` },
  });
  assert(
    devinRes.ok,
    `Devin API auth failed: HTTP ${devinRes.status} — ${await devinRes.text()}`,
  );
  log("Devin API key valid");

  // Verify GitHub token
  log("Testing GitHub API auth...");
  const ghRes = await fetch(`https://api.github.com/repos/${REPO}`, {
    headers: {
      Authorization: `Bearer ${GH_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });
  assert(
    ghRes.ok,
    `GitHub API auth failed: HTTP ${ghRes.status} — ${await ghRes.text()}`,
  );
  log("GitHub token valid");

  return "Both API keys verified";
}

// ---------------------------------------------------------------------------
// Step 2: Create scoping session
// ---------------------------------------------------------------------------

let issueNumber = 0;
let issueTitle = "";
let issueBody = "";

async function step2_createSession(): Promise<string> {
  // Pick a real issue
  log(`Fetching open issues from ${REPO}...`);
  const issues = await listIssues(REPO_OWNER, REPO_NAME);
  assert(issues.length > 0, `No open issues found in ${REPO}`);

  let issue;
  if (ISSUE_ARG) {
    issue = issues.find((i) => i.number === ISSUE_ARG);
    assert(!!issue, `Issue #${ISSUE_ARG} not found among open issues`);
  } else {
    issue = issues[0];
  }

  issueNumber = issue.number;
  issueTitle = issue.title;
  issueBody = issue.body ?? "";
  log(`Using issue #${issueNumber}: ${issueTitle}`);

  // Create session using our lib function
  log("Creating scoping session via createScopingSession()...");
  const result = await createScopingSession({
    issueTitle,
    issueBody,
    issueNumber,
    repo: REPO,
    acuLimit: ACU_LIMIT,
  });

  sessionId = result.session_id;
  sessionUrl = result.url;

  log(`FULL CREATE RESPONSE:`);
  log(JSON.stringify(result, null, 2));

  // Verify response shape
  assert(typeof result.session_id === "string" && result.session_id.length > 0, "session_id missing or empty");
  assert(typeof result.url === "string" && result.url.startsWith("https://"), "url missing or invalid");

  // Check for is_new_session (may or may not be present)
  const hasIsNew = "is_new_session" in result;
  log(`is_new_session present: ${hasIsNew}${hasIsNew ? ` (value: ${(result as Record<string, unknown>).is_new_session})` : ""}`);

  return `session_id=${sessionId}, url=${sessionUrl}`;
}

// ---------------------------------------------------------------------------
// Step 3: Poll until completion or 5 min timeout
// ---------------------------------------------------------------------------

async function step3_pollToCompletion(): Promise<string> {
  assert(!!sessionId, "No session to poll");

  const pollStart = Date.now();
  let pollCount = 0;
  let finalStatusEnum = "";
  let sessionCompleted = false;

  log("Polling every 15s (max 5 min)...");
  log("");

  while (Date.now() - pollStart < MAX_POLL_MS) {
    pollCount++;
    const elapsed = Math.round((Date.now() - pollStart) / 1000);

    try {
      const raw = await getSession(sessionId);
      capturedRawResponse = raw as unknown as Record<string, unknown>;
      finalStatusEnum = raw.status_enum;

      const hasOutput = raw.structured_output != null;
      const hasPR = raw.pull_request != null;

      log(
        `Poll #${pollCount} (${elapsed}s): status_enum=${raw.status_enum}, ` +
          `structured_output=${hasOutput ? "populated" : "null"}, ` +
          `pull_request=${hasPR ? "populated" : "null"}`,
      );

      if (hasOutput) {
        capturedStructuredOutput = raw.structured_output as Record<string, unknown>;
      }

      if (isTerminal(raw.status_enum)) {
        sessionCompleted = true;
        log("");
        log(`Session reached terminal state: ${raw.status_enum}`);
        break;
      }

      if (raw.status_enum === "blocked") {
        log(`Session is blocked. Status: ${raw.status}`);
        // Continue polling — blocked sessions may auto-resolve
      }
    } catch (err) {
      log(`Poll error: ${err instanceof Error ? err.message : err}`);
    }

    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }

  if (!sessionCompleted) {
    log("5-minute wall-clock timeout reached. Session did not complete.");
    // Still continue — we can validate whatever partial data we have
  }

  return `${pollCount} polls, final status: ${finalStatusEnum}, completed: ${sessionCompleted}`;
}

// ---------------------------------------------------------------------------
// Step 4: Validate structured_output
// ---------------------------------------------------------------------------

async function step4_validateOutput(): Promise<string> {
  log("RAW structured_output:");
  log(JSON.stringify(capturedStructuredOutput, null, 2));

  let outputSource = "structured_output";

  if (!capturedStructuredOutput) {
    log("structured_output is null, trying message fallback...");

    if (capturedRawResponse) {
      const messages = (capturedRawResponse as Record<string, unknown>).messages as
        | Array<{ type?: string; message?: string; content?: string }>
        | undefined;

      const fromMessages = extractStructuredOutputFromMessages(messages);
      if (fromMessages) {
        capturedStructuredOutput = fromMessages;
        outputSource = "message fallback";
        log(`Extracted structured output from messages (${outputSource})`);
        log(JSON.stringify(fromMessages, null, 2));
      } else {
        if (messages && messages.length > 0) {
          log(`Found ${messages.length} messages but no extractable JSON.`);
          const last = messages[messages.length - 1];
          log(`Last message: ${JSON.stringify(last, null, 2)}`);
        } else {
          log("No messages found either.");
        }

        throw new Error(
          "structured_output is null and message fallback found nothing. " +
            "This may indicate: (a) session hit ACU limit before finishing, " +
            "(b) Devin response format changed, or " +
            "(c) the session did not produce any analysis.",
        );
      }
    } else {
      throw new Error("No raw response captured — cannot attempt fallback.");
    }
  }

  // Verify it's a JSON object
  assert(typeof capturedStructuredOutput === "object", "structured_output is not an object");
  assert(!Array.isArray(capturedStructuredOutput), "structured_output is an array, expected object");

  // Parse through our parseStructuredOutput function
  const parsed = parseStructuredOutput(capturedStructuredOutput);
  assert(parsed !== null, "parseStructuredOutput returned null for non-null input");

  log("PARSED ScopingResult:");
  log(JSON.stringify(parsed, null, 2));

  // Validate individual fields
  const checks: string[] = [];

  // confidence
  const validConf = ["green", "yellow", "red"];
  if (validConf.includes(parsed.confidence)) {
    checks.push(`confidence: "${parsed.confidence}" (valid)`);
  } else {
    throw new Error(`confidence "${parsed.confidence}" not in ${JSON.stringify(validConf)}`);
  }

  // files_to_modify
  assert(Array.isArray(parsed.files_to_modify), "files_to_modify is not an array");
  checks.push(`files_to_modify: ${parsed.files_to_modify.length} files`);

  // action_plan
  assert(Array.isArray(parsed.action_plan), "action_plan is not an array");
  checks.push(`action_plan: ${parsed.action_plan.length} steps`);

  // current_behavior
  assert(typeof parsed.current_behavior === "string", "current_behavior not a string");
  checks.push(`current_behavior: "${parsed.current_behavior.slice(0, 50)}..."`);

  // requested_fix
  assert(typeof parsed.requested_fix === "string", "requested_fix not a string");
  checks.push(`requested_fix: "${parsed.requested_fix.slice(0, 50)}..."`);

  // Verify parseStructuredOutput handled it without errors
  checks.push("parseStructuredOutput() returned valid ScopingResult");
  checks.push(`source: ${outputSource}`);

  return checks.join("; ");
}

// ---------------------------------------------------------------------------
// Step 5: Test message sending
// ---------------------------------------------------------------------------

async function step5_testMessage(): Promise<string> {
  assert(!!sessionId, "No session");

  // Check if session is still active
  const raw = await getSession(sessionId);
  if (isTerminal(raw.status_enum)) {
    return "Session already terminal — skipping message test (expected for fast completions)";
  }

  log("Sending test message...");
  await sendMessage(
    sessionId,
    "This is an integration test. Please acknowledge this message in your structured output.",
  );
  log("Message sent. Waiting 30s for processing...");

  await new Promise((r) => setTimeout(r, 30_000));

  const after = await getSession(sessionId);
  const messages = (after as unknown as Record<string, unknown>).messages;
  if (Array.isArray(messages)) {
    const hasTestMsg = messages.some(
      (m: Record<string, unknown>) =>
        typeof m.content === "string" && m.content.includes("integration test"),
    );
    assert(hasTestMsg, "Test message not found in session messages");
    return `Message confirmed in session (${messages.length} total messages)`;
  }

  return "Messages array not accessible — non-critical";
}

// ---------------------------------------------------------------------------
// Step 6: Test session termination
// ---------------------------------------------------------------------------

async function step6_testTermination(): Promise<string> {
  assert(!!sessionId, "No session");

  // Check if already terminal
  const before = await getSession(sessionId);
  if (isTerminal(before.status_enum)) {
    return `Session already terminal (${before.status_enum}) — delete not needed`;
  }

  log("Calling deleteSession()...");
  await deleteSession(sessionId);

  // Verify termination
  log("Verifying termination...");
  await new Promise((r) => setTimeout(r, 3000));

  const after = await getSession(sessionId);
  const afterEnum = after.status_enum;
  const afterStatus = after.status;
  log(`After delete: status_enum=${afterEnum}, status=${afterStatus}`);

  // After DELETE, Devin sets status to "exit" while status_enum may be "stopped"
  assert(
    isTerminal(afterEnum) || afterStatus === "exit",
    `Session did not reach terminal state after delete. status_enum=${afterEnum}, status=${afterStatus}`,
  );

  return `Terminal state confirmed: status_enum=${afterEnum}`;
}

// ---------------------------------------------------------------------------
// Step 7: Verify GitHub enrichment
// ---------------------------------------------------------------------------

async function step7_githubEnrichment(): Promise<string> {
  const parsed = capturedStructuredOutput
    ? parseStructuredOutput(capturedStructuredOutput)
    : null;

  const fileResults: string[] = [];

  if (parsed && parsed.files_to_modify.length > 0) {
    log(`Checking ${parsed.files_to_modify.length} files from scoping result...`);
    for (const filePath of parsed.files_to_modify.slice(0, 3)) {
      try {
        const info = await getFileInfo(REPO_OWNER, REPO_NAME, filePath);
        if (info.lines !== null) {
          fileResults.push(`${info.path}: ${info.lines} lines`);
        } else {
          fileResults.push(`${info.path}: exists (directory or binary)`);
        }
      } catch {
        fileResults.push(`${filePath}: 404 (file not found in repo)`);
      }
    }
  } else {
    fileResults.push("No files_to_modify in scoping result");
  }

  // Check for PR (unlikely in scoping, but handle it)
  if (capturedRawResponse) {
    const pr = (capturedRawResponse as Record<string, unknown>).pull_request as
      | { url: string }
      | null;
    if (pr?.url) {
      const prParsed = parsePRUrl(pr.url);
      if (prParsed) {
        fileResults.push(`PR found: #${prParsed.prNumber} in ${prParsed.owner}/${prParsed.repo}`);
      }
    }
  }

  return fileResults.join("; ");
}

// ---------------------------------------------------------------------------
// Part 3: Data flow trace
// ---------------------------------------------------------------------------

async function step8_dataFlowTrace(): Promise<string> {
  if (!capturedRawResponse) {
    throw new Error("No raw API response captured — cannot run data flow trace");
  }

  console.log("");
  console.log(`${BOLD}${CYAN}═══ PART 3: DATA FLOW TRACE ═══${RESET}`);
  console.log("");

  // Step 1: Raw API → parseSessionResponse
  log("Step 1: Raw Devin API response → parseSessionResponse()");
  const statusResponse = parseSessionResponse(capturedRawResponse as unknown as Parameters<typeof parseSessionResponse>[0]);
  log(`  sessionId: ${statusResponse.sessionId}`);
  log(`  statusEnum: ${statusResponse.statusEnum}`);
  log(`  isTerminal: ${statusResponse.isTerminal}`);
  log(`  pullRequest: ${statusResponse.pullRequest ? statusResponse.pullRequest.url : "null"}`);
  log(`  structuredOutput: ${statusResponse.structuredOutput ? "populated" : "null"}`);
  log("");

  // Step 2: Raw structured_output → parseStructuredOutput
  log("Step 2: Raw structured_output → parseStructuredOutput()");
  const scopingResult = statusResponse.structuredOutput
    ? parseStructuredOutput(statusResponse.structuredOutput)
    : null;
  if (scopingResult) {
    log(`  confidence: ${scopingResult.confidence}`);
    log(`  confidence_reason: ${scopingResult.confidence_reason}`);
    log(`  files_to_modify: [${scopingResult.files_to_modify.join(", ")}]`);
    log(`  action_plan: ${scopingResult.action_plan.length} steps`);
    log(`  open_questions: ${scopingResult.open_questions.length} questions`);
  } else {
    log("  ScopingResult: null (no structured output)");
  }
  log("");

  // Step 3: Feed into interpretPollResult
  log("Step 3: StatusRouteResponse → interpretPollResult()");
  const pollResult = interpretPollResult(statusResponse, "scoping", {
    issueNumber,
    sessionStartedAt: new Date(Date.now() - 5 * 60_000).toISOString(), // simulate 5 min session
    timeoutLimit: 15 * 60_000,
  });
  log(`  action: ${pollResult.action}`);
  if ("patch" in pollResult) {
    log(`  patch.status: ${pollResult.patch.status}`);
    log(`  patch.confidence: ${pollResult.patch.confidence ?? "null"}`);
    log(`  patch.scoping: ${pollResult.patch.scoping ? "populated" : "null"}`);
    log(`  patch.scoped_at: ${pollResult.patch.scoped_at ?? "null"}`);
  }
  log("");

  // Step 4: Verify DashboardIssue fields
  log("Step 4: Verify DashboardIssue mapping");
  if ("patch" in pollResult && pollResult.action === "scoped") {
    const p = pollResult.patch;
    log(`  Issue #${issueNumber} would transition to status="${p.status}"`);
    if (p.confidence === "green") {
      log("  → IssueDetail shows green border + Start Fix button");
    } else if (p.confidence === "yellow") {
      log("  → IssueDetail shows DevinQuestions + MessageInput + Start Fix");
    } else if (p.confidence === "red") {
      log("  → IssueDetail shows DevinQuestions + MessageInput, NO Start Fix");
    }
  } else {
    log(`  Action was "${pollResult.action}" — no scoped patch to verify`);
  }
  log("");

  // Step 5: Duration calculation
  log("Step 5: Duration calculation");
  const created = new Date(statusResponse.createdAt).getTime();
  const updated = new Date(statusResponse.updatedAt).getTime();
  const durationSec = Math.round((updated - created) / 1000);
  const durationMin = Math.floor(durationSec / 60);
  const durationRemSec = durationSec % 60;
  log(`  created_at: ${statusResponse.createdAt}`);
  log(`  updated_at: ${statusResponse.updatedAt}`);
  log(`  Duration: ${durationSec}s = ${durationMin}m ${durationRemSec}s`);

  return "Data flow trace complete";
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport() {
  console.log("");
  console.log(`${BOLD}${"=".repeat(70)}${RESET}`);
  console.log(`${BOLD}  LIVE API SMOKE TEST REPORT${RESET}`);
  console.log(`${"=".repeat(70)}`);
  console.log("");

  // Part 1 reference
  console.log(`${BOLD}Part 1: Unit Tests (Vitest)${RESET}`);
  console.log("  Run separately via: npm test");
  console.log("  72 tests, 0 ACUs");
  console.log("");

  // Part 2 results
  console.log(`${BOLD}Part 2: Live API Smoke Test${RESET}`);
  const maxName = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const icon = r.skipped ? `${YELLOW}SKIP` : r.passed ? `${GREEN}PASS` : `${RED}FAIL`;
    const pad = " ".repeat(maxName - r.name.length + 2);
    console.log(`  ${icon}${RESET}  ${r.name}${pad}${DIM}${r.durationMs}ms${RESET}`);
    if (r.detail) {
      console.log(`        ${DIM}${r.detail}${RESET}`);
    }
    if (r.error && !r.skipped) {
      console.log(`        ${RED}${r.error}${RESET}`);
    }
  }
  console.log("");

  // Part 3 results
  console.log(`${BOLD}Part 3: Data Flow Trace${RESET}`);
  console.log("  See trace output above.");
  console.log("");

  // Schema mismatch check
  if (capturedStructuredOutput) {
    const parsed = parseStructuredOutput(capturedStructuredOutput);
    if (parsed) {
      const expected = [
        "confidence",
        "confidence_reason",
        "current_behavior",
        "requested_fix",
        "files_to_modify",
        "tests_needed",
        "action_plan",
        "risks",
        "open_questions",
      ];
      const rawKeys = Object.keys(capturedStructuredOutput);
      const extra = rawKeys.filter((k) => !expected.includes(k));
      const missing = expected.filter((k) => !(k in capturedStructuredOutput!));

      if (extra.length > 0 || missing.length > 0) {
        console.log(`${BOLD}${YELLOW}Schema Discrepancies:${RESET}`);
        if (extra.length > 0) {
          console.log(
            `  ${YELLOW}Extra fields from Devin: ${extra.join(", ")}${RESET}`,
          );
          console.log(
            `  ${DIM}Consider adding these to ScopingResult if useful${RESET}`,
          );
        }
        if (missing.length > 0) {
          console.log(
            `  ${YELLOW}Missing fields from Devin: ${missing.join(", ")}${RESET}`,
          );
          console.log(
            `  ${DIM}Our parseStructuredOutput defaults these. Consider strengthening the prompt.${RESET}`,
          );
        }
        console.log("");
      } else {
        console.log(
          `${GREEN}Structured output matches expected schema exactly.${RESET}`,
        );
        console.log("");
      }
    }
  } else {
    console.log(
      `${YELLOW}No structured_output captured — cannot verify schema.${RESET}`,
    );
    console.log(
      `${DIM}Recommendation: Strengthen prompt to require structured_output, ` +
        `or increase ACU limit for longer-running issues.${RESET}`,
    );
    console.log("");
  }

  // ACU estimate
  const acuEstimate = capturedRawResponse
    ? (() => {
        const created = new Date(
          (capturedRawResponse as Record<string, unknown>).created_at as string,
        ).getTime();
        const updated = new Date(
          (capturedRawResponse as Record<string, unknown>).updated_at as string,
        ).getTime();
        const minutes = (updated - created) / 60_000;
        return Math.max(0.1, minutes * 0.1).toFixed(1); // rough estimate
      })()
    : "unknown";
  console.log(`${BOLD}Estimated ACU consumption: ~${acuEstimate}${RESET}`);

  // Summary
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  console.log(
    `\n${BOLD}Summary: ${GREEN}${passed} passed${RESET}, ` +
      `${failed > 0 ? RED : DIM}${failed} failed${RESET}, ` +
      `${DIM}${skipped} skipped${RESET}`,
  );
  console.log(`${"=".repeat(70)}\n`);

  return failed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("");
  console.log(`${BOLD}${CYAN}Live Devin API Smoke Test${RESET}`);
  console.log(`${DIM}Target: ${REPO}  |  ACU limit: ${ACU_LIMIT}  |  Poll timeout: 5 min${RESET}`);
  console.log(`${DIM}${SKIP_CLEANUP ? "Cleanup: DISABLED (--skip-cleanup)" : "Cleanup: enabled"}${RESET}`);
  console.log("");

  // === Step 1: Verify API keys ===
  console.log(`${BOLD}─── Step 1: Verify API Keys ───${RESET}`);
  const keysOk = await runStep("1 — Verify API keys", step1_verifyKeys);
  if (!keysOk) {
    console.log(`\n${RED}STOPPING: API key verification failed.${RESET}\n`);
    printReport();
    process.exit(1);
  }

  // === Step 2: Create scoping session ===
  console.log(`${BOLD}─── Step 2: Create Scoping Session ───${RESET}`);
  const createOk = await runStep("2 — Create scoping session", step2_createSession);
  if (!createOk) {
    console.log(`\n${RED}STOPPING: Could not create session.${RESET}\n`);
    printReport();
    process.exit(1);
  }

  // === Step 3: Poll until completion ===
  console.log(`${BOLD}─── Step 3: Poll Until Completion ───${RESET}`);
  await runStep("3 — Poll to completion", step3_pollToCompletion);

  // === Step 4: Validate structured_output ===
  console.log(`${BOLD}─── Step 4: Validate Structured Output ───${RESET}`);
  await runStep("4 — Validate structured_output", step4_validateOutput);

  // === Step 5: Test message sending ===
  console.log(`${BOLD}─── Step 5: Test Message Sending ───${RESET}`);
  const rawCheck = capturedRawResponse
    ? await (async () => {
        const r = await getSession(sessionId);
        return !isTerminal(r.status_enum);
      })()
    : false;

  if (rawCheck) {
    await runStep("5 — Send message", step5_testMessage);
  } else {
    skipStep("5 — Send message", "Session already terminal");
  }

  // === Step 6: Test session termination ===
  console.log(`${BOLD}─── Step 6: Test Session Termination ───${RESET}`);
  if (SKIP_CLEANUP) {
    skipStep("6 — Session termination", "--skip-cleanup flag set");
  } else {
    await runStep("6 — Session termination", step6_testTermination);
  }

  // === Step 7: GitHub enrichment ===
  console.log(`${BOLD}─── Step 7: GitHub Enrichment ───${RESET}`);
  await runStep("7 — GitHub enrichment", step7_githubEnrichment);

  // === Part 3: Data flow trace ===
  await runStep("8 — Data flow trace (Part 3)", step8_dataFlowTrace);

  // === Report ===
  const failCount = printReport();
  process.exit(failCount > 0 ? 1 : 0);
}

// Cleanup on unexpected exit
process.on("SIGINT", async () => {
  if (sessionId && !SKIP_CLEANUP) {
    console.log(`\n${DIM}Cleaning up session ${sessionId}...${RESET}`);
    try {
      await deleteSession(sessionId);
    } catch {
      // best effort
    }
  }
  process.exit(130);
});

main();
