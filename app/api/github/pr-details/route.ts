import { NextRequest, NextResponse } from "next/server";
import { getPRDetails, parsePatch } from "@/lib/github";

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

  try {
    const { pr: prData, files } = await getPRDetails(
      owner,
      repo,
      parseInt(pr)
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
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
