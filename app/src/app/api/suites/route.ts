import { NextRequest, NextResponse } from "next/server";
import { getDb, getAllSuites, createSuite } from "@/lib/db";
import { randomUUID } from "crypto";

export async function GET() {
  try {
    const db = getDb();
    const suites = getAllSuites(db);
    return NextResponse.json({ suites });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { name, description, suiteType } = await req.json();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const db = getDb();
    const id = randomUUID();
    createSuite(db, { id, name, description: description || "", suiteType: suiteType || "standard" });
    return NextResponse.json({ id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
