import { NextRequest, NextResponse } from "next/server";
import { getMessages } from "@/lib/store";
import { getArondoToken, verifySessionPermission, readTokensConfig } from "@/lib/auth";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");

  if (!sessionId) {
    return NextResponse.json({ error: "sessionId is required" }, { status: 400 });
  }

  const token = getArondoToken(req);
  if (!(await verifySessionPermission(sessionId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const messages = await getMessages(sessionId);
  try {
    const config = await readTokensConfig();
    const clientMap = new Map(config.clients.map(c => [c.uuid, { name: c.name, color: c.color }]));

    const enriched = messages.map(msg => {
      if (msg.role === "user" && msg.tokenUuid) {
        const clientInfo = clientMap.get(msg.tokenUuid);
        if (clientInfo) {
          return {
            ...msg,
            userName: clientInfo.name,
            userColor: clientInfo.color
          };
        }
      }
      return msg;
    });

    return NextResponse.json(enriched);
  } catch {
    return NextResponse.json(messages);
  }
}

export const dynamic = "force-dynamic";
