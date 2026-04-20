"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ChevronDown, ChevronUp, ArrowDown, Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type {
  ToolScenarioCategory,
  PromptDifficulty,
  ExpectedToolCall,
  DependencyChain,
  ChainStep,
  ParamDependency,
} from "@/types";

interface ScenarioDef {
  id: string;
  name: string;
  userMessage: string;
  systemPrompt?: string | null;
  shouldCallTool: boolean;
  expectedToolCalls: ExpectedToolCall[];
  category: ToolScenarioCategory;
  difficulty: PromptDifficulty;
  simulatedError?: string | null;
  dependencyChain?: DependencyChain | null;
}

interface ScenarioEditorProps {
  scenarios: ScenarioDef[];
  suiteId: string;
  toolNames: string[];
  readOnly?: boolean;
  onScenariosChange: (scenarios: ScenarioDef[]) => void;
}

const CATEGORIES: { value: ToolScenarioCategory; label: string }[] = [
  { value: "tool_selection", label: "Tool Selection" },
  { value: "param_accuracy", label: "Param Accuracy" },
  { value: "restraint", label: "Restraint" },
  { value: "multi_tool", label: "Multi-Tool" },
  { value: "error_recovery", label: "Error Recovery" },
  { value: "hallucination", label: "Hallucination" },
  { value: "param_format", label: "Param Format" },
  { value: "dependency_chain", label: "Dependency Chain" },
];

const DIFFICULTIES: PromptDifficulty[] = ["easy", "medium", "hard"];

const DIFF_COLORS: Record<string, string> = {
  easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  hard: "text-red-400 bg-red-500/10 border-red-500/20",
};

const CATEGORY_COLORS: Record<string, string> = {
  tool_selection: "text-blue-400 bg-blue-500/10",
  param_accuracy: "text-cyan-400 bg-cyan-500/10",
  restraint: "text-amber-400 bg-amber-500/10",
  multi_tool: "text-violet-400 bg-violet-500/10",
  error_recovery: "text-orange-400 bg-orange-500/10",
  hallucination: "text-rose-400 bg-rose-500/10",
  param_format: "text-teal-400 bg-teal-500/10",
  dependency_chain: "text-indigo-400 bg-indigo-500/10",
};

// ─── Dependency Chain Step Editor ────────────────────────────────────────────

function ChainStepEditor({
  step,
  stepIndex,
  toolNames,
  readOnly,
  onUpdate,
  onRemove,
}: {
  step: ChainStep;
  stepIndex: number;
  toolNames: string[];
  readOnly?: boolean;
  onUpdate: (updates: Partial<ChainStep>) => void;
  onRemove: () => void;
}) {
  const [mockReturnText, setMockReturnText] = useState(
    step.mockReturn != null ? JSON.stringify(step.mockReturn, null, 2) : ""
  );
  const [mockReturnError, setMockReturnError] = useState<string | null>(null);

  const handleMockReturnChange = (value: string) => {
    setMockReturnText(value);
    if (!value.trim()) {
      setMockReturnError(null);
      onUpdate({ mockReturn: null });
      return;
    }
    try {
      const parsed = JSON.parse(value);
      setMockReturnError(null);
      onUpdate({ mockReturn: parsed });
    } catch {
      setMockReturnError("Invalid JSON");
    }
  };

  const addDependency = (paramName: string) => {
    const deps = { ...(step.paramDependencies ?? {}) };
    deps[paramName] = { fromStep: 0, jsonPath: "" };
    onUpdate({ paramDependencies: deps });
  };

  const updateDependency = (
    paramName: string,
    updates: Partial<ParamDependency>
  ) => {
    const deps = { ...(step.paramDependencies ?? {}) };
    deps[paramName] = { ...deps[paramName], ...updates };
    onUpdate({ paramDependencies: deps });
  };

  const removeDependency = (paramName: string) => {
    const deps = { ...(step.paramDependencies ?? {}) };
    delete deps[paramName];
    onUpdate({
      paramDependencies: Object.keys(deps).length > 0 ? deps : undefined,
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      <div className="relative bg-white/[0.03] backdrop-blur-md border border-white/[0.06] rounded-xl p-4 space-y-3">
        {/* Step header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-indigo-500/20 border border-indigo-500/30 text-indigo-300 text-xs font-mono font-semibold">
              {stepIndex + 1}
            </span>
            <span className="text-zinc-300 text-sm font-medium">
              Step {stepIndex + 1}
            </span>
          </div>
          {!readOnly && (
            <button
              onClick={onRemove}
              className="text-zinc-700 hover:text-red-400 transition-colors p-1"
            >
              <Trash2 size={12} />
            </button>
          )}
        </div>

        {/* Expected tool */}
        <div>
          <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
            Expected Tool
          </label>
          <select
            value={step.expectedTool}
            onChange={(e) => onUpdate({ expectedTool: e.target.value })}
            disabled={readOnly}
            className="w-full bg-zinc-900 border border-white/[0.06] rounded-lg px-3 py-1.5 text-xs text-blue-300 font-mono outline-none focus-visible:ring-2 focus-visible:ring-white/20 disabled:opacity-50"
          >
            <option value="">Select tool...</option>
            {toolNames.map((tn) => (
              <option key={tn} value={tn}>
                {tn}
              </option>
            ))}
          </select>
        </div>

        {/* Mock return */}
        <div>
          <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
            Mock Return (JSON)
          </label>
          <textarea
            value={mockReturnText}
            onChange={(e) => handleMockReturnChange(e.target.value)}
            disabled={readOnly}
            rows={3}
            className={cn(
              "w-full bg-white/5 border rounded-lg px-3 py-2 text-xs text-zinc-300 font-mono outline-none resize-none focus:border-indigo-500/30 disabled:opacity-50",
              mockReturnError
                ? "border-red-500/40"
                : "border-white/[0.06]"
            )}
            placeholder='{"results": [{"id": "abc123", "name": "Item"}]}'
          />
          {mockReturnError && (
            <p className="text-red-400 text-[10px] mt-0.5">{mockReturnError}</p>
          )}
        </div>

        {/* Dependency references (only for step > 0) */}
        {stepIndex > 0 && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-zinc-600 text-[10px] uppercase tracking-wider flex items-center gap-1">
                <Link2 size={10} />
                Parameter Dependencies
              </label>
              {!readOnly && (
                <button
                  onClick={() => {
                    const name = prompt("Parameter name:");
                    if (name) addDependency(name);
                  }}
                  className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors"
                >
                  + Add
                </button>
              )}
            </div>

            {step.paramDependencies &&
            Object.keys(step.paramDependencies).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(step.paramDependencies).map(([paramName, dep]) => (
                  <div
                    key={paramName}
                    className="bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-2.5 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-indigo-300 text-xs font-mono">
                        {paramName}
                      </span>
                      {!readOnly && (
                        <button
                          onClick={() => removeDependency(paramName)}
                          className="text-zinc-700 hover:text-red-400 transition-colors"
                        >
                          <Trash2 size={10} />
                        </button>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-zinc-600 text-[10px] whitespace-nowrap">
                        from Step
                      </span>
                      <select
                        value={dep.fromStep}
                        onChange={(e) =>
                          updateDependency(paramName, {
                            fromStep: parseInt(e.target.value),
                          })
                        }
                        disabled={readOnly}
                        className="bg-zinc-900 border border-white/[0.06] rounded px-2 py-0.5 text-xs text-indigo-300 font-mono outline-none w-16"
                      >
                        {Array.from({ length: stepIndex }, (_, i) => (
                          <option key={i} value={i}>
                            {i + 1}
                          </option>
                        ))}
                      </select>
                      <span className="text-zinc-600 text-[10px]">path:</span>
                      <input
                        value={dep.jsonPath}
                        onChange={(e) =>
                          updateDependency(paramName, {
                            jsonPath: e.target.value,
                          })
                        }
                        disabled={readOnly}
                        className="flex-1 bg-white/5 border border-white/[0.06] rounded px-2 py-0.5 text-xs text-zinc-300 font-mono outline-none focus:border-indigo-500/30 disabled:opacity-50"
                        placeholder="results[0].id"
                      />
                    </div>
                    {/* Visual summary */}
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className="text-zinc-600">resolves as:</span>
                      <span className="text-indigo-300/80 font-mono">
                        from Step {dep.fromStep + 1}
                      </span>
                      <ArrowDown size={8} className="text-indigo-400/50 rotate-[-90deg]" />
                      <span className="text-indigo-300/80 font-mono">
                        {dep.jsonPath || "..."}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-zinc-700 text-xs py-1">
                No dependencies. Add one to reference output from a previous step.
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ─── Flow Arrow ──────────────────────────────────────────────────────────────

function FlowArrow() {
  return (
    <div className="flex justify-center py-1">
      <div className="flex flex-col items-center">
        <div className="w-px h-3 bg-gradient-to-b from-indigo-500/40 to-indigo-500/20" />
        <ArrowDown size={14} className="text-indigo-400/60 -mt-0.5" />
      </div>
    </div>
  );
}

// ─── Main Scenario Editor ────────────────────────────────────────────────────

export function ScenarioEditor({
  scenarios,
  suiteId,
  toolNames,
  readOnly,
  onScenariosChange,
}: ScenarioEditorProps) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const addScenario = async () => {
    const res = await fetch(`/api/suites/${suiteId}/scenarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: `Scenario ${scenarios.length + 1}`,
        userMessage: "",
        shouldCallTool: true,
        expectedToolCalls: [],
        category: "tool_selection",
        difficulty: "medium",
        order: scenarios.length,
      }),
    });
    const data = await res.json();
    const newScenario: ScenarioDef = {
      id: data.id,
      name: `Scenario ${scenarios.length + 1}`,
      userMessage: "",
      shouldCallTool: true,
      expectedToolCalls: [],
      category: "tool_selection",
      difficulty: "medium",
    };
    onScenariosChange([...scenarios, newScenario]);
    setExpanded(data.id);
  };

  const deleteScenario = async (id: string) => {
    await fetch(`/api/suites/${suiteId}/scenarios`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    onScenariosChange(scenarios.filter((s) => s.id !== id));
    if (expanded === id) setExpanded(null);
  };

  const updateScenario = async (id: string, updates: Partial<ScenarioDef>) => {
    await fetch(`/api/suites/${suiteId}/scenarios`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...updates }),
    });
    onScenariosChange(
      scenarios.map((s) => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  const addExpectedCall = (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const newCall: ExpectedToolCall = {
      toolName: toolNames[0] ?? "",
      expectedParams: {},
    };
    updateScenario(scenarioId, {
      expectedToolCalls: [...scenario.expectedToolCalls, newCall],
    });
  };

  const updateExpectedCall = (
    scenarioId: string,
    callIdx: number,
    updates: Partial<ExpectedToolCall>
  ) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const calls = [...scenario.expectedToolCalls];
    calls[callIdx] = { ...calls[callIdx], ...updates };
    updateScenario(scenarioId, { expectedToolCalls: calls });
  };

  const removeExpectedCall = (scenarioId: string, callIdx: number) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    updateScenario(scenarioId, {
      expectedToolCalls: scenario.expectedToolCalls.filter((_, i) => i !== callIdx),
    });
  };

  // ─── Dependency chain helpers ──────────────────────────────────────────────

  const getChain = (scenario: ScenarioDef): DependencyChain => {
    return scenario.dependencyChain ?? { steps: [] };
  };

  const addChainStep = (scenarioId: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const chain = getChain(scenario);
    const newStep: ChainStep = {
      expectedTool: toolNames[0] ?? "",
      expectedParams: {},
      mockReturn: null,
    };
    updateScenario(scenarioId, {
      dependencyChain: { steps: [...chain.steps, newStep] },
    });
  };

  const updateChainStep = (
    scenarioId: string,
    stepIdx: number,
    updates: Partial<ChainStep>
  ) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const chain = getChain(scenario);
    const steps = [...chain.steps];
    steps[stepIdx] = { ...steps[stepIdx], ...updates };
    updateScenario(scenarioId, { dependencyChain: { steps } });
  };

  const removeChainStep = (scenarioId: string, stepIdx: number) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const chain = getChain(scenario);
    // Also clean up dependencies referencing this step or higher
    const newSteps = chain.steps
      .filter((_, i) => i !== stepIdx)
      .map((step, i) => {
        if (!step.paramDependencies) return step;
        const cleanedDeps: Record<string, ParamDependency> = {};
        for (const [key, dep] of Object.entries(step.paramDependencies)) {
          if (dep.fromStep === stepIdx) continue; // remove refs to deleted step
          if (dep.fromStep > stepIdx) {
            cleanedDeps[key] = { ...dep, fromStep: dep.fromStep - 1 };
          } else if (dep.fromStep < i) {
            cleanedDeps[key] = dep;
          }
        }
        return {
          ...step,
          paramDependencies:
            Object.keys(cleanedDeps).length > 0 ? cleanedDeps : undefined,
        };
      });
    updateScenario(scenarioId, { dependencyChain: { steps: newSteps } });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">
          Scenarios
        </h3>
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={addScenario}>
            <Plus size={12} />
            Add Scenario
          </Button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {scenarios.map((scenario, idx) => (
          <motion.div
            key={scenario.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="border-b border-white/[0.05] overflow-hidden">
              {/* Scenario header */}
              <button
                onClick={() =>
                  setExpanded(expanded === scenario.id ? null : scenario.id)
                }
                className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.04] transition-colors apple-list-row cursor-pointer"
              >
                <span className="text-zinc-600 text-[15px] font-mono w-6">
                  {idx + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <span className="text-white text-[17px] font-medium tracking-tight mb-1">{scenario.name}</span>
                  {scenario.userMessage && (
                    <p className="text-zinc-400 text-[14px] truncate">
                      {scenario.userMessage}
                    </p>
                  )}
                </div>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded",
                    CATEGORY_COLORS[scenario.category]
                  )}
                >
                  {scenario.category.replace(/_/g, " ")}
                </span>
                <span
                  className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded border",
                    DIFF_COLORS[scenario.difficulty]
                  )}
                >
                  {scenario.difficulty}
                </span>
                {!readOnly && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteScenario(scenario.id);
                    }}
                    className="text-zinc-700 hover:text-red-400 transition-colors p-1"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
                {expanded === scenario.id ? (
                  <ChevronUp size={14} className="text-zinc-600" />
                ) : (
                  <ChevronDown size={14} className="text-zinc-600" />
                )}
              </button>

              {/* Expanded scenario */}
              <AnimatePresence>
                {expanded === scenario.id && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    <div className="p-6 space-y-6 border-t border-white/[0.05] bg-[#09090B]">
                      {/* Name */}
                      <div>
                        <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                          Scenario Name
                        </label>
                        <input
                          value={scenario.name}
                          onChange={(e) => updateScenario(scenario.id, { name: e.target.value })}
                          disabled={readOnly}
                          className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 disabled:opacity-50"
                        />
                      </div>

                      {/* User message */}
                      <div>
                        <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                          User Message
                        </label>
                        <textarea
                          value={scenario.userMessage}
                          onChange={(e) => updateScenario(scenario.id, { userMessage: e.target.value })}
                          disabled={readOnly}
                          rows={3}
                          className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none resize-none focus:border-white/30 disabled:opacity-50"
                          placeholder="What the user says to the model..."
                        />
                      </div>

                      {/* Category & Difficulty */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                            Category
                          </label>
                          <select
                            value={scenario.category}
                            onChange={(e) =>
                              updateScenario(scenario.id, {
                                category: e.target.value as ToolScenarioCategory,
                              })
                            }
                            disabled={readOnly}
                            className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none"
                          >
                            {CATEGORIES.map((c) => (
                              <option key={c.value} value={c.value}>
                                {c.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                            Difficulty
                          </label>
                          <div className="flex gap-2">
                            {DIFFICULTIES.map((d) => (
                              <button
                                key={d}
                                onClick={() =>
                                  !readOnly &&
                                  updateScenario(scenario.id, { difficulty: d })
                                }
                                disabled={readOnly}
                                className={cn(
                                  "flex-1 py-3 rounded-xl text-[14px] font-semibold capitalize border transition-all",
                                  scenario.difficulty === d
                                    ? DIFF_COLORS[d]
                                    : "text-zinc-500 bg-[#121214] border-white/10 hover:bg-white/5"
                                )}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* ─── Dependency Chain Editor ─── */}
                      {scenario.category === "dependency_chain" && (
                        <div className="pt-4">
                          <div className="flex items-center justify-between mb-4">
                            <label className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest flex items-center gap-2">
                              <Link2 size={14} className="text-indigo-400" />
                              Dependency Chain Steps
                            </label>
                            {!readOnly && (
                              <button
                                onClick={() => addChainStep(scenario.id)}
                                className="text-indigo-400 text-xs hover:text-indigo-300 transition-colors"
                              >
                                + Add Step
                              </button>
                            )}
                          </div>

                          {getChain(scenario).steps.length === 0 ? (
                            <div className="text-center py-6 bg-white/[0.02] border border-dashed border-white/[0.06] rounded-xl">
                              <p className="text-zinc-600 text-sm">
                                No chain steps defined.
                              </p>
                              <p className="text-zinc-700 text-xs mt-1">
                                Add steps to define a multi-tool dependency flow where each
                                step can reference outputs from previous steps.
                              </p>
                            </div>
                          ) : (
                            <div className="space-y-0">
                              <AnimatePresence mode="popLayout">
                                {getChain(scenario).steps.map((step, si) => (
                                  <div key={si}>
                                    {si > 0 && <FlowArrow />}
                                    <ChainStepEditor
                                      step={step}
                                      stepIndex={si}
                                      toolNames={toolNames}
                                      readOnly={readOnly}
                                      onUpdate={(updates) =>
                                        updateChainStep(scenario.id, si, updates)
                                      }
                                      onRemove={() =>
                                        removeChainStep(scenario.id, si)
                                      }
                                    />
                                  </div>
                                ))}
                              </AnimatePresence>
                            </div>
                          )}

                          {/* Chain summary */}
                          {getChain(scenario).steps.length > 1 && (
                            <motion.div
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              className="mt-3 bg-indigo-500/5 border border-indigo-500/10 rounded-lg p-3"
                            >
                              <p className="text-zinc-500 text-[10px] uppercase tracking-wider mb-1.5">
                                Chain Summary
                              </p>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {getChain(scenario).steps.map((step, si) => (
                                  <div key={si} className="flex items-center gap-1.5">
                                    {si > 0 && (
                                      <ArrowDown
                                        size={10}
                                        className="text-indigo-400/40 rotate-[-90deg]"
                                      />
                                    )}
                                    <span className="text-indigo-300 text-xs font-mono bg-indigo-500/10 px-1.5 py-0.5 rounded">
                                      {step.expectedTool || "?"}
                                    </span>
                                  </div>
                                ))}
                              </div>
                              {/* Show dependency links */}
                              {getChain(scenario).steps.some(
                                (s) =>
                                  s.paramDependencies &&
                                  Object.keys(s.paramDependencies).length > 0
                              ) && (
                                <div className="mt-2 space-y-1">
                                  {getChain(scenario).steps.map((step, si) =>
                                    step.paramDependencies
                                      ? Object.entries(step.paramDependencies).map(
                                          ([param, dep]) => (
                                            <div
                                              key={`${si}-${param}`}
                                              className="flex items-center gap-1 text-[10px] text-zinc-500"
                                            >
                                              <span className="text-indigo-300/60 font-mono">
                                                Step {si + 1}.{param}
                                              </span>
                                              <ArrowDown
                                                size={8}
                                                className="text-indigo-400/40 rotate-[180deg]"
                                              />
                                              <span className="text-indigo-300/60 font-mono">
                                                Step {dep.fromStep + 1}.{dep.jsonPath}
                                              </span>
                                            </div>
                                          )
                                        )
                                      : null
                                  )}
                                </div>
                              )}
                            </motion.div>
                          )}
                        </div>
                      )}

                      {/* ─── Standard Expected Tool Calls (non-chain) ─── */}
                      {scenario.category !== "dependency_chain" && (
                        <>
                          {/* Should call tool */}
                          <div className="flex items-center gap-6 mt-2">
                            <label className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">
                              Expected behavior
                            </label>
                            <div className="flex gap-4">
                              <label
                                className={cn(
                                  "flex items-center gap-2 text-[14px] font-semibold px-4 py-3 rounded-xl border cursor-pointer transition-colors",
                                  scenario.shouldCallTool
                                    ? "text-blue-300 border-blue-500/30 bg-blue-500/10"
                                    : "text-zinc-500 border-white/10 bg-[#121214]"
                                )}
                              >
                                <input
                                  type="radio"
                                  checked={scenario.shouldCallTool}
                                  onChange={() => updateScenario(scenario.id, { shouldCallTool: true })}
                                  disabled={readOnly}
                                  className="sr-only"
                                />
                                Should call tool
                              </label>
                              <label
                                className={cn(
                                  "flex items-center gap-2 text-[14px] font-semibold px-4 py-3 rounded-xl border cursor-pointer transition-colors",
                                  !scenario.shouldCallTool
                                    ? "text-amber-300 border-amber-500/30 bg-amber-500/10"
                                    : "text-zinc-500 border-white/10 bg-[#121214]"
                                )}
                              >
                                <input
                                  type="radio"
                                  checked={!scenario.shouldCallTool}
                                  onChange={() => updateScenario(scenario.id, { shouldCallTool: false })}
                                  disabled={readOnly}
                                  className="sr-only"
                                />
                                Should NOT call tool
                              </label>
                            </div>
                          </div>

                          {/* Expected tool calls (when shouldCallTool) */}
                          {scenario.shouldCallTool && (
                            <div className="pt-4">
                              <div className="flex items-center justify-between mb-4">
                                <label className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">
                                  Expected Tool Calls{" "}
                                  {scenario.expectedToolCalls.length > 1 && "(ordered sequence)"}
                                </label>
                                {!readOnly && (
                                  <button
                                    onClick={() => addExpectedCall(scenario.id)}
                                    className="text-blue-400 text-xs font-semibold hover:text-blue-300 transition-colors"
                                  >
                                    + Add Call
                                  </button>
                                )}
                              </div>

                              {scenario.expectedToolCalls.length === 0 && (
                                <p className="text-zinc-600 text-sm py-2">
                                  No expected calls. Add one to define what the model should do.
                                </p>
                              )}

                              <div className="space-y-3">
                                {scenario.expectedToolCalls.map((call, ci) => (
                                  <div
                                    key={ci}
                                    className="bg-[#121214] border border-white/5 rounded-xl p-4 space-y-3"
                                  >
                                    <div className="flex items-center gap-3">
                                      <span className="text-zinc-500 text-[15px] font-mono font-bold">
                                        {ci + 1}.
                                      </span>
                                      <select
                                        value={call.toolName}
                                        onChange={(e) =>
                                          updateExpectedCall(scenario.id, ci, {
                                            toolName: e.target.value,
                                          })
                                        }
                                        disabled={readOnly}
                                        className="bg-[#1A1A1C] border border-white/10 rounded-lg px-3 py-2 text-[14px] font-medium text-blue-400 font-mono outline-none flex-1"
                                      >
                                        <option value="">Select tool...</option>
                                        {toolNames.map((tn) => (
                                          <option key={tn} value={tn}>
                                            {tn}
                                          </option>
                                        ))}
                                      </select>
                                      {!readOnly && (
                                        <button
                                          onClick={() =>
                                            removeExpectedCall(scenario.id, ci)
                                          }
                                          className="text-zinc-600 hover:text-red-400 transition-colors bg-white/5 rounded-lg p-2 hover:bg-white/10"
                                        >
                                          <Trash2 size={16} />
                                        </button>
                                      )}
                                    </div>

                                    {/* Expected params -- simplified for now */}
                                    {call.expectedParams &&
                                      Object.entries(call.expectedParams).length > 0 && (
                                        <div className="pl-5 space-y-1">
                                          {Object.entries(call.expectedParams).map(
                                            ([key, exp]) => (
                                              <div
                                                key={key}
                                                className="flex items-center gap-2 text-xs"
                                              >
                                                <span className="text-zinc-500 font-mono">
                                                  {key}:
                                                </span>
                                                <span className="text-zinc-400">
                                                  {exp.value
                                                    ? `"${exp.value}"`
                                                    : `(${exp.matchType})`}
                                                </span>
                                                <span className="text-zinc-700">
                                                  [{exp.matchType}]
                                                </span>
                                              </div>
                                            )
                                          )}
                                        </div>
                                      )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      {/* Error simulation (for error_recovery category) */}
                      {scenario.category === "error_recovery" && (
                        <div className="pt-4 border-t border-white/[0.05]">
                          <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                            Simulated Error Message
                          </label>
                          <input
                            value={scenario.simulatedError ?? ""}
                            onChange={(e) =>
                              updateScenario(scenario.id, {
                                simulatedError: e.target.value || null,
                              })
                            }
                            disabled={readOnly}
                            className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 disabled:opacity-50"
                            placeholder="Service temporarily unavailable"
                          />
                        </div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ))}
      </AnimatePresence>

      {scenarios.length === 0 && !readOnly && (
        <div className="text-center py-6">
          <p className="text-zinc-600 text-sm">
            No scenarios defined. Add scenarios to test how models use your tools.
          </p>
        </div>
      )}
    </div>
  );
}
