import { NextRequest, NextResponse } from "next/server";
import { mcpManager, mcpToolsToOllamaFormat, type McpServerConfig } from "@/lib/mcp-client";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const config: McpServerConfig = {
    id: body.id || "test",
    name: body.name || "test",
    transport: body.transport || "stdio",
    command: body.command,
    args: body.args || [],
    url: body.url,
    env: body.env || {},
    enabled: true,
  };

  try {
    const tools = await mcpManager.connect(config);
    const ollamaTools = mcpToolsToOllamaFormat(tools);

    return NextResponse.json({
      success: true,
      toolCount: tools.length,
      tools: tools.map(t => ({ name: t.name, description: t.description })),
      ollamaTools,
    });
  } catch (err) {
    return NextResponse.json({
      success: false,
      error: String(err),
    }, { status: 500 });
  } finally {
    // Disconnect test connection
    await mcpManager.disconnect(config.id);
  }
}
