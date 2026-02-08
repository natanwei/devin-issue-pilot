import { NextRequest, NextResponse } from "next/server";
import { createScopingSession } from "@/lib/devin";

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

    return NextResponse.json({
      sessionId: result.session_id,
      sessionUrl: result.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
