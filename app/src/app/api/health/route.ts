import { NextResponse } from "next/server";
import { getDb, getPreferences } from "@/lib/db";
import { OllamaClient } from "@/lib/ollama";

export async function GET() {
  try {
    const db = getDb();
    const prefs = getPreferences(db);
    const client = new OllamaClient(prefs.ollamaUrl);
    const ok = await client.healthCheck();
    return NextResponse.json({ connected: ok });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
