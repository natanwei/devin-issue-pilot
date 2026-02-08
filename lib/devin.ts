import { DEVIN_API_BASE } from "./constants";
import { DevinStatusEnum } from "./types";

const headers = () => ({
  Authorization: `Bearer ${process.env.DEVIN_API_KEY}`,
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
}

export async function createScopingSession(params: {
  issueTitle: string;
  issueBody: string;
  issueNumber: number;
  repo: string;
  acuLimit: number;
}): Promise<CreateSessionResponse> {
  const prompt = `You are analyzing GitHub issue #${params.issueNumber} from ${params.repo}.

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
}`;

  const res = await fetch(`${DEVIN_API_BASE}/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      prompt,
      idempotent: true,
      max_acu_limit: params.acuLimit,
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
  scopingResult: {
    current_behavior: string;
    requested_fix: string;
    files_to_modify: string[];
    action_plan: string[];
    tests_needed: string;
  };
}): Promise<CreateSessionResponse> {
  const prompt = `You are fixing GitHub issue #${params.issueNumber} from ${params.repo}.

**Issue Title**: ${params.issueTitle}
**Issue Body**: ${params.issueBody}

**Scoping Analysis**:
- Current Behavior: ${params.scopingResult.current_behavior}
- Requested Fix: ${params.scopingResult.requested_fix}
- Files to Modify: ${params.scopingResult.files_to_modify.join(", ")}
- Tests Needed: ${params.scopingResult.tests_needed}

**Action Plan**:
${params.scopingResult.action_plan.map((s, i) => `${i + 1}. ${s}`).join("\n")}

Please implement the fix following the action plan above. Create a pull request when done.`;

  const res = await fetch(`${DEVIN_API_BASE}/sessions`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({
      prompt,
      idempotent: true,
      max_acu_limit: params.acuLimit,
      tags: [`fix-${params.repo}-${params.issueNumber}`],
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
  sessionId: string
): Promise<SessionStatusResponse> {
  const res = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}`, {
    method: "GET",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }

  return res.json();
}

export async function sendMessage(
  sessionId: string,
  message: string
): Promise<void> {
  const res = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}/messages`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify({ message }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const res = await fetch(`${DEVIN_API_BASE}/sessions/${sessionId}`, {
    method: "DELETE",
    headers: headers(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Devin API error ${res.status}: ${body}`);
  }
}

export function isTerminal(statusEnum: DevinStatusEnum): boolean {
  return statusEnum === "finished" || statusEnum === "stopped" || statusEnum === "expired";
}
