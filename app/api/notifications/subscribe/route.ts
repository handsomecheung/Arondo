import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken, getUuidByToken } from "@/lib/auth";
import { registerPushSubscription } from "@/lib/web-push-server";

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { subscription } = body;

    if (!subscription || !subscription.endpoint || !subscription.keys?.p256dh || !subscription.keys?.auth) {
      return NextResponse.json(
        { error: "Invalid subscription payload" },
        { status: 400 },
      );
    }

    const userUuid = getUuidByToken(token) || undefined;
    const userAgent = request.headers.get("user-agent") || undefined;

    await registerPushSubscription(
      subscription,
      userUuid,
      userAgent,
    );

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error("[api/notifications/subscribe] Error:", err);
    return NextResponse.json(
      { error: "Failed to register push subscription" },
      { status: 500 },
    );
  }
}
