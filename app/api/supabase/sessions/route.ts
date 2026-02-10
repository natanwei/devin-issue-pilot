import { NextRequest, NextResponse } from "next/server";
import { getIssueSessionsByRepo, upsertIssueSession } from "@/lib/supabase";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const repo = searchParams.get("repo");

  if (!repo) {
    return NextResponse.json({ error: "Missing repo" }, { status: 400 });
  }

  try {
    const sessions = await getIssueSessionsByRepo(repo);
    return NextResponse.json(sessions);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { repo, issue_number, ...fields } = body;
    if (!repo || !issue_number) {
      return NextResponse.json({ error: "Missing repo or issue_number" }, { status: 400 });
    }
    await upsertIssueSession({ repo, issue_number, ...fields });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
