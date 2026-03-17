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
          ar.id,
          ar.run_id,
          ar.model_result_id,
          ar.scenario_id,
          ar.model_name,
          ar.history,
          ar.breaches,
          ar.score,
          ar.robustness_score,
          ar.survived,
          ar.turns_to_first_breach,
          ar.total_duration,
          ar.created_at,
          adv.name AS scenario_name,
          adv.attack_strategy
        FROM adversarial_results ar
        LEFT JOIN adversarial_scenarios adv ON adv.id = ar.scenario_id
        WHERE ar.run_id = ?
        ORDER BY ar.created_at ASC`
      )
      .all(runId) as Record<string, unknown>[];

    const results = rows.map((row) => ({
      ...row,
      history: JSON.parse((row.history as string) || "[]"),
      breaches: JSON.parse((row.breaches as string) || "[]"),
      score: JSON.parse((row.score as string) || "{}"),
      survived: Boolean(row.survived),
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
