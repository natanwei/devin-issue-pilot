"use client";

import { PRInfo } from "@/lib/types";
import { GitPullRequest, GitBranch, ExternalLink } from "lucide-react";

interface PRCardProps {
  pr: PRInfo;
}

export default function PRCard({ pr }: PRCardProps) {
  return (
    <div
      className="rounded-r-lg bg-[#1a1a1a] p-4 flex flex-col gap-3"
      style={{ borderLeft: "3px solid #22c55e" }}
    >
      {/* PR title row */}
      <div className="flex items-center gap-2.5">
        <GitPullRequest className="h-5 w-5 text-accent-green flex-shrink-0" />
        <span className="text-text-primary text-base font-semibold">
          {pr.title}
        </span>
      </div>

      {/* PR number */}
      <span className="text-text-secondary font-mono text-[13px]">
        #{pr.number}
      </span>

      {/* Branch */}
      <div className="flex items-center gap-1.5">
        <GitBranch className="h-3 w-3 text-text-muted" />
        <span className="text-text-muted font-mono text-xs">
          {pr.branch} → main
        </span>
      </div>

      {/* View PR button */}
      <a
        href={pr.url}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 border border-accent-green text-accent-green text-[13px] font-medium rounded-md px-4 py-1.5 w-fit hover:bg-accent-green/10 transition-colors"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        View Pull Request →
      </a>
    </div>
  );
}

interface FilesChangedProps {
  files: PRInfo["files_changed"];
}

export function FilesChanged({ files }: FilesChangedProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-text-muted text-xs font-semibold uppercase tracking-wider">
        Files Changed
      </span>
      {files.map((f) => (
        <div key={f.path} className="flex items-center gap-1.5">
          <span className="text-text-secondary font-mono text-[13px]">
            {f.path}
          </span>
          <span className="text-accent-green font-mono text-xs">
            ({f.is_new ? `+${f.additions} new` : `+${f.additions} -${f.deletions}`})
          </span>
        </div>
      ))}
    </div>
  );
}

interface StepsCompletedProps {
  steps: string[];
}

export function StepsCompleted({ steps }: StepsCompletedProps) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-text-muted text-xs font-semibold uppercase tracking-wider">
        Steps Completed
      </span>
      {steps.map((step, i) => (
        <div key={i} className="flex items-center gap-2">
          <span className="text-accent-green text-sm">✓</span>
          <span className="text-text-secondary text-sm">{step}</span>
        </div>
      ))}
    </div>
  );
}
