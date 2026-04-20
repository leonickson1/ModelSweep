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
import { ScoreBadge } from "@/components/ui/score-badge";
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
          <h3 className="text-[18px] font-semibold text-white/90 tracking-tight mb-6">Robustness Scorecard</h3>

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
                    <td className="py-3 px-3 text-right">
                      <ScoreBadge score={r.robustnessPct} size="sm" />
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
          <h3 className="text-[18px] font-semibold text-white/90 tracking-tight mb-6">Breach Timeline</h3>

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

      {/* Breach Details merged into the page's Scenario Drill-Down */}
    </div>
  );
}
