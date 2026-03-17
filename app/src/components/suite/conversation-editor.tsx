"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Trash2, ChevronDown, ChevronUp, GripVertical, MessageSquare } from "lucide-react";
import { GlowCard } from "@/components/ui/glow-card";
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
      <div className="flex items-center justify-between">
        <h3 className="text-zinc-400 text-xs font-medium uppercase tracking-wider">
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
            <GlowCard className="p-0 overflow-hidden" animate={false}>
              {/* Scenario header — collapsed view */}
              <button
                onClick={() =>
                  setExpandedScenario(
                    expandedScenario === scenario.id ? null : scenario.id
                  )
                }
                className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-white/[0.03] transition-colors"
              >
                <GripVertical size={14} className="text-zinc-700 flex-shrink-0" />
                <MessageSquare size={14} className="text-violet-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-zinc-200 text-sm font-medium">
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
                    <div className="px-4 pb-4 space-y-4 border-t border-white/[0.06]">
                      {/* Name */}
                      <div className="pt-3">
                        <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                          Scenario Name
                        </label>
                        <input
                          value={scenario.name}
                          onChange={(e) =>
                            updateScenario(scenario.id, { name: e.target.value })
                          }
                          disabled={readOnly}
                          className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-200 outline-none focus:border-blue-500/30 disabled:opacity-50"
                          placeholder="e.g. Angry customer refund request"
                        />
                      </div>

                      {/* System prompt */}
                      <div>
                        <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
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
                          className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none focus:border-blue-500/30 disabled:opacity-50 resize-y"
                          placeholder="You are a customer support agent for..."
                        />
                      </div>

                      {/* User persona */}
                      <div>
                        <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
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
                          className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-2 text-sm text-zinc-300 outline-none focus:border-blue-500/30 disabled:opacity-50 resize-y"
                          placeholder="Frustrated customer who received a damaged item..."
                        />
                      </div>

                      {/* Turn count & Difficulty */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
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
                            className="w-full bg-white/5 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-200 font-mono outline-none focus:border-blue-500/30 disabled:opacity-50"
                          />
                        </div>

                        <div>
                          <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
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
                                className={`flex-1 text-xs py-1.5 rounded-lg border transition-colors ${
                                  scenario.difficulty === d
                                    ? d === "easy"
                                      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                                      : d === "medium"
                                        ? "border-amber-500/30 bg-amber-500/10 text-amber-400"
                                        : "border-red-500/30 bg-red-500/10 text-red-400"
                                    : "border-white/[0.06] bg-white/5 text-zinc-500 hover:text-zinc-300 hover:bg-white/10"
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
                        <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                          Simulator Mode
                        </label>
                        <div className="flex gap-3">
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
                                className="accent-blue-500"
                              />
                              <span
                                className={`text-xs ${
                                  scenario.simulatorMode === mode
                                    ? "text-zinc-200"
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
                        <div>
                          <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-1">
                            Scripted User Messages
                          </label>
                          <div className="space-y-2">
                            {(scenario.scriptedMessages || []).map((msg, mi) => (
                              <div key={mi} className="flex items-start gap-2">
                                <span className="text-zinc-700 text-xs font-mono mt-2 w-5 text-right flex-shrink-0">
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
                                  className="flex-1 bg-white/5 border border-white/[0.06] rounded-lg px-3 py-1.5 text-sm text-zinc-300 outline-none focus:border-blue-500/30 disabled:opacity-50"
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
                                    className="text-zinc-700 hover:text-red-400 transition-colors p-1 mt-1"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {!readOnly && (
                              <button
                                onClick={() =>
                                  updateScenario(scenario.id, {
                                    scriptedMessages: [
                                      ...(scenario.scriptedMessages || []),
                                      "",
                                    ],
                                  })
                                }
                                className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
                              >
                                + Add message
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Evaluation criteria */}
                      <div>
                        <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-2">
                          Evaluation Criteria
                        </label>
                        <div className="space-y-1.5">
                          {DEFAULT_CRITERIA.map((criterion) => (
                            <label
                              key={criterion}
                              className="flex items-center gap-2 cursor-pointer group"
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
                                className="rounded border-white/20 accent-blue-500"
                              />
                              <span className="text-xs text-zinc-400 group-hover:text-zinc-300 transition-colors">
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
                                className="flex items-center gap-2 cursor-pointer group"
                              >
                                <input
                                  type="checkbox"
                                  checked
                                  onChange={() =>
                                    toggleCriterion(scenario.id, criterion)
                                  }
                                  disabled={readOnly}
                                  className="rounded border-white/20 accent-blue-500"
                                />
                                <span className="text-xs text-violet-400 group-hover:text-violet-300 transition-colors">
                                  {criterion}
                                </span>
                                {!readOnly && (
                                  <button
                                    onClick={() =>
                                      toggleCriterion(scenario.id, criterion)
                                    }
                                    className="text-zinc-700 hover:text-red-400 transition-colors ml-auto"
                                  >
                                    <Trash2 size={10} />
                                  </button>
                                )}
                              </label>
                            ))}
                        </div>

                        {/* Add custom criterion */}
                        {!readOnly && (
                          <div className="flex items-center gap-2 mt-2">
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
                              className="flex-1 bg-white/5 border border-white/[0.06] rounded-lg px-3 py-1 text-xs text-zinc-300 outline-none focus:border-blue-500/30 placeholder:text-zinc-700"
                              placeholder="Custom criterion..."
                            />
                            <button
                              onClick={() => addCustomCriterion(scenario.id)}
                              className="text-blue-400 text-xs hover:text-blue-300 transition-colors"
                            >
                              + Add
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </GlowCard>
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
