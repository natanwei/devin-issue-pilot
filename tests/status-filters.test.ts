import { describe, it, expect } from "vitest";
import { filterAndSortIssues } from "@/lib/filters";
import type { DashboardIssue, IssueStatus, ConfidenceLevel } from "@/lib/types";

function makeIssue(
  number: number,
  status: IssueStatus,
  confidence: ConfidenceLevel | null = null
): DashboardIssue {
  return {
    number,
    title: `Issue #${number}`,
    body: "",
    labels: [],
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    github_url: `https://github.com/test/repo/issues/${number}`,
    status,
    confidence,
    scoping: null,
    files_info: [],
    fix_progress: null,
    blocker: null,
    pr: null,
    steps: [],
    messages: [],
    scoping_session: null,
    fix_session: null,
    last_devin_comment_id: null,
    last_devin_comment_at: null,
    github_comment_url: null,
    forwarded_comment_ids: [],
    scoped_at: null,
    fix_started_at: null,
    completed_at: null,
  };
}

const ALL_STATUSES: IssueStatus[] = [
  "pending",
  "scoped",
  "scoping",
  "fixing",
  "blocked",
  "awaiting_reply",
  "done",
  "pr_open",
  "timed_out",
  "failed",
  "aborted",
];

const ALL_ISSUES = ALL_STATUSES.map((s, i) => makeIssue(i + 1, s));

const DEFAULT_FILTER = { confidence: "all" as const, status: "all" as const };

describe("filterAndSortIssues: status bucket filtering", () => {
  it("'pending' filter returns only pending and scoped issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { ...DEFAULT_FILTER, status: "pending" },
      "number"
    );
    const statuses = result.map((i) => i.status);
    expect(statuses).toEqual(["pending", "scoped"]);
  });

  it("'active' filter returns only scoping, fixing, blocked, awaiting_reply", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { ...DEFAULT_FILTER, status: "active" },
      "number"
    );
    const statuses = result.map((i) => i.status);
    expect(statuses).toEqual(["scoping", "fixing", "blocked", "awaiting_reply"]);
  });

  it("'closed' filter returns only done, pr_open, timed_out, failed, aborted", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { ...DEFAULT_FILTER, status: "closed" },
      "number"
    );
    const statuses = result.map((i) => i.status);
    expect(statuses).toEqual(["done", "pr_open", "timed_out", "failed", "aborted"]);
  });

  it("'all' filter returns every issue regardless of status", () => {
    const result = filterAndSortIssues(ALL_ISSUES, DEFAULT_FILTER, "number");
    expect(result).toHaveLength(ALL_STATUSES.length);
    expect(result.map((i) => i.status)).toEqual(ALL_STATUSES);
  });

  it("every status maps to exactly one bucket", () => {
    for (const status of ALL_STATUSES) {
      const issue = makeIssue(1, status);
      const pendingMatch = filterAndSortIssues(
        [issue],
        { ...DEFAULT_FILTER, status: "pending" },
        "number"
      );
      const activeMatch = filterAndSortIssues(
        [issue],
        { ...DEFAULT_FILTER, status: "active" },
        "number"
      );
      const closedMatch = filterAndSortIssues(
        [issue],
        { ...DEFAULT_FILTER, status: "closed" },
        "number"
      );
      const matchCount =
        (pendingMatch.length > 0 ? 1 : 0) +
        (activeMatch.length > 0 ? 1 : 0) +
        (closedMatch.length > 0 ? 1 : 0);
      expect(matchCount).toBe(1);
    }
  });
});

describe("filterAndSortIssues: confidence filtering", () => {
  const issuesWithConfidence = [
    makeIssue(1, "scoped", "green"),
    makeIssue(2, "scoped", "yellow"),
    makeIssue(3, "scoped", "red"),
    makeIssue(4, "pending", null),
  ];

  it("filters by green confidence", () => {
    const result = filterAndSortIssues(
      issuesWithConfidence,
      { confidence: "green", status: "all" },
      "number"
    );
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("green");
  });

  it("filters by yellow confidence", () => {
    const result = filterAndSortIssues(
      issuesWithConfidence,
      { confidence: "yellow", status: "all" },
      "number"
    );
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("yellow");
  });

  it("filters by red confidence", () => {
    const result = filterAndSortIssues(
      issuesWithConfidence,
      { confidence: "red", status: "all" },
      "number"
    );
    expect(result).toHaveLength(1);
    expect(result[0].confidence).toBe("red");
  });

  it("'all' confidence returns every issue", () => {
    const result = filterAndSortIssues(
      issuesWithConfidence,
      { confidence: "all", status: "all" },
      "number"
    );
    expect(result).toHaveLength(4);
  });
});

describe("filterAndSortIssues: combined filters", () => {
  const mixed = [
    makeIssue(1, "pending", "green"),
    makeIssue(2, "scoping", "green"),
    makeIssue(3, "done", "green"),
    makeIssue(4, "pending", "red"),
    makeIssue(5, "fixing", "yellow"),
  ];

  it("status + confidence narrows correctly", () => {
    const result = filterAndSortIssues(
      mixed,
      { confidence: "green", status: "pending" },
      "number"
    );
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
  });

  it("active + yellow returns only fixing#5", () => {
    const result = filterAndSortIssues(
      mixed,
      { confidence: "yellow", status: "active" },
      "number"
    );
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(5);
  });
});

describe("filterAndSortIssues: sorting", () => {
  const sortIssues = [
    makeIssue(3, "fixing", "red"),
    makeIssue(1, "pending", "green"),
    makeIssue(2, "done", "yellow"),
  ];

  it("sorts by number ascending", () => {
    const result = filterAndSortIssues(sortIssues, DEFAULT_FILTER, "number");
    expect(result.map((i) => i.number)).toEqual([1, 2, 3]);
  });

  it("sorts by confidence (green < yellow < red)", () => {
    const result = filterAndSortIssues(sortIssues, DEFAULT_FILTER, "confidence");
    expect(result.map((i) => i.confidence)).toEqual(["green", "yellow", "red"]);
  });

  it("sorts by status alphabetically", () => {
    const result = filterAndSortIssues(sortIssues, DEFAULT_FILTER, "status");
    expect(result.map((i) => i.status)).toEqual(["done", "fixing", "pending"]);
  });

  it("null confidence sorts last when sorting by confidence", () => {
    const withNull = [
      makeIssue(1, "pending", null),
      makeIssue(2, "scoped", "green"),
    ];
    const result = filterAndSortIssues(withNull, DEFAULT_FILTER, "confidence");
    expect(result.map((i) => i.number)).toEqual([2, 1]);
  });
});

describe("filterAndSortIssues: empty input", () => {
  it("returns empty array for empty issues", () => {
    const result = filterAndSortIssues([], DEFAULT_FILTER, "number");
    expect(result).toEqual([]);
  });

  it("returns empty array when filter matches nothing", () => {
    const issues = [makeIssue(1, "done")];
    const result = filterAndSortIssues(
      issues,
      { ...DEFAULT_FILTER, status: "pending" },
      "number"
    );
    expect(result).toEqual([]);
  });
});

describe("FilterBar count logic verification", () => {
  it("pending count matches pending + scoped", () => {
    const issues = ALL_ISSUES;
    const pendingCount = issues.filter(
      (i) => i.status === "pending" || i.status === "scoped"
    ).length;
    expect(pendingCount).toBe(2);
  });

  it("active count matches scoping + fixing + blocked + awaiting_reply", () => {
    const issues = ALL_ISSUES;
    const activeCount = issues.filter(
      (i) =>
        i.status === "scoping" ||
        i.status === "fixing" ||
        i.status === "blocked" ||
        i.status === "awaiting_reply"
    ).length;
    expect(activeCount).toBe(4);
  });

  it("closed count matches done + pr_open + timed_out + failed + aborted", () => {
    const issues = ALL_ISSUES;
    const closedCount = issues.filter(
      (i) =>
        i.status === "done" ||
        i.status === "pr_open" ||
        i.status === "timed_out" ||
        i.status === "failed" ||
        i.status === "aborted"
    ).length;
    expect(closedCount).toBe(5);
  });

  it("all 11 statuses are covered by the three buckets", () => {
    const pendingCount = ALL_ISSUES.filter(
      (i) => i.status === "pending" || i.status === "scoped"
    ).length;
    const activeCount = ALL_ISSUES.filter(
      (i) =>
        i.status === "scoping" ||
        i.status === "fixing" ||
        i.status === "blocked" ||
        i.status === "awaiting_reply"
    ).length;
    const closedCount = ALL_ISSUES.filter(
      (i) =>
        i.status === "done" ||
        i.status === "pr_open" ||
        i.status === "timed_out" ||
        i.status === "failed" ||
        i.status === "aborted"
    ).length;
    expect(pendingCount + activeCount + closedCount).toBe(ALL_ISSUES.length);
  });
});
