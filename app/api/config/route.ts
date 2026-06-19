import { NextResponse } from "next/server";

export async function GET() {
  const hasToken = !!(process.env.GITHUB_TOKEN || process.env.GH_TOKEN);
  return NextResponse.json({
    githubConfigured: hasToken,
  });
}
