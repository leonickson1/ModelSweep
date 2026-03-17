import { NextRequest, NextResponse } from "next/server";
import { getDb, getPreferences } from "@/lib/db";
import { OllamaClient } from "@/lib/ollama";

export async function POST(req: NextRequest) {
  try {
    const { name } = await req.json();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const db = getDb();
    const prefs = getPreferences(db);
    const client = new OllamaClient(prefs.ollamaUrl);
    const details = await client.showModel(name);
    return NextResponse.json(details);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
