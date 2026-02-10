import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { buildIssueMetaText, getTimeSince } from "@/lib/formatting";

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-02-10T12:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("buildIssueMetaText", () => {
  it("returns only 'N days ago' without a leading dot when fileCount=0 and totalLines=0", () => {
    const result = buildIssueMetaText(0, 0, "2026-02-07T12:00:00Z");
    expect(result).toBe("3 days ago");
    expect(result).not.toMatch(/^[· ]/);
  });

  it("returns 'N files · N days ago' with a dot when fileCount > 0", () => {
    const result = buildIssueMetaText(2, 0, "2026-02-07T12:00:00Z");
    expect(result).toBe("2 files · 3 days ago");
  });

  it("returns 'N files · ~M lines · N days ago' with dots when both fileCount > 0 and totalLines > 0", () => {
    const result = buildIssueMetaText(3, 150, "2026-02-07T12:00:00Z");
    expect(result).toBe("3 files · ~150 lines · 3 days ago");
  });

  it("returns empty string when all inputs are zero/null", () => {
    const result = buildIssueMetaText(0, 0, null);
    expect(result).toBe("");
  });

  it("returns only file count when totalLines=0 and no created_at", () => {
    const result = buildIssueMetaText(1, 0, null);
    expect(result).toBe("1 file");
  });

  it("returns only lines when fileCount=0 and no created_at", () => {
    const result = buildIssueMetaText(0, 200, null);
    expect(result).toBe("~200 lines");
  });

  it("uses singular 'file' for fileCount=1", () => {
    const result = buildIssueMetaText(1, 50, "2026-02-07T12:00:00Z");
    expect(result).toBe("1 file · ~50 lines · 3 days ago");
  });

  it("uses plural 'files' for fileCount > 1", () => {
    const result = buildIssueMetaText(5, 0, null);
    expect(result).toBe("5 files");
  });
});

describe("buildIssueMetaText with isStale prefix (integration logic)", () => {
  it("when isStale=true and meta text exists, the component would prepend ' · '", () => {
    const meta = buildIssueMetaText(0, 0, "2026-02-07T12:00:00Z");
    const isStale = true;
    const rendered = meta ? (isStale ? ` · ${meta}` : meta) : "";
    expect(rendered).toBe(" · 3 days ago");
  });

  it("when isStale=false, no leading dot", () => {
    const meta = buildIssueMetaText(0, 0, "2026-02-07T12:00:00Z");
    const isStale = false;
    const rendered = meta ? (isStale ? ` · ${meta}` : meta) : "";
    expect(rendered).toBe("3 days ago");
  });

  it("when isStale=true and meta is empty, returns empty", () => {
    const meta = buildIssueMetaText(0, 0, null);
    const isStale = true;
    const rendered = meta ? (isStale ? ` · ${meta}` : meta) : "";
    expect(rendered).toBe("");
  });

  it("all three present (Outdated + files + lines + days ago) renders correctly", () => {
    const meta = buildIssueMetaText(4, 300, "2026-02-07T12:00:00Z");
    const isStale = true;
    const rendered = meta ? (isStale ? ` · ${meta}` : meta) : "";
    expect(rendered).toBe(" · 4 files · ~300 lines · 3 days ago");
  });
});

describe("getTimeSince", () => {
  it("returns days ago", () => {
    expect(getTimeSince("2026-02-07T12:00:00Z")).toBe("3 days ago");
  });

  it("returns singular day", () => {
    expect(getTimeSince("2026-02-09T12:00:00Z")).toBe("1 day ago");
  });

  it("returns hours ago", () => {
    expect(getTimeSince("2026-02-10T09:00:00Z")).toBe("3 hours ago");
  });

  it("returns minutes ago", () => {
    expect(getTimeSince("2026-02-10T11:55:00Z")).toBe("5m ago");
  });

  it("returns just now", () => {
    expect(getTimeSince("2026-02-10T12:00:00Z")).toBe("just now");
  });
});
