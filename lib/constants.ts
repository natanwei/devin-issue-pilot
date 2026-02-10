import { ConfidenceLevel, IssueStatus } from "./types";

export const DEVIN_API_BASE = "https://api.devin.ai/v1";

export const CONFIDENCE_CONFIG: Record<
  ConfidenceLevel,
  {
    label: string;
    color: string;
    bgColor: string;
    borderColor: string;
  }
> = {
  green: {
    label: "Ready",
    color: "#22c55e",
    bgColor: "rgba(34, 197, 94, 0.12)",
    borderColor: "#22c55e",
  },
  yellow: {
    label: "Needs Input",
    color: "#f59e0b",
    bgColor: "rgba(245, 158, 11, 0.12)",
    borderColor: "#f59e0b",
  },
  red: {
    label: "Unclear",
    color: "#ef4444",
    bgColor: "rgba(239, 68, 68, 0.12)",
    borderColor: "#ef4444",
  },
};

export const STATUS_LABELS: Record<IssueStatus, string> = {
  pending: "Pending",
  scoping: "Scoping...",
  scoped: "Scoped",
  fixing: "Fixing...",
  blocked: "Blocked",
  pr_open: "PR Open",
  awaiting_reply: "Awaiting Reply",
  timed_out: "Timed Out",
  failed: "Failed",
  aborted: "Aborted",
  done: "Done",
};

export const POLLING_INTERVALS: Record<string, number> = {
  scoping: 20_000,
  fixing: 10_000,
  blocked: 30_000,
  default: 15_000,
};

export const ACU_LIMITS = {
  scoping: 3,
  fixing: 15,
};

export const CONFIDENCE_SORT_ORDER: Record<ConfidenceLevel, number> = {
  green: 0,
  yellow: 1,
  red: 2,
};

export const ISSUE_REFRESH_INTERVAL = 60_000; // 60 seconds
