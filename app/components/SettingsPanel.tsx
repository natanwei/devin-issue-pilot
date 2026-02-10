"use client";

import { useState } from "react";
import { Settings, Eye, EyeOff, X, ChevronDown, ChevronUp, ExternalLink, Loader2 } from "lucide-react";
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
  const [scopingAcu, setScopingAcu] = useState(keys.acuLimitScoping);
  const [fixingAcu, setFixingAcu] = useState(keys.acuLimitFixing);
  const [validating, setValidating] = useState(false);
  const [devinError, setDevinError] = useState<string | null>(null);
  const [githubError, setGithubError] = useState<string | null>(null);

  if (!open) return null;

  const hasExistingDevin = !!keys.devinApiKey;
  const hasExistingGithub = !!keys.githubToken;
  const hasAnyKeys = hasExistingDevin || hasExistingGithub;

  async function handleSave() {
    const updates: Partial<ApiKeys> = {};
    if (devinDraft.trim()) updates.devinApiKey = devinDraft.trim();
    if (githubDraft.trim()) updates.githubToken = githubDraft.trim();
    if (scopingAcu !== keys.acuLimitScoping) updates.acuLimitScoping = scopingAcu;
    if (fixingAcu !== keys.acuLimitFixing) updates.acuLimitFixing = fixingAcu;

    if (Object.keys(updates).length === 0) {
      onClose();
      return;
    }

    setDevinError(null);
    setGithubError(null);

    const needsDevinValidation = !!updates.devinApiKey;
    const needsGithubValidation = !!updates.githubToken;

    if (needsDevinValidation || needsGithubValidation) {
      setValidating(true);
      try {
        const results = await Promise.all([
          needsDevinValidation
            ? fetch("/api/devin/validate", {
                headers: { "x-devin-api-key": updates.devinApiKey! },
              }).then((r) => r.json()).catch(() => ({ valid: false, error: "Network error" }))
            : null,
          needsGithubValidation
            ? fetch("/api/github/validate", {
                headers: { "x-github-token": updates.githubToken! },
              }).then((r) => r.json()).catch(() => ({ valid: false, error: "Network error" }))
            : null,
        ]);

        const [devinResult, githubResult] = results;
        let hasError = false;

        if (devinResult && !devinResult.valid) {
          setDevinError(devinResult.error || "Invalid API key");
          hasError = true;
        }
        if (githubResult && !githubResult.valid) {
          setGithubError(githubResult.error || "Invalid token");
          hasError = true;
        }

        if (hasError) {
          setValidating(false);
          return;
        }
      } catch {
        setValidating(false);
        return;
      }
      setValidating(false);
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
    setScopingAcu(3);
    setFixingAcu(15);
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
                  <span className="text-text-muted text-xs">
                    Create a <strong className="text-text-secondary">Personal</strong> key (starts with <code className="text-accent-blue">apk_user_</code>)
                  </span>
                  <a
                    href="https://app.devin.ai/settings/api-keys"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue text-xs hover:underline inline-flex items-center gap-1"
                  >
                    app.devin.ai/settings/api-keys <ExternalLink className="h-3 w-3" />
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
                    href="https://app.devin.ai/settings/integrations"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-accent-blue text-xs hover:underline inline-flex items-center gap-1"
                  >
                    app.devin.ai/settings/integrations <ExternalLink className="h-3 w-3" />
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
                onChange={(e) => {
                  setDevinDraft(e.target.value);
                  if (devinError) setDevinError(null);
                }}
                placeholder="apk_user_..."
                className={`w-full bg-elevated border rounded-md px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-colors ${
                  devinError ? "border-accent-red focus:border-accent-red" : "border-border-subtle focus:border-accent-blue"
                }`}
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
          {devinError && (
            <p className="text-accent-red text-xs">{devinError}</p>
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
                onChange={(e) => {
                  setGithubDraft(e.target.value);
                  if (githubError) setGithubError(null);
                }}
                placeholder="ghp_..."
                className={`w-full bg-elevated border rounded-md px-3 py-2 pr-10 text-sm text-text-primary placeholder:text-text-muted focus:outline-none transition-colors ${
                  githubError ? "border-accent-red focus:border-accent-red" : "border-border-subtle focus:border-accent-blue"
                }`}
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
          {githubError && (
            <p className="text-accent-red text-xs">{githubError}</p>
          )}
        </div>

        {/* ACU Limits */}
        <div className="flex flex-col gap-3">
          <div className="flex flex-col">
            <span className="text-text-secondary text-sm font-medium">
              ACU Limits
            </span>
            <span className="text-text-muted text-xs">
              Max compute credits per session
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="text-text-secondary text-sm">Scoping</label>
              <div className="flex items-center gap-2">
                {scopingAcu > 0 && (
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={scopingAcu}
                    onChange={(e) => setScopingAcu(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 bg-elevated border border-border-subtle rounded-md px-2 py-1.5 text-sm text-text-primary text-center focus:outline-none focus:border-accent-blue transition-colors"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setScopingAcu(scopingAcu === 0 ? (keys.acuLimitScoping || 3) : 0)}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${
                    scopingAcu === 0
                      ? "bg-accent-blue/20 text-accent-blue"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  No limit
                </button>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <label className="text-text-secondary text-sm">Fixing</label>
              <div className="flex items-center gap-2">
                {fixingAcu > 0 && (
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={fixingAcu}
                    onChange={(e) => setFixingAcu(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-16 bg-elevated border border-border-subtle rounded-md px-2 py-1.5 text-sm text-text-primary text-center focus:outline-none focus:border-accent-blue transition-colors"
                  />
                )}
                <button
                  type="button"
                  onClick={() => setFixingAcu(fixingAcu === 0 ? (keys.acuLimitFixing || 15) : 0)}
                  className={`text-xs px-2 py-1 rounded-md transition-colors ${
                    fixingAcu === 0
                      ? "bg-accent-blue/20 text-accent-blue"
                      : "text-text-muted hover:text-text-secondary"
                  }`}
                >
                  No limit
                </button>
              </div>
            </div>
          </div>
          {(scopingAcu === 0 || fixingAcu === 0) && (
            <p className="text-accent-amber text-xs">
              Removing limits is not recommended — sessions may consume unexpected ACUs.
            </p>
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
              disabled={validating}
              className="px-4 py-2 rounded-md bg-accent-purple text-white text-sm font-semibold hover:bg-accent-purple/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {validating && <Loader2 className="h-4 w-4 animate-spin" />}
              {validating ? "Validating..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
