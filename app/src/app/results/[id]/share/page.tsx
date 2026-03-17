"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import { Download, Link2, ChevronLeft, ShieldAlert, Wrench, MessageSquare, Trophy } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/ui/score-badge";
import { getModelColor } from "@/lib/model-colors";
import { generateVerdict } from "@/lib/scoring";
import { cn } from "@/lib/utils";

// ─── Types ──────────────────────────────────────────────────────────────────

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
}

interface ModelResult {
  model_name: string;
  overall_score: number;
  avg_tokens_per_sec: number;
  categoryScores: Record<string, number>;
  skipped: number;
  parameter_size: string;
  promptResults: PromptResult[];
}

type SuiteType = "standard" | "tool_calling" | "conversation" | "adversarial";

interface TestRun {
  id: string;
  suite_id: string;
  suite_name: string;
  suite_type: SuiteType;
  started_at: string;
  hardware: Record<string, string>;
  judge_enabled: number;
  judge_model: string | null;
  models: ModelResult[];
}

interface SuitePrompt {
  id: string;
  text: string;
  category: string;
  difficulty?: string;
  rubric?: string;
}

// ─── Suite-type-specific result types ────────────────────────────────────────

interface ToolCallResult {
  id: string;
  run_id: string;
  model_name: string;
  scenario_id: string;
  scenario_name: string;
  user_message: string;
  expected_tool_calls: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  actual_tool_calls: Array<{ function: { name: string; arguments: Record<string, unknown> } }>;
  text_response: string | null;
  should_call_tool: boolean;
  score: { toolSelection?: number; paramAccuracy?: number; toolRestraint?: number; sequenceOrder?: number; composite?: number };
  overall_score: number;
  latency_ms: number;
}

interface ConversationResult {
  id: string;
  run_id: string;
  model_name: string;
  scenario_id: string;
  scenario_name: string;
  history: Array<{ role: string; content: string }>;
  score: { contextRetention?: number; personaConsistency?: number; factualConsistency?: number; qualityMaintenance?: number; policyAdherence?: number; empathy?: number; overall?: number };
  overall_score: number;
  actual_turns: number;
  context_exhausted: boolean;
  total_duration: number;
}

interface AdversarialResult {
  id: string;
  run_id: string;
  model_name: string;
  scenario_id: string;
  scenario_name: string;
  attack_strategy: string;
  history: Array<{ role: string; content: string }>;
  breaches: Array<{ turn: number; severity: string; evidence: string }>;
  score: { defenseQuality?: number; helpfulnessUnderPressure?: number };
  robustness_score: number;
  survived: boolean;
  turns_to_first_breach: number | null;
  total_duration: number;
}

// ─── Toggle option ──────────────────────────────────────────────────────────

function ToggleOption({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group py-2">
      <div className="relative mt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="sr-only peer"
        />
        <div className={cn(
          "w-4 h-4 rounded border-2 transition-all flex items-center justify-center",
          checked
            ? "bg-violet-500 border-violet-500"
            : "border-zinc-700 group-hover:border-zinc-500"
        )}>
          {checked && (
            <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </div>
      </div>
      <div>
        <div className="text-zinc-300 text-sm font-medium">{label}</div>
        <div className="text-zinc-600 text-xs">{description}</div>
      </div>
    </label>
  );
}

// ─── Tool Calling Share Card ─────────────────────────────────────────────────

function ToolCallingCard({ run, showMetadata, toolCallResults }: { run: TestRun; showMetadata: boolean; toolCallResults: ToolCallResult[] }) {
  // Group tool call results by model
  const modelNames = Array.from(new Set(toolCallResults.map((r) => r.model_name)));
  const modelStats = modelNames.map((name) => {
    const results = toolCallResults.filter((r) => r.model_name === name);
    const avg = (key: string) => {
      const vals = results.map((r) => (r.score as Record<string, number>)[key]).filter((v) => v !== undefined);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 20) : 0; // 0-5 scale -> percentage
    };
    const overall = results.length > 0
      ? Math.round(results.reduce((a, r) => a + (r.overall_score ?? 0), 0) / results.length)
      : 0;
    return {
      name,
      color: getModelColor(name),
      select: avg("toolSelection"),
      params: avg("paramAccuracy"),
      restraint: avg("toolRestraint"),
      sequence: avg("sequenceOrder"),
      overall,
      scenarioCount: results.length,
    };
  }).sort((a, b) => b.overall - a.overall);

  // Fallback to model_results if no tool_call_results exist yet
  if (modelStats.length === 0) {
    const activeModels = run.models.filter((m) => !m.skipped);
    activeModels.forEach((m) => {
      modelStats.push({
        name: m.model_name,
        color: getModelColor(m.model_name),
        select: m.overall_score,
        params: m.overall_score,
        restraint: m.overall_score,
        sequence: m.overall_score,
        overall: m.overall_score,
        scenarioCount: 0,
      });
    });
    modelStats.sort((a, b) => b.overall - a.overall);
  }

  const winner = modelStats[0];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-blue-500/20 border border-blue-500/30 flex items-center justify-center">
            <Wrench size={12} className="text-blue-400" />
          </div>
          <span className="text-zinc-300 font-semibold text-sm">ModelSweep</span>
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 ml-1">
            Tool Calling
          </span>
        </div>
        <span className="text-zinc-600 text-xs">{run.suite_name}</span>
      </div>

      {/* Winner */}
      {winner && (
        <div className="bg-blue-500/5 border border-blue-500/10 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={14} className="text-blue-400" />
            <span className="text-blue-300 text-sm font-semibold">{winner.name}</span>
            <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">
              Winner
            </span>
          </div>
          <span className="text-zinc-500 text-xs">Overall accuracy: {winner.overall}%</span>
        </div>
      )}

      {/* Model accuracy dimensions */}
      <div className="space-y-3">
        <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider">Tool Calling Accuracy</div>
        <div className="space-y-2">
          {modelStats.map((model) => (
            <div key={model.name} className="bg-white/5 rounded-xl p-3 border border-white/[0.06]">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-2 h-2 rounded-full" style={{ background: model.color.hex }} />
                <span className="text-zinc-300 text-xs font-medium truncate">{model.name}</span>
              </div>
              <div className="grid grid-cols-4 gap-2">
                {[
                  { label: "Select", value: model.select },
                  { label: "Params", value: model.params },
                  { label: "Restraint", value: model.restraint },
                  { label: "Sequence", value: model.sequence },
                ].map((dim) => (
                  <div key={dim.label} className="text-center">
                    <div className="text-blue-400 text-sm font-mono tabular-nums">{dim.value}%</div>
                    <div className="text-zinc-600 text-[9px] font-mono uppercase tracking-wider">{dim.label}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Metadata */}
      {showMetadata && (
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-4">
            <span className="text-zinc-700 text-xs">{run.hardware.class?.replace(/_/g, " ")}</span>
            <span className="text-zinc-700 text-xs">{new Date(run.started_at).toLocaleDateString()}</span>
          </div>
          <span className="text-zinc-700 text-xs">modelsweep.dev</span>
        </div>
      )}
    </div>
  );
}

// ─── Adversarial Share Card ──────────────────────────────────────────────────

function AdversarialCard({ run, showMetadata, adversarialResults }: { run: TestRun; showMetadata: boolean; adversarialResults: AdversarialResult[] }) {
  // Group adversarial results by model
  const modelNames = Array.from(new Set(adversarialResults.map((r) => r.model_name)));
  const modelStats = modelNames.map((name) => {
    const results = adversarialResults.filter((r) => r.model_name === name);
    const avgRobustness = results.length > 0
      ? Math.round(results.reduce((a, r) => a + (r.robustness_score ?? 0), 0) / results.length)
      : 0;
    const totalBreaches = results.reduce((a, r) => a + (r.breaches?.length ?? 0), 0);
    const allSurvived = results.every((r) => r.survived);
    const totalTurns = results.reduce((a, r) => a + (r.history?.length ?? 0), 0);
    return {
      name,
      color: getModelColor(name),
      robustness: avgRobustness,
      breachCount: totalBreaches,
      survived: allSurvived,
      totalPrompts: totalTurns,
      scenarioCount: results.length,
      turnsToFirstBreach: results.find((r) => r.turns_to_first_breach !== null)?.turns_to_first_breach ?? null,
    };
  }).sort((a, b) => b.robustness - a.robustness);

  // Fallback to model_results if no adversarial_results exist yet
  if (modelStats.length === 0) {
    const activeModels = run.models.filter((m) => !m.skipped);
    activeModels.forEach((m) => {
      modelStats.push({
        name: m.model_name,
        color: getModelColor(m.model_name),
        robustness: m.overall_score,
        breachCount: 0,
        survived: m.overall_score >= 70,
        totalPrompts: 0,
        scenarioCount: 0,
        turnsToFirstBreach: null,
      });
    });
    modelStats.sort((a, b) => b.robustness - a.robustness);
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-rose-500/20 border border-rose-500/30 flex items-center justify-center">
            <ShieldAlert size={12} className="text-rose-400" />
          </div>
          <span className="text-zinc-300 font-semibold text-sm">ModelSweep</span>
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 ml-1">
            Adversarial
          </span>
        </div>
        <span className="text-zinc-600 text-xs">{run.suite_name}</span>
      </div>

      {/* Model robustness cards */}
      <div className="space-y-3">
        <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider">Robustness Report</div>
        {modelStats.map((model) => (
          <div key={model.name} className="bg-white/5 rounded-xl p-3 border border-white/[0.06]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full" style={{ background: model.color.hex }} />
                <span className="text-zinc-300 text-xs font-medium truncate">{model.name}</span>
              </div>
              <span className={cn(
                "text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border",
                model.survived
                  ? "text-emerald-400 bg-emerald-500/10 border-emerald-500/20"
                  : "text-rose-400 bg-rose-500/10 border-rose-500/20"
              )}>
                {model.survived ? "Survived" : "Breached"}
              </span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <div className="text-zinc-200 text-lg font-mono tabular-nums">{model.robustness}%</div>
                <div className="text-zinc-600 text-[9px] font-mono uppercase tracking-wider">Robustness</div>
              </div>
              {/* Breach timeline dots */}
              {model.totalPrompts > 0 && (
                <div className="flex-1 flex items-center gap-1">
                  {Array.from({ length: Math.min(model.totalPrompts, 12) }).map((_, i) => (
                    <div
                      key={i}
                      className={cn(
                        "w-2 h-2 rounded-full",
                        i < model.breachCount
                          ? "bg-rose-500/80"
                          : "bg-emerald-500/40"
                      )}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Metadata */}
      {showMetadata && (
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-4">
            <span className="text-zinc-700 text-xs">{run.hardware.class?.replace(/_/g, " ")}</span>
            <span className="text-zinc-700 text-xs">{new Date(run.started_at).toLocaleDateString()}</span>
          </div>
          <span className="text-zinc-700 text-xs">modelsweep.dev</span>
        </div>
      )}
    </div>
  );
}

// ─── Conversation Share Card ─────────────────────────────────────────────────

function ConversationCard({ run, showMetadata, conversationResults }: { run: TestRun; showMetadata: boolean; conversationResults: ConversationResult[] }) {
  // Group conversation results by model
  const modelNames = Array.from(new Set(conversationResults.map((r) => r.model_name)));
  const modelStats = modelNames.map((name) => {
    const results = conversationResults.filter((r) => r.model_name === name);
    const avgScore = (key: string) => {
      const vals = results.map((r) => (r.score as Record<string, number>)[key]).filter((v) => v !== undefined);
      return vals.length > 0 ? Math.round(vals.reduce((a, b) => a + b, 0) / vals.length) : 0;
    };
    const overall = results.length > 0
      ? Math.round(results.reduce((a, r) => a + (r.overall_score ?? 0), 0) / results.length)
      : 0;
    // Build per-turn scores from conversation history for trend
    const turnScores: number[] = [];
    for (const r of results) {
      if (r.score?.overall !== undefined) turnScores.push(r.score.overall);
      else turnScores.push(r.overall_score ?? 0);
    }
    return {
      name,
      color: getModelColor(name),
      overall,
      contextMemory: avgScore("contextRetention"),
      personaStability: avgScore("personaConsistency"),
      coherence: avgScore("factualConsistency"),
      qualityMaintenance: avgScore("qualityMaintenance"),
      policyAdherence: avgScore("policyAdherence"),
      empathy: avgScore("empathy"),
      promptScores: turnScores,
      scenarioCount: results.length,
      contextExhausted: results.some((r) => r.context_exhausted),
    };
  }).sort((a, b) => b.overall - a.overall);

  // Fallback to model_results if no conversation_results exist yet
  if (modelStats.length === 0) {
    const activeModels = run.models.filter((m) => !m.skipped);
    activeModels.forEach((m) => {
      modelStats.push({
        name: m.model_name,
        color: getModelColor(m.model_name),
        overall: m.overall_score,
        contextMemory: 0,
        personaStability: 0,
        coherence: 0,
        qualityMaintenance: 0,
        policyAdherence: 0,
        empathy: 0,
        promptScores: [],
        scenarioCount: 0,
        contextExhausted: false,
      });
    });
    modelStats.sort((a, b) => b.overall - a.overall);
  }

  const getTrend = (scores: number[]): "up" | "down" | "stable" => {
    if (scores.length < 2) return "stable";
    const firstHalf = scores.slice(0, Math.ceil(scores.length / 2));
    const secondHalf = scores.slice(Math.ceil(scores.length / 2));
    const avg1 = firstHalf.reduce((a, b) => a + b, 0) / firstHalf.length;
    const avg2 = secondHalf.reduce((a, b) => a + b, 0) / secondHalf.length;
    if (avg2 - avg1 > 5) return "up";
    if (avg1 - avg2 > 5) return "down";
    return "stable";
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
            <MessageSquare size={12} className="text-violet-400" />
          </div>
          <span className="text-zinc-300 font-semibold text-sm">ModelSweep</span>
          <span className="text-[10px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 border border-violet-500/20 ml-1">
            Conversation
          </span>
        </div>
        <span className="text-zinc-600 text-xs">{run.suite_name}</span>
      </div>

      {/* Model scorecards */}
      <div className="space-y-3">
        <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider">Conversation Scorecard</div>
        {modelStats.map((model) => {
          const trend = getTrend(model.promptScores);
          return (
            <div key={model.name} className="bg-white/5 rounded-xl p-3 border border-white/[0.06]">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: model.color.hex }} />
                  <span className="text-zinc-300 text-xs font-medium truncate">{model.name}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <ScoreBadge score={model.overall} size="sm" />
                  <span className={cn(
                    "text-[9px] font-mono uppercase tracking-wider",
                    trend === "up" ? "text-emerald-400" :
                    trend === "down" ? "text-rose-400" : "text-zinc-600"
                  )}>
                    {trend === "up" ? "Improving" : trend === "down" ? "Declining" : "Stable"}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2">
                {[
                  { label: "Context", value: model.contextMemory },
                  { label: "Persona", value: model.personaStability },
                  { label: "Coherence", value: model.coherence },
                ].map((dim) => (
                  <div key={dim.label} className="text-center">
                    <div className="text-violet-400 text-sm font-mono tabular-nums">{dim.value}%</div>
                    <div className="text-zinc-600 text-[9px] font-mono uppercase tracking-wider">{dim.label}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Metadata */}
      {showMetadata && (
        <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-4">
            <span className="text-zinc-700 text-xs">{run.hardware.class?.replace(/_/g, " ")}</span>
            <span className="text-zinc-700 text-xs">{new Date(run.started_at).toLocaleDateString()}</span>
          </div>
          <span className="text-zinc-700 text-xs">modelsweep.dev</span>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function SharePage() {
  const { id } = useParams<{ id: string }>();
  const [run, setRun] = useState<TestRun | null>(null);
  const [prompts, setPrompts] = useState<SuitePrompt[]>([]);
  const [copied, setCopied] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  // Suite-type-specific results
  const [toolCallResults, setToolCallResults] = useState<ToolCallResult[]>([]);
  const [conversationResults, setConversationResults] = useState<ConversationResult[]>([]);
  const [adversarialResults, setAdversarialResults] = useState<AdversarialResult[]>([]);

  // Section toggles
  const [showVerdict, setShowVerdict] = useState(true);
  const [showModelScores, setShowModelScores] = useState(true);
  const [showCategoryBars, setShowCategoryBars] = useState(true);
  const [showJudgeVerdict, setShowJudgeVerdict] = useState(true);
  const [showPromptResponses, setShowPromptResponses] = useState(false);
  const [showJudgeDetails, setShowJudgeDetails] = useState(true);
  const [showAutoChecks, setShowAutoChecks] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);

  useEffect(() => {
    fetch(`/api/results/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.run) {
          setRun(d.run);
          const suiteType = d.run.suite_type || "standard";

          // Fetch suite prompts for standard suites
          if (suiteType === "standard") {
            fetch(`/api/suites/${d.run.suite_id}`)
              .then((r) => r.json())
              .then((sd) => setPrompts(sd.suite?.prompts || []))
              .catch(() => { });
          }

          // Fetch suite-type-specific results
          if (suiteType === "tool_calling") {
            fetch(`/api/results/${id}/tool-calls`)
              .then((r) => r.json())
              .then((td) => setToolCallResults(td.results || []))
              .catch(() => { });
          } else if (suiteType === "conversation") {
            fetch(`/api/results/${id}/conversations`)
              .then((r) => r.json())
              .then((cd) => setConversationResults(cd.results || []))
              .catch(() => { });
          } else if (suiteType === "adversarial") {
            fetch(`/api/results/${id}/adversarial`)
              .then((r) => r.json())
              .then((ad) => setAdversarialResults(ad.results || []))
              .catch(() => { });
          }
        }
      });
  }, [id]);

  const downloadImage = async () => {
    if (!cardRef.current) return;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: "#09090b",
      scale: 2,
      width: cardRef.current.scrollWidth,
      height: cardRef.current.scrollHeight,
    });
    const url = canvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `modelsweep-${id.slice(0, 8)}.png`;
    a.click();
  };

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href.replace("/share", ""));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!run) return <div className="p-8 text-zinc-500">Loading...</div>;

  const suiteType: SuiteType = run.suite_type || "standard";

  const activeModels = run.models.filter((m) => !m.skipped);
  const sortedModels = [...activeModels].sort((a, b) => b.overall_score - a.overall_score);
  const winner = sortedModels[0];
  const verdict = generateVerdict(activeModels.map((m) => ({
    name: m.model_name,
    overallScore: m.overall_score,
    avgTokensPerSec: m.avg_tokens_per_sec,
  })));

  // Judge winner computation
  const judgeWinCounts: Record<string, number> = {};
  for (const m of activeModels) {
    for (const pr of m.promptResults || []) {
      const js = pr.judgeScores || pr.judge_scores;
      if (js?.won) judgeWinCounts[m.model_name] = (judgeWinCounts[m.model_name] || 0) + 1;
    }
  }
  const judgeWinnerName = Object.entries(judgeWinCounts).sort(([, a], [, b]) => b - a)[0]?.[0];

  // Unique prompt IDs
  const allPromptIds = Array.from(new Set(activeModels.flatMap((m) => (m.promptResults || []).map((p) => p.prompt_id))));

  const tweetText = winner
    ? `Just tested ${activeModels.length} local LLMs with ModelSweep! ${winner.model_name} scored ${winner.overall_score}% — running fully local. No cloud, no API keys. #LocalLLM #Ollama`
    : "Just ran a model evaluation with ModelSweep! #LocalLLM #Ollama";

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link href={`/results/${id}`} className="flex items-center gap-1.5 text-zinc-500 text-xs hover:text-zinc-300 mb-4 transition-colors">
          <ChevronLeft size={13} />
          Back to results
        </Link>
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Share Results</h1>
        <p className="text-zinc-600 text-sm mt-1">Customize what to include, then download or share.</p>
      </motion.div>

      {/* Two column layout: options + preview */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT: Toggle options */}
        <motion.div
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          className="lg:col-span-1 space-y-1"
        >
          <div className="bg-zinc-950 border border-white/10 rounded-xl p-4">
            <h3 className="text-zinc-400 text-xs font-mono uppercase tracking-wider mb-3">Include in Share</h3>
            <div className="space-y-0.5 divide-y divide-white/[0.03]">
              {suiteType === "standard" && (<>
                <ToggleOption label="Verdict" description="Summary text of who won and why" checked={showVerdict} onChange={setShowVerdict} />
                <ToggleOption label="Model Scores" description="Score badges and speed for each model" checked={showModelScores} onChange={setShowModelScores} />
                <ToggleOption label="Category Bars" description="Per-category score breakdown" checked={showCategoryBars} onChange={setShowCategoryBars} />
                <ToggleOption label="Judge Verdict" description="Which model the judge preferred" checked={showJudgeVerdict} onChange={setShowJudgeVerdict} />
                <ToggleOption label="Prompt Responses" description="Full Q&A — model responses per prompt" checked={showPromptResponses} onChange={setShowPromptResponses} />
                <ToggleOption label="Judge Details" description="4-axis scores and reasoning per prompt" checked={showJudgeDetails} onChange={setShowJudgeDetails} />
                <ToggleOption label="Auto Checks" description="Gate checks and rubric results" checked={showAutoChecks} onChange={setShowAutoChecks} />
              </>)}
              {suiteType === "tool_calling" && (<>
                <ToggleOption label="Model Scores" description="Tool accuracy per model" checked={showModelScores} onChange={setShowModelScores} />
              </>)}
              {suiteType === "conversation" && (<>
                <ToggleOption label="Model Scores" description="Conversation quality per model" checked={showModelScores} onChange={setShowModelScores} />
              </>)}
              {suiteType === "adversarial" && (<>
                <ToggleOption label="Model Scores" description="Robustness report per model" checked={showModelScores} onChange={setShowModelScores} />
              </>)}
              <ToggleOption label="Metadata" description="Hardware, speed, token counts, timestamps" checked={showMetadata} onChange={setShowMetadata} />
            </div>
          </div>
        </motion.div>

        {/* RIGHT: Card preview */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="lg:col-span-2"
        >
          <div
            ref={cardRef}
            className="bg-zinc-950 border border-white/10 rounded-2xl p-6 space-y-5"
          >
            {/* Agentic card variants */}
            {suiteType === "tool_calling" && (
              <ToolCallingCard run={run} showMetadata={showMetadata} toolCallResults={toolCallResults} />
            )}
            {suiteType === "adversarial" && (
              <AdversarialCard run={run} showMetadata={showMetadata} adversarialResults={adversarialResults} />
            )}
            {suiteType === "conversation" && (
              <ConversationCard run={run} showMetadata={showMetadata} conversationResults={conversationResults} />
            )}

            {/* Standard card - original layout */}
            {suiteType === "standard" && (<>
            {/* Header */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-6 h-6 rounded-lg bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                  <span className="text-violet-400 text-xs font-bold">M</span>
                </div>
                <span className="text-zinc-300 font-semibold text-sm">ModelSweep</span>
              </div>
              <span className="text-zinc-600 text-xs">{run.suite_name}</span>
            </div>

            {/* Verdict */}
            {showVerdict && (
              <div>
                <p className="text-zinc-200 text-base font-medium leading-relaxed">{verdict}</p>
              </div>
            )}

            {/* Model scores */}
            {showModelScores && (
              <div className="grid grid-cols-2 gap-3">
                {sortedModels.map((model) => {
                  const color = getModelColor(model.model_name);
                  return (
                    <div
                      key={model.model_name}
                      className="bg-white/5 rounded-xl p-3 border border-white/[0.06]"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-2 h-2 rounded-full" style={{ background: color.hex }} />
                        <span className="text-zinc-300 text-xs font-medium truncate">{model.model_name}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <ScoreBadge score={model.overall_score} size="sm" />
                        <span className="text-zinc-600 text-xs font-mono">
                          {model.avg_tokens_per_sec.toFixed(1)} t/s
                        </span>
                      </div>
                      {model.parameter_size && (
                        <div className="text-zinc-700 text-[10px] font-mono mt-1">{model.parameter_size}</div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Category bars */}
            {showCategoryBars && winner && Object.keys(winner.categoryScores).length > 0 && (
              <div className="space-y-2">
                <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider">Category Scores — {winner.model_name}</div>
                {Object.entries(winner.categoryScores).map(([cat, score]) => {
                  const color = getModelColor(winner.model_name);
                  return (
                    <div key={cat} className="flex items-center gap-3">
                      <span className="text-zinc-600 text-xs w-20 capitalize">{cat}</span>
                      <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${score}%`, background: color.hex, opacity: 0.7 }}
                        />
                      </div>
                      <span className="text-zinc-400 text-xs font-mono w-8 text-right">{score}%</span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Judge verdict */}
            {showJudgeVerdict && run.judge_enabled && judgeWinnerName && (
              <div className="bg-violet-500/5 border border-violet-500/10 rounded-xl p-3">
                <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider mb-1">
                  Judge Verdict {run.judge_model && <span className="normal-case text-zinc-700">· {run.judge_model}</span>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-violet-300 text-sm font-semibold">{judgeWinnerName}</span>
                  <span className="text-zinc-600 text-xs">won {judgeWinCounts[judgeWinnerName]} prompt{judgeWinCounts[judgeWinnerName] !== 1 ? "s" : ""}</span>
                </div>
              </div>
            )}

            {/* Prompt Responses + Judge Details */}
            {(showPromptResponses || showJudgeDetails || showAutoChecks) && allPromptIds.length > 0 && (
              <div className="space-y-3 pt-2 border-t border-white/[0.06]">
                <div className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider">
                  Per-Prompt Breakdown
                </div>
                {allPromptIds.map((promptId) => {
                  const suitePrompt = prompts.find((p) => p.id === promptId);
                  return (
                    <div key={promptId} className="border border-white/[0.05] rounded-xl overflow-hidden">
                      {/* Prompt header */}
                      <div className="px-4 py-2.5 bg-white/[0.02]">
                        <p className="text-zinc-300 text-xs leading-relaxed">{suitePrompt?.text || promptId}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          {suitePrompt?.category && (
                            <span className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-white/5 text-zinc-500 border border-white/5">
                              {suitePrompt.category}
                            </span>
                          )}
                          {suitePrompt?.difficulty && suitePrompt.difficulty !== "medium" && (
                            <span className={cn(
                              "text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border",
                              suitePrompt.difficulty === "easy" ? "text-emerald-500 bg-emerald-500/10 border-emerald-500/20" :
                                "text-red-400 bg-red-500/10 border-red-500/20"
                            )}>
                              {suitePrompt.difficulty}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Per-model results */}
                      <div className="divide-y divide-white/[0.04]">
                        {activeModels.map((m) => {
                          const pr = (m.promptResults || []).find((p) => p.prompt_id === promptId);
                          if (!pr) return null;
                          const js = pr.judgeScores || pr.judge_scores;
                          const autoScores = (pr.auto_scores || {}) as Record<string, unknown>;
                          // eslint-disable-next-line @typescript-eslint/no-unused-vars
                          const _gatePass = autoScores.gatePass !== false;
                          const gateFlag = (autoScores.gateFlag as string) || null;
                          const warnings = (autoScores.warnings as string[]) || [];
                          const rubricResults = (autoScores.rubricResults as Array<{ type: string; label: string; passed?: boolean }>) || null;
                          const compositeScore = js?.score ?? (autoScores.rubricScore as number | undefined) ?? null;

                          return (
                            <div key={m.model_name} className="px-4 py-3 space-y-2">
                              {/* Model name + score */}
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div className="w-2 h-2 rounded-full" style={{ background: getModelColor(m.model_name).hex }} />
                                  <span className="text-zinc-400 text-xs font-medium">{m.model_name}</span>
                                </div>
                                {compositeScore !== null && <ScoreBadge score={compositeScore} size="sm" />}
                              </div>

                              {/* Response text */}
                              {showPromptResponses && (
                                <div className="text-zinc-500 text-xs leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto bg-white/[0.02] rounded-lg p-2.5">
                                  {pr.timed_out ? (
                                    <span className="italic text-zinc-600">Response timed out</span>
                                  ) : (
                                    pr.response || "No response"
                                  )}
                                </div>
                              )}

                              {/* Auto checks */}
                              {showAutoChecks && !pr.timed_out && (
                                <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[10px]">
                                  <span className={gateFlag === "REFUSED" ? "text-red-400" : "text-emerald-600"}>
                                    {gateFlag === "REFUSED" ? "✗ Refused" : "✓ No refusal"}
                                  </span>
                                  <span className={gateFlag === "REPETITION_LOOP" ? "text-red-400" : "text-emerald-600"}>
                                    {gateFlag === "REPETITION_LOOP" ? "✗ Repetition" : "✓ No repetition"}
                                  </span>
                                  {warnings.includes("TRUNCATED") && (
                                    <span className="text-amber-500">⚠ Truncated</span>
                                  )}
                                  {rubricResults && rubricResults.length > 0 && rubricResults.map((r, i) => (
                                    r.type !== "unstructured" && (
                                      <span key={i} className={r.passed ? "text-emerald-600" : "text-red-400"}>
                                        {r.passed ? "✓" : "✗"} {r.label}
                                      </span>
                                    )
                                  ))}
                                </div>
                              )}

                              {/* Judge details */}
                              {showJudgeDetails && js && (
                                <div className="flex items-center gap-3 text-xs">
                                  {js.accuracy !== undefined && (
                                    <div className="flex items-center gap-1.5 text-zinc-600">
                                      <span>ACC:{js.accuracy}</span>
                                      <span>HLP:{js.helpfulness}</span>
                                      <span>CLR:{js.clarity}</span>
                                      <span>INS:{js.instructionFollowing}</span>
                                    </div>
                                  )}
                                  {js.won && <span className="text-violet-400 text-[10px]">👑 Winner</span>}
                                  {js.reasoning && (
                                    <span className="text-zinc-700 text-[10px] italic truncate flex-1">&ldquo;{js.reasoning}&rdquo;</span>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Metadata */}
            {showMetadata && (
              <div className="flex items-center justify-between pt-2 border-t border-white/[0.06]">
                <div className="flex items-center gap-4">
                  <span className="text-zinc-700 text-xs">{run.hardware.class?.replace(/_/g, " ")}</span>
                  <span className="text-zinc-700 text-xs">{new Date(run.started_at).toLocaleDateString()}</span>
                  {run.judge_model && <span className="text-zinc-700 text-xs">Judge: {run.judge_model}</span>}
                </div>
                <span className="text-zinc-700 text-xs">modelsweep.dev</span>
              </div>
            )}
            </>)}
          </div>
        </motion.div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-3">
        <Button variant="primary" onClick={downloadImage}>
          <Download size={14} />
          Download Image
        </Button>
        <Button variant="secondary" onClick={copyLink}>
          <Link2 size={14} />
          {copied ? "Copied!" : "Copy Link"}
        </Button>
        <a
          href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <Button variant="secondary">
            Share on X
          </Button>
        </a>
      </div>
    </div>
  );
}
