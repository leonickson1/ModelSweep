"use client";

import { useState } from "react";
import { Plus, Trash2, Code, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface TestCase {
  id: string;
  input: unknown;
  expectedOutput: unknown;
  description?: string;
}

interface CodingScenario {
  id: string;
  name: string;
  description: string;
  language: string;
  functionSignature: string;
  testCases: TestCase[];
  difficulty: string;
  timeLimitMs: number;
}

interface CodingEditorProps {
  scenarios: CodingScenario[];
  suiteId: string;
  readOnly?: boolean;
  onScenariosChange: (scenarios: CodingScenario[]) => void;
}

const LANGUAGES = ["python", "javascript", "go", "rust"];
const DIFFICULTIES = ["easy", "medium", "hard"];
const DIFF_COLORS: Record<string, string> = {
  easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  hard: "text-red-400 bg-red-500/10 border-red-500/20",
};

export function CodingEditor({ scenarios, suiteId, readOnly, onScenariosChange }: CodingEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const addScenario = async () => {
    const res = await fetch(`/api/suites/${suiteId}/coding`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Coding Scenario",
        language: "python",
        functionSignature: "def solve(input):",
        testCases: [{ id: "tc-1", input: "", expectedOutput: "", description: "Test case 1" }],
        order: scenarios.length,
      }),
    });
    const data = await res.json();
    const newScenario: CodingScenario = {
      id: data.id,
      name: "New Coding Scenario",
      description: "",
      language: "python",
      functionSignature: "def solve(input):",
      testCases: [{ id: "tc-1", input: "", expectedOutput: "", description: "Test case 1" }],
      difficulty: "medium",
      timeLimitMs: 30000,
    };
    onScenariosChange([...scenarios, newScenario]);
    setExpandedId(data.id);
  };

  const updateScenario = async (id: string, updates: Partial<CodingScenario>) => {
    await fetch(`/api/suites/${suiteId}/coding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id, ...updates }),
    });
    onScenariosChange(scenarios.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteScenario = async (id: string) => {
    await fetch(`/api/suites/${suiteId}/coding`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id }),
    });
    onScenariosChange(scenarios.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">Coding Scenarios</h2>
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={addScenario}>
            <Plus size={12} /> Add Scenario
          </Button>
        )}
      </div>

      {scenarios.length === 0 && (
        <p className="text-zinc-600 text-sm py-8 text-center">No coding scenarios yet. Add one to get started.</p>
      )}

      {scenarios.map(scenario => {
        const expanded = expandedId === scenario.id;
        return (
          <div key={scenario.id} className="border-b border-white/[0.05] overflow-hidden">
            {/* Header */}
            <button
              onClick={() => setExpandedId(expanded ? null : scenario.id)}
              className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.04] transition-colors apple-list-row cursor-pointer"
            >
              <Code size={16} className="text-cyan-400 flex-shrink-0" />
              <span className="text-white text-[17px] font-medium tracking-tight flex-1 truncate">{scenario.name}</span>
              <span className="text-zinc-400 text-[12px] font-mono uppercase">{scenario.language}</span>
              <span className={cn("text-[10px] px-2 py-0.5 rounded-full border font-mono", DIFF_COLORS[scenario.difficulty])}>
                {scenario.difficulty}
              </span>
              <span className="text-zinc-500 text-[14px] font-medium">{scenario.testCases.length} tests</span>
              <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", expanded && "rotate-180")} />
            </button>

            {/* Expanded editor */}
            {expanded && (
              <div className="p-6 space-y-6 border-t border-white/[0.05] bg-[#09090B]">
                {/* Name & Description */}
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Name</label>
                    <input
                      value={scenario.name}
                      onChange={e => updateScenario(scenario.id, { name: e.target.value })}
                      disabled={readOnly}
                      className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none focus:border-cyan-500/30"
                    />
                  </div>
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Language</label>
                    <select
                      value={scenario.language}
                      onChange={e => updateScenario(scenario.id, { language: e.target.value })}
                      disabled={readOnly}
                      className="w-full bg-[#1A1A1C] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none"
                    >
                      {LANGUAGES.map(l => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Description</label>
                  <textarea
                    value={scenario.description}
                    onChange={e => updateScenario(scenario.id, { description: e.target.value })}
                    disabled={readOnly}
                    rows={2}
                    className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Function Signature</label>
                    <input
                      value={scenario.functionSignature}
                      onChange={e => updateScenario(scenario.id, { functionSignature: e.target.value })}
                      disabled={readOnly}
                      placeholder={scenario.language === "python" ? "def two_sum(nums: list, target: int) -> list:" : "function twoSum(nums, target) { }"}
                      className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[14px] text-cyan-300 font-mono focus:outline-none focus:border-cyan-500/30"
                    />
                    <p className="text-zinc-600 text-[11px] mt-1.5">The model will implement this exact function. For multi-param functions, test inputs must be arrays of args.</p>
                  </div>
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Difficulty</label>
                    <select
                      value={scenario.difficulty}
                      onChange={e => updateScenario(scenario.id, { difficulty: e.target.value })}
                      disabled={readOnly}
                      className="w-full bg-[#1A1A1C] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none"
                    >
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

                {/* Test Cases */}
                <div className="pt-4 border-t border-white/[0.05]">
                  <div className="flex items-center justify-between mb-4">
                    <label className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">Test Cases</label>
                    {!readOnly && (
                      <button
                        onClick={() => {
                          const newTc: TestCase = { id: `tc-${Date.now()}`, input: "", expectedOutput: "", description: "" };
                          updateScenario(scenario.id, { testCases: [...scenario.testCases, newTc] });
                        }}
                        className="text-blue-400 text-[13px] font-semibold hover:text-blue-300 transition-colors"
                      >
                        + Add Test
                      </button>
                    )}
                  </div>
                  <div className="space-y-3">
                    {scenario.testCases.map((tc, i) => (
                      <div key={tc.id} className="flex items-start gap-3 bg-[#121214] border border-white/10 rounded-xl p-3">
                        <span className="text-zinc-500 text-[14px] font-mono mt-3 w-5 flex-shrink-0 text-center">{i + 1}</span>
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-zinc-500 text-[11px] font-bold tracking-widest uppercase block mb-1">Input (JSON)</label>
                            <input
                              value={typeof tc.input === "string" ? tc.input : JSON.stringify(tc.input)}
                              onChange={e => {
                                const newTcs = [...scenario.testCases];
                                try { newTcs[i] = { ...tc, input: JSON.parse(e.target.value) }; } catch { newTcs[i] = { ...tc, input: e.target.value }; }
                                updateScenario(scenario.id, { testCases: newTcs });
                              }}
                              disabled={readOnly}
                              className="w-full bg-[#1A1A1C] border border-white/10 rounded-lg px-3 py-2 text-[14px] text-zinc-300 font-mono focus:outline-none focus:border-white/30"
                            />
                          </div>
                          <div>
                            <label className="text-zinc-500 text-[11px] font-bold tracking-widest uppercase block mb-1">Expected (JSON)</label>
                            <input
                              value={typeof tc.expectedOutput === "string" ? tc.expectedOutput : JSON.stringify(tc.expectedOutput)}
                              onChange={e => {
                                const newTcs = [...scenario.testCases];
                                try { newTcs[i] = { ...tc, expectedOutput: JSON.parse(e.target.value) }; } catch { newTcs[i] = { ...tc, expectedOutput: e.target.value }; }
                                updateScenario(scenario.id, { testCases: newTcs });
                              }}
                              disabled={readOnly}
                              className="w-full bg-[#1A1A1C] border border-white/10 rounded-lg px-3 py-2 text-[14px] text-emerald-300 font-mono focus:outline-none focus:border-white/30"
                            />
                          </div>
                          <div className="flex items-end gap-2">
                            <div className="flex-1">
                              <label className="text-zinc-500 text-[11px] font-bold tracking-widest uppercase block mb-1">Description</label>
                              <input
                                value={tc.description || ""}
                                onChange={e => {
                                  const newTcs = [...scenario.testCases];
                                  newTcs[i] = { ...tc, description: e.target.value };
                                  updateScenario(scenario.id, { testCases: newTcs });
                                }}
                                disabled={readOnly}
                                className="w-full bg-[#1A1A1C] border border-white/10 rounded-lg px-3 py-2 text-[14px] text-zinc-300 focus:outline-none focus:border-white/30"
                              />
                            </div>
                            {!readOnly && (
                              <button
                                onClick={() => {
                                  const newTcs = scenario.testCases.filter((_, j) => j !== i);
                                  updateScenario(scenario.id, { testCases: newTcs });
                                }}
                                className="text-zinc-600 hover:text-red-400 transition-colors bg-white/5 rounded-md p-2 hover:bg-white/10 mb-0.5"
                              >
                                <Trash2 size={16} />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Delete */}
                {!readOnly && (
                  <div className="pt-4 border-t border-white/[0.05]">
                    <button
                      onClick={() => deleteScenario(scenario.id)}
                      className="text-red-400/60 text-[14px] font-semibold hover:text-red-400 transition-colors"
                    >
                      Delete scenario
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
