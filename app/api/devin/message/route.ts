import { NextRequest, NextResponse } from "next/server";
import { sendMessage } from "@/lib/devin";
import { translateError } from "@/lib/error-messages";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { sessionId, message } = body;

    if (!sessionId || !message) {
      return NextResponse.json(
        { error: "Missing sessionId or message" },
        { status: 400 }
      );
    }

    const devinApiKey = req.headers.get("x-devin-api-key") || undefined;
    await sendMessage(sessionId, message, devinApiKey);
    return NextResponse.json({ success: true });
  } catch (err) {
    const rawMessage = err instanceof Error ? err.message : "Unknown error";
    const status = /Devin API error 404/i.test(rawMessage) ? 404 : 500;
    const { message, isAuth } = translateError(rawMessage);
    return NextResponse.json({ error: message, isAuth }, { status });
  }
}
