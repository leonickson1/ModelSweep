import { NextRequest } from "next/server";
import { getDb, getCloudProviderById, checkCloudSpendAllowed, incrementCloudSpend } from "@/lib/db";
import { estimateCostUsd } from "@/lib/providers/cloud-inference";

function estimateInputTokens(messages: Array<{ content: string }>): number {
  return messages.reduce((a, m) => a + Math.max(1, Math.ceil((m.content || "").length / 4)), 0);
}

export async function POST(req: NextRequest) {
  try {
    const { providerId, messages, temperature, top_p, max_tokens } = await req.json();

    if (!providerId || !messages) {
      return new Response(JSON.stringify({ error: "providerId and messages required" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const db = getDb();
    const provider = getCloudProviderById(db, providerId);
    if (!provider) {
      return new Response(JSON.stringify({ error: "Provider not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    const model = provider.selected_model;
    if (!model) {
      return new Response(JSON.stringify({ error: "No model selected for this provider" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const allow = checkCloudSpendAllowed(db, provider.id);
    if (!allow.allowed) {
      return new Response(JSON.stringify({
        error: `Spend limit reached for "${provider.label}" ($${allow.limit.toFixed(2)}/mo used: $${allow.used.toFixed(2)}). Raise it in Settings > Cloud Providers.`,
      }), {
        status: 402,
        headers: { "Content-Type": "application/json" },
      });
    }

    const onFinished = (inputTokens: number, outputTokens: number) => {
      const cost = estimateCostUsd(model, inputTokens, outputTokens);
      incrementCloudSpend(db, provider.id, cost);
    };

    if (provider.provider_type === "anthropic") {
      return streamAnthropic(provider.api_key, model, messages, { temperature, top_p, max_tokens }, onFinished);
    } else {
      // openai or custom
      const baseUrl = provider.base_url || "https://api.openai.com/v1";
      return streamOpenAI(baseUrl, provider.api_key, model, messages, { temperature, top_p, max_tokens }, onFinished);
    }
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}

function streamOpenAI(
  baseUrl: string,
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts: { temperature?: number; top_p?: number; max_tokens?: number },
  onFinished?: (inputTokens: number, outputTokens: number) => void
) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let tokenCount = 0;
      let firstTokenTime = 0;

      try {
        const base = baseUrl.replace(/\/+$/, "");
        const res = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            temperature: opts.temperature ?? 0.7,
            top_p: opts.top_p ?? 0.9,
            max_tokens: opts.max_tokens ?? 1024,
          }),
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "Unknown error");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errText })}\n\n`));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();
            if (payload === "[DONE]") continue;

            try {
              const chunk = JSON.parse(payload);
              const content = chunk.choices?.[0]?.delta?.content;
              if (content) {
                tokenCount++;
                if (tokenCount === 1) firstTokenTime = Date.now() - startTime;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: content })}\n\n`));
              }
            } catch {
              // skip
            }
          }
        }

        const totalDuration = (Date.now() - startTime) / 1000;
        const tokensPerSec = totalDuration > 0 ? tokenCount / totalDuration : 0;
        onFinished?.(estimateInputTokens(messages), tokenCount);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          done: true,
          totalTokens: tokenCount,
          tokensPerSec: Math.round(tokensPerSec * 10) / 10,
          ttft: firstTokenTime,
        })}\n\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function streamAnthropic(
  apiKey: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  opts: { temperature?: number; top_p?: number; max_tokens?: number },
  onFinished?: (inputTokens: number, outputTokens: number) => void
) {
  const encoder = new TextEncoder();

  // Convert OpenAI-style messages to Anthropic format
  let systemPrompt: string | undefined;
  const anthropicMessages: Array<{ role: string; content: string }> = [];
  for (const msg of messages) {
    if (msg.role === "system") {
      systemPrompt = msg.content;
    } else {
      anthropicMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const stream = new ReadableStream({
    async start(controller) {
      const startTime = Date.now();
      let tokenCount = 0;
      let firstTokenTime = 0;

      try {
        const body: Record<string, unknown> = {
          model,
          messages: anthropicMessages,
          stream: true,
          max_tokens: opts.max_tokens ?? 1024,
          temperature: opts.temperature ?? 0.7,
          top_p: opts.top_p ?? 0.9,
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
        });

        if (!res.ok || !res.body) {
          const errText = await res.text().catch(() => "Unknown error");
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: errText })}\n\n`));
          controller.close();
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const payload = line.slice(6).trim();

            try {
              const chunk = JSON.parse(payload);
              if (chunk.type === "content_block_delta" && chunk.delta?.text) {
                tokenCount++;
                if (tokenCount === 1) firstTokenTime = Date.now() - startTime;
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ token: chunk.delta.text })}\n\n`));
              }
            } catch {
              // skip
            }
          }
        }

        const totalDuration = (Date.now() - startTime) / 1000;
        const tokensPerSec = totalDuration > 0 ? tokenCount / totalDuration : 0;
        const anthropicInputTokens = (systemPrompt ? Math.max(1, Math.ceil(systemPrompt.length / 4)) : 0) +
          anthropicMessages.reduce((a, m) => a + Math.max(1, Math.ceil((m.content || "").length / 4)), 0);
        onFinished?.(anthropicInputTokens, tokenCount);
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          done: true,
          totalTokens: tokenCount,
          tokensPerSec: Math.round(tokensPerSec * 10) / 10,
          ttft: firstTokenTime,
        })}\n\n`));
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}
