import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = req.headers.get("x-github-token");

  if (!token) {
    return NextResponse.json(
      { valid: false, error: "Missing x-github-token header" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
      },
      signal: AbortSignal.timeout(10_000),
    });

    return NextResponse.json({ valid: res.status === 200 });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Unable to reach GitHub API" },
      { status: 502 },
    );
  }
}
