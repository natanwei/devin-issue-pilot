import { NextRequest, NextResponse } from "next/server";
import { getPRDetails, parsePatch } from "@/lib/github";
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
