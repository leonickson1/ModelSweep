import { GateResult, GateFlag, GateScoreResult, CategoryScoreV2 } from "@/types";

// ── Thinking Model Support ──────────────────────────────────────────────────

/**
 * Strip `<think>...</think>` blocks that reasoning models (DeepSeek-R1,
 * lfm2.5-thinking, QwQ, etc.) wrap around their internal chain-of-thought.
 * Returns the visible output the user/judge should see, plus the raw
 * thinking content for debugging. If no tags are found, returns the
 * original response unchanged.
 */
export function stripThinkingTags(response: string): { visible: string; thinking: string } {
  // Handle multiple <think> blocks and variations like <think>, </think>, <thinking>, etc.
  const thinkRegex = /<think(?:ing)?>([\s\S]*?)<\/think(?:ing)?>/gi;
  let thinking = "";
  let match;
  while ((match = thinkRegex.exec(response)) !== null) {
    thinking += match[1];
  }
  const visible = response.replace(thinkRegex, "").trim();
  return { visible, thinking };
}

// ── Hard Gate Checks (Pass/Fail) ────────────────────────────────────────────

const REFUSAL_PATTERNS = [
  /(?:I cannot|I'm unable|as an AI|I don't have the ability|I'm not able)/i,
];

export function runGateChecks(
  response: string,
  timedOut: boolean,
  error: string | null,
  maxTokens: number
): GateResult {
  // Crash / Timeout
  if (error) {
    return { pass: false, flag: "ERROR" };
  }
  if (timedOut) {
    return { pass: false, flag: "TRUNCATED" };
  }

  // Strip thinking tags so reasoning models' internal monologue doesn't
  // inflate word counts or trigger false refusal/repetition flags.
  const { visible } = stripThinkingTags(response);
  const stripped = visible.replace(/\s+/g, " ").trim();

  // Empty gate — under 4 words of VISIBLE content (lenient: short correct
  // answers like "The capital of Australia is Canberra." should pass)
  if (stripped.split(/\s+/).length < 4) {
    return { pass: false, flag: "EMPTY" };
  }

  // Refusal gate — check visible output only (thinking may contain
  // reasoning like "I cannot do X because..." that looks like refusal)
  if (REFUSAL_PATTERNS.some((p) => p.test(visible))) {
    return { pass: false, flag: "REFUSED" };
  }

  // Severe repetition gate (4-gram, threshold 0.5 over 300 tokens)
  const repScore = measureRepetition(visible, 300);
  if (repScore > 0.5) {
    return { pass: false, flag: "REPETITION_LOOP" };
  }

  // Gibberish gate (>40% non-ASCII) — check visible only
  const nonAscii = (visible.match(/[^\x00-\x7F]/g) || []).length;
  if (visible.length > 20 && nonAscii / visible.length > 0.4) {
    return { pass: false, flag: "GIBBERISH" };
  }

  // Truncated gate — ends mid-sentence AND token count within 95% of max_tokens
  const wordCount = stripped.split(/\s+/).length;
  const approxTokens = Math.round(wordCount * 1.3);
  if (approxTokens > maxTokens * 0.95 && !/[.!?:;]\s*$/.test(stripped)) {
    return { pass: false, flag: "TRUNCATED" };
  }

  return { pass: true, flag: null };
}

function measureRepetition(response: string, windowSize: number): number {
  const words = response.toLowerCase().split(/\s+/);
  if (words.length < 20) return 0;

  const window = words.slice(-windowSize);
  const fourgrams = new Map<string, number>();

  for (let i = 0; i < window.length - 3; i++) {
    const gram = `${window[i]} ${window[i + 1]} ${window[i + 2]} ${window[i + 3]}`;
    fourgrams.set(gram, (fourgrams.get(gram) || 0) + 1);
  }

  const total = Math.max(1, window.length - 3);
  const repeated = Array.from(fourgrams.values())
    .filter((v) => v > 1)
    .reduce((a, b) => a + b, 0);
  return repeated / total;
}

// ── Gate Score (replaces computeRubricScore) ────────────────────────────────

export function computeGateScore(
  response: string,
  timedOut: boolean,
  error: string | null,
  maxTokens: number
): GateScoreResult {
  const gate = runGateChecks(response, timedOut, error, maxTokens);
  return {
    score: gate.pass ? 100 : 0,
    gate,
    warnings: gate.flag ? [gate.flag] : [],
  };
}

// ── Composite Score ─────────────────────────────────────────────────────────

/**
 * Simplified composite:
 * - Gate failed → 0
 * - Judge present → judgeScore (judge dominates)
 * - No judge → 100 (gates passed = "ran successfully")
 */
/** Per-vote nudge applied to the base composite. Tuned so a single thumbs-up
 *  is meaningful but doesn't overpower judge scoring. */
export const HUMAN_VOTE_NUDGE = 5;

export function computeCompositeScore(
  gateScore: number,
  gatePass: boolean,
  gateFlag: GateFlag | null,
  judgeScore?: number,
  humanVote?: "better" | "worse" | "same" | null
): { score: number; layers: string[] } {
  if (!gatePass) {
    return { score: 0, layers: ["auto"] };
  }

  const baseScore = judgeScore !== undefined && judgeScore > 0
    ? Math.max(0, Math.min(100, judgeScore))
    : gateScore;

  const layers: string[] = judgeScore !== undefined && judgeScore > 0
    ? ["auto", "judge"]
    : ["auto"];

  if (humanVote === "better") {
    return { score: Math.min(100, baseScore + HUMAN_VOTE_NUDGE), layers: [...layers, "human"] };
  }
  if (humanVote === "worse") {
    return { score: Math.max(0, baseScore - HUMAN_VOTE_NUDGE), layers: [...layers, "human"] };
  }

  return { score: baseScore, layers };
}

/**
 * Compute judge score from 4-axis evaluation (1–5 each).
 * Normalized: (sum - 4) / 16 * 100
 */
export function computeJudgeScore(axes: {
  accuracy: number;
  helpfulness: number;
  clarity: number;
  instructionFollowing: number;
}): number {
  const sum = axes.accuracy + axes.helpfulness + axes.clarity + axes.instructionFollowing;
  return Math.round(((sum - 4) / 16) * 100);
}

// ── Category Scores (v2: null for untested) ─────────────────────────────────

export function computeCategoryScoresV2(
  results: Array<{ score: number; category: string; tokensPerSec?: number }>,
  maxTokensPerSec: number,
  allCategories: string[] = ["coding", "creative", "reasoning", "instruction", "speed"]
): CategoryScoreV2[] {
  return allCategories.map((category) => {
    if (category === "speed") {
      const speedScores = results
        .filter((r) => r.tokensPerSec !== undefined && r.tokensPerSec > 0 && maxTokensPerSec > 0)
        .map((r) => ((r.tokensPerSec ?? 0) / maxTokensPerSec) * 100);

      if (speedScores.length === 0) {
        return { category, score: null, promptCount: 0, confidence: "none" as const };
      }

      const avg = Math.round(speedScores.reduce((a, b) => a + b, 0) / speedScores.length);
      return {
        category,
        score: avg,
        promptCount: speedScores.length,
        confidence: speedScores.length >= 10 ? "high" as const : speedScores.length >= 5 ? "medium" as const : "low" as const,
      };
    }

    const categoryResults = results.filter((r) => r.category === category);
    if (categoryResults.length === 0) {
      return { category, score: null, promptCount: 0, confidence: "none" as const };
    }

    const avg = Math.round(
      categoryResults.reduce((a, r) => a + r.score, 0) / categoryResults.length
    );
    const confidence =
      categoryResults.length >= 10 ? "high" as const :
        categoryResults.length >= 5 ? "medium" as const : "low" as const;

    return { category, score: avg, promptCount: categoryResults.length, confidence };
  });
}

/**
 * Convert v2 category scores to the legacy Record<string, number> format.
 */
export function categoryScoresV2ToLegacy(
  v2: CategoryScoreV2[]
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const c of v2) {
    result[c.category] = c.score;
  }
  return result;
}

/**
 * Compute overall score from prompt results (difficulty-weighted average).
 */
export function computeModelOverallScore(
  promptScores: number[],
  difficulties: string[]
): number {
  if (promptScores.length === 0) return 0;

  const weights: Record<string, number> = { easy: 1, medium: 1.5, hard: 2 };
  let weightedSum = 0;
  let totalWeight = 0;

  for (let i = 0; i < promptScores.length; i++) {
    const w = weights[difficulties[i]] ?? 1;
    weightedSum += promptScores[i] * w;
    totalWeight += w;
  }

  return Math.round(weightedSum / totalWeight);
}

/**
 * Generate a headline verdict for a test run.
 */
export function generateVerdict(
  modelResults: Array<{ name: string; overallScore: number; avgTokensPerSec: number }>
): string {
  if (modelResults.length === 0) return "No results available.";
  if (modelResults.length === 1) {
    return `${modelResults[0].name} scored ${modelResults[0].overallScore}%.`;
  }

  const sorted = [...modelResults].sort((a, b) => b.overallScore - a.overallScore);
  const winner = sorted[0];
  const runnerUp = sorted[1];
  const diff = winner.overallScore - runnerUp.overallScore;

  const speedDiff = runnerUp.avgTokensPerSec > 0
    ? Math.round(((winner.avgTokensPerSec - runnerUp.avgTokensPerSec) / runnerUp.avgTokensPerSec) * 100)
    : null;

  let verdict = `${winner.name} is your new champion — ${winner.overallScore}% overall`;

  if (diff > 0) {
    verdict += `, beating ${runnerUp.name} (${runnerUp.overallScore}%) by ${diff} points`;
  }

  if (speedDiff !== null && Math.abs(speedDiff) > 5) {
    if (speedDiff > 0) {
      verdict += ` and running ${speedDiff}% faster`;
    } else {
      verdict += ` but running ${Math.abs(speedDiff)}% slower`;
    }
  }

  return verdict + ".";
}
