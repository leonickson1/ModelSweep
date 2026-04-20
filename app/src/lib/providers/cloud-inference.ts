// Cloud model inference utilities
// Used by server-side routes for judge scoring with cloud models

import Database from "better-sqlite3";

export interface CloudChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CloudInferenceOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export interface CloudUsage {
  /** Input tokens as reported by the provider (or estimated if unavailable). */
  inputTokens: number;
  outputTokens: number;
  /** Cost in USD. Rough — based on the pricing table below. */
  costUsd: number;
  estimated: boolean;
}

// ─── Pricing ────────────────────────────────────────────────────────────────

/** USD per 1k tokens. Ordered by most-specific prefix match. */
const PRICING: Array<{ matches: RegExp; inputPer1k: number; outputPer1k: number }> = [
  // OpenAI (as of early 2026 published rates)
  { matches: /^gpt-4o-mini/i,              inputPer1k: 0.00015, outputPer1k: 0.0006 },
  { matches: /^gpt-4o/i,                   inputPer1k: 0.0025,  outputPer1k: 0.01 },
  { matches: /^gpt-4(\.1)?-turbo/i,        inputPer1k: 0.01,    outputPer1k: 0.03 },
  { matches: /^gpt-4/i,                    inputPer1k: 0.03,    outputPer1k: 0.06 },
  { matches: /^gpt-3\.5/i,                 inputPer1k: 0.0005,  outputPer1k: 0.0015 },
  { matches: /^o1-mini/i,                  inputPer1k: 0.003,   outputPer1k: 0.012 },
  { matches: /^o1/i,                       inputPer1k: 0.015,   outputPer1k: 0.06 },
  // Anthropic
  { matches: /claude-3-5-haiku/i,          inputPer1k: 0.00080, outputPer1k: 0.004 },
  { matches: /claude-3-5-sonnet/i,         inputPer1k: 0.003,   outputPer1k: 0.015 },
  { matches: /claude-3-opus/i,             inputPer1k: 0.015,   outputPer1k: 0.075 },
  { matches: /claude-3-haiku/i,            inputPer1k: 0.00025, outputPer1k: 0.00125 },
  { matches: /claude-3-sonnet/i,           inputPer1k: 0.003,   outputPer1k: 0.015 },
  { matches: /claude-(opus|sonnet|haiku)/i, inputPer1k: 0.003,   outputPer1k: 0.015 },
];

function lookupPrice(model: string): { inputPer1k: number; outputPer1k: number } {
  for (const p of PRICING) {
    if (p.matches.test(model)) return p;
  }
  // Unknown model — default to middle-of-the-road pricing so we're not silent.
  return { inputPer1k: 0.002, outputPer1k: 0.008 };
}

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number {
  const p = lookupPrice(model);
  return (inputTokens / 1000) * p.inputPer1k + (outputTokens / 1000) * p.outputPer1k;
}

/** Rough token estimate — chars/4 is the standard heuristic. */
function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4));
}

// ─── Raw inference (no budgeting) ───────────────────────────────────────────

export async function cloudChatCompletion(
  providerType: string,
  apiKey: string,
  baseUrl: string | null,
  model: string,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions = {}
): Promise<string> {
  const { text } = await cloudChatCompletionWithUsage(providerType, apiKey, baseUrl, model, messages, opts);
  return text;
}

export async function cloudChatCompletionWithUsage(
  providerType: string,
  apiKey: string,
  baseUrl: string | null,
  model: string,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions = {}
): Promise<{ text: string; usage: CloudUsage }> {
  if (providerType === "anthropic") {
    return anthropicCompletion(apiKey, model, messages, opts);
  }
  const base = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  return openaiCompletion(base, apiKey, model, messages, opts);
}

async function openaiCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions
): Promise<{ text: string; usage: CloudUsage }> {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: opts.temperature ?? 0.3,
      top_p: opts.topP ?? 0.9,
      max_tokens: opts.maxTokens ?? 2048,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`OpenAI API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const text: string = data.choices?.[0]?.message?.content ?? "";
  const reported = data.usage;
  const inputTokens: number = reported?.prompt_tokens ?? messages.reduce((a, m) => a + estimateTokens(m.content), 0);
  const outputTokens: number = reported?.completion_tokens ?? estimateTokens(text);
  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
      estimated: !reported,
    },
  };
}

async function anthropicCompletion(
  apiKey: string,
  model: string,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions
): Promise<{ text: string; usage: CloudUsage }> {
  let systemPrompt: string | undefined;
  const anthropicMessages: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = msg.content;
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const body: Record<string, unknown> = {
    model,
    messages: anthropicMessages,
    max_tokens: opts.maxTokens ?? 2048,
    temperature: opts.temperature ?? 0.3,
    top_p: opts.topP ?? 0.9,
  };
  if (systemPrompt) body.system = systemPrompt;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "Unknown error");
    throw new Error(`Anthropic API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  const textBlocks = (data.content || []).filter((b: { type: string }) => b.type === "text");
  const text: string = textBlocks.map((b: { text: string }) => b.text).join("");
  const reported = data.usage;
  const inputTokens: number = reported?.input_tokens ?? (systemPrompt ? estimateTokens(systemPrompt) : 0) + anthropicMessages.reduce((a, m) => a + estimateTokens(m.content), 0);
  const outputTokens: number = reported?.output_tokens ?? estimateTokens(text);
  return {
    text,
    usage: {
      inputTokens,
      outputTokens,
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
      estimated: !reported,
    },
  };
}

// ─── Budget-aware wrapper ───────────────────────────────────────────────────

export class CloudSpendLimitError extends Error {
  constructor(public providerLabel: string, public remaining: number) {
    super(`Spend limit reached for "${providerLabel}" (${remaining <= 0 ? "$0" : `$${remaining.toFixed(2)}`} remaining). Raise the limit in Settings > Cloud Providers or wait until next month.`);
    this.name = "CloudSpendLimitError";
  }
}

export interface CloudProviderLite {
  id: string;
  provider_type: string;
  api_key: string;
  base_url: string | null;
  selected_model: string | null;
  label: string;
}

/**
 * Inference call that checks the provider's spend limit before the call and
 * records the usage after. Throws CloudSpendLimitError if over budget.
 *
 * The db parameter is passed in rather than imported to avoid circular imports.
 */
export async function cloudChatForProvider(
  db: Database.Database,
  provider: CloudProviderLite,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions,
  hooks: {
    checkAllowed: (dbi: Database.Database, providerId: string) => { allowed: boolean; remaining: number };
    recordSpend: (dbi: Database.Database, providerId: string, costUsd: number) => void;
  }
): Promise<string> {
  const { allowed, remaining } = hooks.checkAllowed(db, provider.id);
  if (!allowed) {
    throw new CloudSpendLimitError(provider.label, remaining);
  }

  const { text, usage } = await cloudChatCompletionWithUsage(
    provider.provider_type,
    provider.api_key,
    provider.base_url,
    provider.selected_model || "",
    messages,
    opts
  );

  hooks.recordSpend(db, provider.id, usage.costUsd);
  return text;
}
