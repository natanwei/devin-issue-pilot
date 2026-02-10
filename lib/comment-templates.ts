import type { ScopingResult, BlockerInfo } from "./types";

export function formatScopingComment(
  issueNumber: number,
  scoping: ScopingResult,
): string {
  const lines: string[] = [];

  lines.push(
    `### \u{1F50D} **Devin scoped this issue \u2014 questions before fixing**`,
  );
  lines.push("");

  lines.push(
    `**Confidence:** ${scoping.confidence} \u2014 ${scoping.confidence_reason}`,
  );
  lines.push("");

  if (scoping.open_questions.length > 0) {
    lines.push("**Questions:**");
    for (const q of scoping.open_questions) {
      lines.push(`- ${q}`);
    }
    lines.push("");
  }

  if (scoping.current_behavior) {
    lines.push(`**Current behavior:** ${scoping.current_behavior}`);
    lines.push("");
  }

  if (scoping.requested_fix) {
    lines.push(`**Requested fix:** ${scoping.requested_fix}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(
    `> Reply to this comment and Devin will incorporate your answers`,
  );
  lines.push("");
  lines.push(
    `<sub>\u{1F916} Posted by [Devin Issue Pilot](https://github.com/natanwei/devin-issue-pilot) \u2022 Issue #${issueNumber}</sub>`,
  );

  return lines.join("\n");
}

export function formatBlockedComment(
  issueNumber: number,
  blocker: BlockerInfo,
): string {
  const lines: string[] = [];

  lines.push(`### \u26A0\uFE0F **Devin is blocked and needs input**`);
  lines.push("");

  lines.push(`**What happened:** ${blocker.what_happened}`);
  lines.push("");

  if (blocker.suggestion) {
    lines.push(`**Devin\u2019s suggestion:** ${blocker.suggestion}`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`> Reply to this comment to unblock Devin`);
  lines.push("");
  lines.push(
    `<sub>\u{1F916} Posted by [Devin Issue Pilot](https://github.com/natanwei/devin-issue-pilot) \u2022 Issue #${issueNumber}</sub>`,
  );

  return lines.join("\n");
}

export function formatReadyComment(
  issueNumber: number,
  scoping: ScopingResult,
): string {
  const lines: string[] = [];

  lines.push(`### \u2705 **Clarification received \u2014 ready to fix**`);
  lines.push("");

  lines.push(
    `**Confidence:** ${scoping.confidence} \u2014 ${scoping.confidence_reason}`,
  );
  lines.push("");

  lines.push("---");
  lines.push(`> Head to the dashboard to start the fix`);
  lines.push("");
  lines.push(
    `<sub>\u{1F916} Posted by [Devin Issue Pilot](https://github.com/natanwei/devin-issue-pilot) \u2022 Issue #${issueNumber}</sub>`,
  );

  return lines.join("\n");
}

export function formatGreenScopedComment(
  issueNumber: number,
  scoping: ScopingResult,
): string {
  const lines: string[] = [];

  lines.push(
    `### \u2705 **Devin scoped this issue \u2014 ready to fix**`,
  );
  lines.push("");

  lines.push(
    `**Confidence:** ${scoping.confidence} \u2014 ${scoping.confidence_reason}`,
  );
  lines.push("");

  if (scoping.action_plan.length > 0) {
    lines.push("**Plan:**");
    for (const step of scoping.action_plan) {
      lines.push(`- ${step}`);
    }
    lines.push("");
  }

  if (scoping.files_to_modify.length > 0) {
    lines.push(
      "**Files:** " + scoping.files_to_modify.map((f) => "`" + f + "`").join(", "),
    );
    lines.push("");
  }

  lines.push("---");
  lines.push(`> Head to the dashboard to start the fix`);
  lines.push("");
  lines.push(
    `<sub>\u{1F916} Posted by [Devin Issue Pilot](https://github.com/natanwei/devin-issue-pilot) \u2022 Issue #${issueNumber}</sub>`,
  );

  return lines.join("\n");
}

export function formatDoneComment(
  issueNumber: number,
  prUrl: string,
  prTitle: string,
): string {
  const lines: string[] = [];

  lines.push(`### \u2705 **Devin created a fix**`);
  lines.push("");

  lines.push(`**PR:** [${prTitle}](${prUrl})`);
  lines.push("");

  lines.push("---");
  lines.push(
    `<sub>\u{1F916} Posted by [Devin Issue Pilot](https://github.com/natanwei/devin-issue-pilot) \u2022 Issue #${issueNumber}</sub>`,
  );

  return lines.join("\n");
}

const DEVIN_BOT_MARKER = "Posted by [Devin Issue Pilot]";

export function isDevinComment(body: string): boolean {
  return body.includes(DEVIN_BOT_MARKER);
}

export function isDuplicateMessage(
  newText: string,
  existingText: string,
  newTimestamp: string,
  existingTimestamp: string,
  windowMs: number = 60_000,
): boolean {
  const timeDiff = Math.abs(
    new Date(newTimestamp).getTime() - new Date(existingTimestamp).getTime(),
  );
  if (timeDiff > windowMs) return false;

  const normalize = (s: string) =>
    s.trim().toLowerCase().replace(/\s+/g, " ");
  return normalize(newText) === normalize(existingText);
}
