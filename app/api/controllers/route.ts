import { NextResponse } from "next/server";
import { controllerManager } from "@/lib/controller-manager";

export async function GET() {
  const controllers = controllerManager.getControllers();
  return NextResponse.json(controllers);
}

export const dynamic = "force-dynamic";
