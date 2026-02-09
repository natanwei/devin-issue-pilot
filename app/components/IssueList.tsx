"use client";

import { DashboardIssue, DashboardAction } from "@/lib/types";
import IssueRow from "./IssueRow";
import IssueDetail, { IssueActions } from "./IssueDetail";

interface IssueListProps {
  issues: DashboardIssue[];
  expandedIssueId: number | null;
  dispatch: React.Dispatch<DashboardAction>;
  mode: "demo" | "live";
  actions: IssueActions;
  lastMainCommitDate: string | null;
}

export default function IssueList({
  issues,
  expandedIssueId,
  dispatch,
  mode,
  actions,
  lastMainCommitDate,
}: IssueListProps) {
  if (issues.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-text-muted text-sm">
        No issues match the current filters
      </div>
    );
  }

  return (
    <div className="flex flex-col w-full max-w-[1200px] mx-auto">
      {issues.map((issue) => {
        const isExpanded = expandedIssueId === issue.number;

        return (
          <div key={issue.number}>
            <IssueRow
              issue={issue}
              isExpanded={isExpanded}
              onToggle={() =>
                dispatch({ type: "TOGGLE_EXPAND", issueNumber: issue.number })
              }
              lastMainCommitDate={lastMainCommitDate}
            />
            {/* Accordion content area */}
            <div
              className={`grid transition-[grid-template-rows] duration-300 ease-in-out ${
                isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
              }`}
            >
              <div className="overflow-hidden">
                <IssueDetail
                  issue={issue}
                  dispatch={dispatch}
                  mode={mode}
                  actions={actions}
                />
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
