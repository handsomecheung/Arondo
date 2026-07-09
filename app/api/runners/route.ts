import { NextRequest, NextResponse } from "next/server";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, getRoleByToken, isValidToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  if (!isValidToken(token)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const runners = await runnerManager.getAllKnownRunners();
  const results = await Promise.all(
    runners.map(async (r) => {
      const allowed = await runnerManager.isTokenAllowedForRunner(r, token);
      return { r, allowed };
    })
  );
  const filtered = results.filter((res) => res.allowed).map((res) => res.r);
  return NextResponse.json(filtered);
}

export async function POST(request: NextRequest) {
  try {
    const token = getArondoToken(request);
    const role = getRoleByToken(token);
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    const body = await request.json();
    const { id, allowedUserTokenUuids, syncGlobalRules } = body;
    if (!id || (allowedUserTokenUuids === undefined && syncGlobalRules === undefined)) {
      return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
    }

    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(id, token);
    if (!isAllowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    let success = true;
    if (Array.isArray(allowedUserTokenUuids)) {
      success = (await runnerManager.updateRunnerAllowedUserTokenUuids(id, allowedUserTokenUuids)) && success;
    }
    if (typeof syncGlobalRules === "boolean") {
      success = (await runnerManager.updateRunnerSyncGlobalRules(id, syncGlobalRules)) && success;
    }
    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const token = getArondoToken(request);
    const role = getRoleByToken(token);
    if (role !== "admin") {
      return NextResponse.json({ error: "Admin role required" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "Missing runner id" }, { status: 400 });
    }

    const isAllowed = await runnerManager.isTokenAllowedForRunnerId(id, token);
    if (!isAllowed) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const success = await runnerManager.deleteRunner(id);
    if (!success) {
      return NextResponse.json({ error: "Failed to delete runner" }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || "Internal server error" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
