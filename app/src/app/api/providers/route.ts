import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb, getCloudProviders, createCloudProvider } from "@/lib/db";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 7) + "••••••••";
}

export async function GET() {
  try {
    const db = getDb();
    const rows = getCloudProviders(db);
    const providers = rows.map((r) => ({
      id: r.id,
      providerType: r.provider_type,
      label: r.label,
      maskedKey: maskKey(r.api_key),
      baseUrl: r.base_url,
      selectedModel: r.selected_model,
      useForJudging: !!r.use_for_judging,
      useForPlayground: !!r.use_for_playground,
    }));
    return NextResponse.json({ providers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { providerType, label, apiKey, baseUrl, selectedModel, useForJudging, useForPlayground } = body;

    if (!providerType || !apiKey || !label) {
      return NextResponse.json({ error: "providerType, label, and apiKey required" }, { status: 400 });
    }

    const db = getDb();
    const id = randomUUID().replace(/-/g, "").slice(0, 16);

    createCloudProvider(db, {
      id,
      providerType,
      label,
      apiKey,
      baseUrl: baseUrl || null,
      selectedModel: selectedModel || null,
      useForJudging: useForJudging ?? true,
      useForPlayground: useForPlayground ?? true,
    });

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
