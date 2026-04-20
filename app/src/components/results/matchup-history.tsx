"use client";

import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { getModelColor } from "@/lib/model-colors";
import { ChevronDown, Users } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface EloMatch {
  prompt_id: string;
  winner: string;
  loser: string;
  is_tie: number;
}

interface PeerVote {
  prompt_id: string;
  model_a: string;
  model_b: string;
  judge: string;
  vote: string;
  reason?: string | null;
}

interface JudgeEval {
  prompt_result_id: string;
  judge_model: string;
  model_name: string;
  prompt_id: string;
  accuracy: number;
  helpfulness: number;
  clarity: number;
  instruction_following: number;
  strengths: string | null;
  weaknesses: string | null;
  is_winner: number;
  winner_reasoning: string | null;
  judge_score: number;
}

export interface MatchupHistoryProps {
  eloMatches: EloMatch[];
  peerVotes: PeerVote[];
  judgeEvaluations: JudgeEval[];
  models: string[];
  scenarioLabels?: Record<string, string>;
}

export function MatchupHistory({ eloMatches, peerVotes, judgeEvaluations, models, scenarioLabels = {} }: MatchupHistoryProps) {
  const [expandedPair, setExpandedPair] = useState<string | null>(null);
  const [expandedQuestion, setExpandedQuestion] = useState<string | null>(null);

  // Build head-to-head matrix (aggregate)
  const matrix = useMemo(() => {
    const data: Record<string, Record<string, { wins: number; losses: number; ties: number }>> = {};
    for (const a of models) {
      data[a] = {};
      for (const b of models) {
        if (a !== b) data[a][b] = { wins: 0, losses: 0, ties: 0 };
      }
    }

    for (const match of eloMatches) {
      if (!data[match.winner]?.[match.loser]) continue;
      if (match.is_tie) {
        data[match.winner][match.loser].ties++;
        data[match.loser][match.winner].ties++;
      } else {
        data[match.winner][match.loser].wins++;
        data[match.loser][match.winner].losses++;
      }
    }

    return data;
  }, [eloMatches, models]);

  // Group peer votes by prompt_id, then by model pair
  const votesByQuestion = useMemo(() => {
    const map: Record<string, PeerVote[]> = {};
    for (const v of peerVotes) {
      if (!map[v.prompt_id]) map[v.prompt_id] = [];
      map[v.prompt_id].push(v);
    }
    return map;
  }, [peerVotes]);

  // Group elo matches by prompt_id
  const matchesByQuestion = useMemo(() => {
    const map: Record<string, EloMatch[]> = {};
    for (const m of eloMatches) {
      if (!map[m.prompt_id]) map[m.prompt_id] = [];
      map[m.prompt_id].push(m);
    }
    return map;
  }, [eloMatches]);

  // All unique prompt IDs that have matchups
  const questionIds = useMemo(() => {
    return Array.from(new Set(eloMatches.map(m => m.prompt_id)));
  }, [eloMatches]);

  // Group peer votes by pair key (for expanded pair view)
  const votesByPair = useMemo(() => {
    const map: Record<string, PeerVote[]> = {};
    for (const v of peerVotes) {
      const key = [v.model_a, v.model_b].sort().join(" vs ");
      if (!map[key]) map[key] = [];
      map[key].push(v);
    }
    return map;
  }, [peerVotes]);

  if (models.length < 2) return null;

  return (
    <div className="space-y-8">
      {/* Head-to-Head Matrix (aggregate) */}
      <div className="apple-glass-panel rounded-[28px] overflow-hidden">
        <div className="p-6 border-b border-white/5">
          <h3 className="text-[20px] font-semibold text-white/90 tracking-tight">Head-to-Head Record</h3>
          <p className="text-[13px] text-zinc-500 mt-1">
            Aggregate across {questionIds.length} scenario{questionIds.length !== 1 ? "s" : ""}. Click a cell to see individual votes.
          </p>
        </div>
        <div className="p-4 overflow-x-auto">
          <table className="w-full min-w-max">
            <thead>
              <tr>
                <th className="text-left p-2 text-zinc-600 text-[11px] uppercase tracking-wider font-bold">vs</th>
                {models.map((m) => (
                  <th key={m} className="p-2 text-center">
                    <div className="flex flex-col items-center gap-1">
                      <span className="w-3 h-3 rounded-full" style={{ background: getModelColor(m).hex }} />
                      <span className="text-[11px] text-zinc-400 font-medium max-w-[80px] truncate">{m.split(":")[0]}</span>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((rowModel) => (
                <tr key={rowModel} className="border-t border-white/[0.03]">
                  <td className="p-2">
                    <div className="flex items-center gap-2">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: getModelColor(rowModel).hex }} />
                      <span className="text-[13px] text-zinc-300 font-medium max-w-[100px] truncate">{rowModel.split(":")[0]}</span>
                    </div>
                  </td>
                  {models.map((colModel) => {
                    if (rowModel === colModel) {
                      return <td key={colModel} className="p-2 text-center text-zinc-800 text-[12px]">—</td>;
                    }
                    const record = matrix[rowModel]?.[colModel] || { wins: 0, losses: 0, ties: 0 };
                    const total = record.wins + record.losses + record.ties;
                    const winRate = total > 0 ? record.wins / total : 0;
                    const pairKey = [rowModel, colModel].sort().join(" vs ");

                    return (
                      <td key={colModel} className="p-2 text-center">
                        <button
                          onClick={() => setExpandedPair(expandedPair === pairKey ? null : pairKey)}
                          className={cn(
                            "px-3 py-1.5 rounded-lg text-[12px] font-mono font-bold transition-colors",
                            total === 0 ? "text-zinc-700 bg-white/[0.02]" :
                            winRate > 0.6 ? "text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20" :
                            winRate < 0.4 ? "text-red-300 bg-red-500/10 hover:bg-red-500/20" :
                            "text-amber-300 bg-amber-500/10 hover:bg-amber-500/20"
                          )}
                          title={`${rowModel} vs ${colModel}: ${record.wins}W ${record.losses}L ${record.ties}T`}
                        >
                          {total === 0 ? "—" : `${record.wins}W ${record.losses}L`}
                          {record.ties > 0 && ` ${record.ties}T`}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Expanded pair — show per-question breakdown */}
        <AnimatePresence>
          {expandedPair && votesByPair[expandedPair] && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="border-t border-white/5 p-4 bg-white/[0.01]">
                <div className="flex items-center gap-2 mb-4">
                  <Users size={14} className="text-zinc-500" />
                  <span className="text-[13px] font-medium text-zinc-400">
                    Per-question votes: {expandedPair}
                  </span>
                </div>

                {/* Group votes by question */}
                {(() => {
                  const pairVotes = votesByPair[expandedPair];
                  const byQ: Record<string, PeerVote[]> = {};
                  for (const v of pairVotes) {
                    if (!byQ[v.prompt_id]) byQ[v.prompt_id] = [];
                    byQ[v.prompt_id].push(v);
                  }
                  return Object.entries(byQ).map(([qId, votes]) => {
                    // Determine winner for this question
                    const tally: Record<string, number> = {};
                    for (const v of votes) {
                      const winner = v.vote === "A" ? v.model_a : v.model_b;
                      tally[winner] = (tally[winner] || 0) + 1;
                    }
                    const sorted = Object.entries(tally).sort((a, b) => b[1] - a[1]);
                    const qWinner = sorted[0]?.[0] || models[0] || "";

                    return (
                      <div key={qId} className="mb-3 last:mb-0">
                        <div className="flex items-center gap-3 mb-1.5">
                          <span className="text-[12px] text-zinc-300 font-medium truncate max-w-[300px]">
                            {scenarioLabels[qId] || qId.slice(0, 12) + "..."}
                          </span>
                          <span className="text-[11px] font-mono ml-auto">
                            <span className="text-emerald-400">{qWinner.split(":")[0]} won</span>
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {votes.map((v, i) => {
                            const winner = v.vote === "A" ? v.model_a.split(":")[0] : v.model_b.split(":")[0];
                            return (
                              <span key={i} className="text-[11px] bg-white/[0.03] border border-white/[0.06] rounded-md px-2 py-1 text-zinc-400">
                                {v.judge.split(":")[0]} → <span className="font-medium text-emerald-400">{winner}</span>
                                {v.reason && <span className="text-zinc-600 ml-1 italic">— {v.reason}</span>}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Per-Question Results — who won each scenario */}
      {questionIds.length >= 1 && (
        <div className="apple-glass-panel rounded-[28px] overflow-hidden">
          <div className="p-6 border-b border-white/5">
            <h3 className="text-[20px] font-semibold text-white/90 tracking-tight">Per-Scenario Peer Results</h3>
          </div>
          <div className="flex flex-col">
            {questionIds.map((qId) => {
              const matches = matchesByQuestion[qId] || [];
              const votes = votesByQuestion[qId] || [];
              const isExpanded = expandedQuestion === qId;

              // Compute per-model win count for this question
              const modelWins: Record<string, number> = {};
              for (const m of matches) {
                if (m.is_tie) continue;
                modelWins[m.winner] = (modelWins[m.winner] || 0) + 1;
              }
              const sortedWins = Object.entries(modelWins).sort((a, b) => b[1] - a[1]);
              const questionWinner = sortedWins[0]?.[0] || null;

              return (
                <div key={qId} className="apple-list-row">
                  <button
                    onClick={() => setExpandedQuestion(isExpanded ? null : qId)}
                    className="w-full flex items-center gap-4 p-4 px-6 hover:bg-white/[0.04] transition-colors text-left"
                  >
                    <span className="text-[15px] text-zinc-300 font-medium tracking-tight flex-1 truncate">
                      {scenarioLabels[qId] || qId.slice(0, 20)}
                    </span>

                    {/* Model winner dots */}
                    <div className="flex items-center gap-2">
                      {models.map((m) => {
                        const wins = modelWins[m] || 0;
                        const isWinner = m === questionWinner && wins > 0;
                        return (
                          <div key={m} className="flex flex-col items-center gap-0.5">
                            <span className="w-2 h-2 rounded-full" style={{ background: getModelColor(m).hex, opacity: isWinner ? 1 : 0.3 }} />
                            {wins > 0 && (
                              <span className={cn("text-[10px] font-mono", isWinner ? "text-emerald-400" : "text-zinc-600")}>
                                {wins}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {questionWinner && (
                      <span className="text-[12px] text-emerald-400 font-medium hidden sm:block">
                        {questionWinner.split(":")[0]}
                      </span>
                    )}

                    <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", isExpanded && "rotate-180")} />
                  </button>

                  <AnimatePresence>
                    {isExpanded && votes.length > 0 && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="px-6 pb-4 pt-1">
                          {/* Group by pair */}
                          {(() => {
                            const byPair: Record<string, PeerVote[]> = {};
                            for (const v of votes) {
                              const pk = `${v.model_a} vs ${v.model_b}`;
                              if (!byPair[pk]) byPair[pk] = [];
                              byPair[pk].push(v);
                            }
                            return Object.entries(byPair).map(([pk, pvs]) => (
                              <div key={pk} className="mb-2 last:mb-0">
                                <div className="text-[11px] text-zinc-500 mb-1">{pk.split(" vs ").map(s => s.split(":")[0]).join(" vs ")}</div>
                                <div className="flex flex-wrap gap-1.5">
                                  {pvs.map((v, i) => {
                                    const winner = v.vote === "A" ? v.model_a.split(":")[0] : v.model_b.split(":")[0];
                                    return (
                                      <div key={i} className="text-[11px] bg-white/[0.03] border border-white/[0.06] rounded-md px-3 py-2 text-zinc-400">
                                        <div>{v.judge.split(":")[0]} → <span className="font-medium text-emerald-400">{winner}</span></div>
                                        {v.reason && <div className="text-zinc-600 italic mt-1 text-[10px] leading-relaxed">{v.reason}</div>}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ));
                          })()}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
