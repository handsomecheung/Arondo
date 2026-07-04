import { NextRequest, NextResponse } from "next/server";
import { getProject, getProjectScripts } from "@/lib/store";
import { runnerManager } from "@/lib/runner-manager";
import { getArondoToken, verifyProjectPermission } from "@/lib/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: projectId } = await params;
  const token = getArondoToken(req);

  if (!(await verifyProjectPermission(projectId, token))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const project = await getProject(projectId);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { scriptName, messageId } = await req.json();
  if (!scriptName) {
    return NextResponse.json({ error: "scriptName is required" }, { status: 400 });
  }
  if (!messageId) {
    return NextResponse.json({ error: "messageId is required" }, { status: 400 });
  }

  const scripts = await getProjectScripts(projectId);
  const script = scripts.find((s) => s.name === scriptName);
  if (!script) {
    return NextResponse.json({ error: `Script "${scriptName}" not found` }, { status: 404 });
  }

  const ok = await runnerManager.restartTask("", messageId, script.command, project.repoPath);
  if (!ok) {
    return NextResponse.json({ error: "Task not found or runner unavailable" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

export const dynamic = "force-dynamic";
