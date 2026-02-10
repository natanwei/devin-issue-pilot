"use client";

import { Bot, X, RefreshCw, Settings } from "lucide-react";
import { DashboardIssue } from "@/lib/types";

interface TopBarProps {
  repo: { owner: string; name: string };
  mode: "demo" | "live";
  initialMode: "demo" | "live";
  issues: DashboardIssue[];
  onDisconnect: () => void;
  onToggleMode: () => void;
  onRefresh: () => void;
  onOpenSettings: () => void;
  hasUserKeys: boolean;
  loading: boolean;
}

export default function TopBar({
  repo,
  mode,
  initialMode,
  issues,
  onDisconnect,
  onToggleMode,
  onRefresh,
  onOpenSettings,
  hasUserKeys,
  loading,
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
    <div className="flex items-center justify-between h-14 px-3 sm:px-4 md:px-6 bg-dp-card border-b border-border-subtle sticky top-0 z-30">
      {/* Left section */}
      <div className="flex items-center gap-2 sm:gap-4 min-w-0">
        <div className="flex items-center gap-2 flex-shrink-0">
          <Bot className="h-5 w-5 text-accent-purple" />
          <span className="text-text-secondary text-sm font-semibold hidden sm:inline">
            Devin Issue Pilot
          </span>
        </div>
        <span className="text-text-muted text-sm hidden sm:inline">·</span>
        <div className="flex items-center gap-2 bg-elevated rounded-full px-2.5 py-1 h-7 min-w-0">
          <span className="text-text-secondary text-xs font-mono truncate">
            {mode === "demo" ? "sample/project" : `${repo.owner}/${repo.name}`}
          </span>
          <button
            onClick={onDisconnect}
            className="text-text-muted hover:text-text-secondary transition-colors flex-shrink-0"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center gap-2 sm:gap-4 text-[13px] flex-shrink-0">
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
        <span className="text-[#444444] hidden sm:inline">·</span>
        <button
          onClick={onRefresh}
          className="text-text-muted hover:text-text-secondary transition-colors"
          title="Refresh issues"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
        </button>
        <button
          onClick={onOpenSettings}
          className="text-text-muted hover:text-text-secondary transition-colors relative"
          title="API Key Settings"
        >
          <Settings className="h-3.5 w-3.5" />
          {hasUserKeys && (
            <span className="absolute -top-0.5 -right-0.5 h-1.5 w-1.5 rounded-full bg-accent-green" />
          )}
        </button>
        {initialMode === "demo" ? (
          <span className="bg-elevated rounded-full px-2.5 py-1 text-xs font-medium text-text-secondary flex-shrink-0">
            Preview
          </span>
        ) : (
          <div className="flex items-center bg-elevated rounded-full p-0.5 gap-0.5 flex-shrink-0">
            <button
              onClick={mode === "live" ? onToggleMode : undefined}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                mode === "demo"
                  ? "bg-dp-card text-text-primary"
                  : "text-text-muted hover:text-text-secondary cursor-pointer"
              }`}
            >
              Preview
            </button>
            <button
              onClick={mode === "demo" ? onToggleMode : undefined}
              className={`px-2 py-0.5 rounded-full text-xs font-medium transition-colors ${
                mode === "live"
                  ? "bg-accent-blue text-white"
                  : "text-text-muted hover:text-text-secondary cursor-pointer"
              }`}
            >
              Live
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
