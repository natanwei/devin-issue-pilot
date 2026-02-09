import { NextRequest, NextResponse } from "next/server";
import { createScopingSession } from "@/lib/devin";
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

    const result = await createScopingSession({
      issueTitle,
      issueBody: issueBody || "",
      issueNumber,
      repo,
      acuLimit: acuLimit || 3,
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

    // Webhook to n8n for async polling + Claude extraction (must await on Vercel)
    if (process.env.N8N_WEBHOOK_URL) {
      await fetch(process.env.N8N_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          sessionId: result.session_id,
          issueNumber,
          repo,
          callbackUrl: `${process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"}/api/n8n/callback`,
          secret: process.env.N8N_CALLBACK_SECRET || "",
        }),
      }).catch(() => {});
    }

    return NextResponse.json({
      sessionId: result.session_id,
      sessionUrl: result.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
