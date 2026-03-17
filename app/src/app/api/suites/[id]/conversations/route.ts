import { NextRequest, NextResponse } from "next/server";
import { getDb, createConversationScenario, updateConversationScenario, deleteConversationScenario } from "@/lib/db";
import { randomUUID } from "crypto";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const db = getDb();

    const scenarioId = randomUUID();
    createConversationScenario(db, {
      id: scenarioId,
      suiteId: id,
      name: body.name ?? "New Conversation",
      systemPrompt: body.systemPrompt ?? "",
      userPersona: body.userPersona ?? "",
      turnCount: body.turnCount ?? 3,
      evaluationCriteria: body.evaluationCriteria ?? [],
      difficulty: body.difficulty ?? "medium",
      simulatorModel: body.simulatorModel ?? "",
      simulatorMode: body.simulatorMode ?? "scripted",
      scriptedMessages: body.scriptedMessages ?? null,
      order: body.order ?? 0,
    });

    return NextResponse.json({ id: scenarioId });
  } catch (err) {
    console.error("POST /api/suites/[id]/conversations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const body = await req.json();
    const db = getDb();

    if (!body.id) {
      return NextResponse.json({ error: "Missing conversation scenario id" }, { status: 400 });
    }

    updateConversationScenario(db, body.id, {
      name: body.name,
      systemPrompt: body.systemPrompt,
      userPersona: body.userPersona,
      turnCount: body.turnCount,
      evaluationCriteria: body.evaluationCriteria,
      difficulty: body.difficulty,
      simulatorMode: body.simulatorMode,
      order: body.order,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/suites/[id]/conversations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    await params;
    const body = await req.json();
    const db = getDb();

    if (!body.id) {
      return NextResponse.json({ error: "Missing conversation scenario id" }, { status: 400 });
    }

    deleteConversationScenario(db, body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/suites/[id]/conversations error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
