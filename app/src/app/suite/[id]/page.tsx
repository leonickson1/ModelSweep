"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus, Trash2, Play, ChevronLeft, GripVertical,
  Code, Pencil, Lightbulb, BookOpen, Tag, Save, X, Wrench,
} from "lucide-react";
import Link from "next/link";
import { GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";
import { SkeletonList } from "@/components/ui/skeleton";
import { SuiteTypeSelector } from "@/components/suite/suite-type-selector";
import { ToolEditor } from "@/components/suite/tool-editor";
import { ScenarioEditor } from "@/components/suite/scenario-editor";
import { ConversationEditor } from "@/components/suite/conversation-editor";
import { AdversarialEditor } from "@/components/suite/adversarial-editor";
import { cn } from "@/lib/utils";
import type { PromptCategory, PromptDifficulty, SuiteType, ToolParameter, ExpectedToolCall, ToolScenarioCategory, FailureCondition, DependencyChain } from "@/types";

interface PromptRow {
  id: string;
  text: string;
  category: PromptCategory;
  difficulty: PromptDifficulty;
  expected_behavior: string;
  rubric: string;
  max_tokens: number;
  sort_order: number;
}

interface ToolDef {
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
}

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

interface AdversarialScenarioDef {
  id: string;
  name: string;
  systemPrompt: string;
  attackStrategy: "prompt_extraction" | "jailbreak" | "persona_break" | "data_exfiltration" | "custom";
  maxTurns: number;
  attackIntensity: number;
  failureConditions: FailureCondition[];
  difficulty: "easy" | "medium" | "hard";
  attackerMode: "scripted" | "local";
}

interface Suite {
  id: string;
  name: string;
  description: string;
  suite_type: SuiteType;
  is_built_in: number;
  prompts: PromptRow[];
  toolDefinitions: ToolDef[];
  toolScenarios: ScenarioDef[];
  conversationScenarios: ConversationScenarioDef[];
  adversarialScenarios: AdversarialScenarioDef[];
}

const CATEGORIES: { value: PromptCategory; label: string; icon: React.ReactNode }[] = [
  { value: "coding", label: "Coding", icon: <Code size={12} /> },
  { value: "creative", label: "Creative", icon: <Pencil size={12} /> },
  { value: "reasoning", label: "Reasoning", icon: <Lightbulb size={12} /> },
  { value: "instruction", label: "Instruction", icon: <BookOpen size={12} /> },
  { value: "custom", label: "Custom", icon: <Tag size={12} /> },
];

const DIFFICULTIES: PromptDifficulty[] = ["easy", "medium", "hard"];

const DIFF_COLORS: Record<string, string> = {
  easy: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20",
  medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/20",
  hard: "text-red-400 bg-red-500/10 border-red-500/20",
};

export default function SuiteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [suite, setSuite] = useState<Suite | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedPrompt, setSelectedPrompt] = useState<string | null>(null);
  const [editingPrompt, setEditingPrompt] = useState<Partial<PromptRow> | null>(null);

  const suiteType = suite?.suite_type ?? "standard";
  const isToolCalling = suiteType === "tool_calling";
  const isConversation = suiteType === "conversation";
  const isAdversarial = suiteType === "adversarial";
  const isAgentic = isToolCalling || isConversation || isAdversarial;

  const load = () => {
    fetch(`/api/suites/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.suite) {
          setSuite({
            ...d.suite,
            suite_type: d.suite.suite_type ?? "standard",
            toolDefinitions: d.suite.toolDefinitions ?? [],
            toolScenarios: d.suite.toolScenarios ?? [],
            conversationScenarios: d.suite.conversationScenarios ?? [],
            adversarialScenarios: d.suite.adversarialScenarios ?? [],
          });
          setName(d.suite.name);
          setDescription(d.suite.description);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [id]);

  const saveMeta = async () => {
    await fetch(`/api/suites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, description }),
    });
    setEditingName(false);
    setSuite((s) => s ? { ...s, name, description } : s);
  };

  const changeSuiteType = async (type: SuiteType) => {
    await fetch(`/api/suites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ suiteType: type }),
    });
    setSuite((s) => s ? { ...s, suite_type: type } : s);
  };

  const addPrompt = async () => {
    const res = await fetch(`/api/suites/${id}/prompts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "New prompt...",
        category: "custom",
        difficulty: "medium",
        expectedBehavior: "general",
        rubric: "",
        order: suite?.prompts.length ?? 0,
      }),
    });
    const data = await res.json();
    load();
    if (data.id) setSelectedPrompt(data.id);
  };

  const deletePrompt = async (promptId: string) => {
    await fetch(`/api/suites/${id}/prompts`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: promptId }),
    });
    if (selectedPrompt === promptId) setSelectedPrompt(null);
    load();
  };

  const savePrompt = async () => {
    if (!editingPrompt?.id) return;
    await fetch(`/api/suites/${id}/prompts`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: editingPrompt.id,
        text: editingPrompt.text,
        category: editingPrompt.category,
        difficulty: editingPrompt.difficulty,
        rubric: editingPrompt.rubric,
        maxTokens: editingPrompt.max_tokens,
      }),
    });
    setEditingPrompt(null);
    load();
  };

  const openEditor = (prompt: PromptRow) => {
    setSelectedPrompt(prompt.id);
    setEditingPrompt({ ...prompt });
  };

  if (loading) return <div className="p-8"><SkeletonList count={5} /></div>;
  if (!suite) return <div className="p-8 text-zinc-500">Suite not found.</div>;

  // Type-specific badge label and color
  const TYPE_BADGES: Record<string, { label: string; color: string }> = {
    tool_calling: { label: "Tools", color: "text-blue-300 bg-blue-500/10 border-blue-500/20" },
    conversation: { label: "Convo", color: "text-violet-300 bg-violet-500/10 border-violet-500/20" },
    adversarial: { label: "Attack", color: "text-rose-300 bg-rose-500/10 border-rose-500/20" },
  };

  const scenarioCount = isToolCalling
    ? suite?.toolScenarios.length ?? 0
    : isConversation
    ? suite?.conversationScenarios.length ?? 0
    : isAdversarial
    ? suite?.adversarialScenarios.length ?? 0
    : 0;

  // Agentic modes: shared sidebar + mode-specific editor
  if (isAgentic) {
    const badge = TYPE_BADGES[suiteType];
    return (
      <div className="flex h-full">
        {/* Left sidebar */}
        <div className="w-[340px] flex-shrink-0 border-r border-white/[0.06] flex flex-col h-screen overflow-hidden">
          <div className="p-5 border-b border-white/[0.06]">
            <Link href="/suite" className="flex items-center gap-1.5 text-zinc-500 text-xs hover:text-zinc-300 transition-colors mb-4">
              <ChevronLeft size={13} />
              All Suites
            </Link>

            {editingName ? (
              <div className="space-y-2">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-transparent text-zinc-100 font-semibold text-lg outline-none border-b border-blue-500/40 pb-1"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description..."
                  rows={2}
                  className="w-full bg-transparent text-zinc-400 text-sm outline-none border border-white/10 rounded-lg p-2 resize-none"
                />
                <div className="flex gap-2">
                  <Button size="sm" onClick={saveMeta}><Save size={12} />Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}><X size={12} /></Button>
                </div>
              </div>
            ) : (
              <div className="cursor-pointer group" onClick={() => suite.is_built_in !== 1 && setEditingName(true)}>
                <div className="flex items-center gap-2">
                  <h2 className="text-zinc-100 font-semibold text-lg tracking-tight group-hover:text-white transition-colors">
                    {suite.name}
                  </h2>
                  {badge && (
                    <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", badge.color)}>
                      {badge.label}
                    </span>
                  )}
                </div>
                {suite.description && (
                  <p className="text-zinc-500 text-xs mt-1">{suite.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Stats sidebar */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            <div className="space-y-1">
              {isToolCalling && (
                <div className="flex items-center gap-2 text-zinc-400 text-xs">
                  <Wrench size={12} />
                  <span>{suite.toolDefinitions.length} tool{suite.toolDefinitions.length !== 1 ? "s" : ""} defined</span>
                </div>
              )}
              <div className="flex items-center gap-2 text-zinc-400 text-xs">
                <BookOpen size={12} />
                <span>{scenarioCount} scenario{scenarioCount !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {suite.is_built_in !== 1 && (
              <div>
                <label className="text-zinc-600 text-[10px] uppercase tracking-wider block mb-2">
                  Suite Type
                </label>
                <SuiteTypeSelector
                  value={suiteType}
                  onChange={changeSuiteType}
                  disabled={suite.is_built_in === 1}
                />
              </div>
            )}
          </div>

          <div className="p-3 border-t border-white/[0.06]">
            <Link href={`/suite/${id}/run`} className="block">
              <Button className="w-full" variant="primary" size="sm" disabled={scenarioCount === 0}>
                <Play size={13} />
                Run Suite
              </Button>
            </Link>
          </div>
        </div>

        {/* Right: Mode-specific editors */}
        <div className="flex-1 overflow-y-auto p-8">
          <div className="max-w-3xl mx-auto space-y-8">
            {isToolCalling && (
              <>
                <ToolEditor
                  tools={suite.toolDefinitions}
                  suiteId={id}
                  readOnly={suite.is_built_in === 1}
                  onToolsChange={(tools) => setSuite((s) => s ? { ...s, toolDefinitions: tools } : s)}
                />
                <div className="border-t border-white/[0.06]" />
                <ScenarioEditor
                  scenarios={suite.toolScenarios}
                  suiteId={id}
                  toolNames={suite.toolDefinitions.map((t) => t.name)}
                  readOnly={suite.is_built_in === 1}
                  onScenariosChange={(scenarios) => setSuite((s) => s ? { ...s, toolScenarios: scenarios } : s)}
                />
              </>
            )}

            {isConversation && (
              <ConversationEditor
                scenarios={suite.conversationScenarios}
                suiteId={id}
                readOnly={suite.is_built_in === 1}
                onScenariosChange={(scenarios) => setSuite((s) => s ? { ...s, conversationScenarios: scenarios } : s)}
              />
            )}

            {isAdversarial && (
              <AdversarialEditor
                scenarios={suite.adversarialScenarios}
                suiteId={id}
                readOnly={suite.is_built_in === 1}
                onScenariosChange={(scenarios) => setSuite((s) => s ? { ...s, adversarialScenarios: scenarios } : s)}
              />
            )}
          </div>
        </div>
      </div>
    );
  }

  // Standard mode: original layout
  return (
    <div className="flex h-full">
      {/* Left: Prompt list */}
      <div className="w-[340px] flex-shrink-0 border-r border-white/[0.06] flex flex-col h-screen overflow-hidden">
        <div className="p-5 border-b border-white/[0.06]">
          <Link href="/suite" className="flex items-center gap-1.5 text-zinc-500 text-xs hover:text-zinc-300 transition-colors mb-4">
            <ChevronLeft size={13} />
            All Suites
          </Link>

          {editingName ? (
            <div className="space-y-2">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-transparent text-zinc-100 font-semibold text-lg outline-none border-b border-blue-500/40 pb-1"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description..."
                rows={2}
                className="w-full bg-transparent text-zinc-400 text-sm outline-none border border-white/10 rounded-lg p-2 resize-none"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={saveMeta}><Save size={12} />Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)}><X size={12} /></Button>
              </div>
            </div>
          ) : (
            <div className="cursor-pointer group" onClick={() => suite.is_built_in !== 1 && setEditingName(true)}>
              <h2 className="text-zinc-100 font-semibold text-lg tracking-tight group-hover:text-white transition-colors">
                {suite.name}
              </h2>
              {suite.description && (
                <p className="text-zinc-500 text-xs mt-1">{suite.description}</p>
              )}
            </div>
          )}

          {/* Suite type selector for standard suites */}
          {suite.is_built_in !== 1 && (
            <div className="mt-4">
              <SuiteTypeSelector
                value={suiteType}
                onChange={changeSuiteType}
              />
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1">
          {suite.prompts.length === 0 ? (
            <div className="text-center py-8 text-zinc-600 text-sm">
              No prompts yet. Add one below.
            </div>
          ) : (
            suite.prompts.map((prompt, i) => (
              <motion.button
                key={prompt.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.03 * i }}
                onClick={() => openEditor(prompt)}
                className={cn(
                  "w-full text-left px-3 py-2.5 rounded-xl transition-colors group flex items-start gap-2.5",
                  selectedPrompt === prompt.id
                    ? "bg-blue-500/10 border border-blue-500/20"
                    : "hover:bg-white/5 border border-transparent"
                )}
              >
                <GripVertical size={14} className="text-zinc-700 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-zinc-300 text-sm truncate">{prompt.text}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className={cn("text-xs px-1.5 py-0.5 rounded border", DIFF_COLORS[prompt.difficulty])}>
                      {prompt.difficulty}
                    </span>
                    <span className="text-zinc-600 text-xs">{prompt.category}</span>
                  </div>
                </div>
                {suite.is_built_in !== 1 && (
                  <button
                    onClick={(e) => { e.stopPropagation(); deletePrompt(prompt.id); }}
                    className="opacity-0 group-hover:opacity-100 text-zinc-600 hover:text-red-400 transition-all p-1 rounded-lg"
                    aria-label="Delete prompt"
                  >
                    <Trash2 size={12} />
                  </button>
                )}
              </motion.button>
            ))
          )}
        </div>

        <div className="p-3 border-t border-white/[0.06] space-y-2">
          {suite.is_built_in !== 1 && (
            <Button className="w-full" variant="secondary" size="sm" onClick={addPrompt}>
              <Plus size={13} />
              Add Prompt
            </Button>
          )}
          <Link href={`/suite/${id}/run`} className="block">
            <Button className="w-full" variant="primary" size="sm">
              <Play size={13} />
              Run Suite
            </Button>
          </Link>
        </div>
      </div>

      {/* Right: Prompt editor */}
      <div className="flex-1 overflow-y-auto p-8">
        <AnimatePresence mode="wait">
          {editingPrompt ? (
            <motion.div
              key={editingPrompt.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="max-w-2xl mx-auto space-y-6"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-zinc-300 font-medium">Edit Prompt</h2>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setEditingPrompt(null)}>
                    <X size={13} />
                    Discard
                  </Button>
                  <Button variant="primary" size="sm" onClick={savePrompt}>
                    <Save size={13} />
                    Save
                  </Button>
                </div>
              </div>

              {/* Prompt text */}
              <GlowCard className="p-5" animate={false}>
                <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider block mb-3">
                  Prompt Text
                </label>
                <textarea
                  value={editingPrompt.text || ""}
                  onChange={(e) => setEditingPrompt((p) => ({ ...p, text: e.target.value }))}
                  rows={6}
                  disabled={suite.is_built_in === 1}
                  className="w-full bg-transparent text-zinc-200 text-sm outline-none resize-none placeholder:text-zinc-600 disabled:opacity-60"
                  placeholder="Enter your prompt here. Use {{variable}} for dynamic values."
                />
              </GlowCard>

              {/* Category & Difficulty */}
              <div className="grid grid-cols-2 gap-4">
                <GlowCard className="p-4" animate={false}>
                  <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider block mb-3">
                    Category
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {CATEGORIES.map(({ value, label, icon }) => (
                      <button
                        key={value}
                        onClick={() => suite.is_built_in !== 1 && setEditingPrompt((p) => ({ ...p, category: value }))}
                        disabled={suite.is_built_in === 1}
                        className={cn(
                          "flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors border",
                          editingPrompt.category === value
                            ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                            : "text-zinc-500 bg-white/5 border-white/[0.06] hover:bg-white/10"
                        )}
                      >
                        {icon}
                        {label}
                      </button>
                    ))}
                  </div>
                </GlowCard>

                <GlowCard className="p-4" animate={false}>
                  <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider block mb-3">
                    Difficulty
                  </label>
                  <div className="flex gap-2">
                    {DIFFICULTIES.map((diff) => (
                      <button
                        key={diff}
                        onClick={() => suite.is_built_in !== 1 && setEditingPrompt((p) => ({ ...p, difficulty: diff }))}
                        disabled={suite.is_built_in === 1}
                        className={cn(
                          "flex-1 py-1.5 rounded-lg text-xs capitalize transition-colors border",
                          editingPrompt.difficulty === diff
                            ? DIFF_COLORS[diff]
                            : "text-zinc-600 bg-white/5 border-white/[0.06] hover:bg-white/10"
                        )}
                      >
                        {diff}
                      </button>
                    ))}
                  </div>
                </GlowCard>
              </div>

              {/* Rubric */}
              <GlowCard className="p-5" animate={false}>
                <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider block mb-3">
                  Evaluation Rubric
                  <span className="normal-case ml-2 text-zinc-600 font-normal">— what a good answer looks like</span>
                </label>
                <textarea
                  value={editingPrompt.rubric || ""}
                  onChange={(e) => setEditingPrompt((p) => ({ ...p, rubric: e.target.value }))}
                  rows={3}
                  disabled={suite.is_built_in === 1}
                  className="w-full bg-transparent text-zinc-300 text-sm outline-none resize-none placeholder:text-zinc-600 disabled:opacity-60"
                  placeholder="Describe what a correct or high-quality response looks like..."
                />
              </GlowCard>

              {/* Max tokens */}
              <GlowCard className="p-5" animate={false}>
                <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider block mb-3">
                  Max Tokens
                </label>
                <input
                  type="number"
                  value={editingPrompt.max_tokens || 1024}
                  onChange={(e) => setEditingPrompt((p) => ({ ...p, max_tokens: parseInt(e.target.value) }))}
                  disabled={suite.is_built_in === 1}
                  min={64}
                  max={8192}
                  className="bg-transparent text-zinc-200 text-sm outline-none w-24 border-b border-white/10 pb-0.5 disabled:opacity-60"
                />
              </GlowCard>
            </motion.div>
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex flex-col items-center justify-center h-full text-center py-24"
            >
              <div className="text-zinc-700 mb-4"><BookOpen size={40} /></div>
              <p className="text-zinc-500 text-sm">Select a prompt to edit it</p>
              {suite.is_built_in !== 1 && (
                <Button className="mt-4" variant="secondary" size="sm" onClick={addPrompt}>
                  <Plus size={13} />
                  Add first prompt
                </Button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
