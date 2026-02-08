import { DashboardIssue } from "./types";

export function getDemoIssues(): DashboardIssue[] {
  return [
    // Issue #14 — scoped + green (Ready)
    {
      number: 14,
      title: "Fix health endpoint 500 error",
      body: "The health endpoint returns 500 when the database connection is unavailable, causing false positive alerts in our monitoring system.",
      labels: [{ name: "bug", color: "d73a4a" }],
      created_at: "2026-02-03T10:00:00Z",
      updated_at: "2026-02-05T14:30:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/14",
      status: "scoped",
      confidence: "green",
      scoping: {
        confidence: "green",
        confidence_reason:
          "Clear bug with existing test coverage and isolated code path",
        current_behavior:
          "The health endpoint returns 500 when the database connection is unavailable, causing false positive alerts.",
        requested_fix:
          "Return 200 with degraded status when database is unavailable. Include status details in response body.",
        files_to_modify: [
          "src/routes/health.ts",
          "src/services/database.ts",
          "tests/health.test.ts",
        ],
        tests_needed:
          "Add test for unreachable DB scenario, verify degraded response format",
        action_plan: [
          "Update error handler in health.ts",
          "Add try-catch for DB connection",
          "Add test for unreachable DB scenario",
        ],
        risks: [
          "Downstream services may depend on 500 status for alerting",
        ],
        open_questions: [],
      },
      files_info: [
        { path: "src/routes/health.ts", lines: 45 },
        { path: "src/services/database.ts", lines: 120 },
        { path: "tests/health.test.ts", lines: 85 },
      ],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [],
      scoping_session: null,
      fix_session: null,
      scoped_at: "2026-02-05T14:30:00Z",
      fix_started_at: null,
      completed_at: null,
    },

    // Issue #17 — scoped + green (Ready, different issue)
    {
      number: 17,
      title: "Add input validation to POST /users",
      body: "POST /users endpoint accepts any input without validation. Need to validate email format and required fields.",
      labels: [
        { name: "enhancement", color: "a2eeef" },
        { name: "security", color: "e11d48" },
      ],
      created_at: "2026-02-01T08:00:00Z",
      updated_at: "2026-02-04T16:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/17",
      status: "scoped",
      confidence: "green",
      scoping: {
        confidence: "green",
        confidence_reason:
          "Well-defined requirements with clear validation patterns in codebase",
        current_behavior:
          "POST /users accepts any JSON body without validation. Invalid emails and missing required fields are stored in the database.",
        requested_fix:
          "Add Zod schema validation for email, name, and role fields. Return 400 with field-level errors for invalid input.",
        files_to_modify: ["src/routes/users.ts", "src/schemas/user.ts"],
        tests_needed: "Add validation test cases for each field",
        action_plan: [
          "Create Zod schema in user.ts",
          "Add validation middleware to POST handler",
          "Add error response formatting",
        ],
        risks: [],
        open_questions: [],
      },
      files_info: [
        { path: "src/routes/users.ts", lines: 78 },
        { path: "src/schemas/user.ts", lines: null },
      ],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [],
      scoping_session: null,
      fix_session: null,
      scoped_at: "2026-02-04T16:00:00Z",
      fix_started_at: null,
      completed_at: null,
    },

    // Issue #21 — scoped + yellow (Needs Input)
    {
      number: 21,
      title: "Migrate database to PostgreSQL",
      body: "We need to migrate from SQLite to PostgreSQL for production. This involves schema changes, connection pooling, and migration scripts.",
      labels: [{ name: "infrastructure", color: "0075ca" }],
      created_at: "2026-01-28T12:00:00Z",
      updated_at: "2026-02-03T09:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/21",
      status: "scoped",
      confidence: "yellow",
      scoping: {
        confidence: "yellow",
        confidence_reason:
          "Devin has questions about input validation requirements",
        current_behavior:
          "The health endpoint returns 500 when the database connection is unavailable, causing false positive alerts.",
        requested_fix:
          "Return 200 with degraded status when database is unavailable. Include status details in response body.",
        files_to_modify: [
          "src/routes/health.ts",
          "src/services/database.ts",
          "tests/health.test.ts",
        ],
        tests_needed: "Migration tests and rollback verification",
        action_plan: [
          "Update error handler in health.ts",
          "Add try-catch for DB connection",
          "Add test for unreachable DB scenario",
        ],
        risks: ["Data loss if migration script fails mid-way"],
        open_questions: [
          "What validation rules should apply to the email field \u2014 format check only, or also domain verification?",
          "Should invalid requests return 400 with field-level errors, or a generic validation error?",
        ],
      },
      files_info: [
        { path: "src/routes/health.ts", lines: 45 },
        { path: "src/services/database.ts", lines: 120 },
        { path: "tests/health.test.ts", lines: 85 },
      ],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [],
      scoping_session: null,
      fix_session: null,
      scoped_at: "2026-02-03T09:00:00Z",
      fix_started_at: null,
      completed_at: null,
    },

    // Issue #9 — scoped + yellow (Needs Input)
    {
      number: 9,
      title: "Add rate limiting middleware",
      body: "We need rate limiting to prevent API abuse. Should support per-IP and per-user limits with configurable windows.",
      labels: [{ name: "enhancement", color: "a2eeef" }],
      created_at: "2026-01-25T15:00:00Z",
      updated_at: "2026-02-02T11:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/9",
      status: "scoped",
      confidence: "yellow",
      scoping: {
        confidence: "yellow",
        confidence_reason:
          "Need clarification on rate limit thresholds and storage backend",
        current_behavior: "No rate limiting exists on any endpoints.",
        requested_fix:
          "Add configurable rate limiting middleware with Redis or in-memory storage.",
        files_to_modify: [
          "src/middleware/rateLimit.ts",
          "src/config.ts",
          "src/index.ts",
          "tests/rateLimit.test.ts",
        ],
        tests_needed: "Rate limit enforcement and bypass tests",
        action_plan: [
          "Create rate limit middleware",
          "Add configuration for thresholds",
          "Wire middleware into Express app",
          "Add tests",
        ],
        risks: ["Could block legitimate users if thresholds are too low"],
        open_questions: [
          "What are the desired rate limits (requests per minute)?",
          "Should rate limiting use Redis or in-memory storage?",
        ],
      },
      files_info: [
        { path: "src/middleware/rateLimit.ts", lines: null },
        { path: "src/config.ts", lines: 35 },
        { path: "src/index.ts", lines: 89 },
        { path: "tests/rateLimit.test.ts", lines: null },
      ],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [],
      scoping_session: null,
      fix_session: null,
      scoped_at: "2026-02-02T11:00:00Z",
      fix_started_at: null,
      completed_at: null,
    },

    // Issue #5 — scoped + red (Unclear)
    {
      number: 5,
      title: "Optimize database queries",
      body: "Database queries are slow. Need optimization.",
      labels: [{ name: "performance", color: "fbca04" }],
      created_at: "2026-01-20T09:00:00Z",
      updated_at: "2026-02-01T14:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/5",
      status: "scoped",
      confidence: "red",
      scoping: {
        confidence: "red",
        confidence_reason:
          "Vague issue with no reproduction steps, metrics, or clear scope",
        current_behavior: "Not clearly described in the issue",
        requested_fix:
          "Unable to determine without more information",
        files_to_modify: [],
        tests_needed: "Unable to determine",
        action_plan: [
          "Insufficient information to create a plan",
        ],
        risks: [],
        open_questions: [
          "What specific behavior is expected after the migration?",
          "Which tables need to be migrated and what are the schema constraints?",
        ],
      },
      files_info: [],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [],
      scoping_session: null,
      fix_session: null,
      scoped_at: "2026-02-01T14:00:00Z",
      fix_started_at: null,
      completed_at: null,
    },

    // Issue #12 — scoped + red (Unclear)
    {
      number: 12,
      title: "Improve error handling across services",
      body: "Error handling is inconsistent. Some services throw, others return null. Need a unified approach.",
      labels: [{ name: "refactor", color: "d4c5f9" }],
      created_at: "2026-01-22T11:00:00Z",
      updated_at: "2026-02-01T10:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/12",
      status: "scoped",
      confidence: "red",
      scoping: {
        confidence: "red",
        confidence_reason:
          "Scope is too broad — touches 15+ files without clear priority",
        current_behavior:
          "Inconsistent error handling across services — some throw, some return null.",
        requested_fix:
          "Unable to determine without defining error handling strategy first.",
        files_to_modify: [],
        tests_needed: "Unable to determine",
        action_plan: [
          "Insufficient information — need error handling strategy defined first",
        ],
        risks: [
          "Breaking changes across all services if approach changes",
        ],
        open_questions: [
          "Should services use Result types, throw exceptions, or return error objects?",
          "Which services are highest priority to fix first?",
        ],
      },
      files_info: [],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [],
      scoping_session: null,
      fix_session: null,
      scoped_at: "2026-02-01T10:00:00Z",
      fix_started_at: null,
      completed_at: null,
    },

    // Issue #7 — fixing (in progress)
    {
      number: 7,
      title: "Fix CORS configuration for API",
      body: "CORS headers are not set correctly, causing cross-origin requests to fail from the frontend.",
      labels: [{ name: "bug", color: "d73a4a" }],
      created_at: "2026-02-04T10:00:00Z",
      updated_at: "2026-02-07T08:30:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/7",
      status: "fixing",
      confidence: "green",
      scoping: {
        confidence: "green",
        confidence_reason: "Clear bug with straightforward fix",
        current_behavior:
          "CORS headers missing on API responses, blocking frontend requests.",
        requested_fix:
          "Add proper CORS middleware with configurable allowed origins.",
        files_to_modify: [
          "src/middleware/cors.ts",
          "src/index.ts",
          "tests/cors.test.ts",
        ],
        tests_needed: "CORS header verification tests",
        action_plan: [
          "Update error handler in health.ts",
          "Add try-catch for DB connection",
          "Add test for unreachable DB scenario",
        ],
        risks: [],
        open_questions: [],
      },
      files_info: [
        { path: "src/middleware/cors.ts", lines: 25 },
        { path: "src/index.ts", lines: 89 },
        { path: "tests/cors.test.ts", lines: null },
      ],
      fix_progress: {
        status: "in_progress",
        current_step: "Add try-catch for DB connection",
        completed_steps: ["Update error handler in health.ts"],
        pr_url: null,
        blockers: [],
      },
      blocker: null,
      pr: null,
      steps: [
        { label: "Update error handler in health.ts", status: "done" },
        {
          label: "Add try-catch for DB connection",
          status: "in_progress",
        },
        {
          label: "Add test for unreachable DB scenario",
          status: "pending",
        },
      ],
      scoping_session: {
        session_id: "demo-scope-7",
        session_url: "https://app.devin.ai/sessions/demo-scope-7",
        started_at: "2026-02-06T10:00:00Z",
      },
      fix_session: {
        session_id: "demo-fix-7",
        session_url: "https://app.devin.ai/sessions/demo-fix-7",
        started_at: "2026-02-07T08:00:00Z",
      },
      scoped_at: "2026-02-06T10:15:00Z",
      fix_started_at: "2026-02-07T08:00:00Z",
      completed_at: null,
    },

    // Issue #8 — done / pr_open
    {
      number: 8,
      title: "Fix memory leak in WebSocket handler",
      body: "WebSocket connections are not being cleaned up properly, causing memory to grow over time.",
      labels: [{ name: "bug", color: "d73a4a" }],
      created_at: "2026-02-02T09:00:00Z",
      updated_at: "2026-02-06T16:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/8",
      status: "done",
      confidence: "green",
      scoping: {
        confidence: "green",
        confidence_reason: "Clear memory leak with identifiable source",
        current_behavior:
          "WebSocket handler doesn't clean up event listeners on disconnect, causing memory growth.",
        requested_fix:
          "Add proper cleanup in disconnect handler and implement connection pool limits.",
        files_to_modify: [
          "src/routes/health.ts",
          "src/services/database.ts",
          "tests/health.test.ts",
        ],
        tests_needed: "Memory leak regression test",
        action_plan: [
          "Update error handler in health.ts",
          "Add try-catch for DB connection",
          "Add test for unreachable DB scenario",
        ],
        risks: [],
        open_questions: [],
      },
      files_info: [
        { path: "src/routes/health.ts", lines: 45 },
        { path: "src/services/database.ts", lines: 120 },
        { path: "tests/health.test.ts", lines: 85 },
      ],
      fix_progress: {
        status: "completed",
        current_step: "Add test for unreachable DB scenario",
        completed_steps: [
          "Update error handler in health.ts",
          "Add try-catch for DB connection",
          "Add test for unreachable DB scenario",
        ],
        pr_url:
          "https://github.com/natan/devin-issue-pilot-demo/pull/42",
        blockers: [],
      },
      blocker: null,
      pr: {
        url: "https://github.com/natan/devin-issue-pilot-demo/pull/42",
        number: 42,
        title:
          "Fix: Return degraded status from /health when DB is unavailable",
        branch: "feature/fix-health-endpoint",
        files_changed: [
          {
            path: "src/routes/health.ts",
            additions: 12,
            deletions: 4,
            is_new: false,
            diff_lines: [
              { type: "remove", content: "  return res.status(500).json({ error: 'DB unreachable' });" },
              { type: "add", content: "  try {" },
              { type: "add", content: "    await db.healthCheck();" },
              { type: "add", content: "    return res.json({ status: 'healthy', db: 'connected' });" },
              { type: "add", content: "  } catch (err) {" },
              { type: "add", content: "    return res.json({" },
              { type: "add", content: "      status: 'degraded'," },
              { type: "add", content: "      db: 'unavailable'," },
              { type: "add", content: "      error: err.message," },
              { type: "add", content: "    });" },
              { type: "add", content: "  }" },
            ],
          },
          {
            path: "src/services/database.ts",
            additions: 8,
            deletions: 2,
            is_new: false,
            diff_lines: [
              { type: "context", content: "export class Database {" },
              { type: "add", content: "  async healthCheck(): Promise<boolean> {" },
              { type: "add", content: "    const client = await this.pool.connect();" },
              { type: "add", content: "    try {" },
              { type: "add", content: "      await client.query('SELECT 1');" },
              { type: "add", content: "      return true;" },
              { type: "add", content: "    } finally {" },
              { type: "add", content: "      client.release();" },
              { type: "add", content: "    }" },
              { type: "add", content: "  }" },
              { type: "context", content: "}" },
            ],
          },
          {
            path: "tests/health.test.ts",
            additions: 24,
            deletions: 0,
            is_new: true,
            diff_lines: [
              { type: "add", content: "import { describe, it, expect } from 'vitest';" },
              { type: "add", content: "import { createApp } from '../src/app';" },
              { type: "add", content: "" },
              { type: "add", content: "describe('GET /health', () => {" },
              { type: "add", content: "  it('returns degraded when DB is down', async () => {" },
              { type: "add", content: "    const app = createApp({ dbUrl: 'invalid' });" },
              { type: "add", content: "    const res = await app.inject({ url: '/health' });" },
              { type: "add", content: "    expect(res.statusCode).toBe(200);" },
              { type: "add", content: "    expect(res.json().status).toBe('degraded');" },
              { type: "add", content: "  });" },
              { type: "add", content: "});" },
            ],
          },
        ],
      },
      steps: [
        { label: "Update error handler in health.ts", status: "done" },
        { label: "Add try-catch for DB connection", status: "done" },
        {
          label: "Add test for unreachable DB scenario",
          status: "done",
        },
      ],
      scoping_session: {
        session_id: "demo-scope-8",
        session_url: "https://app.devin.ai/sessions/demo-scope-8",
        started_at: "2026-02-05T10:00:00Z",
      },
      fix_session: {
        session_id: "demo-fix-8",
        session_url: "https://app.devin.ai/sessions/demo-fix-8",
        started_at: "2026-02-06T14:00:00Z",
        updated_at: "2026-02-06T14:06:14Z",
      },
      scoped_at: "2026-02-05T10:10:00Z",
      fix_started_at: "2026-02-06T14:00:00Z",
      completed_at: "2026-02-06T16:00:00Z",
    },

    // Issue #3 — blocked
    {
      number: 3,
      title: "Add OAuth2 login flow",
      body: "Implement OAuth2 login with GitHub as the identity provider. Users should be redirected to GitHub for authentication.",
      labels: [{ name: "feature", color: "0e8a16" }],
      created_at: "2026-01-30T14:00:00Z",
      updated_at: "2026-02-07T09:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/3",
      status: "blocked",
      confidence: "green",
      scoping: {
        confidence: "green",
        confidence_reason: "Well-defined OAuth2 flow with clear implementation path",
        current_behavior:
          "No authentication exists. All endpoints are publicly accessible.",
        requested_fix:
          "Add GitHub OAuth2 login with session management and protected routes.",
        files_to_modify: [
          "src/routes/auth.ts",
          "src/middleware/auth.ts",
          "src/config.ts",
        ],
        tests_needed: "OAuth flow integration tests",
        action_plan: [
          "Update error handler in health.ts",
          "Add try-catch for DB connection",
          "Add test for unreachable DB scenario",
        ],
        risks: [],
        open_questions: [],
      },
      files_info: [
        { path: "src/routes/auth.ts", lines: null },
        { path: "src/middleware/auth.ts", lines: null },
        { path: "src/config.ts", lines: 35 },
      ],
      fix_progress: {
        status: "blocked",
        current_step: "Add try-catch for DB connection",
        completed_steps: ["Update error handler in health.ts"],
        pr_url: null,
        blockers: [
          "The database.ts file uses a custom connection pool wrapper (DBPool) that doesn't expose a standard health check method.",
        ],
      },
      blocker: {
        what_happened:
          "The database.ts file uses a custom connection pool wrapper (DBPool) that doesn\u2019t expose a standard health check method. The try-catch approach won\u2019t work without modifying the pool interface.",
        suggestion:
          "Add a .isHealthy() method to the DBPool class. This would require modifying src/lib/pool.ts \u2014 a new file not in the original plan.",
      },
      pr: null,
      steps: [
        { label: "Update error handler in health.ts", status: "done" },
        {
          label: "Add try-catch for DB connection",
          status: "blocked",
        },
        {
          label: "Add test for unreachable DB scenario",
          status: "pending",
        },
      ],
      scoping_session: {
        session_id: "demo-scope-3",
        session_url: "https://app.devin.ai/sessions/demo-scope-3",
        started_at: "2026-02-06T08:00:00Z",
      },
      fix_session: {
        session_id: "demo-fix-3",
        session_url: "https://app.devin.ai/sessions/demo-fix-3",
        started_at: "2026-02-07T08:30:00Z",
      },
      scoped_at: "2026-02-06T08:10:00Z",
      fix_started_at: "2026-02-07T08:30:00Z",
      completed_at: null,
    },

    // Issue #10 — timed_out
    {
      number: 10,
      title: "Implement webhook delivery system",
      body: "Build a webhook delivery system with retry logic and delivery tracking.",
      labels: [{ name: "feature", color: "0e8a16" }],
      created_at: "2026-01-29T10:00:00Z",
      updated_at: "2026-02-06T12:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/10",
      status: "timed_out",
      confidence: "green",
      scoping: {
        confidence: "green",
        confidence_reason: "Clear requirements but large scope",
        current_behavior: "No webhook system exists.",
        requested_fix:
          "Implement webhook registration, delivery queue, retry logic, and delivery logs.",
        files_to_modify: [
          "src/services/webhooks.ts",
          "src/routes/webhooks.ts",
          "src/queue/delivery.ts",
        ],
        tests_needed: "Webhook delivery and retry tests",
        action_plan: [
          "Create webhook registration endpoint",
          "Build delivery queue",
          "Add retry logic with exponential backoff",
        ],
        risks: ["Complex queue system may be overkill"],
        open_questions: [],
      },
      files_info: [
        { path: "src/services/webhooks.ts", lines: null },
        { path: "src/routes/webhooks.ts", lines: null },
        { path: "src/queue/delivery.ts", lines: null },
      ],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [
        { label: "Create webhook registration endpoint", status: "done" },
        { label: "Build delivery queue", status: "pending" },
        {
          label: "Add retry logic with exponential backoff",
          status: "pending",
        },
      ],
      scoping_session: null,
      fix_session: {
        session_id: "demo-fix-10",
        session_url: "https://app.devin.ai/sessions/demo-fix-10",
        started_at: "2026-02-06T11:30:00Z",
        updated_at: "2026-02-06T12:00:00Z",
      },
      scoped_at: "2026-02-05T10:00:00Z",
      fix_started_at: "2026-02-06T11:30:00Z",
      completed_at: null,
    },

    // Issue #11 — aborted
    {
      number: 11,
      title: "Add GraphQL API layer",
      body: "Add a GraphQL layer on top of the existing REST API for more flexible client queries.",
      labels: [{ name: "feature", color: "0e8a16" }],
      created_at: "2026-01-27T09:00:00Z",
      updated_at: "2026-02-05T15:00:00Z",
      github_url: "https://github.com/natan/devin-issue-pilot-demo/issues/11",
      status: "aborted",
      confidence: "green",
      scoping: {
        confidence: "green",
        confidence_reason: "Clear pattern but scope was too large",
        current_behavior: "REST-only API.",
        requested_fix: "Add GraphQL schema and resolvers alongside REST.",
        files_to_modify: [
          "src/graphql/schema.ts",
          "src/graphql/resolvers.ts",
          "src/index.ts",
        ],
        tests_needed: "GraphQL query and mutation tests",
        action_plan: [
          "Set up Apollo Server",
          "Define GraphQL schema",
          "Implement resolvers",
        ],
        risks: ["Maintaining two API surfaces increases complexity"],
        open_questions: [],
      },
      files_info: [
        { path: "src/graphql/schema.ts", lines: null },
        { path: "src/graphql/resolvers.ts", lines: null },
      ],
      fix_progress: null,
      blocker: null,
      pr: null,
      steps: [
        { label: "Set up Apollo Server", status: "done" },
        { label: "Define GraphQL schema", status: "done" },
        { label: "Implement resolvers", status: "pending" },
      ],
      scoping_session: null,
      fix_session: {
        session_id: "demo-fix-11",
        session_url: "https://app.devin.ai/sessions/demo-fix-11",
        started_at: "2026-02-05T14:00:00Z",
        updated_at: "2026-02-05T14:45:00Z",
      },
      scoped_at: "2026-02-04T09:00:00Z",
      fix_started_at: "2026-02-05T14:00:00Z",
      completed_at: null,
    },
  ];
}
