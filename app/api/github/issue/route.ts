import { NextRequest, NextResponse } from "next/server";
import { getIssue } from "@/lib/github";
import { translateError } from "@/lib/error-messages";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const number = searchParams.get("number");

  if (!owner || !repo || !number) {
    return NextResponse.json(
      { error: "Missing owner, repo, or number" },
      { status: 400 }
    );
  }

  try {
    const githubToken = req.headers.get("x-github-token") || undefined;
    const issue = await getIssue(owner, repo, parseInt(number, 10), githubToken);
    return NextResponse.json(issue);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}
