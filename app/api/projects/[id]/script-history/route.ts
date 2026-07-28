import { NextRequest, NextResponse } from "next/server";
import { getScriptHistory, getProject } from "@/lib/store";
import { getArondoToken, verifyProjectPermission } from "@/lib/auth";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const token = getArondoToken(req);

  if (!(await verifyProjectPermission(id, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const history = await getScriptHistory(id);
  return NextResponse.json(history);
}

export const dynamic = "force-dynamic";
