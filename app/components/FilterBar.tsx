"use client";

import { ConfidenceLevel, DashboardIssue, FilterState, StatusFilter } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";

interface FilterBarProps {
  filter: FilterState;
  issues: DashboardIssue[];
  onFilterChange: (filter: Partial<FilterState>) => void;
  sortBy: "confidence" | "number" | "status";
  onSortChange: (sortBy: "confidence" | "number" | "status") => void;
  onScopeAll: () => void;
}

export default function FilterBar({
  filter,
  issues,
  onFilterChange,
  sortBy,
  onSortChange,
  onScopeAll,
}: FilterBarProps) {
  const greenCount = issues.filter((i) => i.confidence === "green").length;
  const yellowCount = issues.filter((i) => i.confidence === "yellow").length;
  const redCount = issues.filter((i) => i.confidence === "red").length;

  const pendingCount = issues.filter(
    (i) => i.status === "pending" || i.status === "scoped"
  ).length;
  const activeCount = issues.filter(
    (i) =>
      i.status === "scoping" ||
      i.status === "fixing" ||
      i.status === "blocked" ||
      i.status === "awaiting_reply"
  ).length;
  const closedCount = issues.filter(
    (i) =>
      i.status === "done" ||
      i.status === "pr_open" ||
      i.status === "timed_out" ||
      i.status === "failed" ||
      i.status === "aborted"
  ).length;

  const isAllActive =
    filter.confidence === "all" && filter.status === "all";

  function handleConfidence(c: ConfidenceLevel | "all") {
    onFilterChange({
      confidence: c === filter.confidence ? "all" : c,
      status: "all",
    });
  }

  function handleStatus(s: StatusFilter | "all") {
    onFilterChange({
      status: s === filter.status ? "all" : s,
      confidence: "all",
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 sm:gap-x-4 md:gap-x-6 py-2 sm:py-0 sm:h-11 px-3 sm:px-4 md:px-6 bg-page max-w-[1200px] mx-auto w-full">
      {/* All filter */}
      <button
        onClick={() => onFilterChange({ confidence: "all", status: "all" })}
        className={`text-sm px-2.5 py-1 rounded-full transition-colors flex-shrink-0 ${
          isAllActive
            ? "bg-elevated text-text-primary"
            : "text-text-muted hover:text-text-secondary"
        }`}
      >
        All
      </button>

      {/* Confidence group */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold hidden sm:inline">
          Confidence
        </span>
        {(
          [
            ["green", greenCount],
            ["yellow", yellowCount],
            ["red", redCount],
          ] as [ConfidenceLevel, number][]
        ).map(([level, count]) => {
          const config = CONFIDENCE_CONFIG[level];
          const isActive = filter.confidence === level;
          return (
            <button
              key={level}
              onClick={() => handleConfidence(level)}
              className={`relative flex items-center gap-1.5 text-sm transition-colors ${
                isActive
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              <span
                className="h-2 w-2 rounded-full inline-block"
                style={{ backgroundColor: config.color }}
              />
              <span>
                {config.label} ({count})
              </span>
              {isActive && (
                <span
                  className="absolute bottom-0 left-0 right-0 h-0.5"
                  style={{ backgroundColor: config.color }}
                />
              )}
            </button>
          );
        })}
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-border-subtle flex-shrink-0" />

      {/* Status group */}
      <div className="flex items-center gap-2 sm:gap-4 flex-shrink-0">
        <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold hidden sm:inline">
          Status
        </span>
        <button
          onClick={() => handleStatus("pending")}
          className={`text-sm transition-colors ${
            filter.status === "pending"
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Pending ({pendingCount})
        </button>
        <button
          onClick={() => handleStatus("active")}
          className={`text-sm transition-colors ${
            filter.status === "active"
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Active ({activeCount})
        </button>
        <button
          onClick={() => handleStatus("closed")}
          className={`text-sm transition-colors ${
            filter.status === "closed"
              ? "text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          Closed ({closedCount})
        </button>
      </div>

      {/* Actions: Scope All + Sort */}
      <div className="flex items-center gap-4 flex-shrink-0 sm:ml-auto">
        {issues.some((i) => i.status === "pending") && (
          <button
            onClick={onScopeAll}
            className="text-accent-blue text-sm font-medium hover:text-accent-blue/80 transition-colors"
          >
            Scope All ({issues.filter((i) => i.status === "pending").length})
          </button>
        )}
        {/* Sort control */}
        <button
          onClick={() => {
            const next =
              sortBy === "confidence"
                ? "number"
                : sortBy === "number"
                  ? "status"
                  : "confidence";
            onSortChange(next);
          }}
          className="text-text-muted text-sm hover:text-text-secondary transition-colors"
        >
          Sort:{" "}
          {sortBy === "confidence"
            ? "Confidence ↓"
            : sortBy === "number"
              ? "Number ↓"
              : "Status ↓"}
        </button>
      </div>
    </div>
  );
}
