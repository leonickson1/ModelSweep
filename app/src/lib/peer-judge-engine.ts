/**
 * Round-Robin Peer Judging Engine
 *
 * When 3+ models are tested, they judge each other's responses instead of
 * requiring an external cloud judge. Each pair is judged by all other models.
 */

import { OllamaClient } from "./ollama";

// ── Types ──────────────────────────────────────────────────────────────────

export interface PeerVote {
  judge: string;
  winner: "A" | "B";
  reason?: string;
}

export interface PairingResult {
  modelA: string;
  modelB: string;
  winner: string | "tie";
  votes: PeerVote[];
  aLabel: string;
  bLabel: string;
}

export interface PeerJudgeResult {
  promptId: string;
  pairings: PairingResult[];
}

// ── Pairing Generation ─────────────────────────────────────────────────────

export function generatePairs(models: string[]): Array<[string, string]> {
  const pairs: Array<[string, string]> = [];
  for (let i = 0; i < models.length; i++) {
    for (let j = i + 1; j < models.length; j++) {
      pairs.push([models[i], models[j]]);
    }
  }
  return pairs;
}

// ── Judge Prompt ───────────────────────────────────────────────────────────

function buildPeerJudgePrompt(
  promptText: string,
  responseA: string,
  responseB: string
): string {
  // Detect if this is a coding comparison (test results will be prepended)
  const isCoding = responseA.startsWith("[TEST RESULTS:") || responseB.startsWith("[TEST RESULTS:");

  const instructions = isCoding
    ? `You are reviewing two code submissions. Test results are shown at the top of each response.
IMPORTANT: If one response passes more tests than the other, that one MUST win. If both pass the same number of tests, judge on code readability, efficiency, and best practices.`
    : `You are comparing two responses. Judge on accuracy, completeness, clarity, and how well each follows the instructions.`;

  return `${instructions}

TASK: ${promptText}

RESPONSE A:
"""
${responseA.slice(0, 10000)}
"""

RESPONSE B:
"""
${responseB.slice(0, 10000)}
"""

You MUST pick one winner. Reply in this exact format:
WINNER: A or B
REASON: one sentence explaining why`;
}

// ── Single Judge Call ──────────────────────────────────────────────────────

/**
 * A callable the caller supplies for cloud judges. Given a full prompt, returns
 * the judge's short reply (usually "A" | "B" | "TIE"). The caller is expected
 * to bind this to a specific cloud provider.
 */
export type CloudPeerJudgeFn = (judgeId: string, prompt: string) => Promise<string>;

async function askPeerJudge(
  client: OllamaClient,
  judgeModel: string,
  promptText: string,
  responseA: string,
  responseB: string,
  cloudInfer?: CloudPeerJudgeFn
): Promise<{ winner: "A" | "B"; reason: string }> {
  const prompt = buildPeerJudgePrompt(promptText, responseA, responseB);

  let fullResponse = "";

  if (judgeModel.startsWith("cloud:") && cloudInfer) {
    fullResponse = await cloudInfer(judgeModel, prompt);
  } else {
    for await (const chunk of client.chat({
      model: judgeModel,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      maxTokens: 80,
    })) {
      if (chunk.type === "token") {
        fullResponse += chunk.text;
      }
    }
  }

  const cleaned = fullResponse.trim();

  // Parse "WINNER: A\nREASON: ..." format
  const winnerMatch = cleaned.match(/WINNER:\s*(A|B|TIE)/i);
  const reasonMatch = cleaned.match(/REASON:\s*(.+)/i);

  let winner: "A" | "B";
  if (winnerMatch) {
    const w = winnerMatch[1].toUpperCase();
    // Force TIE → A (no ties allowed — always pick a side)
    winner = w === "B" ? "B" : "A";
  } else {
    const upper = cleaned.toUpperCase();
    winner = upper.startsWith("B") ? "B" : "A";
  }

  const reason = reasonMatch?.[1]?.trim() || "";

  return { winner, reason };
}

// ── Run Round-Robin Peer Judging ───────────────────────────────────────────

export interface PeerJudgingOptions {
  /**
   * Additional judge identifiers beyond the players (e.g. `cloud:<id>` entries)
   * that will vote on each pair but are not themselves judged. Useful when the
   * user wants the tie-breaking power of a cloud model without pitting it
   * against the local models under test.
   */
  extraJudges?: string[];
  /** Resolver for any judge name starting with `cloud:`. Required if extraJudges contains cloud entries. */
  cloudInfer?: CloudPeerJudgeFn;
  onPairComplete?: (pair: PairingResult) => void;
}

export async function runPeerJudging(
  client: OllamaClient,
  models: string[],
  promptText: string,
  responses: Map<string, string>,
  onPairCompleteOrOpts?: ((pair: PairingResult) => void) | PeerJudgingOptions
): Promise<PairingResult[]> {
  // Back-compat: the 5th arg was a bare callback; support both shapes.
  const opts: PeerJudgingOptions =
    typeof onPairCompleteOrOpts === "function"
      ? { onPairComplete: onPairCompleteOrOpts }
      : onPairCompleteOrOpts ?? {};

  const extraJudges = opts.extraJudges ?? [];
  const totalJudgePool = models.length + extraJudges.length;
  if (totalJudgePool < 3) {
    throw new Error("Peer judging requires at least 3 judges (players + extra judges combined)");
  }

  const pairs = generatePairs(models);
  const results: PairingResult[] = [];

  for (const [modelA, modelB] of pairs) {
    const responseA = responses.get(modelA);
    const responseB = responses.get(modelB);

    if (!responseA || !responseB) continue;

    // Randomize A/B labels to prevent positional bias
    const swapped = Math.random() > 0.5;
    const displayA = swapped ? responseB : responseA;
    const displayB = swapped ? responseA : responseB;
    const labelA = swapped ? modelB : modelA;
    const labelB = swapped ? modelA : modelB;

    // All other players + any extra judges vote on this pair. Extras never
    // appear as players so they can't judge themselves.
    const judges = [
      ...models.filter(m => m !== modelA && m !== modelB),
      ...extraJudges,
    ];
    const votes: PeerVote[] = [];

    for (const judge of judges) {
      try {
        const { winner: rawVote, reason } = await askPeerJudge(client, judge, promptText, displayA, displayB, opts.cloudInfer);
        // Map back through the swap
        const actualVote: "A" | "B" = swapped
          ? (rawVote === "A" ? "B" : "A")
          : rawVote;
        votes.push({ judge, winner: actualVote, reason });
      } catch {
        // Skip this judge if it fails — give to A by default
        votes.push({ judge, winner: "A" });
      }
    }

    // Determine winner from votes
    const aWins = votes.filter(v => v.winner === "A").length;
    const bWins = votes.filter(v => v.winner === "B").length;
    // No ties — if equal votes, A wins (first model in pair)
    const winner = aWins >= bWins ? modelA : modelB;

    const result: PairingResult = {
      modelA,
      modelB,
      winner,
      votes,
      aLabel: labelA,
      bLabel: labelB,
    };

    results.push(result);
    opts.onPairComplete?.(result);
  }

  return results;
}

// ── Convert Peer Results to Win/Loss for Elo ───────────────────────────────

export function peerResultsToEloMatches(
  pairings: PairingResult[]
): Array<{ winner: string; loser: string; isTie: boolean }> {
  const matches: Array<{ winner: string; loser: string; isTie: boolean }> = [];

  for (const pair of pairings) {
    if (pair.winner === "tie") {
      matches.push({ winner: pair.modelA, loser: pair.modelB, isTie: true });
    } else {
      const loser = pair.winner === pair.modelA ? pair.modelB : pair.modelA;
      matches.push({ winner: pair.winner, loser, isTie: false });
    }
  }

  return matches;
}

// ── Aggregate Peer Stats ───────────────────────────────────────────────────

export function aggregatePeerStats(
  allPairings: PairingResult[],
  models: string[]
): Record<string, { wins: number; losses: number; ties: number; winRate: number }> {
  const stats: Record<string, { wins: number; losses: number; ties: number; winRate: number }> = {};

  for (const model of models) {
    stats[model] = { wins: 0, losses: 0, ties: 0, winRate: 0 };
  }

  for (const pair of allPairings) {
    if (pair.winner === "tie") {
      stats[pair.modelA].ties++;
      stats[pair.modelB].ties++;
    } else {
      stats[pair.winner].wins++;
      const loser = pair.winner === pair.modelA ? pair.modelB : pair.modelA;
      stats[loser].losses++;
    }
  }

  for (const model of models) {
    const s = stats[model];
    const total = s.wins + s.losses + s.ties;
    s.winRate = total > 0 ? Math.round(((s.wins + s.ties * 0.5) / total) * 100) : 0;
  }

  return stats;
}
