"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Play, Square, ChevronLeft, CheckCircle2, XCircle,
  Clock, Loader2, AlertTriangle, ChevronDown, Gavel, Trophy,
} from "lucide-react";
import Link from "next/link";
import { useModelsStore } from "@/store/models-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { useCloudProvidersStore } from "@/store/cloud-providers-store";
import { GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";
import { Container } from "lucide-react";

function DockerStatus({ onStatusChange }: { onStatusChange?: (running: boolean) => void } = {}) {
  const [status, setStatus] = useState<"checking" | "running" | "stopped" | "starting">("checking");

  useEffect(() => {
    fetch("/api/docker").then(r => r.json()).then(d => {
      const s = d.available ? "running" : "stopped";
      setStatus(s);
      onStatusChange?.(d.available);
    }).catch(() => { setStatus("stopped"); onStatusChange?.(false); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startDocker = async () => {
    setStatus("starting");
    const res = await fetch("/api/docker", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "start" }) });
    const data = await res.json();
    const running = !!data.started;
    setStatus(running ? "running" : "stopped");
    onStatusChange?.(running);
  };

  return (
    <div className="flex items-center justify-between py-2 transition-all duration-300">
      <div className="flex items-center gap-4">
        <div className={cn(
          "w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm",
          status === "running" ? "bg-[#32D74B]/20 text-[#32D74B]" :
          status === "starting" ? "bg-[#FF9F0A]/20 text-[#FF9F0A]" :
          "bg-white/5 text-zinc-500"
        )}>
          {status === "checking" ? <Loader2 size={18} className="animate-spin" /> : 
           status === "starting" ? <Loader2 size={18} className="animate-spin" /> : 
           <Container size={18} />}
        </div>
        <div className="flex flex-col">
          <span className="text-[16px] font-semibold text-white tracking-tight">Docker Engine</span>
          {status === "checking" && <span className="text-[14px] text-zinc-500">Checking availability...</span>}
          {status === "running" && <span className="text-[14px] text-zinc-400">Running &middot; Code tests will execute</span>}
          {status === "stopped" && <span className="text-[14px] text-red-400">Not running &middot; Code tests will skip</span>}
          {status === "starting" && <span className="text-[14px] text-amber-400">Starting up...</span>}
        </div>
      </div>
      {status === "stopped" && (
        <button 
          onClick={startDocker} 
          className="px-4 py-2 rounded-full bg-white text-black hover:scale-105 active:scale-95 text-[14px] font-semibold tracking-tight transition-all shadow-sm"
        >
          Start Docker
        </button>
      )}
    </div>
  );
}
import { SkeletonList } from "@/components/ui/skeleton";
import { ModelColorDot } from "@/components/ui/model-badge";
import { getModelColor } from "@/lib/model-colors";
import { formatDuration, formatBytes, cn } from "@/lib/utils";
import { MarkdownContent } from "@/components/ui/markdown-content";
import dynamic from "next/dynamic";

const ConversationFlow = dynamic(
  () => import("@/components/run/conversation-flow"),
  { ssr: false, loading: () => <div className="h-[400px] bg-white/5 rounded-2xl animate-pulse" /> }
);
const AdversarialFlow = dynamic(
  () => import("@/components/run/adversarial-flow"),
  { ssr: false, loading: () => <div className="h-[400px] bg-white/5 rounded-2xl animate-pulse" /> }
);

interface Suite {
  id: string;
  name: string;
  suite_type?: string;
  prompts: Array<{ id: string; text: string; category: string }>;
  toolScenarios?: Array<{ id: string; name: string; userMessage: string; category: string }>;
  toolDefinitions?: Array<{ id: string; name: string }>;
  conversationScenarios?: Array<{ id: string; name: string; turnCount: number }>;
  adversarialScenarios?: Array<{ id: string; name: string; attackStrategy: string; maxTurns: number }>;
  codingScenarios?: Array<{ id: string; name: string; language: string; testCases: unknown[] }>;
  visionScenarios?: Array<{ id: string; name: string; category: string }>;
  ragScenarios?: Array<{ id: string; name: string; question: string }>;
}

interface ConvoTurnState {
  role: "user" | "assistant";
  content: string;
  turnNumber: number;
}

interface ConvoScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: "pending" | "running" | "done" | "error";
  turns: ConvoTurnState[];
  overallScore: number;
  contextExhausted: boolean;
  contextTokensUsed?: number;
  contextLimit?: number;
  contextUtilization?: number;
}

interface ConvoModelState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: ConvoScenarioState[];
  overallScore: number;
}

interface AdvTurnState {
  role: "attacker" | "defender";
  content: string;
  turnNumber: number;
  breachDetected: boolean;
}

interface AdvScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: "pending" | "running" | "done" | "error";
  turns: AdvTurnState[];
  robustnessScore: number;
  survived: boolean;
  breachCount: number;
}

interface AdvModelState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: AdvScenarioState[];
  overallScore: number;
}

interface ScenarioState {
  scenarioId: string;
  scenarioName: string;
  status: "pending" | "running" | "done" | "error";
  overallScore: number;
  textResponse: string;
  actualToolCalls: Array<{ functionName: string; arguments: Record<string, unknown> }>;
}

interface ToolModelState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  scenarios: ScenarioState[];
  overallScore: number;
}

interface TestCaseResult {
  passed: boolean;
  testCaseId: string;
  expectedOutput?: string;
  actualOutput?: string;
  executionTimeMs?: number;
  error?: string;
}

interface PromptState {
  promptId: string;
  status: "pending" | "loading" | "running" | "done" | "error" | "timeout";
  response: string;
  tokensPerSec: number;
  score: number;
  judgeScore?: number;
  judgeWon?: boolean;
  testResults?: TestCaseResult[];
  dockerExecuted?: boolean;
  dockerRunning?: boolean;
  scenarioLanguage?: string;
}

interface ModelRunState {
  name: string;
  status: "pending" | "loading" | "running" | "done" | "skipped";
  prompts: PromptState[];
  overallScore: number;
  avgTokensPerSec: number;
  judgeOverallScore?: number;
  judgeWins?: number;
  judgeStatus?: "pending" | "scoring" | "done";
}

interface JudgeWinner {
  modelName: string;
  wins: number;
}

export default function LiveRunPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { models } = useModelsStore();
  usePreferencesStore();
  const { providers, fetchProviders, loaded: cloudLoaded } = useCloudProvidersStore();

  const [suite, setSuite] = useState<Suite | null>(null);
  const [suiteLoading, setSuiteLoading] = useState(true);

  useEffect(() => {
    if (!cloudLoaded) fetchProviders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const judgeProviders = providers.filter((p) => p.useForJudging && p.selectedModel);

  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<Record<string, { vision: boolean; tools: boolean; source: string }>>({});
  const [dockerRunning, setDockerRunning] = useState<boolean | null>(null);
  const [temperature, setTemperature] = useState(0.7);
  const [maxTokens, setMaxTokens] = useState(1024);
  // Auto-increase max tokens for coding suites (models need room for full solutions)
  const [maxTokensInitialized, setMaxTokensInitialized] = useState(false);
  const [judgeEnabled, setJudgeEnabled] = useState(false);
  const [judgeModel, setJudgeModel] = useState("");
  const [judgeCustomPrompt, setJudgeCustomPrompt] = useState("");
  const [peerJudgeEnabled, setPeerJudgeEnabled] = useState(false);
  const [cloudPeerJudgeIds, setCloudPeerJudgeIds] = useState<string[]>([]);

  // Resolve cloud:id to display name
  const judgeModelDisplay = (() => {
    if (!judgeModel.startsWith('cloud:')) return judgeModel;
    const pid = judgeModel.replace('cloud:', '');
    const provider = judgeProviders.find((p) => p.id === pid);
    return provider ? `${provider.selectedModel} (${provider.label})` : judgeModel;
  })();
  const [running, setRunning] = useState(false);
  const [done, setDone] = useState(false);
  const [runId, setRunId] = useState<string | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [modelStates, setModelStates] = useState<ModelRunState[]>([]);
  const [currentModelIdx, setCurrentModelIdx] = useState(0);
  const [toolModelStates, setToolModelStates] = useState<ToolModelState[]>([]);
  const [convoModelStates, setConvoModelStates] = useState<ConvoModelState[]>([]);
  const [advModelStates, setAdvModelStates] = useState<AdvModelState[]>([]);
  const [expandedPrompts, setExpandedPrompts] = useState<Set<string>>(new Set());
  const [judgePhase, setJudgePhase] = useState<"idle" | "loading" | "scoring" | "done" | "error">("idle");
  const [judgeWinner, setJudgeWinner] = useState<JudgeWinner | null>(null);
  const [judgeError, setJudgeError] = useState<string | null>(null);
  const [peerPhase, setPeerPhase] = useState<"idle" | "running" | "done" | "error">("idle");
  const [peerProgress, setPeerProgress] = useState(0);
  const [peerError, setPeerError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Auto-increase max tokens for coding/conversation suites once suite loads
  useEffect(() => {
    if (suite && !maxTokensInitialized) {
      setMaxTokensInitialized(true);
      if (suite.suite_type === "coding" && maxTokens < 2048) {
        setMaxTokens(2048);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suite]);

  useEffect(() => {
    fetch(`/api/suites/${id}`)
      .then((r) => r.json())
      .then((d) => setSuite(d.suite || null))
      .finally(() => setSuiteLoading(false));
  }, [id]);

  // Load saved run if ?runId= is present
  useEffect(() => {
    const savedRunId = searchParams.get("runId");
    if (!savedRunId || !suite) return;

    fetch(`/api/results/${savedRunId}`)
      .then(r => r.json())
      .then(data => {
        if (!data.run?.models) return;
        const run = data.run;
        setRunId(savedRunId);
        setDone(true);

        // Reconstruct model states from saved results
        const states: ModelRunState[] = run.models.map((m: Record<string, unknown>) => ({
          name: m.model_name as string,
          status: "done" as const,
          prompts: ((m as Record<string, unknown>).promptResults as Array<Record<string, unknown>> || []).map((pr: Record<string, unknown>) => {
            const autoScores = (typeof pr.auto_scores === "string" ? JSON.parse(pr.auto_scores as string) : pr.auto_scores) as Record<string, unknown> || {};
            const js = (typeof pr.judge_scores === "string" ? JSON.parse(pr.judge_scores as string) : pr.judge_scores) as Record<string, unknown> | null;
            return {
              promptId: pr.prompt_id as string,
              status: (pr.timed_out ? "timeout" : "done") as PromptState["status"],
              response: (pr.response as string) || "",
              tokensPerSec: (pr.tokens_per_sec as number) || 0,
              score: (js?.score as number) ?? (autoScores?.rubricScore as number) ?? 0,
              judgeScore: js?.score as number | undefined,
              judgeWon: js?.won as boolean | undefined,
              // Restore test results from auto_scores for coding suites
              testResults: (autoScores?.testResults as TestCaseResult[] | undefined),
              dockerExecuted: autoScores?.dockerExecuted as boolean | undefined,
              scenarioLanguage: autoScores?.language as string | undefined,
            };
          }),
          overallScore: (m.overall_score as number) || 0,
          avgTokensPerSec: (m.avg_tokens_per_sec as number) || 0,
        }));
        setModelStates(states);
        setSelectedModels(states.map(s => s.name));

        // For agentic modes, populate the mode-specific state arrays so
        // the "done" view renders correctly when loading a saved run.
        const suiteType = run.suite_type || suite?.suite_type || "standard";
        if (suiteType === "adversarial") {
          setAdvModelStates(states.map(s => ({
            name: s.name,
            status: "done" as const,
            scenarios: s.prompts.map(p => ({
              scenarioId: p.promptId,
              scenarioName: p.promptId,
              status: "done" as const,
              turns: [],
              robustnessScore: p.score,
              survived: p.score >= 80,
              breachCount: 0,
            })),
            overallScore: s.overallScore,
          })));
        }
        if (suiteType === "conversation") {
          setConvoModelStates(states.map(s => ({
            name: s.name,
            status: "done" as const,
            scenarios: s.prompts.map(p => ({
              scenarioId: p.promptId,
              scenarioName: p.promptId,
              status: "done" as const,
              turns: [],
              overallScore: p.score,
              contextExhausted: false,
            })),
            overallScore: s.overallScore,
          })));
        }
        if (suiteType === "tool_calling") {
          setToolModelStates(states.map(s => ({
            name: s.name,
            status: "done" as const,
            scenarios: s.prompts.map(p => ({
              scenarioId: p.promptId,
              scenarioName: p.promptId,
              status: "done" as const,
              overallScore: p.score,
              textResponse: p.response,
              actualToolCalls: [],
            })),
            overallScore: s.overallScore,
          })));
        }

        // Set judge info if available
        if (run.judge_enabled && run.judge_model) {
          setJudgeEnabled(true);
          setJudgeModel(run.judge_model);
          setJudgePhase("done");
        }
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suite]);

  const toggleModel = (name: string) => {
    setSelectedModels((s) =>
      s.includes(name) ? s.filter((m) => m !== name) : [...s, name]
    );
  };

  const isToolCalling = suite?.suite_type === "tool_calling";
  const isConversation = suite?.suite_type === "conversation";
  const isAdversarial = suite?.suite_type === "adversarial";
  const isVision = suite?.suite_type === "vision";
  const needsVision = isVision;
  const needsTools = isToolCalling;

  // Fetch capability info for installed models once we know the list.
  useEffect(() => {
    if (!models || models.length === 0) return;
    const names = models.map((m) => m.name);
    fetch("/api/models/capabilities", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ models: names }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (!Array.isArray(d.capabilities)) return;
        const next: Record<string, { vision: boolean; tools: boolean; source: string }> = {};
        for (const c of d.capabilities) {
          next[c.name] = { vision: !!c.vision, tools: !!c.tools, source: c.source || "unknown" };
        }
        setCapabilities(next);
      })
      .catch(() => { /* non-fatal; UI just won't show warnings */ });
  }, [models]);

  /** Returns null if the model is fine, or a short reason string if not. */
  const modelCapabilityIssue = (name: string): string | null => {
    const cap = capabilities[name];
    if (!cap) return null; // Haven't loaded yet — don't block
    if (needsVision && !cap.vision) return "no vision support";
    if (needsTools && !cap.tools) return "no tool-calling support";
    return null;
  };

  const incompatibleSelectedModels = selectedModels
    .map((n) => ({ name: n, issue: modelCapabilityIssue(n) }))
    .filter((m): m is { name: string; issue: string } => m.issue !== null);

  const startRun = async () => {
    if (!suite || selectedModels.length === 0) return;

    if (incompatibleSelectedModels.length > 0) {
      const list = incompatibleSelectedModels
        .map((m) => `  • ${m.name} — ${m.issue}`)
        .join("\n");
      const ok = window.confirm(
        `Some selected models may not be able to run this suite:\n\n${list}\n\nRun anyway? Scores for these models will likely be meaningless.`
      );
      if (!ok) return;
    }

    // Coding suites warn if Docker isn't running — code will be generated but test cases won't execute.
    if (suite.suite_type === "coding" && dockerRunning === false) {
      const hasTestCases = (suite.codingScenarios ?? []).some(s => Array.isArray((s as { testCases?: unknown[] }).testCases) && (s as { testCases: unknown[] }).testCases.length > 0);
      if (hasTestCases) {
        const ok = window.confirm(
          "Docker is not running. Coding suites with test cases need Docker to execute the model's code.\n\nRun anyway? Code will be generated but not executed, and scenarios will be scored only by gate checks."
        );
        if (!ok) return;
      }
    }

    if (isToolCalling) {
      // Initialize tool calling model states
      const scenarios = suite.toolScenarios ?? [];
      const toolStates: ToolModelState[] = selectedModels.map((name) => ({
        name,
        status: "pending",
        scenarios: scenarios.map((s) => ({
          scenarioId: s.id,
          scenarioName: s.name,
          status: "pending",
          overallScore: 0,
          textResponse: "",
          actualToolCalls: [],
        })),
        overallScore: 0,
      }));
      setToolModelStates(toolStates);
    }

    if (isConversation) {
      const scenarios = suite.conversationScenarios ?? [];
      setConvoModelStates(selectedModels.map((name) => ({
        name,
        status: "pending",
        scenarios: scenarios.map((s) => ({
          scenarioId: s.id,
          scenarioName: s.name,
          status: "pending",
          turns: [],
          overallScore: 0,
          contextExhausted: false,
        })),
        overallScore: 0,
      })));
    }

    if (isAdversarial) {
      const scenarios = suite.adversarialScenarios ?? [];
      setAdvModelStates(selectedModels.map((name) => ({
        name,
        status: "pending",
        scenarios: scenarios.map((s) => ({
          scenarioId: s.id,
          scenarioName: s.name,
          status: "pending",
          turns: [],
          robustnessScore: 0,
          survived: true,
          breachCount: 0,
        })),
        overallScore: 0,
      })));
    }

    // Build prompt list from the appropriate source based on suite type
    const promptSource = suite.suite_type === "coding"
      ? (suite.codingScenarios ?? []).map(s => ({ id: s.id }))
      : suite.suite_type === "vision"
      ? (suite.visionScenarios ?? []).map(s => ({ id: s.id }))
      : (suite.prompts ?? []).map(p => ({ id: p.id }));

    const initialStates: ModelRunState[] = selectedModels.map((name) => ({
      name,
      status: "pending",
      prompts: promptSource.map((p) => ({
        promptId: p.id,
        status: "pending",
        response: "",
        tokensPerSec: 0,
        score: 0,
      })),
      overallScore: 0,
      avgTokensPerSec: 0,
    }));
    setModelStates(initialStates);
    setRunning(true);
    setDone(false);
    setJudgePhase("idle");
    setJudgeWinner(null);
    setJudgeError(null);
    setRunError(null);
    setCurrentModelIdx(0);
    setElapsedSec(0);

    timerRef.current = setInterval(() => setElapsedSec((s) => s + 1), 1000);
    abortRef.current = new AbortController();

    try {
      const res = await fetch("/api/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suiteId: id,
          models: selectedModels,
          temperature,
          maxTokens,
          judgeEnabled,
          judgeModel: judgeEnabled ? judgeModel : undefined,
          judgeCustomPrompt: judgeEnabled && judgeCustomPrompt.trim() ? judgeCustomPrompt.trim() : undefined,
          peerJudgeEnabled,
          cloudPeerJudgeIds: peerJudgeEnabled ? cloudPeerJudgeIds : [],
        }),
        signal: abortRef.current.signal,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({ error: "Run failed" }));
        let errMsg = errData.error || `Run failed (${res.status})`;
        if (Array.isArray(errData.problems) && errData.problems.length > 0) {
          const details = errData.problems
            .slice(0, 5)
            .map((p: { question?: string; name?: string; reason: string }) =>
              `  • ${p.question || p.name || "(unnamed)"} — ${p.reason}`)
            .join("\n");
          const more = errData.problems.length > 5 ? `\n  …and ${errData.problems.length - 5} more` : "";
          errMsg = `${errMsg}\n${details}${more}`;
        }
        setRunError(errMsg);
        console.error("Run API error:", errMsg);
        return;
      }

      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const event = JSON.parse(line.slice(6));
            wrappedHandleEvent(event);
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        console.error("Run failed:", err);
      }
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setRunning(false);
    }
  };

  const handleEvent = (event: Record<string, unknown>) => {
    switch (event.type) {
      case "run_started":
        setRunId(event.runId as string);
        break;

      case "model_loading":
      case "model_start":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = { ...next[idx], status: "loading" };
          setCurrentModelIdx(idx);
          return next;
        });
        break;

      case "model_loaded":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = { ...next[idx], status: "running" };
          return next;
        });
        break;

      case "model_skipped":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = { ...next[idx], status: "skipped" };
          return next;
        });
        break;

      case "prompt_start":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const prompts = [...next[idx].prompts];
          prompts[event.promptIndex as number] = {
            ...prompts[event.promptIndex as number],
            status: "running",
          };
          next[idx] = { ...next[idx], prompts };
          return next;
        });
        break;

      case "token":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const prompts = [...next[idx].prompts];
          prompts[event.promptIndex as number] = {
            ...prompts[event.promptIndex as number],
            response: (prompts[event.promptIndex as number].response || "") + (event.token as string),
          };
          next[idx] = { ...next[idx], prompts };
          return next;
        });
        break;

      case "coding_executing":
        // Show Docker execution indicator on the prompt row
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const prompts = [...next[idx].prompts];
          prompts[event.promptIndex as number] = {
            ...prompts[event.promptIndex as number],
            dockerRunning: true,
          };
          next[idx] = { ...next[idx], prompts };
          return next;
        });
        break;

      case "prompt_done":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const prompts = [...next[idx].prompts];
          prompts[event.promptIndex as number] = {
            ...prompts[event.promptIndex as number],
            status: (event.timedOut ? "timeout" : "done") as PromptState["status"],
            tokensPerSec: event.tokensPerSec as number,
            score: event.score as number,
            // Capture test results from coding suite Docker execution
            testResults: (event.testResults as TestCaseResult[] | undefined) ?? prompts[event.promptIndex as number].testResults,
            dockerExecuted: event.testResults ? true : prompts[event.promptIndex as number].dockerExecuted,
            scenarioLanguage: (event.language as string | undefined) ?? prompts[event.promptIndex as number].scenarioLanguage,
          };
          next[idx] = { ...next[idx], prompts };
          return next;
        });
        break;

      case "model_done":
        setModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          next[idx] = {
            ...next[idx],
            status: "done",
            overallScore: event.overallScore as number,
            avgTokensPerSec: event.avgTokensPerSec as number,
          };
          return next;
        });
        break;

      // ── Judge events ────────────────────────────────────────────
      case "judge_start":
        setJudgePhase("loading");
        setModelStates((s) => s.map((m) =>
          m.status === "done" ? { ...m, judgeStatus: "pending", judgeWins: 0 } : m
        ));
        break;

      case "judge_prompt_comparing":
        setJudgePhase("scoring");
        break;

      case "judge_prompt_compared": {
        const scores = (event.scores ?? {}) as Record<string, number>;
        const winner = event.winner as string;
        const pi = event.promptIndex as number;
        setModelStates((s) => s.map((m) => {
          const score = scores[m.name];
          if (score === undefined) return m;
          const prompts = [...m.prompts];
          prompts[pi] = {
            ...prompts[pi],
            judgeScore: score,
            judgeWon: m.name === winner,
          };
          return {
            ...m,
            prompts,
            judgeStatus: "scoring",
            judgeWins: (m.judgeWins ?? 0) + (m.name === winner ? 1 : 0),
          };
        }));
        break;
      }

      case "judge_error":
        setJudgePhase("error");
        setJudgeError(event.error as string);
        break;

      case "judge_done":
        setJudgePhase("done");
        if (event.winner) setJudgeWinner(event.winner as JudgeWinner);
        // Mark all judged models as done
        setModelStates((s) => s.map((m) =>
          m.judgeStatus ? { ...m, judgeStatus: "done" } : m
        ));
        break;

      // ── Peer judging events ──────────────────────────────────
      case "peer_judge_start":
        setPeerPhase("running");
        setPeerProgress(0);
        break;

      case "peer_judge_prompt":
        setPeerProgress((p) => p + 1);
        break;

      case "peer_judge_done":
        setPeerPhase("done");
        break;

      case "peer_judge_error":
        setPeerPhase("error");
        setPeerError(event.error as string);
        break;

      // ── Tool calling events ───────────────────────────────────
      case "scenario_start":
        setToolModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const scenarios = [...next[idx].scenarios];
          const si = event.scenarioIndex as number;
          if (scenarios[si]) {
            scenarios[si] = { ...scenarios[si], status: "running" };
          }
          next[idx] = { ...next[idx], status: "running", scenarios };
          return next;
        });
        break;

      case "scenario_done":
        setToolModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const scenarios = [...next[idx].scenarios];
          const si = event.scenarioIndex as number;
          if (scenarios[si]) {
            scenarios[si] = {
              ...scenarios[si],
              status: "done",
              overallScore: event.overallScore as number,
              textResponse: (event.textResponse as string) ?? "",
              actualToolCalls: (event.actualToolCalls as ScenarioState["actualToolCalls"]) ?? [],
            };
          }
          next[idx] = { ...next[idx], scenarios };
          return next;
        });
        break;

      case "scenario_error":
        setToolModelStates((s) => {
          const idx = s.findIndex((m) => m.name === event.modelName);
          if (idx === -1) return s;
          const next = [...s];
          const scenarios = [...next[idx].scenarios];
          const si = event.scenarioIndex as number;
          if (scenarios[si]) {
            scenarios[si] = { ...scenarios[si], status: "error" };
          }
          next[idx] = { ...next[idx], scenarios };
          return next;
        });
        break;

      case "run_complete":
        setDone(true);
        if (timerRef.current) clearInterval(timerRef.current);
        // Update tool model overall scores from model_done events
        setToolModelStates((s) =>
          s.map((m) => ({
            ...m,
            status: m.status === "pending" ? m.status : "done",
          }))
        );
        break;
    }
  };

  // Also handle model_done for tool calling to update scores
  const origHandleEvent = handleEvent;
  // Merge into handleEvent by adding model_done handling for tool states
  const wrappedHandleEvent = (event: Record<string, unknown>) => {
    origHandleEvent(event);
    if (event.type === "model_done" && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = {
          ...next[idx],
          status: "done",
          overallScore: event.overallScore as number,
        };
        return next;
      });
    }
    if ((event.type === "model_loading" || event.type === "model_start") && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = { ...next[idx], status: "loading" };
        return next;
      });
    }
    if (event.type === "model_loaded" && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = { ...next[idx], status: "running" };
        return next;
      });
    }
    if (event.type === "model_skipped" && isToolCalling) {
      setToolModelStates((s) => {
        const idx = s.findIndex((m) => m.name === event.modelName);
        if (idx === -1) return s;
        const next = [...s];
        next[idx] = { ...next[idx], status: "skipped" };
        return next;
      });
    }

    // ── Conversation events ──────────────────────────────────────
    const convoModelUpdate = (fn: (states: ConvoModelState[]) => ConvoModelState[]) => setConvoModelStates(fn);
    if (isConversation) {
      if (event.type === "model_loading" || event.type === "model_start") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "loading" } : m));
      }
      if (event.type === "model_loaded") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "running" } : m));
      }
      if (event.type === "model_skipped") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "skipped" } : m));
      }
      if (event.type === "model_done") {
        convoModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "done", overallScore: event.overallScore as number } : m));
      }
      if (event.type === "convo_scenario_start") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "running" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_turn") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) => {
            if (sc.scenarioId !== event.scenarioId) return sc;
            const turns = [...sc.turns, {
              role: event.role as "user" | "assistant",
              content: event.content as string,
              turnNumber: event.turnNumber as number,
            }];
            return { ...sc, turns };
          });
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_context_update") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId
              ? {
                  ...sc,
                  contextTokensUsed: event.contextTokensUsed as number,
                  contextLimit: event.contextLimit as number,
                  contextUtilization: event.contextUtilization as number,
                }
              : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_scenario_done") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId
              ? {
                  ...sc,
                  status: "done" as const,
                  overallScore: event.overallScore as number,
                  contextExhausted: event.contextExhausted as boolean,
                  contextTokensUsed: event.contextTokensUsed as number | undefined,
                  contextLimit: event.contextLimit as number | undefined,
                  contextUtilization: event.contextUtilization as number | undefined,
                }
              : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "convo_scenario_error") {
        convoModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "error" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
    }

    // ── Adversarial events ───────────────────────────────────────
    const advModelUpdate = (fn: (states: AdvModelState[]) => AdvModelState[]) => setAdvModelStates(fn);
    if (isAdversarial) {
      if (event.type === "model_loading" || event.type === "model_start") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "loading" } : m));
      }
      if (event.type === "model_loaded") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "running" } : m));
      }
      if (event.type === "model_skipped") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "skipped" } : m));
      }
      if (event.type === "model_done") {
        advModelUpdate((s) => s.map((m) => m.name === event.modelName ? { ...m, status: "done", overallScore: event.overallScore as number } : m));
      }
      if (event.type === "adv_scenario_start") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "running" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "adv_turn") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) => {
            if (sc.scenarioId !== event.scenarioId) return sc;
            const turns = [...sc.turns, {
              role: event.role as "attacker" | "defender",
              content: event.content as string,
              turnNumber: event.turnNumber as number,
              breachDetected: event.breachDetected as boolean,
            }];
            return { ...sc, turns };
          });
          return { ...m, scenarios };
        }));
      }
      if (event.type === "adv_scenario_done") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId
              ? {
                  ...sc,
                  status: "done" as const,
                  robustnessScore: event.robustnessScore as number,
                  survived: event.survived as boolean,
                  breachCount: event.breachCount as number,
                }
              : sc
          );
          return { ...m, scenarios };
        }));
      }
      if (event.type === "adv_scenario_error") {
        advModelUpdate((s) => s.map((m) => {
          if (m.name !== event.modelName) return m;
          const scenarios = m.scenarios.map((sc) =>
            sc.scenarioId === event.scenarioId ? { ...sc, status: "error" as const } : sc
          );
          return { ...m, scenarios };
        }));
      }
    }
  };

  const stopRun = () => {
    abortRef.current?.abort();
    if (timerRef.current) clearInterval(timerRef.current);
    setRunning(false);
  };

  const togglePromptExpand = (key: string) => {
    setExpandedPrompts((s) => {
      const next = new Set(s);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (suiteLoading) return <div className="p-8"><SkeletonList count={3} /></div>;
  if (!suite) return <div className="p-8 text-zinc-500">Suite not found.</div>;

  // ── Pre-run config ────────────────────────────────────────────────────────
  if (!running && !done) {
    return (
      <div className="px-6 md:px-12 py-12 max-w-[900px] mx-auto text-white">
        <Link href={`/suite/${id}`} className="inline-flex items-center gap-2 text-zinc-400 text-[15px] font-medium hover:text-white mb-10 transition-colors group">
          <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          Back to suite
        </Link>

        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-8">
          <div>
            <h1 className="text-4xl font-semibold text-white tracking-tight leading-tight">Run: {suite.name}</h1>
            <p className="text-zinc-400 text-[17px] font-medium mt-2">
              {isToolCalling
                ? `${suite.toolScenarios?.length ?? 0} scenarios · ${suite.toolDefinitions?.length ?? 0} tools`
                : isConversation
                ? `${suite.conversationScenarios?.length ?? 0} conversation scenarios`
                : isAdversarial
                ? `${suite.adversarialScenarios?.length ?? 0} adversarial scenarios`
                : suite.suite_type === "coding"
                ? `${suite.codingScenarios?.length ?? 0} coding scenarios`
                : suite.suite_type === "vision"
                ? `${suite.visionScenarios?.length ?? 0} vision scenarios`
                : suite.suite_type === "rag"
                ? `${suite.ragScenarios?.length ?? 0} RAG scenarios`
                : `${suite.prompts.length} prompts`
              }
            </p>
          </div>

          {/* Model selection */}
          <div className="py-4 mt-8">
            <h2 className="text-[14px] font-bold text-zinc-500 uppercase tracking-widest mb-6">Select Models</h2>
            {needsVision && (
              <div className="mb-6 border border-amber-500/20 bg-amber-500/[0.05] p-4 rounded-2xl">
                 <p className="text-amber-300/80 text-[14px] font-medium">
                   This is a vision suite — models marked below as <span className="text-amber-400 font-semibold">no vision</span> will likely ignore images and produce meaningless scores.
                 </p>
              </div>
            )}
            {needsTools && (
              <div className="mb-6 border border-amber-500/20 bg-amber-500/[0.05] p-4 rounded-2xl">
                 <p className="text-amber-300/80 text-[14px] font-medium">
                   This is a tool-calling suite — models marked as <span className="text-amber-400 font-semibold">no tools</span> will return empty tool calls and score 0.
                 </p>
              </div>
            )}
            {models.length === 0 ? (
              <p className="text-zinc-500 text-[16px] font-medium">No models installed. Install models via Ollama first.</p>
            ) : (
              <div className="space-y-3">
                {models.map((model) => {
                  const issue = modelCapabilityIssue(model.name);
                  return (
                    <label key={model.name} className="flex items-center gap-4 cursor-pointer group py-2">
                      <div
                        className={cn(
                          "w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all shadow-sm border",
                          selectedModels.includes(model.name)
                            ? "bg-[#0A84FF] border-[#0A84FF]"
                            : "border-white/20 group-hover:border-white/40 bg-white/5"
                        )}
                        onClick={() => toggleModel(model.name)}
                      >
                        {selectedModels.includes(model.name) && (
                          <CheckCircle2 size={14} className="text-white" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <ModelColorDot name={model.name} />
                        <span className={cn("text-[17px] font-medium truncate tracking-tight transition-colors", issue ? "text-zinc-500" : "text-zinc-200 group-hover:text-white")}>{model.name}</span>
                        {issue && (
                          <span
                            title={
                              capabilities[model.name]?.source === "heuristic"
                                ? `${issue} (inferred from model name — not reported by Ollama)`
                                : issue
                            }
                            className="text-[12px] px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-300 whitespace-nowrap"
                          >
                            {issue}
                          </span>
                        )}
                      </div>
                      <span className="text-zinc-600 text-[13px] ml-4 hidden sm:block capitalize">{model.details?.family || ""}</span>
                      {model.details?.quantization_level && (
                        <span className="text-zinc-600 text-[12px] font-mono hidden md:block px-1.5 py-0.5 rounded bg-white/[0.04]">{model.details.quantization_level}</span>
                      )}
                    </label>
                  );
                })}
              </div>
            )}
            {incompatibleSelectedModels.length > 0 && (
              <div className="mt-6 p-5 rounded-[20px] border border-amber-500/20 bg-amber-500/[0.04]">
                <p className="text-amber-200/90 text-[14px] font-medium leading-relaxed">
                  {incompatibleSelectedModels.length === 1
                    ? `${incompatibleSelectedModels[0].name} likely can't complete this suite (${incompatibleSelectedModels[0].issue}).`
                    : `${incompatibleSelectedModels.length} selected models likely can't complete this suite.`}{" "}
                  You can still run — the app will ask you to confirm.
                </p>
              </div>
            )}
          </div>

          {/* Parameters */}
          <div className="py-4 mt-8 border-t border-white/[0.05] pt-12">
            <h2 className="text-[14px] font-bold text-zinc-500 uppercase tracking-widest mb-8">Parameters</h2>
            <div className="space-y-8">
              <div>
                <div className="flex justify-between items-end mb-4">
                  <span className="text-zinc-400 text-[15px] font-medium">Temperature</span>
                  <span className="text-white text-[16px] font-mono bg-white/10 px-3 py-1 rounded-lg">{temperature.toFixed(2)}</span>
                </div>
                <input
                  type="range" min={0} max={2} step={0.05}
                  value={temperature}
                  onChange={(e) => setTemperature(parseFloat(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#0A84FF]"
                />
              </div>
              <div className="pt-2">
                <div className="flex justify-between items-end mb-4">
                  <span className="text-zinc-400 text-[15px] font-medium">Max Tokens</span>
                  <span className="text-white text-[16px] font-mono bg-white/10 px-3 py-1 rounded-lg">{maxTokens}</span>
                </div>
                <input
                  type="range" min={128} max={4096} step={128}
                  value={maxTokens}
                  onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                  className="w-full h-2 bg-white/10 rounded-full appearance-none cursor-pointer accent-[#0A84FF]"
                />
                {suite?.suite_type === "coding" && maxTokens < 2048 && (
                  <p className="text-amber-500/80 text-[13px] mt-2">Coding suites need 2048+ tokens for complex problems (Sudoku, DP, etc.)</p>
                )}
              </div>
              
              <hr className="border-white/5 my-8" />

              {/* Judge toggle */}
              <div className="space-y-5">
                <label className="flex items-center gap-4 cursor-pointer group">
                  <div
                    className={cn(
                      "w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all shadow-sm border",
                      judgeEnabled ? "bg-[#BF5AF2] border-[#BF5AF2]" : "border-white/20 bg-white/5 group-hover:border-white/40"
                    )}
                    onClick={() => setJudgeEnabled((j) => !j)}
                  >
                    {judgeEnabled && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <Gavel size={18} className={judgeEnabled ? "text-[#BF5AF2]" : "text-zinc-500"} />
                  <span className="text-white text-[17px] font-medium tracking-tight">LLM-as-Judge scoring</span>
                  <span className="text-zinc-500 text-[14px] ml-2 hidden sm:block">(slower, higher quality)</span>
                </label>

                <AnimatePresence>
                  {judgeEnabled && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-[38px] space-y-3 pt-2">
                        <label className="text-zinc-400 text-[14px] font-medium block">Judge Model</label>
                        {models.length > 0 || judgeProviders.length > 0 ? (
                          <select
                            value={judgeModel}
                            onChange={(e) => setJudgeModel(e.target.value)}
                            className="w-full apple-glass border border-white/10 rounded-2xl px-5 py-4 text-white text-[16px] font-medium appearance-none outline-none focus:border-[#BF5AF2]/60 hover:bg-white/10 transition-colors cursor-pointer"
                          >
                            <option value="" className="bg-zinc-900 border-none">Select a judge model...</option>
                            {models.length > 0 && (
                              <optgroup label="LOCAL MODELS" className="bg-zinc-900">
                                {models.map((m) => (
                                  <option key={m.name} value={m.name} className="bg-zinc-900">{m.name}</option>
                                ))}
                              </optgroup>
                            )}
                            {judgeProviders.length > 0 && (
                              <optgroup label="CLOUD MODELS" className="bg-zinc-900">
                                {judgeProviders.map((p) => (
                                  <option key={`cloud:${p.id}`} value={`cloud:${p.id}`} className="bg-zinc-900">
                                    {p.selectedModel} ({p.label})
                                  </option>
                                ))}
                              </optgroup>
                            )}
                          </select>
                        ) : (
                          <input
                            value={judgeModel}
                            onChange={(e) => setJudgeModel(e.target.value)}
                            placeholder="e.g. llama3:8b"
                            className="w-full apple-glass border border-white/10 rounded-2xl px-5 py-4 text-white text-[16px] outline-none focus:border-[#BF5AF2]/60 placeholder:text-zinc-600 transition-colors bg-white/5"
                          />
                        )}
                        <p className="text-zinc-500 text-[14px] pt-1">
                          This model scores each response after all tests complete. Larger models give better judgements.
                        </p>
                        <div className="mt-4">
                          <label className="text-zinc-500 text-[13px] font-medium block mb-2">Custom judge instructions (optional)</label>
                          <textarea
                            value={judgeCustomPrompt}
                            onChange={(e) => setJudgeCustomPrompt(e.target.value)}
                            placeholder="e.g. Focus on code efficiency and use of docstrings. Penalize solutions that don't handle edge cases. Prefer idiomatic Python."
                            className="w-full apple-glass border border-white/10 rounded-xl px-4 py-3 text-white text-[14px] outline-none focus:border-[#BF5AF2]/40 placeholder:text-zinc-700 transition-colors bg-white/5 resize-none h-20"
                          />
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Peer judging toggle */}
                <label className="flex items-center gap-4 cursor-pointer pt-2 group">
                  <div
                    className={cn(
                      "w-[22px] h-[22px] rounded-full flex items-center justify-center transition-all shadow-sm border",
                      peerJudgeEnabled ? "bg-[#32D74B] border-[#32D74B]" : "border-white/20 bg-white/5 group-hover:border-white/40"
                    )}
                    onClick={() => setPeerJudgeEnabled((p) => !p)}
                  >
                    {peerJudgeEnabled && <CheckCircle2 size={14} className="text-white" />}
                  </div>
                  <span className="text-white text-[17px] font-medium tracking-tight">Peer judging</span>
                  <span className="text-zinc-500 text-[14px] ml-2 hidden sm:block">(models judge each other, needs 3+)</span>
                </label>
                {peerJudgeEnabled && (selectedModels.length + cloudPeerJudgeIds.length) < 3 && (
                  <p className="text-amber-500/80 text-[14px] font-medium ml-[38px] mt-2">
                    Peer judging needs 3 total judges. Select more models or add a cloud judge below.
                  </p>
                )}

                {/* Cloud peer judge extras */}
                <AnimatePresence>
                  {peerJudgeEnabled && judgeProviders.length > 0 && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="ml-[38px] space-y-4 pt-4 border-t border-white/5 mt-4">
                        <label className="text-zinc-400 text-[14px] font-medium block">Extra cloud judges (don&apos;t play, only vote)</label>
                        <div className="space-y-4">
                          {judgeProviders.map((p) => {
                            const id = `cloud:${p.id}`;
                            const checked = cloudPeerJudgeIds.includes(id);
                            return (
                              <button
                                type="button"
                                key={id}
                                onClick={() =>
                                  setCloudPeerJudgeIds((curr) =>
                                    curr.includes(id) ? curr.filter((x) => x !== id) : [...curr, id]
                                  )
                                }
                                className="flex items-center gap-3 cursor-pointer group text-left w-full"
                              >
                                <div className={cn(
                                  "w-[20px] h-[20px] rounded-full flex items-center justify-center border transition-colors",
                                  checked ? "bg-[#32D74B] border-[#32D74B]" : "border-white/20 bg-white/5 group-hover:border-white/40"
                                )}>
                                  {checked && <CheckCircle2 size={12} className="text-white" />}
                                </div>
                                <span className={cn("text-[15px] font-medium transition-colors", checked ? "text-white" : "text-zinc-400 group-hover:text-zinc-200")}>{p.label} · {p.selectedModel}</span>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Docker status for coding suites */}
                {suite?.suite_type === "coding" && (
                  <div className="pt-2">
                    <DockerStatus onStatusChange={setDockerRunning} />
                  </div>
                )}
              </div>
            </div>
          </div>

          <button
            disabled={
              selectedModels.length === 0 ||
              (isToolCalling && !(suite.toolScenarios?.length)) ||
              (isConversation && !(suite.conversationScenarios?.length)) ||
              (isAdversarial && !(suite.adversarialScenarios?.length)) ||
              (suite.suite_type === "coding" && !(suite.codingScenarios?.length)) ||
              (!isToolCalling && !isConversation && !isAdversarial && suite.suite_type !== "coding" && suite.suite_type !== "vision" && suite.suite_type !== "rag" && !(suite.prompts?.length))
            }
            onClick={startRun}
            className="w-full h-16 rounded-full bg-white text-black font-semibold text-[18px] tracking-tight hover:scale-[1.02] active:scale-[0.98] transition-transform shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
          >
            <Play size={18} className="fill-black" />
            Start Run — {selectedModels.length} model{selectedModels.length !== 1 ? "s" : ""},{" "}
            {isToolCalling ? `${suite.toolScenarios?.length ?? 0} scenarios`
              : isConversation ? `${suite.conversationScenarios?.length ?? 0} scenarios`
              : isAdversarial ? `${suite.adversarialScenarios?.length ?? 0} scenarios`
              : suite.suite_type === "coding" ? `${suite.codingScenarios?.length ?? 0} scenarios`
              : suite.suite_type === "vision" ? `${suite.visionScenarios?.length ?? 0} scenarios`
              : suite.suite_type === "rag" ? `${suite.ragScenarios?.length ?? 0} scenarios`
              : `${suite.prompts.length} prompts`}
          </button>
        </motion.div>

        {runError && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-4 mt-8 p-5 rounded-[20px] bg-red-500/10 border border-red-500/20 shadow-lg"
          >
            <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
            <span className="text-red-300 whitespace-pre-wrap font-mono text-[14px] leading-relaxed">{runError}</span>
          </motion.div>
        )}
      </div>
    );
  }

  // ── Tool Calling Running / done view ──────────────────────────────────────
  if (isToolCalling) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold text-zinc-100">{suite.name}</h1>
              <span className="text-[10px] px-1.5 py-0.5 rounded text-blue-300 bg-blue-500/10 border border-blue-500/20">
                Tools
              </span>
            </div>
            <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
              <span className="flex items-center gap-1.5">
                <Clock size={11} />
                {formatDuration(elapsedSec)}
              </span>
              <span>{selectedModels.length} models · {suite.toolScenarios?.length ?? 0} scenarios</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {running && (
              <Button variant="danger" size="sm" onClick={stopRun}>
                <Square size={13} />
                Stop
              </Button>
            )}
            {done && runId && (
              <Button variant="primary" size="sm" onClick={() => router.push(`/results/${runId}`)}>
                View Results
              </Button>
            )}
          </div>
        </div>

        {/* Tool calling model cards */}
        <div className="space-y-4">
          {toolModelStates.map((model, mi) => (
            <motion.div
              key={model.name}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 * mi }}
            >
              <GlowCard className="p-5" animate={false}>
                <div className="flex items-center gap-3 mb-4">
                  <ModelColorDot name={model.name} />
                  <span className="text-zinc-200 text-sm font-medium flex-1">{model.name}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border",
                    model.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10" :
                    model.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10" :
                    model.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10" :
                    model.status === "skipped" ? "text-red-400 border-red-500/20 bg-red-500/10" :
                    "text-zinc-600 border-zinc-500/20 bg-zinc-500/10"
                  )}>
                    {model.status}
                  </span>
                  {model.status === "done" && (
                    <span className="text-zinc-300 font-mono text-sm">{model.overallScore}%</span>
                  )}
                </div>

                <div className="flex flex-col gap-2 p-2">
                  {model.scenarios.map((scenario, si) => (
                    <div key={scenario.scenarioId} className="apple-list-row w-full flex items-center gap-4 px-5 py-4 transition-colors">
                      {scenario.status === "pending" && <div className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" />}
                      {scenario.status === "running" && <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse flex-shrink-0" />}
                      {scenario.status === "done" && <CheckCircle2 size={18} className="text-[#32D74B] flex-shrink-0" />}
                      {scenario.status === "error" && <XCircle size={18} className="text-[#FF453A] flex-shrink-0" />}

                      <span className="text-zinc-300 text-[15px] font-medium tracking-tight flex-1 truncate">
                        {scenario.scenarioName}
                      </span>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        {scenario.status === "done" && (
                          <span className={cn(
                            "text-[16px] font-semibold tracking-tight tabular-nums",
                            scenario.overallScore >= 80 ? "text-[#32D74B]" :
                            scenario.overallScore >= 50 ? "text-[#FF9F0A]" :
                            "text-[#FF453A]"
                          )}>
                            {scenario.overallScore}%
                          </span>
                        )}
                        {scenario.status === "done" && scenario.actualToolCalls.length > 0 && (
                          <span className="text-[#0A84FF] text-[12px] font-mono tracking-tight bg-[#0A84FF]/10 px-2 py-0.5 rounded-md">
                            {scenario.actualToolCalls.map(c => c.functionName).join(" → ")}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // ── Conversation Running / done view ────────────────────────────────────
  if (isConversation) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">
              {done ? "Run Complete" : "Running"}: {suite.name}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              <span className="text-violet-400">Conversation</span> · {formatDuration(elapsedSec)}
              {runId && done && (
                <Link href={`/results/${runId}`} className="ml-3 text-blue-400 hover:text-blue-300 text-xs">
                  View Results →
                </Link>
              )}
            </p>
          </div>
          {running && (
            <Button variant="secondary" size="sm" onClick={stopRun}>
              <Square size={12} />
              Stop
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {convoModelStates.map((model) => (
            <motion.div key={model.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <GlowCard className="p-5" animate={false}>
                <div className="flex items-center gap-3 mb-4">
                  <ModelColorDot name={model.name} />
                  <span className="text-zinc-200 font-medium text-sm">{model.name}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border",
                    model.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                      : model.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                      : model.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                      : "text-zinc-600 border-white/10"
                  )}>
                    {model.status}
                  </span>
                  {model.status === "done" && (
                    <span className={cn(
                      "ml-auto text-sm font-mono",
                      model.overallScore >= 80 ? "text-emerald-400" : model.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {model.overallScore}%
                    </span>
                  )}
                </div>

                {/* React Flow visualization */}
                {model.scenarios.some((sc) => sc.turns.length > 0) && (
                  <div className="mb-4 h-[350px] rounded-[24px] overflow-hidden border border-white/[0.03] bg-[#0A0A0C] shadow-inner isolate relative">
                    <ConversationFlow
                      modelName={model.name}
                      currentScenarioIndex={model.scenarios.findIndex((sc) => sc.status === "running")}
                      scenarios={model.scenarios.map((sc) => ({
                        scenarioId: sc.scenarioId,
                        scenarioName: sc.scenarioName,
                        status: sc.status,
                        overallScore: sc.overallScore,
                        turns: (() => {
                          const turns: { userMessage: string; modelResponse: string; score?: number; contextUsage?: number; status: "pending" | "running" | "done" | "error" }[] = [];
                          for (let i = 0; i < sc.turns.length; i += 2) {
                            const user = sc.turns[i];
                            const assistant = sc.turns[i + 1];
                            if (user) {
                              turns.push({
                                userMessage: user.content,
                                modelResponse: assistant?.content ?? "",
                                score: undefined,
                                contextUsage: sc.contextUtilization ? Math.round(sc.contextUtilization * 100) : undefined,
                                status: assistant ? "done" : sc.status === "running" ? "running" : "pending",
                              });
                            }
                          }
                          return turns;
                        })(),
                      }))}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {model.scenarios.map((sc, si) => (
                    <div key={sc.scenarioId} className="apple-list-row flex flex-col gap-3 px-5 py-4 w-full">
                      <div className="flex items-center gap-4">
                        {sc.status === "pending" && <div className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" />}
                        {sc.status === "running" && <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse flex-shrink-0" />}
                        {sc.status === "done" && <CheckCircle2 size={18} className="text-[#32D74B] flex-shrink-0" />}
                        {sc.status === "error" && <XCircle size={18} className="text-[#FF453A] flex-shrink-0" />}

                        <span className="text-zinc-300 text-[15px] font-medium tracking-tight flex-1 truncate">
                          {sc.scenarioName}
                        </span>
                        
                        {sc.status === "done" && (
                          <span className={cn(
                            "text-[16px] font-semibold tracking-tight tabular-nums",
                            sc.overallScore >= 80 ? "text-[#32D74B]" : sc.overallScore >= 50 ? "text-[#FF9F0A]" : "text-[#FF453A]"
                          )}>
                            {sc.overallScore}%
                          </span>
                        )}
                      </div>

                      {/* Context window utilization bar */}
                      {sc.contextTokensUsed != null && sc.contextLimit != null && sc.contextLimit > 0 && (() => {
                        const utilPct = Math.min((sc.contextUtilization ?? 0) * 100, 100);
                        const tokensUsed = sc.contextTokensUsed;
                        const limit = sc.contextLimit;
                        const modelHex = getModelColor(model.name).hex;
                        const barColorClass = utilPct >= 95
                          ? "bg-red-500"
                          : utilPct >= 85
                            ? "bg-amber-500"
                            : null;
                        return (
                          <div className="mt-2 mb-1">
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-xs text-zinc-500 font-mono">
                                Context: ~{tokensUsed.toLocaleString()} / {limit.toLocaleString()} tokens · {Math.round(utilPct)}% used
                              </span>
                              {utilPct >= 95 && (
                                <span className="text-[10px] text-red-400 flex items-center gap-0.5">
                                  <AlertTriangle size={10} />
                                  Context exhausted — conversation ended early
                                </span>
                              )}
                              {utilPct >= 85 && utilPct < 95 && (
                                <span className="text-[10px] text-amber-400 flex items-center gap-0.5">
                                  <AlertTriangle size={10} />
                                  Context pressure — quality may degrade
                                </span>
                              )}
                            </div>
                            <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-300",
                                  barColorClass
                                )}
                                style={{
                                  width: `${utilPct}%`,
                                  ...(barColorClass ? {} : { backgroundColor: modelHex }),
                                }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {sc.turns.length > 0 && (
                        <div className="space-y-1.5 ml-4">
                          {sc.turns.map((turn, ti) => (
                            <div key={ti} className="flex gap-2 text-xs">
                              <span className={cn(
                                "flex-shrink-0 w-14 text-right font-mono",
                                turn.role === "user" ? "text-zinc-500" : "text-violet-400"
                              )}>
                                {turn.role === "user" ? "User" : "Model"}
                              </span>
                              <span className="text-zinc-400 truncate">{turn.content.substring(0, 200)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // ── Adversarial Running / done view ───────────────────────────────────
  if (isAdversarial) {
    return (
      <div className="p-8 max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-zinc-100">
              {done ? "Run Complete" : "Running"}: {suite.name}
            </h1>
            <p className="text-zinc-500 text-sm mt-0.5">
              <span className="text-rose-400">Adversarial</span> · {formatDuration(elapsedSec)}
              {runId && done && (
                <Link href={`/results/${runId}`} className="ml-3 text-blue-400 hover:text-blue-300 text-xs">
                  View Results →
                </Link>
              )}
            </p>
          </div>
          {running && (
            <Button variant="secondary" size="sm" onClick={stopRun}>
              <Square size={12} />
              Stop
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {advModelStates.map((model) => (
            <motion.div key={model.name} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
              <GlowCard className="p-5" animate={false}>
                <div className="flex items-center gap-3 mb-4">
                  <ModelColorDot name={model.name} />
                  <span className="text-zinc-200 font-medium text-sm">{model.name}</span>
                  <span className={cn(
                    "text-[10px] px-1.5 py-0.5 rounded-full border",
                    model.status === "done" ? "text-emerald-400 border-emerald-500/20 bg-emerald-500/10"
                      : model.status === "running" ? "text-blue-400 border-blue-500/20 bg-blue-500/10"
                      : model.status === "loading" ? "text-yellow-400 border-yellow-500/20 bg-yellow-500/10"
                      : "text-zinc-600 border-white/10"
                  )}>
                    {model.status}
                  </span>
                  {model.status === "done" && (
                    <span className={cn(
                      "ml-auto text-sm font-mono",
                      model.overallScore >= 80 ? "text-emerald-400" : model.overallScore >= 50 ? "text-yellow-400" : "text-red-400"
                    )}>
                      {model.overallScore}%
                    </span>
                  )}
                </div>

                {/* React Flow visualization */}
                {model.scenarios.some((sc) => sc.turns.length > 0) && (
                  <div className="mb-4 h-[350px] rounded-[24px] overflow-hidden border border-white/[0.03] bg-[#0A0A0C] shadow-inner isolate relative">
                    <AdversarialFlow
                      modelName={model.name}
                      currentScenarioIndex={model.scenarios.findIndex((sc) => sc.status === "running")}
                      scenarios={model.scenarios.map((sc) => ({
                        scenarioId: sc.scenarioId,
                        scenarioName: sc.scenarioName,
                        status: sc.status,
                        robustnessScore: sc.robustnessScore,
                        turns: (() => {
                          const turns: { attackMessage: string; modelResponse: string; breach?: { type: string; severity: "low" | "medium" | "high" | "critical"; evidence: string }; status: "pending" | "running" | "done" | "error" }[] = [];
                          for (let i = 0; i < sc.turns.length; i += 2) {
                            const attacker = sc.turns[i];
                            const defender = sc.turns[i + 1];
                            if (attacker) {
                              turns.push({
                                attackMessage: attacker.content,
                                modelResponse: defender?.content ?? "",
                                breach: (attacker.breachDetected || defender?.breachDetected) ? { type: "breach", severity: "critical", evidence: "" } : undefined,
                                status: defender ? "done" : sc.status === "running" ? "running" : "pending",
                              });
                            }
                          }
                          return turns;
                        })(),
                      }))}
                    />
                  </div>
                )}

                <div className="flex flex-col gap-2">
                  {model.scenarios.map((sc, si) => (
                    <div key={sc.scenarioId} className="apple-list-row flex flex-col gap-3 px-5 py-4 w-full">
                      <div className="flex items-center gap-4">
                        {sc.status === "pending" && <div className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" />}
                        {sc.status === "running" && <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse flex-shrink-0" />}
                        {sc.status === "done" && (
                          sc.survived ? <CheckCircle2 size={18} className="text-[#32D74B] flex-shrink-0" /> : <AlertTriangle size={18} className="text-[#FF453A] flex-shrink-0" />
                        )}
                        {sc.status === "error" && <XCircle size={18} className="text-[#FF453A] flex-shrink-0" />}

                        <span className="text-zinc-300 text-[15px] font-medium tracking-tight flex-1 truncate">
                          {sc.scenarioName}
                        </span>

                        {sc.status === "done" && (
                          <div className="flex items-center gap-4 flex-shrink-0">
                            <span className={cn(
                              "text-[16px] font-semibold tracking-tight tabular-nums",
                              sc.robustnessScore >= 80 ? "text-[#32D74B]" : sc.robustnessScore >= 50 ? "text-[#FF9F0A]" : "text-[#FF453A]"
                            )}>
                              {sc.robustnessScore}%
                            </span>
                            {sc.survived ? (
                              <span className="text-[#32D74B] text-[12px] font-mono tracking-tight bg-[#32D74B]/10 px-2 py-0.5 rounded-md">Survived</span>
                            ) : (
                              <span className="text-[#FF453A] text-[12px] font-mono tracking-tight bg-[#FF453A]/10 px-2 py-0.5 rounded-md">{sc.breachCount} breach{sc.breachCount !== 1 ? "es" : ""}</span>
                            )}
                          </div>
                        )}
                      </div>

                      {sc.turns.length > 0 && (
                        <div className="space-y-1.5 ml-4">
                          {sc.turns.map((turn, ti) => (
                            <div key={ti} className={cn(
                              "flex gap-2 text-xs",
                              turn.breachDetected && "bg-red-500/10 rounded px-1.5 py-0.5"
                            )}>
                              <span className={cn(
                                "flex-shrink-0 w-16 text-right font-mono",
                                turn.role === "attacker" ? "text-rose-400" : "text-zinc-400"
                              )}>
                                {turn.role === "attacker" ? "Attack" : "Defend"}
                              </span>
                              <span className={cn(
                                "truncate",
                                turn.breachDetected ? "text-red-300" : "text-zinc-400"
                              )}>
                                {turn.content.substring(0, 200)}
                              </span>
                              {turn.breachDetected && (
                                <AlertTriangle size={10} className="text-red-400 flex-shrink-0" />
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </GlowCard>
            </motion.div>
          ))}
        </div>
      </div>
    );
  }

  // ── Standard Running / done view ────────────────────────────────────────
  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-zinc-100">{suite.name}</h1>
          <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
            <span className="flex items-center gap-1.5">
              <Clock size={11} />
              {formatDuration(elapsedSec)}
            </span>
            <span>{selectedModels.length} models · {
              isToolCalling ? `${suite.toolScenarios?.length ?? 0} scenarios`
              : isConversation ? `${suite.conversationScenarios?.length ?? 0} scenarios`
              : isAdversarial ? `${suite.adversarialScenarios?.length ?? 0} scenarios`
              : suite.suite_type === "coding" ? `${suite.codingScenarios?.length ?? 0} scenarios`
              : `${suite.prompts.length} prompts`
            }</span>
            {judgeEnabled && judgeModel && (
              <span className="flex items-center gap-1 text-violet-400">
                <Gavel size={10} />
                Judge: {judgeModelDisplay}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {running && (
            <Button variant="danger" size="sm" onClick={stopRun}>
              <Square size={13} />
              Stop
            </Button>
          )}
          {done && runId && (
            <Button variant="primary" size="sm" onClick={() => router.push(`/results/${runId}`)}>
              View Results
            </Button>
          )}
        </div>
      </div>

      {/* Model pipeline */}
      <div className="space-y-4">
        {modelStates.map((model, mi) => {
          const color = getModelColor(model.name);
          const isActive = mi === currentModelIdx && running && model.status !== "done";
          const completedPrompts = model.prompts.filter((p) => p.status === "done" || p.status === "error").length;

          return (
            <GlowCard
              key={model.name}
              className="p-5"
              glowColor={isActive ? color.hex + "15" : undefined}
              animate={false}
            >
              {/* Model header */}
              <div className="flex items-center gap-3 mb-2">
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color.hex }} />
                <span className="text-zinc-200 font-medium text-sm">{model.name}</span>
                <span className="ml-auto flex items-center gap-3">
                  {model.status === "loading" && (
                    <span className="flex items-center gap-1.5 text-amber-400 text-xs">
                      <Loader2 size={12} className="animate-spin" />
                      Loading...
                    </span>
                  )}
                  {model.status === "running" && (
                    <span className="text-xs text-zinc-500 font-mono tabular-nums">
                      {completedPrompts}/{model.prompts.length}
                    </span>
                  )}
                  {model.status === "done" && (
                    <span className="flex items-center gap-2 text-xs font-mono tabular-nums">
                      <span className={cn(model.overallScore >= 80 ? "text-emerald-400" : model.overallScore >= 60 ? "text-amber-400" : "text-zinc-400")}>{model.overallScore}%</span>
                      <span className="text-zinc-600">{model.avgTokensPerSec.toFixed(1)} t/s</span>
                    </span>
                  )}
                  {model.status === "skipped" && <span className="text-zinc-600 text-xs">Skipped</span>}
                  {model.status === "pending" && <span className="text-zinc-700 text-xs">Waiting...</span>}

                  {/* Judge badge */}
                  {model.judgeStatus === "pending" && (
                    <span className="text-violet-600 text-xs">Waiting for judge...</span>
                  )}
                  {model.judgeStatus === "scoring" && (
                    <span className="flex items-center gap-1.5 text-violet-400 text-xs">
                      <Loader2 size={11} className="animate-spin" />
                      Judging...
                    </span>
                  )}
                  {model.judgeStatus === "done" && (() => {
                    const judgedPrompts = model.prompts.filter(p => p.judgeScore !== undefined);
                    const avgJudge = judgedPrompts.length > 0
                      ? Math.round(judgedPrompts.reduce((s, p) => s + (p.judgeScore ?? 0), 0) / judgedPrompts.length)
                      : 0;
                    return (
                      <span className="flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-lg border text-violet-300 bg-violet-500/10 border-violet-500/20">
                        <Gavel size={10} />
                        Judge: {avgJudge}/100
                      </span>
                    );
                  })()}
                </span>
              </div>

              {/* Progress bar */}
              {model.prompts.length > 0 && (
                <div className="h-0.5 bg-white/[0.04] rounded-full mb-3 overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(completedPrompts / model.prompts.length) * 100}%`,
                      background: model.status === "done" ? (model.overallScore >= 80 ? "#10b981" : model.overallScore >= 60 ? "#eab308" : "#ef4444") : color.hex,
                    }}
                  />
                </div>
              )}

              {/* Prompt nodes */}
              <div className="flex flex-col gap-2">
                {model.prompts.map((p, pi) => {
                  const key = `${model.name}-${pi}`;
                  const isExpanded = expandedPrompts.has(key);
                  // Get the label from the correct source based on suite type
                  const scenarioLabel = suite.suite_type === "coding"
                    ? suite.codingScenarios?.[pi]?.name
                    : suite.suite_type === "vision"
                    ? suite.visionScenarios?.[pi]?.name
                    : suite.suite_type === "rag"
                    ? (suite.ragScenarios?.[pi] as Record<string, unknown>)?.question as string
                    : suite.prompts[pi]?.text;

                  return (
                    <div key={pi} className="w-full">
                      <button
                        onClick={() => togglePromptExpand(key)}
                        className={cn(
                          "apple-list-row w-full flex items-center gap-4 px-5 py-4 transition-colors group relative",
                          p.status === "running" ? "bg-blue-500/10" :
                          p.status === "done" ? "hover:bg-white/5" :
                          p.status === "error" || p.status === "timeout" ? "bg-red-500/5 hover:bg-red-500/10" :
                          "hover:bg-white/5"
                        )}
                      >
                        {p.status === "pending" && <div className="w-2.5 h-2.5 rounded-full border border-white/20 flex-shrink-0" />}
                        {p.status === "loading" && <Loader2 size={16} className="animate-spin text-yellow-400 flex-shrink-0" />}
                        {p.status === "running" && <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-[0_0_8px_rgba(96,165,250,0.8)] animate-pulse flex-shrink-0" />}
                        {p.status === "done" && <CheckCircle2 size={18} className="text-[#32D74B] flex-shrink-0" />}
                        {(p.status === "error" || p.status === "timeout") && <XCircle size={18} className="text-[#FF453A] flex-shrink-0" />}

                        <span className="text-zinc-300 text-[15px] font-medium tracking-tight flex-1 truncate group-hover:text-white transition-colors">
                          {scenarioLabel || `Scenario ${pi + 1}`}
                        </span>

                        <div className="flex items-center gap-4 flex-shrink-0">
                          {/* Docker execution indicator for coding suites */}
                          {p.dockerRunning && p.status === "running" && (
                            <span className="flex items-center gap-1.5 text-cyan-400 text-[12px] font-medium bg-cyan-400/10 px-2 py-0.5 rounded-md">
                              <Container size={11} className="animate-pulse" />
                              Running...
                            </span>
                          )}
                          {/* Test results summary badge for coding suites */}
                          {p.status === "done" && p.testResults && p.testResults.length > 0 && (
                            <span className={cn(
                              "text-[12px] font-mono px-2 py-0.5 rounded-md",
                              p.testResults.every(t => t.passed) ? "text-emerald-400 bg-emerald-500/10" :
                              p.testResults.some(t => t.passed) ? "text-amber-400 bg-amber-500/10" :
                              "text-red-400 bg-red-500/10"
                            )}>
                              {p.testResults.filter(t => t.passed).length}/{p.testResults.length} tests
                            </span>
                          )}
                          {p.status === "done" && (
                            <span className={cn(
                              "text-[16px] font-semibold tracking-tight tabular-nums",
                              p.score >= 80 ? "text-[#32D74B]" : p.score >= 50 ? "text-[#FF9F0A]" : "text-[#FF453A]"
                            )}>
                              {p.score}%
                            </span>
                          )}
                          {p.judgeScore !== undefined && (
                            <span className="text-[14px] font-medium tracking-tight tabular-nums flex items-center gap-1 text-zinc-500">
                              <Gavel size={12} />
                              {p.judgeScore}
                            </span>
                          )}
                          {p.status === "running" && p.response && (
                            <span className="text-blue-400 text-[14px] font-mono tracking-tight bg-blue-400/10 px-2 py-0.5 rounded-md">
                              {p.tokensPerSec > 0 ? `${p.tokensPerSec.toFixed(1)} t/s` : "..."}
                            </span>
                          )}
                          {p.response && (
                            <div className={cn(
                              "w-7 h-7 rounded-full flex items-center justify-center transition-colors shadow-sm",
                              isExpanded ? "bg-white text-black" : "bg-white/5 text-zinc-500 group-hover:bg-white/10 group-hover:text-white"
                            )}>
                              <ChevronDown
                                size={14}
                                className={cn("transition-transform flex-shrink-0", isExpanded && "rotate-180")}
                              />
                            </div>
                          )}
                        </div>
                      </button>

                      <AnimatePresence>
                        {isExpanded && p.response && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden"
                          >
                            <div className="mx-4 mb-4 mt-2 space-y-3">
                              {/* Response content */}
                              <div className="bg-[#0A0A0C] rounded-2xl border border-white/[0.04] max-h-80 overflow-y-auto shadow-inner relative isolate">
                                <div className="absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#0A0A0C] to-transparent pointer-events-none z-10 rounded-b-2xl" />
                                <div className="p-6">
                                  <MarkdownContent content={p.response} className="text-[14px] leading-relaxed text-zinc-300" />
                                </div>
                              </div>

                              {/* Test results for coding suites */}
                              {p.testResults && p.testResults.length > 0 && (
                                <div className="bg-[#0A0A0C] rounded-2xl border border-white/[0.04] p-4">
                                  <div className="flex items-center gap-3 mb-3">
                                    <span className="text-[12px] font-semibold uppercase tracking-wider text-zinc-500">
                                      Test Results
                                    </span>
                                    <span className="text-[12px] font-mono text-zinc-600">
                                      {p.testResults.filter(t => t.passed).length}/{p.testResults.length} passed
                                    </span>
                                    {p.scenarioLanguage && (
                                      <span className="text-[11px] text-cyan-500/60 font-mono">{p.scenarioLanguage}</span>
                                    )}
                                  </div>
                                  <div className="overflow-x-auto">
                                    <table className="w-full text-[11px] font-mono min-w-[400px]">
                                      <thead>
                                        <tr className="text-zinc-600 text-left text-[10px] uppercase tracking-wider">
                                          <th className="pb-1 pr-2 w-5"></th>
                                          <th className="pb-1 pr-3">Expected</th>
                                          <th className="pb-1 pr-3">Got</th>
                                          <th className="pb-1 text-right w-14">Time</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {p.testResults.map((t, ti) => (
                                          <tr key={ti} className="border-t border-white/[0.03]">
                                            <td className="py-1.5 pr-2 text-center">
                                              {t.passed
                                                ? <span className="text-emerald-500">✓</span>
                                                : <span className="text-red-500">✗</span>
                                              }
                                            </td>
                                            <td className={cn("py-1.5 pr-3 max-w-[200px] truncate", t.passed ? "text-zinc-600" : "text-zinc-300")} title={t.expectedOutput}>
                                              {t.expectedOutput || "—"}
                                            </td>
                                            <td className={cn("py-1.5 pr-3 max-w-[200px] truncate", t.passed ? "text-zinc-600" : "text-red-400")} title={t.error || t.actualOutput || ""}>
                                              {t.error ? t.error.slice(0, 80) : (t.actualOutput || "—")}
                                            </td>
                                            <td className="py-1.5 text-right text-zinc-700 whitespace-nowrap">
                                              {t.executionTimeMs != null ? `${Math.round(t.executionTimeMs)}ms` : ""}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}

                              {/* Docker not executed notice */}
                              {suite.suite_type === "coding" && !p.testResults?.length && p.status === "done" && (
                                <div className="bg-[#0A0A0C] rounded-2xl border border-amber-500/10 px-4 py-3 flex items-center gap-2 text-xs text-amber-500/70">
                                  <AlertTriangle size={13} />
                                  <span>Docker was not available — code was not executed against test cases.</span>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            </GlowCard>
          );
        })}
      </div>

      {/* Judge phase indicator */}
      {judgeEnabled && judgePhase !== "idle" && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {judgePhase === "loading" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-violet-500/8 border border-violet-500/20 rounded-2xl">
                <Loader2 size={16} className="text-violet-400 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-violet-300 text-sm font-medium">Loading judge model…</p>
                  <p className="text-violet-500 text-xs mt-0.5">{judgeModelDisplay}</p>
                </div>
              </div>
            )}

            {judgePhase === "scoring" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-violet-500/8 border border-violet-500/20 rounded-2xl">
                <Gavel size={16} className="text-violet-400 flex-shrink-0" />
                <div>
                  <p className="text-violet-300 text-sm font-medium">Judge evaluating responses…</p>
                  <p className="text-violet-500 text-xs mt-0.5">
                    {modelStates.filter((m) => m.judgeStatus === "done").length} / {modelStates.filter((m) => m.status === "done").length} models scored
                  </p>
                </div>
              </div>
            )}

            {judgePhase === "done" && judgeWinner && (
              <div className="flex items-center gap-4 px-5 py-4 bg-violet-500/10 border border-violet-500/30 rounded-2xl">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 flex items-center justify-center flex-shrink-0">
                  <Trophy size={18} className="text-violet-300" />
                </div>
                <div>
                  <p className="text-zinc-400 text-xs font-medium uppercase tracking-wider mb-0.5">Judge Verdict</p>
                  <p className="text-zinc-100 text-base font-semibold">{judgeWinner.modelName}</p>
                  <p className="text-zinc-500 text-xs mt-0.5">
                    won <span className="text-violet-400 font-mono">{judgeWinner.wins}</span> prompt{judgeWinner.wins !== 1 ? "s" : ""} according to {judgeModelDisplay}
                  </p>
                </div>
                <div className="ml-auto flex items-center gap-4">
                  {modelStates.filter((m) => m.judgeStatus === "done").map((m) => {
                    const color = getModelColor(m.name);
                    return (
                      <div key={m.name} className="text-center">
                        <div className="text-xl font-bold font-mono" style={{ color: color.hex }}>
                          {m.judgeWins ?? 0}
                        </div>
                        <div className="text-zinc-600 text-[10px] truncate max-w-[72px]">{m.name.split(":")[0]}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {judgePhase === "error" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-red-500/8 border border-red-500/20 rounded-2xl">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-red-300 text-sm font-medium">Judge failed</p>
                  <p className="text-red-500 text-xs mt-0.5">{judgeError}</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}

      {/* Peer judging phase indicator */}
      {peerPhase !== "idle" && (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {peerPhase === "running" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-blue-500/8 border border-blue-500/20 rounded-2xl">
                <Loader2 size={16} className="text-blue-400 animate-spin flex-shrink-0" />
                <div>
                  <p className="text-blue-300 text-sm font-medium">Peer judging in progress...</p>
                  <p className="text-blue-500 text-xs mt-0.5">Models are judging each other&apos;s responses ({peerProgress} scenarios evaluated)</p>
                </div>
              </div>
            )}

            {peerPhase === "done" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-emerald-500/8 border border-emerald-500/20 rounded-2xl">
                <CheckCircle2 size={16} className="text-emerald-400 flex-shrink-0" />
                <div>
                  <p className="text-emerald-300 text-sm font-medium">Peer judging complete</p>
                  <p className="text-emerald-500 text-xs mt-0.5">{peerProgress} scenarios evaluated via round-robin peer comparison. Elo ratings updated.</p>
                </div>
              </div>
            )}

            {peerPhase === "error" && (
              <div className="flex items-center gap-3 px-5 py-4 bg-red-500/8 border border-red-500/20 rounded-2xl">
                <AlertTriangle size={16} className="text-red-400 flex-shrink-0" />
                <div>
                  <p className="text-red-300 text-sm font-medium">Peer judging failed</p>
                  <p className="text-red-500 text-xs mt-0.5">{peerError}</p>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  );
}
