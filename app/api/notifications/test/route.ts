import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken, getUuidByToken } from "@/lib/auth";
import { sendWebPushNotification } from "@/lib/web-push-server";

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const userUuid = getUuidByToken(token) || undefined;
    const body = await request.json().catch(() => ({}));
    const delaySeconds = typeof body?.delaySeconds === "number" && body.delaySeconds >= 0
      ? body.delaySeconds
      : 30; // Default to 30 seconds delay to test background push

    const payload = {
      title: "Arondo Test Notification",
      body: "Web Push (VAPID) is successfully configured and working in the background!",
      url: "/settings",
    };

    if (delaySeconds > 0) {
      setTimeout(async () => {
        try {
          await sendWebPushNotification(payload, userUuid);
        } catch (err) {
          console.error("[api/notifications/test] Delayed push error:", err);
        }
      }, delaySeconds * 1000);

      return NextResponse.json({
        success: true,
        delayed: true,
        delaySeconds,
        message: `Notification will be sent in ${delaySeconds} seconds. You can minimize or close the app now.`,
      });
    }

    const result = await sendWebPushNotification(payload, userUuid);
    return NextResponse.json({
      success: true,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (err: any) {
    console.error("[api/notifications/test] Error:", err);
    return NextResponse.json(
      { error: "Failed to send test push notification" },
      { status: 500 },
    );
  }
}
