import { NextResponse } from "next/server";
import { getProjects } from "@/lib/store";

export async function GET() {
  const projects = await getProjects();
  return NextResponse.json(projects);
}

export const dynamic = "force-dynamic";
