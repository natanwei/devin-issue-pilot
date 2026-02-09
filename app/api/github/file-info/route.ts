import { NextRequest, NextResponse } from "next/server";
import { getFileInfo } from "@/lib/github";
import { translateError } from "@/lib/error-messages";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const owner = searchParams.get("owner");
  const repo = searchParams.get("repo");
  const path = searchParams.get("path");

  if (!owner || !repo || !path) {
    return NextResponse.json(
      { error: "Missing owner, repo, or path" },
      { status: 400 }
    );
  }

  try {
    const githubToken = req.headers.get("x-github-token") || undefined;
    const info = await getFileInfo(owner, repo, path, githubToken);
    return NextResponse.json(info);
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}
