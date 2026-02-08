"use client";

import { IssueStatus } from "@/lib/types";
import { STATUS_LABELS } from "@/lib/constants";
import { RefreshCw, Check, Clock, XCircle, AlertTriangle } from "lucide-react";

interface StatusIndicatorProps {
  status: IssueStatus;
}

export default function StatusIndicator({ status }: StatusIndicatorProps) {
  const label = STATUS_LABELS[status];

  switch (status) {
    case "scoping":
      return (
        <span className="flex items-center gap-1.5 text-text-muted text-sm">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Scoping...</span>
        </span>
      );

    case "fixing":
      return (
        <span className="flex items-center gap-1.5 text-accent-blue text-sm">
          <RefreshCw className="h-3 w-3 animate-spin" />
          <span>Fixing...</span>
        </span>
      );

    case "done":
    case "pr_open":
      return (
        <span className="flex items-center gap-1.5 text-accent-green text-sm">
          <Check className="h-3 w-3" />
          <span>{status === "pr_open" ? "View PR →" : "Done"}</span>
        </span>
      );

    case "blocked":
      return (
        <span className="flex items-center gap-1.5 text-accent-amber text-sm">
          <AlertTriangle className="h-3 w-3" />
          <span>Blocked</span>
        </span>
      );

    case "awaiting_reply":
      return (
        <span className="flex items-center gap-1.5 text-accent-amber text-sm">
          <span>Awaiting Reply</span>
        </span>
      );

    case "timed_out":
      return (
        <span className="flex items-center gap-1.5 text-text-muted text-sm">
          <Clock className="h-3 w-3" />
          <span>Timed Out</span>
        </span>
      );

    case "failed":
      return (
        <span className="flex items-center gap-1.5 text-accent-red text-sm">
          <XCircle className="h-3 w-3" />
          <span>Failed</span>
        </span>
      );

    case "aborted":
      return (
        <span className="flex items-center gap-1.5 text-text-muted text-sm">
          <span>Aborted</span>
        </span>
      );

    case "scoped":
      return (
        <span className="text-accent-blue text-sm font-medium">Review</span>
      );

    default:
      return (
        <span className="text-text-muted text-sm">{label}</span>
      );
  }
}
