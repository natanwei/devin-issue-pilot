"use client";

import { useState, useEffect } from "react";
import { DashboardIssue } from "@/lib/types";
import DevinQuestions from "./DevinQuestions";
import MessageInput from "./MessageInput";
import StepChecklist from "./StepChecklist";
import PRCard, { FilesChanged, StepsCompleted } from "./PRCard";
import DiffSnippet from "./DiffSnippet";
import {
  ExternalLink,
  Clock,
  XCircle,
  Timer,
  Search,
  RefreshCw,
} from "lucide-react";
import { ConversationThread, DetailGrid, SessionStats } from "./issue-detail-shared";
import type { IssueActions } from "./IssueDetail";

// --- ScopedView ---

export function ScopedView({
  issue,
  actions,
  lastMainCommitDate,
  acuLimitFixing,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
  lastMainCommitDate?: string | null;
  acuLimitFixing: number;
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
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 bg-elevated px-4 py-3 rounded-md"
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
      {issue.last_devin_comment_id && (
        <div
          className="bg-elevated px-4 py-3 rounded-md"
          style={{ borderLeft: "3px solid #f59e0b" }}
        >
          <span className="text-text-secondary text-sm">
            Questions posted on GitHub — waiting for reply
          </span>
        </div>
      )}
      <DetailGrid issue={issue} />

      {(isYellow || isRed) && questions.length > 0 && (
        <>
          <DevinQuestions
            questions={questions}
            color={isRed ? "red" : "amber"}
          />
          <ConversationThread messages={issue.messages || []} />
        </>
      )}

      {(isYellow || isRed) && (
        <MessageInput
          color={isRed ? "red" : "amber"}
          placeholder="Answer Devin's questions..."
          helperText="Devin will re-analyze with your clarification. You can also reply on GitHub."
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
                {acuLimitFixing > 0 ? `Up to ${acuLimitFixing} ACUs` : "No ACU limit"}
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
          {!isRed && (issue.scoping_session?.session_url || issue.fix_session?.session_url) && (
            <a
              href={issue.scoping_session?.session_url || issue.fix_session?.session_url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 text-accent-blue text-xs"
            >
              <ExternalLink className="h-3 w-3" />
              Watch Devin work →
            </a>
          )}
        </div>
      </div>
    </>
  );
}

// --- FixingView ---

export function FixingView({
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

// --- BlockedView ---

export function BlockedView({
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
          className="bg-elevated p-4 flex flex-col gap-3"
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

      <ConversationThread messages={issue.messages || []} />

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

// --- DoneView ---

export function DoneView({ issue, acuLimitFixing }: { issue: DashboardIssue; acuLimitFixing: number }) {
  const doneSteps = issue.steps
    .filter((s) => s.status === "done")
    .map((s) => s.label);
  // Fallback: if no steps but scoping has action_plan, use those (fix succeeded = plan completed)
  const completedSteps = doneSteps.length > 0
    ? doneSteps
    : (issue.scoping?.action_plan ?? []);

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
      <SessionStats issue={issue} acuLimitFixing={acuLimitFixing} />

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

// --- FailedView ---

export function FailedView({
  issue,
  actions,
  acuLimitFixing,
}: {
  issue: DashboardIssue;
  actions: IssueActions;
  acuLimitFixing: number;
}) {
  // Scope failure: no scoping data means the scoping API call itself failed
  if (!issue.scoping) {
    return (
      <>
        <div
          className="bg-elevated p-4 flex flex-col gap-2"
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
        className="bg-elevated p-4 flex flex-col gap-3"
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
      <SessionStats issue={issue} acuLimitFixing={acuLimitFixing} />

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

// --- TimedOutView ---

export function TimedOutView({
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
          Devin session expired
        </span>
        <span className="text-text-secondary text-sm">
          The session ended before completing the fix.
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

// --- AbortedView ---

export function AbortedView({ issue, acuLimitFixing }: { issue: DashboardIssue; acuLimitFixing: number }) {
  const completedSteps = issue.steps.filter((s) => s.status === "done");

  return (
    <>
      <span className="text-text-muted text-sm">
        This fix was manually aborted
      </span>

      {completedSteps.length > 0 && <StepChecklist steps={issue.steps} />}

      <SessionStats issue={issue} acuLimitFixing={acuLimitFixing} />
    </>
  );
}
