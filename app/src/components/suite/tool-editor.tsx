"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, Code, Copy, Upload, Check, X } from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";
import type { ToolParameter, MockReturn } from "@/types";

interface ToolDef {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  mockReturns?: MockReturn[];
}

interface ToolEditorProps {
  tools: ToolDef[];
  suiteId: string;
  readOnly?: boolean;
  onToolsChange: (tools: ToolDef[]) => void;
}

const PARAM_TYPES = ["string", "integer", "number", "boolean", "array", "object"] as const;
const ITEM_TYPES = ["string", "integer", "number", "boolean", "object"] as const;
const MAX_NESTING_DEPTH = 3;

// Background shading per nesting level
const NESTING_BG = [
  "bg-white/[0.02]",
  "bg-white/[0.04]",
  "bg-white/[0.06]",
] as const;

// Left border accent per nesting level
const NESTING_BORDER = [
  "border-l-blue-500/20",
  "border-l-violet-500/20",
  "border-l-amber-500/20",
] as const;

const QUICK_TEMPLATES: { label: string; tools: Omit<ToolDef, "id">[] }[] = [
  {
    label: "Shopping Assistant",
    tools: [
      {
        name: "search_products",
        description: "Search the product catalog by query",
        parameters: [
          { name: "query", type: "string", description: "Search keywords", required: true },
          { name: "category", type: "string", description: "Product category", required: false },
          { name: "max_results", type: "integer", description: "Limit results", required: false },
        ],
      },
      {
        name: "get_product_details",
        description: "Get detailed info about a specific product",
        parameters: [
          { name: "product_id", type: "string", description: "The product ID", required: true },
        ],
      },
      {
        name: "add_to_cart",
        description: "Add a product to the shopping cart",
        parameters: [
          { name: "product_id", type: "string", description: "The product ID", required: true },
          { name: "quantity", type: "integer", description: "Number of items", required: true },
        ],
      },
    ],
  },
  {
    label: "API Server",
    tools: [
      {
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: [
          { name: "city", type: "string", description: "The city name", required: true },
          { name: "unit", type: "string", description: "Temperature unit", required: false, enum: ["celsius", "fahrenheit"] },
        ],
      },
      {
        name: "send_email",
        description: "Send an email to a recipient",
        parameters: [
          { name: "to", type: "string", description: "Recipient email address", required: true },
          { name: "subject", type: "string", description: "Email subject", required: true },
          { name: "body", type: "string", description: "Email body text", required: true },
        ],
      },
      {
        name: "calculate",
        description: "Perform a math calculation",
        parameters: [
          { name: "expression", type: "string", description: "Math expression to evaluate", required: true },
        ],
      },
    ],
  },
  {
    label: "Data Agent",
    tools: [
      {
        name: "query_database",
        description: "Run a SQL query against the database",
        parameters: [
          { name: "sql", type: "string", description: "SQL query to execute", required: true },
          { name: "limit", type: "integer", description: "Max rows to return", required: false },
        ],
      },
      {
        name: "create_chart",
        description: "Generate a chart from data",
        parameters: [
          { name: "chart_type", type: "string", description: "Type of chart", required: true, enum: ["bar", "line", "pie", "scatter"] },
          { name: "title", type: "string", description: "Chart title", required: true },
          { name: "data", type: "string", description: "JSON data for the chart", required: true },
        ],
      },
    ],
  },
];

// ─── Recursive parameter list component ──────────────────────────────────────

interface ParameterListProps {
  params: ToolParameter[];
  depth: number;
  readOnly?: boolean;
  onUpdate: (params: ToolParameter[]) => void;
}

function ParameterList({ params, depth, readOnly, onUpdate }: ParameterListProps) {
  const bgClass = NESTING_BG[Math.min(depth, NESTING_BG.length - 1)];
  const borderClass = depth > 0 ? NESTING_BORDER[Math.min(depth - 1, NESTING_BORDER.length - 1)] : "";

  const updateNestedParam = (paramIdx: number, updates: Partial<ToolParameter>) => {
    const updated = [...params];
    updated[paramIdx] = { ...updated[paramIdx], ...updates };
    onUpdate(updated);
  };

  const deleteNestedParam = (paramIdx: number) => {
    onUpdate(params.filter((_, i) => i !== paramIdx));
  };

  // For array items: update properties of the items object
  const updateArrayItemProps = (paramIdx: number, itemProperties: ToolParameter[]) => {
    const updated = [...params];
    updated[paramIdx] = {
      ...updated[paramIdx],
      items: { ...updated[paramIdx].items!, properties: itemProperties },
    };
    onUpdate(updated);
  };

  return (
    <div className="space-y-2">
      <AnimatePresence mode="popLayout">
        {params.map((param, pi) => (
          <motion.div
            key={pi}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className={`${bgClass} ${depth > 0 ? `border-l-2 ${borderClass}` : ""} rounded-lg p-2 space-y-2`}
          >
            <div className="flex items-start gap-2">
              <div className="flex-1 grid grid-cols-4 gap-2">
                <input
                  value={param.name}
                  onChange={(e) => updateNestedParam(pi, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                  disabled={readOnly}
                  className="bg-transparent border border-white/[0.06] rounded px-2 py-1 text-xs text-zinc-200 font-mono outline-none focus:border-blue-500/30"
                  placeholder="name"
                />
                <select
                  value={param.type}
                  onChange={(e) => {
                    const newType = e.target.value as ToolParameter["type"];
                    const updates: Partial<ToolParameter> = { type: newType };
                    // Initialize nested structures when switching types
                    if (newType === "object" && !param.properties) {
                      updates.properties = [];
                    }
                    if (newType === "array" && !param.items) {
                      updates.items = { type: "string" };
                    }
                    // Clean up when switching away
                    if (newType !== "object") {
                      updates.properties = undefined;
                    }
                    if (newType !== "array") {
                      updates.items = undefined;
                    }
                    if (newType !== "string") {
                      updates.enum = undefined;
                    }
                    updateNestedParam(pi, updates);
                  }}
                  disabled={readOnly}
                  className="bg-zinc-900 border border-white/[0.06] rounded px-2 py-1 text-xs text-zinc-300 outline-none"
                >
                  {(depth < MAX_NESTING_DEPTH ? PARAM_TYPES : PARAM_TYPES.filter(t => t !== "object" && t !== "array")).map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  value={param.description}
                  onChange={(e) => updateNestedParam(pi, { description: e.target.value })}
                  disabled={readOnly}
                  className="bg-transparent border border-white/[0.06] rounded px-2 py-1 text-xs text-zinc-400 outline-none focus:border-blue-500/30"
                  placeholder="description"
                />
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-1 text-xs text-zinc-500">
                    <input
                      type="checkbox"
                      checked={param.required}
                      onChange={(e) => updateNestedParam(pi, { required: e.target.checked })}
                      disabled={readOnly}
                      className="rounded border-white/20"
                    />
                    req
                  </label>
                  {!readOnly && (
                    <button
                      onClick={() => deleteNestedParam(pi)}
                      className="text-zinc-700 hover:text-red-400 transition-colors"
                    >
                      <Trash2 size={10} />
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Enum values - only for string type */}
            {param.type === "string" && (
              <div className="flex items-center gap-2 pl-0.5">
                <span className="text-zinc-600 text-[10px] uppercase tracking-wider flex-shrink-0">Enum:</span>
                {readOnly && param.enum && param.enum.length > 0 ? (
                  <span className="text-zinc-400 text-xs font-mono">[{param.enum.join(", ")}]</span>
                ) : !readOnly ? (
                  <input
                    value={(param.enum || []).join(", ")}
                    onChange={(e) => {
                      const raw = e.target.value;
                      const values = raw.split(",").map((v) => v.trim()).filter(Boolean);
                      updateNestedParam(pi, { enum: values.length > 0 ? values : undefined });
                    }}
                    className="flex-1 bg-transparent border border-white/[0.06] rounded px-2 py-0.5 text-xs text-zinc-400 font-mono outline-none focus:border-blue-500/30"
                    placeholder="Comma-separated values (optional)"
                  />
                ) : null}
              </div>
            )}

            {/* Object nested properties */}
            {param.type === "object" && depth < MAX_NESTING_DEPTH && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pl-3 pt-1 space-y-2 overflow-hidden"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Properties</span>
                    {!readOnly && (
                      <button
                        onClick={() => {
                          const newProp: ToolParameter = {
                            name: "prop_" + ((param.properties?.length || 0) + 1),
                            type: "string",
                            description: "",
                            required: false,
                          };
                          updateNestedParam(pi, { properties: [...(param.properties || []), newProp] });
                        }}
                        className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
                      >
                        + Add Property
                      </button>
                    )}
                  </div>
                  {(!param.properties || param.properties.length === 0) ? (
                    <p className="text-zinc-700 text-xs py-1">No properties defined.</p>
                  ) : (
                    <ParameterList
                      params={param.properties}
                      depth={depth + 1}
                      readOnly={readOnly}
                      onUpdate={(newProps) => updateNestedParam(pi, { properties: newProps })}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {/* Array item type */}
            {param.type === "array" && (
              <AnimatePresence>
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2 }}
                  className="pl-3 pt-1 space-y-2 overflow-hidden"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-500 text-[10px] uppercase tracking-wider flex-shrink-0">Item type:</span>
                    <select
                      value={param.items?.type || "string"}
                      onChange={(e) => {
                        const itemType = e.target.value;
                        const newItems: ToolParameter["items"] = { type: itemType };
                        if (itemType === "object") {
                          newItems.properties = param.items?.properties || [];
                        }
                        updateNestedParam(pi, { items: newItems });
                      }}
                      disabled={readOnly}
                      className="bg-zinc-900 border border-white/[0.06] rounded px-2 py-0.5 text-xs text-zinc-300 outline-none"
                    >
                      {(depth < MAX_NESTING_DEPTH ? ITEM_TYPES : ITEM_TYPES.filter(t => t !== "object")).map((t) => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                  </div>

                  {/* Array items with object type — show nested properties */}
                  {param.items?.type === "object" && depth < MAX_NESTING_DEPTH && (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-500 text-[10px] uppercase tracking-wider">Item Properties</span>
                        {!readOnly && (
                          <button
                            onClick={() => {
                              const newProp: ToolParameter = {
                                name: "prop_" + ((param.items?.properties?.length || 0) + 1),
                                type: "string",
                                description: "",
                                required: false,
                              };
                              updateArrayItemProps(pi, [...(param.items?.properties || []), newProp]);
                            }}
                            className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
                          >
                            + Add Property
                          </button>
                        )}
                      </div>
                      {(!param.items?.properties || param.items.properties.length === 0) ? (
                        <p className="text-zinc-700 text-xs py-1">No item properties defined.</p>
                      ) : (
                        <ParameterList
                          params={param.items.properties}
                          depth={depth + 1}
                          readOnly={readOnly}
                          onUpdate={(newProps) => updateArrayItemProps(pi, newProps)}
                        />
                      )}
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            )}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

export function ToolEditor({ tools, suiteId, readOnly, onToolsChange }: ToolEditorProps) {
  const [expandedTool, setExpandedTool] = useState<string | null>(null);
  const [jsonPreviewOpen, setJsonPreviewOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importJson, setImportJson] = useState("");
  const [importError, setImportError] = useState<string | null>(null);

  // Convert a ToolParameter[] to JSON Schema properties object (recursive)
  const paramsToSchema = useCallback((params: ToolParameter[]): { properties: Record<string, Record<string, unknown>>; required: string[] } => {
    const properties: Record<string, Record<string, unknown>> = {};
    const required: string[] = [];
    for (const p of params) {
      const prop: Record<string, unknown> = { type: p.type, description: p.description };
      if (p.enum && p.enum.length > 0) {
        prop.enum = p.enum;
      }
      if (p.type === "object" && p.properties && p.properties.length > 0) {
        const nested = paramsToSchema(p.properties);
        prop.properties = nested.properties;
        if (nested.required.length > 0) prop.required = nested.required;
      }
      if (p.type === "array" && p.items) {
        const itemSchema: Record<string, unknown> = { type: p.items.type };
        if (p.items.type === "object" && p.items.properties && p.items.properties.length > 0) {
          const nested = paramsToSchema(p.items.properties);
          itemSchema.properties = nested.properties;
          if (nested.required.length > 0) itemSchema.required = nested.required;
        }
        prop.items = itemSchema;
      }
      properties[p.name] = prop;
      if (p.required) required.push(p.name);
    }
    return { properties, required };
  }, []);

  // Generate OpenAI function calling JSON schema from tools
  const jsonPreview = useMemo(() => {
    const schema = tools.map((tool) => {
      const { properties, required } = paramsToSchema(tool.parameters);
      return {
        type: "function" as const,
        function: {
          name: tool.name,
          description: tool.description,
          parameters: {
            type: "object",
            properties,
            ...(required.length > 0 ? { required } : {}),
          },
        },
      };
    });
    return JSON.stringify(schema, null, 2);
  }, [tools, paramsToSchema]);

  const copyJsonToClipboard = useCallback(async () => {
    await navigator.clipboard.writeText(jsonPreview);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [jsonPreview]);

  // Recursively parse JSON Schema properties into ToolParameter[]
  const parseSchemaProperties = useCallback((props: Record<string, unknown>, req: string[]): ToolParameter[] => {
    const params: ToolParameter[] = [];
    if (!props || typeof props !== "object") return params;
    for (const [key, val] of Object.entries(props)) {
      const v = val as Record<string, unknown>;
      const param: ToolParameter = {
        name: key,
        type: (v.type as ToolParameter["type"]) || "string",
        description: (v.description as string) || "",
        required: req.includes(key),
        ...(Array.isArray(v.enum) && v.enum.length > 0 ? { enum: v.enum as string[] } : {}),
      };
      // Parse nested object properties
      if (v.type === "object" && v.properties && typeof v.properties === "object") {
        param.properties = parseSchemaProperties(
          v.properties as Record<string, unknown>,
          (Array.isArray(v.required) ? v.required : []) as string[]
        );
      }
      // Parse array item type
      if (v.type === "array" && v.items && typeof v.items === "object") {
        const items = v.items as Record<string, unknown>;
        param.items = { type: (items.type as string) || "string" };
        if (items.type === "object" && items.properties && typeof items.properties === "object") {
          param.items.properties = parseSchemaProperties(
            items.properties as Record<string, unknown>,
            (Array.isArray(items.required) ? items.required : []) as string[]
          );
        }
      }
      params.push(param);
    }
    return params;
  }, []);

  const handleImportJson = useCallback(async () => {
    setImportError(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(importJson);
    } catch {
      setImportError("Invalid JSON. Please check syntax and try again.");
      return;
    }

    if (!Array.isArray(parsed)) {
      setImportError("Expected a JSON array of tool definitions.");
      return;
    }

    const newTools: ToolDef[] = [];
    for (let i = 0; i < parsed.length; i++) {
      const item = parsed[i];
      const fn = item?.function || item;
      if (!fn?.name) {
        setImportError(`Tool at index ${i} is missing a "name" (or "function.name").`);
        return;
      }
      const props = fn.parameters?.properties;
      const req: string[] = fn.parameters?.required || [];
      const params = parseSchemaProperties(props, req);
      try {
        const res = await fetch(`/api/suites/${suiteId}/tools`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: fn.name,
            description: fn.description || "",
            parameters: params,
            order: tools.length + i,
          }),
        });
        const data = await res.json();
        newTools.push({
          id: data.id,
          name: fn.name,
          description: fn.description || "",
          parameters: params,
        });
      } catch {
        setImportError(`Failed to save tool "${fn.name}". Network error.`);
        return;
      }
    }

    onToolsChange([...tools, ...newTools]);
    setImportModalOpen(false);
    setImportJson("");
    setImportError(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [importJson, tools, suiteId, onToolsChange]);

  const addTool = async () => {
    const res = await fetch(`/api/suites/${suiteId}/tools`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "new_tool", description: "", parameters: [], order: tools.length }),
    });
    const data = await res.json();
    const newTool: ToolDef = { id: data.id, name: "new_tool", description: "", parameters: [] };
    onToolsChange([...tools, newTool]);
    setExpandedTool(data.id);
  };

  const deleteTool = async (toolId: string) => {
    await fetch(`/api/suites/${suiteId}/tools`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: toolId }),
    });
    onToolsChange(tools.filter((t) => t.id !== toolId));
    if (expandedTool === toolId) setExpandedTool(null);
  };

  const updateTool = async (toolId: string, updates: Partial<ToolDef>) => {
    await fetch(`/api/suites/${suiteId}/tools`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: toolId, ...updates }),
    });
    onToolsChange(tools.map((t) => (t.id === toolId ? { ...t, ...updates } : t)));
  };

  const addParam = (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    const newParam: ToolParameter = {
      name: "param_" + (tool.parameters.length + 1),
      type: "string",
      description: "",
      required: false,
    };
    const updated = [...tool.parameters, newParam];
    updateTool(toolId, { parameters: updated });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const updateParam = (toolId: string, paramIdx: number, updates: Partial<ToolParameter>) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    const updated = [...tool.parameters];
    updated[paramIdx] = { ...updated[paramIdx], ...updates };
    updateTool(toolId, { parameters: updated });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const deleteParam = (toolId: string, paramIdx: number) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    const updated = tool.parameters.filter((_, i) => i !== paramIdx);
    updateTool(toolId, { parameters: updated });
  };

  const addMockReturn = (toolId: string) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    const newMock: MockReturn = { returns: {} };
    const updated = [...(tool.mockReturns || []), newMock];
    updateTool(toolId, { mockReturns: updated });
  };

  const updateMockReturn = (toolId: string, idx: number, updates: Partial<MockReturn>) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    const updated = [...(tool.mockReturns || [])];
    updated[idx] = { ...updated[idx], ...updates };
    updateTool(toolId, { mockReturns: updated });
  };

  const deleteMockReturn = (toolId: string, idx: number) => {
    const tool = tools.find((t) => t.id === toolId);
    if (!tool) return;
    const updated = (tool.mockReturns || []).filter((_, i) => i !== idx);
    updateTool(toolId, { mockReturns: updated });
  };

  const applyTemplate = async (template: typeof QUICK_TEMPLATES[number]) => {
    const newTools: ToolDef[] = [];
    for (let i = 0; i < template.tools.length; i++) {
      const t = template.tools[i];
      const res = await fetch(`/api/suites/${suiteId}/tools`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...t, order: tools.length + i }),
      });
      const data = await res.json();
      newTools.push({ id: data.id, ...t });
    }
    onToolsChange([...tools, ...newTools]);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
          Tool Definitions
        </h3>
        {!readOnly && (
          <div className="flex items-center gap-2">
            <Button size="sm" variant="secondary" onClick={() => setImportModalOpen(true)}>
              <Upload size={12} />
              Import JSON
            </Button>
            <Button size="sm" variant="secondary" onClick={addTool}>
              <Plus size={12} />
              Add Tool
            </Button>
          </div>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {tools.map((tool) => (
          <motion.div
            key={tool.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <GlowCard className="p-0 overflow-hidden" animate={false}>
              {/* Tool header */}
              <button
                onClick={() => setExpandedTool(expandedTool === tool.id ? null : tool.id)}
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <GripVertical size={14} className="text-zinc-700 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-blue-300 font-mono text-sm">{tool.name}</span>
                  {tool.description && (
                    <span className="text-zinc-600 text-xs ml-2">{tool.description}</span>
                  )}
                </div>
                <span className="text-zinc-600 text-xs">
                  {tool.parameters.length} param{tool.parameters.length !== 1 ? "s" : ""}
                </span>
                {!readOnly && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deleteTool(tool.id); }}
                    className="text-zinc-700 hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                {expandedTool === tool.id ? (
                  <ChevronUp size={14} className="text-zinc-600" />
                ) : (
                  <ChevronDown size={14} className="text-zinc-600" />
                )}
              </button>

              {/* Expanded tool details */}
              <AnimatePresence>
                {expandedTool === tool.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="px-4 pb-4 space-y-3 border-t border-white/[0.06]">
                      {/* Name & description */}
                      <div className="grid grid-cols-2 gap-3 pt-3">
                        <div>
                          <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                            Function Name
                          </label>
                          <input
                            value={tool.name}
                            onChange={(e) => updateTool(tool.id, { name: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") })}
                            disabled={readOnly}
                            className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-200 font-mono outline-none focus:border-blue-500/30 disabled:opacity-50"
                            placeholder="function_name"
                          />
                        </div>
                        <div>
                          <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                            Description
                          </label>
                          <input
                            value={tool.description}
                            onChange={(e) => updateTool(tool.id, { description: e.target.value })}
                            disabled={readOnly}
                            className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-blue-500/30 disabled:opacity-50"
                            placeholder="What does this tool do?"
                          />
                        </div>
                      </div>

                      {/* Parameters */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-zinc-600 text-[10px] uppercase tracking-wider">
                            Parameters
                          </label>
                          {!readOnly && (
                            <button
                              onClick={() => addParam(tool.id)}
                              className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
                            >
                              + Add
                            </button>
                          )}
                        </div>

                        {tool.parameters.length === 0 ? (
                          <p className="text-zinc-700 text-xs py-2">No parameters defined.</p>
                        ) : (
                          <ParameterList
                            params={tool.parameters}
                            depth={0}
                            readOnly={readOnly}
                            onUpdate={(params) => updateTool(tool.id, { parameters: params })}
                          />
                        )}
                      </div>

                      {/* Mock Returns */}
                      <div>
                        <div className="flex items-center justify-between mb-2">
                          <label className="text-zinc-600 text-[10px] uppercase tracking-wider">
                            Mock Returns
                          </label>
                          {!readOnly && (
                            <button
                              onClick={() => addMockReturn(tool.id)}
                              className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
                            >
                              + Add Return
                            </button>
                          )}
                        </div>

                        {(!tool.mockReturns || tool.mockReturns.length === 0) ? (
                          <p className="text-zinc-700 text-xs py-2">
                            No mock returns defined. Add one to simulate tool responses during evaluation.
                          </p>
                        ) : (
                          <div className="space-y-2">
                            {tool.mockReturns.map((mock, mi) => (
                              <div
                                key={mi}
                                className="bg-white/[0.03] rounded-lg p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between">
                                  <span className="text-zinc-500 text-[10px] uppercase tracking-wider">
                                    Return {mi + 1}{mock.when && Object.keys(mock.when).length > 0 ? " (conditional)" : " (default)"}
                                  </span>
                                  {!readOnly && (
                                    <button
                                      onClick={() => deleteMockReturn(tool.id, mi)}
                                      className="text-zinc-700 hover:text-red-400 transition-colors"
                                    >
                                      <Trash2 size={10} />
                                    </button>
                                  )}
                                </div>

                                {/* When conditions */}
                                <div>
                                  <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                                    When (optional param conditions)
                                  </label>
                                  <input
                                    value={mock.when ? Object.entries(mock.when).map(([k, v]) => `${k}=${v}`).join(", ") : ""}
                                    onChange={(e) => {
                                      const raw = e.target.value.trim();
                                      if (!raw) {
                                        updateMockReturn(tool.id, mi, { when: undefined });
                                        return;
                                      }
                                      const when: Record<string, string> = {};
                                      for (const pair of raw.split(",")) {
                                        const [k, ...vParts] = pair.split("=");
                                        if (k?.trim() && vParts.length > 0) {
                                          when[k.trim()] = vParts.join("=").trim();
                                        }
                                      }
                                      updateMockReturn(tool.id, mi, { when: Object.keys(when).length > 0 ? when : undefined });
                                    }}
                                    disabled={readOnly}
                                    className="w-full bg-transparent border border-white/[0.06] rounded px-2 py-1 text-xs text-zinc-400 font-mono outline-none focus:border-blue-500/30 disabled:opacity-50"
                                    placeholder='city=Tokyo, unit=celsius (empty = default return)'
                                  />
                                </div>

                                {/* Returns JSON */}
                                <div>
                                  <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                                    Returns (JSON)
                                  </label>
                                  <textarea
                                    value={typeof mock.returns === "string" ? mock.returns : JSON.stringify(mock.returns, null, 2)}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      try {
                                        const parsed = JSON.parse(raw);
                                        updateMockReturn(tool.id, mi, { returns: parsed });
                                      } catch {
                                        // Keep raw string while user is typing invalid JSON
                                        updateMockReturn(tool.id, mi, { returns: raw });
                                      }
                                    }}
                                    disabled={readOnly}
                                    rows={3}
                                    className="w-full bg-white/[0.02] border border-white/[0.06] rounded px-2 py-1.5 text-xs text-zinc-300 font-mono outline-none focus:border-blue-500/30 disabled:opacity-50 resize-y"
                                    placeholder='{ "temperature": 22, "condition": "sunny" }'
                                  />
                                </div>

                                {/* Error simulation */}
                                <div>
                                  <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                                    Error (optional, simulates a tool error)
                                  </label>
                                  <input
                                    value={mock.error || ""}
                                    onChange={(e) => updateMockReturn(tool.id, mi, { error: e.target.value || undefined })}
                                    disabled={readOnly}
                                    className="w-full bg-transparent border border-white/[0.06] rounded px-2 py-1 text-xs text-zinc-400 outline-none focus:border-blue-500/30 disabled:opacity-50"
                                    placeholder="e.g. API rate limit exceeded"
                                  />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlowCard>
          </motion.div>
        ))}
      </AnimatePresence>

      {tools.length === 0 && !readOnly && (
        <div className="text-center py-6">
          <p className="text-zinc-600 text-sm mb-3">No tools defined yet. Add one or use a template.</p>
        </div>
      )}

      {/* Quick templates */}
      {!readOnly && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-zinc-600 text-xs">Quick templates:</span>
          {QUICK_TEMPLATES.map((tpl) => (
            <button
              key={tpl.label}
              onClick={() => applyTemplate(tpl)}
              className="text-xs px-2.5 py-1 rounded-lg border border-white/[0.06] bg-white/5 text-zinc-400 hover:text-zinc-200 hover:bg-white/10 transition-colors"
            >
              {tpl.label}
            </button>
          ))}
        </div>
      )}

      {/* JSON Preview Panel */}
      {tools.length > 0 && (
        <div className="mt-2">
          <button
            onClick={() => setJsonPreviewOpen(!jsonPreviewOpen)}
            className="flex items-center gap-2 text-zinc-500 text-xs hover:text-zinc-300 transition-colors"
          >
            <Code size={12} />
            <span>JSON Schema Preview</span>
            {jsonPreviewOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
          </button>
          <AnimatePresence>
            {jsonPreviewOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="relative mt-2">
                  <pre className="text-xs font-mono text-zinc-400 bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] overflow-auto max-h-[300px]">
                    {jsonPreview}
                  </pre>
                  <button
                    onClick={copyJsonToClipboard}
                    className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-lg bg-white/5 border border-white/[0.06] text-zinc-500 hover:text-zinc-200 hover:bg-white/10 transition-colors text-xs"
                  >
                    {copied ? <Check size={10} /> : <Copy size={10} />}
                    {copied ? "Copied" : "Copy"}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Import JSON Modal */}
      <AnimatePresence>
        {importModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => { setImportModalOpen(false); setImportError(null); setImportJson(""); }}
          >
            <motion.div
              initial={{ opacity: 0, y: 12, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.97 }}
              transition={{ duration: 0.2 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-lg bg-zinc-950 border border-white/[0.06] rounded-2xl p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-zinc-100 font-semibold tracking-tight">Import Tool Definitions</h3>
                <button
                  onClick={() => { setImportModalOpen(false); setImportError(null); setImportJson(""); }}
                  className="text-zinc-600 hover:text-zinc-300 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <p className="text-zinc-500 text-xs">
                Paste an OpenAI function calling JSON array. Each item should have a{" "}
                <code className="text-zinc-400 font-mono">function.name</code> and optional{" "}
                <code className="text-zinc-400 font-mono">function.parameters</code>.
              </p>
              <textarea
                value={importJson}
                onChange={(e) => { setImportJson(e.target.value); setImportError(null); }}
                className="w-full h-48 bg-white/[0.03] border border-white/[0.06] rounded-xl px-4 py-3 text-xs font-mono text-zinc-300 outline-none focus:border-blue-500/30 resize-none"
                placeholder={`[{\n  "type": "function",\n  "function": {\n    "name": "my_tool",\n    "description": "...",\n    "parameters": { ... }\n  }\n}]`}
              />
              {importError && (
                <p className="text-red-400 text-xs">{importError}</p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => { setImportModalOpen(false); setImportError(null); setImportJson(""); }}
                >
                  Cancel
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleImportJson}
                  disabled={!importJson.trim()}
                >
                  <Upload size={12} />
                  Import
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
