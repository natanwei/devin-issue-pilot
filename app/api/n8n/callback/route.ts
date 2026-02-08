import { NextRequest, NextResponse } from "next/server";
import { setCachedResult } from "@/lib/n8n-cache";
import { getIssueSessionByDevinId, upsertIssueSession } from "@/lib/supabase";
import { parseStructuredOutput } from "@/lib/parsers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, secret, structuredOutput } = body;

    // Validate shared secret
    const expected = process.env.N8N_CALLBACK_SECRET;
    if (expected && secret !== expected) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!sessionId || !structuredOutput) {
      return NextResponse.json(
        { error: "Missing sessionId or structuredOutput" },
        { status: 400 },
      );
    }

    setCachedResult(sessionId, structuredOutput);

    // Persist to Supabase
    const existingRow = await getIssueSessionByDevinId(sessionId);
    if (existingRow) {
      const parsed = parseStructuredOutput(structuredOutput);
      await upsertIssueSession({
        repo: existingRow.repo,
        issue_number: existingRow.issue_number,
        status: "scoped",
        confidence: parsed?.confidence ?? null,
        scoping: parsed as Record<string, unknown> | null,
        scoped_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
