import { DEVIN_API_BASE } from "./constants";
import { DevinStatusEnum } from "./types";

const headers = (apiKey?: string) => ({
  Authorization: `Bearer ${apiKey || process.env.DEVIN_API_KEY}`,
  "Content-Type": "application/json",
});

interface CreateSessionResponse {
  session_id: string;
  url: string;
}

interface SessionStatusResponse {
  session_id: string;
  status: string;
  status_enum: DevinStatusEnum;
  title: string;
  created_at: string;
  updated_at: string;
  pull_request?: {
    url: string;
  };
  structured_output?: Record<string, unknown>;
  messages?: Array<{ type?: string; message?: string; content?: string }>;
}

export async function createScopingSession(params: {
  issueTitle: string;
  issueBody: string;
  issueNumber: number;
  repo: string;
  acuLimit: number;
  devinApiKey?: string;
}): Promise<CreateSessionResponse> {
  const prompt = `IMPORTANT: You are ONLY analyzing this issue — do NOT implement any code changes, do NOT create branches, and do NOT create pull requests. Your ONLY output should be the JSON analysis block described below.

You are analyzing GitHub issue #${params.issueNumber} from ${params.repo}.

**Issue Title**: ${params.issueTitle}
**Issue Body**: ${params.issueBody}

Please analyze this issue and determine:
1. What is the current behavior described?
2. What is the requested fix/change?
3. Which files would need to be modified?
4. What tests would be needed?
5. What is your confidence level (green/yellow/red) that you can fix this issue?
   - green: Clear requirements, well-defined scope
   - yellow: Mostly clear but some questions remain
   - red: Unclear requirements, needs more information
6. What are the risks?
7. What open questions do you have?

You MUST include your analysis as a JSON code block in your message. Wrap it in \`\`\`json ... \`\`\` fences so the dashboard can parse it.

Respond with structured JSON:
{
  "confidence": "green" | "yellow" | "red",
  "confidence_reason": "...",
  "current_behavior": "...",
  "requested_fix": "...",
  "files_to_modify": ["..."],
  "tests_needed": "...",
  "action_plan": ["step 1", "step 2", ...],
  "risks": ["..."],
  "open_questions": ["..."]
}

IMPORTANT: Your JSON analysis MUST appear in your message wrapped in \`\`\`json fences. This is how the dashboard reads your analysis.

FOLLOW-UP HANDLING: If you receive follow-up messages from the user answering your open questions or providing clarification, you MUST:
1. Re-analyze the issue incorporating the new information
2. Output a NEW \`\`\`json code block with your UPDATED analysis (same schema as above)
3. Update your confidence level honestly — upgrade to green only if all questions are truly resolved, stay yellow/red if you still have concerns or open questions
4. If you still have questions after the clarification, include them in the updated open_questions array
5. Do NOT start implementing the fix — only provide the updated analysis JSON`;

  const res = await fetch(`${DEVIN_API_BASE}/sessions`, {
    method: "POST",
    headers: headers(params.devinApiKey),
    body: JSON.stringify({
      prompt,
      idempotent: true,
      ...(params.acuLimit > 0 && { max_acu_limit: params.acuLimit }),
      tags: [`scope-${params.repo}-${params.issueNumber}`],
      title: `Scope: ${params.repo}#${params.issueNumber} — ${params.issueTitle}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function createFixSession(params: {
  issueTitle: string;
  issueBody: string;
  issueNumber: number;
  repo: string;
  acuLimit: number;
  devinApiKey?: string;
  scopingResult: {
    current_behavior: string;
    requested_fix: string;
    files_to_modify: string[];
    action_plan: string[];
    tests_needed: string;
    risks?: string[];
    confidence_reason?: string;
  };
  previousContext?: string;
}): Promise<CreateSessionResponse> {
  let prompt = `You are fixing GitHub issue #${params.issueNumber} from ${params.repo}.

**Issue Title**: ${params.issueTitle}
**Issue Body**: ${params.issueBody}

**Scoping Analysis**:
- Current Behavior: ${params.scopingResult.current_behavior}
- Requested Fix: ${params.scopingResult.requested_fix}
- Confidence Reason: ${params.scopingResult.confidence_reason || "N/A"}

**Files to Modify**:
${params.scopingResult.files_to_modify.map((f) => `- ${f}`).join("\n")}

**Action Plan**:
${params.scopingResult.action_plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}

**Tests Needed**:
${params.scopingResult.tests_needed}

**Known Risks**:
${(params.scopingResult.risks ?? []).length > 0 ? params.scopingResult.risks!.map((r) => `- ${r}`).join("\n") : "None identified"}

**Instructions**:
1. Follow the action plan step by step
2. Stay within scope — don't refactor unrelated code
3. Write the tests described in "Tests Needed" and ensure they pass
4. Be mindful of the known risks listed above
5. Commit with clear, descriptive commit messages
6. Create a PR with a clear title and description summarizing the changes
7. If you encounter a blocker or need clarification, ask — don't guess

**CRITICAL — PR Description Requirement**:
Your PR description MUST contain the exact text "Closes #${params.issueNumber}" on its own line so the issue auto-closes when the PR is merged. This is a hard requirement — do not omit it. Example:
\`\`\`
Closes #${params.issueNumber}
\`\`\``;

  if (params.previousContext) {
    prompt += `\n\n**Previous Session Context**:\n${params.previousContext}`;
  }

  prompt += `\n\nPlease implement the fix following the action plan above. Create a pull request when done.`;

  // Use a timestamped tag when retrying to avoid idempotent reuse of sleeping sessions
  const tag = params.previousContext
    ? `fix-${params.repo}-${params.issueNumber}-${Date.now()}`
    : `fix-${params.repo}-${params.issueNumber}`;

  const res = await fetch(`${DEVIN_API_BASE}/sessions`, {
    method: "POST",
    headers: headers(params.devinApiKey),
    body: JSON.stringify({
      prompt,
      idempotent: true,
      ...(params.acuLimit > 0 && { max_acu_limit: params.acuLimit }),
      tags: [tag],
      title: `Fix: ${params.repo}#${params.issueNumber} — ${params.issueTitle}`,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function getSession(
  sessionId: string,
  devinApiKey?: string,
): Promise<SessionStatusResponse> {
  const res = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}`, {
    method: "GET",
    headers: headers(devinApiKey),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function sendMessage(
  sessionId: string,
  message: string,
  devinApiKey?: string,
): Promise<void> {
  const res = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}/message`, {
    method: "POST",
    headers: headers(devinApiKey),
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }
}

export async function deleteSession(sessionId: string, devinApiKey?: string): Promise<void> {
  const res = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: headers(devinApiKey),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }
}

export function isTerminal(statusEnum: DevinStatusEnum): boolean {
  return statusEnum === "finished" || statusEnum === "stopped" || statusEnum === "expired";
}
