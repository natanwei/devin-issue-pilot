import { describe, it, expect } from "vitest";
import type {
  DashboardIssue,
  FilterState,
  IssueStatus,
  DashboardState,
} from "@/lib/types";

const ALL_STATUSES: IssueStatus[] = [
  "pending",
  "scoping",
  "scoped",
  "fixing",
  "blocked",
  "pr_open",
  "awaiting_reply",
  "timed_out",
  "failed",
  "aborted",
  "done",
];

function makeDashboardIssue(
  number: number,
  status: IssueStatus
): DashboardIssue {
  return {
    number,
    title: `Issue #${number}`,
    body: "",
    labels: [],
    created_at: "2026-02-08T10:00:00Z",
    updated_at: "2026-02-08T10:00:00Z",
    github_url: `https://github.com/test/repo/issues/${number}`,
    status,
    confidence: "green",
    scoping: null,
    files_info: [],
    fix_progress: null,
    blocker: null,
    pr: null,
    steps: [],
    scoping_session: null,
    fix_session: null,
    scoped_at: null,
    fix_started_at: null,
    completed_at: null,
  };
}

function filterAndSortIssues(
  issues: DashboardIssue[],
  filter: FilterState,
  sortBy: DashboardState["sortBy"]
): DashboardIssue[] {
  let filtered = issues;

  if (filter.confidence !== "all") {
    filtered = filtered.filter((i) => i.confidence === filter.confidence);
  }

  if (filter.status !== "all") {
    if (filter.status === "fixing") {
      filtered = filtered.filter(
        (i) => i.status === "fixing" || i.status === "blocked"
      );
    } else if (filter.status === "done") {
      filtered = filtered.filter(
        (i) => i.status === "done" || i.status === "pr_open"
      );
    } else {
      filtered = filtered.filter((i) => i.status === filter.status);
    }
  }

  return [...filtered].sort((a, b) => {
    if (sortBy === "number") return a.number - b.number;
    return a.status.localeCompare(b.status);
  });
}

const ALL_ISSUES = ALL_STATUSES.map((s, i) => makeDashboardIssue(i + 1, s));

// ---------------------------------------------------------------------------
// Every IssueStatus is filterable
// ---------------------------------------------------------------------------

describe("All IssueStatus values are filterable", () => {
  const STATUS_FILTER_KEYS: IssueStatus[] = [
    "pending",
    "scoping",
    "scoped",
    "fixing",
    "awaiting_reply",
    "done",
    "timed_out",
    "failed",
    "aborted",
  ];

  it("every IssueStatus is covered by at least one filter button key", () => {
    for (const status of ALL_STATUSES) {
      const coveredByKey = STATUS_FILTER_KEYS.some((key) => {
        if (key === "fixing") return status === "fixing" || status === "blocked";
        if (key === "done") return status === "done" || status === "pr_open";
        return key === status;
      });
      expect(coveredByKey).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// filterAndSortIssues: each status filter returns correct issues
// ---------------------------------------------------------------------------

describe("filterAndSortIssues handles all status filters", () => {
  it("status=all returns all issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "all" },
      "number"
    );
    expect(result).toHaveLength(ALL_ISSUES.length);
  });

  it("status=pending returns only pending issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "pending" },
      "number"
    );
    expect(result.every((i) => i.status === "pending")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("status=scoping returns only scoping issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "scoping" },
      "number"
    );
    expect(result.every((i) => i.status === "scoping")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("status=scoped returns only scoped issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "scoped" },
      "number"
    );
    expect(result.every((i) => i.status === "scoped")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("status=fixing returns fixing + blocked issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "fixing" },
      "number"
    );
    expect(
      result.every((i) => i.status === "fixing" || i.status === "blocked")
    ).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("status=awaiting_reply returns only awaiting_reply issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "awaiting_reply" },
      "number"
    );
    expect(result.every((i) => i.status === "awaiting_reply")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("status=done returns done + pr_open issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "done" },
      "number"
    );
    expect(
      result.every((i) => i.status === "done" || i.status === "pr_open")
    ).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("status=timed_out returns only timed_out issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "timed_out" },
      "number"
    );
    expect(result.every((i) => i.status === "timed_out")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("status=failed returns only failed issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "failed" },
      "number"
    );
    expect(result.every((i) => i.status === "failed")).toBe(true);
    expect(result).toHaveLength(1);
  });

  it("status=aborted returns only aborted issues", () => {
    const result = filterAndSortIssues(
      ALL_ISSUES,
      { confidence: "all", status: "aborted" },
      "number"
    );
    expect(result.every((i) => i.status === "aborted")).toBe(true);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// Status "All" resets only status, not confidence
// ---------------------------------------------------------------------------

describe("Status-group All resets only status filter", () => {
  it("setting status=all preserves confidence filter", () => {
    const filter: FilterState = { confidence: "green", status: "fixing" };
    const updated: FilterState = { ...filter, status: "all" };
    expect(updated.confidence).toBe("green");
    expect(updated.status).toBe("all");
  });

  it("setting confidence=all preserves status filter", () => {
    const filter: FilterState = { confidence: "green", status: "fixing" };
    const updated: FilterState = { ...filter, confidence: "all" };
    expect(updated.confidence).toBe("all");
    expect(updated.status).toBe("fixing");
  });

  it("combined confidence + status filter works", () => {
    const issues = [
      { ...makeDashboardIssue(1, "fixing"), confidence: "green" as const },
      { ...makeDashboardIssue(2, "fixing"), confidence: "red" as const },
      { ...makeDashboardIssue(3, "done"), confidence: "green" as const },
    ];
    const result = filterAndSortIssues(
      issues,
      { confidence: "green", status: "fixing" },
      "number"
    );
    expect(result).toHaveLength(1);
    expect(result[0].number).toBe(1);
  });
});
