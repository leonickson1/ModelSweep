import { NextRequest, NextResponse } from "next/server";
import { getDb, getRunById, updateManualVote, deleteRun, getModelResultIdForPrompt, recomputeModelOverallWithVotes } from "@/lib/db";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    const run = getRunById(db, params.id);
    if (!run) return NextResponse.json({ error: "not found" }, { status: 404 });
    return NextResponse.json({ run });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { promptResultId, vote } = await req.json();
    if (!promptResultId) return NextResponse.json({ error: "promptResultId required" }, { status: 400 });
    const db = getDb();
    updateManualVote(db, promptResultId, vote);

    // Re-aggregate the model's overall score so the vote is reflected in the
    // results dashboard without requiring a re-run.
    const owner = getModelResultIdForPrompt(db, promptResultId);
    if (owner) recomputeModelOverallWithVotes(db, owner.runId, owner.modelResultId);

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const db = getDb();
    deleteRun(db, params.id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
