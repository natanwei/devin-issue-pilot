import { describe, it, expect } from "vitest";
import { prBodyContainsCloseKeyword } from "@/lib/github";
import { createFixSession } from "@/lib/devin";

describe("prBodyContainsCloseKeyword", () => {
  it("returns false for null body", () => {
    expect(prBodyContainsCloseKeyword(null, 30)).toBe(false);
  });

  it("returns false for empty string body", () => {
    expect(prBodyContainsCloseKeyword("", 30)).toBe(false);
  });

  it("returns true when body contains 'Closes #N'", () => {
    expect(prBodyContainsCloseKeyword("Some changes\n\nCloses #30", 30)).toBe(true);
  });

  it("returns true when body contains 'Fixes #N'", () => {
    expect(prBodyContainsCloseKeyword("Fixes #30", 30)).toBe(true);
  });

  it("returns true when body contains 'Resolves #N'", () => {
    expect(prBodyContainsCloseKeyword("Resolves #30", 30)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(prBodyContainsCloseKeyword("closes #30", 30)).toBe(true);
    expect(prBodyContainsCloseKeyword("CLOSES #30", 30)).toBe(true);
    expect(prBodyContainsCloseKeyword("FIXES #30", 30)).toBe(true);
  });

  it("returns false when issue number does not match", () => {
    expect(prBodyContainsCloseKeyword("Closes #99", 30)).toBe(false);
  });

  it("returns false when body has no close keyword", () => {
    expect(prBodyContainsCloseKeyword("Just some PR description about #30", 30)).toBe(false);
  });

  it("handles close keyword with extra spaces", () => {
    expect(prBodyContainsCloseKeyword("Closes  #30", 30)).toBe(true);
  });

  it("does not match partial issue numbers (e.g. #300 when checking #30)", () => {
    expect(prBodyContainsCloseKeyword("Closes #300", 30)).toBe(false);
  });

  it("matches when close keyword is embedded in longer text", () => {
    expect(
      prBodyContainsCloseKeyword(
        "This PR implements the fix.\n\nCloses #30\n\nSigned-off-by: dev",
        30,
      ),
    ).toBe(true);
  });
});

describe("Fix prompt includes 'Closes #N' instruction", () => {
  it("prompt text contains the CRITICAL PR Description Requirement block", async () => {
    let capturedPrompt = "";
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      if (typeof input === "string" && input.includes("/sessions")) {
        const body = JSON.parse(init?.body as string);
        capturedPrompt = body.prompt;
        return new Response(JSON.stringify({ session_id: "test", url: "http://test" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return originalFetch(input, init);
    };

    try {
      await createFixSession({
        issueTitle: "Test issue",
        issueBody: "Test body",
        issueNumber: 42,
        repo: "owner/repo",
        acuLimit: 10,
        devinApiKey: "test-key",
        scopingResult: {
          current_behavior: "broken",
          requested_fix: "fix it",
          files_to_modify: ["file.ts"],
          action_plan: ["step 1"],
          tests_needed: "test it",
        },
      });

      expect(capturedPrompt).toContain("CRITICAL");
      expect(capturedPrompt).toContain("Closes #42");
      expect(capturedPrompt).toContain("PR description MUST contain");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
