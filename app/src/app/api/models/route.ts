import { NextResponse } from "next/server";
import { getDb, getPreferences } from "@/lib/db";
import { OllamaClient } from "@/lib/ollama";

export async function GET() {
  try {
    const db = getDb();
    const prefs = getPreferences(db);
    const client = new OllamaClient(prefs.ollamaUrl);
    const models = await client.listModels();
    return NextResponse.json({ models });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 503 });
  }
}
