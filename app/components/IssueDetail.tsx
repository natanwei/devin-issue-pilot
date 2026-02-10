"use client";

import { DashboardIssue, DashboardState, IssueStatus } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";
import { ConfidenceHeader, ConversationThread } from "./issue-detail-shared";
import {
  ScopedView,
  FixingView,
  BlockedView,
  DoneView,
  FailedView,
  TimedOutView,
  AbortedView,
} from "./issue-detail-views";
import { Search } from "lucide-react";

export interface IssueActions {
  onStartFix: (issue: DashboardIssue) => void;
  onStartScope: (issue: DashboardIssue) => void;
  onSendMessage: (sessionId: string, message: string) => Promise<void>;
  onSendClarification: (issue: DashboardIssue, message: string) => void;
  onAbort: (issueNumber: number, sessionId: string) => void;
  onRetry: (issue: DashboardIssue) => void;
  onApprove: (issueNumber: number, sessionId: string) => void;
  onOpenSettings: () => void;
}

interface IssueDetailProps {
  issue: DashboardIssue;
  actions: IssueActions;
  lastMainCommitDate?: string | null;
  activeSession: DashboardState["activeSession"];
  acuLimitFixing: number;
}

export default function IssueDetail({
  issue,
  actions,
  lastMainCommitDate,
  activeSession,
  acuLimitFixing,
}: IssueDetailProps) {
  const effectiveStatus: IssueStatus =
    activeSession?.issueNumber === issue.number
      ? (activeSession.type === "scoping" ? "scoping" : "fixing")
      : issue.status;

  const borderColor = (() => {
    switch (effectiveStatus) {
      case "fixing":
        return "#3b82f6";
      case "blocked":
      case "awaiting_reply":
        return "#f59e0b";
      case "done":
      case "pr_open":
        return "#22c55e";
      case "failed":
        return "#ef4444";
      case "timed_out":
      case "aborted":
        return "#666666";
      default:
        return issue.confidence
          ? CONFIDENCE_CONFIG[issue.confidence].color
          : "#262626";
    }
  })();

  function renderContent() {
    switch (effectiveStatus) {
      case "scoped":
      case "awaiting_reply":
        return <ScopedView issue={issue} actions={actions} lastMainCommitDate={lastMainCommitDate} acuLimitFixing={acuLimitFixing} />;
      case "fixing":
        return <FixingView issue={issue} actions={actions} />;
      case "blocked":
        return <BlockedView issue={issue} actions={actions} />;
      case "done":
      case "pr_open":
        return <DoneView issue={issue} />;
      case "failed":
        return <FailedView issue={issue} actions={actions} />;
      case "timed_out":
        return <TimedOutView issue={issue} actions={actions} />;
      case "aborted":
        return <AbortedView issue={issue} />;
      case "scoping": {
        const hasUserMessage = issue.messages?.length > 0 &&
          issue.messages[issue.messages.length - 1].role === "user";
        return (
          <>
            {issue.messages && issue.messages.length > 0 && (
              <ConversationThread messages={issue.messages} />
            )}
            <div className="flex items-center justify-between w-full">
              <span className="text-text-muted text-sm italic">
                {hasUserMessage
                  ? "Re-analyzing with your input..."
                  : "Devin is analyzing this issue..."}
              </span>
            </div>
          </>
        );
      }
      case "pending":
      default:
        return (
          <div className="flex items-center justify-between w-full">
            <span className="text-text-muted text-sm italic">
              Waiting to be scoped
            </span>
            <button
              onClick={() => actions.onStartScope(issue)}
              className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
            >
              <Search className="h-3.5 w-3.5" />
              Scope
            </button>
          </div>
        );
    }
  }

  return (
    <div
      className="bg-elevated p-3 sm:p-5 flex flex-col gap-4"
      style={{
        borderLeft: `3px solid ${borderColor}`,
        borderTop: "1px solid #262626",
      }}
    >
      <ConfidenceHeader issue={issue} />
      {renderContent()}
    </div>
  );
}
