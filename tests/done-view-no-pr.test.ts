import { describe, it, expect } from "vitest";
import { getConfidenceReasonText } from "@/app/components/issue-detail-shared";
import { getDoneCompletedSteps } from "@/app/components/issue-detail-views";
import type { StepItem, ScopingResult, PRInfo } from "@/lib/types";

const makePR = (overrides?: Partial<PRInfo>): PRInfo => ({
  url: "https://github.com/org/repo/pull/1",
  number: 1,
  title: "Fix bug",
  branch: "fix/bug",
  files_changed: [
    { path: "src/index.ts", additions: 5, deletions: 2, is_new: false },
  ],
  ...overrides,
});

const makeScoping = (overrides?: Partial<ScopingResult>): ScopingResult => ({
  confidence: "green",
  confidence_reason: "Well-scoped",
  current_behavior: "Broken",
  requested_fix: "Fix it",
  files_to_modify: ["src/index.ts"],
  tests_needed: "Unit tests",
  action_plan: ["Step A", "Step B", "Step C"],
  risks: [],
  open_questions: [],
  ...overrides,
});

describe("getConfidenceReasonText", () => {
  it("shows 'PR opened' when status is done and issue.pr exists", () => {
    const { reasonText, reasonColor } = getConfidenceReasonText({
      status: "done",
      steps: [],
      scoping: makeScoping(),
      pr: makePR(),
    });
    expect(reasonText).toBe("PR opened ✅");
    expect(reasonColor).toBe("text-accent-green");
  });

  it("shows 'Completed' when status is done and issue.pr is null", () => {
    const { reasonText, reasonColor } = getConfidenceReasonText({
      status: "done",
      steps: [],
      scoping: makeScoping(),
      pr: null,
    });
    expect(reasonText).toBe("Completed");
    expect(reasonColor).toBe("text-accent-green");
  });

  it("shows 'PR opened' when status is pr_open and issue.pr exists", () => {
    const { reasonText } = getConfidenceReasonText({
      status: "pr_open",
      steps: [],
      scoping: makeScoping(),
      pr: makePR(),
    });
    expect(reasonText).toBe("PR opened ✅");
  });

  it("shows 'Completed' when status is pr_open and issue.pr is null", () => {
    const { reasonText } = getConfidenceReasonText({
      status: "pr_open",
      steps: [],
      scoping: makeScoping(),
      pr: null,
    });
    expect(reasonText).toBe("Completed");
  });

  it("returns scoping confidence_reason for non-terminal statuses", () => {
    const { reasonText } = getConfidenceReasonText({
      status: "scoped" as "done",
      steps: [],
      scoping: makeScoping({ confidence_reason: "All good" }),
      pr: null,
    });
    expect(reasonText).toBe("All good");
  });

  it("returns 'Fix failed' for failed status regardless of pr", () => {
    const { reasonText, reasonColor } = getConfidenceReasonText({
      status: "failed",
      steps: [],
      scoping: makeScoping(),
      pr: null,
    });
    expect(reasonText).toBe("Fix failed");
    expect(reasonColor).toBe("text-accent-red");
  });
});

describe("getDoneCompletedSteps", () => {
  it("returns done step labels when steps exist", () => {
    const steps: StepItem[] = [
      { label: "Implement feature", status: "done" },
      { label: "Write tests", status: "done" },
      { label: "Deploy", status: "pending" },
    ];
    const result = getDoneCompletedSteps({ steps, scoping: makeScoping() });
    expect(result).toEqual(["Implement feature", "Write tests"]);
  });

  it("falls back to scoping action_plan when no steps are done", () => {
    const steps: StepItem[] = [];
    const scoping = makeScoping({ action_plan: ["Step A", "Step B", "Step C"] });
    const result = getDoneCompletedSteps({ steps, scoping });
    expect(result).toEqual(["Step A", "Step B", "Step C"]);
  });

  it("falls back to scoping action_plan when steps exist but none are done", () => {
    const steps: StepItem[] = [
      { label: "Implement feature", status: "pending" },
    ];
    const scoping = makeScoping({ action_plan: ["Plan step 1"] });
    const result = getDoneCompletedSteps({ steps, scoping });
    expect(result).toEqual(["Plan step 1"]);
  });

  it("returns empty array when no steps and no scoping", () => {
    const result = getDoneCompletedSteps({ steps: [], scoping: null });
    expect(result).toEqual([]);
  });

  it("returns empty array when no steps and scoping has empty action_plan", () => {
    const result = getDoneCompletedSteps({
      steps: [],
      scoping: makeScoping({ action_plan: [] }),
    });
    expect(result).toEqual([]);
  });

  it("prefers done steps over action_plan when both exist", () => {
    const steps: StepItem[] = [
      { label: "Actual step", status: "done" },
    ];
    const scoping = makeScoping({ action_plan: ["Plan step"] });
    const result = getDoneCompletedSteps({ steps, scoping });
    expect(result).toEqual(["Actual step"]);
  });
});
