import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { unregisterPushSubscription } from "@/lib/web-push-server";

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { endpoint } = body;

    if (!endpoint || typeof endpoint !== "string") {
      return NextResponse.json(
        { error: "Invalid endpoint" },
        { status: 400 },
      );
    }

    const removed = await unregisterPushSubscription(endpoint);
    return NextResponse.json({ success: true, removed });
  } catch (err: any) {
    console.error("[api/notifications/unsubscribe] Error:", err);
    return NextResponse.json(
      { error: "Failed to unregister push subscription" },
      { status: 500 },
    );
  }
}
