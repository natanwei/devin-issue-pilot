import { NextRequest, NextResponse } from "next/server";
import { deleteSession } from "@/lib/devin";
import { translateError } from "@/lib/error-messages";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId } = body;

    if (!sessionId) {
      return NextResponse.json(
        { error: "Missing sessionId" },
        { status: 400 }
      );
    }

    const devinApiKey = req.headers.get("x-devin-api-key") || undefined;
    await deleteSession(sessionId, devinApiKey);
    return NextResponse.json({ success: true });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status: 500 });
  }
}
