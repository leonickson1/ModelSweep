import type { PromptDifficulty } from "@/types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ConversationScenario {
  id: string;
  suiteId: string;
  name: string;
  systemPrompt: string;
  userPersona: string;
  turnCount: number;
  turnInstructions?: Record<number, string>;
  evaluationCriteria: string[];
  difficulty: PromptDifficulty;
  temperature?: number;
  maxTokensPerTurn?: number;
  simulatorModel: string; // "cloud:<id>" or local model name
  simulatorMode: "cloud" | "local" | "scripted";
  scriptedMessages?: string[];
  order: number;
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  turnNumber: number;
  tokensPerSec?: number;
  ttft?: number;
  timestamp: number;
}

export interface ConversationScore {
  contextRetention: number;     // 0-5
  personaConsistency: number;   // 0-5
  factualConsistency: number;   // 0-5
  qualityDecay: number;         // 0-5 (5 = no decay)
  policyAdherence: number;      // 0-5
  empathy: number;              // 0-5
  perTurnQuality: number[];     // 0-5 per turn
  avgTurnsPerSec: number;
  contextTokensUsed: number;
  qualitySlope: number;         // negative = decay
}

export interface ConversationResult {
  scenarioId: string;
  modelName: string;
  history: ConversationTurn[];
  score: ConversationScore;
  overallScore: number; // 0-100
  actualTurnsCompleted: number;
  contextExhausted: boolean;
  contextTokensUsed: number;
  contextLimit: number;
  contextUtilization: number;
  totalDuration: number;
}

// ─── Token estimation ───────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

async function getModelContextLimit(ollamaUrl: string, model: string): Promise<number> {
  try {
    const res = await fetch(`${ollamaUrl}/api/show`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ model }),
    });
    const data = await res.json();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (data.model_info as any)?.["general.context_length"] ?? 4096;
  } catch {
    return 4096;
  }
}

// ─── Generate simulated user messages ───────────────────────────────────────

async function generateSimulatedUserMessage(
  ollamaUrl: string,
  simulatorModel: string,
  scenario: ConversationScenario,
  history: ConversationTurn[],
  turnNumber: number
): Promise<string> {
  // Scripted mode: use pre-defined messages
  if (scenario.simulatorMode === "scripted" && scenario.scriptedMessages) {
    return scenario.scriptedMessages[Math.min(turnNumber, scenario.scriptedMessages.length - 1)]
      ?? "Can you tell me more about that?";
  }

  const simulatorPrompt = `You are simulating a user in a conversation.
Your persona: ${scenario.userPersona}

${history.length > 0 ? `The conversation so far:
${history.map(t =>
  `${t.role === "user" ? "YOU" : "ASSISTANT"}: ${t.content}`
).join("\n\n")}` : "This is the start of the conversation."}

This is turn ${turnNumber + 1} of ${scenario.turnCount}.
${scenario.turnInstructions?.[turnNumber] ??
  "Continue the conversation naturally based on your persona."}

Generate ONLY your next message as the user. Do not include any meta-commentary or labels. Just the message text.`;

  // For local models, call Ollama directly
  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: simulatorModel,
      messages: [{ role: "user", content: simulatorPrompt }],
      stream: false,
      options: { temperature: 0.8, num_predict: 512 },
    }),
  });

  const data = await response.json();
  return (data.message?.content ?? "").trim();
}

async function generateFirstUserMessage(
  ollamaUrl: string,
  simulatorModel: string,
  scenario: ConversationScenario
): Promise<string> {
  if (scenario.simulatorMode === "scripted" && scenario.scriptedMessages?.[0]) {
    return scenario.scriptedMessages[0];
  }

  const prompt = `You are simulating a user starting a conversation.
Your persona: ${scenario.userPersona}

${scenario.turnInstructions?.[0] ?? "Start the conversation naturally based on your persona."}

Generate ONLY your opening message. No meta-commentary.`;

  const response = await fetch(`${ollamaUrl}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: simulatorModel,
      messages: [{ role: "user", content: prompt }],
      stream: false,
      options: { temperature: 0.8, num_predict: 512 },
    }),
  });

  const data = await response.json();
  return (data.message?.content ?? "").trim();
}

// ─── Run conversation scenario ──────────────────────────────────────────────

export async function runConversationScenario(
  ollamaUrl: string,
  targetModel: string,
  scenario: ConversationScenario,
  onTurn?: (turn: ConversationTurn) => void,
  onContextWarning?: (msg: string) => void,
  onContextUpdate?: (info: { tokensUsed: number; contextLimit: number; utilization: number }) => void
): Promise<ConversationResult> {
  const history: ConversationTurn[] = [];
  const targetMessages: { role: string; content: string }[] = [];
  const perTurnQuality: number[] = [];

  if (scenario.systemPrompt) {
    targetMessages.push({ role: "system", content: scenario.systemPrompt });
  }

  const modelContextLimit = await getModelContextLimit(ollamaUrl, targetModel);
  let estimatedTokensUsed = estimateTokens(scenario.systemPrompt ?? "");
  const CONTEXT_WARNING_THRESHOLD = 0.85;
  const CONTEXT_DANGER_THRESHOLD = 0.95;

  const startTime = Date.now();

  for (let turn = 0; turn < scenario.turnCount; turn++) {
    // Context window check
    const contextUtilization = estimatedTokensUsed / modelContextLimit;

    if (contextUtilization >= CONTEXT_DANGER_THRESHOLD) {
      onContextWarning?.(
        `Context window exhausted at turn ${turn} (${Math.round(contextUtilization * 100)}% of ${modelContextLimit} tokens). Ending early.`
      );
      break;
    }

    if (contextUtilization >= CONTEXT_WARNING_THRESHOLD) {
      onContextWarning?.(
        `Context ${Math.round(contextUtilization * 100)}% full. Responses may begin to degrade.`
      );
    }

    // Generate simulated user message
    const userMessage = turn === 0
      ? await generateFirstUserMessage(ollamaUrl, scenario.simulatorModel, scenario)
      : await generateSimulatedUserMessage(ollamaUrl, scenario.simulatorModel, scenario, history, turn);

    const userTurn: ConversationTurn = {
      role: "user",
      content: userMessage,
      turnNumber: turn,
      timestamp: Date.now(),
    };
    history.push(userTurn);
    onTurn?.(userTurn);

    // Get target model response
    targetMessages.push({ role: "user", content: userMessage });
    estimatedTokensUsed += estimateTokens(userMessage);

    const turnStart = performance.now();
    let firstTokenTime: number | null = null;
    let responseText = "";
    let totalTokens = 0;

    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: targetModel,
        messages: targetMessages,
        stream: true,
        options: {
          temperature: scenario.temperature ?? 0.7,
          num_predict: scenario.maxTokensPerTurn ?? 1024,
        },
      }),
    });

    const reader = response.body!.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const lines = new TextDecoder().decode(value).split("\n");
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
          // skip malformed lines
        }
      }
    }

    targetMessages.push({ role: "assistant", content: responseText });
    estimatedTokensUsed += totalTokens;

    const elapsed = (performance.now() - turnStart) / 1000;

    const assistantTurn: ConversationTurn = {
      role: "assistant",
      content: responseText,
      turnNumber: turn,
      tokensPerSec: elapsed > 0 ? totalTokens / elapsed : 0,
      ttft: firstTokenTime ? firstTokenTime - turnStart : undefined,
      timestamp: Date.now(),
    };
    history.push(assistantTurn);
    onTurn?.(assistantTurn);
    onContextUpdate?.({
      tokensUsed: estimatedTokensUsed,
      contextLimit: modelContextLimit,
      utilization: estimatedTokensUsed / modelContextLimit,
    });

    // Simple per-turn quality heuristic
    const turnQuality = estimateTurnQuality(responseText, turn);
    perTurnQuality.push(turnQuality);
  }

  const actualTurns = history.filter((t) => t.role === "assistant").length;
  const totalDuration = (Date.now() - startTime) / 1000;

  // Compute auto-scores
  const score = computeConversationAutoScore(history, scenario, perTurnQuality);
  const overallScore = computeConversationOverall(score);

  return {
    scenarioId: scenario.id,
    modelName: targetModel,
    history,
    score,
    overallScore,
    actualTurnsCompleted: actualTurns,
    contextExhausted: estimatedTokensUsed / modelContextLimit >= CONTEXT_DANGER_THRESHOLD,
    contextTokensUsed: estimatedTokensUsed,
    contextLimit: modelContextLimit,
    contextUtilization: estimatedTokensUsed / modelContextLimit,
    totalDuration,
  };
}

// ─── Quality estimation ─────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function estimateTurnQuality(response: string, _turn: number): number {
  if (!response || response.length < 10) return 1;

  let quality = 3; // baseline

  // Length bonus
  const words = response.split(/\s+/).length;
  if (words >= 30) quality += 0.5;
  if (words >= 80) quality += 0.5;

  // Repetition penalty
  const sentences = response.split(/[.!?]+/).filter(Boolean);
  const uniqueSentences = new Set(sentences.map((s) => s.trim().toLowerCase()));
  if (sentences.length > 2 && uniqueSentences.size / sentences.length < 0.5) {
    quality -= 1.5;
  }

  return Math.max(0, Math.min(5, quality));
}

function computeConversationAutoScore(
  history: ConversationTurn[],
  scenario: ConversationScenario,
  perTurnQuality: number[]
): ConversationScore {
  const assistantTurns = history.filter((t) => t.role === "assistant");

  // Quality slope (linear regression)
  let qualitySlope = 0;
  if (perTurnQuality.length > 1) {
    const n = perTurnQuality.length;
    const sumX = (n * (n - 1)) / 2;
    const sumY = perTurnQuality.reduce((a, b) => a + b, 0);
    const sumXY = perTurnQuality.reduce((a, q, i) => a + i * q, 0);
    const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
    qualitySlope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  }

  // Quality decay score: 5 if no decay, lower if slope is negative
  const qualityDecay = Math.max(0, Math.min(5, 5 + qualitySlope * 3));

  // Average speed
  const avgTurnsPerSec = assistantTurns.length > 0
    ? assistantTurns.reduce((a, t) => a + (t.tokensPerSec ?? 0), 0) / assistantTurns.length
    : 0;

  // Context tokens estimate
  const contextTokensUsed = history.reduce((a, t) => a + estimateTokens(t.content), 0);

  return {
    contextRetention: 3, // auto-scoring limited; judge needed
    personaConsistency: 3,
    factualConsistency: 3,
    qualityDecay,
    policyAdherence: 3,
    empathy: 3,
    perTurnQuality,
    avgTurnsPerSec,
    contextTokensUsed,
    qualitySlope,
  };
}

function computeConversationOverall(score: ConversationScore): number {
  const dimensions = [
    score.contextRetention,
    score.personaConsistency,
    score.factualConsistency,
    score.qualityDecay,
    score.policyAdherence,
    score.empathy,
  ];
  const avg = dimensions.reduce((a, b) => a + b, 0) / dimensions.length;
  return Math.round((avg / 5) * 100);
}

// ─── Judge prompt for conversation ──────────────────────────────────────────

export function buildConversationJudgePrompt(
  systemPrompt: string,
  history: ConversationTurn[]
): string {
  const transcript = history
    .map((t) => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.content}`)
    .join("\n\n");

  return `You are evaluating an AI assistant's performance in a multi-turn conversation. The assistant was given this system prompt:
"""
${systemPrompt}
"""

Here is the complete conversation:
${transcript}

Evaluate the assistant on these dimensions (1-5 each):

1. CONTEXT RETENTION: Did the assistant remember and correctly reference information from earlier turns?
2. PERSONA CONSISTENCY: Did the assistant maintain its assigned role throughout?
3. FACTUAL CONSISTENCY: Did the assistant contradict itself across turns?
4. QUALITY MAINTENANCE: Did the quality of responses stay stable or degrade in later turns?
5. POLICY ADHERENCE: Did the assistant follow the rules in its system prompt?
6. EMPATHY & TONE: Was the assistant appropriately empathetic and natural?

Respond with ONLY this JSON:
{
  "context_retention": <1-5>,
  "persona_consistency": <1-5>,
  "factual_consistency": <1-5>,
  "quality_maintenance": <1-5>,
  "policy_adherence": <1-5>,
  "empathy": <1-5>,
  "key_failure_turn": <turn number or null>,
  "summary": "<one sentence>"
}`;
}
