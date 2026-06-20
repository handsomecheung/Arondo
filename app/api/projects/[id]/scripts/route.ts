import { NextRequest, NextResponse } from "next/server";
import { getProjectScripts, addProjectScript, deleteProjectScript, getProject } from "@/lib/store";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const scripts = await getProjectScripts(id);
  return NextResponse.json(scripts);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const { name, command, oldName } = await req.json();
    if (!name || !command) {
      return NextResponse.json({ error: "name and command are required" }, { status: 400 });
    }

    const updatedScripts = await addProjectScript(id, { name, command }, oldName);
    return NextResponse.json(updatedScripts, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to add/update script" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const name = searchParams.get("name");
    if (!name) {
      return NextResponse.json({ error: "name parameter is required" }, { status: 400 });
    }

    const updatedScripts = await deleteProjectScript(id, name);
    return NextResponse.json(updatedScripts);
  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Failed to delete script" }, { status: 500 });
  }
}

export const dynamic = "force-dynamic";
