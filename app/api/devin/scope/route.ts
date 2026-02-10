import { NextRequest, NextResponse } from "next/server";
import { createScopingSession } from "@/lib/devin";
import { translateError } from "@/lib/error-messages";
import { upsertIssueSession } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { issueTitle, issueBody, issueNumber, repo, acuLimit } = body;

    if (!issueTitle || !issueNumber || !repo) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      );
    }

    const devinApiKey = req.headers.get("x-devin-api-key") || undefined;

    const result = await createScopingSession({
      issueTitle,
      issueBody: issueBody || "",
      issueNumber,
      repo,
      acuLimit: acuLimit ?? 3,
      devinApiKey,
    });

    // Persist to Supabase (must await on Vercel — fire-and-forget gets killed)
    await upsertIssueSession({
      repo,
      issue_number: issueNumber,
      status: "scoping",
      scoping_session: {
        session_id: result.session_id,
        session_url: result.url,
        started_at: new Date().toISOString(),
      },
    }).catch(() => {});

    return NextResponse.json({
      sessionId: result.session_id,
      sessionUrl: result.url,
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}
