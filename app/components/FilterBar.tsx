"use client";

import { ConfidenceLevel, DashboardIssue, FilterState, StatusFilter } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";
import { STATUS_GROUPS } from "@/lib/filters";

interface FilterBarProps {
  filter: FilterState;
  issues: DashboardIssue[];
  onFilterChange: (filter: Partial<FilterState>) => void;
  sortBy: "confidence" | "number" | "status";
  onSortChange: (sortBy: "confidence" | "number" | "status") => void;
  onScopeAll: () => void;
}

const STATUS_LABELS: Record<Exclude<StatusFilter, "all">, string> = {
  pending: "Pending",
  active: "Active",
  scoped: "Scoped",
  done: "Done",
  error: "Error",
};

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

  const isAllActive =
    filter.confidence === "all" && filter.status === "all";

  function handleConfidence(c: ConfidenceLevel | "all") {
    onFilterChange({
      confidence: c === filter.confidence ? "all" : c,
    });
  }

  function handleStatus(s: StatusFilter) {
    onFilterChange({
      status: s === filter.status ? "all" : s,
    });
  }

  const statusButtons = (Object.keys(STATUS_GROUPS) as Exclude<StatusFilter, "all">[]).map((key) => {
    const statuses = STATUS_GROUPS[key];
    const count = issues.filter((i) => statuses.includes(i.status)).length;
    return { key, label: STATUS_LABELS[key], count };
  });

  return (
    <div className="flex items-center gap-2 sm:gap-4 md:gap-6 h-11 px-3 sm:px-4 md:px-6 bg-page overflow-x-auto">
      <div className="flex items-center gap-2 sm:gap-4 md:gap-6 flex-shrink-0">
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
        <div className="flex items-center gap-2 sm:gap-4">
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
        <div className="w-px h-5 bg-border-subtle" />

        {/* Status group */}
        <div className="flex items-center gap-2 sm:gap-4">
          <span className="text-[11px] text-text-muted uppercase tracking-wider font-semibold hidden sm:inline">
            Status
          </span>
          {statusButtons.map(({ key, label, count }) => (
            <button
              key={key}
              onClick={() => handleStatus(key)}
              className={`text-sm transition-colors ${
                filter.status === key
                  ? "text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {label}{count > 0 && ` (${count})`}
            </button>
          ))}
        </div>
      </div>

      {/* Separator between filters and actions */}
      <div className="w-px h-5 bg-border-subtle flex-shrink-0" />

      <div className="flex items-center gap-4 flex-shrink-0">
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
