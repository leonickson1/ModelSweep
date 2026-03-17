"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Brain,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Bot,
  Gauge,
} from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { ScoreBar } from "@/components/ui/score-badge";
import { ModelColorDot } from "@/components/ui/model-badge";
import { getModelColor } from "@/lib/model-colors";
import { cn } from "@/lib/utils";

// ─── Data Interfaces ────────────────────────────────────────────────────────

export interface ConversationDimensions {
  contextRetention: number;      // 0-100
  personaConsistency: number;    // 0-100
  factualConsistency: number;    // 0-100
  qualityMaintenance: number;    // 0-100
  policyAdherence: number;       // 0-100
  empathy: number;               // 0-100
}

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
  turnNumber: number;
  qualityScore?: number;  // 0-100 for assistant turns
  tokensPerSec?: number;
  ttft?: number;
}

export interface ConversationScenarioResult {
  scenarioId: string;
  scenarioName: string;
  turns: ConversationTurn[];
  overallScore: number;
  dimensions: ConversationDimensions;
  contextWindowUsed: number;   // 0-1 fraction
  qualitySlope: number;        // positive = stable/improving, negative = degrading
  contextExhausted: boolean;
}

export interface QualityOverTurnsPoint {
  turn: number;
  quality: number;
}

export interface ConversationResultData {
  model: string;
  scenarios: ConversationScenarioResult[];
  overallDimensions: ConversationDimensions;
  overallScore: number;
  qualityOverTurns: QualityOverTurnsPoint[];
  avgQualitySlope: number;
}

interface ConversationResultsProps {
  results: ConversationResultData[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const DIMENSION_LABELS: { key: keyof ConversationDimensions; label: string }[] = [
  { key: "contextRetention", label: "Context Retention" },
  { key: "personaConsistency", label: "Persona Consistency" },
  { key: "factualConsistency", label: "Factual Consistency" },
  { key: "qualityMaintenance", label: "Quality Maintenance" },
  { key: "policyAdherence", label: "Policy Adherence" },
  { key: "empathy", label: "Empathy" },
];

function SlopeIndicator({ slope, className }: { slope: number; className?: string }) {
  if (slope > 0.5) {
    return (
      <div className={cn("flex items-center gap-1 text-emerald-400", className)}>
        <TrendingUp className="w-3.5 h-3.5" />
        <span className="text-xs font-mono tabular-nums">+{slope.toFixed(1)}</span>
      </div>
    );
  }
  if (slope < -0.5) {
    return (
      <div className={cn("flex items-center gap-1 text-red-400", className)}>
        <TrendingDown className="w-3.5 h-3.5" />
        <span className="text-xs font-mono tabular-nums">{slope.toFixed(1)}</span>
      </div>
    );
  }
  return (
    <div className={cn("flex items-center gap-1 text-zinc-500", className)}>
      <Minus className="w-3.5 h-3.5" />
      <span className="text-xs font-mono tabular-nums">Stable</span>
    </div>
  );
}

function ContextUsageBar({ usage, exhausted }: { usage: number; exhausted: boolean }) {
  const pct = Math.round(usage * 100);
  return (
    <div className="flex items-center gap-2">
      <div className="w-20 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-700 ease-out",
            exhausted ? "bg-red-500" : pct > 80 ? "bg-amber-500" : "bg-zinc-500"
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs font-mono tabular-nums",
          exhausted ? "text-red-400" : "text-zinc-500"
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ConversationResults({ results }: ConversationResultsProps) {
  const [expandedTranscripts, setExpandedTranscripts] = useState<Set<string>>(new Set());

  const toggleTranscript = (key: string) => {
    setExpandedTranscripts((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* ── CONVERSATION SCORECARD ── */}
      <GlowCard delay={0}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Brain className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Conversation Scorecard
            </h3>
          </div>

          <div className="space-y-6">
            {results.map((r, mi) => {
              const color = getModelColor(r.model);
              return (
                <motion.div
                  key={r.model}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: mi * 0.08, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div className="flex items-center gap-2 mb-3">
                    <ModelColorDot name={r.model} />
                    <span className="text-sm font-medium text-zinc-200 truncate">
                      {r.model}
                    </span>
                    <span className="ml-auto text-xs font-mono tabular-nums text-zinc-400">
                      Overall: {r.overallScore}%
                    </span>
                    <SlopeIndicator slope={r.avgQualitySlope} />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                    {DIMENSION_LABELS.map(({ key, label }) => (
                      <ScoreBar
                        key={key}
                        score={r.overallDimensions[key]}
                        label={label}
                        color={color.hex}
                      />
                    ))}
                  </div>
                  {mi < results.length - 1 && (
                    <div className="mt-4 border-b border-white/[0.04]" />
                  )}
                </motion.div>
              );
            })}
          </div>
        </div>
      </GlowCard>

      {/* ── QUALITY OVER TURNS ── */}
      <GlowCard delay={0.1}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Gauge className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Quality Over Turns
            </h3>
          </div>

          {/* Inline mini-chart: one row per model showing quality dots per turn */}
          <div className="space-y-4">
            {results.map((r, mi) => {
              const color = getModelColor(r.model);
              const maxTurn = Math.max(...r.qualityOverTurns.map((p) => p.turn), 1);
              return (
                <motion.div
                  key={r.model}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: mi * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <ModelColorDot name={r.model} size={6} />
                    <span className="text-xs text-zinc-400 truncate">{r.model}</span>
                    <SlopeIndicator slope={r.avgQualitySlope} className="ml-auto" />
                  </div>
                  <div className="relative h-10 bg-white/[0.02] rounded-lg border border-white/[0.04] overflow-hidden">
                    {/* Quality line rendered as positioned dots */}
                    <svg className="w-full h-full" preserveAspectRatio="none" viewBox={`0 0 ${maxTurn + 1} 100`}>
                      {r.qualityOverTurns.length > 1 && (
                        <polyline
                          fill="none"
                          stroke={color.hex}
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                          points={r.qualityOverTurns
                            .map((p) => `${p.turn},${100 - p.quality}`)
                            .join(" ")}
                        />
                      )}
                      {r.qualityOverTurns.map((p) => (
                        <circle
                          key={p.turn}
                          cx={p.turn}
                          cy={100 - p.quality}
                          r="3"
                          fill={color.hex}
                          vectorEffect="non-scaling-stroke"
                        />
                      ))}
                    </svg>
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-zinc-600 font-mono">Turn 1</span>
                    <span className="text-[10px] text-zinc-600 font-mono">Turn {maxTurn}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </GlowCard>

      {/* ── FULL TRANSCRIPTS ── */}
      <GlowCard delay={0.2}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <MessageSquare className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Full Transcripts
            </h3>
          </div>

          <div className="space-y-2">
            {results.map((r) =>
              r.scenarios.map((scenario) => {
                const key = `${r.model}::${scenario.scenarioId}`;
                const isExpanded = expandedTranscripts.has(key);
                const color = getModelColor(r.model);

                return (
                  <div key={key}>
                    <button
                      onClick={() => toggleTranscript(key)}
                      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                      )}
                      <ModelColorDot name={r.model} />
                      <span className="text-sm text-zinc-300 font-medium truncate">
                        {r.model}
                      </span>
                      <span className="text-xs text-zinc-500 truncate">
                        {scenario.scenarioName}
                      </span>
                      <div className="ml-auto flex items-center gap-3">
                        <ContextUsageBar
                          usage={scenario.contextWindowUsed}
                          exhausted={scenario.contextExhausted}
                        />
                        <SlopeIndicator slope={scenario.qualitySlope} />
                        <span className="text-xs font-mono tabular-nums text-zinc-400">
                          {scenario.overallScore}%
                        </span>
                      </div>
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="pl-9 pr-3 pb-4 space-y-2">
                            {/* Dimension bars for this scenario */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-1.5 mb-4 py-3 px-4 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                              {DIMENSION_LABELS.map(({ key, label }) => (
                                <ScoreBar
                                  key={key}
                                  score={scenario.dimensions[key]}
                                  label={label}
                                  color={color.hex}
                                />
                              ))}
                            </div>

                            {/* Turns */}
                            {scenario.turns.map((turn) => (
                              <div
                                key={`${turn.role}-${turn.turnNumber}`}
                                className={cn(
                                  "flex gap-3 py-3 px-4 rounded-lg border",
                                  turn.role === "user"
                                    ? "bg-white/[0.02] border-white/[0.04]"
                                    : "bg-white/[0.04] border-white/[0.06]"
                                )}
                              >
                                <div className="flex-shrink-0 mt-0.5">
                                  {turn.role === "user" ? (
                                    <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center">
                                      <User className="w-3.5 h-3.5 text-zinc-400" />
                                    </div>
                                  ) : (
                                    <div
                                      className="w-6 h-6 rounded-md flex items-center justify-center"
                                      style={{ background: `${color.hex}20` }}
                                    >
                                      <Bot className="w-3.5 h-3.5" style={{ color: color.hex }} />
                                    </div>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="text-xs text-zinc-500 uppercase tracking-wider">
                                      {turn.role === "user" ? "User" : "Assistant"} &middot; Turn{" "}
                                      {turn.turnNumber}
                                    </span>
                                    {turn.role === "assistant" && turn.qualityScore != null && (
                                      <span
                                        className={cn(
                                          "text-xs font-mono tabular-nums",
                                          turn.qualityScore >= 80
                                            ? "text-emerald-400"
                                            : turn.qualityScore >= 60
                                              ? "text-amber-400"
                                              : "text-red-400"
                                        )}
                                      >
                                        Q:{turn.qualityScore}
                                      </span>
                                    )}
                                    {turn.role === "assistant" && turn.tokensPerSec != null && (
                                      <span className="text-[10px] text-zinc-600 font-mono">
                                        {turn.tokensPerSec.toFixed(1)} tok/s
                                      </span>
                                    )}
                                  </div>
                                  <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                    {turn.content}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </GlowCard>
    </div>
  );
}
