"use client";

import { ConfidenceLevel, DashboardIssue, FilterState, IssueStatus } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";

interface FilterBarProps {
  filter: FilterState;
  issues: DashboardIssue[];
  onFilterChange: (filter: Partial<FilterState>) => void;
  sortBy: "confidence" | "number" | "status";
  onSortChange: (sortBy: "confidence" | "number" | "status") => void;
}

export default function FilterBar({
  filter,
  issues,
  onFilterChange,
  sortBy,
  onSortChange,
}: FilterBarProps) {
  const greenCount = issues.filter((i) => i.confidence === "green").length;
  const yellowCount = issues.filter((i) => i.confidence === "yellow").length;
  const redCount = issues.filter((i) => i.confidence === "red").length;

  const scopingCount = issues.filter((i) => i.status === "scoping").length;
  const fixingCount = issues.filter(
    (i) => i.status === "fixing" || i.status === "blocked"
  ).length;
  const doneCount = issues.filter(
    (i) => i.status === "done" || i.status === "pr_open"
  ).length;

  const isAllActive =
    filter.confidence === "all" && filter.status === "all";

  function handleConfidence(c: ConfidenceLevel | "all") {
    onFilterChange({
      confidence: c === filter.confidence ? "all" : c,
      status: "all",
    });
  }

  function handleStatus(s: IssueStatus | "all") {
    onFilterChange({
      status: s === filter.status ? "all" : s,
      confidence: "all",
    });
  }

  return (
    <div className="flex items-center justify-between h-11 px-4 md:px-6 bg-page overflow-x-auto">
      <div className="flex items-center gap-4 md:gap-6 min-w-0 flex-shrink-0">
        {/* All filter */}
        <button
          onClick={() => onFilterChange({ confidence: "all", status: "all" })}
          className={`text-sm px-2.5 py-1 rounded-full transition-colors ${
            isAllActive
              ? "bg-elevated text-text-primary"
              : "text-text-muted hover:text-text-secondary"
          }`}
        >
          All
        </button>

        {/* Confidence group */}
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
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
        <div className="w-px h-5 bg-border-subtle" />

        {/* Status group */}
        <div className="flex items-center gap-4">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold">
            Status
          </span>
          <button
            onClick={() => handleStatus("scoping")}
            className={`text-sm transition-colors ${
              filter.status === "scoping"
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Scoping{scopingCount > 0 && ` (${scopingCount})`}
          </button>
          <button
            onClick={() => handleStatus("fixing")}
            className={`text-sm transition-colors ${
              filter.status === "fixing"
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Fixing{fixingCount > 0 && ` (${fixingCount})`}
          </button>
          <button
            onClick={() => handleStatus("done")}
            className={`text-sm transition-colors ${
              filter.status === "done"
                ? "text-text-primary"
                : "text-text-muted hover:text-text-secondary"
            }`}
          >
            Done{doneCount > 0 && ` (${doneCount})`}
          </button>
        </div>
      </div>

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
  );
}
