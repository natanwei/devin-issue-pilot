"use client";

import { ACU_LIMITS } from "@/lib/constants";
import { AlertTriangle } from "lucide-react";

interface ACUModalProps {
  issueCount: number;
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export default function ACUModal({
  issueCount,
  open,
  onClose,
  onConfirm,
}: ACUModalProps) {
  if (!open) return null;

  const estimatedACUs = issueCount * ACU_LIMITS.scoping;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-dp-card border border-border-subtle rounded-lg shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-amber/10">
            <AlertTriangle className="h-5 w-5 text-accent-amber" />
          </div>
          <div className="flex flex-col">
            <span className="text-text-primary text-base font-semibold">
              Confirm ACU Usage
            </span>
            <span className="text-text-muted text-sm">
              This will consume Devin compute credits
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="bg-elevated rounded-md p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-sm">Issues to scope</span>
            <span className="text-text-primary font-mono text-sm font-medium">
              {issueCount}
            </span>
          </div>
          <div className="h-px bg-border-subtle" />
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-sm">ACUs per issue</span>
            <span className="text-text-primary font-mono text-sm font-medium">
              {ACU_LIMITS.scoping}
            </span>
          </div>
          <div className="h-px bg-border-subtle" />
          <div className="flex items-center justify-between">
            <span className="text-text-secondary text-sm font-medium">
              Estimated total
            </span>
            <span className="text-accent-amber font-mono text-sm font-semibold">
              ~{estimatedACUs} ACUs
            </span>
          </div>
        </div>

        {/* Fine print */}
        <p className="text-text-muted text-xs leading-relaxed">
          Each issue will be scoped in a separate Devin session with a maximum of{" "}
          {ACU_LIMITS.scoping} ACUs. Actual usage may be lower. Fix sessions use
          up to {ACU_LIMITS.fixing} ACUs each and require separate confirmation.
        </p>

        {/* Buttons */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-md border border-border-subtle text-text-secondary text-sm font-medium hover:bg-elevated transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="px-4 py-2 rounded-md bg-accent-amber text-black text-sm font-semibold hover:bg-accent-amber/90 transition-colors"
          >
            Start Scoping
          </button>
        </div>
      </div>
    </div>
  );
}
