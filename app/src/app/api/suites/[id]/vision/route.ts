import { NextRequest, NextResponse } from "next/server";
import { getDb, getVisionScenarios, createVisionScenario, updateVisionScenario, deleteVisionScenario } from "@/lib/db";
import crypto from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const scenarios = getVisionScenarios(db, id);
  return NextResponse.json({
    scenarios: scenarios.map(s => ({
      ...s,
      suiteId: s.suite_id,
      imageData: s.image_data,
      imageMime: s.image_mime,
      expectedAnswer: s.expected_answer,
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
  createVisionScenario(db, {
    id: scenarioId,
    suiteId: id,
    name: body.name ?? "New Vision Scenario",
    imageData: body.imageData ?? "",
    imageMime: body.imageMime ?? "image/png",
    question: body.question ?? "",
    category: body.category ?? "description",
    expectedAnswer: body.expectedAnswer ?? null,
    rubric: body.rubric ?? "",
    difficulty: body.difficulty ?? "medium",
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
  updateVisionScenario(db, body.scenarioId, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await req.json();
  const db = getDb();
  deleteVisionScenario(db, body.scenarioId);
  return NextResponse.json({ success: true });
}
