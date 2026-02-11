import type { DashboardIssue, FilterState, DashboardState } from "@/lib/types";
import { CONFIDENCE_SORT_ORDER } from "@/lib/constants";

export function filterAndSortIssues(
  issues: DashboardIssue[],
  filter: FilterState,
  sortBy: DashboardState["sortBy"]
): DashboardIssue[] {
  let filtered = issues;

  if (filter.confidence !== "all") {
    filtered = filtered.filter((i) => i.confidence === filter.confidence);
  }

  if (filter.status !== "all") {
    if (filter.status === "pending") {
      filtered = filtered.filter(
        (i) => i.status === "pending" || i.status === "scoped"
      );
    } else if (filter.status === "active") {
      filtered = filtered.filter(
        (i) =>
          i.status === "scoping" ||
          i.status === "fixing" ||
          i.status === "blocked" ||
          i.status === "awaiting_reply"
      );
    } else if (filter.status === "closed") {
      filtered = filtered.filter(
        (i) =>
          i.status === "done" ||
          i.status === "pr_open" ||
          i.status === "timed_out" ||
          i.status === "failed" ||
          i.status === "aborted"
      );
    }
  }

  return [...filtered].sort((a, b) => {
    if (sortBy === "confidence") {
      const aOrder = a.confidence
        ? CONFIDENCE_SORT_ORDER[a.confidence]
        : 3;
      const bOrder = b.confidence
        ? CONFIDENCE_SORT_ORDER[b.confidence]
        : 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.number - b.number;
    }
    if (sortBy === "number") {
      return a.number - b.number;
    }
    return a.status.localeCompare(b.status);
  });
}
