import { NextRequest, NextResponse } from "next/server";
import { DEVIN_API_BASE } from "@/lib/constants";

export async function GET(req: NextRequest) {
  const apiKey = req.headers.get("x-devin-api-key");

  if (!apiKey) {
    return NextResponse.json(
      { valid: false, error: "Missing x-devin-api-key header" },
      { status: 400 },
    );
  }

  try {
    const res = await fetch(`${DEVIN_API_BASE}/sessions?limit=1`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10_000),
    });

    return NextResponse.json({ valid: res.status === 200 });
  } catch {
    return NextResponse.json(
      { valid: false, error: "Unable to reach Devin API" },
      { status: 502 },
    );
  }
}
