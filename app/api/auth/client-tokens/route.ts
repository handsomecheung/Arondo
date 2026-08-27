import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken, readTokensConfig, updateTokensConfig, generateToken, generateUniqueColor } from "@/lib/auth";
import crypto from "crypto";

function generateUUID(): string {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return crypto.randomBytes(16).toString("hex");
}

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
  }

  try {
    let config = await readTokensConfig();
    const missingColor = config.clients.some((t) => !t.color);
    if (missingColor) {
      await updateTokensConfig((cfg) => {
        for (const client of cfg.clients) {
          if (!client.color) {
            const existingColors = cfg.clients.map((t) => t.color).filter((c): c is string => !!c);
            client.color = generateUniqueColor(existingColors);
          }
        }
      });
      config = await readTokensConfig();
    }
    return NextResponse.json(config.clients);
  } catch {
    return NextResponse.json({ error: "Failed to load tokens" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
  }

  try {
    const { name } = await request.json();
    if (!name || !name.trim()) {
      return NextResponse.json({ error: "Name is required" }, { status: 400 });
    }

    // Generate a secure user token
    const generatedUserToken = generateToken();
    const generatedUuid = generateUUID();
    await updateTokensConfig((config) => {
      const existingColors = config.clients.map((t) => t.color).filter((c): c is string => !!c);
      const generatedColor = generateUniqueColor(existingColors);
      config.clients.push({
        token: generatedUserToken,
        uuid: generatedUuid,
        name: name.trim(),
        type: "user",
        color: generatedColor
      });
    });

    return NextResponse.json({
      success: true,
      token: generatedUserToken,
      uuid: generatedUuid,
    });
  } catch {
    return NextResponse.json({ error: "Failed to generate token" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
  }

  try {
    const { role: targetRole, token: targetToken, name } = await request.json();
    if (!targetRole || !targetToken || !name || !name.trim()) {
      return NextResponse.json({ error: "role, token and name are required" }, { status: 400 });
    }

    const found = await updateTokensConfig((config) => {
      const tokenIndex = config.clients.findIndex(t => t.token === targetToken && t.type === targetRole);
      if (tokenIndex === -1) return false;
      config.clients[tokenIndex].name = name.trim();
      return true;
    });

    if (!found) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to update token name" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
  }

  try {
    const { searchParams } = new URL(request.url);
    const targetRole = searchParams.get("role");
    const targetToken = searchParams.get("token");

    if (!targetRole || !targetToken) {
      return NextResponse.json({ error: "Missing role or token" }, { status: 400 });
    }

    const found = await updateTokensConfig((config) => {
      const tokenIndex = config.clients.findIndex(t => t.token === targetToken && t.type === targetRole);
      if (tokenIndex === -1) return false;
      config.clients.splice(tokenIndex, 1);
      return true;
    });

    if (!found) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete token" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
