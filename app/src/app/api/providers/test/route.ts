import { NextRequest, NextResponse } from "next/server";

const OPENAI_CHAT_MODELS = ["gpt-4o", "gpt-4o-mini", "gpt-4-turbo", "o3-mini", "o4-mini"];
const ANTHROPIC_MODELS = ["claude-sonnet-4-20250514", "claude-haiku-4-5-20251001"];

export async function POST(req: NextRequest) {
  try {
    const { provider_type, api_key, base_url } = await req.json();

    if (!provider_type || !api_key) {
      return NextResponse.json({ success: false, error: "provider_type and api_key required" }, { status: 400 });
    }

    if (provider_type === "openai") {
      return await testOpenAI(api_key);
    } else if (provider_type === "anthropic") {
      return await testAnthropic(api_key);
    } else if (provider_type === "custom") {
      if (!base_url) {
        return NextResponse.json({ success: false, error: "base_url required for custom provider" });
      }
      return await testCustom(api_key, base_url);
    }

    return NextResponse.json({ success: false, error: "Unknown provider_type" });
  } catch (err) {
    return NextResponse.json({ success: false, error: String(err) });
  }
}

async function testOpenAI(apiKey: string) {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });

    if (res.status === 401) {
      return NextResponse.json({ success: false, error: "Invalid API key" });
    }
    if (!res.ok) {
      return NextResponse.json({ success: false, error: `OpenAI returned ${res.status}` });
    }

    const data = await res.json();
    const allModels: string[] = (data.data || []).map((m: { id: string }) => m.id);
    // Filter to known chat models
    const chatModels = allModels.filter((id) =>
      OPENAI_CHAT_MODELS.some((known) => id.startsWith(known))
    );
    // If no known chat models match, return a curated list of what's available
    const models = chatModels.length > 0 ? chatModels : OPENAI_CHAT_MODELS;

    return NextResponse.json({ success: true, models });
  } catch {
    return NextResponse.json({ success: false, error: "Could not reach OpenAI API" });
  }
}

async function testAnthropic(apiKey: string) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (res.status === 401) {
      return NextResponse.json({ success: false, error: "Invalid API key" });
    }
    // 200 or 400 (model not found) both mean key is valid
    if (res.ok || res.status === 400 || res.status === 529) {
      return NextResponse.json({ success: true, models: ANTHROPIC_MODELS });
    }

    return NextResponse.json({ success: false, error: `Anthropic returned ${res.status}` });
  } catch {
    return NextResponse.json({ success: false, error: "Could not reach Anthropic API" });
  }
}

async function testCustom(apiKey: string, baseUrl: string) {
  try {
    // Normalize: remove trailing slash
    const base = baseUrl.replace(/\/+$/, "");
    const res = await fetch(`${base}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      return NextResponse.json({ success: false, error: `Could not connect to ${baseUrl} (${res.status})` });
    }

    const data = await res.json();
    const models: string[] = (data.data || []).map((m: { id: string }) => m.id);
    return NextResponse.json({ success: true, models });
  } catch {
    return NextResponse.json({ success: false, error: `Could not connect to ${baseUrl}` });
  }
}
