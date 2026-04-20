/**
 * Vision Model Testing Engine
 *
 * Tests local vision models (LLaVA, Llama 3.2 Vision, MiniCPM-V, Qwen2-VL)
 * on image understanding tasks across 6 categories.
 */

// ── Types ──────────────────────────────────────────────────────────────────

export type VisionCategory =
  | "object_id"      // "List all objects you can see"
  | "ocr"            // "Read all visible text"
  | "counting"       // "How many X are in this image?"
  | "spatial"        // "What is to the left of X?"
  | "description"    // "Describe this image in detail"
  | "reasoning";     // "What is happening? What might happen next?"

export interface VisionScenario {
  id: string;
  suiteId: string;
  name: string;
  imageData: string;        // base64 encoded (no data URI prefix)
  imageMime: string;        // "image/png" | "image/jpeg"
  question: string;
  category: VisionCategory;
  expectedAnswer?: string;  // For objective categories (object_id, ocr, counting)
  rubric?: string;          // For subjective categories (description, reasoning)
  difficulty: "easy" | "medium" | "hard";
  order: number;
}

export interface VisionResult {
  scenarioId: string;
  modelName: string;
  response: string;
  score: number;           // 0-100
  scoreBreakdown: {
    method: "keyword" | "exact" | "levenshtein" | "judge";
    details: string;
  };
  tokensPerSec: number;
  ttft: number;
  duration: number;
}

// ── Ollama Vision Chat ─────────────────────────────────────────────────────

export async function chatWithVision(
  ollamaUrl: string,
  model: string,
  question: string,
  imageBase64: string,
  temperature = 0.3,
  maxTokens = 1024
): Promise<{ response: string; tokensPerSec: number; ttft: number; duration: number }> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  let responseText = "";
  let totalTokens = 0;

  const res = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{
        role: "user",
        content: question,
        images: [imageBase64],  // Ollama expects raw base64, no prefix
      }],
      stream: true,
      options: { temperature, num_predict: maxTokens },
    }),
  });

  if (!res.ok) throw new Error(`Ollama vision chat failed: ${res.status}`);
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
        if (!firstTokenTime && chunk.message?.content) {
          firstTokenTime = performance.now();
        }
        if (chunk.message?.content) {
          responseText += chunk.message.content;
          totalTokens++;
        }
        if (chunk.done) {
          totalTokens = chunk.eval_count ?? totalTokens;
        }
      } catch {
        // skip
      }
    }
  }

  const elapsed = (performance.now() - startTime) / 1000;
  return {
    response: responseText,
    tokensPerSec: elapsed > 0 ? totalTokens / elapsed : 0,
    ttft: firstTokenTime ? firstTokenTime - startTime : 0,
    duration: elapsed,
  };
}

// ── Scoring Functions ──────────────────────────────────────────────────────

/** Object identification: % of expected objects mentioned */
export function scoreObjectId(response: string, expectedObjects: string[]): { score: number; details: string } {
  if (expectedObjects.length === 0) return { score: 100, details: "No expected objects" };

  const responseLower = response.toLowerCase();
  let found = 0;

  for (const obj of expectedObjects) {
    const objLower = obj.toLowerCase();
    // Fuzzy: check for the word or common synonyms
    if (responseLower.includes(objLower)) {
      found++;
    }
  }

  const score = Math.round((found / expectedObjects.length) * 100);
  return {
    score,
    details: `Found ${found}/${expectedObjects.length} objects: ${expectedObjects.map(o =>
      responseLower.includes(o.toLowerCase()) ? `+${o}` : `-${o}`
    ).join(", ")}`,
  };
}

/** OCR: Levenshtein distance between extracted text and ground truth */
export function scoreOCR(response: string, expectedText: string): { score: number; details: string } {
  const responseClean = response.replace(/\s+/g, " ").trim().toLowerCase();
  const expectedClean = expectedText.replace(/\s+/g, " ").trim().toLowerCase();

  if (expectedClean.length === 0) return { score: 100, details: "No expected text" };

  // Simple: check if expected text is contained in response
  if (responseClean.includes(expectedClean)) {
    return { score: 100, details: "Exact match found in response" };
  }

  // Levenshtein distance on the closest substring
  const distance = levenshtein(responseClean, expectedClean);
  const maxLen = Math.max(responseClean.length, expectedClean.length);
  const similarity = maxLen > 0 ? 1 - distance / maxLen : 0;
  const score = Math.round(Math.max(0, similarity) * 100);

  return { score, details: `Levenshtein similarity: ${score}%` };
}

/** Counting: exact match or off-by-one */
export function scoreCounting(response: string, expectedCount: number): { score: number; details: string } {
  // Extract first number from response
  const numbers = response.match(/\d+/g);
  if (!numbers) return { score: 0, details: "No number found in response" };

  const found = parseInt(numbers[0]);
  if (found === expectedCount) return { score: 100, details: `Exact match: ${found}` };
  if (Math.abs(found - expectedCount) === 1) return { score: 50, details: `Off-by-one: got ${found}, expected ${expectedCount}` };
  return { score: 0, details: `Wrong: got ${found}, expected ${expectedCount}` };
}

/** Spatial reasoning: check if response contains expected relation */
export function scoreSpatial(response: string, expectedRelations: string[]): { score: number; details: string } {
  if (expectedRelations.length === 0) return { score: 100, details: "No expected relations" };

  const responseLower = response.toLowerCase();
  let found = 0;

  for (const relation of expectedRelations) {
    if (responseLower.includes(relation.toLowerCase())) {
      found++;
    }
  }

  const score = Math.round((found / expectedRelations.length) * 100);
  return { score, details: `Matched ${found}/${expectedRelations.length} spatial relations` };
}

/** Score a vision scenario based on its category */
export function scoreVisionResponse(
  response: string,
  scenario: VisionScenario
): { score: number; method: "keyword" | "exact" | "levenshtein" | "judge"; details: string } {
  const expected = scenario.expectedAnswer || "";

  switch (scenario.category) {
    case "object_id": {
      const objects = expected.split(",").map(s => s.trim()).filter(Boolean);
      const result = scoreObjectId(response, objects);
      return { ...result, method: "keyword" };
    }
    case "ocr": {
      const result = scoreOCR(response, expected);
      return { ...result, method: "levenshtein" };
    }
    case "counting": {
      const count = parseInt(expected) || 0;
      const result = scoreCounting(response, count);
      return { ...result, method: "exact" };
    }
    case "spatial": {
      const relations = expected.split(",").map(s => s.trim()).filter(Boolean);
      const result = scoreSpatial(response, relations);
      return { ...result, method: "keyword" };
    }
    case "description":
    case "reasoning":
      // These require judge evaluation — return placeholder
      return { score: -1, method: "judge", details: "Requires judge evaluation" };
    default:
      return { score: 0, method: "keyword", details: "Unknown category" };
  }
}

// ── Run Vision Scenario ────────────────────────────────────────────────────

export async function runVisionScenario(
  ollamaUrl: string,
  model: string,
  scenario: VisionScenario
): Promise<VisionResult> {
  const { response, tokensPerSec, ttft, duration } = await chatWithVision(
    ollamaUrl,
    model,
    scenario.question,
    scenario.imageData,
  );

  const scoring = scoreVisionResponse(response, scenario);

  return {
    scenarioId: scenario.id,
    modelName: model,
    response,
    score: scoring.score >= 0 ? scoring.score : 50, // Default 50 for judge-required
    scoreBreakdown: {
      method: scoring.method,
      details: scoring.details,
    },
    tokensPerSec,
    ttft,
    duration,
  };
}

// ── Utilities ──────────────────────────────────────────────────────────────

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }

  return dp[m][n];
}
