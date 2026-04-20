"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { getModelColor } from "@/lib/model-colors";
import { CheckCircle2, XCircle, Clock, Code2, Zap, Shield, Target } from "lucide-react";
import {
  ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis,
  PolarRadiusAxis, Radar, Legend, Tooltip,
} from "recharts";

interface TestResult {
  testCaseId: string;
  passed: boolean;
  actualOutput?: string;
  expectedOutput?: string;
  executionTimeMs?: number;
  error?: string;
}

interface CodingPromptResult {
  prompt_id: string;
  response: string;
  auto_scores: string | Record<string, unknown>;
  tokens_per_sec: number;
  model_name: string;
}

interface CodingModelData {
  model_name: string;
  overall_score: number;
  avg_tokens_per_sec: number;
  promptResults: CodingPromptResult[];
}

export interface CodingResultsProps {
  models: CodingModelData[];
  /** Map of scenario ID → scenario name, from the suite data. */
  scenarioNames?: Record<string, string>;
}

function parseAutoScores(raw: string | Record<string, unknown>): Record<string, unknown> {
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return {}; }
  }
  return raw || {};
}

export function CodingResults({ models, scenarioNames }: CodingResultsProps) {
  const radarData = useMemo(() => {
    // Compute per-model metrics for the radar chart
    const modelMetrics = models.map((m) => {
      let totalTests = 0;
      let passedTests = 0;
      let compiledScenarios = 0;
      let totalScenarios = 0;
      let totalExecMs = 0;
      let execCount = 0;
      let totalCodeLines = 0;
      let codeCount = 0;
      let hardPassed = 0;
      let hardTotal = 0;

      for (const pr of m.promptResults) {
        const auto = parseAutoScores(pr.auto_scores);
        const tests = (auto.testResults || []) as TestResult[];
        const difficulty = auto.difficulty as string;
        totalScenarios++;

        if (auto.dockerExecuted) {
          compiledScenarios++;
          for (const t of tests) {
            totalTests++;
            if (t.passed) passedTests++;
            if (t.executionTimeMs != null) {
              totalExecMs += t.executionTimeMs;
              execCount++;
            }
          }
        }

        // Count code lines — only for scenarios that passed all tests
        // (short broken code shouldn't score high on conciseness)
        if (pr.response && auto.dockerExecuted) {
          const allPassed = tests.length > 0 && tests.every(t => t.passed);
          if (allPassed) {
            const lines = pr.response.split("\n").filter((l: string) => l.trim()).length;
            totalCodeLines += lines;
            codeCount++;
          }
        }

        if (difficulty === "hard") {
          hardTotal++;
          if ((auto.rubricScore as number) === 100) hardPassed++;
        }
      }

      return {
        name: m.model_name,
        correctness: totalTests > 0 ? Math.round((passedTests / totalTests) * 100) : 0,
        reliability: totalScenarios > 0 ? Math.round((compiledScenarios / totalScenarios) * 100) : 0,
        avgExecMs: execCount > 0 ? totalExecMs / execCount : 0,
        avgCodeLines: codeCount > 0 ? Math.round(totalCodeLines / codeCount) : 0,
        edgeCases: hardTotal > 0 ? Math.round((hardPassed / hardTotal) * 100) : 100,
        passedTests,
        totalTests,
        compiledScenarios,
        totalScenarios,
      };
    });

    // Normalize speed (fastest = 100, slowest relative)
    const fastestMs = Math.min(...modelMetrics.filter(m => m.avgExecMs > 0).map(m => m.avgExecMs), 999999);
    const shortestCode = Math.min(...modelMetrics.filter(m => m.avgCodeLines > 0).map(m => m.avgCodeLines), 999);

    const axes = [
      { axis: "Correctness", fullMark: 100 },
      { axis: "Code Quality", fullMark: 100 },
      { axis: "Speed", fullMark: 100 },
      { axis: "Reliability", fullMark: 100 },
      { axis: "Edge Cases", fullMark: 100 },
    ];

    // Build chart data — each data point has ALL model values for that axis
    const modelValues = modelMetrics.map((m) => {
      // Compute average judge score across all prompts (Code Quality dimension)
      let judgeTotal = 0;
      let judgeCount = 0;
      const modelData = models.find(md => md.model_name === m.name);
      if (modelData) {
        for (const pr of modelData.promptResults) {
          const auto = parseAutoScores(pr.auto_scores);
          // Judge scores stored in prompt results as judgeScores or judge_scores
          const rawJs = (pr as unknown as Record<string, unknown>).judgeScores
            || (pr as unknown as Record<string, unknown>).judge_scores;
          const js = typeof rawJs === "string" ? (() => { try { return JSON.parse(rawJs); } catch { return null; } })() : rawJs;
          if (js && typeof js === "object" && (js as Record<string, unknown>).score) {
            judgeTotal += (js as Record<string, unknown>).score as number;
            judgeCount++;
          } else if (auto.rubricScore != null) {
            judgeTotal += auto.rubricScore as number;
            judgeCount++;
          }
        }
      }
      const codeQuality = judgeCount > 0 ? Math.round(judgeTotal / judgeCount) : m.correctness;

      return {
        name: m.name,
        values: {
          Correctness: m.correctness,
          "Code Quality": codeQuality,
          Speed: m.avgExecMs > 0 ? Math.round(Math.min(100, (fastestMs / m.avgExecMs) * 100)) : 0,
          Reliability: m.reliability,
          "Edge Cases": m.edgeCases,
        } as Record<string, number>,
      };
    });

    const chartData = axes.map((a) => {
      const point: Record<string, string | number> = { axis: a.axis };
      for (const mv of modelValues) {
        point[mv.name] = mv.values[a.axis] ?? 0;
      }
      return point;
    });

    return {
      chartData,
      modelNames: modelMetrics.map(m => m.name),
      metrics: modelMetrics,
    };
  }, [models]);

  // Per-scenario breakdown
  const scenarios = useMemo(() => {
    if (models.length === 0) return [];
    const firstModel = models[0];
    return firstModel.promptResults.map((pr, i) => {
      const auto = parseAutoScores(pr.auto_scores);
      const promptId = (pr as { prompt_id?: string }).prompt_id || "";
      const scenarioName = (auto.scenarioName as string)
        || (scenarioNames && scenarioNames[promptId])
        || `Scenario ${i + 1}`;
      const language = (auto.language as string) || "python";

      const perModel = models.map((m) => {
        const mPr = m.promptResults[i];
        if (!mPr) return { model: m.model_name, score: 0, tests: [], execMs: 0, error: null };
        const mAuto = parseAutoScores(mPr.auto_scores);
        const tests = (mAuto.testResults || []) as TestResult[];
        const totalExec = tests.reduce((s, t) => s + (t.executionTimeMs || 0), 0);
        return {
          model: m.model_name,
          score: (mAuto.rubricScore as number) || 0,
          tests,
          execMs: totalExec,
          error: tests.find(t => t.error)?.error || null,
        };
      });

      return { name: scenarioName, language, perModel };
    });
  }, [models]);

  if (models.length === 0) return null;

  return (
    <div className="space-y-8">
      <h2 className="text-[20px] font-semibold text-white/90 tracking-tight">Code Execution Analysis</h2>

      {/* Radar Chart */}
      {radarData.modelNames.length > 0 && (
        <div className="apple-glass-panel rounded-2xl p-6">
          <h3 className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-4">Model Comparison</h3>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData.chartData}>
                <PolarGrid stroke="rgba(255,255,255,0.06)" />
                <PolarAngleAxis
                  dataKey="axis"
                  tick={{ fill: "#a1a1aa", fontSize: 12, fontWeight: 500 }}
                />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tick={{ fill: "#52525b", fontSize: 10 }}
                  axisLine={false}
                />
                {radarData.modelNames.map((name) => {
                  const color = getModelColor(name);
                  return (
                    <Radar
                      key={name}
                      name={name}
                      dataKey={name}
                      stroke={color.hex}
                      fill={color.hex}
                      fillOpacity={0.15}
                      strokeWidth={2}
                    />
                  );
                })}
                <Legend
                  wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1c1c1e",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: 12,
                    fontSize: 12,
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          {/* Summary stats row */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-8">
            {[
              { icon: Target, label: "Correctness", key: "correctness", unit: "%" },
              { icon: Zap, label: "Avg Exec", key: "avgExecMs", unit: "ms" },
              { icon: Code2, label: "Avg Lines", key: "avgCodeLines", unit: "" },
              { icon: CheckCircle2, label: "Tests Passed", key: "passedTests", unit: "" },
              { icon: Shield, label: "Edge Cases", key: "edgeCases", unit: "%" },
            ].map(({ icon: Icon, label, key, unit }) => (
              <div key={label} className="bg-[#121214] border border-white/5 rounded-[24px] p-5 shadow-sm hover:scale-[1.02] transition-transform">
                <div className="flex items-center gap-2 mb-4">
                  <div className="p-2 rounded-full bg-white/5">
                    <Icon size={16} className="text-zinc-400" />
                  </div>
                  <p className="text-[12px] text-zinc-500 font-bold uppercase tracking-wider">{label}</p>
                </div>
                <div className="space-y-3">
                  {radarData.metrics.map((m) => (
                    <div key={m.name} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full shadow-sm" style={{ background: getModelColor(m.name).hex }} />
                        <span className="text-[14px] font-medium text-zinc-300 max-w-[80px] truncate" title={m.name}>{m.name.split(":")[0]}</span>
                      </div>
                      <span className="text-[18px] font-semibold text-white tracking-tight tabular-nums">
                        {key === "passedTests" ? `${m.passedTests}/${m.totalTests}` :
                         key === "avgExecMs" ? `${Math.round(m[key as keyof typeof m] as number)}${unit}` :
                         `${m[key as keyof typeof m]}${unit}`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Test Case Analysis is now integrated into the Scenario Drill-Down */}
    </div>
  );
}
