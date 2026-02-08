import { NextRequest, NextResponse } from "next/server";
import { getIssueSessionsByRepo } from "@/lib/supabase";

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
