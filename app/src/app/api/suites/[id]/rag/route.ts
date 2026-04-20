import { NextRequest, NextResponse } from "next/server";
import { getDb, getRagScenarios, getRagDocuments, getRagChunks, createRagScenario, updateRagScenario, deleteRagScenario } from "@/lib/db";
import crypto from "crypto";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const db = getDb();
  const scenarios = getRagScenarios(db, id);
  const documents = getRagDocuments(db, id);

  return NextResponse.json({
    scenarios: scenarios.map(s => ({
      ...s,
      suiteId: s.suite_id,
      documentId: s.document_id,
      groundTruthAnswer: s.ground_truth_answer,
      relevantChunkIds: JSON.parse(s.relevant_chunk_ids || "[]"),
      distractorChunkIds: JSON.parse(s.distractor_chunk_ids || "[]"),
      answerNotInDocument: s.answer_not_in_document === 1,
      order: s.sort_order,
    })),
    documents: documents.map(d => ({
      ...d,
      suiteId: d.suite_id,
      mimeType: d.mime_type,
      chunks: getRagChunks(db, d.id).map(c => ({
        ...c,
        documentId: c.document_id,
        tokenCount: c.token_count,
        order: c.sort_order,
      })),
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
  createRagScenario(db, {
    id: scenarioId,
    suiteId: id,
    documentId: body.documentId ?? "",
    question: body.question ?? "",
    groundTruthAnswer: body.groundTruthAnswer ?? "",
    relevantChunkIds: body.relevantChunkIds ?? [],
    distractorChunkIds: body.distractorChunkIds ?? [],
    answerNotInDocument: body.answerNotInDocument ?? false,
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
  updateRagScenario(db, body.scenarioId, body);
  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  await params;
  const body = await req.json();
  const db = getDb();
  deleteRagScenario(db, body.scenarioId);
  return NextResponse.json({ success: true });
}
