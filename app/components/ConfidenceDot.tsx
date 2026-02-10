"use client";

import { ConfidenceLevel, IssueStatus } from "@/lib/types";
import { CONFIDENCE_CONFIG } from "@/lib/constants";
import { Check, XCircle, Clock } from "lucide-react";

interface ConfidenceDotProps {
  confidence: ConfidenceLevel | null;
  size?: "sm" | "md";
  status?: IssueStatus;
}

const TERMINAL_STATES = new Set(["done", "pr_open", "failed", "timed_out", "aborted"]);

export default function ConfidenceDot({
  confidence,
  size = "md",
  status,
}: ConfidenceDotProps) {
  const sizeClass = size === "sm" ? "h-2 w-2" : "h-2.5 w-2.5";

  // Terminal states: show status icon instead of confidence dot
  if (status && TERMINAL_STATES.has(status)) {
    if (status === "done" || status === "pr_open") {
      return <span title="Done" className="flex-shrink-0 inline-flex"><Check className={`${sizeClass} text-accent-green`} /></span>;
    }
    if (status === "failed") {
      return <span title="Failed" className="flex-shrink-0 inline-flex"><XCircle className={`${sizeClass} text-accent-red`} /></span>;
    }
    if (status === "timed_out") {
      return <span title="Timed Out" className="flex-shrink-0 inline-flex"><Clock className={`${sizeClass} text-text-muted`} /></span>;
    }
    // aborted: gray dot
    return (
      <span
        className={`${sizeClass} rounded-full bg-text-muted inline-block flex-shrink-0`}
        title="Aborted"
      />
    );
  }

  if (!confidence) {
    return (
      <span
        className={`${sizeClass} rounded-full bg-text-muted inline-block flex-shrink-0`}
        title="Not scoped"
      />
    );
  }

  const config = CONFIDENCE_CONFIG[confidence];

  return (
    <span
      className={`${sizeClass} rounded-full inline-block flex-shrink-0`}
      style={{ backgroundColor: config.color }}
      title={config.label}
    />
  );
}
