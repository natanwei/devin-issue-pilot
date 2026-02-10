"use client";

import { useState } from "react";
import { Bot, Settings } from "lucide-react";
import { useApiKeys } from "@/lib/api-keys";
import SettingsPanel from "./SettingsPanel";

interface RepoConnectProps {
  onConnect: (repo: { owner: string; name: string }, mode: "demo" | "live") => void;
}

export default function RepoConnect({ onConnect }: RepoConnectProps) {
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const { keys, setKeys, clearKeys } = useApiKeys();

  function parseRepoInput(value: string): { owner: string; name: string } | null {
    // Handle full GitHub URLs
    const urlMatch = value.match(
      /github\.com\/([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)/
    );
    if (urlMatch) {
      return { owner: urlMatch[1].toLowerCase(), name: urlMatch[2].toLowerCase() };
    }
    // Handle owner/repo format
    const parts = value.trim().split("/");
    if (parts.length === 2 && parts[0] && parts[1]) {
      return { owner: parts[0].toLowerCase(), name: parts[1].toLowerCase() };
    }
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const repo = parseRepoInput(input);
    if (!repo) {
      setError("Enter a valid owner/repo or GitHub URL");
      return;
    }
    setError("");
    onConnect(repo, "live");
  }

  function handleDemo() {
    onConnect(
      { owner: "natan", name: "devin-issue-pilot-demo" },
      "demo"
    );
  }

  return (
    <div className="min-h-screen bg-page flex flex-col items-center justify-center p-4">
      <div className="flex flex-col items-center gap-6 w-full max-w-md">
        <div className="bg-dp-card rounded-lg p-12 w-full flex flex-col items-center gap-6 relative">
          {/* Settings gear */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="absolute top-4 right-4 text-text-muted hover:text-text-secondary transition-colors"
            title="API Keys"
          >
            <Settings className="h-5 w-5" />
          </button>

          {/* Logo + Title */}
          <div className="flex flex-col items-center gap-2">
            <div className="text-accent-purple">
              <Bot className="h-10 w-10" />
            </div>
            <h1 className="text-text-primary text-2xl font-semibold">
              Devin Issue Pilot
            </h1>
            <p className="text-text-secondary text-sm">
              Scope and fix GitHub issues with Devin
            </p>
          </div>

          {/* Input */}
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-3">
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setError("");
              }}
              placeholder="owner/repo or paste GitHub URL"
              className="w-full bg-elevated border border-border-subtle rounded-md px-4 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent-blue transition-colors"
            />
            {error && (
              <p className="text-accent-red text-xs">{error}</p>
            )}
            <button
              type="submit"
              className="w-full bg-accent-blue hover:bg-accent-blue/90 text-white font-semibold py-2.5 rounded-md transition-colors text-sm"
            >
              Connect Repository
            </button>
          </form>

          <p className="text-text-muted text-xs text-center">
            Without custom API keys, only public repos can be scoped and PRs cannot be created.{" "}
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-accent-blue hover:underline"
            >
              Configure keys
            </button>
          </p>

          {/* Demo link */}
          <button
            onClick={handleDemo}
            className="text-sm text-accent-blue underline underline-offset-2 hover:text-text-secondary transition-colors"
          >
            Preview UI with sample data
          </button>
        </div>

        {/* Footer */}
        <p className="text-text-muted text-xs">Powered by Devin API v1</p>
      </div>

      <SettingsPanel
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        keys={keys}
        onSave={setKeys}
        onClear={clearKeys}
      />
    </div>
  );
}
