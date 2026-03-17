import { Prompt, PromptCategory, DimensionScores, GateResult, RubricResult, RubricCheck, GateFlag, CategoryScoreV2 } from "@/types";

// ── Hard Gate Checks (Pass/Fail) ────────────────────────────────────────────

const REFUSAL_PATTERNS = [
  /i('m| am) (not able|unable) to/i,
  /i (cannot|can't) (help|assist|provide)/i,
  /as an ai (language model|assistant)?/i,
  /i (don't|do not) have the ability/i,
  /this (request|question|task) (violates|goes against)/i,
  /i apologize,? but i/i,
  /i'm not able to/i,
  /i can't (fulfill|complete|do)/i,
];

export function runGateChecks(
  response: string,
  timedOut: boolean,
  error: string | null,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _maxTokens: number
): GateResult {
  if (timedOut || error) {
    return { pass: false, flag: error ? "CRASH" : "TRUNCATED" };
  }

  const stripped = response.replace(/\s+/g, " ").trim();

  // Empty gate
  if (stripped.split(/\s+/).length < 10) {
    return { pass: false, flag: "EMPTY" };
  }

  // Refusal gate
  if (REFUSAL_PATTERNS.some((p) => p.test(response))) {
    return { pass: false, flag: "REFUSED" };
  }

  // Severe repetition gate (4-gram, threshold 0.5 over 300 tokens)
  const repScore = measureRepetition(response, 300);
  if (repScore > 0.5) {
    return { pass: false, flag: "REPETITION_LOOP" };
  }

  // Gibberish gate (>40% non-ASCII)
  const nonAscii = (response.match(/[^\x00-\x7F]/g) || []).length;
  if (response.length > 20 && nonAscii / response.length > 0.4) {
    return { pass: false, flag: "GIBBERISH" };
  }

  // NOTE: Truncation removed from hard gate — now a soft penalty in scoreDepth + a warning
  return { pass: true, flag: null };
}

/** Check if a response appears truncated (useful for warnings, not a gate) */
export function isTruncated(response: string, maxTokens: number): boolean {
  const stripped = response.replace(/\s+/g, " ").trim();
  const wordCount = stripped.split(/\s+/).length;
  const approxTokens = Math.round(wordCount * 1.3);
  return approxTokens > maxTokens * 0.9 && !/[.!?:;]\s*$/.test(stripped);
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

// ── Quality Rubric (5 Dimensions, 0–5 Each) ─────────────────────────────────

/**
 * Score a response on 5 dimensions using heuristic signals.
 */
export function scoreDimensions(
  response: string,
  prompt: Prompt,
  category: PromptCategory
): DimensionScores {
  return {
    relevance: scoreRelevance(response, prompt),
    depth: scoreDepth(response, category, prompt.maxTokens),
    coherence: scoreCoherence(response),
    compliance: scoreCompliance(response, prompt),
    language: scoreLanguage(response),
  };
}

function scoreRelevance(response: string, prompt: Prompt): number {
  const promptWords = new Set(
    prompt.text
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  const responseWords = response
    .toLowerCase()
    .split(/\W+/)
    .filter((w) => w.length > 3);

  if (promptWords.size === 0 || responseWords.length === 0) return 2;

  // Keyword overlap (simple TF approximation)
  const matchCount = responseWords.filter((w) => promptWords.has(w)).length;
  const overlapRatio = matchCount / responseWords.length;

  // Format compliance check (did they attempt the right format?)
  const promptText = prompt.text.toLowerCase();
  let formatBonus = 0;
  if (promptText.includes("json") && response.includes("{")) formatBonus = 1;
  else if (promptText.includes("list") && /^\d+\./m.test(response)) formatBonus = 1;
  else if (promptText.includes("code") && response.includes("```")) formatBonus = 1;
  else if (promptText.includes("?")) {
    // If prompt is a question, check for answer structure
    if (response.length > 50) formatBonus = 0.5;
  }

  let score = 0;
  if (overlapRatio > 0.15) score = 4;
  else if (overlapRatio > 0.08) score = 3;
  else if (overlapRatio > 0.03) score = 2;
  else score = 1;

  score = Math.min(5, score + formatBonus);
  return Math.round(score * 10) / 10;
}

function scoreDepth(response: string, category: PromptCategory, maxTokens?: number): number {
  const words = response.split(/\s+/);
  const wordCount = words.length;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 10);

  // Unique concept density
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z]/g, "")).filter((w) => w.length > 3));
  const density = uniqueWords.size / Math.max(1, wordCount);

  // Evidence markers
  const evidencePatterns = /for example|such as|e\.g\.|specifically|in particular|including|\d{4}|\d+%/gi;
  const evidenceCount = (response.match(evidencePatterns) || []).length;

  // For coding: check function/class count
  let codeBonus = 0;
  if (category === "coding") {
    const funcCount = (response.match(/function |def |const |class |=>|public |private /g) || []).length;
    const commentCount = (response.match(/\/\/|#\s|\/\*|\*\//g) || []).length;
    codeBonus = Math.min(1, funcCount * 0.2 + commentCount * 0.15);
  }

  // Diminishing returns on length (per spec: plateau at 500, decrease after 1000)
  let lengthScore = 0;
  if (wordCount >= 150) lengthScore = 2;
  else if (wordCount >= 80) lengthScore = 1.5;
  else if (wordCount >= 50) lengthScore = 1;
  else lengthScore = 0.5;

  // Penalize extreme verbosity
  if (wordCount > 1000) lengthScore = Math.max(0.5, lengthScore - 0.5);

  const densityScore = density > 0.4 ? 1.5 : density > 0.25 ? 1 : 0.5;
  const evidenceScore = Math.min(1, evidenceCount * 0.3);

  let total = Math.min(5, lengthScore + densityScore + evidenceScore + codeBonus);

  // Soft truncation penalty (Bug 1 fix: penalize, don't kill)
  if (maxTokens && isTruncated(response, maxTokens)) {
    total = Math.max(0, total - 1);
  }

  return Math.round(total * 10) / 10;
}

function scoreCoherence(response: string): number {
  const words = response.split(/\s+/);
  const wordCount = words.length;

  // Transition words
  const transitionPatterns = /\b(however|therefore|additionally|furthermore|moreover|consequently|first|second|third|finally|in conclusion|on the other hand|as a result|for instance|in other words|nevertheless)\b/gi;
  const transitions = (response.match(transitionPatterns) || []).length;

  // Paragraph count (wall-of-text penalty for long responses)
  const paragraphs = response.split(/\n\s*\n/).filter((p) => p.trim().length > 20);
  let structureScore = 0;
  if (wordCount > 100) {
    structureScore = paragraphs.length >= 3 ? 1.5 : paragraphs.length >= 2 ? 1 : 0;
  } else {
    structureScore = 1; // Short responses don't need paragraphs
  }

  // Sentence length variance (mix of short and long = better writing)
  const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 5);
  let varianceScore = 0;
  if (sentences.length >= 3) {
    const lengths = sentences.map((s) => s.split(/\s+/).length);
    const avg = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    const variance = lengths.reduce((a, l) => a + Math.pow(l - avg, 2), 0) / lengths.length;
    const stdDev = Math.sqrt(variance);
    varianceScore = stdDev > 5 ? 1 : stdDev > 2 ? 0.5 : 0;
  }

  // For code: check indentation
  const hasIndentation = /^ {2,}|\t/m.test(response);
  const codeStructure = hasIndentation ? 0.5 : 0;

  const transitionScore = Math.min(1.5, transitions * 0.3);
  const total = Math.min(5, transitionScore + structureScore + varianceScore + codeStructure + 1); // +1 baseline
  return Math.round(total * 10) / 10;
}

function scoreCompliance(response: string, prompt: Prompt): number {
  const text = prompt.text.toLowerCase();
  let score = 3; // baseline — if no specific instructions detected, assume moderate compliance
  let checks = 0;
  let passed = 0;

  // JSON check
  if (text.includes("json")) {
    checks++;
    const trimmed = response.trim();
    try {
      JSON.parse(trimmed.replace(/^```json\n?/, "").replace(/\n?```$/, ""));
      passed++;
    } catch {
      // Failed JSON
    }
  }

  // Numbered list check
  if (text.includes("numbered list") || (text.includes("list") && /\d+\s+(item|thing|point|reason)/.test(text))) {
    checks++;
    if (/^\d+\./m.test(response)) passed++;
  }

  // Specific item count check
  const countMatch = text.match(/(?:list|give|provide|write)\s+(\d+)/);
  if (countMatch) {
    checks++;
    const expected = parseInt(countMatch[1]);
    const items = (response.match(/^\d+\./gm) || []).length;
    if (items >= expected - 1 && items <= expected + 1) passed++;
  }

  // Sentence count check
  const sentenceMatch = text.match(/(\d+)\s+sentence/);
  if (sentenceMatch) {
    checks++;
    const expected = parseInt(sentenceMatch[1]);
    const sentences = response.split(/[.!?]+/).filter((s) => s.trim().length > 10);
    if (sentences.length >= expected - 1 && sentences.length <= expected + 1) passed++;
  }

  // Word limit check
  const wordLimitMatch = text.match(/(?:under|less than|fewer than|at most|max(?:imum)?)\s+(\d+)\s+words/);
  if (wordLimitMatch) {
    checks++;
    const limit = parseInt(wordLimitMatch[1]);
    if (response.split(/\s+/).length <= limit) passed++;
  }

  // Code check — if prompt asks for code
  if (text.includes("write a function") || text.includes("write a program") || text.includes("code")) {
    checks++;
    if (response.includes("```") || response.includes("function ") || response.includes("def ")) passed++;
  }

  // Poem check
  if (text.includes("poem") || text.includes("haiku") || text.includes("sonnet")) {
    checks++;
    const lines = response.split("\n").filter((l) => l.trim().length > 0);
    if (lines.length >= 3) passed++; // at least verse-like structure
  }

  // ── Rubric check ──────────────────────────────────────────────────────────
  if (prompt.rubric?.trim()) {
    const rubricChecks = parseRubric(prompt.rubric);
    const rubricResult = evaluateRubric(response, rubricChecks);

    if (rubricResult.score >= 0) {
      if (checks > 0) {
        // Blend: format compliance 30% + rubric compliance 70%
        const formatRatio = passed / checks;
        let formatScore: number;
        if (formatRatio >= 1.0) formatScore = 5;
        else if (formatRatio >= 0.75) formatScore = 4;
        else if (formatRatio >= 0.5) formatScore = 3;
        else if (formatRatio >= 0.25) formatScore = 2;
        else formatScore = 1;
        return Math.round(formatScore * 0.3 + rubricResult.score * 0.7);
      }
      return rubricResult.score;
    }
  }

  if (checks === 0) return 3;
  const ratio = passed / checks;
  if (ratio >= 1.0) score = 5;
  else if (ratio >= 0.75) score = 4;
  else if (ratio >= 0.5) score = 3;
  else if (ratio >= 0.25) score = 2;
  else score = 1;

  return score;
}

function scoreLanguage(response: string): number {
  const words = response.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return 0;

  // Type-token ratio (vocabulary diversity)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z']/g, "")));
  const ttr = uniqueWords.size / Math.max(1, words.length);

  // For long responses, adjust expected TTR (naturally decreases with length)
  const adjustedTTR = words.length > 200 ? ttr * 1.3 : ttr;

  let diversityScore = 0;
  if (adjustedTTR > 0.6) diversityScore = 2;
  else if (adjustedTTR > 0.4) diversityScore = 1.5;
  else if (adjustedTTR > 0.25) diversityScore = 1;
  else diversityScore = 0.5;

  // Spelling heuristic: count obvious non-words (very rough)
  // We check for words that don't follow common English patterns
  const suspiciousWords = words.filter((w) => {
    const clean = w.toLowerCase().replace(/[^a-z]/g, "");
    if (clean.length < 3) return false;
    // Consonant clusters > 4 in a row = suspicious
    return /[bcdfghjklmnpqrstvwxyz]{5,}/i.test(clean);
  });
  const errorDensity = suspiciousWords.length / Math.max(1, words.length);
  const spellingScore = errorDensity < 0.01 ? 1.5 : errorDensity < 0.03 ? 1 : 0.5;

  // Register/formality baseline
  const slang = (response.match(/\b(lol|omg|tbh|imo|ngl|lmao|bruh|gonna|wanna|gotta)\b/gi) || []).length;
  const registerScore = slang === 0 ? 1.5 : slang <= 2 ? 1 : 0.5;

  const total = Math.min(5, diversityScore + spellingScore + registerScore);
  return Math.round(total * 10) / 10;
}

// ── Agentic Category Weights (tool use, memory, adversarial) ─────────────────

export const AGENTIC_CATEGORY_WEIGHTS: Record<string, Record<string, number>> = {
  tool_selection: {
    relevance: 0.5, depth: 0.5, coherence: 0.5, compliance: 2.5, language: 0.5,
    toolAccuracy: 3.0, toolRestraint: 1.5,
  },
  context_memory: {
    relevance: 1.5, depth: 1.0, coherence: 2.0, compliance: 1.0, language: 0.5,
    contextRetention: 3.0,
  },
  robustness: {
    relevance: 0.5, depth: 0.5, coherence: 1.0, compliance: 2.0, language: 0.5,
    defenseQuality: 3.0, helpfulnessUnderPressure: 1.5,
  },
};

// ── Category-Specific Dimension Weights ─────────────────────────────────────

const CATEGORY_WEIGHTS: Record<string, Record<string, number>> = {
  coding: {
    relevance: 1.5,
    depth: 1.0,
    coherence: 1.5,
    compliance: 2.0,
    language: 0.5,
  },
  creative: {
    relevance: 1.0,
    depth: 1.5,
    coherence: 1.0,
    compliance: 0.5,
    language: 2.0,
  },
  reasoning: {
    relevance: 2.0,
    depth: 1.5,
    coherence: 1.5,
    compliance: 1.0,
    language: 0.5,
  },
  instruction: {
    relevance: 1.0,
    depth: 1.0,
    coherence: 1.0,
    compliance: 2.5,
    language: 1.0,
  },
  custom: {
    relevance: 1.0,
    depth: 1.0,
    coherence: 1.0,
    compliance: 1.0,
    language: 1.0,
  },
};

// ── Rubric Parsing & Evaluation ─────────────────────────────────────────────

export function parseRubric(rubricText: string): RubricCheck[] {
  if (!rubricText || rubricText.trim().length === 0) return [];

  const checks: RubricCheck[] = [];
  const lines = rubricText.split(/[.;\n]+/).map(l => l.trim()).filter(l => l.length > 5);

  for (const line of lines) {
    const lower = line.toLowerCase();

    // "Answer must be X" / "Answer should be X" / "Correct answer is X"
    const mustBe = lower.match(
      /(?:answer|result|output|response)\s+(?:must|should|has to|needs to)\s+be\s+["'\u201c]?(.+?)["'\u201d]?\s*$/
    );
    if (mustBe) {
      checks.push({ type: 'must_contain', value: mustBe[1].trim(), label: `Must contain "${mustBe[1].trim()}"` });
      continue;
    }

    // "Correct answer: X" / "Answer is X" / "Answer: X"
    const answerIs = lower.match(
      /(?:correct answer|answer)\s*(?:is|:)\s*["'\u201c]?(.+?)["'\u201d]?\s*$/
    );
    if (answerIs) {
      checks.push({ type: 'must_contain', value: answerIs[1].trim(), label: `Must contain "${answerIs[1].trim()}"` });
      continue;
    }

    // "Should/Must not mention/say/include X"
    const mustNot = lower.match(
      /(?:should|must|do|does)\s+not\s+(?:mention|say|include|contain|use|reference|output)\s+["'\u201c]?(.+?)["'\u201d]?\s*$/
    );
    if (mustNot) {
      checks.push({ type: 'must_not_contain', value: mustNot[1].trim(), label: `Must NOT contain "${mustNot[1].trim()}"` });
      continue;
    }

    // "Must mention/include/contain X"
    const mustContain = lower.match(
      /(?:must|should|needs to)\s+(?:contain|mention|include|reference|use|discuss)\s+["'\u201c]?(.+?)["'\u201d]?\s*$/
    );
    if (mustContain) {
      checks.push({ type: 'must_contain', value: mustContain[1].trim(), label: `Must mention "${mustContain[1].trim()}"` });
      continue;
    }

    // "Exactly N items/points/steps"
    const countMatch = lower.match(
      /(?:exactly|must have|should have|should list|list)\s+(\d+)\s+(?:items?|points?|steps?|reasons?|examples?|sentences?)/
    );
    if (countMatch) {
      checks.push({ type: 'count_items', value: countMatch[1], label: `Must have exactly ${countMatch[1]} items` });
      continue;
    }

    // "Valid JSON" / "Must be JSON"
    if (lower.includes('valid json') || lower.match(/must be\s+json/)) {
      checks.push({ type: 'valid_json', value: '', label: 'Must be valid JSON' });
      continue;
    }

    // Anything else: keep as unstructured (evaluated by judge if available)
    if (line.trim().length > 10) {
      checks.push({ type: 'unstructured', value: line.trim(), label: line.trim() });
    }
  }

  return checks;
}

export function evaluateRubric(
  response: string,
  checks: RubricCheck[]
): { score: number; results: RubricCheck[]; hasUnstructured: boolean } {
  let passed = 0;
  let total = 0;
  let hasUnstructured = false;
  const responseLower = response.toLowerCase();
  const evaluated = checks.map(check => ({ ...check }));

  for (const check of evaluated) {
    switch (check.type) {
      case 'must_contain':
        total++;
        check.passed = responseLower.includes(check.value.toLowerCase());
        if (check.passed) passed++;
        break;

      case 'must_not_contain':
        total++;
        check.passed = !responseLower.includes(check.value.toLowerCase());
        if (check.passed) passed++;
        break;

      case 'count_items': {
        total++;
        const expected = parseInt(check.value);
        const numbered = (response.match(/^\s*\d+[.)]\s/gm) || []).length;
        const bulleted = (response.match(/^\s*[-*\u2022]\s/gm) || []).length;
        const itemCount = Math.max(numbered, bulleted);
        check.passed = itemCount >= expected - 1 && itemCount <= expected + 1;
        if (check.passed) passed++;
        break;
      }

      case 'valid_json':
        total++;
        try {
          const cleaned = response.trim()
            .replace(/^```(?:json)?\n?/, '')
            .replace(/\n?```$/, '');
          JSON.parse(cleaned);
          check.passed = true;
          passed++;
        } catch {
          check.passed = false;
        }
        break;

      case 'unstructured':
        hasUnstructured = true;
        break;
    }
  }

  if (total === 0) {
    return { score: -1, results: evaluated, hasUnstructured };
  }

  const ratio = passed / total;
  let score: number;
  if (ratio >= 1.0) score = 5;
  else if (ratio >= 0.75) score = 4;
  else if (ratio >= 0.5) score = 3;
  else if (ratio >= 0.25) score = 2;
  else score = 1;

  return { score, results: evaluated, hasUnstructured };
}

// ── Compute Rubric Score (Layer 1) ──────────────────────────────────────────

export function computeRubricScore(
  response: string,
  prompt: Prompt,
  timedOut: boolean,
  error: string | null
): RubricResult {
  const gate = runGateChecks(response, timedOut, error, prompt.maxTokens);

  const zeroDimensions: DimensionScores = {
    relevance: 0, depth: 0, coherence: 0, compliance: 0, language: 0,
  };

  if (!gate.pass) {
    return {
      score: 0,
      dimensions: zeroDimensions,
      gate,
      warnings: [],
      breakdown: Object.fromEntries(
        Object.keys(zeroDimensions).map((k) => [k, { raw: 0, weight: 1 }])
      ),
    };
  }

  const category = prompt.category || "custom";
  const dimensions = scoreDimensions(response, prompt, category as PromptCategory);
  const weights = CATEGORY_WEIGHTS[category] || CATEGORY_WEIGHTS.custom;
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);

  const weightedSum =
    dimensions.relevance * weights.relevance +
    dimensions.depth * weights.depth +
    dimensions.coherence * weights.coherence +
    dimensions.compliance * weights.compliance +
    dimensions.language * weights.language;

  const score = Math.round((weightedSum / (5 * totalWeight)) * 100);

  // Build warnings
  const warnings: string[] = [];
  if (isTruncated(response, prompt.maxTokens)) {
    warnings.push("TRUNCATED");
  }

  // Evaluate rubric if present
  let rubricResults: RubricCheck[] | undefined;
  if (prompt.rubric?.trim()) {
    const rubricChecks = parseRubric(prompt.rubric);
    const evaluated = evaluateRubric(response, rubricChecks);
    rubricResults = evaluated.results;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    dimensions,
    gate,
    warnings,
    rubricResults,
    breakdown: {
      relevance: { raw: dimensions.relevance, weight: weights.relevance },
      depth: { raw: dimensions.depth, weight: weights.depth },
      coherence: { raw: dimensions.coherence, weight: weights.coherence },
      compliance: { raw: dimensions.compliance, weight: weights.compliance },
      language: { raw: dimensions.language, weight: weights.language },
    },
  };
}

// ── Composite Score (Layer 1 + Layer 2 + Human) ─────────────────────────────

export function computeCompositeScore(
  rubricScore: number,
  gatePass: boolean,
  gateFlag: GateFlag | null,
  judgeScore?: number,
  humanVote?: "better" | "worse" | "same" | null
): { score: number; layers: string[] } {
  if (!gatePass) {
    return { score: 0, layers: ["auto"] };
  }

  const layers: string[] = ["auto"];
  let score: number;

  const humanNumeric =
    humanVote === "better" ? 85 : humanVote === "same" ? 60 : humanVote === "worse" ? 25 : null;

  if (judgeScore !== undefined && humanNumeric !== null) {
    // All three layers
    score = Math.round(rubricScore * 0.15 + judgeScore * 0.65 + humanNumeric * 0.20);
    layers.push("judge", "human");
  } else if (judgeScore !== undefined) {
    // Auto + Judge
    if (rubricScore < 40) {
      score = Math.round(rubricScore * 0.35 + judgeScore * 0.65);
    } else {
      score = Math.round(rubricScore * 0.15 + judgeScore * 0.85);
    }
    layers.push("judge");
  } else if (humanNumeric !== null) {
    // Auto + Human
    score = Math.round(rubricScore * 0.40 + humanNumeric * 0.60);
    layers.push("human");
  } else {
    // Auto only
    score = rubricScore;
  }

  return { score: Math.max(0, Math.min(100, score)), layers };
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
      // Speed is derived from tokens/sec
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
 * Convert v2 category scores to the legacy Record<string, number> format
 * for backward compatibility with existing UI components.
 * Uses null → 0 for legacy compat (UI components will be updated in Phase 2).
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

// ── Kept from v1 (unchanged) ────────────────────────────────────────────────

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

// ── Legacy compatibility (v1 auto-scorer — kept for old code paths) ─────────

import type { AutoScores } from "@/types";

export function computeAutoScore(
  response: string,
  prompt: Prompt,
  timedOut: boolean,
  error: string | null
): { autoScores: AutoScores; score: number } {
  // Delegate to rubric scorer and convert
  const rubric = computeRubricScore(response, prompt, timedOut, error);

  const autoScores: AutoScores = {
    formatCompliance: rubric.dimensions.compliance >= 3,
    lengthCompliance: rubric.dimensions.depth >= 1,
    codeValidity: prompt.category === "coding" ? rubric.dimensions.compliance >= 2 : null,
    refusalDetected: rubric.gate.flag === "REFUSED",
    repetitionScore: rubric.gate.flag === "REPETITION_LOOP" ? 1 : 0,
    languageMatch: rubric.dimensions.language >= 2,
  };

  return { autoScores, score: rubric.score };
}
