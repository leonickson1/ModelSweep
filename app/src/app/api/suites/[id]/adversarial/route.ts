import { NextRequest, NextResponse } from "next/server";
import { getDb, createAdversarialScenario, updateAdversarialScenario, deleteAdversarialScenario } from "@/lib/db";
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
    createAdversarialScenario(db, {
      id: scenarioId,
      suiteId: id,
      name: body.name ?? "New Adversarial Scenario",
      systemPrompt: body.systemPrompt ?? "",
      attackStrategy: body.attackStrategy ?? "jailbreak",
      maxTurns: body.maxTurns ?? 5,
      attackIntensity: body.attackIntensity ?? 3,
      failureConditions: body.failureConditions ?? [],
      difficulty: body.difficulty ?? "medium",
      attackerModel: body.attackerModel ?? "",
      attackerMode: body.attackerMode ?? "scripted",
      order: body.order ?? 0,
    });

    return NextResponse.json({ id: scenarioId });
  } catch (err) {
    console.error("POST /api/suites/[id]/adversarial error:", err);
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
      return NextResponse.json({ error: "Missing adversarial scenario id" }, { status: 400 });
    }

    updateAdversarialScenario(db, body.id, {
      name: body.name,
      systemPrompt: body.systemPrompt,
      attackStrategy: body.attackStrategy,
      maxTurns: body.maxTurns,
      attackIntensity: body.attackIntensity,
      failureConditions: body.failureConditions,
      difficulty: body.difficulty,
      attackerMode: body.attackerMode,
      order: body.order,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("PATCH /api/suites/[id]/adversarial error:", err);
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
      return NextResponse.json({ error: "Missing adversarial scenario id" }, { status: 400 });
    }

    deleteAdversarialScenario(db, body.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("DELETE /api/suites/[id]/adversarial error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
