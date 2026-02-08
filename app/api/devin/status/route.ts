import { NextRequest, NextResponse } from "next/server";
import { getSession, isTerminal } from "@/lib/devin";
import { extractStructuredOutputFromMessages } from "@/lib/parsers";

export const maxDuration = 30;

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json(
      { error: "Missing sessionId" },
      { status: 400 }
    );
  }

  try {
    const session = await getSession(sessionId);

    return NextResponse.json({
      sessionId: session.session_id,
      statusEnum: session.status_enum,
      status: session.status,
      isTerminal: isTerminal(session.status_enum),
      createdAt: session.created_at,
      updatedAt: session.updated_at,
      pullRequest: session.pull_request || null,
      structuredOutput: session.structured_output || extractStructuredOutputFromMessages(session.messages) || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
