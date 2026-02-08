"use client";

import { StepItem } from "@/lib/types";
import {
  CheckCircle2,
  RefreshCw,
  Circle,
  XCircle,
  AlertTriangle,
} from "lucide-react";

interface StepChecklistProps {
  steps: StepItem[];
}

function StepIcon({ status }: { status: StepItem["status"] }) {
  switch (status) {
    case "done":
      return <CheckCircle2 className="h-4 w-4 text-accent-green flex-shrink-0" />;
    case "in_progress":
      return (
        <RefreshCw className="h-4 w-4 text-accent-blue animate-spin flex-shrink-0" />
      );
    case "failed":
      return <XCircle className="h-4 w-4 text-accent-red flex-shrink-0" />;
    case "blocked":
      return (
        <AlertTriangle className="h-4 w-4 text-accent-amber flex-shrink-0" />
      );
    case "pending":
    default:
      return <Circle className="h-4 w-4 text-text-muted flex-shrink-0" />;
  }
}

function stepTextColor(status: StepItem["status"]): string {
  switch (status) {
    case "done":
      return "text-text-secondary";
    case "in_progress":
    case "blocked":
      return "text-text-primary font-semibold";
    case "failed":
      return "text-text-primary font-semibold";
    case "pending":
    default:
      return "text-text-muted";
  }
}

function statusBadge(status: StepItem["status"]) {
  if (status === "in_progress") {
    return (
      <span className="text-accent-blue text-xs">In progress...</span>
    );
  }
  if (status === "blocked") {
    return (
      <span className="text-accent-amber text-[11px] font-semibold tracking-wide">
        BLOCKED
      </span>
    );
  }
  if (status === "failed") {
    return (
      <span className="text-accent-red text-[11px] font-semibold tracking-wide">
        FAILED
      </span>
    );
  }
  return null;
}

export default function StepChecklist({ steps }: StepChecklistProps) {
  return (
    <div className="flex flex-col w-full">
      {steps.map((step, i) => {
        const isLast = i === steps.length - 1;
        const leftBorder =
          step.status === "in_progress"
            ? "border-l-2 border-l-accent-blue"
            : step.status === "blocked"
              ? "border-l-2 border-l-accent-amber"
              : "";

        return (
          <div
            key={i}
            className={`flex items-center gap-3 h-12 px-2 ${leftBorder} ${
              !isLast ? "border-b border-b-border-subtle" : ""
            }`}
          >
            <StepIcon status={step.status} />
            <span className={`text-sm flex-1 ${stepTextColor(step.status)}`}>
              Step {i + 1} — {step.label}
            </span>
            {statusBadge(step.status)}
          </div>
        );
      })}
    </div>
  );
}
