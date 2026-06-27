import { NextRequest, NextResponse } from "next/server";
import { getProject, getSessions, deleteProject } from "@/lib/store";
import { eventBus } from "@/lib/event-bus";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(id);

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const sessions = await getSessions();
  const associatedSessions = sessions.filter((s) => s.projectId === id);

  if (associatedSessions.length > 0) {
    return NextResponse.json(
      { error: "Cannot delete project with associated sessions" },
      { status: 400 }
    );
  }

  try {
    await deleteProject(id);
    eventBus.publish({ type: "project_deleted", payload: { id } });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: error.message || "Failed to delete project" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
