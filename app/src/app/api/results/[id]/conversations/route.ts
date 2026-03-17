import { NextRequest, NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: runId } = await params;
    const db = getDb();

    const rows = db
      .prepare(
        `SELECT
          cr.id,
          cr.run_id,
          cr.model_result_id,
          cr.scenario_id,
          cr.model_name,
          cr.history,
          cr.score,
          cr.overall_score,
          cr.actual_turns,
          cr.context_exhausted,
          cr.total_duration,
          cr.created_at,
          cs.name AS scenario_name
        FROM conversation_results cr
        LEFT JOIN conversation_scenarios cs ON cs.id = cr.scenario_id
        WHERE cr.run_id = ?
        ORDER BY cr.created_at ASC`
      )
      .all(runId) as Record<string, unknown>[];

    const results = rows.map((row) => ({
      ...row,
      history: JSON.parse((row.history as string) || "[]"),
      score: JSON.parse((row.score as string) || "{}"),
      context_exhausted: Boolean(row.context_exhausted),
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
