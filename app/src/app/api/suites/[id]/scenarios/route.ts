import { NextRequest, NextResponse } from "next/server";
import { getDb, getToolScenarios, createToolScenario, updateToolScenario, deleteToolScenario } from "@/lib/db";
import crypto from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const scenarios = getToolScenarios(db, id);
  return NextResponse.json({
    scenarios: scenarios.map((s) => ({
      ...s,
      suiteId: s.suite_id,
      userMessage: s.user_message,
      systemPrompt: s.system_prompt,
      shouldCallTool: s.should_call_tool === 1,
      expectedToolCalls: JSON.parse(s.expected_tool_calls || "[]"),
      simulatedError: s.simulated_error,
      dependencyChain: s.dependency_chain ? JSON.parse(s.dependency_chain) : undefined,
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
  createToolScenario(db, {
    id: scenarioId,
    suiteId: id,
    name: body.name ?? "New Scenario",
    userMessage: body.userMessage ?? "",
    systemPrompt: body.systemPrompt ?? null,
    shouldCallTool: body.shouldCallTool ?? true,
    expectedToolCalls: body.expectedToolCalls ?? [],
    category: body.category ?? "tool_selection",
    difficulty: body.difficulty ?? "medium",
    simulatedError: body.simulatedError ?? null,
    dependencyChain: body.dependencyChain ?? null,
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

  if (!body.id) {
    return NextResponse.json({ error: "Missing scenario id" }, { status: 400 });
  }

  updateToolScenario(db, body.id, {
    name: body.name,
    userMessage: body.userMessage,
    systemPrompt: body.systemPrompt,
    shouldCallTool: body.shouldCallTool,
    expectedToolCalls: body.expectedToolCalls,
    category: body.category,
    difficulty: body.difficulty,
    simulatedError: body.simulatedError,
    dependencyChain: body.dependencyChain,
    order: body.order,
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await req.json();
  const db = getDb();

  if (!body.id) {
    return NextResponse.json({ error: "Missing scenario id" }, { status: 400 });
  }

  deleteToolScenario(db, body.id);
  return NextResponse.json({ ok: true });
}
