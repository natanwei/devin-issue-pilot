"use client";

import { useEffect, useRef } from "react";
import { DashboardIssue } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-text-muted text-[11px] font-semibold uppercase tracking-wider">
      {children}
    </span>
  );
}

export function ConversationThread({ messages }: { messages: DashboardIssue["messages"] }) {
  const endRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (!messages || messages.length === 0) return null;

  return (
    <div className="max-h-64 overflow-y-auto flex flex-col gap-2 bg-dp-card rounded-md p-3 border border-border-subtle">
      {messages.map((m, idx) => (
        <div
          key={idx}
          className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] whitespace-pre-wrap text-sm px-3 py-2 rounded-lg ${
              m.role === "user"
                ? "bg-accent-blue/20 text-text-primary"
                : "bg-[#1a1a1a] text-text-secondary"
            }`}
            title={new Date(m.timestamp).toLocaleString()}
          >
            {m.text}
          </div>
        </div>
      ))}
      <div ref={endRef} />
    </div>
  );
}

export function DetailGrid({ issue }: { issue: DashboardIssue }) {
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

export function getConfidenceReasonText(issue: Pick<DashboardIssue, "status" | "steps" | "scoping" | "pr">): { reasonText: string; reasonColor: string } {
  let reasonText = issue.scoping?.confidence_reason || "";
  let reasonColor = "text-text-secondary";

  if (issue.status === "fixing" && issue.steps.length > 0) {
    const inProgress = issue.steps.findIndex(
      (s) => s.status === "in_progress"
    );
    reasonText = inProgress >= 0
      ? `Fixing in progress (Step ${inProgress + 1} of ${issue.steps.length})`
      : "Fixing in progress";
    reasonColor = "text-accent-blue";
  } else if (issue.status === "blocked") {
    if (issue.steps.length > 0) {
      const blocked = issue.steps.findIndex((s) => s.status === "blocked");
      reasonText = blocked >= 0
        ? `Blocked at Step ${blocked + 1} of ${issue.steps.length}`
        : "Devin needs input";
    } else {
      reasonText = "Devin needs input";
    }
    reasonColor = "text-accent-amber";
  } else if (issue.status === "done" || issue.status === "pr_open") {
    reasonText = issue.pr ? "PR opened ✅" : "Completed";
    reasonColor = "text-accent-green";
  } else if (issue.status === "failed") {
    reasonText = "Fix failed";
    reasonColor = "text-accent-red";
  } else if (issue.status === "timed_out") {
    reasonText = "Session expired";
    reasonColor = "text-text-muted";
  } else if (issue.status === "aborted") {
    reasonText = "Aborted by user";
    reasonColor = "text-text-muted";
  }

  return { reasonText, reasonColor };
}

export function ConfidenceHeader({ issue }: { issue: DashboardIssue }) {
  if (!issue.confidence) return null;
  const config = CONFIDENCE_CONFIG[issue.confidence];
  const { reasonText, reasonColor } = getConfidenceReasonText(issue);

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

export function SessionStats({ issue, acuLimitFixing }: { issue: DashboardIssue; acuLimitFixing: number }) {
  if (!issue.fix_session) return null;
  const acuLimit = issue.fix_session.acu_limit ?? acuLimitFixing;

  return (
    <div className="flex items-center gap-2 text-[13px]">
      <span className="text-text-secondary">
        {acuLimit > 0 ? `Up to ${acuLimit} ACUs` : "No ACU limit"}
      </span>
    </div>
  );
}
