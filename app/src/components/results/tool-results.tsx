"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Wrench,
  ShieldAlert,
  Shield,
  Bug,
  Check,
  X,
  MessageSquareOff,
  FileWarning,
} from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
import { ScoreBadge, ScoreBar } from "@/components/ui/score-badge";
import { ModelColorDot } from "@/components/ui/model-badge";

import { cn } from "@/lib/utils";

// ─── Data Interfaces ────────────────────────────────────────────────────────

export interface ExpectedParamDetail {
  matchType: string; // "exact" | "contains" | "any_value" | "type_check"
  value?: string;
  expectedType?: string;
}

export interface ExpectedToolCallDetail {
  toolName: string;
  expectedParams?: Record<string, ExpectedParamDetail>;
}

export interface ActualToolCallDetail {
  functionName: string;
  arguments: Record<string, unknown>;
  rawArguments?: unknown;
  jsonMalformed?: boolean;
}

export interface ToolScenarioResult {
  scenarioId: string;
  scenarioName: string;
  category: string;
  passed: boolean;
  toolSelectionScore: number;
  paramAccuracyScore: number;
  restraintScore: number;
  overallScore: number;
  hallucinatedTool: boolean;
  calledWhenShouldNot: boolean;
  missingRequiredParam: boolean;
  jsonMalformed: boolean;
  // Expected vs Actual data
  expectedToolCalls?: ExpectedToolCallDetail[];
  shouldCallTool?: boolean;
  actualToolCalls?: ActualToolCallDetail[];
  textResponse?: string;
}

export interface ToolCallModelResult {
  model: string;
  selectPct: number;
  paramsPct: number;
  restraintPct: number;
  multiPct: number;
  overallPct: number;
  scenarios: ToolScenarioResult[];
}

export interface FailurePattern {
  type: "hallucinated_tool" | "eager_invocation" | "param_pollution" | "json_malformed" | "missing_param";
  label: string;
  description: string;
  count: number;
  affectedModels: string[];
}

export interface ToolCallResultData {
  model: string;
  selectPct: number;
  paramsPct: number;
  restraintPct: number;
  multiPct: number;
  overallPct: number;
  scenarios: ToolScenarioResult[];
  failurePatterns: FailurePattern[];
}

interface ToolResultsProps {
  results: ToolCallResultData[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function scoreColor(score: number): string {
  if (score >= 80) return "#10b981";
  if (score >= 60) return "#eab308";
  return "#ef4444";
}

function scoreTextClass(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  return "text-red-400";
}

const FAILURE_ICONS: Record<string, typeof AlertTriangle> = {
  hallucinated_tool: Bug,
  eager_invocation: ShieldAlert,
  param_pollution: AlertTriangle,
  json_malformed: XCircle,
  missing_param: AlertTriangle,
};

function matchTypeLabel(mt: string): string {
  switch (mt) {
    case "exact": return "exact";
    case "contains": return "contains";
    case "any_value": return "any_value";
    case "type_check": return "type_check";
    default: return mt;
  }
}

/** Check if an actual param value satisfies an expected param constraint */
function paramMatches(
  expected: ExpectedParamDetail,
  actualValue: unknown
): boolean {
  if (actualValue === undefined || actualValue === null) return false;
  const strVal = String(actualValue);
  switch (expected.matchType) {
    case "exact":
      return strVal === (expected.value ?? "");
    case "contains":
      return strVal.toLowerCase().includes((expected.value ?? "").toLowerCase());
    case "any_value":
      return true;
    case "type_check":
      if (expected.expectedType === "string") return typeof actualValue === "string";
      if (expected.expectedType === "number") return typeof actualValue === "number";
      if (expected.expectedType === "boolean") return typeof actualValue === "boolean";
      if (expected.expectedType === "array") return Array.isArray(actualValue);
      return true;
    default:
      return true;
  }
}

/** Check if a tool name exists in expected list */
function isExpectedTool(expected: ExpectedToolCallDetail[], toolName: string): boolean {
  return expected.some((e) => e.toolName === toolName);
}

// ─── Expected vs Actual Comparison ──────────────────────────────────────────

function ToolComparison({
  ms,
}: {
  ms: ToolScenarioResult;
}) {
  const expected = ms.expectedToolCalls ?? [];
  const actual = ms.actualToolCalls ?? [];
  const shouldCall = ms.shouldCallTool !== false;
  const textResp = ms.textResponse ?? "";

  // Case: Should not have called any tool
  if (!shouldCall) {
    const calledAnyTool = actual.length > 0;
    return (
      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          {/* Expected */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Expected
            </div>
            <div className="flex items-center gap-2">
              <MessageSquareOff className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs text-zinc-300">No tool call (text response only)</span>
            </div>
          </div>
          {/* Actual */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Actual
            </div>
            {calledAnyTool ? (
              <div className="space-y-1.5">
                {actual.map((a, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <X className="w-3 h-3 text-red-400 flex-shrink-0" />
                    <span className="text-xs font-mono text-red-300">{a.functionName}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium uppercase tracking-wider">
                      Eager
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
                <span className="text-xs text-emerald-300">No tool called</span>
              </div>
            )}
          </div>
        </div>
        {/* Show truncated text response if available */}
        {textResp && (
          <TextResponsePreview text={textResp} />
        )}
      </div>
    );
  }

  // Case: No tool was called but should have been
  if (actual.length === 0 && expected.length > 0) {
    return (
      <div className="mt-3 space-y-2">
        <div className="grid grid-cols-2 gap-3">
          {/* Expected */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Expected
            </div>
            <div className="space-y-2">
              {expected.map((e, i) => (
                <ExpectedToolBlock key={i} expected={e} />
              ))}
            </div>
          </div>
          {/* Actual */}
          <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-3">
            <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
              Actual
            </div>
            <div className="flex items-center gap-2 py-1">
              <X className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />
              <span className="text-xs text-red-300">No tool called</span>
            </div>
            {textResp && (
              <TextResponsePreview text={textResp} />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Normal case: expected and actual tool calls to compare
  // Build pairs of expected -> actual for comparison
  const pairs: { expected: ExpectedToolCallDetail | null; actual: ActualToolCallDetail | null }[] = [];
  const matchedActualIndices = new Set<number>();

  for (const exp of expected) {
    const matchIdx = actual.findIndex((a, i) => !matchedActualIndices.has(i) && a.functionName === exp.toolName);
    if (matchIdx >= 0) {
      matchedActualIndices.add(matchIdx);
      pairs.push({ expected: exp, actual: actual[matchIdx] });
    } else {
      pairs.push({ expected: exp, actual: null });
    }
  }
  // Add any unmatched actual calls (hallucinated or extra)
  actual.forEach((a, i) => {
    if (!matchedActualIndices.has(i)) {
      pairs.push({ expected: null, actual: a });
    }
  });

  return (
    <div className="mt-3 space-y-2">
      <div className="grid grid-cols-2 gap-3">
        {/* Expected Column */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Expected
          </div>
          <div className="space-y-3">
            {pairs.map((pair, i) => {
              if (pair.expected) {
                return <ExpectedToolBlock key={i} expected={pair.expected} />;
              }
              // Hallucinated tool - show placeholder on expected side
              return (
                <div key={i} className="py-1">
                  <span className="text-xs text-zinc-600 italic">-- not expected --</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Actual Column */}
        <div className="bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-3">
          <div className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500 mb-2">
            Actual
          </div>
          <div className="space-y-3">
            {pairs.map((pair, i) => {
              if (!pair.actual) {
                // Expected but not called
                return (
                  <div key={i} className="py-1">
                    <div className="flex items-center gap-2">
                      <X className="w-3 h-3 text-red-400 flex-shrink-0" />
                      <span className="text-xs text-red-300">Not called</span>
                    </div>
                  </div>
                );
              }
              return (
                <ActualToolBlock
                  key={i}
                  actual={pair.actual}
                  expected={pair.expected}
                  allExpected={expected}
                />
              );
            })}
          </div>
        </div>
      </div>
      {/* Show text response if the model also produced text */}
      {textResp && actual.length === 0 && (
        <TextResponsePreview text={textResp} />
      )}
    </div>
  );
}

function ExpectedToolBlock({ expected }: { expected: ExpectedToolCallDetail }) {
  const params = expected.expectedParams ?? {};
  const paramEntries = Object.entries(params);

  return (
    <div>
      <div className="flex items-center gap-2">
        <Wrench className="w-3 h-3 text-zinc-400 flex-shrink-0" />
        <span className="text-xs font-mono text-zinc-200">{expected.toolName}</span>
      </div>
      {paramEntries.length > 0 && (
        <div className="mt-1.5 ml-5 space-y-1">
          {paramEntries.map(([name, spec]) => (
            <div key={name} className="flex items-center gap-1.5 text-[11px]">
              <span className="font-mono text-zinc-400">{name}:</span>
              {spec.matchType === "exact" && spec.value !== undefined ? (
                <span className="font-mono text-zinc-300">&quot;{spec.value}&quot;</span>
              ) : spec.matchType === "contains" && spec.value !== undefined ? (
                <span className="font-mono text-zinc-300">*{spec.value}*</span>
              ) : (
                <span className="text-zinc-500 italic">{matchTypeLabel(spec.matchType)}</span>
              )}
              <span className="text-[10px] text-zinc-600">({matchTypeLabel(spec.matchType)})</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ActualToolBlock({
  actual,
  expected,
  allExpected,
}: {
  actual: ActualToolCallDetail;
  expected: ExpectedToolCallDetail | null;
  allExpected: ExpectedToolCallDetail[];
}) {
  const toolNameMatches = expected !== null;
  const isHallucinated = !isExpectedTool(allExpected, actual.functionName);

  return (
    <div>
      <div className="flex items-center gap-2 flex-wrap">
        {toolNameMatches ? (
          <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />
        ) : (
          <X className="w-3 h-3 text-red-400 flex-shrink-0" />
        )}
        <span
          className={cn(
            "text-xs font-mono",
            toolNameMatches ? "text-emerald-300" : "text-red-300"
          )}
        >
          {actual.functionName}
        </span>
        {isHallucinated && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-medium uppercase tracking-wider">
            Hallucinated
          </span>
        )}
        {actual.jsonMalformed && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium uppercase tracking-wider">
            JSON Repaired
          </span>
        )}
      </div>
      {/* Show param comparison */}
      {Object.keys(actual.arguments).length > 0 && (
        <div className="mt-1.5 ml-5 space-y-1">
          {Object.entries(actual.arguments).map(([name, value]) => {
            const expectedParam = expected?.expectedParams?.[name];
            const matches = expectedParam ? paramMatches(expectedParam, value) : null;
            const isExtra = !expectedParam && expected !== null;

            return (
              <div key={name} className="flex items-center gap-1.5 text-[11px]">
                {matches === true && (
                  <Check className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
                )}
                {matches === false && (
                  <X className="w-2.5 h-2.5 text-red-400 flex-shrink-0" />
                )}
                {matches === null && !isExtra && (
                  <span className="w-2.5 h-2.5 flex-shrink-0" />
                )}
                {isExtra && (
                  <AlertTriangle className="w-2.5 h-2.5 text-amber-400 flex-shrink-0" />
                )}
                <span className={cn(
                  "font-mono",
                  matches === true ? "text-emerald-300" : matches === false ? "text-red-300" : isExtra ? "text-amber-300" : "text-zinc-400"
                )}>
                  {name}:
                </span>
                <span className={cn(
                  "font-mono truncate max-w-[180px]",
                  matches === true ? "text-emerald-200" : matches === false ? "text-red-200" : isExtra ? "text-amber-200" : "text-zinc-300"
                )}>
                  {formatParamValue(value)}
                </span>
                {isExtra && (
                  <span className="text-[10px] text-amber-500 italic">extra</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TextResponsePreview({ text }: { text: string }) {
  const truncated = text.length > 120 ? text.slice(0, 120) + "..." : text;
  return (
    <div className="mt-2 px-3 py-2 bg-white/[0.02] border border-white/[0.04] rounded-lg">
      <div className="flex items-center gap-1.5 mb-1">
        <FileWarning className="w-3 h-3 text-zinc-500" />
        <span className="text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
          Text Response
        </span>
      </div>
      <p className="text-xs text-zinc-400 leading-relaxed font-mono">
        {truncated}
      </p>
    </div>
  );
}

function formatParamValue(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return `"${value}"`;
  if (typeof value === "object") {
    try {
      const s = JSON.stringify(value);
      return s.length > 60 ? s.slice(0, 57) + "..." : s;
    } catch {
      return String(value);
    }
  }
  return String(value);
}

// ─── Verdict Types & Helpers ─────────────────────────────────────────────────

type VerdictLevel = "PRODUCTION-READY" | "USABLE WITH CAUTION" | "NOT READY";

interface ModelVerdict {
  model: string;
  level: VerdictLevel;
  overallPct: number;
  scenariosPassed: number;
  scenariosTotal: number;
  weakestArea: string;
  weakestScore: number;
  hasHallucination: boolean;
  highJsonMalformed: boolean;
}

function computeVerdicts(results: ToolCallResultData[]): ModelVerdict[] {
  return results.map((r) => {
    const scenarios = r.scenarios ?? [];
    const passed = scenarios.filter((s) => s.passed).length;
    const total = scenarios.length;
    const hasHallucination = scenarios.some((s) => s.hallucinatedTool);
    const malformedCount = scenarios.filter((s) => s.jsonMalformed).length;
    const highJsonMalformed = total > 0 && malformedCount / total > 0.3;

    // Find weakest area
    const areas: { label: string; score: number }[] = [
      { label: "Tool Selection", score: r.selectPct },
      { label: "Parameters", score: r.paramsPct },
      { label: "Restraint", score: r.restraintPct },
      { label: "Multi-tool", score: r.multiPct },
    ];
    const weakest = areas.reduce((a, b) => (a.score <= b.score ? a : b));

    let level: VerdictLevel;
    if (r.overallPct >= 90) level = "PRODUCTION-READY";
    else if (r.overallPct >= 70) level = "USABLE WITH CAUTION";
    else level = "NOT READY";

    return {
      model: r.model,
      level,
      overallPct: r.overallPct,
      scenariosPassed: passed,
      scenariosTotal: total,
      weakestArea: weakest.label,
      weakestScore: weakest.score,
      hasHallucination,
      highJsonMalformed,
    };
  });
}

const VERDICT_CONFIG: Record<VerdictLevel, { textClass: string; borderClass: string; bgClass: string; Icon: typeof Shield }> = {
  "PRODUCTION-READY": { textClass: "text-emerald-400", borderClass: "border-emerald-500/20", bgClass: "bg-emerald-500/10", Icon: CheckCircle2 },
  "USABLE WITH CAUTION": { textClass: "text-amber-400", borderClass: "border-amber-500/20", bgClass: "bg-amber-500/10", Icon: AlertTriangle },
  "NOT READY": { textClass: "text-red-400", borderClass: "border-red-500/20", bgClass: "bg-red-500/10", Icon: XCircle },
};

// ─── Component ───────────────────────────────────────────────────────────────

export function ToolResults({ results }: ToolResultsProps) {
  const [expandedScenarios, setExpandedScenarios] = useState<Set<string>>(new Set());

  const toggleScenario = (id: string) => {
    setExpandedScenarios((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Collect all unique scenario names across models
  const allScenarios = Array.from(
    new Map(
      results.flatMap((r) => (r.scenarios ?? []).map((s) => [s.scenarioId, s]))
    ).values()
  );

  // Aggregate failure patterns across all models
  const allFailures = results.flatMap((r) => r.failurePatterns ?? []);
  const mergedFailures = new Map<string, FailurePattern>();
  for (const f of allFailures) {
    const existing = mergedFailures.get(f.type);
    if (existing) {
      existing.count += f.count;
      for (const m of f.affectedModels) {
        if (!existing.affectedModels.includes(m)) existing.affectedModels.push(m);
      }
    } else {
      mergedFailures.set(f.type, { ...f, affectedModels: [...f.affectedModels] });
    }
  }

  // Compute verdicts for the banner
  const verdicts = computeVerdicts(results);
  const bestModel = verdicts.length > 0
    ? verdicts.reduce((a, b) => (a.overallPct >= b.overallPct ? a : b))
    : null;

  return (
    <div className="space-y-8">
      {/* ── TOOL CALLING VERDICT ── */}
      {verdicts.length > 0 && (
        <GlowCard delay={0}>
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
            className="p-6"
          >
            <div className="flex items-center gap-2 mb-5">
              <Shield className="w-4 h-4 text-zinc-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Tool Calling Verdict
              </h3>
            </div>

            <div className="space-y-3">
              {verdicts.map((v, i) => {
                const config = VERDICT_CONFIG[v.level];
                const VIcon = config.Icon;
                return (
                  <motion.div
                    key={v.model}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.25, delay: i * 0.06, ease: [0.25, 0.1, 0.25, 1] }}
                    className={cn(
                      "p-4 rounded-xl border bg-white/5 backdrop-blur-md",
                      config.borderClass
                    )}
                  >
                    {/* Verdict headline */}
                    <div className="flex items-center gap-3 mb-3">
                      <div className={cn("p-1.5 rounded-lg", config.bgClass)}>
                        <VIcon className={cn("w-4 h-4", config.textClass)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <ModelColorDot name={v.model} />
                          <span className="text-sm font-medium text-zinc-200 truncate">
                            {v.model}
                          </span>
                          <span className="text-xs">is</span>
                          <span className={cn("text-sm font-semibold tracking-tight", config.textClass)}>
                            {v.level}
                          </span>
                          <span className="text-xs text-zinc-400">for this tool set.</span>
                        </div>
                      </div>
                      <span className={cn("font-mono tabular-nums text-lg font-semibold", config.textClass)}>
                        {v.overallPct}%
                      </span>
                    </div>

                    {/* Stats row */}
                    <div className="flex items-center gap-4 flex-wrap text-xs text-zinc-400">
                      <span>
                        <span className="font-mono tabular-nums text-zinc-300">{v.scenariosPassed}</span>
                        /{v.scenariosTotal} scenarios passed
                      </span>
                      <span className="text-white/10">|</span>
                      <span>
                        Weakest: <span className="text-zinc-300">{v.weakestArea}</span>{" "}
                        <span className={cn("font-mono tabular-nums", scoreTextClass(v.weakestScore))}>
                          {v.weakestScore}%
                        </span>
                      </span>
                      {v.hasHallucination && (
                        <>
                          <span className="text-white/10">|</span>
                          <span className="flex items-center gap-1 text-red-400">
                            <Bug className="w-3 h-3" />
                            Hallucinated tool calls detected
                          </span>
                        </>
                      )}
                      {v.highJsonMalformed && (
                        <>
                          <span className="text-white/10">|</span>
                          <span className="flex items-center gap-1 text-amber-400">
                            <AlertTriangle className="w-3 h-3" />
                            High JSON malformation rate (&gt;30%)
                          </span>
                        </>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>

            {/* Recommendation */}
            {verdicts.length > 1 && bestModel && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: verdicts.length * 0.06 + 0.1 }}
                className="mt-4 pt-4 border-t border-white/[0.06]"
              >
                <div className="flex items-center gap-2 text-sm">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                  <span className="text-zinc-400">Recommendation:</span>
                  <span className="text-zinc-200 font-medium">
                    Use{" "}
                    <span className="font-mono text-emerald-400">{bestModel.model}</span>
                  </span>
                  <span className="text-zinc-500 text-xs font-mono tabular-nums">
                    ({bestModel.overallPct}% overall)
                  </span>
                </div>
              </motion.div>
            )}
          </motion.div>
        </GlowCard>
      )}

      {/* ── TOOL CALLING ACCURACY ── */}
      <GlowCard delay={0.1}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <Wrench className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Tool Calling Accuracy
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
                    Select%
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 px-3">
                    Params%
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 px-3">
                    Restraint%
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 px-3">
                    Multi%
                  </th>
                  <th className="text-right text-xs text-zinc-500 font-medium uppercase tracking-wider pb-3 pl-3">
                    Overall%
                  </th>
                </tr>
              </thead>
              <tbody>
                {results.map((r, i) => {
                  return (
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
                      {[r.selectPct, r.paramsPct, r.restraintPct, r.multiPct].map((val, ci) => (
                        <td key={ci} className="py-3 px-3">
                          <div className="flex flex-col items-end gap-1">
                            <span className={cn("font-mono tabular-nums text-xs", scoreTextClass(val))}>
                              {val}%
                            </span>
                            <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all duration-700 ease-out"
                                style={{ width: `${val}%`, background: scoreColor(val) }}
                              />
                            </div>
                          </div>
                        </td>
                      ))}
                      <td className="py-3 pl-3 text-right">
                        <ScoreBadge score={r.overallPct} size="sm" />
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </GlowCard>

      {/* ── SCENARIO BREAKDOWN ── */}
      <GlowCard delay={0.2}>
        <div className="p-6">
          <div className="flex items-center gap-2 mb-6">
            <CheckCircle2 className="w-4 h-4 text-zinc-400" />
            <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
              Scenario Breakdown
            </h3>
          </div>

          <div className="space-y-1">
            {allScenarios.map((scenario) => {
              const isExpanded = expandedScenarios.has(scenario.scenarioId);
              return (
                <div key={scenario.scenarioId}>
                  <button
                    onClick={() => toggleScenario(scenario.scenarioId)}
                    className="w-full flex items-center gap-3 py-2.5 px-3 rounded-lg hover:bg-white/[0.03] transition-colors text-left group"
                  >
                    {isExpanded ? (
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                    ) : (
                      <ChevronRight className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                    )}
                    <span className="text-sm text-zinc-200 font-medium flex-1 truncate">
                      {scenario.scenarioName}
                    </span>
                    <span className="text-xs text-zinc-500 uppercase tracking-wider">
                      {scenario.category}
                    </span>
                    {/* Pass/fail dots for each model */}
                    <div className="flex items-center gap-1.5 ml-2">
                      {results.map((r) => {
                        const ms = (r.scenarios ?? []).find((s) => s.scenarioId === scenario.scenarioId);
                        const passed = ms?.passed ?? false;
                        return (
                          <div key={r.model} className="relative group/dot">
                            <span
                              className={cn(
                                "inline-block w-2.5 h-2.5 rounded-full",
                                passed ? "bg-emerald-500" : "bg-red-500"
                              )}
                            />
                          </div>
                        );
                      })}
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
                        <div className="pl-9 pr-3 pb-3 space-y-3">
                          {results.map((r) => {
                            const ms = r.scenarios.find(
                              (s) => s.scenarioId === scenario.scenarioId
                            );
                            if (!ms) return null;
                            const hasComparisonData =
                              (ms.expectedToolCalls && ms.expectedToolCalls.length > 0) ||
                              (ms.actualToolCalls && ms.actualToolCalls.length > 0) ||
                              ms.shouldCallTool === false;
                            return (
                              <div
                                key={r.model}
                                className="py-2 px-3 bg-white/[0.02] rounded-lg border border-white/[0.04]"
                              >
                                {/* Existing score row */}
                                <div className="flex items-center gap-3">
                                  <ModelColorDot name={r.model} />
                                  <span className="text-sm text-zinc-300 min-w-[140px] truncate">
                                    {r.model}
                                  </span>
                                  {ms.passed ? (
                                    <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                  ) : (
                                    <XCircle className="w-4 h-4 text-red-500 flex-shrink-0" />
                                  )}
                                  <div className="flex-1 grid grid-cols-3 gap-3 ml-2">
                                    <ScoreBar score={ms.toolSelectionScore} label="Select" maxScore={5} />
                                    <ScoreBar score={ms.paramAccuracyScore} label="Params" maxScore={5} />
                                    <ScoreBar score={ms.restraintScore} label="Restraint" maxScore={5} />
                                  </div>
                                  <span className="font-mono tabular-nums text-xs text-zinc-400 ml-2">
                                    {ms.overallScore}%
                                  </span>
                                  {/* Flags */}
                                  <div className="flex items-center gap-1 ml-1">
                                    {ms.hallucinatedTool && (
                                      <span title="Hallucinated tool">
                                        <Bug className="w-3.5 h-3.5 text-red-400" />
                                      </span>
                                    )}
                                    {ms.calledWhenShouldNot && (
                                      <span title="Eager invocation">
                                        <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                                      </span>
                                    )}
                                    {ms.missingRequiredParam && (
                                      <span title="Missing required param">
                                        <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                                      </span>
                                    )}
                                    {ms.jsonMalformed && (
                                      <span title="Malformed JSON">
                                        <XCircle className="w-3.5 h-3.5 text-red-400" />
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {/* Expected vs Actual Comparison */}
                                {hasComparisonData && (
                                  <motion.div
                                    initial={{ opacity: 0, y: 6 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ duration: 0.25, delay: 0.1, ease: [0.25, 0.1, 0.25, 1] }}
                                  >
                                    <ToolComparison ms={ms} />
                                  </motion.div>
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
        </div>
      </GlowCard>

      {/* ── COMMON FAILURE PATTERNS ── */}
      {mergedFailures.size > 0 && (
        <GlowCard delay={0.3}>
          <div className="p-6">
            <div className="flex items-center gap-2 mb-6">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <h3 className="text-xs font-semibold uppercase tracking-widest text-zinc-400">
                Common Failure Patterns
              </h3>
            </div>

            <div className="space-y-4">
              {Array.from(mergedFailures.values())
                .sort((a, b) => b.count - a.count)
                .map((pattern, i) => {
                  const Icon = FAILURE_ICONS[pattern.type] ?? AlertTriangle;
                  return (
                    <motion.div
                      key={pattern.type}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, delay: i * 0.05, ease: [0.25, 0.1, 0.25, 1] }}
                      className="flex items-start gap-3 p-4 bg-white/[0.02] border border-white/[0.04] rounded-lg"
                    >
                      <div className="mt-0.5 p-1.5 rounded-md bg-amber-500/10">
                        <Icon className="w-4 h-4 text-amber-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-medium text-zinc-200">
                            {pattern.label}
                          </span>
                          <span className="text-xs font-mono tabular-nums text-zinc-500">
                            {pattern.count} occurrence{pattern.count !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <p className="text-sm text-zinc-400 leading-relaxed">
                          {pattern.description}
                        </p>
                        <div className="flex items-center gap-1.5 mt-2">
                          <span className="text-xs text-zinc-500">Affected:</span>
                          {pattern.affectedModels.map((m) => (
                            <div key={m} className="flex items-center gap-1">
                              <ModelColorDot name={m} size={6} />
                              <span className="text-xs text-zinc-400">{m}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
            </div>
          </div>
        </GlowCard>
      )}
    </div>
  );
}
