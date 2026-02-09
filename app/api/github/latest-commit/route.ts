import { NextRequest, NextResponse } from "next/server";
import { getLatestCommit } from "@/lib/github";
import { translateError } from "@/lib/error-messages";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");

  if (!owner || !repo) {
    return NextResponse.json(
      { error: "Missing owner or repo" },
      { status: 400 }
    );
  }

  try {
    const githubToken = req.headers.get("x-github-token") || undefined;
    const commit = await getLatestCommit(owner, repo, githubToken);
    return NextResponse.json(commit);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}
