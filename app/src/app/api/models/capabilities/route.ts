import { NextRequest, NextResponse } from "next/server";
import { getDb, getPreferences } from "@/lib/db";
import { OllamaClient } from "@/lib/ollama";

/**
 * Return capability info (vision / tools / completion / embedding) for a list
 * of model names. Used by the Run Suite page to warn users when their selected
 * models don't match the suite type (e.g. text-only model picked for a vision
 * suite).
 *
 * POST /api/models/capabilities
 * Body: { models: string[] }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const names: unknown = body?.models;
    if (!Array.isArray(names)) {
      return NextResponse.json({ error: "models must be an array of strings" }, { status: 400 });
    }
    const modelNames = names.filter((n): n is string => typeof n === "string");

    const db = getDb();
    const prefs = getPreferences(db);
    const client = new OllamaClient(prefs.ollamaUrl);

    const results = await Promise.all(
      modelNames.map(async (name) => {
        try {
          return await client.getCapabilities(name);
        } catch {
          return { name, vision: false, tools: false, completion: true, embedding: false, source: "unknown" as const };
        }
      })
    );

    return NextResponse.json({ capabilities: results });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
