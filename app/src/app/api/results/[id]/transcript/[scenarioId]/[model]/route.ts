import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; scenarioId: string; model: string }> }
) {
  try {
    const { id: runId, scenarioId, model: modelName } = await params;
    const db = getDb();

    // Check conversation_results first
    const convoRow = db
      .prepare(
        `SELECT history
        FROM conversation_results
        WHERE run_id = ? AND scenario_id = ? AND model_name = ?
        LIMIT 1`
      )
      .get(runId, scenarioId, modelName) as { history: string } | undefined;

    if (convoRow) {
      const transcript = JSON.parse(convoRow.history || "[]");
      return NextResponse.json({ transcript, type: "conversation" });
    }

    // Fall back to adversarial_results
    const advRow = db
      .prepare(
        `SELECT history
        FROM adversarial_results
        WHERE run_id = ? AND scenario_id = ? AND model_name = ?
        LIMIT 1`
      )
      .get(runId, scenarioId, modelName) as { history: string } | undefined;

    if (advRow) {
      const transcript = JSON.parse(advRow.history || "[]");
      return NextResponse.json({ transcript, type: "adversarial" });
    }

    return NextResponse.json({ error: "transcript not found" }, { status: 404 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
