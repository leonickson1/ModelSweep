// Cloud model inference utilities
// Used by server-side routes for judge scoring with cloud models

export interface CloudChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface CloudInferenceOptions {
  temperature?: number;
  topP?: number;
  maxTokens?: number;
}

export async function cloudChatCompletion(
  providerType: string,
  apiKey: string,
  baseUrl: string | null,
  model: string,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions = {}
): Promise<string> {
  if (providerType === "anthropic") {
    return anthropicCompletion(apiKey, model, messages, opts);
  }
  // openai or custom
  const base = (baseUrl || "https://api.openai.com/v1").replace(/\/+$/, "");
  return openaiCompletion(base, apiKey, model, messages, opts);
}

async function openaiCompletion(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions
): Promise<string> {
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
  return data.choices?.[0]?.message?.content ?? "";
}

async function anthropicCompletion(
  apiKey: string,
  model: string,
  messages: CloudChatMessage[],
  opts: CloudInferenceOptions
): Promise<string> {
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
  return textBlocks.map((b: { text: string }) => b.text).join("");
}
