import { NextRequest, NextResponse } from "next/server";
import { getArondoToken, getRoleByToken } from "@/lib/auth";

export async function GET(request: NextRequest) {
  const token = getArondoToken(request);
  const role = getRoleByToken(token);

  if (!role) {
    return NextResponse.json({ valid: false, error: "Invalid token" }, { status: 401 });
  }

  return NextResponse.json({ valid: true, role });
}

export const dynamic = "force-dynamic";
