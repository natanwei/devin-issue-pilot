import { NextRequest, NextResponse } from "next/server";
import { getSession, isTerminal } from "@/lib/devin";
import { translateError } from "@/lib/error-messages";
import { extractStructuredOutputFromMessages, parseStructuredOutput } from "@/lib/parsers";
import { getIssueSessionByDevinId, upsertIssueSession } from "@/lib/supabase";

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
    const devinApiKey = req.headers.get("x-devin-api-key") || undefined;

    const [supabaseRow, session] = await Promise.all([
      getIssueSessionByDevinId(sessionId),
      getSession(sessionId, devinApiKey),
    ]);

    // Extract the last Devin message for blocker display
    const lastDevinMessage = session.messages
      ?.filter((m) => m.type === "devin_message" || !m.type)
      ?.at(-1);
    const blockerMessage = lastDevinMessage?.message || lastDevinMessage?.content || null;

    // n8n already extracted and persisted → use Supabase as source of truth
    if (supabaseRow?.status === "scoped" && supabaseRow?.scoping) {
      return NextResponse.json({
        sessionId: session.session_id,
        statusEnum: session.status_enum,
        status: session.status,
        isTerminal: true,
        createdAt: session.created_at,
        updatedAt: session.updated_at,
        pullRequest: session.pull_request || null,
        structuredOutput: supabaseRow.scoping,
        blockerMessage,
      });
    }

    // Fallback: local extraction (n8n hasn't written yet)
    const structuredOutput = session.structured_output
      || extractStructuredOutputFromMessages(session.messages)
      || null;

    const terminal = isTerminal(session.status_enum);

    // Persist results to Supabase when terminal or when we have output
    const issueNum = issueNumber ? Number(issueNumber) : NaN;
    if ((terminal || structuredOutput) && repo && Number.isInteger(issueNum) && issueNum > 0) {
      const parsed = structuredOutput ? parseStructuredOutput(structuredOutput) : null;
      await upsertIssueSession({
        repo,
        issue_number: issueNum,
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
      blockerMessage,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const status = /Devin API error 404/i.test(rawMessage) ? 404 : 500;
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status });
  }
}
