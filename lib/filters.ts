import type { DashboardIssue, DashboardState, FilterState, IssueStatus, StatusFilter } from "./types";
import { CONFIDENCE_SORT_ORDER } from "./constants";

/** Maps each status filter group to the IssueStatus values it includes. */
export const STATUS_GROUPS: Record<Exclude<StatusFilter, "all">, IssueStatus[]> = {
  pending: ["pending"],
  active: ["scoping", "fixing", "blocked", "awaiting_reply"],
  scoped: ["scoped"],
  done: ["done", "pr_open"],
  error: ["timed_out", "failed", "aborted"],
};

export function filterAndSortIssues(
  issues: DashboardIssue[],
  filter: FilterState,
  sortBy: DashboardState["sortBy"],
): DashboardIssue[] {
  let filtered = issues;

  if (filter.confidence !== "all") {
    filtered = filtered.filter((i) => i.confidence === filter.confidence);
  }

  if (filter.status !== "all") {
    const allowed = STATUS_GROUPS[filter.status];
    filtered = filtered.filter((i) => allowed.includes(i.status));
  }

  return [...filtered].sort((a, b) => {
    if (sortBy === "confidence") {
      const aOrder = a.confidence ? CONFIDENCE_SORT_ORDER[a.confidence] : 3;
      const bOrder = b.confidence ? CONFIDENCE_SORT_ORDER[b.confidence] : 3;
      if (aOrder !== bOrder) return aOrder - bOrder;
      return a.number - b.number;
    }
    if (sortBy === "number") {
      return a.number - b.number;
    }
    return a.status.localeCompare(b.status);
  });
}
