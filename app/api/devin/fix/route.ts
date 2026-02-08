import { NextRequest, NextResponse } from "next/server";
import { createFixSession } from "@/lib/devin";
import { upsertIssueSession } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      issueTitle,
      issueBody,
      issueNumber,
      repo,
      acuLimit,
      scopingResult,
    } = body;

    if (!issueTitle || !issueNumber || !repo || !scopingResult) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const result = await createFixSession({
      issueTitle,
      issueBody: issueBody || "",
      issueNumber,
      repo,
      acuLimit: acuLimit || 15,
      scopingResult,
    });

    // Persist to Supabase
    upsertIssueSession({
      repo,
      issue_number: issueNumber,
      status: "fixing",
      fix_session: {
        session_id: result.session_id,
        session_url: result.url,
        started_at: new Date().toISOString(),
      },
      fix_started_at: new Date().toISOString(),
    }).catch(() => {});

    return NextResponse.json({
      sessionId: result.session_id,
      sessionUrl: result.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
