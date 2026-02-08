"use client";

import { ExternalLink, X } from "lucide-react";

interface ActiveSessionBannerProps {
  issueNumber: number;
  sessionType: "scoping" | "fixing";
  sessionUrl: string;
  onDismiss: () => void;
}

export default function ActiveSessionBanner({
  issueNumber,
  sessionType,
  sessionUrl,
  onDismiss,
}: ActiveSessionBannerProps) {
  return (
    <div className="w-full bg-accent-blue/10 border-t-2 border-t-accent-blue px-4 py-2.5 flex items-center justify-between">
      <div className="flex items-center gap-2 text-sm">
        <span className="text-accent-blue font-semibold">
          Devin is {sessionType === "scoping" ? "scoping" : "fixing"} #{issueNumber}
        </span>
        <span className="text-text-muted">|</span>
        <a
          href={sessionUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-accent-blue text-[13px] hover:underline"
        >
          <ExternalLink className="h-3 w-3" />
          Watch live
        </a>
      </div>
      <button
        onClick={onDismiss}
        className="text-text-muted hover:text-text-secondary transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
