import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken, readTokensConfig, updateTokensConfig, generateToken } from "@/lib/auth";
import { runnerManager } from "@/lib/runner-manager";
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
    const config = await readTokensConfig();
    const knownRunners = await runnerManager.getAllKnownRunners();
    const enriched = config.runners.map((r) => {
      const runner = r.boundRunnerId ? knownRunners.find((k) => k.id === r.boundRunnerId) : undefined;
      return {
        ...r,
        runnerName: runner?.name,
        connected: runner?.connected || false,
      };
    });
    return NextResponse.json(enriched);
  } catch (err) {
    return NextResponse.json({ error: "Failed to load runner tokens" }, { status: 500 });
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

    const generatedRunnerToken = generateToken();
    await updateTokensConfig((config) => {
      config.runners.push({
        id: generateUUID(),
        token: generatedRunnerToken,
        name: name.trim(),
        createdAt: Date.now(),
        boundRunnerId: null,
      });
    });

    return NextResponse.json({
      success: true,
      token: generatedRunnerToken,
    });
  } catch (err) {
    return NextResponse.json({ error: "Failed to generate runner token" }, { status: 500 });
  }
}

export async function PUT(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);

  if (role !== "admin") {
    return NextResponse.json({ error: "Forbidden: Admin role required" }, { status: 403 });
  }

  try {
    const { id, name } = await request.json();
    if (!id || !name || !name.trim()) {
      return NextResponse.json({ error: "id and name are required" }, { status: 400 });
    }

    const boundRunnerId = await updateTokensConfig((config) => {
      const record = config.runners.find((r) => r.id === id);
      if (!record) return undefined;
      record.name = name.trim();
      return record.boundRunnerId;
    });

    if (boundRunnerId === undefined) {
      return NextResponse.json({ error: "Runner token not found" }, { status: 404 });
    }

    // Push the new name to the bound runner immediately, rather than
    // waiting for it to reconnect and re-register.
    if (boundRunnerId) {
      await runnerManager.updateRunnerName(boundRunnerId, name.trim());
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to update runner token name" }, { status: 500 });
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
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing runner token id" }, { status: 400 });
    }

    const revokedBoundRunnerId = await updateTokensConfig((config) => {
      const tokenIndex = config.runners.findIndex((r) => r.id === id);
      if (tokenIndex === -1) return undefined;
      const revoked = config.runners[tokenIndex];
      config.runners.splice(tokenIndex, 1);
      return revoked.boundRunnerId ?? null;
    });

    if (revokedBoundRunnerId === undefined) {
      return NextResponse.json({ error: "Runner token not found" }, { status: 404 });
    }

    // Kick the currently connected runner off immediately so a revoked token
    // can't keep authorizing an already-established connection.
    if (revokedBoundRunnerId) {
      runnerManager.forceDisconnectRunner(revokedBoundRunnerId);
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json({ error: "Failed to delete runner token" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
