"use client";

import { useState, useEffect, useCallback } from "react";

const STORAGE_KEYS = {
  devin: "byok_devin_api_key",
  github: "byok_github_token",
} as const;

export interface ApiKeys {
  devinApiKey: string | null;
  githubToken: string | null;
}

/** Read/write user-provided API keys from sessionStorage. */
export function useApiKeys() {
  const [keys, setKeysState] = useState<ApiKeys>({
    devinApiKey: null,
    githubToken: null,
  });

  // Hydrate from sessionStorage on mount (SSR-safe)
  useEffect(() => {
    setKeysState({
      devinApiKey: sessionStorage.getItem(STORAGE_KEYS.devin),
      githubToken: sessionStorage.getItem(STORAGE_KEYS.github),
    });
  }, []);

  const setKeys = useCallback((updated: Partial<ApiKeys>) => {
    // Sanitize keys before storing — strip control characters
    const sanitized = { ...updated };
    if (sanitized.devinApiKey) sanitized.devinApiKey = sanitizeHeaderValue(sanitized.devinApiKey);
    if (sanitized.githubToken) sanitized.githubToken = sanitizeHeaderValue(sanitized.githubToken);

    setKeysState((prev) => {
      const next = { ...prev, ...sanitized };
      if (sanitized.devinApiKey !== undefined) {
        if (sanitized.devinApiKey) {
          sessionStorage.setItem(STORAGE_KEYS.devin, sanitized.devinApiKey);
        } else {
          sessionStorage.removeItem(STORAGE_KEYS.devin);
        }
      }
      if (sanitized.githubToken !== undefined) {
        if (sanitized.githubToken) {
          sessionStorage.setItem(STORAGE_KEYS.github, sanitized.githubToken);
        } else {
          sessionStorage.removeItem(STORAGE_KEYS.github);
        }
      }
      return next;
    });
  }, []);

  const clearKeys = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEYS.devin);
    sessionStorage.removeItem(STORAGE_KEYS.github);
    setKeysState({ devinApiKey: null, githubToken: null });
  }, []);

  const hasKeys = !!(keys.devinApiKey || keys.githubToken);

  return { keys, setKeys, clearKeys, hasKeys };
}

/** Mask a key to show only last 4 characters. */
export function maskKey(key: string): string {
  if (key.length <= 4) return key;
  return "\u2022".repeat(Math.min(key.length - 4, 12)) + key.slice(-4);
}

/** Strip control characters that could cause header injection. */
function sanitizeHeaderValue(value: string): string {
  return value.replace(/[\r\n\t]/g, "");
}

/** Build custom headers to send user-provided keys to API routes. */
export function apiKeyHeaders(keys: ApiKeys): Record<string, string> {
  const headers: Record<string, string> = {};
  if (keys.devinApiKey) headers["x-devin-api-key"] = sanitizeHeaderValue(keys.devinApiKey);
  if (keys.githubToken) headers["x-github-token"] = sanitizeHeaderValue(keys.githubToken);
  return headers;
}
