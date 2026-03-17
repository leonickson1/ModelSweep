import { NextResponse } from "next/server";
import { getDb, getAllRuns } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const runs = getAllRuns(db);
    return NextResponse.json({ runs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
