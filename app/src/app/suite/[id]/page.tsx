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
import { CodingEditor } from "@/components/suite/coding-editor";
import { VisionEditor } from "@/components/suite/vision-editor";
import { RagEditor } from "@/components/suite/rag-editor";
import { cn } from "@/lib/utils";
import { Sparkles, Loader2, Cloud, HardDrive } from "lucide-react";
import { useModelsStore } from "@/store/models-store";
import { useCloudProvidersStore } from "@/store/cloud-providers-store";
import type { PromptCategory, PromptDifficulty, SuiteType, ToolParameter, ExpectedToolCall, ToolScenarioCategory, FailureCondition, DependencyChain } from "@/types";

const GENERATE_MODEL_STORAGE_KEY = "modelsweep:generate:model";

// Vision and RAG suites need real images/documents that a text model can't produce,
// so generation is disabled for them — users must upload files manually.
const GENERATE_UNSUPPORTED_TYPES = new Set(["vision", "rag"]);

function AIGenerateSection({ suiteId, suiteType, onGenerated }: { suiteId: string; suiteType: string; onGenerated: () => void }) {
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>("");

  const { models: localModels } = useModelsStore();
  const { providers: cloudProviders, loaded: cloudLoaded, fetchProviders } = useCloudProvidersStore();

  const unsupported = GENERATE_UNSUPPORTED_TYPES.has(suiteType);

  // Load cloud providers the first time the panel opens.
  useEffect(() => {
    if (open && !cloudLoaded) fetchProviders();
  }, [open, cloudLoaded, fetchProviders]);

  // Initialise default model choice once we know what's available. Prefer last-used, then
  // a configured cloud provider, then the first local model.
  useEffect(() => {
    if (selectedModel) return;
    const stored = typeof window !== "undefined" ? window.localStorage.getItem(GENERATE_MODEL_STORAGE_KEY) : null;
    const cloudOptions = cloudProviders.map((p) => `cloud:${p.id}`);
    const localOptions = localModels.map((m) => m.name);
    const available = [...cloudOptions, ...localOptions];
    if (stored && available.includes(stored)) {
      setSelectedModel(stored);
      return;
    }
    if (cloudOptions.length > 0) setSelectedModel(cloudOptions[0]);
    else if (localOptions.length > 0) setSelectedModel(localOptions[0]);
  }, [cloudProviders, localModels, selectedModel]);

  const onModelChange = (value: string) => {
    setSelectedModel(value);
    try { window.localStorage.setItem(GENERATE_MODEL_STORAGE_KEY, value); } catch { /* ignore */ }
  };

  const hasAnyModel = cloudProviders.length > 0 || localModels.length > 0;

  const saveScenarios = async (items: unknown[], apiPath: string) => {
    for (const item of items) {
      const res = await fetch(`/api/suites/${suiteId}/${apiPath}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(item),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Failed to save to /${apiPath}: ${res.status} ${body.slice(0, 120)}`);
      }
    }
  };

  const generate = async () => {
    if (!prompt.trim() || unsupported) return;
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: prompt,
          suiteType,
          count: suiteType === "coding" ? 1 : 5,
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) { setError(data.error || `Request failed (${res.status})`); return; }

      // Tool calling returns { tools, scenarios } — route each to its own endpoint.
      if (suiteType === "tool_calling") {
        const payload = data.scenarios as { tools?: unknown[]; scenarios?: unknown[] } | unknown[] | null;
        const tools = payload && !Array.isArray(payload) && Array.isArray(payload.tools) ? payload.tools : [];
        const scenarios = payload && !Array.isArray(payload) && Array.isArray(payload.scenarios)
          ? payload.scenarios
          : Array.isArray(payload) ? payload : [];

        if (tools.length === 0 && scenarios.length === 0) {
          setError("No tools or scenarios generated. Try a more specific description.");
          return;
        }

        await saveScenarios(tools, "tools");
        await saveScenarios(scenarios, "scenarios");
      } else {
        const scenarios = Array.isArray(data.scenarios) ? data.scenarios : [];
        if (scenarios.length === 0) { setError("No scenarios generated. Try a more specific description."); return; }

        const apiPath = suiteType === "coding" ? "coding"
          : suiteType === "adversarial" ? "adversarial"
          : suiteType === "conversation" ? "conversations"
          : "prompts";

        await saveScenarios(scenarios, apiPath);
      }

      setPrompt("");
      setOpen(false);
      onGenerated();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setGenerating(false);
    }
  };

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="w-full flex items-center justify-center gap-2 py-3 mt-2 apple-glass text-[14px] font-medium text-zinc-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors">
        <Sparkles size={16} /> Generate Scenarios with AI
      </button>
    );
  }

  if (unsupported) {
    return (
      <div className="space-y-2 p-2.5 rounded-md border border-amber-500/20 bg-amber-500/[0.04]">
        <p className="text-amber-200/90 text-[11px] leading-relaxed">
          AI generation isn&apos;t available for {suiteType === "vision" ? "Vision" : "RAG"} suites —
          these require real {suiteType === "vision" ? "images" : "documents"} that a text model
          can&apos;t produce. Add scenarios manually and upload your own{" "}
          {suiteType === "vision" ? "images" : "documents"}.
        </p>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="w-full">Close</Button>
      </div>
    );
  }

  const isCloudSelected = selectedModel.startsWith("cloud:");

  return (
    <div className="space-y-4 apple-glass-panel rounded-2xl p-4 mt-2">
      <div>
        <label className="text-zinc-400 text-[12px] font-bold uppercase tracking-wider flex items-center gap-1.5 mb-2">
          {isCloudSelected ? <Cloud size={14} /> : <HardDrive size={14} />}
          Generator model
        </label>
        <select
          value={selectedModel}
          onChange={(e) => onModelChange(e.target.value)}
          disabled={!hasAnyModel}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2.5 text-[14px] font-medium text-white outline-none focus:border-zinc-500 disabled:opacity-50 transition-colors"
        >
          {!hasAnyModel && <option value="">No models available</option>}
          {cloudProviders.length > 0 && (
            <optgroup label="Cloud">
              {cloudProviders.map((p) => (
                <option key={`cloud:${p.id}`} value={`cloud:${p.id}`}>
                  {p.label}
                  {p.selectedModel ? ` · ${p.selectedModel}` : ""}
                </option>
              ))}
            </optgroup>
          )}
          {localModels.length > 0 && (
            <optgroup label="Local (Ollama)">
              {localModels.map((m) => (
                <option key={m.name} value={m.name}>{m.name}</option>
              ))}
            </optgroup>
          )}
        </select>
        {!hasAnyModel && (
          <p className="text-zinc-500 text-[13px] mt-2">
            Install an Ollama model or connect a cloud provider in Settings to use generation.
          </p>
        )}
      </div>
      <textarea
        autoFocus
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder={`Describe what to test, e.g. "5 string manipulation problems in Python, 3 easy and 2 hard"`}
        rows={3}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[14px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 focus:bg-white/10 resize-none transition-colors"
      />
      {error && <p className="text-red-400 text-[13px] font-medium">{error}</p>}
      <div className="flex gap-3 pt-2">
        <button onClick={generate} disabled={generating || !prompt.trim() || !hasAnyModel} className="flex-1 h-10 bg-white text-black font-semibold text-[14px] rounded-full flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none shadow-sm">
          {generating ? <><Loader2 size={16} className="animate-spin" /> Generating...</> : <><Sparkles size={16} /> Generate</>}
        </button>
        <button onClick={() => { setOpen(false); setError(null); }} className="px-6 h-10 rounded-full font-medium text-[14px] text-zinc-400 hover:text-white transition-colors">Cancel</button>
      </div>
    </div>
  );
}

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

interface CodingScenarioDef {
  id: string;
  name: string;
  description: string;
  language: string;
  functionSignature: string;
  testCases: Array<{ id: string; input: unknown; expectedOutput: unknown; description?: string }>;
  difficulty: "easy" | "medium" | "hard";
  timeLimitMs: number;
}

interface VisionScenarioDef {
  id: string;
  name: string;
  imageData: string;
  imageMime: string;
  question: string;
  category: string;
  expectedAnswer: string | null;
  rubric: string;
  difficulty: "easy" | "medium" | "hard";
}

interface RagChunkDef {
  id: string;
  text: string;
  source: string;
  tokenCount: number;
}

interface RagDocumentDef {
  id: string;
  filename: string;
  mimeType: string;
  chunks: RagChunkDef[];
}

interface RagScenarioDef {
  id: string;
  documentId: string;
  question: string;
  groundTruthAnswer: string;
  relevantChunkIds: string[];
  distractorChunkIds: string[];
  answerNotInDocument: boolean;
  difficulty: "easy" | "medium" | "hard";
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
  codingScenarios: CodingScenarioDef[];
  visionScenarios: VisionScenarioDef[];
  ragScenarios: RagScenarioDef[];
  ragDocuments: RagDocumentDef[];
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
  const isCoding = suiteType === "coding";
  const isVision = suiteType === "vision";
  const isRag = suiteType === "rag";
  const isAgentic = isToolCalling || isConversation || isAdversarial || isCoding || isVision || isRag;

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
            codingScenarios: d.suite.codingScenarios ?? [],
            visionScenarios: d.suite.visionScenarios ?? [],
            ragScenarios: d.suite.ragScenarios ?? [],
            ragDocuments: d.suite.ragDocuments ?? [],
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
    coding: { label: "Code", color: "text-cyan-300 bg-cyan-500/10 border-cyan-500/20" },
    vision: { label: "Vision", color: "text-amber-300 bg-amber-500/10 border-amber-500/20" },
    rag: { label: "RAG", color: "text-emerald-300 bg-emerald-500/10 border-emerald-500/20" },
  };

  const scenarioCount = isToolCalling
    ? suite?.toolScenarios.length ?? 0
    : isConversation
    ? suite?.conversationScenarios.length ?? 0
    : isAdversarial
    ? suite?.adversarialScenarios.length ?? 0
    : isCoding
    ? suite?.codingScenarios.length ?? 0
    : isVision
    ? suite?.visionScenarios.length ?? 0
    : isRag
    ? suite?.ragScenarios.length ?? 0
    : 0;

  // Agentic modes: shared sidebar + mode-specific editor
  if (isAgentic) {
    const badge = TYPE_BADGES[suiteType];
    return (
      <div className="flex h-full">
        {/* Left sidebar */}
        <div className="w-[380px] flex-shrink-0 border-r border-white/10 flex flex-col h-screen overflow-hidden bg-white/[0.01]">
          <div className="p-6 border-b border-white/10">
            <Link href="/suite" className="flex items-center gap-1.5 text-zinc-400 text-[14px] font-medium hover:text-white transition-colors mb-5">
              <ChevronLeft size={16} />
              All Suites
            </Link>

            {editingName ? (
              <div className="space-y-3">
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg text-white font-semibold text-[20px] px-3 py-2 outline-none focus:border-zinc-500"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description..."
                  rows={2}
                  className="w-full bg-white/5 text-zinc-300 text-[14px] outline-none border border-white/10 rounded-lg px-3 py-2 resize-none focus:border-zinc-500"
                />
                <div className="flex gap-2 pt-1">
                  <Button size="sm" onClick={saveMeta} className="flex-1 font-medium"><Save size={14} className="mr-1.5" />Save</Button>
                  <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} className="px-4"><X size={14} /></Button>
                </div>
              </div>
            ) : (
              <div className="cursor-pointer group rounded-xl p-2 -mx-2 hover:bg-white/5 transition-colors" onClick={() => setEditingName(true)}>
                <div className="flex items-center gap-3">
                  <h2 className="text-white font-semibold text-[24px] tracking-tight group-hover:text-blue-400 transition-colors">
                    {suite.name}
                  </h2>
                  {badge && (
                    <span className={cn("text-[12px] font-bold tracking-wider px-2 py-0.5 rounded-md border", badge.color)}>
                      {badge.label}
                    </span>
                  )}
                </div>
                {suite.description && (
                  <p className="text-zinc-400 text-[14px] mt-1.5 leading-relaxed">{suite.description}</p>
                )}
              </div>
            )}
          </div>

          {/* Stats sidebar */}
          <div className="flex-1 min-h-0 overflow-y-auto p-6 space-y-6">
            <div className="space-y-2">
              {isToolCalling && (
                <div className="flex items-center gap-3 text-zinc-400 text-[14px] font-medium">
                  <Wrench size={16} />
                  <span>{suite.toolDefinitions.length} tool{suite.toolDefinitions.length !== 1 ? "s" : ""} defined</span>
                </div>
              )}
              <div className="flex items-center gap-3 text-zinc-400 text-[14px] font-medium">
                <BookOpen size={16} />
                <span>{scenarioCount} scenario{scenarioCount !== 1 ? "s" : ""}</span>
              </div>
            </div>

            {(
              <div>
                <label className="text-zinc-400 text-[12px] font-bold uppercase tracking-wider block mb-3">
                  Suite Type
                </label>
                <SuiteTypeSelector
                  value={suiteType}
                  onChange={changeSuiteType}
                  disabled={false}
                />
              </div>
            )}
          </div>

          {/* AI Generate */}
          {(
            <div className="p-3 border-t border-white/[0.06]">
              <AIGenerateSection suiteId={id} suiteType={suiteType} onGenerated={load} />
            </div>
          )}

          <div className="p-3 border-t border-white/[0.06] space-y-2">
            <Link href={`/suite/${id}/run`} className="block">
              <Button className="w-full" variant="primary" size="sm" disabled={scenarioCount === 0}>
                <Play size={13} />
                Run Suite
              </Button>
            </Link>
            <button
              onClick={async () => {
                if (!confirm(`Delete "${suite.name}"? This cannot be undone.`)) return;
                await fetch(`/api/suites/${id}`, { method: "DELETE" });
                window.location.href = "/suite";
              }}
              className="w-full text-xs text-zinc-700 hover:text-red-400 transition-colors py-1"
            >
              Delete suite
            </button>
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
                  readOnly={false}
                  onToolsChange={(tools) => setSuite((s) => s ? { ...s, toolDefinitions: tools } : s)}
                />
                <div className="border-t border-white/[0.06]" />
                <ScenarioEditor
                  scenarios={suite.toolScenarios}
                  suiteId={id}
                  toolNames={suite.toolDefinitions.map((t) => t.name)}
                  readOnly={false}
                  onScenariosChange={(scenarios) => setSuite((s) => s ? { ...s, toolScenarios: scenarios } : s)}
                />
              </>
            )}

            {isConversation && (
              <ConversationEditor
                scenarios={suite.conversationScenarios}
                suiteId={id}
                readOnly={false}
                onScenariosChange={(scenarios) => setSuite((s) => s ? { ...s, conversationScenarios: scenarios } : s)}
              />
            )}

            {isAdversarial && (
              <AdversarialEditor
                scenarios={suite.adversarialScenarios}
                suiteId={id}
                readOnly={false}
                onScenariosChange={(scenarios) => setSuite((s) => s ? { ...s, adversarialScenarios: scenarios } : s)}
              />
            )}

            {isCoding && (
              <CodingEditor
                scenarios={suite.codingScenarios as Parameters<typeof CodingEditor>[0]["scenarios"]}
                suiteId={id}
                readOnly={false}
                onScenariosChange={(scenarios) => setSuite(s => s ? { ...s, codingScenarios: scenarios as CodingScenarioDef[] } : s)}
              />
            )}

            {isVision && (
              <VisionEditor
                scenarios={suite.visionScenarios as Parameters<typeof VisionEditor>[0]["scenarios"]}
                suiteId={id}
                readOnly={false}
                onScenariosChange={(scenarios) => setSuite(s => s ? { ...s, visionScenarios: scenarios as VisionScenarioDef[] } : s)}
              />
            )}

            {isRag && (
              <RagEditor
                scenarios={suite.ragScenarios as Parameters<typeof RagEditor>[0]["scenarios"]}
                documents={suite.ragDocuments as Parameters<typeof RagEditor>[0]["documents"]}
                suiteId={id}
                readOnly={false}
                onScenariosChange={(scenarios) => setSuite(s => s ? { ...s, ragScenarios: scenarios as RagScenarioDef[] } : s)}
                onDocumentsChange={(documents) => setSuite(s => s ? { ...s, ragDocuments: documents as RagDocumentDef[] } : s)}
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
      <div className="w-[380px] flex-shrink-0 border-r border-white/10 flex flex-col h-screen overflow-hidden bg-white/[0.01]">
        <div className="p-6 border-b border-white/10">
          <Link href="/suite" className="flex items-center gap-1.5 text-zinc-400 text-[14px] font-medium hover:text-white transition-colors mb-5">
            <ChevronLeft size={16} />
            All Suites
          </Link>

          {editingName ? (
            <div className="space-y-3">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg text-white font-semibold text-[20px] px-3 py-2 outline-none focus:border-zinc-500"
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Description..."
                rows={2}
                className="w-full bg-white/5 text-zinc-300 text-[14px] outline-none border border-white/10 rounded-lg px-3 py-2 resize-none focus:border-zinc-500"
              />
              <div className="flex gap-2 pt-1">
                <Button size="sm" onClick={saveMeta} className="flex-1 font-medium"><Save size={14} className="mr-1.5" />Save</Button>
                <Button size="sm" variant="ghost" onClick={() => setEditingName(false)} className="px-4"><X size={14} /></Button>
              </div>
            </div>
          ) : (
            <div className="cursor-pointer group rounded-xl p-2 -mx-2 hover:bg-white/5 transition-colors" onClick={() => setEditingName(true)}>
              <h2 className="text-white font-semibold text-[24px] tracking-tight group-hover:text-blue-400 transition-colors">
                {suite.name}
              </h2>
              {suite.description && (
                <p className="text-zinc-400 text-[14px] mt-1.5 leading-relaxed">{suite.description}</p>
              )}
            </div>
          )}
        </div>

        {/* Scrollable Content: Suite Type + Prompts */}
        <div className="flex-1 min-h-0 overflow-y-auto flex flex-col">
          {/* Suite type selector for standard suites */}
          {(
            <div className="p-6 border-b border-white/10">
              <label className="text-zinc-400 text-[12px] font-bold uppercase tracking-wider block mb-3">
                Suite Type
              </label>
              <SuiteTypeSelector
                value={suiteType}
                onChange={changeSuiteType}
              />
            </div>
          )}

          <div className="p-3 space-y-1 flex-1">
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
                {(
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
        </div>


        {/* Sticky Actions */}
        <div className="flex-shrink-0 border-t border-white/[0.06]">
          <div className="p-3">
            <AIGenerateSection suiteId={id} suiteType={suiteType} onGenerated={load} />
          </div>

          <div className="p-3 border-t border-white/[0.06] space-y-2">
            {(
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
                  disabled={false}
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
                        onClick={() => setEditingPrompt((p) => ({ ...p, category: value }))}
                        disabled={false}
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
                        onClick={() => setEditingPrompt((p) => ({ ...p, difficulty: diff }))}
                        disabled={false}
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
                  disabled={false}
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
                  disabled={false}
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
              {(
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
