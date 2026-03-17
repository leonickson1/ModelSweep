"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, ChevronDown, Trophy, Share2,
  ThumbsUp, ThumbsDown, Clock, Cpu, Gavel,
  MoreHorizontal, Trash2, Download, Zap, Star,
  Info, Wrench, MessageSquare, ShieldAlert as ShieldAlertIcon,
} from "lucide-react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { GlowCard } from "@/components/ui/glow-card";
import { SkeletonList } from "@/components/ui/skeleton";
import { ScoreBadge } from "@/components/ui/score-badge";
import { ModelColorDot } from "@/components/ui/model-badge";
import { Button } from "@/components/ui/button";
import { ModelRadarChart } from "@/components/charts/radar-chart";
import { CategoryBarChart } from "@/components/charts/bar-chart";
import { ScoreDistribution } from "@/components/charts/score-distribution";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { ExportReport } from "@/components/results/export-report";
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
const PipelineReplayView = dynamic(
  () => import("@/components/results/pipeline-replay"),
  { ssr: false, loading: () => <div className="animate-pulse h-40 bg-white/5 rounded-2xl" /> }
);

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
  auto_scores: Record<string, unknown>;
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
}

// ─── Helper Components for Prompt Dropdown ───────────────────────────────────

function SectionLabel({ label }: { label: string }) {
  return (
    <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-widest">
      {label}
    </div>
  );
}

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
            <p>Score = Auto-check quality (15%) + Judge evaluation (85%). The auto-checker verifies structural quality. The judge evaluates actual content quality on 4 axes.</p>
          ) : (
            <p>Score is based on automated quality checks: relevance to prompt, response depth, coherence, instruction compliance, and language quality. Enable a judge model for more accurate scoring.</p>
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
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState<TestRun | null>(null);
  const [suite, setSuite] = useState<Suite | null>(null);
  const [loading, setLoading] = useState(true);
  const [chartMode, setChartMode] = useState<"radar" | "bars" | "distribution" | "pipeline">("radar");
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [eloRatings, setEloRatings] = useState<Record<string, { rating: number; confidence: number }>>({});
  const [suiteType, setSuiteType] = useState<string>("standard");
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

  // Speed & quality champions
  const speedChampion = activeModels.length > 1
    ? [...activeModels].sort((a, b) => b.avg_tokens_per_sec - a.avg_tokens_per_sec)[0]
    : null;
  const qualityChampion = activeModels.length > 1
    ? [...activeModels].sort((a, b) => b.overall_score - a.overall_score)[0]
    : null;

  const promptIds = suite?.prompts.map((p) => p.id) ??
    (activeModels[0]?.promptResults.map((p) => p.prompt_id) || []);

  const categories = ["all", ...Array.from(new Set(suite?.prompts.map((p) => p.category) || []))];
  const filteredPromptIds = categoryFilter === "all"
    ? promptIds
    : promptIds.filter((pid) => suite?.prompts.find((p) => p.id === pid)?.category === categoryFilter);

  return (
    <div ref={contentRef} className="p-8 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/results" className="flex items-center gap-1.5 text-zinc-500 text-xs hover:text-zinc-300 mb-4 transition-colors">
          <ChevronLeft size={13} />
          All Results
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">{run.suite_name}</h1>
            <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1"><Clock size={10} />{formatRelativeTime(run.started_at)}</span>
              <span className="flex items-center gap-1"><Cpu size={10} />{activeModels.length} model{activeModels.length !== 1 ? "s" : ""}</span>
              {duration && <span>{formatDuration(duration)}</span>}
              {run.hardware.class && <span>{run.hardware.class.replace(/_/g, " ")}</span>}
              {suiteType !== "standard" && (
                <span className={cn(
                  "inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] uppercase tracking-wider font-mono border",
                  suiteType === "tool_calling" && "text-blue-400 bg-blue-500/10 border-blue-500/20",
                  suiteType === "conversation" && "text-violet-400 bg-violet-500/10 border-violet-500/20",
                  suiteType === "adversarial" && "text-rose-400 bg-rose-500/10 border-rose-500/20",
                )}>
                  {suiteType === "tool_calling" && <Wrench size={9} />}
                  {suiteType === "conversation" && <MessageSquare size={9} />}
                  {suiteType === "adversarial" && <ShieldAlertIcon size={9} />}
                  {suiteType === "tool_calling" ? "Tools" : suiteType === "conversation" ? "Convo" : suiteType === "adversarial" ? "Attack" : suiteType}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ExportReport runId={id} contentRef={contentRef as React.RefObject<HTMLDivElement>} />
            <Link href={`/results/${id}/share`}>
              <Button variant="secondary" size="sm"><Share2 size={13} />Share</Button>
            </Link>
            <OverflowMenu runId={id} onDelete={() => router.push("/results")} />
          </div>
        </div>
      </motion.div>

      {/* Headline verdict */}
      <GlowCard className="p-6" glowColor={activeModels[0] ? getModelColor(activeModels[0].model_name).hex + "15" : undefined} delay={0.05}>
        <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium uppercase tracking-wider mb-3">
          <Trophy size={13} />
          Verdict
        </div>
        <p className="text-zinc-100 text-lg font-medium leading-relaxed">{verdict}</p>
        {run.started_at && (
          <p className="text-zinc-600 text-xs mt-2">
            {formatRelativeTime(run.started_at)} · Suite: {run.suite_name} · {promptIds.length} prompts
          </p>
        )}
      </GlowCard>

      {/* Judge winner banner */}
      {judgeWinner && (
        <GlowCard className="p-5" glowColor="#8b5cf615" delay={0.08}>
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center flex-shrink-0">
              <Gavel size={18} className="text-violet-400" />
            </div>
            <div>
              <div className="flex items-center gap-2 text-zinc-500 text-xs font-medium uppercase tracking-wider mb-1">
                <span>Judge Verdict</span>
                {run.judge_model && <span className="normal-case">· {run.judge_model}</span>}
              </div>
              <p className="text-zinc-100 text-base font-semibold">{judgeWinner.name}</p>
              <p className="text-zinc-500 text-xs mt-0.5">
                won <span className="text-violet-400 font-mono">{judgeWinner.wins}</span> prompt{judgeWinner.wins !== 1 ? "s" : ""}
                {judgeWinner.avgScore > 0 && <span> · avg <span className="text-violet-400 font-mono">{judgeWinner.avgScore}</span></span>}
              </p>
            </div>
          </div>
        </GlowCard>
      )}

      {/* Charts + model sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <GlowCard className="lg:col-span-3 p-5" delay={0.1}>
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <h2 className="text-zinc-400 text-sm font-medium">Score Breakdown</h2>
              <InfoTooltip text="Visual comparison of model performance across categories" />
            </div>
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {(["radar", "bars", "distribution", "pipeline"] as const).map((mode) => (
                <button key={mode} onClick={() => setChartMode(mode)}
                  className={cn("px-3 py-1 rounded-md text-xs capitalize transition-colors",
                    chartMode === mode ? "bg-white/10 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {mode}
                </button>
              ))}
            </div>
          </div>
          {chartMode === "radar" && <ModelRadarChart models={chartModels} height={320} />}
          {chartMode === "bars" && <CategoryBarChart models={chartModels} height={280} />}
          {chartMode === "distribution" && (
            <ScoreDistribution
              models={activeModels
                .filter((m) => !selectedModel || m.model_name === selectedModel)
                .map((m) => ({
                  name: m.model_name,
                  scores: m.promptResults
                    .filter((p) => !p.timed_out)
                    .map((p) => {
                      const js = p.judgeScores || p.judge_scores;
                      return js?.score ?? (typeof p.auto_scores === 'object' ? 50 : 0);
                    }),
                  categories: m.promptResults
                    .filter((p) => !p.timed_out)
                    .map((p) => {
                      const sp = suite?.prompts.find((sp) => sp.id === p.prompt_id);
                      return sp?.category || 'custom';
                    }),
                }))
              }
            />
          )}
          {chartMode === "pipeline" && (
            <PipelineReplayView
              suiteName={run.suite_name}
              suiteType={suiteType}
              models={activeModels}
              promptCount={suite?.prompts?.length ?? activeModels[0]?.promptResults?.length ?? 0}
            />
          )}
        </GlowCard>

        {/* Model sidebar */}
        <div className="space-y-3">
          {/* Champions */}
          {activeModels.length > 1 && (
            <div className="space-y-2">
              {speedChampion && (
                <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <div className="flex items-center gap-1.5 text-zinc-600 text-[10px] uppercase tracking-wider mb-1">
                    <Zap size={9} />Speed Champion
                    <InfoTooltip text="Model with highest tokens/second throughput" />
                  </div>
                  <p className="text-zinc-300 text-xs font-medium truncate">{speedChampion.model_name}</p>
                  <p className="text-zinc-500 text-xs font-mono">{speedChampion.avg_tokens_per_sec.toFixed(1)} t/s</p>
                </div>
              )}
              {qualityChampion && (
                <div className="px-3 py-2.5 rounded-xl bg-white/[0.03] border border-white/[0.05]">
                  <div className="flex items-center gap-1.5 text-zinc-600 text-[10px] uppercase tracking-wider mb-1">
                    <Star size={9} />Quality Champion
                    <InfoTooltip text="Model with highest overall evaluation score" />
                  </div>
                  <p className="text-zinc-300 text-xs font-medium truncate">{qualityChampion.model_name}</p>
                  <p className="text-zinc-500 text-xs font-mono">{qualityChampion.overall_score}/100</p>
                </div>
              )}
            </div>
          )}

          {run.models.map((model, i) => {
            const color = getModelColor(model.model_name);
            const isSelected = selectedModel === model.model_name;
            return (
              <motion.div key={model.model_name} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.08 * i }}>
                <button
                  onClick={() => setSelectedModel(isSelected ? null : model.model_name)}
                  className={cn(
                    "w-full text-left p-4 rounded-xl border transition-all",
                    isSelected ? "bg-white/10 border-white/20" : "bg-white/5 border-white/[0.06] hover:bg-white/[0.07]",
                    model.skipped && "opacity-50"
                  )}
                  style={isSelected ? { borderColor: color.hex + "40" } : {}}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ background: color.hex }} />
                    <span className="text-zinc-200 text-sm font-medium truncate">{model.model_name}</span>
                  </div>
                  {!model.skipped ? (
                    <>
                      <ScoreBadge score={model.overall_score} size="sm" className="mb-2" />
                      <div className="space-y-1.5 mt-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-zinc-600">Speed</span>
                          <span className="text-zinc-400 font-mono">{model.avg_tokens_per_sec.toFixed(1)} t/s</span>
                        </div>
                        {eloRatings[model.model_name] && (
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-600">Elo</span>
                            <span className="text-[#00FF66] font-mono">{Math.round(eloRatings[model.model_name].rating)}</span>
                          </div>
                        )}
                        {model.elo_rating_snapshot && (
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-600">Elo (run)</span>
                            <span className="text-zinc-400 font-mono">{Math.round(model.elo_rating_snapshot)}</span>
                          </div>
                        )}
                        {model.parameter_size && (
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-600">Params</span>
                            <span className="text-zinc-400">{model.parameter_size}</span>
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-zinc-600">Skipped: {model.skip_reason}</span>
                  )}
                </button>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* Prompt drill-down */}
      <GlowCard className="p-5" delay={0.15}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-zinc-400 text-sm font-medium">Prompt Results</h2>
          {categories.length > 1 && (
            <div className="flex gap-1 bg-white/5 rounded-lg p-1">
              {categories.map((cat) => (
                <button key={cat} onClick={() => setCategoryFilter(cat)}
                  className={cn("px-2.5 py-1 rounded-md text-xs capitalize transition-colors",
                    categoryFilter === cat ? "bg-white/10 text-zinc-200" : "text-zinc-500 hover:text-zinc-300"
                  )}
                >
                  {cat}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="space-y-2">
          {filteredPromptIds.map((promptId) => {
            const suitePrompt = suite?.prompts.find((p) => p.id === promptId);
            const isExpanded = expandedPrompts.has(promptId);
            const resultsForPrompt = activeModels.map((m) => {
              const pr = m.promptResults.find((r) => r.prompt_id === promptId);
              return { model: m.model_name, result: pr };
            });

            // Who did the judge pick for this prompt?
            const judgePick = resultsForPrompt.find(({ result }) => {
              const js = result?.judgeScores || result?.judge_scores;
              return js?.won;
            })?.model;

            // Who did the user pick?
            const userPick = resultsForPrompt.find(({ result }) => result?.manual_vote === "better")?.model;

            return (
              <div key={promptId} className="border border-white/[0.05] rounded-xl overflow-hidden">
                <button
                  onClick={() => togglePrompt(promptId)}
                  className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/3 transition-colors text-left"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-zinc-300 text-sm truncate">{suitePrompt?.text || promptId}</p>
                    <div className="flex items-center gap-2 mt-1">
                      {suitePrompt?.category && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-zinc-400 uppercase tracking-wider font-mono">
                          {suitePrompt.category}
                        </span>
                      )}
                      {suitePrompt?.difficulty && suitePrompt.difficulty !== 'medium' && (
                        <span className={cn(
                          "text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-mono border",
                          suitePrompt.difficulty === 'hard'
                            ? "bg-red-500/10 border-red-500/20 text-red-400"
                            : suitePrompt.difficulty === 'easy'
                              ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                              : "bg-white/5 border-white/10 text-zinc-400"
                        )}>
                          {suitePrompt.difficulty}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {resultsForPrompt.map(({ model, result }) => {
                      const color = getModelColor(model);
                      const js = result?.judgeScores || result?.judge_scores;
                      const as = result?.auto_scores as Record<string, unknown> | undefined;
                      const score = js?.score ?? (as?.rubricScore as number | undefined) ?? null;
                      const isWinner = js?.won;
                      return (
                        <div key={model} className="flex items-center gap-1.5">
                          <div
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ background: result?.timed_out || !result ? "#52525b" : color.hex }}
                          />
                          {score !== null && (
                            <span className={cn(
                              "text-xs font-mono tabular-nums",
                              isWinner ? "text-violet-400" : "text-zinc-500"
                            )}>
                              {score}%
                            </span>
                          )}
                          {isWinner && <span className="text-[9px]">👑</span>}
                        </div>
                      );
                    })}
                    <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", isExpanded && "rotate-180")} />
                  </div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="border-t border-white/[0.05]">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 divide-y md:divide-y-0 md:divide-x divide-white/[0.05]">
                          {resultsForPrompt.map(({ model, result }) => {
                            const js = result?.judgeScores || result?.judge_scores;
                            const autoScores = (result?.auto_scores || {}) as Record<string, unknown>;
                            const gatePass = autoScores.gatePass !== false;
                            const gateFlag = (autoScores.gateFlag as string) || null;
                            const warnings = (autoScores.warnings as string[]) || [];
                            const rubricResults = (autoScores.rubricResults as Array<{ type: string; value: string; label: string; passed?: boolean }>) || null;
                            const compositeScore = js?.score ?? (autoScores.rubricScore as number | undefined) ?? null;

                            return (
                              <div key={model} className="p-4 space-y-3">
                                {/* Model header + vote buttons */}
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <ModelColorDot name={model} size={7} />
                                    <span className="text-zinc-400 text-xs font-medium">{model}</span>
                                  </div>
                                  {result && (
                                    <div className="flex items-center gap-1.5">
                                      <button
                                        onClick={() => vote(result.id, result.manual_vote === "better" ? null : "better")}
                                        className={cn("p-1 rounded-lg transition-colors",
                                          result.manual_vote === "better"
                                            ? "text-emerald-400 bg-emerald-500/15"
                                            : "text-zinc-600 hover:text-emerald-400"
                                        )}
                                      >
                                        <ThumbsUp size={12} />
                                      </button>
                                      <button
                                        onClick={() => vote(result.id, result.manual_vote === "worse" ? null : "worse")}
                                        className={cn("p-1 rounded-lg transition-colors",
                                          result.manual_vote === "worse"
                                            ? "text-red-400 bg-red-500/15"
                                            : "text-zinc-600 hover:text-red-400"
                                        )}
                                      >
                                        <ThumbsDown size={12} />
                                      </button>
                                    </div>
                                  )}
                                </div>

                                {result ? (
                                  result.timed_out ? (
                                    <p className="text-zinc-600 text-xs italic">Response timed out</p>
                                  ) : (
                                    <>
                                      {/* RESPONSE */}
                                      <div>
                                        <SectionLabel label="Response" />
                                        <div className="max-h-52 overflow-y-auto mt-1">
                                          <MarkdownContent content={result.response || "No response"} className="text-xs" />
                                        </div>
                                      </div>

                                      {/* SCORE + info tooltip */}
                                      {compositeScore !== null && (
                                        <div className="flex items-center gap-2">
                                          <SectionLabel label="Score" />
                                          <ScoreBadge score={compositeScore} size="sm" />
                                          <ScoreInfoTooltip
                                            gatePass={gatePass}
                                            gateFlag={gateFlag}
                                            hasJudge={!!js}
                                            warnings={warnings}
                                          />
                                        </div>
                                      )}

                                      {/* AUTO CHECKS (collapsible) */}
                                      <CollapsibleSection label="Auto Checks" defaultOpen={!gatePass}>
                                        <div className="space-y-1">
                                          <CheckLine passed={gateFlag !== 'REFUSED'} label="No refusal detected" />
                                          <CheckLine passed={gateFlag !== 'REPETITION_LOOP'} label="No repetition" />
                                          <CheckLine
                                            passed={!warnings.includes('TRUNCATED')}
                                            label={warnings.includes('TRUNCATED') ? 'Truncated (near token limit)' : 'Complete response'}
                                            isWarning={warnings.includes('TRUNCATED')}
                                          />
                                          <CheckLine passed={gateFlag !== 'GIBBERISH'} label="Language OK" />
                                          <CheckLine passed={gateFlag !== 'EMPTY'} label="Not empty" />
                                        </div>
                                      </CollapsibleSection>

                                      {/* RUBRIC (only if rubric exists) */}
                                      {rubricResults && rubricResults.length > 0 && (
                                        <CollapsibleSection label="Rubric Checks" defaultOpen={true}>
                                          <div className="space-y-1">
                                            {rubricResults.map((check, i) => (
                                              check.type === 'unstructured'
                                                ? <div key={i} className="text-zinc-600 text-xs flex items-center gap-1.5">
                                                  <span className="text-zinc-700">↻</span>
                                                  <span>Evaluated by judge: {check.label}</span>
                                                </div>
                                                : <CheckLine key={i} passed={!!check.passed} label={check.label} />
                                            ))}
                                          </div>
                                        </CollapsibleSection>
                                      )}

                                      {/* JUDGE EVALUATION */}
                                      {js && (
                                        <div>
                                          <SectionLabel label="Judge Evaluation" />
                                          {js.accuracy !== undefined && (
                                            <div className="grid grid-cols-4 gap-2 mt-1.5 mb-2">
                                              {[
                                                { label: 'ACC', value: js.accuracy, max: 5 },
                                                { label: 'HLP', value: js.helpfulness, max: 5 },
                                                { label: 'CLR', value: js.clarity, max: 5 },
                                                { label: 'INS', value: js.instructionFollowing, max: 5 },
                                              ].map((axis) => (
                                                <div key={axis.label} className="text-center">
                                                  <div className="text-zinc-600 text-[9px] font-mono uppercase tracking-wider">{axis.label}</div>
                                                  <div className={cn(
                                                    "text-sm font-mono tabular-nums",
                                                    (axis.value ?? 0) >= 4 ? "text-[#00FF66]" : (axis.value ?? 0) >= 3 ? "text-zinc-300" : "text-red-400"
                                                  )}>
                                                    {axis.value ?? '-'}/{axis.max}
                                                  </div>
                                                </div>
                                              ))}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-2 flex-wrap">
                                            {js.won && (
                                              <span className="text-xs text-violet-300 flex items-center gap-1">
                                                👑 Judge picked this
                                              </span>
                                            )}
                                            <span className={cn("text-xs font-mono ml-auto", js.won ? "text-violet-300" : "text-zinc-500")}>
                                              Judge: {js.score}
                                            </span>
                                          </div>
                                          {js.reasoning && (
                                            <p className="text-zinc-600 text-xs italic mt-1 leading-relaxed">
                                              &ldquo;{js.reasoning}&rdquo;
                                            </p>
                                          )}
                                        </div>
                                      )}

                                      {/* METADATA */}
                                      <div className="flex items-center gap-4 text-[10px] text-zinc-700 font-mono pt-1 border-t border-white/[0.03]">
                                        <span>{result.tokens_per_sec.toFixed(1)} t/s</span>
                                        <span>{result.total_tokens} tok</span>
                                        {result.ttft > 0 && <span>TTFT {Math.round(result.ttft)}ms</span>}
                                        {result.duration > 0 && <span>{(result.duration / 1000).toFixed(1)}s</span>}
                                      </div>
                                    </>
                                  )
                                ) : (
                                  <p className="text-zinc-700 text-xs">No result</p>
                                )}
                              </div>
                            );
                          })}
                        </div>

                        {/* Preference vote row + judge vs human verdict */}
                        {resultsForPrompt.length >= 2 && (
                          <div className="border-t border-white/[0.05] px-4 py-3 bg-white/[0.01]">
                            <div className="flex items-center gap-3">
                              <span className="text-zinc-600 text-xs">Prefer:</span>
                              <div className="flex gap-2 flex-1">
                                {resultsForPrompt.map(({ model }) => {
                                  const isPicked = userPick === model;
                                  const color = getModelColor(model);
                                  return (
                                    <button
                                      key={model}
                                      onClick={() => preferenceVote(promptId, model)}
                                      className={cn(
                                        "flex-1 py-1.5 rounded-lg text-xs transition-all border",
                                        isPicked
                                          ? "border-current text-white font-medium"
                                          : "border-white/10 text-zinc-500 hover:text-zinc-300 hover:border-white/20"
                                      )}
                                      style={isPicked ? { borderColor: color.hex + "60", background: color.hex + "15", color: color.hex } : {}}
                                    >
                                      {model.split(":")[0]}
                                    </button>
                                  );
                                })}
                              </div>
                            </div>

                            {/* Judge vs human verdict */}
                            <div className="flex items-center gap-4 mt-2 text-xs">
                              {judgePick && (
                                <span className="text-zinc-600">
                                  Judge: <span className="text-violet-400">{judgePick.split(":")[0]}</span>
                                </span>
                              )}
                              {userPick && (
                                <span className={cn("text-zinc-600", judgePick && userPick !== judgePick ? "text-amber-500" : "")}>
                                  You: <span className={cn(judgePick && userPick !== judgePick ? "text-amber-400" : "text-emerald-400")}>{userPick.split(":")[0]}</span>
                                  {judgePick && userPick !== judgePick && <span className="ml-1 text-amber-600">(disagrees with judge)</span>}
                                </span>
                              )}
                              {!userPick && <span className="text-zinc-700">Your verdict: not voted</span>}
                            </div>
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </GlowCard>

      {/* Agentic mode-specific results */}
      {suiteType === "tool_calling" && toolResults.length > 0 && (
        <ToolResultsView results={toolResults} />
      )}
      {suiteType === "conversation" && conversationResults.length > 0 && (
        <ConversationResultsView results={conversationResults} />
      )}
      {suiteType === "adversarial" && adversarialResults.length > 0 && (
        <AdversarialResultsView results={adversarialResults} />
      )}
    </div>
  );
}
