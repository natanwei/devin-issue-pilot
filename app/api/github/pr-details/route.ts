import { NextRequest, NextResponse } from "next/server";
import { getPRDetails, parsePatch, ensurePRClosesIssue } from "@/lib/github";
import { translateError } from "@/lib/error-messages";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const pr = searchParams.get("pr");

  if (!owner || !repo || !pr) {
    return NextResponse.json(
      { error: "Missing owner, repo, or pr" },
      { status: 400 }
    );
  }

  const prNum = Number(pr);
  if (!Number.isInteger(prNum) || prNum < 1) {
    return NextResponse.json(
      { error: "Invalid PR number" },
      { status: 400 }
    );
  }

  try {
    const githubToken = req.headers.get("x-github-token") || undefined;
    const { pr: prData, files } = await getPRDetails(
      owner,
      repo,
      prNum,
      githubToken,
    );

    return NextResponse.json({
      title: prData.title,
      body: prData.body,
      branch: prData.head.ref,
      url: prData.html_url,
      files: files.map((f) => ({
        path: f.filename,
        additions: f.additions,
        deletions: f.deletions,
        is_new: f.status === "added",
        diff_lines: f.patch ? parsePatch(f.patch) : [],
      })),
    });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const pr = searchParams.get("pr");
  const issueNumberParam = searchParams.get("issueNumber");

  if (!owner || !repo || !pr || !issueNumberParam) {
    return NextResponse.json(
      { error: "Missing owner, repo, pr, or issueNumber" },
      { status: 400 },
    );
  }

  const prNum = Number(pr);
  const issueNum = Number(issueNumberParam);
  if (!Number.isInteger(prNum) || prNum < 1 || !Number.isInteger(issueNum) || issueNum < 1) {
    return NextResponse.json(
      { error: "Invalid PR or issue number" },
      { status: 400 },
    );
  }

  try {
    const githubToken = req.headers.get("x-github-token") || undefined;
    const result = await ensurePRClosesIssue(owner, repo, prNum, issueNum, githubToken);
    return NextResponse.json(result);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}
