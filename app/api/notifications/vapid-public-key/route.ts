import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, isValidToken } from "@/lib/auth";
import { getVapidPublicKey } from "@/lib/web-push-server";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const publicKey = await getVapidPublicKey();
    return NextResponse.json({ publicKey });
  } catch (err: any) {
    console.error("[api/notifications/vapid-public-key] Error:", err);
    return NextResponse.json(
      { error: "Failed to retrieve VAPID public key" },
      { status: 500 },
    );
  }
}
