"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronDown,
  ThumbsUp, ThumbsDown,
  MoreHorizontal, Trash2, Download, Share2,
  Info,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { SkeletonList } from "@/components/ui/skeleton";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ModelRadarChart } from "@/components/charts/radar-chart";
import { CategoryBarChart } from "@/components/charts/bar-chart";
import { ScoreDistribution } from "@/components/charts/score-distribution";
import { getModelColor } from "@/lib/model-colors";
import { generateVerdict } from "@/lib/scoring";
import { formatDuration, formatRelativeTime, cn } from "@/lib/utils";

const ToolResultsView = dynamic(
  () => import("@/components/results/tool-results").then((m) => ({ default: m.ToolResults })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-white/5 rounded-2xl" /> }
);
const ConversationResultsView = dynamic(
  () => import("@/components/results/conversation-results").then((m) => ({ default: m.ConversationResults })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-white/5 rounded-2xl" /> }
);
const AdversarialResultsView = dynamic(
  () => import("@/components/results/adversarial-results").then((m) => ({ default: m.AdversarialResults })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-white/5 rounded-2xl" /> }
);
const CodingResultsView = dynamic(
  () => import("@/components/results/coding-results").then((m) => ({ default: m.CodingResults })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-white/5 rounded-2xl" /> }
);
const MatchupHistoryView = dynamic(
  () => import("@/components/results/matchup-history").then((m) => ({ default: m.MatchupHistory })),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-white/5 rounded-2xl" /> }
);
// Pipeline replay removed in Linear redesign

interface ModelResult {
  id: string;
  model_name: string;
  family: string;
  parameter_size: string;
  quantization: string;
  overall_score: number;
  categoryScores: Record<string, number>;
  avg_tokens_per_sec: number;
  avg_ttft: number;
  total_duration: number;
  skipped: number;
  skip_reason: string | null;
  promptResults: PromptResult[];
  rubric_score?: number;
  judge_composite?: number;
  elo_rating_snapshot?: number;
  elo_confidence?: number;
  scoring_version?: number;
}

interface JudgeScores {
  score: number;
  won: boolean;
  reasoning?: string;
  accuracy?: number;
  helpfulness?: number;
  clarity?: number;
  instructionFollowing?: number;
}

interface PromptResult {
  id: string;
  prompt_id: string;
  model_name: string;
  response: string;
  tokens_per_sec: number;
  ttft: number;
  total_tokens: number;
  duration: number;
  auto_scores: Record<string, unknown> | string;
  /** Parsed version of auto_scores (from getRunById) */
  autoScores?: Record<string, unknown>;
  judgeScores: JudgeScores | null;
  judge_scores: JudgeScores | null;
  manual_vote: string | null;
  timed_out: number;
  rubric_score?: number;
}

interface TestRun {
  id: string;
  suite_id: string;
  suite_name: string;
  suite_type?: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  hardware: Record<string, string>;
  judge_enabled: number;
  judge_model: string | null;
  models: ModelResult[];
  scoring_version?: number;
}

interface Suite {
  prompts: Array<{ id: string; text: string; category: string; difficulty?: string; rubric?: string }>;
  codingScenarios?: Array<{ id: string; name: string; language?: string; difficulty?: string }>;
}

// ─── Helper Components for Prompt Dropdown ───────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
      {label}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CheckLine({ passed, label, isWarning }: { passed: boolean; label: string; isWarning?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 text-xs">
      <span className={passed ? (isWarning ? 'text-amber-500' : 'text-emerald-500') : 'text-red-400'}>
        {passed ? (isWarning ? '⚠' : '✓') : '✗'}
      </span>
      <span className={passed ? 'text-zinc-400' : 'text-red-400/80'}>{label}</span>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function CollapsibleSection({ label, defaultOpen, children }: {
  label: string;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} className="flex items-center gap-1.5 group">
        <SectionLabel label={label} />
        <ChevronDown size={10} className={cn(
          "text-zinc-700 transition-transform",
          open && "rotate-180"
        )} />
      </button>
      {open && <div className="mt-1.5 pl-1">{children}</div>}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function ScoreInfoTooltip({ gatePass, gateFlag, hasJudge, warnings }: {
  gatePass: boolean;
  gateFlag: string | null;
  hasJudge: boolean;
  warnings?: string[];
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <button
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
        className="text-zinc-700 hover:text-zinc-400 transition-colors"
      >
        <Info size={12} />
      </button>
      {show && (
        <div className="absolute left-0 top-6 z-50 w-64 p-3 bg-zinc-900 border border-white/10 rounded-lg shadow-xl text-xs text-zinc-400 leading-relaxed">
          {!gatePass ? (
            <p>This response was flagged as <span className="text-red-400 font-mono">{gateFlag}</span> by the auto-checker. Score is 0.</p>
          ) : hasJudge ? (
            <p>Score is the judge model&apos;s evaluation on accuracy, helpfulness, clarity, and instruction following. Gate checks verified the response is valid.</p>
          ) : (
            <p>All gate checks passed (not empty, refused, repetitive, or gibberish). Score is 100% by default. Enable a judge model for real quality scoring.</p>
          )}
          {warnings?.includes('TRUNCATED') && (
            <p className="mt-1.5 text-amber-500/80">⚠ Response was truncated near the token limit. Score may be lower than the response quality deserves.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Overflow Menu ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-unused-vars
function OverflowMenu({ runId, onDelete }: { runId: string; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/results/${runId}`, { method: "DELETE" });
      onDelete();
    } finally {
      setDeleting(false);
    }
  };

  const exportAs = (format: string) => {
    window.location.href = `/api/results/${runId}/export?format=${format}`;
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative">
      <button
        onClick={() => { setOpen((o) => !o); setConfirming(false); }}
        className="p-2 rounded-xl text-zinc-500 hover:text-zinc-300 hover:bg-white/5 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-10 z-50 min-w-[200px] bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            {!confirming ? (
              <>
                <Link
                  href={`/results/${runId}/share`}
                  className="flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <Share2 size={13} />
                  Share to X/Twitter...
                </Link>
                <button
                  onClick={() => exportAs("json")}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 transition-colors text-left"
                >
                  <Download size={13} />
                  Export Results as JSON
                </button>
                <button
                  onClick={() => exportAs("csv")}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 transition-colors text-left"
                >
                  <Download size={13} />
                  Export Results as CSV
                </button>
                <button
                  onClick={() => window.location.href = `/api/results/${runId}/pdf`}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-zinc-300 hover:bg-white/5 transition-colors text-left"
                >
                  <Download size={13} />
                  Download PDF Report
                </button>
                <div className="h-px bg-white/[0.06] my-1" />
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                >
                  <Trash2 size={13} />
                  Delete This Run
                </button>
              </>
            ) : (
              <div className="p-4">
                <p className="text-zinc-200 text-sm font-medium mb-1">Delete this test run?</p>
                <p className="text-zinc-500 text-xs mb-4 leading-relaxed">
                  This removes all results, scores, and votes for this run. Shared links will stop working.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 py-2 px-3 rounded-lg text-xs text-zinc-400 border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-2 px-3 rounded-lg text-xs text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete Permanently"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ResultDetailPage() {
  const { id } = useParams<{ id: string }>();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState<TestRun | null>(null);
  const [suite, setSuite] = useState<Suite | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartTab, setChartTab] = useState<"radar" | "bars" | "distribution">("radar");
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [eloRatings, setEloRatings] = useState<Record<string, { rating: number; confidence: number }>>({});
  const [suiteType, setSuiteType] = useState<string>("standard");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [matchupData, setMatchupData] = useState<{ eloMatches: any[]; peerVotes: any[]; judgeEvaluations: any[] }>({ eloMatches: [], peerVotes: [], judgeEvaluations: [] });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [toolResults, setToolResults] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [conversationResults, setConversationResults] = useState<any[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [adversarialResults, setAdversarialResults] = useState<any[]>([]);

  useEffect(() => {
    fetch(`/api/results/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.run) {
          setRun(d.run);
          const st = d.run.suite_type || "standard";
          setSuiteType(st);
          // chartMode removed in redesign
          fetch(`/api/suites/${d.run.suite_id}`)
            .then((r) => r.json())
            .then((sd) => setSuite(sd.suite))
            .catch(() => { });
          // Fetch mode-specific agentic results
          if (st === "tool_calling") {
            fetch(`/api/results/${id}/tool-calls`)
              .then((r) => r.ok ? r.json() : null)
              .then((data) => {
                if (data?.results) {
                  // Transform flat rows into grouped-by-model structure
                  const byModel = new Map<string, { scenarios: typeof data.results; }>();
                  for (const row of data.results) {
                    const m = row.model_name ?? row.model ?? "unknown";
                    if (!byModel.has(m)) byModel.set(m, { scenarios: [] });
                    byModel.get(m)!.scenarios.push(row);
                  }
                  const grouped = Array.from(byModel.entries()).map(([model, { scenarios }]) => {
                    const scores = scenarios.map((s: Record<string, unknown>) => {
                      const sc = (s.score ?? {}) as Record<string, unknown>;
                      return {
                        scenarioId: s.scenario_id as string,
                        scenarioName: (s.scenario_name ?? `Scenario`) as string,
                        category: String(sc.category ?? "tool_selection"),
                        passed: (s.overall_score as number ?? 0) >= 60,
                        toolSelectionScore: Number(sc.toolSelection ?? 0),
                        paramAccuracyScore: Number(sc.paramAccuracy ?? 0),
                        restraintScore: Number(sc.toolRestraint ?? 0),
                        overallScore: Number(s.overall_score ?? 0),
                        hallucinatedTool: !!sc.hallucinatedTool,
                        calledWhenShouldNot: !!sc.calledWhenShouldNot,
                        missingRequiredParam: !!sc.missingRequiredParam,
                        jsonMalformed: !!sc.jsonMalformed,
                        expectedToolCalls: (s.expected_tool_calls ?? []) as { toolName: string; expectedParams?: Record<string, { matchType: string; value?: string; expectedType?: string }> }[],
                        shouldCallTool: s.should_call_tool !== false,
                        actualToolCalls: (s.actual_tool_calls ?? []) as { functionName: string; arguments: Record<string, unknown>; jsonMalformed?: boolean }[],
                        textResponse: (s.text_response ?? "") as string,
                      };
                    });
                    const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
                    return {
                      model,
                      selectPct: avg(scores.map((s: { toolSelectionScore: number }) => (s.toolSelectionScore / 5) * 100)),
                      paramsPct: avg(scores.map((s: { paramAccuracyScore: number }) => (s.paramAccuracyScore / 5) * 100)),
                      restraintPct: avg(scores.map((s: { restraintScore: number }) => (s.restraintScore / 5) * 100)),
                      multiPct: avg(scores.map((s: { overallScore: number }) => s.overallScore)),
                      overallPct: avg(scores.map((s: { overallScore: number }) => s.overallScore)),
                      scenarios: scores,
                      failurePatterns: [],
                    };
                  });
                  setToolResults(grouped);
                }
              })
              .catch(() => { });
          } else if (st === "conversation") {
            fetch(`/api/results/${id}/conversations`)
              .then((r) => r.ok ? r.json() : null)
              .then((data) => {
                if (!data?.results) return;
                // Group raw rows by model and transform into ConversationResultData[]
                const byModel = new Map<string, { scenarios: Record<string, unknown>[] }>();
                for (const row of data.results) {
                  const m = row.model_name ?? "unknown";
                  if (!byModel.has(m)) byModel.set(m, { scenarios: [] });
                  byModel.get(m)!.scenarios.push(row);
                }
                const grouped = Array.from(byModel.entries()).map(([model, { scenarios }]) => {
                  const mappedScenarios = scenarios.map((s: Record<string, unknown>) => {
                    const score = (s.score || {}) as Record<string, number>;
                    const history = (s.history || []) as { role: string; content: string; quality?: number; tokens_per_sec?: number; ttft?: number }[];
                    const dims = {
                      contextRetention: score.contextRetention ?? score.context_retention ?? 0,
                      personaConsistency: score.personaConsistency ?? score.persona_consistency ?? 0,
                      factualConsistency: score.factualConsistency ?? score.factual_consistency ?? 0,
                      qualityMaintenance: score.qualityMaintenance ?? score.quality_maintenance ?? 0,
                      policyAdherence: score.policyAdherence ?? score.policy_adherence ?? 0,
                      empathy: score.empathy ?? 0,
                    };
                    const turns = history.map((h, ti) => ({
                      role: h.role as "user" | "assistant",
                      content: h.content,
                      turnNumber: ti,
                      qualityScore: h.quality,
                      tokensPerSec: h.tokens_per_sec,
                      ttft: h.ttft,
                    }));
                    const assistantQualities = turns.filter(t => t.role === "assistant" && t.qualityScore != null).map(t => t.qualityScore!);
                    const qualitySlope = assistantQualities.length >= 2
                      ? (assistantQualities[assistantQualities.length - 1] - assistantQualities[0]) / assistantQualities.length
                      : 0;
                    return {
                      scenarioId: s.scenario_id as string,
                      scenarioName: (s.scenario_name as string) ?? "Scenario",
                      turns,
                      overallScore: (s.overall_score as number) ?? 0,
                      dimensions: dims,
                      contextWindowUsed: 0,
                      qualitySlope,
                      contextExhausted: Boolean(s.context_exhausted),
                    };
                  });
                  const avgDims = {
                    contextRetention: 0, personaConsistency: 0, factualConsistency: 0,
                    qualityMaintenance: 0, policyAdherence: 0, empathy: 0,
                  };
                  for (const sc of mappedScenarios) {
                    for (const k of Object.keys(avgDims) as (keyof typeof avgDims)[]) {
                      avgDims[k] += sc.dimensions[k] / mappedScenarios.length;
                    }
                  }
                  const allQualities = mappedScenarios.flatMap(sc =>
                    sc.turns.filter(t => t.role === "assistant" && t.qualityScore != null)
                      .map(t => ({ turn: t.turnNumber, quality: t.qualityScore! }))
                  );
                  return {
                    model,
                    scenarios: mappedScenarios,
                    overallDimensions: avgDims,
                    overallScore: mappedScenarios.length > 0
                      ? Math.round(mappedScenarios.reduce((a, s) => a + s.overallScore, 0) / mappedScenarios.length)
                      : 0,
                    qualityOverTurns: allQualities,
                    avgQualitySlope: mappedScenarios.length > 0
                      ? mappedScenarios.reduce((a, s) => a + s.qualitySlope, 0) / mappedScenarios.length
                      : 0,
                  };
                });
                setConversationResults(grouped);
              })
              .catch(() => { });
          } else if (st === "adversarial") {
            fetch(`/api/results/${id}/adversarial`)
              .then((r) => r.ok ? r.json() : null)
              .then((data) => {
                if (!data?.results) return;
                // Group raw rows by model and transform into AdversarialResultData[]
                const byModel = new Map<string, { scenarios: Record<string, unknown>[] }>();
                for (const row of data.results) {
                  const m = row.model_name ?? "unknown";
                  if (!byModel.has(m)) byModel.set(m, { scenarios: [] });
                  byModel.get(m)!.scenarios.push(row);
                }
                const grouped = Array.from(byModel.entries()).map(([model, { scenarios }]) => {
                  const mappedScenarios = scenarios.map((s: Record<string, unknown>) => {
                    const score = (s.score || {}) as Record<string, number>;
                    const breaches = (s.breaches || []) as { turn: number; type: string; severity: string; evidence: string; description: string; attackMessage?: string; modelResponse?: string }[];
                    const history = (s.history || []) as { role: string; content: string; breach_detected?: boolean; breach_type?: string }[];
                    return {
                      scenarioId: s.scenario_id as string,
                      scenarioName: (s.scenario_name as string) ?? "Scenario",
                      attackStrategy: (s.attack_strategy as string) ?? "unknown",
                      robustnessScore: (s.robustness_score as number) ?? score.robustness ?? 0,
                      survived: Boolean(s.survived),
                      turnsToFirstBreach: (s.turns_to_first_breach as number | null) ?? null,
                      maxTurns: history.filter(h => h.role === "attacker" || h.role === "defender").length || 1,
                      breaches: breaches.map((b, bi) => ({
                        id: `breach-${bi}`,
                        turn: b.turn ?? 0,
                        type: (b.type ?? "policy_violation") as "prompt_leak" | "data_leak" | "policy_violation",
                        severity: (b.severity ?? "low") as "low" | "medium" | "critical",
                        attackMessage: b.attackMessage ?? "",
                        modelResponse: b.modelResponse ?? "",
                        evidence: b.evidence ?? "",
                        description: b.description ?? "",
                      })),
                      defenseQuality: score.defenseQuality ?? score.defense_quality ?? 0,
                      helpfulnessUnderPressure: score.helpfulnessUnderPressure ?? score.helpfulness_under_pressure ?? 0,
                      consistencyUnderPressure: score.consistencyUnderPressure ?? score.consistency_under_pressure ?? 0,
                    };
                  });
                  const totalBreaches = mappedScenarios.reduce((a, s) => a + s.breaches.length, 0);
                  const survivedCount = mappedScenarios.filter(s => s.survived).length;
                  // Build breach timeline from all scenarios
                  const breachTimeline: { turn: number; breachDetected: boolean; severity: "low" | "medium" | "critical" | null }[] = [];
                  for (const sc of mappedScenarios) {
                    for (let t = 0; t < sc.maxTurns; t++) {
                      const breach = sc.breaches.find(b => b.turn === t);
                      breachTimeline.push({
                        turn: t,
                        breachDetected: !!breach,
                        severity: breach ? breach.severity : null,
                      });
                    }
                  }
                  return {
                    model,
                    robustnessPct: mappedScenarios.length > 0
                      ? Math.round(mappedScenarios.reduce((a, s) => a + s.robustnessScore, 0) / mappedScenarios.length)
                      : 0,
                    totalBreaches,
                    survivedScenarios: survivedCount,
                    totalScenarios: mappedScenarios.length,
                    avgSurvivedUntil: mappedScenarios.length > 0
                      ? Math.round(mappedScenarios.reduce((a, s) => a + (s.turnsToFirstBreach ?? s.maxTurns), 0) / mappedScenarios.length)
                      : 0,
                    scenarios: mappedScenarios,
                    breachTimeline,
                  };
                });
                setAdversarialResults(grouped);
              })
              .catch(() => { });
          }

          // Fetch matchup data (judge evaluations + elo matches + peer votes)
          fetch(`/api/results/${id}/matchups`)
            .then((r) => r.ok ? r.json() : null)
            .then((data) => {
              if (data) setMatchupData({
                eloMatches: data.eloMatches || [],
                peerVotes: data.peerVotes || [],
                judgeEvaluations: data.judgeEvaluations || [],
              });
            })
            .catch(() => { });
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Fetch Elo ratings
  useEffect(() => {
    fetch("/api/elo")
      .then((r) => r.json())
      .then((data) => {
        if (data.ratings) {
          const map: Record<string, { rating: number; confidence: number }> = {};
          for (const r of data.ratings) {
            map[r.modelName] = { rating: r.rating, confidence: r.confidence };
          }
          setEloRatings(map);
        }
      })
      .catch(() => { });
  }, []);

  const togglePrompt = (promptId: string) => {
    setExpandedPrompts((s) => {
      const next = new Set(s);
      if (next.has(promptId)) next.delete(promptId); else next.add(promptId);
      return next;
    });
  };

  const vote = async (promptResultId: string, voteVal: "better" | "worse" | null) => {
    await fetch(`/api/results/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ promptResultId, vote: voteVal }),
    });
    setRun((r) => {
      if (!r) return r;
      return {
        ...r,
        models: r.models.map((m) => ({
          ...m,
          promptResults: m.promptResults.map((pr) =>
            pr.id === promptResultId ? { ...pr, manual_vote: voteVal } : pr
          ),
        })),
      };
    });
  };

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const preferenceVote = async (promptId: string, winnerModel: string) => {
    const activeModels = run?.models.filter((m) => !m.skipped) || [];
    for (const m of activeModels) {
      const pr = m.promptResults.find((r) => r.prompt_id === promptId);
      if (!pr) continue;
      const voteVal = m.model_name === winnerModel ? "better" : "worse";
      await vote(pr.id, pr.manual_vote === voteVal ? null : voteVal);
    }
  };

  if (loading) return <div className="p-8"><SkeletonList count={4} /></div>;
  if (!run) return <div className="p-8 text-zinc-500">Run not found.</div>;

  const activeModels = run.models.filter((m) => !m.skipped);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const chartModels = activeModels
    .filter((m) => !selectedModel || m.model_name === selectedModel)
    .map((m) => ({
      name: m.model_name,
      categoryScores: m.categoryScores,
      overallScore: m.overall_score,
      avgTokensPerSec: m.avg_tokens_per_sec,
    }));

  const verdict = generateVerdict(
    activeModels.map((m) => ({
      name: m.model_name,
      overallScore: m.overall_score,
      avgTokensPerSec: m.avg_tokens_per_sec,
    }))
  );

  const duration = run.completed_at
    ? (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000
    : null;

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const judgeWinner = (() => {
    if (!run.judge_enabled) return null;
    const tally = activeModels.map((m) => {
      const judged = m.promptResults.filter((pr) => {
        const js = pr.judgeScores || pr.judge_scores;
        return js !== null;
      });
      if (judged.length === 0) return null;
      const wins = judged.filter((pr) => {
        const js = pr.judgeScores || pr.judge_scores;
        return js?.won;
      }).length;
      const avgScore = Math.round(judged.reduce((s, pr) => {
        const js = pr.judgeScores || pr.judge_scores;
        return s + (js?.score || 0);
      }, 0) / judged.length);
      return { name: m.model_name, wins, avgScore };
    }).filter(Boolean) as { name: string; wins: number; avgScore: number }[];
    if (tally.length === 0) return null;
    return tally.sort((a, b) => b.wins - a.wins || b.avgScore - a.avgScore)[0];
  })();

  // Speed & quality champions (available for future use)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const speedChampion = activeModels.length > 1
    ? [...activeModels].sort((a, b) => b.avg_tokens_per_sec - a.avg_tokens_per_sec)[0]
    : null;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const qualityChampion = activeModels.length > 1
    ? [...activeModels].sort((a, b) => b.overall_score - a.overall_score)[0]
    : null;

  // For agentic suites (coding, conversation, adversarial, etc.), there are
  // no standard prompts — scenarios live in separate tables and show up as
  // prompt_results via the run. Fall back to prompt_results when no suite
  // prompts exist.
  // For agentic suites (coding, tool_calling, conversation, adversarial, vision, rag),
  // scenarios live in separate tables and prompt IDs come from prompt_results, not suite.prompts.
  const isAgenticSuite = ["coding", "tool_calling", "conversation", "adversarial", "vision", "rag"].includes(suiteType);
  const promptIds = (!isAgenticSuite && (suite?.prompts?.length ?? 0) > 0)
    ? suite!.prompts.map((p: { id: string }) => p.id)
    : Array.from(new Set(activeModels.flatMap((m) => m.promptResults.map((p: { prompt_id: string }) => p.prompt_id))));

  const categories = ["all", ...Array.from(new Set(suite?.prompts.map((p) => p.category) || []))];
  const filteredPromptIds = categoryFilter === "all"
    ? promptIds
    : promptIds.filter((pid) => suite?.prompts.find((p) => p.id === pid)?.category === categoryFilter);

  const TYPE_LABEL: Record<string, { label: string; color: string }> = {
    standard: { label: "Standard", color: "text-zinc-500" },
    tool_calling: { label: "Tools", color: "text-blue-400" },
    conversation: { label: "Convo", color: "text-emerald-400" },
    adversarial: { label: "Attack", color: "text-rose-400" },
    coding: { label: "Code", color: "text-cyan-400" },
    vision: { label: "Vision", color: "text-purple-400" },
    rag: { label: "RAG", color: "text-amber-400" }
  };
  const typeInfo = TYPE_LABEL[suiteType] || TYPE_LABEL.standard;

  return (
    <div className="px-6 md:px-12 py-12 max-w-[1300px] mx-auto min-h-screen">
      {/* Header */}
      <Link href="/results" className="text-zinc-400 hover:text-white transition-colors mb-8 inline-flex items-center gap-1.5 text-[15px] font-medium tracking-tight">
        <ChevronLeft size={18} /> Return to Runs
      </Link>

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <span className={cn("px-2.5 py-0.5 rounded text-[13px] font-bold tracking-wider uppercase bg-white/10", typeInfo.color)}>{typeInfo.label}</span>
            <span className="text-zinc-400 text-[15px] font-medium tracking-tight">{activeModels.length} models tested</span>
          </div>
          <h1 className="text-4xl font-semibold tracking-tight text-white">
            {run.suite_name}
          </h1>
          <div className="flex items-center gap-3 mt-3 text-[16px] font-medium text-zinc-400 tracking-tight">
            {duration && <span>{formatDuration(duration)}</span>}
            <span className="text-zinc-600">&middot;</span>
            <span className="text-zinc-300">{formatRelativeTime(run.started_at)}</span>
            {run.judge_model && (
              <><span className="text-zinc-600">&middot;</span> <span className="text-violet-400">Judge: {run.judge_model}</span></>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link href={`/suite/${run.suite_id}/run?runId=${id}`}>
            <button className="h-11 px-5 rounded-full apple-glass text-[15px] font-medium hover:bg-white/10 transition-all text-white">Replay Details</button>
          </Link>
          <Link href={`/suite/${run.suite_id}/run`}>
             <button className="h-11 px-5 rounded-full bg-white text-black text-[15px] font-semibold tracking-tight hover:scale-105 active:scale-95 transition-transform">Run Again</button>
          </Link>
          <OverflowMenu runId={id as string} onDelete={() => window.location.href = "/results"} />
        </div>
      </div>

      {/* Apple Notification Verdict */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-16 p-8 apple-glass-panel rounded-[28px] relative">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-emerald-500/20 flex items-center justify-center">
            <div className="w-4 h-4 bg-emerald-400 rounded-full shadow-[0_0_12px_rgba(52,211,75,0.8)]" />
          </div>
          <h2 className="text-[#32D74B] font-semibold text-[16px] tracking-tight">AI Verdict</h2>
        </div>
        <p className="text-[20px] font-medium text-white/90 leading-relaxed tracking-tight max-w-4xl">
          {verdict}
        </p>
      </motion.div>

      {/* Rankings Grouped List */}
      <section className="mb-16">
        <h2 className="text-[20px] font-semibold text-white/90 tracking-tight mb-5 mx-4">Leaderboard</h2>
        <div className="apple-glass-panel rounded-[28px] overflow-hidden">
          {activeModels.map((model, i) => (
            <button
              key={model.model_name}
              onClick={() => setSelectedModel(selectedModel === model.model_name ? null : model.model_name)}
              className={cn(
                "apple-list-row w-full flex items-center p-5 transition-colors text-left",
                selectedModel === model.model_name ? "bg-white/[0.08]" : "hover:bg-white/[0.04]"
              )}
            >
              <span className={cn("text-[20px] font-semibold w-12 text-center tracking-tight", i === 0 ? "text-[#32D74B]" : "text-zinc-400")}>{i + 1}</span>
              
              <div className="flex-1 min-w-0 px-4 flex flex-col">
                 <div className="flex items-center gap-3">
                    <div className="w-2 h-2 rounded-full shadow-sm" style={{ background: getModelColor(model.model_name).hex }} />
                    <span className="text-[17px] font-medium text-white truncate">{model.model_name}</span>
                 </div>
                 <div className="flex gap-3 text-[15px] text-zinc-400 mt-1">
                    {model.parameter_size && <span>{model.parameter_size}</span>}
                    {model.skipped === 1 && <span className="text-[#FF453A]">Skipped</span>}
                 </div>
              </div>
              
              <div className="text-right pr-6 hidden md:block">
                 <p className="text-[16px] font-medium text-white">{model.avg_tokens_per_sec.toFixed(1)} t/s</p>
                 <p className="text-[13px] text-zinc-400 mt-1">Speed</p>
              </div>

              <div className="text-right pr-8 hidden lg:block">
                 <p className="text-[16px] font-medium text-white">{eloRatings[model.model_name] ? Math.round(eloRatings[model.model_name].rating) : "—"}</p>
                 <p className="text-[13px] text-zinc-400 mt-1">Elo</p>
              </div>

              <div className="text-right pl-6 border-l border-white/10">
                 <p className={cn("text-[24px] font-semibold tracking-tight min-w-[60px]", i === 0 ? "text-[#32D74B]" : "text-white")}>
                   {model.overall_score}%
                 </p>
                 <p className="text-[13px] text-zinc-400 mt-1">Score</p>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Telemetry Charts — only useful for standard suites where prompts span
           multiple categories. Agentic modes (tool/convo/adv/coding/vision/rag)
           have their own mode-specific visualizations below. */}
      {activeModels.length >= 1 && suiteType === "standard" && (
        <section className="mb-16">
          <div className="flex flex-col md:flex-row items-center justify-between mx-4 mb-5 gap-4">
            <h2 className="text-[20px] font-semibold text-white/90 tracking-tight">Telemetry Metrics</h2>
            <div className="flex gap-1 p-1 apple-glass rounded-full bg-white/[0.04]">
              {(["radar", "bars", "distribution"] as const).map(tab => (
                <button key={tab} onClick={() => setChartTab(tab)}
                  className={cn("px-5 py-2 rounded-full text-[14px] font-medium capitalize tracking-tight transition-all",
                    chartTab === tab ? "bg-white text-black shadow-sm" : "text-zinc-400 hover:text-white"
                  )}
                >
                  {tab}
                </button>
              ))}
            </div>
          </div>
          <div className="apple-glass-panel rounded-[28px] p-8 min-h-[400px] flex items-center justify-center">
            {chartTab === "radar" && (
              <ModelRadarChart
                models={activeModels.map(m => ({
                  name: m.model_name,
                  categoryScores: m.categoryScores,
                }))}
                height={350}
                showLegend
              />
            )}
            {chartTab === "bars" && (
              <CategoryBarChart
                models={activeModels.map(m => ({
                  name: m.model_name,
                  categoryScores: m.categoryScores as Record<string, number>,
                  avgTokensPerSec: m.avg_tokens_per_sec,
                }))}
                height={350}
              />
            )}
            {chartTab === "distribution" && (
              <ScoreDistribution
                models={activeModels.map(m => ({
                  name: m.model_name,
                  scores: m.promptResults
                    .filter(p => !p.timed_out)
                    .map(p => {
                      const js = p.judgeScores || p.judge_scores;
                      const as = p.auto_scores as Record<string, unknown> | undefined;
                      return (js?.score ?? (as?.rubricScore as number | undefined) ?? 50) as number;
                    }),
                  categories: m.promptResults
                    .filter(p => !p.timed_out)
                    .map(p => {
                      const sp = suite?.prompts.find((sp: {id: string}) => sp.id === p.prompt_id);
                      return sp?.category || "custom";
                    }),
                }))}
              />
            )}
          </div>
        </section>
      )}

      {/* Mode-specific analysis (coding radar, tool accuracy, etc.) — above drill-down */}
      {suiteType === "coding" && activeModels.length > 0 && (
        <section className="mb-16">
          <CodingResultsView
            models={activeModels}
            scenarioNames={
              (suite?.codingScenarios || []).reduce((acc: Record<string, string>, s: { id: string; name: string }) => {
                acc[s.id] = s.name;
                return acc;
              }, {})
            }
          />
        </section>
      )}
      {suiteType === "tool_calling" && toolResults.length > 0 && (
        <section className="mb-16"><ToolResultsView results={toolResults} /></section>
      )}
      {suiteType === "conversation" && conversationResults.length > 0 && (
        <section className="mb-16"><ConversationResultsView results={conversationResults} /></section>
      )}
      {suiteType === "adversarial" && adversarialResults.length > 0 && (
        <section className="mb-16"><AdversarialResultsView results={adversarialResults} /></section>
      )}

      {/* Scenario Results Grouped List */}
      <section className="mb-16">
        <div className="flex flex-col md:flex-row items-center justify-between mx-4 mb-5 gap-4">
          <h2 className="text-[20px] font-semibold text-white/90 tracking-tight">Scenario Drill-Down</h2>
          {categories.length > 1 && (
            <div className="flex gap-2 flex-wrap">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={cn("px-4 py-1.5 rounded-full text-[14px] font-medium tracking-tight transition-all",
                    categoryFilter === cat ? "bg-white/20 text-white" : "apple-glass text-zinc-400 hover:text-white"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="apple-glass-panel rounded-[28px] overflow-hidden flex flex-col">
          {filteredPromptIds.map((promptId) => {
            const suitePrompt = suite?.prompts.find((p) => p.id === promptId);
            // For coding/agentic suites, look up the scenario name from codingScenarios or auto_scores
            const codingScenario = suite?.codingScenarios?.find((s) => s.id === promptId);
            const firstResult = activeModels[0]?.promptResults.find((r) => r.prompt_id === promptId);
            const firstAutoScores = firstResult ? (typeof firstResult.auto_scores === "string" ? (() => { try { return JSON.parse(firstResult.auto_scores); } catch { return {}; } })() : firstResult.auto_scores || {}) : {};
            const scenarioLabel = suitePrompt?.text
              || codingScenario?.name
              || (firstAutoScores as Record<string, unknown>)?.scenarioName as string
              || null;
            const isExpanded = expandedPrompts.has(promptId);
            const resultsForPrompt = activeModels.map((m) => {
              const pr = m.promptResults.find((r) => r.prompt_id === promptId);
              return { model: m.model_name, result: pr };
            });

            return (
              <div key={promptId} className="apple-list-row overflow-hidden transition-all duration-300">
                <button
                  onClick={() => togglePrompt(promptId)}
                  className="w-full flex items-center justify-between p-5 hover:bg-white/[0.04] transition-colors text-left"
                >
                  <div className="flex-1 min-w-0 pr-4">
                    <span className="text-[17px] text-zinc-300 font-medium tracking-tight truncate block">
                      {scenarioLabel || promptId}
                    </span>
                  </div>
                  <div className="flex items-center gap-8 flex-shrink-0">
                    <div className="hidden lg:flex items-center gap-5">
                      {resultsForPrompt.map(({ model, result }) => {
                        const js = result?.judgeScores || result?.judge_scores;
                        const as = result?.auto_scores as Record<string, unknown> | undefined;
                        const score = js?.score ?? (as?.rubricScore as number | undefined) ?? null;
                        return (
                          <div key={model} className="flex flex-col items-center">
                             <div className="w-2 h-2 rounded-full mb-1 shadow-sm" style={{ background: getModelColor(model).hex }} />
                             <span className={cn("text-[13px] font-medium tracking-tight",
                              js?.won ? "text-[#BF5AF2]" : score !== null && score >= 80 ? "text-[#32D74B]" : "text-zinc-400"
                             )}>
                               {score !== null ? `${score}%` : "—"}
                             </span>
                          </div>
                        );
                      })}
                    </div>
                    <ChevronDown size={18} className={cn("text-zinc-500 transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="border-t border-white/5"
                    >
                      <div className={cn("grid gap-4 p-4",
                        resultsForPrompt.length >= 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1"
                      )}>
                        {resultsForPrompt.map(({ model, result }) => {
                          const js = result?.judgeScores || result?.judge_scores;
                          // Use parsed autoScores (camelCase) from getRunById, fall back to parsing raw auto_scores
                          const autoScores = (result?.autoScores || (typeof result?.auto_scores === "string" ? (() => { try { return JSON.parse(result.auto_scores); } catch { return {}; } })() : result?.auto_scores) || {}) as Record<string, unknown>;
                          const gatePass = autoScores.gatePass !== false;
                          const gateFlag = (autoScores.gateFlag as string) || null;
                          const compositeScore = js?.score ?? (autoScores.rubricScore as number | undefined) ?? null;

                          return (
                            <div key={model} className="apple-glass rounded-[24px] p-6 relative">
                              <div className="flex items-center justify-between mb-5">
                                <div className="flex items-center gap-4">
                                  <div className="w-2 h-2 rounded-full shadow-sm" style={{ background: getModelColor(model).hex }} />
                                  <span className="text-[16px] font-semibold tracking-tight text-white">{model}</span>
                                  {compositeScore !== null && (
                                    <span className={cn("px-2.5 py-0.5 rounded-full font-mono text-[11px] uppercase font-bold tracking-wider",
                                      compositeScore >= 80 ? "bg-emerald-500/10 text-emerald-400" : compositeScore >= 60 ? "bg-amber-500/10 text-amber-400" : "bg-white/5 text-zinc-400"
                                    )}>{compositeScore}%</span>
                                  )}
                                  {js?.won && <span className="px-2.5 py-0.5 rounded-full bg-violet-500/10 text-violet-400 font-mono text-[11px] uppercase font-bold text-shadow-sm tracking-wider">Judge MVP</span>}
                                </div>
                                {result && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => vote(result.id, result.manual_vote === "better" ? null : "better")}
                                      className={cn("p-2 rounded-full transition-colors", result.manual_vote === "better" ? "text-emerald-400 bg-emerald-400/10" : "text-zinc-500 hover:text-white hover:bg-white/5")}
                                    ><ThumbsUp size={16} /></button>
                                    <button
                                      onClick={() => vote(result.id, result.manual_vote === "worse" ? null : "worse")}
                                      className={cn("p-2 rounded-full transition-colors", result.manual_vote === "worse" ? "text-red-400 bg-red-400/10" : "text-zinc-500 hover:text-white hover:bg-white/5")}
                                    ><ThumbsDown size={16} /></button>
                                  </div>
                                )}
                              </div>

                              {result ? (
                                result.timed_out ? (
                                  <p className="text-red-400/80 font-mono text-[15px]">Timeout occurred</p>
                                ) : (
                                  <>
                                    <div className="max-h-[300px] overflow-y-auto mb-5 pr-4 custom-scrollbar text-zinc-200">
                                      <MarkdownContent content={
                                        result.response
                                          ? result.response
                                          : result.total_tokens > 0
                                            ? "Model produced thinking tokens but no visible output. Try increasing max tokens."
                                            : "No response generated."
                                      } className="text-[15px] leading-relaxed" />
                                    </div>
                                    
                                    {/* Stats block safely appended */}
                                    <div className="mt-5 pt-5 border-t border-white/5 flex flex-wrap gap-5 items-center">
                                       <div className="flex items-center gap-4 text-[13px] text-zinc-500 font-mono font-medium">
                                          {/* Hide 0 t/s on synthetic rows — those are bookkeeping entries */}
                                          {!autoScores.synthetic && (
                                            <>
                                              <span className="text-zinc-300 font-semibold">{result.tokens_per_sec.toFixed(1)} <span className="text-zinc-500">t/s</span></span>
                                              <span>{result.total_tokens} <span className="text-zinc-500">tok</span></span>
                                            </>
                                          )}
                                          {result.ttft > 0 && <span>{Math.round(result.ttft)}<span className="text-zinc-500">{autoScores.suiteMode === "tool_calling" ? "ms latency" : "ms TTFT"}</span></span>}
                                          {(() => {
                                            const tests = (autoScores.testResults || []) as Array<{ executionTimeMs?: number }>;
                                            const totalExec = tests.reduce((s, t) => s + (t.executionTimeMs || 0), 0);
                                            return totalExec > 0 ? <span>{Math.round(totalExec)}<span className="text-zinc-500">ms Docker</span></span> : null;
                                          })()}
                                          {/* Tool-calling mode: show tool selection scores inline */}
                                          {autoScores.suiteMode === "tool_calling" && (
                                            <>
                                              {autoScores.toolSelection != null && <span className="text-blue-400">Select {autoScores.toolSelection as number}/5</span>}
                                              {autoScores.paramAccuracy != null && <span className="text-blue-400">Params {autoScores.paramAccuracy as number}/5</span>}
                                              {autoScores.toolRestraint != null && <span className="text-blue-400">Restraint {autoScores.toolRestraint as number}/5</span>}
                                            </>
                                          )}
                                       </div>
                                       {js && js.accuracy !== undefined && (
                                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-[#BF5AF2]/80 font-medium">
                                          <span className="px-2 py-0.5 bg-violet-500/10 rounded-md" title="Accuracy & Correctness (1-5)">Accuracy {js.accuracy}/5</span>
                                          <span className="px-2 py-0.5 bg-violet-500/10 rounded-md" title="Helpfulness & Completeness (1-5)">Helpfulness {js.helpfulness}/5</span>
                                          <span className="px-2 py-0.5 bg-violet-500/10 rounded-md" title="Clarity & Communication (1-5)">Clarity {js.clarity}/5</span>
                                          <span className="px-2 py-0.5 bg-violet-500/10 rounded-md" title="Instruction Following (1-5)">Instruction {js.instructionFollowing}/5</span>
                                        </div>
                                       )}
                                    </div>

                                    {/* Judge strengths/weaknesses from matchup data */}
                                    {(() => {
                                      const evalForThis = matchupData.judgeEvaluations.find(
                                        (e: { model_name: string; prompt_id: string }) => e.model_name === model && e.prompt_id === promptId
                                      );
                                      if (!evalForThis) return null;
                                      // Split weaknesses on " | " to separate weakness from code_review
                                      const weakParts = (evalForThis.weaknesses || "").split(" | ");
                                      const weakness = weakParts[0] || "";
                                      const codeReview = weakParts.slice(1).join(" | ") || "";
                                      return (
                                        <div className="mt-4 pt-4 border-t border-white/5 text-[12px] space-y-2 max-h-[200px] overflow-y-auto custom-scrollbar">
                                          {evalForThis.strengths && (
                                            <p className="text-emerald-400/80"><span className="font-bold">+</span> {evalForThis.strengths}</p>
                                          )}
                                          {weakness && (
                                            <p className="text-red-400/70"><span className="font-bold">−</span> {weakness}</p>
                                          )}
                                          {codeReview && (
                                            <div className="mt-2 p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                                              <p className="text-[11px] text-zinc-500 font-semibold uppercase tracking-wider mb-1">Code Review</p>
                                              <p className="text-zinc-300 leading-relaxed">{codeReview}</p>
                                            </div>
                                          )}
                                          {evalForThis.winner_reasoning && evalForThis.is_winner === 1 && (
                                            <p className="text-violet-300/60 italic mt-2 pl-3 border-l-2 border-violet-500/20">{evalForThis.winner_reasoning}</p>
                                          )}
                                        </div>
                                      );
                                    })()}

                                    {/* Test case results for coding suites */}
                                    {(() => {
                                      const testResults = (autoScores.testResults || []) as Array<{ passed: boolean; testCaseId: string; expectedOutput?: string; actualOutput?: string; executionTimeMs?: number; error?: string }>;
                                      if (testResults.length === 0) return null;
                                      return (
                                        <div className="mt-4 pt-4 border-t border-white/5 overflow-x-auto">
                                          <table className="w-full text-[11px] font-mono min-w-[400px]">
                                            <thead>
                                              <tr className="text-zinc-600 text-left text-[10px] uppercase tracking-wider">
                                                <th className="pb-1 pr-2 w-5"></th>
                                                <th className="pb-1 pr-3 max-w-[200px]">Expected</th>
                                                <th className="pb-1 pr-3 max-w-[200px]">Got</th>
                                                <th className="pb-1 text-right w-12">Time</th>
                                              </tr>
                                            </thead>
                                            <tbody>
                                              {testResults.map((t, ti) => (
                                                <tr key={ti} className="border-t border-white/[0.03]">
                                                  <td className="py-1.5 pr-2 text-center">{t.passed ? <span className="text-emerald-500">✓</span> : <span className="text-red-500">✗</span>}</td>
                                                  <td className={cn("py-1.5 pr-3 max-w-[200px] truncate", t.passed ? "text-zinc-600" : "text-zinc-300")} title={t.expectedOutput}>{t.expectedOutput || "—"}</td>
                                                  <td className={cn("py-1.5 pr-3 max-w-[200px] truncate", t.passed ? "text-zinc-600" : "text-red-400")} title={t.error || t.actualOutput || ""}>{t.error ? t.error.slice(0, 50) : (t.actualOutput || "—")}</td>
                                                  <td className="py-1.5 text-right text-zinc-700 whitespace-nowrap">{t.executionTimeMs != null ? `${Math.round(t.executionTimeMs)}ms` : ""}</td>
                                                </tr>
                                              ))}
                                            </tbody>
                                          </table>
                                        </div>
                                      );
                                    })()}

                                    {/* Tool-calling: expected vs actual tool calls */}
                                    {autoScores.suiteMode === "tool_calling" && (() => {
                                      const expected = (autoScores.expectedToolCalls || []) as Array<{ toolName: string; expectedParams?: Record<string, { matchType: string; value?: string }> }>;
                                      const actual = (autoScores.actualToolCalls || []) as Array<{ functionName: string; arguments: Record<string, unknown> }>;
                                      if (expected.length === 0 && actual.length === 0) return null;
                                      return (
                                        <div className="mt-4 pt-4 border-t border-white/5">
                                          <div className="grid grid-cols-2 gap-3">
                                            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                                              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Expected</div>
                                              {expected.length === 0 ? (
                                                <span className="text-xs text-zinc-500">No tool call</span>
                                              ) : expected.map((e, i) => (
                                                <div key={i} className="flex items-center gap-2 text-xs mb-1">
                                                  <span className="font-mono text-zinc-200">{e.toolName}</span>
                                                  {e.expectedParams && Object.keys(e.expectedParams).length > 0 && (
                                                    <span className="text-zinc-500">({Object.keys(e.expectedParams).join(", ")})</span>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                            <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-3">
                                              <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">Actual</div>
                                              {actual.length === 0 ? (
                                                <span className="text-xs text-red-400">No tool called</span>
                                              ) : actual.map((a, i) => {
                                                const matched = expected.some(e => e.toolName === a.functionName);
                                                return (
                                                  <div key={i} className="mb-1">
                                                    <div className="flex items-center gap-2 text-xs">
                                                      <span className={matched ? "text-emerald-400" : "text-red-400"}>{matched ? "✓" : "✗"}</span>
                                                      <span className={cn("font-mono", matched ? "text-emerald-300" : "text-red-300")}>{a.functionName}</span>
                                                    </div>
                                                    {Object.keys(a.arguments).length > 0 && (
                                                      <div className="ml-5 text-[11px] text-zinc-500 font-mono">
                                                        {Object.entries(a.arguments).map(([k, v]) => (
                                                          <div key={k}>{k}: {typeof v === "string" ? `"${v}"` : JSON.stringify(v)}</div>
                                                        ))}
                                                      </div>
                                                    )}
                                                  </div>
                                                );
                                              })}
                                            </div>
                                          </div>
                                        </div>
                                      );
                                    })()}

                                    {/* Adversarial: breach summary for this scenario */}
                                    {autoScores.suiteMode === "adversarial" && (() => {
                                      const advModel = adversarialResults.find((r: { model: string }) => r.model === model);
                                      const advScenario = advModel?.scenarios?.find((s: { scenarioId: string }) => s.scenarioId === promptId);
                                      if (!advScenario) return null;
                                      return (
                                        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                                          <div className="flex items-center gap-4 text-xs">
                                            <span className={advScenario.survived ? "text-emerald-400" : "text-amber-400"}>
                                              {advScenario.survived ? "Survived" : `Breached (${advScenario.breaches?.length || 0})`}
                                            </span>
                                            <span className="text-zinc-500">Defense {advScenario.defenseQuality}/5</span>
                                            <span className="text-zinc-500">Strategy: {advScenario.attackStrategy}</span>
                                            {advScenario.turnsToFirstBreach != null && (
                                              <span className="text-amber-400">First breach turn {advScenario.turnsToFirstBreach}</span>
                                            )}
                                          </div>
                                          {(advScenario.breaches || []).map((breach: { id: string; severity: string; type: string; evidence: string; attackMessage: string; modelResponse: string }, bi: number) => (
                                            <div key={bi} className="bg-white/[0.02] border border-white/[0.04] rounded-lg p-3 space-y-2">
                                              <div className="flex items-center gap-2 text-xs">
                                                <span className={cn("font-bold uppercase", breach.severity === "critical" ? "text-red-400" : breach.severity === "medium" ? "text-amber-400" : "text-zinc-400")}>{breach.severity}</span>
                                                <span className="text-zinc-300">{breach.type.replace(/_/g, " ")}</span>
                                              </div>
                                              {breach.attackMessage && (
                                                <div className="text-xs"><span className="text-zinc-600">Attack:</span> <span className="text-zinc-400 break-words">{breach.attackMessage.slice(0, 200)}</span></div>
                                              )}
                                              {breach.modelResponse && (
                                                <div className="text-xs"><span className="text-zinc-600">Response:</span> <span className="text-red-300/70 break-words">{breach.modelResponse.slice(0, 200)}</span></div>
                                              )}
                                              {breach.evidence && (
                                                <div className="text-xs font-mono text-amber-400/60 break-words">{breach.evidence.slice(0, 150)}</div>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}

                                    {/* Conversation: turn-by-turn transcript */}
                                    {autoScores.suiteMode === "conversation" && (() => {
                                      const convoModel = conversationResults.find((r: { model: string }) => r.model === model);
                                      const convoScenario = convoModel?.scenarios?.find((s: { scenarioId: string }) => s.scenarioId === promptId);
                                      if (!convoScenario || !convoScenario.turns?.length) return null;
                                      return (
                                        <div className="mt-4 pt-4 border-t border-white/5 space-y-2">
                                          <div className="flex items-center gap-4 text-xs text-zinc-500 mb-2">
                                            <span>{convoScenario.turns.length} turns</span>
                                            <span>Quality slope: {convoScenario.qualitySlope > 0 ? "+" : ""}{convoScenario.qualitySlope.toFixed(1)}</span>
                                          </div>
                                          <div className="max-h-[300px] overflow-y-auto space-y-1.5 pr-2 custom-scrollbar">
                                            {convoScenario.turns.map((turn: { role: string; content: string; turnNumber: number; qualityScore?: number; tokensPerSec?: number }, ti: number) => (
                                              <div key={ti} className={cn("py-2 px-3 rounded-lg text-xs", turn.role === "user" ? "bg-white/[0.02] border border-white/[0.04]" : "bg-white/[0.04] border border-white/[0.06]")}>
                                                <div className="flex items-center gap-2 mb-1 text-[10px] text-zinc-500 uppercase tracking-wider">
                                                  <span>{turn.role === "user" ? "User" : "Assistant"} · Turn {turn.turnNumber}</span>
                                                  {turn.role === "assistant" && turn.qualityScore != null && (
                                                    <span className={cn("font-mono", turn.qualityScore >= 80 ? "text-emerald-400" : turn.qualityScore >= 60 ? "text-amber-400" : "text-red-400")}>Q:{turn.qualityScore}</span>
                                                  )}
                                                  {turn.role === "assistant" && turn.tokensPerSec != null && turn.tokensPerSec > 0 && (
                                                    <span className="font-mono text-zinc-600">{turn.tokensPerSec.toFixed(1)} t/s</span>
                                                  )}
                                                </div>
                                                <p className="text-zinc-300 whitespace-pre-wrap break-words leading-relaxed overflow-hidden">{turn.content}</p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      );
                                    })()}
                                  </>
                                )
                              ) : (
                                <p className="text-zinc-700 italic text-sm">No recorded output</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </section>

      {/* Head-to-Head Record — at the bottom */}
      {matchupData.eloMatches.length > 0 && (
        <section className="mb-16">
          <MatchupHistoryView
            eloMatches={matchupData.eloMatches}
            peerVotes={matchupData.peerVotes}
            judgeEvaluations={matchupData.judgeEvaluations}
            models={activeModels.map(m => m.model_name)}
            scenarioLabels={(() => {
              const labels: Record<string, string> = {};
              for (const p of suite?.prompts || []) labels[p.id] = p.text;
              for (const s of suite?.codingScenarios || []) labels[s.id] = s.name;
              // Also try auto_scores.scenarioName from prompt results
              for (const m of activeModels) {
                for (const pr of m.promptResults) {
                  if (labels[pr.prompt_id]) continue;
                  const as = (typeof pr.auto_scores === "string" ? (() => { try { return JSON.parse(pr.auto_scores); } catch { return {}; } })() : pr.auto_scores) as Record<string, unknown> || {};
                  if (as.scenarioName) labels[pr.prompt_id] = as.scenarioName as string;
                }
              }
              return labels;
            })()}
          />
        </section>
      )}
    </div>
  );
}
