import { NextResponse } from "next/server";
import { getDb, restoreBuiltinSuites } from "@/lib/db";

/**
 * POST /api/suites/restore-defaults
 *
 * Re-seeds any built-in starter suites the user has deleted. User-created
 * suites are not touched. Returns { beforeCount, afterCount, restored }.
 */
export async function POST() {
  try {
    const db = getDb();
    const result = restoreBuiltinSuites(db);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
