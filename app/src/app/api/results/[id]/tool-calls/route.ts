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
          tcr.id,
          tcr.run_id,
          tcr.model_result_id,
          tcr.scenario_id,
          tcr.model_name,
          tcr.actual_tool_calls,
          tcr.text_response,
          tcr.score,
          tcr.overall_score,
          tcr.latency_ms,
          tcr.created_at,
          ts.name AS scenario_name,
          ts.user_message,
          ts.expected_tool_calls,
          ts.should_call_tool
        FROM tool_call_results tcr
        LEFT JOIN tool_scenarios ts ON ts.id = tcr.scenario_id
        WHERE tcr.run_id = ?
        ORDER BY tcr.created_at ASC`
      )
      .all(runId) as Record<string, unknown>[];

    const results = rows.map((row) => ({
      ...row,
      actual_tool_calls: JSON.parse((row.actual_tool_calls as string) || "[]"),
      score: JSON.parse((row.score as string) || "{}"),
      expected_tool_calls: JSON.parse((row.expected_tool_calls as string) || "[]"),
      should_call_tool: row.should_call_tool === 1 || row.should_call_tool === true,
    }));

    return NextResponse.json({ results });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
