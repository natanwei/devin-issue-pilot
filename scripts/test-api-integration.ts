#!/usr/bin/env npx tsx
/**
 * Devin API Integration Test
 *
 * Tests the Devin + GitHub API integration layer with real credentials.
 * Burns ~0.2 ACUs total (two minimal sessions).
 *
 * Usage:  npx tsx scripts/test-api-integration.ts
 */

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { spawn, ChildProcess } from "child_process";

// ---------------------------------------------------------------------------
// Env loader
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
      const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // file not found, skip
  }
}

function loadEnv() {
  // Next.js convention: .env.local takes precedence, then .env
  loadEnvFile(resolve(ROOT, ".env.local"));
  loadEnvFile(resolve(ROOT, ".env"));
  if (!process.env.DEVIN_API_KEY && !process.env.GITHUB_TOKEN) {
    console.error("⚠  No API keys found in .env.local or .env — relying on shell environment");
  }
}

loadEnv();

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEVIN_API = "https://api.devin.ai/v1";
const DEVIN_KEY = process.env.DEVIN_API_KEY ?? "";
const GH_TOKEN = process.env.GITHUB_TOKEN ?? "";
const TEST_PORT = 3099;
const BASE_URL = `http://localhost:${TEST_PORT}`;

const devinHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${DEVIN_KEY}`,
  "Content-Type": "application/json",
});

const ghHeaders = (): Record<string, string> => ({
  Authorization: `Bearer ${GH_TOKEN}`,
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
});

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  durationMs: number;
  error?: string;
}

const results: TestResult[] = [];
let devinAuthOk = true;
let githubAuthOk = true;

// Shared state across tests
let testSessionId = "";
let testSessionUrl = "";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

async function runTest(name: string, fn: () => Promise<void>) {
  const start = Date.now();
  try {
    await fn();
    const ms = Date.now() - start;
    results.push({ name, passed: true, skipped: false, durationMs: ms });
    console.log(`  ${GREEN}✓${RESET} ${name} ${DIM}(${ms}ms)${RESET}`);
  } catch (err) {
    const ms = Date.now() - start;
    const msg = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, skipped: false, durationMs: ms, error: msg });
    console.log(`  ${RED}✗${RESET} ${name} ${DIM}(${ms}ms)${RESET}`);
    console.log(`    ${RED}${msg}${RESET}`);
  }
}

function skipTest(name: string, reason: string) {
  results.push({ name, passed: false, skipped: true, durationMs: 0, error: reason });
  console.log(`  ${YELLOW}○${RESET} ${name} ${DIM}(skipped: ${reason})${RESET}`);
}

// ---------------------------------------------------------------------------
// Test 1 — Devin API Key Validation
// ---------------------------------------------------------------------------

async function test1_devinAuth() {
  if (!DEVIN_KEY) {
    devinAuthOk = false;
    throw new Error("DEVIN_API_KEY not set in environment");
  }

  const res = await fetch(`${DEVIN_API}/sessions`, { headers: devinHeaders() });

  if (res.status === 401 || res.status === 403) {
    devinAuthOk = false;
    throw new Error(`Auth failure: HTTP ${res.status}`);
  }

  assert(res.ok, `Expected 200, got ${res.status}`);

  const body = await res.json();
  // API may return { sessions: [...] } or { data: [...] }
  const sessions = body.sessions ?? body.data ?? body;
  assert(Array.isArray(sessions), "Response should contain a sessions array");
}

// ---------------------------------------------------------------------------
// Test 2 — GitHub Token Validation
// ---------------------------------------------------------------------------

async function test2_githubAuth() {
  if (!GH_TOKEN) {
    githubAuthOk = false;
    throw new Error("GITHUB_TOKEN not set in environment");
  }

  const res = await fetch(
    "https://api.github.com/repos/facebook/react/issues?per_page=1&state=open",
    { headers: ghHeaders() }
  );

  if (res.status === 401) {
    githubAuthOk = false;
    throw new Error(`Auth failure: HTTP 401`);
  }

  assert(res.ok, `Expected 200, got ${res.status}`);

  const issues = await res.json();
  assert(Array.isArray(issues), "Response should be an array");
  assert(issues.length > 0, "Expected at least 1 issue");
  assert(typeof issues[0].number === "number", "Issue should have a number");
  assert(typeof issues[0].title === "string", "Issue should have a title");
}

// ---------------------------------------------------------------------------
// Test 3 — Session Lifecycle (create → get → delete → verify)
// ---------------------------------------------------------------------------

async function test3_sessionLifecycle() {
  if (!devinAuthOk) {
    skipTest("3 — Session lifecycle", "Devin auth failed");
    return;
  }

  // --- Create ---
  console.log(`    ${DIM}Creating session...${RESET}`);
  const nonce = Date.now();
  const createRes = await fetch(`${DEVIN_API}/sessions`, {
    method: "POST",
    headers: devinHeaders(),
    body: JSON.stringify({
      prompt: `Reply with the word PING and the number ${nonce} in your structured output. Do nothing else.`,
      idempotent: false,
      max_acu_limit: 1,
      tags: ["test"],
      title: `API Integration Test ${nonce}`,
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Create failed: HTTP ${createRes.status} — ${await createRes.text()}`);
  }

  const createBody = await createRes.json();
  assert(typeof createBody.session_id === "string", "Missing session_id in create response");
  assert(typeof createBody.url === "string", "Missing url in create response");

  testSessionId = createBody.session_id;
  testSessionUrl = createBody.url;
  console.log(`    ${DIM}session_id: ${testSessionId}${RESET}`);
  console.log(`    ${DIM}url: ${testSessionUrl}${RESET}`);

  // --- Get status ---
  console.log(`    ${DIM}Getting session status...${RESET}`);
  const getRes = await fetch(`${DEVIN_API}/sessions/${testSessionId}`, {
    headers: devinHeaders(),
  });
  assert(getRes.ok, `Get failed: HTTP ${getRes.status}`);

  const getBody = await getRes.json();
  console.log(`    ${DIM}GET response keys: ${Object.keys(getBody).join(", ")}${RESET}`);

  assert("status_enum" in getBody, "status_enum field should exist in GET response");
  assert("structured_output" in getBody, "structured_output field should exist (even if null)");
  // status_enum may be null initially while session is "claimed"/initializing
  console.log(`    ${DIM}status_enum: ${getBody.status_enum ?? "(null — session initializing)"}${RESET}`);

  // url should NOT be in GET response (only in POST)
  const hasUrl = "url" in getBody;
  if (hasUrl) {
    console.log(`    ${YELLOW}Note: url IS present in GET response (unexpected but non-fatal)${RESET}`);
  } else {
    console.log(`    ${DIM}Confirmed: url not in GET response ✓${RESET}`);
  }

  // --- Delete ---
  console.log(`    ${DIM}Deleting session...${RESET}`);
  const deleteRes = await fetch(`${DEVIN_API}/sessions/${testSessionId}`, {
    method: "DELETE",
    headers: devinHeaders(),
  });
  // 200 = deleted, 400 = already terminal (both acceptable)
  assert(
    deleteRes.ok || deleteRes.status === 400,
    `Delete failed unexpectedly: HTTP ${deleteRes.status}`
  );
  if (deleteRes.status === 400) {
    console.log(`    ${DIM}Session already terminal (HTTP 400 on delete is expected) ✓${RESET}`);
  }

  // --- Verify terminated ---
  console.log(`    ${DIM}Verifying termination (polling up to 15s)...${RESET}`);
  const terminalStatuses = ["stopped", "finished", "expired"];
  const verifyStart = Date.now();
  let finalStatus = "(unknown)";

  while (Date.now() - verifyStart < 15_000) {
    await new Promise((r) => setTimeout(r, 2000));
    const verifyRes = await fetch(`${DEVIN_API}/sessions/${testSessionId}`, {
      headers: devinHeaders(),
    });
    assert(verifyRes.ok, `Verify-get failed: HTTP ${verifyRes.status}`);

    const verifyBody = await verifyRes.json();
    finalStatus = verifyBody.status_enum ?? verifyBody.status;
    console.log(`    ${DIM}  status_enum: ${verifyBody.status_enum}, status: ${verifyBody.status}${RESET}`);

    if (verifyBody.status_enum && terminalStatuses.includes(verifyBody.status_enum)) {
      console.log(`    ${DIM}Terminated with status_enum: ${verifyBody.status_enum} ✓${RESET}`);
      return;
    }
    // After DELETE, Devin API sets status to "exit" while status_enum may lag
    if (verifyBody.status === "exit" || ["stopped", "finished", "expired"].includes(verifyBody.status)) {
      console.log(`    ${DIM}Terminated (status: "${verifyBody.status}", status_enum: "${verifyBody.status_enum}") ✓${RESET}`);
      return;
    }
  }

  // If we get here after polling, report what we see
  throw new Error(`Session did not reach terminal state within 15s. Last status: ${finalStatus}`);
}

// ---------------------------------------------------------------------------
// Test 4 — Status Mapping Verification (pure code, no API calls)
// ---------------------------------------------------------------------------

async function test4_statusMapping() {
  // Import isTerminal from our codebase
  const { isTerminal } = await import("../lib/devin.js");

  // Terminal states
  assert(isTerminal("finished") === true, 'isTerminal("finished") should be true');
  assert(isTerminal("stopped") === true, 'isTerminal("stopped") should be true');
  assert(isTerminal("expired") === true, 'isTerminal("expired") should be true');

  // Non-terminal states
  assert(isTerminal("working") === false, 'isTerminal("working") should be false');
  assert(isTerminal("blocked") === false, 'isTerminal("blocked") should be false');
  assert(
    isTerminal("suspend_requested" as any) === false,
    'isTerminal("suspend_requested") should be false'
  );
  assert(isTerminal("resumed" as any) === false, 'isTerminal("resumed") should be false');

  // Verify documented mapping matches code:
  // The status mapping in Dashboard.tsx works as follows:
  //   "working"  → continue polling (status stays "scoping" or "fixing")
  //   "blocked"  → status set to "blocked"
  //   "finished" → scoped (if scoping) or done (if fixing)
  //   "stopped"  → scoped (if scoping output exists) or failed (if fixing)
  //   "expired"  → timed_out
  //
  // isTerminal correctly identifies finished/stopped/expired as terminal,
  // which is the gate that triggers the status transitions above.

  console.log(`    ${DIM}isTerminal mapping verified for all 7 DevinStatusEnum values ✓${RESET}`);
  console.log(`    ${DIM}Documented status transitions:${RESET}`);
  console.log(`    ${DIM}  "working"  → continues polling (scoping/fixing)${RESET}`);
  console.log(`    ${DIM}  "blocked"  → blocked${RESET}`);
  console.log(`    ${DIM}  "finished" → scoped (scoping) / done (fixing)${RESET}`);
  console.log(`    ${DIM}  "stopped"  → scoped (w/ output) / failed (fixing)${RESET}`);
  console.log(`    ${DIM}  "expired"  → timed_out${RESET}`);
}

// ---------------------------------------------------------------------------
// Test 5 — Next.js API Route Validation
// ---------------------------------------------------------------------------

let devServer: ChildProcess | null = null;
let weStartedServer = false;

async function waitForServer(url: string, timeoutMs = 60_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      // Use an API route we know exists to verify the right app is running
      const res = await fetch(`${url}/api/github/issues?owner=facebook&repo=react`, {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) return;
    } catch {
      // not ready yet
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Server at ${url} did not become ready within ${timeoutMs / 1000}s`);
}

let activeBaseUrl = BASE_URL;

async function ensureDevServer(): Promise<void> {
  // Check if our app is already running on common ports
  for (const port of [3000, TEST_PORT]) {
    try {
      const url = `http://localhost:${port}`;
      const res = await fetch(
        `${url}/api/github/issues?owner=facebook&repo=react`,
        { signal: AbortSignal.timeout(5000) }
      );
      if (res.ok) {
        activeBaseUrl = url;
        console.log(`    ${DIM}Dev server already running at ${url}${RESET}`);
        return;
      }
    } catch {
      // not running or wrong app on this port
    }
  }

  console.log(`    ${DIM}Starting Next.js dev server...${RESET}`);
  devServer = spawn("npx", ["next", "dev", "--port", String(TEST_PORT)], {
    cwd: ROOT,
    stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env },
  });
  weStartedServer = true;

  devServer.stdout?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    if (text.includes("Ready")) {
      console.log(`    ${DIM}Dev server ready${RESET}`);
    }
  });

  devServer.stderr?.on("data", (chunk: Buffer) => {
    const text = chunk.toString();
    // Suppress noisy webpack warnings, only show errors
    if (text.toLowerCase().includes("error")) {
      console.log(`    ${RED}Server stderr: ${text.trim()}${RESET}`);
    }
  });

  activeBaseUrl = BASE_URL;
  await waitForServer(BASE_URL);
}

function killDevServer() {
  if (devServer && weStartedServer) {
    console.log(`  ${DIM}Killing dev server...${RESET}`);
    devServer.kill("SIGTERM");
    devServer = null;
  }
}

// Session created via our /api/devin/scope route (needs cleanup)
let routeSessionId = "";

async function test5_apiRoutes() {
  if (!devinAuthOk || !githubAuthOk) {
    skipTest("5 — API route validation", "Auth failed in earlier tests");
    return;
  }

  await ensureDevServer();

  // --- 5a: GET /api/github/issues ---
  console.log(`    ${DIM}Testing GET /api/github/issues...${RESET}`);
  const issuesRes = await fetch(
    `${activeBaseUrl}/api/github/issues?owner=facebook&repo=react`
  );
  assert(issuesRes.ok, `Issues route failed: HTTP ${issuesRes.status}`);

  const issues = await issuesRes.json();
  assert(Array.isArray(issues), "Issues response should be an array");
  assert(issues.length > 0, "Expected at least 1 issue");
  assert(typeof issues[0].number === "number", "Issue should have number");
  assert(typeof issues[0].title === "string", "Issue should have title");
  console.log(`    ${DIM}GET /api/github/issues → ${issues.length} issues ✓${RESET}`);

  // --- 5b: POST /api/devin/scope ---
  console.log(`    ${DIM}Testing POST /api/devin/scope...${RESET}`);
  const scopeRes = await fetch(`${activeBaseUrl}/api/devin/scope`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      issueTitle: "Integration test issue",
      issueBody: "This is a test. Do nothing.",
      issueNumber: 99999,
      repo: "test/integration-test",
      acuLimit: 1,
    }),
  });
  if (!scopeRes.ok) {
    throw new Error(`Scope route failed: HTTP ${scopeRes.status} — ${await scopeRes.text()}`);
  }

  const scopeBody = await scopeRes.json();
  assert(typeof scopeBody.sessionId === "string", "Missing sessionId in scope response");
  assert(typeof scopeBody.sessionUrl === "string", "Missing sessionUrl in scope response");
  routeSessionId = scopeBody.sessionId;
  console.log(`    ${DIM}POST /api/devin/scope → sessionId: ${routeSessionId} ✓${RESET}`);

  // Immediately terminate the scope session to save ACUs
  console.log(`    ${DIM}Terminating scope session...${RESET}`);
  await fetch(`${DEVIN_API}/sessions/${routeSessionId}`, {
    method: "DELETE",
    headers: devinHeaders(),
  });

  // --- 5c: GET /api/devin/status (use session from Test 3) ---
  if (testSessionId) {
    console.log(`    ${DIM}Testing GET /api/devin/status...${RESET}`);
    const statusRes = await fetch(
      `${activeBaseUrl}/api/devin/status?sessionId=${testSessionId}`
    );
    assert(statusRes.ok, `Status route failed: HTTP ${statusRes.status}`);

    const statusBody = await statusRes.json();
    console.log(`    ${DIM}Status route response keys: ${Object.keys(statusBody).join(", ")}${RESET}`);
    assert("statusEnum" in statusBody, "statusEnum field should be present");
    assert(typeof statusBody.isTerminal === "boolean", "Missing isTerminal");
    assert(typeof statusBody.status === "string", "Missing status");
    assert(statusBody.sessionId === testSessionId, "sessionId mismatch");
    console.log(
      `    ${DIM}GET /api/devin/status → statusEnum: ${statusBody.statusEnum}, isTerminal: ${statusBody.isTerminal} ✓${RESET}`
    );
  } else {
    console.log(`    ${YELLOW}Skipping status route test (no session from Test 3)${RESET}`);
  }
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function printReport() {
  console.log("\n" + "=".repeat(60));
  console.log("  INTEGRATION TEST REPORT");
  console.log("=".repeat(60));

  const maxName = Math.max(...results.map((r) => r.name.length));

  for (const r of results) {
    const icon = r.skipped ? `${YELLOW}○` : r.passed ? `${GREEN}✓` : `${RED}✗`;
    const status = r.skipped ? "SKIP" : r.passed ? "PASS" : "FAIL";
    const pad = " ".repeat(maxName - r.name.length + 2);
    console.log(`  ${icon} ${r.name}${pad}${status}  ${DIM}${r.durationMs}ms${RESET}`);
    if (r.error && !r.skipped) {
      console.log(`    ${RED}→ ${r.error}${RESET}`);
    }
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;

  console.log("\n" + "-".repeat(60));
  console.log(
    `  ${GREEN}${passed} passed${RESET}  ${failed > 0 ? RED : DIM}${failed} failed${RESET}  ${DIM}${skipped} skipped${RESET}`
  );

  // ACU estimate
  const acuSessions = [testSessionId, routeSessionId].filter(Boolean).length;
  const estimatedAcu = acuSessions * 0.1;
  console.log(`  ${DIM}Estimated ACU consumption: ~${estimatedAcu.toFixed(1)} (${acuSessions} session(s))${RESET}`);
  console.log("=".repeat(60) + "\n");

  return failed;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("\n🧪 Devin API Integration Tests\n");

  // Preflight
  if (!DEVIN_KEY) console.log(`  ${RED}⚠ DEVIN_API_KEY not set${RESET}`);
  if (!GH_TOKEN) console.log(`  ${RED}⚠ GITHUB_TOKEN not set${RESET}`);
  if (!DEVIN_KEY && !GH_TOKEN) {
    console.log(`\n  ${RED}Both keys missing. Set them in .env and retry.${RESET}\n`);
    process.exit(1);
  }

  console.log("─── Test 1: Devin API Key ───");
  await runTest("1 — Devin API key validation", test1_devinAuth);

  console.log("─── Test 2: GitHub Token ───");
  await runTest("2 — GitHub token validation", test2_githubAuth);

  console.log("─── Test 3: Session Lifecycle ───");
  if (devinAuthOk) {
    await runTest("3 — Session lifecycle (create/get/delete)", test3_sessionLifecycle);
  } else {
    skipTest("3 — Session lifecycle", "Devin auth failed");
  }

  console.log("─── Test 4: Status Mapping ───");
  await runTest("4 — Status mapping verification", test4_statusMapping);

  console.log("─── Test 5: API Routes ───");
  if (devinAuthOk && githubAuthOk) {
    await runTest("5 — API route validation", test5_apiRoutes);
  } else {
    skipTest("5 — API route validation", "Auth failed in earlier tests");
  }

  killDevServer();

  const failCount = printReport();
  process.exit(failCount > 0 ? 1 : 0);
}

// Cleanup on unexpected exit
process.on("SIGINT", () => {
  killDevServer();
  process.exit(130);
});
process.on("SIGTERM", () => {
  killDevServer();
  process.exit(143);
});
process.on("uncaughtException", (err) => {
  console.error(`\n${RED}Uncaught exception: ${err.message}${RESET}`);
  killDevServer();
  process.exit(1);
});

main();
