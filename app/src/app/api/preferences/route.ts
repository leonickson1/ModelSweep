import { NextRequest, NextResponse } from "next/server";
import { getDb, getPreferences, setPreference } from "@/lib/db";

export async function GET() {
  try {
    const db = getDb();
    const prefs = getPreferences(db);
    return NextResponse.json({ preferences: prefs });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const updates = await req.json();
    const db = getDb();
    for (const [key, value] of Object.entries(updates)) {
      setPreference(db, key, value);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
