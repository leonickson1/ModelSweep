import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb, getCloudProviders, createCloudProvider, checkCloudSpendAllowed } from "@/lib/db";

function maskKey(key: string): string {
  if (key.length <= 8) return "••••••••";
  return key.slice(0, 7) + "••••••••";
}

export async function GET() {
  try {
    const db = getDb();
    const rows = getCloudProviders(db);
    const providers = rows.map((r) => {
      const spend = checkCloudSpendAllowed(db, r.id);
      return {
        id: r.id,
        providerType: r.provider_type,
        label: r.label,
        maskedKey: maskKey(r.api_key),
        baseUrl: r.base_url,
        selectedModel: r.selected_model,
        useForJudging: !!r.use_for_judging,
        useForPlayground: !!r.use_for_playground,
        spendLimitUsd: spend.limit,
        spendUsedUsd: spend.used,
        spendRemainingUsd: spend.remaining,
      };
    });
    return NextResponse.json({ providers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { providerType, label, apiKey, baseUrl, selectedModel, useForJudging, useForPlayground, spendLimitUsd } = body;

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

    // Apply user-specified spend limit (falls back to schema default of $5/mo).
    if (typeof spendLimitUsd === "number" && Number.isFinite(spendLimitUsd) && spendLimitUsd >= 0) {
      db.prepare("UPDATE cloud_providers SET spend_limit_usd = ? WHERE id = ?").run(spendLimitUsd, id);
    }

    return NextResponse.json({ ok: true, id });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
