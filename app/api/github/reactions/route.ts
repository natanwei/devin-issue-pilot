import { NextRequest, NextResponse } from "next/server";
import { createCommentReaction } from "@/lib/github";
import { translateError } from "@/lib/error-messages";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { owner, repo, commentId } = body;

    if (!owner || !repo || !commentId) {
      return NextResponse.json(
        { error: "Missing owner, repo, or commentId" },
        { status: 400 },
      );
    }

    const githubToken = req.headers.get("x-github-token") || undefined;
    await createCommentReaction(owner, repo, commentId, githubToken);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    const status = /403|Resource not accessible/i.test(rawMessage) ? 403 : 500;
    return NextResponse.json({ error: message, isAuth }, { status });
  }
}
