import { NextRequest, NextResponse } from "next/server";
import { checkDockerAvailable, startDocker } from "@/lib/code-execution-engine";

export async function GET() {
  const available = await checkDockerAvailable();
  return NextResponse.json({ available });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  if (body.action === "start") {
    const result = await startDocker();
    return NextResponse.json(result);
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
