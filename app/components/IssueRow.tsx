"use client";

import { DashboardIssue, DashboardState, IssueStatus } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";
import ConfidenceDot from "./ConfidenceDot";
import StatusIndicator from "./StatusIndicator";
import { ChevronDown } from "lucide-react";

interface IssueRowProps {
  issue: DashboardIssue;
  isExpanded: boolean;
  onToggle: () => void;
  lastMainCommitDate: string | null;
  activeSession: DashboardState["activeSession"];
}

function getTimeSince(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(ms / 60000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days} day${days > 1 ? "s" : ""} ago`;
  if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""} ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return "just now";
}

export default function IssueRow({ issue, isExpanded, onToggle, lastMainCommitDate, activeSession }: IssueRowProps) {
  const effectiveStatus: IssueStatus =
    activeSession?.issueNumber === issue.number
      ? (activeSession.type === "scoping" ? "scoping" : "fixing")
      : issue.status;

  const fileCount = issue.files_info.length || issue.scoping?.files_to_modify.length || 0;
  const totalLines = issue.files_info.reduce((sum, f) => sum + (f.lines || 0), 0);
  const isStale = !!(
    issue.scoped_at &&
    lastMainCommitDate &&
    new Date(lastMainCommitDate).getTime() > new Date(issue.scoped_at).getTime()
  );

  const isTerminal = ["done", "pr_open", "failed", "timed_out", "aborted"].includes(effectiveStatus);
  const borderColor = isTerminal
    ? "#262626"
    : issue.confidence
      ? CONFIDENCE_CONFIG[issue.confidence].color
      : "#262626";

  return (
    <button
      onClick={onToggle}
      className="flex items-center gap-2 sm:gap-3 w-full h-16 px-3 sm:px-6 hover:bg-dp-card/80 transition-colors text-left group"
      style={{
        borderLeft: `3px solid ${borderColor}`,
      }}
    >
      {/* Confidence dot */}
      <ConfidenceDot confidence={issue.confidence} status={effectiveStatus} />

      {/* Issue number */}
      <span className="text-text-muted font-mono text-sm w-10 flex-shrink-0">
        #{issue.number}
      </span>

      {/* Title */}
      <span className="text-text-primary text-sm truncate flex-1 min-w-0">
        {issue.title}
      </span>

      {/* Labels */}
      <div className="hidden sm:flex items-center gap-1.5 flex-shrink-0">
        {issue.labels.slice(0, 2).map((label) => (
          <span
            key={label.name}
            className="text-[11px] px-1.5 py-0.5 rounded-sm"
            style={{
              backgroundColor: `#${label.color}20`,
              color: `#${label.color}`,
            }}
          >
            {label.name}
          </span>
        ))}
      </div>

      {/* File/line info */}
      <span className="text-text-muted text-xs flex-shrink-0 hidden sm:inline">
        {isStale && (
          <span className="text-accent-amber mr-1.5">Outdated</span>
        )}
        {fileCount > 0 && `${fileCount} file${fileCount > 1 ? "s" : ""}`}
        {totalLines > 0 && ` · ~${totalLines} lines`}
        {issue.created_at && ` · ${getTimeSince(issue.created_at)}`}
      </span>

      {/* Status indicator */}
      <div className="flex-shrink-0">
        <StatusIndicator status={effectiveStatus} />
      </div>

      {/* Chevron */}
      <ChevronDown
        className={`h-4 w-4 text-text-muted transition-transform duration-200 flex-shrink-0 ${
          isExpanded ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}
