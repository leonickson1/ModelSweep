import { OllamaModel, OllamaRunningModel, OllamaModelDetails } from "@/types";

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

export interface ChatStats {
  tokensPerSec: number;
  totalTokens: number;
  ttft: number;
  totalDuration: number;
}

export function createOllamaClient(url?: string): OllamaClient {
  return new OllamaClient(url);
}
