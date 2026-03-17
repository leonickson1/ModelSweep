// ── Elo Rating System ─────────────────────────────────────────────────────────
// Persistent Elo ratings for models across test runs.
// Each prompt where ≥2 models are judged produces pairwise matches.

export const INITIAL_ELO = 1500;
export const K_FACTOR = 32;

export interface EloState {
    ratings: Record<string, number>;       // modelName → Elo
    matchCounts: Record<string, number>;   // modelName → total matches
}

export interface EloMatchInput {
    winner: string;
    loser: string;
    isTie: boolean;
    winnerScore: number | null;
    loserScore: number | null;
}

/**
 * Update Elo ratings for a single match.
 * Mutates and returns the state.
 */
export function updateElo(state: EloState, match: EloMatchInput): EloState {
    const ratingA = state.ratings[match.winner] ?? INITIAL_ELO;
    const ratingB = state.ratings[match.loser] ?? INITIAL_ELO;

    const expectedA = 1 / (1 + Math.pow(10, (ratingB - ratingA) / 400));
    const expectedB = 1 - expectedA;

    if (match.isTie) {
        state.ratings[match.winner] = Math.round((ratingA + K_FACTOR * (0.5 - expectedA)) * 10) / 10;
        state.ratings[match.loser] = Math.round((ratingB + K_FACTOR * (0.5 - expectedB)) * 10) / 10;
    } else {
        state.ratings[match.winner] = Math.round((ratingA + K_FACTOR * (1.0 - expectedA)) * 10) / 10;
        state.ratings[match.loser] = Math.round((ratingB + K_FACTOR * (0.0 - expectedB)) * 10) / 10;
    }

    state.matchCounts[match.winner] = (state.matchCounts[match.winner] ?? 0) + 1;
    state.matchCounts[match.loser] = (state.matchCounts[match.loser] ?? 0) + 1;

    return state;
}

/**
 * Compute confidence (0–1) based on match count.
 * 1 match = 0.1, 10 matches = 0.32, 25 = 0.5, 100 = 1.0
 */
export function computeConfidence(matchCount: number): number {
    return Math.min(1.0, Math.sqrt(matchCount) / 10);
}

/**
 * Get ± uncertainty range around an Elo rating.
 */
export function getEloRange(rating: number, confidence: number): { low: number; high: number } {
    const uncertainty = Math.round(200 * (1 - confidence));
    return { low: rating - uncertainty, high: rating + uncertainty };
}

/**
 * Derive pairwise match results from judge scores for a single prompt.
 * For N models → C(N,2) matches.
 * Scores within tieThreshold are considered ties.
 */
export function derivePairwiseResults(
    judgeScores: Record<string, number>,
    tieThreshold = 3
): EloMatchInput[] {
    const models = Object.entries(judgeScores);
    const matches: EloMatchInput[] = [];

    for (let i = 0; i < models.length; i++) {
        for (let j = i + 1; j < models.length; j++) {
            const [nameA, scoreA] = models[i];
            const [nameB, scoreB] = models[j];
            const diff = scoreA - scoreB;

            if (Math.abs(diff) <= tieThreshold) {
                matches.push({
                    winner: nameA,
                    loser: nameB,
                    isTie: true,
                    winnerScore: scoreA,
                    loserScore: scoreB,
                });
            } else if (diff > 0) {
                matches.push({
                    winner: nameA,
                    loser: nameB,
                    isTie: false,
                    winnerScore: scoreA,
                    loserScore: scoreB,
                });
            } else {
                matches.push({
                    winner: nameB,
                    loser: nameA,
                    isTie: false,
                    winnerScore: scoreB,
                    loserScore: scoreA,
                });
            }
        }
    }
    return matches;
}

/**
 * Load Elo state from DB rows.
 */
export function loadEloState(
    rows: Array<{ model_name: string; rating: number; match_count: number }>
): EloState {
    const state: EloState = { ratings: {}, matchCounts: {} };
    for (const row of rows) {
        state.ratings[row.model_name] = row.rating;
        state.matchCounts[row.model_name] = row.match_count;
    }
    return state;
}
