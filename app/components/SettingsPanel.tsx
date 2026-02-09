"use client";

import { useState } from "react";
import { Settings, Eye, EyeOff, X, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { ApiKeys, maskKey } from "@/lib/api-keys";

interface SettingsPanelProps {
  open: boolean;
  onClose: () => void;
  keys: ApiKeys;
  onSave: (keys: Partial<ApiKeys>) => void;
  onClear: () => void;
}

export default function SettingsPanel({
  open,
  onClose,
  keys,
  onSave,
  onClear,
}: SettingsPanelProps) {
  const [devinDraft, setDevinDraft] = useState("");
  const [githubDraft, setGithubDraft] = useState("");
  const [showDevin, setShowDevin] = useState(false);
  const [showGithub, setShowGithub] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  if (!open) return null;

  const hasExistingDevin = !!keys.devinApiKey;
  const hasExistingGithub = !!keys.githubToken;
  const hasAnyKeys = hasExistingDevin || hasExistingGithub;

  function handleSave() {
    const updates: Partial<ApiKeys> = {};
    if (devinDraft.trim()) updates.devinApiKey = devinDraft.trim();
    if (githubDraft.trim()) updates.githubToken = githubDraft.trim();

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    onSave(updates);
    setDevinDraft("");
    setGithubDraft("");
    onClose();
  }

  function handleClear() {
    onClear();
    setDevinDraft("");
    setGithubDraft("");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-dp-card border border-border-subtle rounded-lg shadow-2xl w-full max-w-md mx-4 p-6 flex flex-col gap-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-full bg-accent-purple/10">
              <Settings className="h-5 w-5 text-accent-purple" />
            </div>
            <div className="flex flex-col">
              <span className="text-text-primary text-base font-semibold">
                API Keys
              </span>
              <span className="text-text-muted text-sm">
                Stored in browser session only
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-muted hover:text-text-secondary transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Setup Guide */}
        <div className="border border-border-subtle rounded-md overflow-hidden shrink-0">
          <button
            onClick={() => setGuideOpen(!guideOpen)}
            className="w-full flex items-center justify-between px-3 py-2.5 bg-elevated hover:bg-elevated/80 transition-colors"
          >
            <span className="text-text-secondary text-sm font-medium">
              Setup Guide
            </span>
            {guideOpen ? (
              <ChevronUp className="h-4 w-4 text-text-muted" />
            ) : (
              <ChevronDown className="h-4 w-4 text-text-muted" />
            )}
          </button>
          {guideOpen && (
            <div className="px-3 py-3 flex flex-col gap-3 text-sm max-h-[200px] overflow-y-auto">
              <div className="flex gap-2.5">
                <span className="text-accent-purple font-semibold shrink-0">1.</span>
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary font-medium">Get your Devin API key</span>
                  <a
                    href="https://app.devin.ai/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue text-xs hover:underline inline-flex items-center gap-1"
                  >
                    app.devin.ai/settings <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="text-accent-purple font-semibold shrink-0">2.</span>
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary font-medium">Create a GitHub token</span>
                  <span className="text-text-muted text-xs">
                    <code className="text-accent-blue">public_repo</code> — public repos only<br />
                    <code className="text-accent-blue">repo</code> — full access including private repos
                  </span>
                  <a
                    href="https://github.com/settings/tokens/new?scopes=repo&description=Devin+Issue+Pilot"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue text-xs hover:underline inline-flex items-center gap-1"
                  >
                    Create token on GitHub <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
              <div className="flex gap-2.5">
                <span className="text-accent-purple font-semibold shrink-0">3.</span>
                <div className="flex flex-col gap-1">
                  <span className="text-text-secondary font-medium">Install the Devin GitHub App</span>
                  <span className="text-text-muted text-xs">
                    Go to Integrations &rarr; GitHub &rarr; Add Connection. Grant access to the repos you want Devin to work on (public or private). Devin needs this to create branches and PRs &mdash; without it, scoping works but fixes will fail.
                  </span>
                  <a
                    href="https://app.devin.ai/settings"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue text-xs hover:underline inline-flex items-center gap-1"
                  >
                    app.devin.ai/settings <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Devin API Key */}
        <div className="flex flex-col gap-2">
          <label className="text-text-secondary text-sm font-medium">
            Devin API Key
          </label>
          {hasExistingDevin && !devinDraft ? (
            <div className="flex items-center gap-2 bg-elevated rounded-md px-3 py-2">
              <span className="text-text-secondary text-sm font-mono flex-1">
                {maskKey(keys.devinApiKey!)}
              </span>
              <button
                onClick={() => setDevinDraft(" ")}
                className="text-accent-blue text-xs hover:opacity-80 transition-opacity"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type={showDevin ? "text" : "password"}
                value={devinDraft.trim() === "" ? devinDraft.trimStart() : devinDraft}
                onChange={(e) => setDevinDraft(e.target.value)}
                placeholder="apk_user_..."
                className="w-full bg-elevated border border-border-subtle rounded-md px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
                autoComplete="off"
              />
              <button
                onClick={() => setShowDevin(!showDevin)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              >
                {showDevin ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* GitHub Token */}
        <div className="flex flex-col gap-2">
          <label className="text-text-secondary text-sm font-medium">
            GitHub Token
          </label>
          {hasExistingGithub && !githubDraft ? (
            <div className="flex items-center gap-2 bg-elevated rounded-md px-3 py-2">
              <span className="text-text-secondary text-sm font-mono flex-1">
                {maskKey(keys.githubToken!)}
              </span>
              <button
                onClick={() => setGithubDraft(" ")}
                className="text-accent-blue text-xs hover:opacity-80 transition-opacity"
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                type={showGithub ? "text" : "password"}
                value={githubDraft.trim() === "" ? githubDraft.trimStart() : githubDraft}
                onChange={(e) => setGithubDraft(e.target.value)}
                placeholder="ghp_..."
                className="w-full bg-elevated border border-border-subtle rounded-md px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
                autoComplete="off"
              />
              <button
                onClick={() => setShowGithub(!showGithub)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted hover:text-text-secondary transition-colors"
              >
                {showGithub ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            </div>
          )}
        </div>

        {/* Info text */}
        <p className="text-text-muted text-xs leading-relaxed">
          Keys are stored in sessionStorage and cleared when you close this tab.
          They are sent per-request and never persisted server-side. If not
          provided, the server&apos;s default keys are used (public repos only, no PR creation).
        </p>

        {/* Buttons */}
        <div className="flex items-center justify-between">
          <div>
            {hasAnyKeys && (
              <button
                onClick={handleClear}
                className="text-accent-red text-sm hover:opacity-80 transition-opacity"
              >
                Clear All Keys
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-md border border-border-subtle text-text-secondary text-sm font-medium hover:bg-elevated transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 rounded-md bg-accent-purple text-white text-sm font-semibold hover:bg-accent-purple/90 transition-colors"
            >
              Save
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
