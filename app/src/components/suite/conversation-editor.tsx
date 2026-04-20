"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ConversationScenarioDef {
  id: string;
  name: string;
  systemPrompt: string;
  userPersona: string;
  turnCount: number;
  evaluationCriteria: string[];
  difficulty: "easy" | "medium" | "hard";
  simulatorMode: "scripted" | "local";
  scriptedMessages?: string[];
}

interface ConversationEditorProps {
  scenarios: ConversationScenarioDef[];
  suiteId: string;
  readOnly?: boolean;
  onScenariosChange: (scenarios: ConversationScenarioDef[]) => void;
}

const DEFAULT_CRITERIA = [
  "Context retention",
  "Persona consistency",
  "Policy adherence",
  "Empathy",
  "Factual consistency",
] as const;

const DIFFICULTY_OPTIONS = ["easy", "medium", "hard"] as const;

const DIFFICULTY_COLORS: Record<string, string> = {
  easy: "text-emerald-400",
  medium: "text-amber-400",
  hard: "text-red-400",
};

export function ConversationEditor({
  scenarios,
  suiteId,
  readOnly,
  onScenariosChange,
}: ConversationEditorProps) {
  const [expandedScenario, setExpandedScenario] = useState<string | null>(null);
  const [customCriteriaInput, setCustomCriteriaInput] = useState<Record<string, string>>({});

  const addScenario = async () => {
    const res = await fetch(`/api/suites/${suiteId}/conversations`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "New Scenario",
        systemPrompt: "",
        userPersona: "",
        turnCount: 5,
        evaluationCriteria: [...DEFAULT_CRITERIA],
        difficulty: "medium",
        simulatorMode: "local",
        scriptedMessages: [],
        order: scenarios.length,
      }),
    });
    const data = await res.json();
    const newScenario: ConversationScenarioDef = {
      id: data.id,
      name: "New Scenario",
      systemPrompt: "",
      userPersona: "",
      turnCount: 5,
      evaluationCriteria: [...DEFAULT_CRITERIA],
      difficulty: "medium",
      simulatorMode: "local",
      scriptedMessages: [],
    };
    onScenariosChange([...scenarios, newScenario]);
    setExpandedScenario(data.id);
  };

  const deleteScenario = async (scenarioId: string) => {
    await fetch(`/api/suites/${suiteId}/conversations`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: scenarioId }),
    });
    onScenariosChange(scenarios.filter((s) => s.id !== scenarioId));
    if (expandedScenario === scenarioId) setExpandedScenario(null);
  };

  const updateScenario = async (
    scenarioId: string,
    updates: Partial<ConversationScenarioDef>
  ) => {
    await fetch(`/api/suites/${suiteId}/conversations`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: scenarioId, ...updates }),
    });
    onScenariosChange(
      scenarios.map((s) => (s.id === scenarioId ? { ...s, ...updates } : s))
    );
  };

  const toggleCriterion = (scenarioId: string, criterion: string) => {
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario) return;
    const criteria = scenario.evaluationCriteria.includes(criterion)
      ? scenario.evaluationCriteria.filter((c) => c !== criterion)
      : [...scenario.evaluationCriteria, criterion];
    updateScenario(scenarioId, { evaluationCriteria: criteria });
  };

  const addCustomCriterion = (scenarioId: string) => {
    const value = (customCriteriaInput[scenarioId] || "").trim();
    if (!value) return;
    const scenario = scenarios.find((s) => s.id === scenarioId);
    if (!scenario || scenario.evaluationCriteria.includes(value)) return;
    updateScenario(scenarioId, {
      evaluationCriteria: [...scenario.evaluationCriteria, value],
    });
    setCustomCriteriaInput((prev) => ({ ...prev, [scenarioId]: "" }));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">
          Conversation Scenarios
        </h3>
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={addScenario}>
            <Plus size={12} />
            Add Scenario
          </Button>
        )}
      </div>

      <AnimatePresence mode="popLayout">
        {scenarios.map((scenario) => (
          <motion.div
            key={scenario.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <div className="border-b border-white/[0.05] overflow-hidden">
              {/* Scenario header — collapsed view */}
              <button
                onClick={() =>
                  setExpandedScenario(
                    expandedScenario === scenario.id ? null : scenario.id
                  )
                }
                className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.04] transition-colors apple-list-row cursor-pointer"
              >
                <GripVertical size={16} className="text-zinc-700 flex-shrink-0" />
                <MessageSquare size={16} className="text-violet-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-white text-[17px] font-medium tracking-tight mb-1">
                    {scenario.name}
                  </span>
                </div>
                <span className="text-zinc-600 text-xs font-mono">
                  {scenario.turnCount} turn{scenario.turnCount !== 1 ? "s" : ""}
                </span>
                <span
                  className={`text-xs font-medium ${DIFFICULTY_COLORS[scenario.difficulty]}`}
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
                {expandedScenario === scenario.id ? (
                  <ChevronUp size={14} className="text-zinc-600" />
                ) : (
                  <ChevronDown size={14} className="text-zinc-600" />
                )}
              </button>

              {/* Expanded scenario details */}
              <AnimatePresence>
                {expandedScenario === scenario.id && (
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
                          onChange={(e) =>
                            updateScenario(scenario.id, { name: e.target.value })
                          }
                          disabled={readOnly}
                          className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 disabled:opacity-50"
                          placeholder="e.g. Angry customer refund request"
                        />
                      </div>

                      {/* System prompt */}
                      <div>
                        <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                          System Prompt
                        </label>
                        <textarea
                          value={scenario.systemPrompt}
                          onChange={(e) =>
                            updateScenario(scenario.id, {
                              systemPrompt: e.target.value,
                            })
                          }
                          disabled={readOnly}
                          rows={3}
                          className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 disabled:opacity-50 resize-y"
                          placeholder="You are a customer support agent for..."
                        />
                      </div>

                      {/* User persona */}
                      <div>
                        <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                          User Persona
                        </label>
                        <textarea
                          value={scenario.userPersona}
                          onChange={(e) =>
                            updateScenario(scenario.id, {
                              userPersona: e.target.value,
                            })
                          }
                          disabled={readOnly}
                          rows={2}
                          className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 disabled:opacity-50 resize-y"
                          placeholder="Frustrated customer who received a damaged item..."
                        />
                      </div>

                      {/* Turn count & Difficulty */}
                      <div className="grid grid-cols-2 gap-6">
                        <div>
                          <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                            Turn Count
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={20}
                            value={scenario.turnCount}
                            onChange={(e) => {
                              const val = Math.min(
                                20,
                                Math.max(1, parseInt(e.target.value) || 1)
                              );
                              updateScenario(scenario.id, { turnCount: val });
                            }}
                            disabled={readOnly}
                            className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                            Difficulty
                          </label>
                          <div className="flex gap-2">
                            {DIFFICULTY_OPTIONS.map((d) => (
                              <button
                                key={d}
                                onClick={() =>
                                  !readOnly &&
                                  updateScenario(scenario.id, { difficulty: d })
                                }
                                disabled={readOnly}
                                className={`flex-1 text-[14px] font-semibold capitalize py-3 rounded-xl border transition-all ${
                                  scenario.difficulty === d
                                    ? d === "easy"
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                      : d === "medium"
                                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                        : "border-red-500/30 bg-red-500/10 text-red-400"
                                    : "border-white/10 bg-[#121214] text-zinc-500 hover:text-zinc-300 hover:bg-white/5"
                                } disabled:opacity-50`}
                              >
                                {d}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Simulator mode */}
                      <div>
                        <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">
                          Simulator Mode
                        </label>
                        <div className="flex gap-4">
                          {(["scripted", "local"] as const).map((mode) => (
                            <label
                              key={mode}
                              className="flex items-center gap-2 cursor-pointer"
                            >
                              <input
                                type="radio"
                                name={`simulator-mode-${scenario.id}`}
                                value={mode}
                                checked={scenario.simulatorMode === mode}
                                onChange={() =>
                                  !readOnly &&
                                  updateScenario(scenario.id, {
                                    simulatorMode: mode,
                                  })
                                }
                                disabled={readOnly}
                                className="accent-blue-500 w-4 h-4"
                              />
                              <span
                                className={`text-[15px] font-medium ${
                                  scenario.simulatorMode === mode
                                    ? "text-white"
                                    : "text-zinc-500"
                                }`}
                              >
                                {mode === "scripted"
                                  ? "Scripted messages"
                                  : "Local LLM simulator"}
                              </span>
                            </label>
                          ))}
                        </div>
                      </div>

                      {/* Scripted messages (shown when mode is scripted) */}
                      {scenario.simulatorMode === "scripted" && (
                        <div className="pt-4 border-t border-white/[0.05]">
                          <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-4">
                            Scripted User Messages
                          </label>
                          <div className="space-y-3">
                            {(scenario.scriptedMessages || []).map((msg, mi) => (
                              <div key={mi} className="flex items-start gap-4">
                                <span className="text-zinc-500 text-[14px] font-mono mt-3 text-right flex-shrink-0">
                                  {mi + 1}.
                                </span>
                                <input
                                  value={msg}
                                  onChange={(e) => {
                                    const updated = [
                                      ...(scenario.scriptedMessages || []),
                                    ];
                                    updated[mi] = e.target.value;
                                    updateScenario(scenario.id, {
                                      scriptedMessages: updated,
                                    });
                                  }}
                                  disabled={readOnly}
                                  className="flex-1 bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 disabled:opacity-50"
                                  placeholder={`User message for turn ${mi + 1}`}
                                />
                                {!readOnly && (
                                  <button
                                    onClick={() => {
                                      const updated = (
                                        scenario.scriptedMessages || []
                                      ).filter((_, i) => i !== mi);
                                      updateScenario(scenario.id, {
                                        scriptedMessages: updated,
                                      });
                                    }}
                                    className="text-zinc-600 hover:text-red-400 transition-colors bg-white/5 rounded-lg p-3 hover:bg-white/10 mt-1"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {!readOnly && (
                              <div className="pt-2">
                                <button
                                  onClick={() =>
                                    updateScenario(scenario.id, {
                                      scriptedMessages: [
                                        ...(scenario.scriptedMessages || []),
                                        "",
                                      ],
                                    })
                                  }
                                  className="text-blue-400 text-[14px] font-semibold hover:text-blue-300 transition-colors"
                                >
                                  + Add message
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Evaluation criteria */}
                      <div className="pt-4 border-t border-white/[0.05]">
                        <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-4">
                          Evaluation Criteria
                        </label>
                        <div className="space-y-3">
                          {DEFAULT_CRITERIA.map((criterion) => (
                            <label
                              key={criterion}
                              className="flex items-center gap-3 cursor-pointer group"
                            >
                              <input
                                type="checkbox"
                                checked={scenario.evaluationCriteria.includes(
                                  criterion
                                )}
                                onChange={() =>
                                  toggleCriterion(scenario.id, criterion)
                                }
                                disabled={readOnly}
                                className="rounded border-white/20 accent-blue-500 w-4 h-4"
                              />
                              <span className="text-[15px] font-medium text-zinc-400 group-hover:text-zinc-300 transition-colors">
                                {criterion}
                              </span>
                            </label>
                          ))}
                          {/* Custom criteria already added */}
                          {scenario.evaluationCriteria
                            .filter(
                              (c) =>
                                !DEFAULT_CRITERIA.includes(
                                  c as (typeof DEFAULT_CRITERIA)[number]
                                )
                            )
                            .map((criterion) => (
                              <label
                                key={criterion}
                                className="flex items-center gap-3 cursor-pointer group"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() =>
                                    toggleCriterion(scenario.id, criterion)
                                  }
                                  disabled={readOnly}
                                  className="rounded border-white/20 accent-blue-500 w-4 h-4"
                                />
                                <span className="text-[15px] font-medium text-violet-400 group-hover:text-violet-300 transition-colors">
                                  {criterion}
                                </span>
                                {!readOnly && (
                                  <button
                                    onClick={() =>
                                      toggleCriterion(scenario.id, criterion)
                                    }
                                    className="text-zinc-600 hover:text-red-400 transition-colors ml-auto bg-white/5 rounded-lg p-2 hover:bg-white/10"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </label>
                            ))}
                        </div>

                        {/* Add custom criterion */}
                        {!readOnly && (
                          <div className="flex items-center gap-3 mt-4">
                            <input
                              value={customCriteriaInput[scenario.id] || ""}
                              onChange={(e) =>
                                setCustomCriteriaInput((prev) => ({
                                  ...prev,
                                  [scenario.id]: e.target.value,
                                }))
                              }
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  addCustomCriterion(scenario.id);
                                }
                              }}
                              className="flex-1 bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white outline-none focus:border-white/30 placeholder:text-zinc-600"
                              placeholder="Add custom criterion..."
                            />
                            <button
                              onClick={() => addCustomCriterion(scenario.id)}
                              className="text-white bg-white/10 px-4 py-3 rounded-xl text-[14px] font-semibold hover:bg-white/20 transition-colors"
                            >
                              Add
                            </button>
                          </div>
                        )}
                      </div>
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
          <p className="text-zinc-600 text-sm mb-1">
            No conversation scenarios defined yet.
          </p>
          <p className="text-zinc-700 text-xs">
            Add a scenario to evaluate multi-turn conversation handling.
          </p>
        </div>
      )}
    </div>
  );
}
