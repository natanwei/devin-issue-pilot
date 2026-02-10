import { NextRequest, NextResponse } from "next/server";
import { createIssueComment, listIssueComments } from "@/lib/github";
import { translateError } from "@/lib/error-messages";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { owner, repo, issueNumber, comment } = body;

    if (!owner || !repo || !issueNumber || !comment) {
      return NextResponse.json(
        { error: "Missing owner, repo, issueNumber, or comment" },
        { status: 400 },
      );
    }

    const githubToken = req.headers.get("x-github-token") || undefined;
    const result = await createIssueComment(
      owner,
      repo,
      issueNumber,
      comment,
      githubToken,
    );
    return NextResponse.json(result);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    const status = /403|Resource not accessible/i.test(rawMessage) ? 403 : 500;
    return NextResponse.json({ error: message, isAuth }, { status });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const issueNumber = searchParams.get("issueNumber");
  const since = searchParams.get("since") || undefined;

  if (!owner || !repo || !issueNumber) {
    return NextResponse.json(
      { error: "Missing owner, repo, or issueNumber" },
      { status: 400 },
    );
  }

  try {
    const githubToken = req.headers.get("x-github-token") || undefined;
    const comments = await listIssueComments(
      owner,
      repo,
      parseInt(issueNumber, 10),
      since,
      githubToken,
    );
    return NextResponse.json(comments);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}
