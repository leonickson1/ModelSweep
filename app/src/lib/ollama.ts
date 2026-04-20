import { OllamaModel, OllamaRunningModel, OllamaModelDetails, ModelCapabilities } from "@/types";

/**
 * Heuristic capability detection for older Ollama versions that don't return a
 * capabilities array. Based on well-known model families. Not authoritative,
 * but better than assuming everything is capable.
 */
const VISION_NAME_PATTERNS = [
  /llava/i,
  /bakllava/i,
  /minicpm-v/i,
  /moondream/i,
  /llama-?3\.?2-?vision/i,
  /llama3\.2:.*vision/i,
  /qwen-?2-?vl/i,
  /qwen2\.5-?vl/i,
  /qwen2:.*vision/i,
  /pixtral/i,
  /gemma-?3/i, // gemma3 has vision
  /granite-?vision/i,
  /internvl/i,
];

const TOOL_NAME_PATTERNS = [
  /llama-?3\.?[1-9]/i, // llama 3.1+
  /llama3:70b/i,
  /qwen-?2\.?5/i,
  /qwen-?3/i,
  /mistral/i,
  /mixtral/i,
  /command-?r/i,
  /firefunction/i,
  /hermes/i,
  /nemo/i,
  /granite-?3/i,
  /phi-?4/i,
];

const EMBEDDING_NAME_PATTERNS = [
  /embed/i,
  /nomic-?embed/i,
  /mxbai-?embed/i,
  /snowflake-?arctic-?embed/i,
  /bge-?m3/i,
];

function heuristicCapabilities(name: string): Omit<ModelCapabilities, "name" | "source"> {
  const isEmbed = EMBEDDING_NAME_PATTERNS.some((r) => r.test(name));
  return {
    vision: VISION_NAME_PATTERNS.some((r) => r.test(name)),
    tools: !isEmbed && TOOL_NAME_PATTERNS.some((r) => r.test(name)),
    completion: !isEmbed,
    embedding: isEmbed,
  };
}

/**
 * Module-level cache. Keyed by `${baseUrl}::${modelName}`. Survives for the
 * life of the server process. Capabilities don't change unless the model is
 * deleted and re-pulled, so this is safe to cache.
 */
const capabilityCache = new Map<string, ModelCapabilities>();

export function clearCapabilityCache(): void {
  capabilityCache.clear();
}

export class OllamaClient {
  private baseUrl: string;

  constructor(baseUrl = "http://localhost:11434") {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  async listModels(): Promise<OllamaModel[]> {
    const res = await fetch(`${this.baseUrl}/api/tags`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Ollama /api/tags failed: ${res.status}`);
    const data = await res.json();
    return data.models ?? [];
  }

  async listRunning(): Promise<OllamaRunningModel[]> {
    const res = await fetch(`${this.baseUrl}/api/ps`, { cache: "no-store" });
    if (!res.ok) throw new Error(`Ollama /api/ps failed: ${res.status}`);
    const data = await res.json();
    return data.models ?? [];
  }

  async showModel(name: string): Promise<OllamaModelDetails> {
    const res = await fetch(`${this.baseUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Ollama /api/show failed: ${res.status}`);
    return res.json();
  }

  /**
   * Resolve capabilities for a model. Prefers the `capabilities` array from
   * Ollama's `/api/show`; falls back to name-based heuristics. Cached by
   * (baseUrl, modelName).
   */
  async getCapabilities(name: string): Promise<ModelCapabilities> {
    const key = `${this.baseUrl}::${name}`;
    const cached = capabilityCache.get(key);
    if (cached) return cached;

    let caps: ModelCapabilities;
    try {
      const details = await this.showModel(name);
      if (Array.isArray(details.capabilities) && details.capabilities.length > 0) {
        const set = new Set(details.capabilities.map((c) => c.toLowerCase()));
        caps = {
          name,
          vision: set.has("vision"),
          tools: set.has("tools"),
          completion: set.has("completion"),
          embedding: set.has("embedding"),
          source: "api",
        };
      } else {
        caps = { name, ...heuristicCapabilities(name), source: "heuristic" };
      }
    } catch {
      caps = { name, ...heuristicCapabilities(name), source: "heuristic" };
    }

    capabilityCache.set(key, caps);
    return caps;
  }

  async supportsVision(name: string): Promise<boolean> {
    return (await this.getCapabilities(name)).vision;
  }

  async supportsToolCalling(name: string): Promise<boolean> {
    return (await this.getCapabilities(name)).tools;
  }

  async preloadModel(name: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, prompt: "", keep_alive: -1 }),
    });
  }

  async unloadModel(name: string): Promise<void> {
    await fetch(`${this.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: name, prompt: "", keep_alive: 0 }),
    });
  }

  async waitForModelLoaded(name: string, timeoutMs = 60000): Promise<void> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const running = await this.listRunning();
      if (running.some((m) => m.name === name || m.model === name)) return;
      await new Promise((r) => setTimeout(r, 500));
    }
    throw new Error(`Model ${name} did not load within ${timeoutMs}ms`);
  }

  async deleteModel(name: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/delete`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!res.ok) throw new Error(`Ollama /api/delete failed: ${res.status}`);
  }

  /** Pull (download) a model, yielding progress events */
  async *pullModel(name: string): AsyncGenerator<PullProgress> {
    const res = await fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, stream: true }),
    });
    if (!res.ok) throw new Error(`Ollama /api/pull failed: ${res.status}`);
    if (!res.body) throw new Error("No response body");

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
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          yield {
            status: chunk.status ?? "",
            completed: chunk.completed ?? 0,
            total: chunk.total ?? 0,
            digest: chunk.digest ?? "",
          };
        } catch {
          // skip malformed
        }
      }
    }
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(3000),
        cache: "no-store",
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  // Chat with streaming — yields text chunks and a final stats object
  async *chat(params: {
    model: string;
    messages: { role: string; content: string }[];
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): AsyncGenerator<{ type: "token"; text: string } | { type: "done"; stats: ChatStats }> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: params.model,
        messages: params.messages,
        stream: true,
        options: {
          temperature: params.temperature ?? 0.7,
          top_p: params.topP ?? 0.9,
          num_predict: params.maxTokens ?? 1024,
        },
      }),
      signal: params.signal,
    });

    if (!res.ok) throw new Error(`Ollama /api/chat failed: ${res.status}`);
    if (!res.body) throw new Error("No response body");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let firstTokenReceived = false;
    const startTime = performance.now();
    let ttft = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const chunk = JSON.parse(line);
          if (chunk.message?.content) {
            if (!firstTokenReceived) {
              ttft = performance.now() - startTime;
              firstTokenReceived = true;
            }
            yield { type: "token", text: chunk.message.content };
          }
          if (chunk.done) {
            yield {
              type: "done",
              stats: {
                tokensPerSec: chunk.eval_count && chunk.eval_duration
                  ? chunk.eval_count / (chunk.eval_duration / 1e9)
                  : 0,
                totalTokens: chunk.eval_count ?? 0,
                ttft,
                totalDuration: (performance.now() - startTime) / 1000,
              },
            };
          }
        } catch {
          // skip malformed chunks
        }
      }
    }
  }
}

export interface PullProgress {
  status: string;
  completed: number;
  total: number;
  digest: string;
}

export interface ChatStats {
  tokensPerSec: number;
  totalTokens: number;
  ttft: number;
  totalDuration: number;
}

export function createOllamaClient(url?: string): OllamaClient {
  return new OllamaClient(url);
}
