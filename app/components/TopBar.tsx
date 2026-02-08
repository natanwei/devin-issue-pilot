"use client";

import { Bot, X } from "lucide-react";
import { DashboardIssue } from "@/lib/types";

interface TopBarProps {
  repo: { owner: string; name: string };
  mode: "demo" | "live";
  issues: DashboardIssue[];
  onDisconnect: () => void;
  onToggleMode: () => void;
}

export default function TopBar({
  repo,
  mode,
  issues,
  onDisconnect,
  onToggleMode,
}: TopBarProps) {
  const totalIssues = issues.length;
  const scopedCount = issues.filter(
    (i) => i.status !== "pending" && i.status !== "scoping"
  ).length;
  const allScoped = scopedCount === totalIssues && totalIssues > 0;

  const greenCount = issues.filter((i) => i.confidence === "green").length;
  const yellowCount = issues.filter((i) => i.confidence === "yellow").length;
  const redCount = issues.filter((i) => i.confidence === "red").length;

  return (
    <div className="flex items-center justify-between h-14 px-4 md:px-6 bg-dp-card border-b border-border-subtle sticky top-0 z-30">
      {/* Left section */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-accent-purple" />
          <span className="text-text-secondary text-sm font-semibold">
            Devin Issue Pilot
          </span>
        </div>
        <span className="text-text-muted text-sm">·</span>
        <div className="flex items-center gap-2 bg-elevated rounded-full px-2.5 py-1 h-7">
          <span className="text-text-secondary text-xs font-mono">
            {repo.owner}/{repo.name}
          </span>
          <button
            onClick={onDisconnect}
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-4 text-[13px]">
        <span className="text-text-secondary hidden sm:inline">
          {totalIssues} issues
        </span>
        <span className="text-[#444444] hidden sm:inline">·</span>
        <span className="hidden md:inline">
          {allScoped ? (
            <span className="text-accent-green">All scoped</span>
          ) : (
            <span className="text-text-secondary">
              {scopedCount}/{totalIssues} scoped
            </span>
          )}
        </span>
        <span className="text-[#444444] hidden md:inline">·</span>
        <div className="flex items-center gap-3">
          <span className="text-accent-green">{greenCount}</span>
          <span className="text-accent-amber">{yellowCount}</span>
          <span className="text-accent-red">{redCount}</span>
        </div>
        <span className="text-[#444444]">·</span>
        <button
          onClick={onToggleMode}
          className="text-text-muted hover:text-text-secondary transition-colors text-xs"
        >
          {mode === "demo" ? "Demo" : "Live"}
        </button>
      </div>
    </div>
  );
}
