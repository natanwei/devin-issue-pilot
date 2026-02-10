import { describe, it, expect } from "vitest";
import { DEFAULT_REPO_OWNER } from "@/lib/constants";

function computeCanFix(
  repoOwner: string,
  devinApiKey: string | null,
  githubToken: string | null
): boolean {
  return (
    repoOwner.toLowerCase() === DEFAULT_REPO_OWNER ||
    (!!devinApiKey && !!githubToken)
  );
}

describe("canFix gate logic", () => {
  it("returns true when repo owner matches default owner", () => {
    expect(computeCanFix("natanwei", null, null)).toBe(true);
  });

  it("returns true when repo owner matches default owner (case-insensitive)", () => {
    expect(computeCanFix("NatanWei", null, null)).toBe(true);
    expect(computeCanFix("NATANWEI", null, null)).toBe(true);
  });

  it("returns true when owner differs but both BYOK keys are provided", () => {
    expect(computeCanFix("other-user", "dv_key_123", "ghp_token_456")).toBe(true);
  });

  it("returns false when owner differs and only devinApiKey is provided", () => {
    expect(computeCanFix("other-user", "dv_key_123", null)).toBe(false);
  });

  it("returns false when owner differs and only githubToken is provided", () => {
    expect(computeCanFix("other-user", null, "ghp_token_456")).toBe(false);
  });

  it("returns false when owner differs and no keys are provided", () => {
    expect(computeCanFix("other-user", null, null)).toBe(false);
  });

  it("returns false when owner differs and keys are empty strings", () => {
    expect(computeCanFix("other-user", "", "")).toBe(false);
  });

  it("returns true for default owner even when both keys are also provided", () => {
    expect(computeCanFix("natanwei", "dv_key_123", "ghp_token_456")).toBe(true);
  });
});

describe("DEFAULT_REPO_OWNER constant", () => {
  it("is defined as 'natanwei'", () => {
    expect(DEFAULT_REPO_OWNER).toBe("natanwei");
  });
});
