"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  Shield,
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  Eye,
  Swords,
} from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { ScoreBadge, ScoreBar } from "@/components/ui/score-badge";
import { ModelColorDot } from "@/components/ui/model-badge";
import { getModelColor } from "@/lib/model-colors";
import { cn } from "@/lib/utils";
import type { BreachSeverity } from "@/types";

// ─── Data Interfaces ────────────────────────────────────────────────────────

export interface BreachDetail {
  id: string;
  turn: number;
  type: "prompt_leak" | "data_leak" | "policy_violation";
  severity: BreachSeverity;
  attackMessage: string;
  modelResponse: string;
  evidence: string;
  description: string;
}

export interface AdversarialScenarioResult {
  scenarioId: string;
  scenarioName: string;
  attackStrategy: string;
  robustnessScore: number;
  survived: boolean;
  turnsToFirstBreach: number | null;
  maxTurns: number;
  breaches: BreachDetail[];
  defenseQuality: number;
  helpfulnessUnderPressure: number;
  consistencyUnderPressure: number;
}

export interface BreachTimelinePoint {
  turn: number;
  breachDetected: boolean;
  severity: BreachSeverity | null;
}

export interface AdversarialResultData {
  model: string;
  robustnessPct: number;
  totalBreaches: number;
  survivedScenarios: number;
  totalScenarios: number;
  avgSurvivedUntil: number;
  scenarios: AdversarialScenarioResult[];
  breachTimeline: BreachTimelinePoint[];
}

interface AdversarialResultsProps {
  results: AdversarialResultData[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function severityColor(severity: BreachSeverity): {
  bg: string;
  text: string;
  border: string;
  dot: string;
} {
  switch (severity) {
    case "critical":
      return {
        bg: "bg-red-500/10",
        text: "text-red-400",
        border: "border-red-500/20",
        dot: "bg-red-500",
      };
    case "medium":
      return {
        bg: "bg-amber-500/10",
        text: "text-amber-400",
        border: "border-amber-500/20",
        dot: "bg-amber-500",
      };
    case "low":
      return {
        bg: "bg-yellow-500/10",
        text: "text-yellow-400",
        border: "border-yellow-500/20",
        dot: "bg-yellow-500",
      };
  }
}

function breachTypeLabel(type: string): string {
  switch (type) {
    case "prompt_leak":
      return "Prompt Leak";
    case "data_leak":
      return "Data Leak";
    case "policy_violation":
      return "Policy Violation";
    default:
      return type;
  }
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AdversarialResults({ results }: AdversarialResultsProps) {
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());
  const [expandedBreaches, setExpandedBreaches] = useState<Set<string>>(new Set());

  const toggleScenario = (key: string) => {
    setExpandedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const toggleBreach = (key: string) => {
    setExpandedBreaches((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="space-y-8">
      {/* ── ROBUSTNESS SCORECARD ── */}
      <GlowCard delay={0}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Shield className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Robustness Scorecard
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/[0.06]">
                  <th className="text-left text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 pr-4">
                    Model
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 px-3">
                    Robustness
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 px-3">
                    Breaches
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 px-3">
                    Survived
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 pl-3">
                    Avg Survived Until
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => (
                  <motion.tr
                    key={r.model}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
                    className="border-b border-white/[0.04] last:border-0"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex items-center gap-2">
                        <ModelColorDot name={r.model} />
                        <span className="text-zinc-200 font-medium truncate max-w-[180px]">
                          {r.model}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-col items-end gap-1">
                        <ScoreBadge score={r.robustnessPct} size="sm" />
                        <div className="w-20 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all duration-700 ease-out"
                            style={{
                              width: `${r.robustnessPct}%`,
                              background:
                                r.robustnessPct >= 80
                                  ? "#10b981"
                                  : r.robustnessPct >= 60
                                    ? "#eab308"
                                    : "#ef4444",
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span
                        className={cn(
                          "font-mono tabular-nums text-sm",
                          r.totalBreaches === 0
                            ? "text-emerald-400"
                            : r.totalBreaches <= 2
                              ? "text-amber-400"
                              : "text-red-400"
                        )}
                      >
                        {r.totalBreaches}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-right">
                      <span className="font-mono tabular-nums text-sm text-zinc-300">
                        {r.survivedScenarios}/{r.totalScenarios}
                      </span>
                    </td>
                    <td className="py-3 pl-3 text-right">
                      <span className="font-mono tabular-nums text-sm text-zinc-400">
                        Turn {Math.round(r.avgSurvivedUntil)}
                      </span>
                    </td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </GlowCard>

      {/* ── BREACH TIMELINE ── */}
      <GlowCard delay={0.1}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Swords className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Breach Timeline
            </h3>
          </div>

          <div className="space-y-4">
            {results.map((r, mi) => {
              const maxTurn = Math.max(...r.breachTimeline.map((p) => p.turn), 1);
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
                    <span className="ml-auto text-xs font-mono tabular-nums text-zinc-500">
                      {r.totalBreaches} breach{r.totalBreaches !== 1 ? "es" : ""}
                    </span>
                  </div>
                  <div className="relative h-8 bg-white/[0.02] rounded-lg border border-white/[0.04] overflow-hidden">
                    {/* Timeline track */}
                    <div className="absolute inset-y-0 left-0 right-0 flex items-center px-2">
                      <div className="w-full h-px bg-white/[0.06]" />
                    </div>
                    {/* Breach markers */}
                    {r.breachTimeline
                      .filter((p) => p.breachDetected)
                      .map((p) => {
                        const leftPct = maxTurn > 0 ? (p.turn / maxTurn) * 100 : 0;
                        const sev = p.severity ?? "low";
                        const sevColors = severityColor(sev);
                        return (
                          <div
                            key={p.turn}
                            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                            style={{ left: `${Math.max(4, Math.min(96, leftPct))}%` }}
                          >
                            <div
                              className={cn(
                                "w-3 h-3 rounded-full border-2 border-[#030303]",
                                sevColors.dot
                              )}
                            />
                          </div>
                        );
                      })}
                    {/* Survived marker (green dot at end) if no breaches */}
                    {r.totalBreaches === 0 && (
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                        style={{ left: "96%" }}
                      >
                        <div className="w-3 h-3 rounded-full border-2 border-[#030303] bg-emerald-500" />
                      </div>
                    )}
                  </div>
                  <div className="flex justify-between mt-1">
                    <span className="text-[10px] text-zinc-600 font-mono">Turn 1</span>
                    <span className="text-[10px] text-zinc-600 font-mono">Turn {maxTurn}</span>
                  </div>
                </motion.div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center gap-4 mt-4 pt-4 border-t border-white/[0.04]">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] text-zinc-500">Survived</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-500" />
              <span className="text-[10px] text-zinc-500">Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-amber-500" />
              <span className="text-[10px] text-zinc-500">Medium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-[10px] text-zinc-500">Critical</span>
            </div>
          </div>
        </div>
      </GlowCard>

      {/* ── BREACH DETAILS ── */}
      <GlowCard delay={0.2}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Eye className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Breach Details
            </h3>
          </div>

          <div className="space-y-2">
            {results.map((r) =>
              r.scenarios.map((scenario) => {
                const scenarioKey = `${r.model}::${scenario.scenarioId}`;
                const isScenarioExpanded = expandedScenarios.has(scenarioKey);
                const color = getModelColor(r.model);

                return (
                  <div key={scenarioKey}>
                    <button
                      onClick={() => toggleScenario(scenarioKey)}
                      className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors text-left"
                    >
                      {isScenarioExpanded ? (
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
                      <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
                        {scenario.attackStrategy}
                      </span>
                      <div className="ml-auto flex items-center gap-3">
                        {scenario.survived ? (
                          <div className="flex items-center gap-1">
                            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                            <span className="text-xs text-emerald-400">Survived</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <ShieldAlert className="w-3.5 h-3.5 text-amber-500" />
                            <span className="text-xs text-amber-400">Breached</span>
                          </div>
                        )}
                        <ScoreBadge score={scenario.robustnessScore} size="sm" />
                      </div>
                    </button>

                    <AnimatePresence>
                      {isScenarioExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.25, 0.1, 0.25, 1] }}
                          className="overflow-hidden"
                        >
                          <div className="pl-9 pr-3 pb-4 space-y-3">
                            {/* Scenario metrics */}
                            <div className="grid grid-cols-3 gap-3 py-3 px-4 bg-white/[0.02] rounded-lg border border-white/[0.04]">
                              <ScoreBar
                                score={Math.round((scenario.defenseQuality / 5) * 100)}
                                label="Defense Quality"
                                color={color.hex}
                              />
                              <ScoreBar
                                score={Math.round(
                                  (scenario.helpfulnessUnderPressure / 5) * 100
                                )}
                                label="Helpful Under Pressure"
                                color={color.hex}
                              />
                              <ScoreBar
                                score={Math.round(
                                  (scenario.consistencyUnderPressure / 5) * 100
                                )}
                                label="Consistency"
                                color={color.hex}
                              />
                            </div>

                            {scenario.turnsToFirstBreach != null && (
                              <div className="flex items-center gap-2 text-xs text-zinc-500 px-1">
                                <AlertTriangle className="w-3 h-3 text-amber-400" />
                                <span>
                                  First breach at turn{" "}
                                  <span className="font-mono tabular-nums text-amber-400">
                                    {scenario.turnsToFirstBreach}
                                  </span>{" "}
                                  of {scenario.maxTurns}
                                </span>
                              </div>
                            )}

                            {/* Individual breaches */}
                            {scenario.breaches.length === 0 ? (
                              <div className="flex items-center gap-2 py-3 px-4 bg-emerald-500/5 rounded-lg border border-emerald-500/10">
                                <ShieldCheck className="w-4 h-4 text-emerald-500" />
                                <span className="text-sm text-emerald-400">
                                  No breaches detected. Model successfully resisted all{" "}
                                  {scenario.maxTurns} attack turns.
                                </span>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {scenario.breaches.map((breach) => {
                                  const breachKey = `${scenarioKey}::${breach.id}`;
                                  const isBreachExpanded = expandedBreaches.has(breachKey);
                                  const sev = severityColor(breach.severity);

                                  return (
                                    <div key={breachKey}>
                                      <button
                                        onClick={() => toggleBreach(breachKey)}
                                        className={cn(
                                          "w-full flex items-center gap-3 py-2.5 px-4 rounded-lg border transition-colors text-left",
                                          sev.bg,
                                          sev.border,
                                          "hover:bg-white/[0.04]"
                                        )}
                                      >
                                        {isBreachExpanded ? (
                                          <ChevronDown className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                        ) : (
                                          <ChevronRight className="w-3 h-3 text-zinc-500 flex-shrink-0" />
                                        )}
                                        <span
                                          className={cn(
                                            "w-2 h-2 rounded-full flex-shrink-0",
                                            sev.dot
                                          )}
                                        />
                                        <span
                                          className={cn(
                                            "text-xs font-medium uppercase tracking-wider",
                                            sev.text
                                          )}
                                        >
                                          {breach.severity}
                                        </span>
                                        <span className="text-sm text-zinc-300 truncate flex-1">
                                          {breachTypeLabel(breach.type)}
                                        </span>
                                        <span className="text-xs font-mono tabular-nums text-zinc-500">
                                          Turn {breach.turn}
                                        </span>
                                      </button>

                                      <AnimatePresence>
                                        {isBreachExpanded && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: "auto", opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            transition={{
                                              duration: 0.2,
                                              ease: [0.25, 0.1, 0.25, 1],
                                            }}
                                            className="overflow-hidden"
                                          >
                                            <div className="ml-5 mt-2 mb-3 space-y-3">
                                              <p className="text-sm text-zinc-400 leading-relaxed px-4">
                                                {breach.description}
                                              </p>

                                              <div className="px-4">
                                                <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">
                                                  Attack Message
                                                </span>
                                                <div className="p-3 bg-red-500/5 border border-red-500/10 rounded-lg">
                                                  <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                                    {breach.attackMessage}
                                                  </p>
                                                </div>
                                              </div>

                                              <div className="px-4">
                                                <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">
                                                  Model Response
                                                </span>
                                                <div className="p-3 bg-white/[0.02] border border-white/[0.06] rounded-lg">
                                                  <p className="text-sm text-zinc-300 whitespace-pre-wrap leading-relaxed">
                                                    {breach.modelResponse}
                                                  </p>
                                                </div>
                                              </div>

                                              <div className="px-4">
                                                <span className="text-[10px] text-zinc-600 uppercase tracking-widest block mb-1">
                                                  Evidence
                                                </span>
                                                <div
                                                  className={cn(
                                                    "p-3 rounded-lg border",
                                                    sev.bg,
                                                    sev.border
                                                  )}
                                                >
                                                  <p
                                                    className={cn(
                                                      "text-sm font-mono leading-relaxed",
                                                      sev.text
                                                    )}
                                                  >
                                                    {breach.evidence}
                                                  </p>
                                                </div>
                                              </div>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
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
