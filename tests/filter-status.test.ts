import { describe, it, expect } from "vitest";
import { filterAndSortIssues, STATUS_GROUPS } from "@/lib/filters";
import type { DashboardIssue, FilterState, IssueStatus, StatusFilter } from "@/lib/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeIssue(overrides: Partial<DashboardIssue>): DashboardIssue {
  return {
    number: 1,
    title: "Test issue",
    body: "",
    labels: [],
    created_at: "2025-01-01T00:00:00Z",
    updated_at: "2025-01-01T00:00:00Z",
    github_url: "https://github.com/test/test/issues/1",
    status: "pending",
    confidence: null,
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
    ...overrides,
  };
}

/** Create one issue per status for comprehensive testing. */
function makeAllStatusIssues(): DashboardIssue[] {
  const statuses: IssueStatus[] = [
    "pending", "scoping", "scoped", "fixing", "blocked",
    "pr_open", "awaiting_reply", "timed_out", "failed", "aborted", "done",
  ];
  return statuses.map((status, i) => makeIssue({ number: i + 1, status }));
}

const ALL_FILTER: FilterState = { confidence: "all", status: "all" };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("filterAndSortIssues", () => {
  const allIssues = makeAllStatusIssues();

  it("returns all issues when both filters are 'all'", () => {
    const result = filterAndSortIssues(allIssues, ALL_FILTER, "number");
    expect(result).toHaveLength(allIssues.length);
  });

  describe("status group filtering", () => {
    const groups: { group: Exclude<StatusFilter, "all">; expectedStatuses: IssueStatus[] }[] = [
      { group: "pending", expectedStatuses: ["pending"] },
      { group: "active", expectedStatuses: ["scoping", "fixing", "blocked", "awaiting_reply"] },
      { group: "scoped", expectedStatuses: ["scoped"] },
      { group: "done", expectedStatuses: ["done", "pr_open"] },
      { group: "error", expectedStatuses: ["timed_out", "failed", "aborted"] },
    ];

    for (const { group, expectedStatuses } of groups) {
      it(`"${group}" returns only ${expectedStatuses.join(", ")} issues`, () => {
        const filter: FilterState = { confidence: "all", status: group };
        const result = filterAndSortIssues(allIssues, filter, "number");
        expect(result).toHaveLength(expectedStatuses.length);
        for (const issue of result) {
          expect(expectedStatuses).toContain(issue.status);
        }
      });
    }
  });

  it("every IssueStatus belongs to exactly one group", () => {
    const allStatuses: IssueStatus[] = [
      "pending", "scoping", "scoped", "fixing", "blocked",
      "pr_open", "awaiting_reply", "timed_out", "failed", "aborted", "done",
    ];
    for (const status of allStatuses) {
      const matchingGroups = Object.entries(STATUS_GROUPS).filter(([, statuses]) =>
        statuses.includes(status)
      );
      expect(matchingGroups).toHaveLength(1);
    }
  });

  describe("composable filters (confidence + status)", () => {
    const issues = [
      makeIssue({ number: 1, status: "fixing", confidence: "green" }),
      makeIssue({ number: 2, status: "fixing", confidence: "red" }),
      makeIssue({ number: 3, status: "done", confidence: "green" }),
      makeIssue({ number: 4, status: "pending", confidence: "yellow" }),
    ];

    it("confidence=green + status=active returns only green active issues", () => {
      const filter: FilterState = { confidence: "green", status: "active" };
      const result = filterAndSortIssues(issues, filter, "number");
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(1);
    });

    it("confidence=green + status=all returns all green issues", () => {
      const filter: FilterState = { confidence: "green", status: "all" };
      const result = filterAndSortIssues(issues, filter, "number");
      expect(result).toHaveLength(2);
      expect(result.map((i) => i.number)).toEqual([1, 3]);
    });

    it("confidence=all + status=done returns all done issues", () => {
      const filter: FilterState = { confidence: "all", status: "done" };
      const result = filterAndSortIssues(issues, filter, "number");
      expect(result).toHaveLength(1);
      expect(result[0].number).toBe(3);
    });
  });

  describe("sorting", () => {
    const issues = [
      makeIssue({ number: 3, status: "fixing", confidence: "red" }),
      makeIssue({ number: 1, status: "done", confidence: "green" }),
      makeIssue({ number: 2, status: "pending", confidence: "yellow" }),
    ];

    it("sorts by number ascending", () => {
      const result = filterAndSortIssues(issues, ALL_FILTER, "number");
      expect(result.map((i) => i.number)).toEqual([1, 2, 3]);
    });

    it("sorts by confidence (green < yellow < red < null)", () => {
      const result = filterAndSortIssues(issues, ALL_FILTER, "confidence");
      expect(result.map((i) => i.confidence)).toEqual(["green", "yellow", "red"]);
    });

    it("sorts by status alphabetically", () => {
      const result = filterAndSortIssues(issues, ALL_FILTER, "status");
      expect(result.map((i) => i.status)).toEqual(["done", "fixing", "pending"]);
    });
  });
});
