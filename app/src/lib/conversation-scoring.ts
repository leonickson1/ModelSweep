/**
 * Conversation scoring utilities.
 *
 * Per-turn quality scoring, quality slope calculation,
 * and failure mode detection for multi-turn conversations.
 */

import type { ConversationTurn } from "./conversation-engine";

// ── Per-Turn Quality (lightweight, no judge needed) ─────────────────────────

export function computePerTurnQuality(
  response: string,
  turnNumber: number,
  history: ConversationTurn[]
): number {
  if (!response || response.length < 10) return 1;

  let quality = 3;

  // Length score
  const words = response.split(/\s+/).length;
  if (words >= 30) quality += 0.5;
  if (words >= 80) quality += 0.5;

  // Repetition penalty (within this turn)
  const sentences = response.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const uniqueSentences = new Set(sentences.map(s => s.trim().toLowerCase()));
  if (sentences.length > 2 && uniqueSentences.size / sentences.length < 0.5) {
    quality -= 1.5;
  }

  // Cross-turn repetition penalty (repeating content from previous turns)
  const prevAssistantTurns = history
    .filter(t => t.role === "assistant" && t.turnNumber < turnNumber);
  if (prevAssistantTurns.length > 0) {
    const prevContent = prevAssistantTurns.map(t => t.content.toLowerCase()).join(" ");
    const responseSentences = sentences.map(s => s.trim().toLowerCase());
    const repeatedSentences = responseSentences.filter(s =>
      s.length > 20 && prevContent.includes(s)
    );
    if (responseSentences.length > 0 && repeatedSentences.length / responseSentences.length > 0.5) {
      quality -= 1;
    }
  }

  return Math.max(0, Math.min(5, quality));
}

// ── Quality Slope (linear regression) ───────────────────────────────────────

export function computeQualitySlope(perTurnScores: number[]): number {
  if (perTurnScores.length < 2) return 0;

  const n = perTurnScores.length;
  const sumX = (n * (n - 1)) / 2;
  const sumY = perTurnScores.reduce((a, b) => a + b, 0);
  const sumXY = perTurnScores.reduce((a, q, i) => a + i * q, 0);
  const sumX2 = (n * (n - 1) * (2 * n - 1)) / 6;
  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;

  return (n * sumXY - sumX * sumY) / denom;
}

// ── Failure Mode Detection ──────────────────────────────────────────────────

export interface FailureModeResult {
  type: "memory" | "persona" | "scope" | "context_overflow";
  detected: boolean;
  turn: number;
  description: string;
}

/**
 * Memory test: check if the model retained a specific fact mentioned earlier.
 * Call this after injecting a memory probe turn (e.g., "I mentioned my order number earlier").
 */
export function detectMemoryFailure(
  history: ConversationTurn[],
  factText: string,
  probeTurnNumber: number
): FailureModeResult {
  const factWords = factText.toLowerCase().split(/\W+/).filter(w => w.length > 3);
  const probeResponse = history.find(
    t => t.role === "assistant" && t.turnNumber === probeTurnNumber
  );

  if (!probeResponse) {
    return { type: "memory", detected: false, turn: probeTurnNumber, description: "No response at probe turn" };
  }

  const responseLower = probeResponse.content.toLowerCase();
  const matchedWords = factWords.filter(w => responseLower.includes(w));
  const recall = factWords.length > 0 ? matchedWords.length / factWords.length : 0;

  return {
    type: "memory",
    detected: recall < 0.3,
    turn: probeTurnNumber,
    description: recall < 0.3
      ? `Failed to recall fact (${Math.round(recall * 100)}% keyword overlap)`
      : `Recalled fact successfully (${Math.round(recall * 100)}% keyword overlap)`,
  };
}

/**
 * Persona break detection: check if the model broke character.
 * Looks for phrases like "I am an AI", "language model", etc.
 */
export function detectPersonaBreak(
  history: ConversationTurn[],
  originalPersona: string
): FailureModeResult {
  const breakPatterns = [
    /I('m| am) an? (AI|artificial intelligence|language model|chatbot|assistant)/i,
    /as an AI/i,
    /I don't have (a |real )?personality/i,
    /I('m| am) not (actually |really )?a (person|human)/i,
    /I was (created|trained|programmed|designed) (by|to)/i,
  ];

  for (const turn of history) {
    if (turn.role !== "assistant") continue;

    for (const pattern of breakPatterns) {
      if (pattern.test(turn.content)) {
        return {
          type: "persona",
          detected: true,
          turn: turn.turnNumber,
          description: `Character break detected at turn ${turn.turnNumber}: matched "${pattern.source}"`,
        };
      }
    }
  }

  return {
    type: "persona",
    detected: false,
    turn: -1,
    description: `Maintained ${originalPersona} persona throughout conversation`,
  };
}

/**
 * Scope creep detection: check if the model responded to off-topic requests.
 * The off-topic turn should explicitly change subjects.
 */
export function detectScopeCreep(
  history: ConversationTurn[],
  systemPrompt: string,
  offTopicTurnNumber: number
): FailureModeResult {
  const scopeResponse = history.find(
    t => t.role === "assistant" && t.turnNumber === offTopicTurnNumber
  );

  if (!scopeResponse) {
    return { type: "scope", detected: false, turn: offTopicTurnNumber, description: "No response at off-topic turn" };
  }

  const deflectionPatterns = [
    /I('m| am) not able to (help|assist) with that/i,
    /outside (my|the) scope/i,
    /can't help with that/i,
    /I('m| am) (designed|here) (to|for)/i,
    /let('s| us) (get back|return|focus) (on|to)/i,
    /that's not (something|within|part of)/i,
    /I (specialize|focus) (in|on)/i,
  ];

  const deflected = deflectionPatterns.some(p => p.test(scopeResponse.content));

  return {
    type: "scope",
    detected: !deflected,
    turn: offTopicTurnNumber,
    description: deflected
      ? "Model correctly deflected off-topic request"
      : "Model engaged with off-topic request (scope creep)",
  };
}

/**
 * Build per-turn judge prompt for a single turn in context.
 */
export function buildPerTurnJudgePrompt(
  systemPrompt: string,
  history: ConversationTurn[],
  targetTurnNumber: number
): string {
  const transcript = history
    .filter(t => t.turnNumber <= targetTurnNumber)
    .map(t => `${t.role === "user" ? "USER" : "ASSISTANT"}: ${t.content}`)
    .join("\n\n");

  return `Evaluate ONLY the LAST assistant response in this conversation.

System prompt given to the assistant:
"""
${systemPrompt}
"""

Conversation up to turn ${targetTurnNumber}:
${transcript}

Score the LAST assistant response on 4 dimensions (1-5 each):
1. RELEVANCE: Did it address the user's message?
2. CONSISTENCY: Does it match earlier turns (no contradictions)?
3. PERSONA: Did it stay in its assigned role?
4. QUALITY: Overall response quality (depth, clarity, helpfulness)?

Respond with ONLY this JSON:
{
  "relevance": <1-5>,
  "consistency": <1-5>,
  "persona": <1-5>,
  "quality": <1-5>
}`;
}
