import { NextResponse } from "next/server";
import { getDb, deleteAllRuns } from "@/lib/db";

export async function DELETE() {
  try {
    const db = getDb();
    const deleted = deleteAllRuns(db);
    return NextResponse.json({ deleted });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
