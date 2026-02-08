import { NextRequest, NextResponse } from "next/server";
import { getSession, isTerminal } from "@/lib/devin";
import { extractStructuredOutputFromMessages, parseStructuredOutput } from "@/lib/parsers";
import { getCachedResult } from "@/lib/n8n-cache";
import { upsertIssueSession } from "@/lib/supabase";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const repo = searchParams.get("repo");
  const issueNumber = searchParams.get("issueNumber");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 }
    );
  }

  try {
    const cached = getCachedResult(sessionId);
    const session = await getSession(sessionId);

    const structuredOutput = cached?.structuredOutput
      || session.structured_output
      || extractStructuredOutputFromMessages(session.messages)
      || null;

    const terminal = isTerminal(session.status_enum);

    // Persist terminal results to Supabase
    if (terminal && repo && issueNumber) {
      const parsed = structuredOutput ? parseStructuredOutput(structuredOutput) : null;
      upsertIssueSession({
        repo,
        issue_number: parseInt(issueNumber, 10),
        status: session.pull_request ? "done" : parsed ? "scoped" : session.status_enum,
        confidence: parsed?.confidence ?? null,
        scoping: parsed as Record<string, unknown> | null,
        scoped_at: parsed ? new Date().toISOString() : null,
        pr: session.pull_request ? { url: session.pull_request.url } : null,
        completed_at: session.pull_request ? new Date().toISOString() : null,
      }).catch(() => {});
    }

    return NextResponse.json({
      sessionId: session.session_id,
      statusEnum: session.status_enum,
      status: session.status,
      isTerminal: terminal,
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      pullRequest: session.pull_request || null,
      structuredOutput,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
