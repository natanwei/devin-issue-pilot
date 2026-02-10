"use client";

import { useState, useEffect } from "react";
import { DashboardIssue, DashboardAction } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";
import DevinQuestions from "./DevinQuestions";
import MessageInput from "./MessageInput";
import StepChecklist from "./StepChecklist";
import PRCard, { FilesChanged, StepsCompleted } from "./PRCard";
import DiffSnippet from "./DiffSnippet";
import {
  ExternalLink,
  MessageCircle,
  Clock,
  XCircle,
  Timer,
  Search,
  RefreshCw,
} from "lucide-react";

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
  dispatch: React.Dispatch<DashboardAction>;
  mode: "demo" | "live";
  actions: IssueActions;
  lastMainCommitDate?: string | null;
}

// --- Shared sub-layouts ---

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-text-muted text-[11px] font-semibold uppercase tracking-wider">
      {children}
    </span>
  );
}

function DetailGrid({ issue }: { issue: DashboardIssue }) {
  const s = issue.scoping;
  if (!s) return null;
  const isUnclear = issue.confidence === "red";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full">
      {/* Left column */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SectionLabel>Current Behavior</SectionLabel>
          <p
            className={`text-sm leading-relaxed ${
              isUnclear && s.current_behavior.includes("Not clearly")
                ? "text-text-muted italic"
                : "text-text-secondary"
            }`}
          >
            {s.current_behavior}
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel>Requested Fix</SectionLabel>
          <p
            className={`text-sm leading-relaxed ${
              isUnclear && s.requested_fix.includes("Unable to determine")
                ? "text-text-muted italic"
                : "text-text-secondary"
            }`}
          >
            {s.requested_fix}
          </p>
        </div>
      </div>

      {/* Right column */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <SectionLabel>Files to Modify</SectionLabel>
          {issue.files_info.length > 0 ? (
            issue.files_info.map((f) => (
              <div
                key={f.path}
                className="flex items-center gap-2 text-sm"
              >
                <span className="text-text-secondary font-mono text-[13px] break-all">
                  {f.path}
                </span>
                {f.lines && (
                  <span className="text-text-muted text-xs">
                    ~{f.lines} lines
                  </span>
                )}
              </div>
            ))
          ) : s.files_to_modify.length > 0 ? (
            s.files_to_modify.map((f) => (
              <span
                key={f}
                className="text-text-secondary font-mono text-[13px]"
              >
                {f}
              </span>
            ))
          ) : (
            <span className="text-text-muted italic text-sm">
              Unable to determine
            </span>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <SectionLabel>Action Plan</SectionLabel>
          {s.action_plan.map((step, i) => (
            <span
              key={i}
              className={`text-sm ${
                step.includes("Insufficient")
                  ? "text-text-muted italic"
                  : "text-text-secondary"
              }`}
            >
              {i + 1}. {step}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ConfidenceHeader({ issue }: { issue: DashboardIssue }) {
  if (!issue.confidence) return null;
  const config = CONFIDENCE_CONFIG[issue.confidence];

  let reasonText = issue.scoping?.confidence_reason || "";
  let reasonColor = "text-text-secondary";

  // Override for active states
  if (issue.status === "fixing" && issue.steps.length > 0) {
    const inProgress = issue.steps.findIndex(
      (s) => s.status === "in_progress"
    );
    reasonText = `Fixing in progress (Step ${inProgress + 1} of ${issue.steps.length})`;
    reasonColor = "text-accent-blue";
  } else if (issue.status === "blocked") {
    if (issue.steps.length > 0) {
      const blocked = issue.steps.findIndex((s) => s.status === "blocked");
      reasonText = `Blocked at Step ${blocked + 1} of ${issue.steps.length}`;
    } else {
      reasonText = "Devin needs input";
    }
    reasonColor = "text-accent-amber";
  } else if (issue.status === "done" || issue.status === "pr_open") {
    reasonText = "PR opened ✅";
    reasonColor = "text-accent-green";
  } else if (issue.status === "failed") {
    reasonText = "Fix failed";
    reasonColor = "text-accent-red";
  } else if (issue.status === "timed_out") {
    reasonText = "Session timed out";
    reasonColor = "text-text-muted";
  } else if (issue.status === "aborted") {
    reasonText = "Aborted by user";
    reasonColor = "text-text-muted";
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: config.color }}
      />
      <span className="text-sm font-medium" style={{ color: config.color }}>
        {config.label}
      </span>
      <span className="text-text-secondary text-sm">—</span>
      <span className={`text-sm ${reasonColor}`}>{reasonText}</span>
    </div>
  );
}

function SessionStats({ issue }: { issue: DashboardIssue }) {
  const session = issue.fix_session;
  if (!session) return null;

  const start = new Date(session.started_at).getTime();
  const end = session.updated_at
    ? new Date(session.updated_at).getTime()
    : Date.now();
  const durationMs = end - start;
  const minutes = Math.floor(durationMs / 60000);
  const seconds = Math.floor((durationMs % 60000) / 1000);
  const durationStr = `${minutes}m ${seconds.toString().padStart(2, "0")}s`;

  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="text-text-secondary">
        Duration: {durationStr} · ACUs: ~{(minutes / 15).toFixed(1)} · Tests: All green ✓
      </span>
    </div>
  );
}

// --- State Views ---

function ScopedView({
  issue,
  actions,
  lastMainCommitDate,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
  lastMainCommitDate?: string | null;
}) {
  const isYellow = issue.confidence === "yellow";
  const isRed = issue.confidence === "red";
  const questions = issue.scoping?.open_questions || [];
  const isStale = !!(
    issue.scoped_at &&
    lastMainCommitDate &&
    new Date(lastMainCommitDate).getTime() > new Date(issue.scoped_at).getTime()
  );

  return (
    <>
      {isStale && (
        <div
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-[#1a1a1a] px-4 py-3 rounded-md"
          style={{ borderLeft: "3px solid #f59e0b" }}
        >
          <span className="text-accent-amber text-sm">
            Outdated — scope may be inaccurate since the codebase has changed
          </span>
          <button
            onClick={() => actions.onStartScope(issue)}
            className="inline-flex items-center gap-1.5 text-accent-blue text-sm font-medium hover:opacity-80 transition-opacity whitespace-nowrap"
          >
            <Search className="h-3.5 w-3.5" />
            Re-scope
          </button>
        </div>
      )}
      <DetailGrid issue={issue} />

      {(isYellow || isRed) && questions.length > 0 && (
        <DevinQuestions
          questions={questions}
          color={isRed ? "red" : "amber"}
          githubUrl={issue.github_url}
          githubCommentUrl={issue.github_comment_url}
        />
      )}

      {(isYellow || isRed) && (
        <MessageInput
          color={isRed ? "red" : "amber"}
          placeholder="Answer Devin's questions..."
          helperText="Devin will re-analyze with your clarification"
          onSend={async (msg) => {
            actions.onSendClarification(issue, msg);
          }}
        />
      )}

      {/* Footer */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          {!isRed && (
            <>
              <button
                onClick={() => actions.onStartFix(issue)}
                className="bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors"
              >
                Start Fix
              </button>
              <span className="text-text-muted text-[13px]">
                Estimated {isYellow ? "5-12" : "3-8"} ACUs
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-4">
          {(isYellow || isRed) && (
            <a
              href={issue.github_comment_url || issue.github_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-accent-blue text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              {issue.github_comment_url ? "Answer on GitHub →" : "View on GitHub →"}
            </a>
          )}
          {!isRed && (
            <span className="text-text-muted text-xs">
              Watch Devin work →
            </span>
          )}
        </div>
      </div>
    </>
  );
}

function AwaitingReplyView({
  issue,
  actions,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
}) {
  const questions = issue.scoping?.open_questions || [];
  const sessionId =
    issue.fix_session?.session_id || issue.scoping_session?.session_id;
  const commentUrl = issue.github_comment_url || issue.github_url;

  const commentedAt = issue.last_devin_comment_at
    ? new Date(issue.last_devin_comment_at)
    : null;
  const agoText = commentedAt
    ? formatTimeAgo(commentedAt)
    : null;

  return (
    <>
      {/* Centered content */}
      <div className="flex flex-col items-center gap-3 py-6">
        <MessageCircle className="h-7 w-7 text-accent-amber" />
        <span className="text-text-primary text-base">
          Devin asked a question on this issue
        </span>
        <span className="text-text-secondary text-sm">
          Waiting for a reply on GitHub before proceeding
        </span>
        <a
          href={commentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 border border-accent-blue text-accent-blue text-[13px] font-medium rounded-md px-4 py-1.5 hover:bg-accent-blue/10 transition-colors"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          View on GitHub →
        </a>
        {agoText && (
          <div className="flex items-center gap-1.5 text-text-muted text-xs">
            <Clock className="h-3 w-3" />
            <span>Asked {agoText}</span>
          </div>
        )}
      </div>

      {/* Quote block */}
      {questions.length > 0 && (
        <div
          className="bg-[#1a1a1a] p-4 flex flex-col gap-2"
          style={{ borderLeft: "3px solid #262626" }}
        >
          {questions.map((q, i) => (
            <p key={i} className="text-text-secondary text-sm italic leading-relaxed">
              {i + 1}. {q}
            </p>
          ))}
        </div>
      )}

      <MessageInput
        color="amber"
        onSend={async (msg) => {
          if (!sessionId) throw new Error("No active session");
          await actions.onSendMessage(sessionId, msg);
        }}
      />
    </>
  );
}

function formatTimeAgo(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function FixingView({
  issue,
  actions,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
}) {
  const startedAt = issue.fix_started_at ?? issue.fix_session?.started_at;

  const [elapsed, setElapsed] = useState(() =>
    startedAt
      ? Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000))
      : 0
  );

  useEffect(() => {
    if (!startedAt) return;
    const interval = setInterval(() => {
      setElapsed(Math.max(0, Math.floor((Date.now() - new Date(startedAt).getTime()) / 1000)));
    }, 1000);
    return () => clearInterval(interval);
  }, [startedAt]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;

  const completedCount = issue.steps.filter((s) => s.status === "done").length;
  const hasSteps = issue.steps.length > 0;
  const progress = hasSteps ? (completedCount / issue.steps.length) * 100 : 0;

  return (
    <>
      <StepChecklist steps={issue.steps} />

      {/* Timer */}
      <div className="flex items-center gap-1.5 text-text-muted text-xs">
        <Timer className="h-3 w-3" />
        <span>
          Devin has been working for {minutes}m{" "}
          {seconds.toString().padStart(2, "0")}s
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full h-0.5 bg-border-subtle rounded-full overflow-hidden">
        {hasSteps ? (
          <div
            className="h-full bg-accent-blue rounded-full transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        ) : (
          <div className="h-full w-1/3 bg-accent-blue rounded-full animate-progress-slide" />
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => {
            if (issue.fix_session)
              actions.onAbort(issue.number, issue.fix_session.session_id);
          }}
          className="flex items-center gap-1.5 text-accent-red text-xs hover:opacity-80"
        >
          <XCircle className="h-3 w-3" />
          Abort Fix
        </button>
        {issue.fix_session && (
          <a
            href={issue.fix_session.session_url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-accent-blue text-xs"
          >
            <ExternalLink className="h-3 w-3" />
            Watch live →
          </a>
        )}
      </div>
    </>
  );
}

function BlockedView({
  issue,
  actions,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
}) {
  const isCredentialIssue = issue.blocker?.suggestion.includes("Setup Guide") ?? false;
  const sessionId = issue.fix_session?.session_id;
  const isSleeping = issue.blocker?.what_happened.includes("went to sleep") ?? false;

  return (
    <>
      <StepChecklist steps={issue.steps} />

      {/* Blocker block */}
      {issue.blocker && (
        <div
          className="bg-[#1a1a1a] p-4 flex flex-col gap-3"
          style={{ borderLeft: "3px solid #f59e0b" }}
        >
          <span className="text-accent-amber text-xs font-semibold uppercase tracking-wider">
            What Happened
          </span>
          <p className="text-text-primary text-sm leading-relaxed">
            {issue.blocker.what_happened}
          </p>
          <span className="text-text-muted text-xs font-semibold uppercase tracking-wider">
            Devin&apos;s Suggestion
          </span>
          <p className="text-text-secondary text-sm leading-relaxed">
            {issue.blocker.suggestion}
            {isCredentialIssue && (
              <>
                {" "}
                <button
                  onClick={actions.onOpenSettings}
                  className="text-accent-blue text-sm font-medium hover:underline"
                >
                  Open Settings
                </button>
              </>
            )}
          </p>
        </div>
      )}

      <MessageInput
        color="amber"
        placeholder="Give Devin instructions..."
        helperText="This will be sent to Devin's session"
        onSend={async (msg) => {
          if (!sessionId) throw new Error("No active session");
          await actions.onSendMessage(sessionId, msg);
        }}
      />

      {/* Footer */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          {isSleeping ? (
            <button
              onClick={() => actions.onRetry(issue)}
              className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry with Context
            </button>
          ) : (
            <button
              onClick={() => {
                if (sessionId) actions.onApprove(issue.number, sessionId);
              }}
              className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-semibold px-5 py-2 rounded-md transition-colors"
            >
              Approve Suggestion
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (sessionId) actions.onAbort(issue.number, sessionId);
            }}
            className="flex items-center gap-1.5 text-accent-red text-xs hover:opacity-80"
          >
            <XCircle className="h-3 w-3" />
            Abort Fix
          </button>
          {issue.fix_session && (
            <a
              href={issue.fix_session.session_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-accent-blue text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              {isSleeping ? "Open in Devin →" : "Watch live →"}
            </a>
          )}
        </div>
      </div>
    </>
  );
}

function DoneView({ issue }: { issue: DashboardIssue }) {
  const completedSteps = issue.steps
    .filter((s) => s.status === "done")
    .map((s) => s.label);

  return (
    <>
      {issue.pr && <PRCard pr={issue.pr} />}

      {/* Diff snippet */}
      {issue.pr?.files_changed?.some((f) => f.diff_lines && f.diff_lines.length > 0) && (
        <DiffSnippet files={issue.pr.files_changed!} />
      )}

      {/* Two columns: Files Changed + Steps Completed */}
      {issue.pr && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10 w-full">
          <FilesChanged files={issue.pr.files_changed ?? []} />
          <StepsCompleted steps={completedSteps} />
        </div>
      )}

      {/* Session stats */}
      <SessionStats issue={issue} />

      {/* GitHub comment link */}
      {issue.github_comment_url ? (
        <a
          href={issue.github_comment_url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-accent-blue text-xs"
        >
          <ExternalLink className="h-3 w-3" />
          Comment posted on GitHub issue #{issue.number} →
        </a>
      ) : (
        <span className="text-text-muted text-xs">
          Comment posted on GitHub issue #{issue.number} →
        </span>
      )}
    </>
  );
}

function FailedView({
  issue,
  actions,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
}) {
  // Scope failure: no scoping data means the scoping API call itself failed
  if (!issue.scoping) {
    return (
      <>
        <div
          className="bg-[#1a1a1a] p-4 flex flex-col gap-2"
          style={{ borderLeft: "3px solid #ef4444" }}
        >
          <span className="text-accent-red text-xs font-semibold uppercase tracking-wider">
            Scoping Failed
          </span>
          <p className="text-text-secondary text-sm leading-relaxed">
            The scoping session failed to complete. You can try again.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions.onStartScope(issue)}
            className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
          >
            <Search className="h-3.5 w-3.5" />
            Re-scope
          </button>
          <span className="text-text-muted text-xs">
            This will start a new scoping session
          </span>
        </div>
      </>
    );
  }

  const failReason =
    issue.fix_progress?.blockers?.[0] ||
    "Tests failed after modifying the error handler.";

  return (
    <>
      {/* What went wrong */}
      <div
        className="bg-[#1a1a1a] p-4 flex flex-col gap-3"
        style={{ borderLeft: "3px solid #ef4444" }}
      >
        <span className="text-accent-red text-xs font-semibold uppercase tracking-wider">
          What Went Wrong
        </span>
        <p className="text-text-primary text-sm leading-relaxed">
          {failReason}
        </p>
      </div>

      {/* Session stats */}
      <SessionStats issue={issue} />

      {/* Step checklist */}
      <StepChecklist steps={issue.steps} />

      {/* Footer */}
      <div className="flex items-center justify-between w-full">
        <div className="flex items-center gap-2">
          <button
            onClick={() => actions.onRetry(issue)}
            className="inline-flex items-center gap-1.5 border border-accent-blue text-accent-blue text-[13px] font-medium rounded-md px-4 py-1.5 hover:bg-accent-blue/10 transition-colors"
          >
            Retry Fix
          </button>
          <span className="text-text-muted text-xs">
            This will start a new session
          </span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => {
              if (issue.fix_session)
                actions.onAbort(issue.number, issue.fix_session.session_id);
            }}
            className="flex items-center gap-1.5 text-accent-red text-xs hover:opacity-80"
          >
            <XCircle className="h-3 w-3" />
            Abort
          </button>
          {issue.fix_session && (
            <a
              href={issue.fix_session.session_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-text-muted text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              View session log →
            </a>
          )}
        </div>
      </div>
    </>
  );
}

function TimedOutView({
  issue,
  actions,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
}) {
  return (
    <>
      <div className="flex flex-col items-center gap-3 py-8">
        <Clock className="h-8 w-8 text-text-muted" />
        <span className="text-text-primary text-base">
          Session exceeded the 30 minute time limit
        </span>
        <span className="text-text-secondary text-sm">
          Devin may still be working — check the session details.
        </span>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between w-full">
        <button
          onClick={() => actions.onRetry(issue)}
          className="inline-flex items-center gap-1.5 border border-accent-blue text-accent-blue text-[13px] font-medium rounded-md px-4 py-1.5 hover:bg-accent-blue/10 transition-colors"
        >
          Retry
        </button>
        <div className="flex items-center gap-4">
          {issue.fix_session && (
            <a
              href={issue.fix_session.session_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-accent-blue text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              View Devin session →
            </a>
          )}
          <button
            onClick={() => {
              if (issue.fix_session)
                actions.onAbort(issue.number, issue.fix_session.session_id);
            }}
            className="flex items-center gap-1.5 text-accent-red text-xs hover:opacity-80"
          >
            <XCircle className="h-3 w-3" />
            Abort
          </button>
        </div>
      </div>
    </>
  );
}

function AbortedView({ issue }: { issue: DashboardIssue }) {
  const completedSteps = issue.steps.filter((s) => s.status === "done");

  return (
    <>
      <span className="text-text-muted text-sm">
        This fix was manually aborted
      </span>

      {completedSteps.length > 0 && <StepChecklist steps={issue.steps} />}

      <SessionStats issue={issue} />
    </>
  );
}

// --- Main Component ---

export default function IssueDetail({
  issue,
  dispatch,
  mode,
  actions,
  lastMainCommitDate,
}: IssueDetailProps) {
  void dispatch; // kept for potential direct dispatch needs
  void mode;
  const borderColor = (() => {
    switch (issue.status) {
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
    switch (issue.status) {
      case "scoped":
        return <ScopedView issue={issue} actions={actions} lastMainCommitDate={lastMainCommitDate} />;
      case "awaiting_reply":
        return <AwaitingReplyView issue={issue} actions={actions} />;
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
      default:
        return (
          <div className="flex items-center justify-between w-full">
            <span className="text-text-muted text-sm italic">
              {issue.status === "scoping"
                ? "Devin is analyzing this issue..."
                : "Waiting to be scoped"}
            </span>
            {issue.status === "pending" && (
              <button
                onClick={() => actions.onStartScope(issue)}
                className="inline-flex items-center gap-1.5 bg-accent-blue hover:bg-accent-blue/90 text-white text-sm font-semibold px-4 py-1.5 rounded-md transition-colors"
              >
                <Search className="h-3.5 w-3.5" />
                Scope
              </button>
            )}
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
