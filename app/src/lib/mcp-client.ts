/**
 * MCP (Model Context Protocol) Client Manager
 *
 * Connects to MCP servers, lists tools, and routes tool calls to real
 * MCP servers during evaluation. Converts MCP tool schemas to Ollama format.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolDefinition } from "@/types";

// ── Types ──────────────────────────────────────────────────────────────────

export interface McpServerConfig {
  id: string;
  name: string;
  transport: "stdio" | "sse";
  command?: string;
  args: string[];
  url?: string;
  env: Record<string, string>;
  enabled: boolean;
}

interface McpToolInfo {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

interface McpConnection {
  client: Client;
  transport: StdioClientTransport;
  tools: McpToolInfo[];
}

// ── MCP Manager (singleton) ────────────────────────────────────────────────

class McpManager {
  private connections = new Map<string, McpConnection>();

  async connect(config: McpServerConfig): Promise<McpToolInfo[]> {
    // Disconnect existing connection if any
    await this.disconnect(config.id);

    if (config.transport === "stdio" && config.command) {
      const transport = new StdioClientTransport({
        command: config.command,
        args: config.args,
        env: { ...process.env, ...config.env } as Record<string, string>,
      });

      const client = new Client(
        { name: "modelsweep", version: "1.0.0" },
        { capabilities: {} }
      );

      await client.connect(transport);

      const result = await client.listTools();
      const tools: McpToolInfo[] = (result.tools || []).map(t => ({
        name: t.name,
        description: t.description || "",
        inputSchema: (t.inputSchema || {}) as Record<string, unknown>,
      }));

      this.connections.set(config.id, { client, transport, tools });
      return tools;
    }

    throw new Error(`Transport "${config.transport}" not yet supported`);
  }

  async disconnect(serverId: string): Promise<void> {
    const conn = this.connections.get(serverId);
    if (conn) {
      try {
        await conn.client.close();
      } catch {
        // ignore close errors
      }
      this.connections.delete(serverId);
    }
  }

  async disconnectAll(): Promise<void> {
    for (const id of Array.from(this.connections.keys())) {
      await this.disconnect(id);
    }
  }

  getTools(serverId: string): McpToolInfo[] {
    return this.connections.get(serverId)?.tools ?? [];
  }

  isConnected(serverId: string): boolean {
    return this.connections.has(serverId);
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const conn = this.connections.get(serverId);
    if (!conn) throw new Error(`MCP server ${serverId} not connected`);

    const result = await conn.client.callTool({
      name: toolName,
      arguments: args,
    });

    // Extract text content from MCP response
    if (Array.isArray(result.content)) {
      const textParts = result.content
        .filter((c: Record<string, unknown>) => c.type === "text")
        .map((c: Record<string, unknown>) => c.text);
      if (textParts.length === 1) return textParts[0];
      if (textParts.length > 1) return textParts.join("\n");
    }

    return result.content;
  }
}

// Singleton
export const mcpManager = new McpManager();

// ── Convert MCP tools to Ollama format ─────────────────────────────────────

export function mcpToolToOllamaFormat(tool: McpToolInfo): ToolDefinition {
  const schema = tool.inputSchema as {
    type?: string;
    properties?: Record<string, { type: string; description?: string; enum?: string[] }>;
    required?: string[];
  };

  const properties: Record<string, { type: string; description: string; enum?: string[] }> = {};
  const required: string[] = schema.required || [];

  if (schema.properties) {
    for (const [name, prop] of Object.entries(schema.properties)) {
      properties[name] = {
        type: prop.type || "string",
        description: prop.description || "",
        ...(prop.enum ? { enum: prop.enum } : {}),
      };
    }
  }

  return {
    type: "function",
    function: {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: "object",
        properties,
        required,
      },
    },
  };
}

export function mcpToolsToOllamaFormat(tools: McpToolInfo[]): ToolDefinition[] {
  return tools.map(mcpToolToOllamaFormat);
}
