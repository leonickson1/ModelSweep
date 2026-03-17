import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getDb, getApiKeys, upsertApiKey, deleteApiKey, updateApiKeyStatus } from "@/lib/db";
import { encryptApiKey, decryptApiKey } from "@/lib/crypto";

export async function GET() {
  try {
    const db = getDb();
    const rows = getApiKeys(db);
    // Return masked keys (never return plaintext)
    const providers = rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      maskedKey: r.encrypted_key ? "••••••••••••••••" : null,
      baseUrl: r.base_url,
      modelId: r.model_id,
      label: r.label,
      useForJudging: !!r.use_for_judging,
      useForBaseline: !!r.use_for_baseline,
      spendLimitUsd: r.spend_limit_usd,
      spendUsedUsd: r.spend_used_usd,
      status: r.status,
    }));
    return NextResponse.json({ providers });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      provider, apiKey, baseUrl, modelId, label,
      useForJudging, useForBaseline, spendLimitUsd,
    } = body;

    if (!provider || !apiKey) {
      return NextResponse.json({ error: "provider and apiKey required" }, { status: 400 });
    }

    const db = getDb();
    const existing = getApiKeys(db).find((k) => k.provider === provider);
    const id = existing?.id || randomUUID();
    const encryptedKey = encryptApiKey(apiKey);

    upsertApiKey(db, {
      id, provider, encryptedKey,
      baseUrl, modelId, label,
      useForJudging: !!useForJudging,
      useForBaseline: !!useForBaseline,
      spendLimitUsd: spendLimitUsd ?? 5.0,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { provider } = await req.json();
    if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });
    const db = getDb();
    deleteApiKey(db, provider);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// GET /api/cloud-providers/test — verify a key works
export async function PATCH(req: NextRequest) {
  try {
    const { provider } = await req.json();
    if (!provider) return NextResponse.json({ error: "provider required" }, { status: 400 });

    const db = getDb();
    const row = getApiKeys(db).find((k) => k.provider === provider);
    if (!row) return NextResponse.json({ error: "provider not found" }, { status: 404 });

    let plainKey: string;
    try {
      plainKey = decryptApiKey(row.encrypted_key);
    } catch {
      updateApiKeyStatus(db, provider, "error");
      return NextResponse.json({ ok: false, error: "Failed to decrypt key" });
    }

    let ok = false;
    try {
      if (provider === "openai" || provider === "custom") {
        const baseUrl = row.base_url || "https://api.openai.com/v1";
        const res = await fetch(`${baseUrl}/models`, {
          headers: { Authorization: `Bearer ${plainKey}` },
          signal: AbortSignal.timeout(5000),
        });
        ok = res.ok;
      } else if (provider === "anthropic") {
        const res = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "x-api-key": plainKey,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1,
            messages: [{ role: "user", content: "hi" }],
          }),
          signal: AbortSignal.timeout(8000),
        });
        ok = res.ok || res.status === 529; // 529 = overloaded but key is valid
      } else if (provider === "google") {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${plainKey}`,
          { signal: AbortSignal.timeout(5000) }
        );
        ok = res.ok;
      }
    } catch {
      ok = false;
    }

    updateApiKeyStatus(db, provider, ok ? "connected" : "error");
    return NextResponse.json({ ok });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
