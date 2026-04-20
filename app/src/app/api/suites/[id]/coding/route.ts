import { NextRequest, NextResponse } from "next/server";
import { getDb, getCodingScenarios, createCodingScenario, updateCodingScenario, deleteCodingScenario } from "@/lib/db";
import crypto from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const scenarios = getCodingScenarios(db, id);
  return NextResponse.json({
    scenarios: scenarios.map(s => ({
      ...s,
      suiteId: s.suite_id,
      functionSignature: s.function_signature,
      testCases: JSON.parse(s.test_cases || "[]"),
      setupCode: s.setup_code,
      timeLimitMs: s.time_limit_ms,
      order: s.sort_order,
    })),
  });
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await req.json();
  const db = getDb();
  const scenarioId = crypto.randomUUID();
  createCodingScenario(db, {
    id: scenarioId,
    suiteId: id,
    name: body.name ?? "New Scenario",
    description: body.description ?? "",
    language: body.language ?? "python",
    functionSignature: body.functionSignature ?? "def solve(input):",
    testCases: body.testCases ?? [],
    setupCode: body.setupCode ?? null,
    difficulty: body.difficulty ?? "medium",
    timeLimitMs: body.timeLimitMs ?? 30000,
    order: body.order ?? 0,
  });
  return NextResponse.json({ id: scenarioId });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await req.json();
  const db = getDb();
  updateCodingScenario(db, body.scenarioId, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await req.json();
  const db = getDb();
  deleteCodingScenario(db, body.scenarioId);
  return NextResponse.json({ success: true });
}
