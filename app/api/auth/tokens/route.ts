import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken, TokenInfo, migrateConfig } from "@/lib/auth";
import { getConfigDir } from "@/lib/config";
import fs from "fs/promises";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";

const CONFIG_DIR = getConfigDir();
const TOKENS_FILE = path.join(CONFIG_DIR, "tokens.json");

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
    let config: TokenInfo[] = [];
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      config = migrateConfig(parsed);
    }
    return NextResponse.json(config);
  } catch (err) {
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

    let config: TokenInfo[] = [];
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      config = migrateConfig(parsed);
    }

    // Generate a secure user token
    const generatedUserToken = `user_${crypto.randomBytes(16).toString("hex")}`;
    config.push({
      token: generatedUserToken,
      uuid: generateUUID(),
      name: name.trim(),
      type: "user"
    });

    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({
      success: true,
      token: generatedUserToken,
    });
  } catch (err) {
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

    let config: TokenInfo[] = [];
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      config = migrateConfig(parsed);
    }

    const tokenIndex = config.findIndex(t => t.token === targetToken && t.type === targetRole);
    if (tokenIndex === -1) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    config[tokenIndex].name = name.trim();

    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (err) {
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

    let config: TokenInfo[] = [];
    if (fsSync.existsSync(TOKENS_FILE)) {
      const raw = await fs.readFile(TOKENS_FILE, "utf-8");
      const parsed = JSON.parse(raw);
      config = migrateConfig(parsed);
    }

    const tokenIndex = config.findIndex(t => t.token === targetToken && t.type === targetRole);
    if (tokenIndex === -1) {
      return NextResponse.json({ error: "Token not found" }, { status: 404 });
    }

    config.splice(tokenIndex, 1);

    await fs.mkdir(CONFIG_DIR, { recursive: true });
    await fs.writeFile(TOKENS_FILE, JSON.stringify(config, null, 2), "utf-8");

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete token" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
