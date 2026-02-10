import { describe, it, expect } from "vitest";
import {
  formatScopingComment,
  formatReadyComment,
  formatGreenScopedComment,
  formatBlockedComment,
  formatDoneComment,
  isDevinComment,
  isDuplicateMessage,
} from "@/lib/comment-templates";
import type { ScopingResult, BlockerInfo } from "@/lib/types";

const SCOPING_FIXTURE: ScopingResult = {
  confidence: "yellow",
  confidence_reason: "Mostly clear but some questions remain",
  current_behavior: "Endpoint returns 500 when DB is down",
  requested_fix: "Return 200 with degraded status",
  files_to_modify: ["src/routes/health.ts"],
  tests_needed: "Add test for unreachable DB",
  action_plan: ["Update error handler", "Add try-catch"],
  risks: ["Downstream services may depend on 500"],
  open_questions: [
    "Should we use Socket.IO or native WebSocket?",
    "Do you want per-user channels?",
  ],
};

const BLOCKER_FIXTURE: BlockerInfo = {
  what_happened: "The database.ts file uses a custom pool wrapper",
  suggestion: "Add a .isHealthy() method to the DBPool class",
};

describe("formatScopingComment", () => {
  it("includes header, confidence, questions, and branded footer", () => {
    const result = formatScopingComment(14, SCOPING_FIXTURE);

    expect(result).toContain("Devin scoped this issue");
    expect(result).toContain("**Confidence:** yellow");
    expect(result).toContain("Mostly clear but some questions remain");
    expect(result).toContain("**Questions:**");
    expect(result).toContain("- Should we use Socket.IO or native WebSocket?");
    expect(result).toContain("- Do you want per-user channels?");
    expect(result).toContain("**Current behavior:** Endpoint returns 500");
    expect(result).toContain("**Requested fix:** Return 200 with degraded");
    expect(result).toContain("Reply to this comment and Devin will incorporate");
    expect(result).toContain("Issue #14");
    expect(result).toContain("Devin Issue Pilot");
  });

  it("omits questions section when open_questions is empty", () => {
    const noQuestions: ScopingResult = {
      ...SCOPING_FIXTURE,
      open_questions: [],
    };
    const result = formatScopingComment(5, noQuestions);

    expect(result).not.toContain("**Questions:**");
    expect(result).toContain("Issue #5");
  });
});

describe("formatBlockedComment", () => {
  it("includes header, blocker details, suggestion, and footer", () => {
    const result = formatBlockedComment(3, BLOCKER_FIXTURE);

    expect(result).toContain("Devin is blocked and needs input");
    expect(result).toContain("**What happened:** The database.ts file");
    expect(result).toContain("Add a .isHealthy() method");
    expect(result).toContain("Reply to this comment to unblock Devin");
    expect(result).toContain("Issue #3");
  });

  it("omits suggestion when empty", () => {
    const noSuggestion: BlockerInfo = {
      what_happened: "Something went wrong",
      suggestion: "",
    };
    const result = formatBlockedComment(7, noSuggestion);

    expect(result).toContain("**What happened:** Something went wrong");
    expect(result).not.toContain("suggestion");
    expect(result).toContain("Issue #7");
  });
});

describe("formatGreenScopedComment", () => {
  it("includes header, confidence, plan, files, and footer", () => {
    const greenScoping: ScopingResult = {
      ...SCOPING_FIXTURE,
      confidence: "green",
      confidence_reason: "Clear requirements, well-defined scope",
      open_questions: [],
    };
    const result = formatGreenScopedComment(2, greenScoping);

    expect(result).toContain("Devin scoped this issue");
    expect(result).toContain("ready to fix");
    expect(result).toContain("**Confidence:** green");
    expect(result).toContain("Clear requirements, well-defined scope");
    expect(result).toContain("**Plan:**");
    expect(result).toContain("- Update error handler");
    expect(result).toContain("- Add try-catch");
    expect(result).toContain("**Files:** `src/routes/health.ts`");
    expect(result).toContain("Head to the dashboard to start the fix");
    expect(result).toContain("https://devin-issue-pilot.vercel.app/");
    expect(result).toContain("Issue #2");
    expect(result).toContain("Devin Issue Pilot");
  });

  it("omits plan section when action_plan is empty", () => {
    const noSteps: ScopingResult = {
      ...SCOPING_FIXTURE,
      confidence: "green",
      open_questions: [],
      action_plan: [],
    };
    const result = formatGreenScopedComment(9, noSteps);

    expect(result).not.toContain("**Plan:**");
    expect(result).toContain("Issue #9");
  });

  it("omits files section when files_to_modify is empty", () => {
    const noFiles: ScopingResult = {
      ...SCOPING_FIXTURE,
      confidence: "green",
      open_questions: [],
      files_to_modify: [],
    };
    const result = formatGreenScopedComment(10, noFiles);

    expect(result).not.toContain("**Files:**");
    expect(result).toContain("Issue #10");
  });

  it("is detected by isDevinComment", () => {
    const greenScoping: ScopingResult = {
      ...SCOPING_FIXTURE,
      confidence: "green",
      open_questions: [],
    };
    expect(isDevinComment(formatGreenScopedComment(1, greenScoping))).toBe(true);
  });
});

describe("formatReadyComment", () => {
  it("includes dashboard link as clickable Markdown URL", () => {
    const greenScoping: ScopingResult = {
      ...SCOPING_FIXTURE,
      confidence: "green",
      confidence_reason: "Clear requirements",
      open_questions: [],
    };
    const result = formatReadyComment(5, greenScoping);

    expect(result).toContain("Clarification received");
    expect(result).toContain("ready to fix");
    expect(result).toContain("Head to the dashboard to start the fix");
    expect(result).toContain("https://devin-issue-pilot.vercel.app/");
    expect(result).toContain(
      "[Head to the dashboard to start the fix](https://devin-issue-pilot.vercel.app/)",
    );
    expect(result).toContain("Issue #5");
  });
});

describe("formatDoneComment", () => {
  it("includes header, PR link, and footer", () => {
    const result = formatDoneComment(
      8,
      "https://github.com/owner/repo/pull/42",
      "Fix health endpoint",
    );

    expect(result).toContain("Devin created a fix");
    expect(result).toContain(
      "[Fix health endpoint](https://github.com/owner/repo/pull/42)",
    );
    expect(result).toContain("Issue #8");
  });
});

describe("isDevinComment", () => {
  it("returns true for Devin-generated comments", () => {
    const devinBody =
      'Some text\n<sub>\u{1F916} Posted by [Devin Issue Pilot](https://github.com/natanwei/devin-issue-pilot)</sub>';
    expect(isDevinComment(devinBody)).toBe(true);
  });

  it("returns false for human comments", () => {
    expect(isDevinComment("I think we should use Socket.IO")).toBe(false);
    expect(isDevinComment("")).toBe(false);
  });

  it("returns true for any output from format functions", () => {
    expect(isDevinComment(formatScopingComment(1, SCOPING_FIXTURE))).toBe(true);
    expect(isDevinComment(formatBlockedComment(2, BLOCKER_FIXTURE))).toBe(true);
    expect(
      isDevinComment(formatDoneComment(3, "https://example.com/pr/1", "Fix")),
    ).toBe(true);
  });
});

describe("isDuplicateMessage", () => {
  const T0 = "2026-02-08T12:00:00Z";
  const T30s = "2026-02-08T12:00:30Z";
  const T90s = "2026-02-08T12:01:30Z";

  it("returns true for identical text within 60s window", () => {
    expect(isDuplicateMessage("hello world", "hello world", T0, T30s)).toBe(
      true,
    );
  });

  it("normalizes whitespace and case for comparison", () => {
    expect(
      isDuplicateMessage("  Hello   World  ", "hello world", T0, T30s),
    ).toBe(true);
  });

  it("returns false when text differs", () => {
    expect(isDuplicateMessage("hello world", "goodbye world", T0, T30s)).toBe(
      false,
    );
  });

  it("returns false when outside the time window", () => {
    expect(isDuplicateMessage("hello world", "hello world", T0, T90s)).toBe(
      false,
    );
  });

  it("respects custom window parameter", () => {
    expect(
      isDuplicateMessage("hello", "hello", T0, T30s, 10_000),
    ).toBe(false);
    expect(
      isDuplicateMessage("hello", "hello", T0, T30s, 120_000),
    ).toBe(true);
  });
});
