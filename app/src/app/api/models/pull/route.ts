import { NextRequest } from "next/server";
import { OllamaClient } from "@/lib/ollama";

export async function POST(req: NextRequest) {
  const { model } = await req.json();
  if (!model || typeof model !== "string") {
    return new Response(JSON.stringify({ error: "model name required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const client = new OllamaClient();

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (data: Record<string, unknown>) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      try {
        send({ type: "start", model });

        for await (const progress of client.pullModel(model)) {
          const percent = progress.total > 0
            ? Math.round((progress.completed / progress.total) * 100)
            : 0;

          send({
            type: "progress",
            status: progress.status,
            completed: progress.completed,
            total: progress.total,
            percent,
            digest: progress.digest,
          });
        }

        send({ type: "complete", model });
      } catch (err) {
        send({ type: "error", error: String(err) });
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
