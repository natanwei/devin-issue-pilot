"use client";

import { useState, useEffect, useCallback } from "react";
import { ACU_LIMITS } from "@/lib/constants";

const STORAGE_KEYS = {
  devin: "byok_devin_api_key",
  github: "byok_github_token",
  acuScoping: "acu_limit_scoping",
  acuFixing: "acu_limit_fixing",
} as const;

export interface ApiKeys {
  devinApiKey: string | null;
  githubToken: string | null;
  acuLimitScoping: number;
  acuLimitFixing: number;
}

/** Read/write user-provided API keys from sessionStorage. */
export function useApiKeys() {
  const [keys, setKeysState] = useState<ApiKeys>({
    devinApiKey: null,
    githubToken: null,
    acuLimitScoping: ACU_LIMITS.scoping,
    acuLimitFixing: ACU_LIMITS.fixing,
  });

  // Hydrate from sessionStorage on mount (SSR-safe)
  useEffect(() => {
    const storedScoping = sessionStorage.getItem(STORAGE_KEYS.acuScoping);
    const storedFixing = sessionStorage.getItem(STORAGE_KEYS.acuFixing);
    setKeysState({
      devinApiKey: sessionStorage.getItem(STORAGE_KEYS.devin),
      githubToken: sessionStorage.getItem(STORAGE_KEYS.github),
      acuLimitScoping: parseAcuLimit(storedScoping, ACU_LIMITS.scoping),
      acuLimitFixing: parseAcuLimit(storedFixing, ACU_LIMITS.fixing),
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
      if (sanitized.acuLimitScoping !== undefined) {
        sessionStorage.setItem(STORAGE_KEYS.acuScoping, String(sanitized.acuLimitScoping));
      }
      if (sanitized.acuLimitFixing !== undefined) {
        sessionStorage.setItem(STORAGE_KEYS.acuFixing, String(sanitized.acuLimitFixing));
      }
      return next;
    });
  }, []);

  const clearKeys = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEYS.devin);
    sessionStorage.removeItem(STORAGE_KEYS.github);
    sessionStorage.removeItem(STORAGE_KEYS.acuScoping);
    sessionStorage.removeItem(STORAGE_KEYS.acuFixing);
    setKeysState({
      devinApiKey: null,
      githubToken: null,
      acuLimitScoping: ACU_LIMITS.scoping,
      acuLimitFixing: ACU_LIMITS.fixing,
    });
  }, []);

  const hasKeys = !!(keys.devinApiKey || keys.githubToken);

  return { keys, setKeys, clearKeys, hasKeys };
}

/** Mask a key to show only last 4 characters. */
export function maskKey(key: string): string {
  if (key.length <= 4) return key;
  return "\u2022".repeat(Math.min(key.length - 4, 12)) + key.slice(-4);
}

/** Parse a stored ACU limit. Preserves 0 (unlimited); falls back to default for null/NaN. */
function parseAcuLimit(stored: string | null, fallback: number): number {
  if (stored === null) return fallback;
  const n = parseInt(stored, 10);
  return isNaN(n) ? fallback : Math.max(0, n);
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
