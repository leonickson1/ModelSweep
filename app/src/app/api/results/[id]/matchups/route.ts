import { NextRequest, NextResponse } from "next/server";
import { getDb, getEloMatchesForRun, getPeerVotesForRun, getJudgeEvaluationsForRun } from "@/lib/db";

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const db = getDb();
    const runId = params.id;

    const eloMatches = getEloMatchesForRun(db, runId);
    const peerVotes = getPeerVotesForRun(db, runId);
    const judgeEvaluations = getJudgeEvaluationsForRun(db, runId);

    return NextResponse.json({ eloMatches, peerVotes, judgeEvaluations });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
