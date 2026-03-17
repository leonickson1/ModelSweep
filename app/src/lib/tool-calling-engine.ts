import type {
  ToolDefinition,
  ToolScenario,
  ToolCallScore,
  ToolCallResult,
  ActualToolCall,
  StoredToolDefinition,
  ToolParameter,
} from "@/types";

// ─── Convert stored tool defs to Ollama format ──────────────────────────────

export function toOllamaTools(stored: StoredToolDefinition[]): ToolDefinition[] {
  return stored.map((t) => ({
    type: "function" as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: {
        type: "object" as const,
        properties: Object.fromEntries(
          t.parameters.map((p: ToolParameter) => [
            p.name,
            {
              type: p.type,
              description: p.description,
              ...(p.enum && p.enum.length > 0 ? { enum: p.enum } : {}),
            },
          ])
        ),
        required: t.parameters
          .filter((p: ToolParameter) => p.required)
          .map((p: ToolParameter) => p.name),
      },
    },
  }));
}

// ─── JSON Repair ────────────────────────────────────────────────────────────

export function repairAndParseJSON(raw: string): Record<string, unknown> | null {
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to repair
  }

  let cleaned = raw.trim();

  // Strip text after closing brace
  const lastBrace = cleaned.lastIndexOf("}");
  if (lastBrace !== -1) {
    cleaned = cleaned.substring(0, lastBrace + 1);
  }

  // Add missing closing braces
  const openCount = (cleaned.match(/{/g) || []).length;
  const closeCount = (cleaned.match(/}/g) || []).length;
  if (openCount > closeCount) {
    cleaned += "}".repeat(openCount - closeCount);
  }

  // Remove trailing commas
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  // Replace single quotes with double quotes
  cleaned = cleaned.replace(/'/g, '"');

  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ─── Tool Call Scoring ──────────────────────────────────────────────────────

export function evaluateToolCallResult(
  scenario: ToolScenario,
  actualCalls: ActualToolCall[],
  textResponse: string,
  latencyMs: number,
  jsonMalformed: boolean
): ToolCallResult {
  const score: ToolCallScore = {
    toolSelection: 0,
    paramAccuracy: 0,
    toolRestraint: 5,
    sequenceOrder: 5,
    errorHandling: 5,
    hallucinatedTool: false,
    calledWhenShouldNot: false,
    missingRequiredParam: false,
    jsonMalformed: jsonMalformed,
    jsonUnrecoverable: false,
    selectionLatencyMs: latencyMs,
  };

  // CASE 1: Should NOT have called any tool
  if (!scenario.shouldCallTool) {
    if (actualCalls.length === 0) {
      score.toolSelection = 5;
      score.toolRestraint = 5;
    } else {
      score.toolSelection = 0;
      score.toolRestraint = 0;
      score.calledWhenShouldNot = true;
    }
    score.paramAccuracy = 5;
    const overall = computeToolOverallScore(score);
    return {
      scenarioId: scenario.id,
      modelName: "",
      score,
      actualToolCalls: actualCalls,
      textResponse,
      overallScore: overall,
    };
  }

  // CASE 2: Should have called tool(s) but didn't
  if (actualCalls.length === 0) {
    score.toolSelection = 0;
    score.paramAccuracy = 0;
    const overall = computeToolOverallScore(score);
    return {
      scenarioId: scenario.id,
      modelName: "",
      score,
      actualToolCalls: actualCalls,
      textResponse,
      overallScore: overall,
    };
  }

  // Check for hallucinated tools
  const definedToolNames = new Set(
    scenario.expectedToolCalls.map((t) => t.toolName)
  );
  // Also include all defined tool names from the suite (passed via scenario context)
  for (const call of actualCalls) {
    if (!definedToolNames.has(call.functionName)) {
      score.hallucinatedTool = true;
      score.toolRestraint -= 3;
    }
  }

  // Evaluate each expected tool call
  const expectedCalls = scenario.expectedToolCalls;

  for (let i = 0; i < expectedCalls.length; i++) {
    const expected = expectedCalls[i];
    const actual = actualCalls[i];

    if (!actual) {
      score.toolSelection -= 5 / expectedCalls.length;
      continue;
    }

    // Tool name match
    if (actual.functionName === expected.toolName) {
      score.toolSelection += 5 / expectedCalls.length;
    } else {
      score.toolSelection = Math.max(
        0,
        score.toolSelection - 5 / expectedCalls.length
      );
    }

    // Parameter accuracy
    if (expected.expectedParams) {
      let paramScore = 0;
      let paramCount = 0;
      for (const [key, expectation] of Object.entries(expected.expectedParams)) {
        paramCount++;
        const actualValue = actual.arguments?.[key];

        if (actualValue === undefined) {
          if (expectation.required) {
            score.missingRequiredParam = true;
          }
          continue;
        }

        switch (expectation.matchType) {
          case "exact":
            if (
              String(actualValue).toLowerCase() ===
              String(expectation.value).toLowerCase()
            ) {
              paramScore++;
            }
            break;
          case "contains":
            if (
              String(actualValue)
                .toLowerCase()
                .includes(String(expectation.value).toLowerCase())
            ) {
              paramScore++;
            }
            break;
          case "any_value":
            if (actualValue !== undefined && actualValue !== null) {
              paramScore++;
            }
            break;
          case "type_check":
            if (typeof actualValue === expectation.expectedType) {
              paramScore++;
            }
            break;
        }
      }
      score.paramAccuracy +=
        paramCount > 0
          ? (paramScore / paramCount) * (5 / expectedCalls.length)
          : 0;
    } else {
      // No param expectations, full marks for this call
      score.paramAccuracy += 5 / expectedCalls.length;
    }

    // Sequence order
    if (i > 0 && actual.functionName !== expected.toolName) {
      score.sequenceOrder -= 5 / expectedCalls.length;
    }
  }

  // Extra calls penalty
  if (actualCalls.length > expectedCalls.length) {
    score.toolRestraint -= Math.min(
      3,
      (actualCalls.length - expectedCalls.length) * 1.5
    );
  }

  // JSON malformation penalty
  if (jsonMalformed) {
    score.paramAccuracy = Math.max(0, score.paramAccuracy - 1);
  }

  // Clamp
  score.toolSelection = clamp(score.toolSelection, 0, 5);
  score.paramAccuracy = clamp(score.paramAccuracy, 0, 5);
  score.toolRestraint = clamp(score.toolRestraint, 0, 5);
  score.sequenceOrder = clamp(score.sequenceOrder, 0, 5);
  score.errorHandling = clamp(score.errorHandling, 0, 5);

  const overall = computeToolOverallScore(score);
  return {
    scenarioId: scenario.id,
    modelName: "",
    score,
    actualToolCalls: actualCalls,
    textResponse,
    overallScore: overall,
  };
}

function computeToolOverallScore(score: ToolCallScore): number {
  // Weighted average of dimensions, scaled to 0-100
  const weighted =
    score.toolSelection * 3.0 +
    score.paramAccuracy * 2.5 +
    score.toolRestraint * 1.5 +
    score.sequenceOrder * 1.5 +
    score.errorHandling * 1.5;
  const maxWeighted = 5 * (3.0 + 2.5 + 1.5 + 1.5 + 1.5); // 50
  return Math.round((weighted / maxWeighted) * 100);
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

// ─── Run a single tool scenario against Ollama ──────────────────────────────

export async function runToolCallingScenario(
  ollamaUrl: string,
  model: string,
  tools: ToolDefinition[],
  scenario: ToolScenario
): Promise<ToolCallResult> {
  const startTime = performance.now();

  const messages: { role: string; content: string }[] = [];
  if (scenario.systemPrompt) {
    messages.push({ role: "system", content: scenario.systemPrompt });
  }
  messages.push({ role: "user", content: scenario.userMessage });

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools,
      stream: false,
      options: {
        temperature: 0.1,
        num_predict: 2048,
      },
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Ollama error: ${response.status} ${errText}`);
  }

  const data = await response.json();
  const latencyMs = performance.now() - startTime;

  // Extract tool calls
  const toolCalls: ActualToolCall[] = [];
  let anyJsonMalformed = false;

  if (data.message?.tool_calls) {
    for (const tc of data.message.tool_calls) {
      let args = tc.function?.arguments;

      if (typeof args === "string") {
        const parsed = repairAndParseJSON(args);
        if (parsed === null) {
          anyJsonMalformed = true;
          args = {};
        } else {
          if (JSON.stringify(parsed) !== args) {
            anyJsonMalformed = true;
          }
          args = parsed;
        }
      }

      toolCalls.push({
        functionName: tc.function?.name ?? "",
        arguments: args ?? {},
        rawArguments: tc.function?.arguments,
        jsonMalformed:
          typeof tc.function?.arguments === "string" &&
          args !== tc.function?.arguments,
      });
    }
  }

  const textResponse = data.message?.content ?? "";

  const result = evaluateToolCallResult(
    scenario,
    toolCalls,
    textResponse,
    latencyMs,
    anyJsonMalformed
  );
  result.modelName = model;

  return result;
}

// ─── Error recovery scenario ────────────────────────────────────────────────

export async function runErrorRecoveryScenario(
  ollamaUrl: string,
  model: string,
  tools: ToolDefinition[],
  scenario: ToolScenario
): Promise<ToolCallResult> {
  const startTime = performance.now();

  // Step 1: Initial message
  const messages: { role: string; content: string }[] = [
    { role: "user", content: scenario.userMessage },
  ];

  const firstResp = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages,
      tools,
      stream: false,
      options: { temperature: 0.1, num_predict: 2048 },
    }),
  });

  const firstData = await firstResp.json();

  // Step 2: Simulate tool error
  const errorMessages = [
    ...messages,
    firstData.message,
    {
      role: "tool",
      content: JSON.stringify({
        error: scenario.simulatedError ?? "Service temporarily unavailable",
      }),
    },
  ];

  const errorResp = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: errorMessages,
      tools,
      stream: false,
      options: { temperature: 0.1, num_predict: 2048 },
    }),
  });

  const errorData = await errorResp.json();
  const latencyMs = performance.now() - startTime;
  const textResponse = errorData.message?.content ?? "";

  // Evaluate recovery: good if it acknowledges error, bad if it hallucinates results
  const score: ToolCallScore = {
    toolSelection: 5,
    paramAccuracy: 5,
    toolRestraint: 5,
    sequenceOrder: 5,
    errorHandling: 0,
    hallucinatedTool: false,
    calledWhenShouldNot: false,
    missingRequiredParam: false,
    jsonMalformed: false,
    jsonUnrecoverable: false,
    selectionLatencyMs: latencyMs,
  };

  // Score error handling based on response quality
  const lower = textResponse.toLowerCase();
  if (
    lower.includes("error") ||
    lower.includes("unavailable") ||
    lower.includes("sorry") ||
    lower.includes("unable") ||
    lower.includes("try again")
  ) {
    score.errorHandling = 4; // Acknowledged the error
  }
  if (
    lower.includes("apologize") ||
    lower.includes("alternative") ||
    lower.includes("suggest")
  ) {
    score.errorHandling = 5; // Graceful recovery
  }
  if (textResponse.length < 10) {
    score.errorHandling = 1; // Barely responded
  }

  const overall = computeToolOverallScore(score);
  return {
    scenarioId: scenario.id,
    modelName: model,
    score,
    actualToolCalls: [],
    textResponse,
    overallScore: overall,
  };
}

// ─── Check if a model supports tool calling ─────────────────────────────────

export async function checkToolCallSupport(
  ollamaUrl: string,
  modelName: string
): Promise<boolean> {
  try {
    const res = await fetch(`${ollamaUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model: modelName }),
    });
    const data = await res.json();
    const template = (data.template ?? "").toLowerCase();
    const modelfile = (data.modelfile ?? "").toLowerCase();
    // Check for tool-related template markers
    if (
      template.includes("tool") ||
      template.includes("function") ||
      modelfile.includes("tool")
    ) {
      return true;
    }
    // Known tool-capable families
    const family = (data.details?.family ?? "").toLowerCase();
    const toolFamilies = ["qwen", "llama", "mistral", "deepseek", "gemma"];
    if (toolFamilies.some((f) => family.includes(f))) {
      return true; // Most modern families support tools
    }
    return false;
  } catch {
    return false;
  }
}

// ─── Tool calling category scores ───────────────────────────────────────────

export function computeToolCategoryScores(
  results: ToolCallResult[],
  scenarios: ToolScenario[]
): Record<string, number | null> {
  const categoryScores: Record<string, number[]> = {};

  for (const result of results) {
    const scenario = scenarios.find((s) => s.id === result.scenarioId);
    if (!scenario) continue;
    const cat = scenario.category;
    if (!categoryScores[cat]) categoryScores[cat] = [];
    categoryScores[cat].push(result.overallScore);
  }

  const out: Record<string, number | null> = {};
  for (const [cat, scores] of Object.entries(categoryScores)) {
    out[cat] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }
  return out;
}
