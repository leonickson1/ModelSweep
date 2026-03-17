"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Play, Square, Zap, ChevronDown, Cloud } from "lucide-react";
import { useModelsStore } from "@/store/models-store";
import { usePreferencesStore } from "@/store/preferences-store";
import { useCloudProvidersStore, type CloudProvider } from "@/store/cloud-providers-store";
import { GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";
import { ModelColorDot } from "@/components/ui/model-badge";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { getModelColor } from "@/lib/model-colors";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";

interface StreamResult {
  text: string;
  tokensPerSec: number;
  totalTokens: number;
  done: boolean;
  isCloud?: boolean;
}

export default function PlaygroundPage() {
  const { models } = useModelsStore();
  const prefs = usePreferencesStore();
  const { providers, fetchProviders, loaded: cloudLoaded } = useCloudProvidersStore();

  useEffect(() => {
    if (!cloudLoaded) fetchProviders();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const playgroundProviders = providers.filter((p) => p.useForPlayground && p.selectedModel);

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [temperature, setTemperature] = useState(prefs.defaultTemperature);
  const [topP, setTopP] = useState(prefs.defaultTopP);
  const [maxTokens, setMaxTokens] = useState(prefs.defaultMaxTokens);
  const [results, setResults] = useState<Record<string, StreamResult>>({});
  const [running, setRunning] = useState(false);
  const [compareModel, setCompareModel] = useState("");
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const selectedModel = model || models[0]?.name || "";

  const isCloudModel = (modelId: string) => modelId.startsWith("cloud:");
  const getCloudProvider = (modelId: string): CloudProvider | undefined =>
    providers.find((p) => p.id === modelId.replace("cloud:", ""));
  const getModelDisplayName = (modelId: string): string => {
    if (isCloudModel(modelId)) {
      const cp = getCloudProvider(modelId);
      return cp ? `${cp.selectedModel} (${cp.label})` : modelId;
    }
    return modelId;
  };

  const toggleExpand = (m: string) => {
    setExpandedModels((s) => {
      const next = new Set(s);
      if (next.has(m)) next.delete(m); else next.add(m);
      return next;
    });
  };

  const runPromptOllama = async (targetModel: string) => {
    if (!prompt.trim() || !targetModel) return;
    setResults((r) => ({ ...r, [targetModel]: { text: "", tokensPerSec: 0, totalTokens: 0, done: false } }));
    setExpandedModels((s) => { const n = new Set(s); n.add(targetModel); return n; });

    try {
      const res = await fetch(`${prefs.ollamaUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: targetModel,
          messages: [{ role: "user", content: prompt }],
          stream: true,
          options: { temperature, top_p: topP, num_predict: maxTokens },
        }),
        signal: abortRef.current!.signal,
      });

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const chunk = JSON.parse(line);
            if (chunk.message?.content) {
              setResults((r) => ({
                ...r,
                [targetModel]: {
                  ...r[targetModel],
                  text: (r[targetModel]?.text || "") + chunk.message.content,
                },
              }));
            }
            if (chunk.done) {
              const tps = chunk.eval_count && chunk.eval_duration
                ? chunk.eval_count / (chunk.eval_duration / 1e9)
                : 0;
              setResults((r) => ({
                ...r,
                [targetModel]: {
                  ...r[targetModel],
                  tokensPerSec: tps,
                  totalTokens: chunk.eval_count ?? 0,
                  done: true,
                },
              }));
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setResults((r) => ({
          ...r,
          [targetModel]: { text: `Error: ${err}`, tokensPerSec: 0, totalTokens: 0, done: true },
        }));
      }
    }
  };

  const runPromptCloud = async (modelId: string) => {
    const providerId = modelId.replace("cloud:", "");
    setResults((r) => ({ ...r, [modelId]: { text: "", tokensPerSec: 0, totalTokens: 0, done: false, isCloud: true } }));
    setExpandedModels((s) => { const n = new Set(s); n.add(modelId); return n; });

    try {
      const res = await fetch("/api/providers/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          providerId,
          messages: [{ role: "user", content: prompt }],
          temperature,
          top_p: topP,
          max_tokens: maxTokens,
        }),
        signal: abortRef.current!.signal,
      });

      if (!res.body) return;
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const chunk = JSON.parse(line.slice(6));
            if (chunk.error) {
              setResults((r) => ({
                ...r,
                [modelId]: { ...r[modelId], text: `Error: ${chunk.error}`, done: true, isCloud: true, tokensPerSec: 0, totalTokens: 0 },
              }));
              return;
            }
            if (chunk.token) {
              setResults((r) => ({
                ...r,
                [modelId]: { ...r[modelId], text: (r[modelId]?.text || "") + chunk.token },
              }));
            }
            if (chunk.done) {
              setResults((r) => ({
                ...r,
                [modelId]: {
                  ...r[modelId],
                  tokensPerSec: chunk.tokensPerSec ?? 0,
                  totalTokens: chunk.totalTokens ?? 0,
                  done: true,
                  isCloud: true,
                },
              }));
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        setResults((r) => ({
          ...r,
          [modelId]: { text: `Error: ${err}`, tokensPerSec: 0, totalTokens: 0, done: true, isCloud: true },
        }));
      }
    }
  };

  const runPrompt = async (targetModel: string) => {
    if (isCloudModel(targetModel)) {
      return runPromptCloud(targetModel);
    }
    return runPromptOllama(targetModel);
  };

  const run = () => {
    const modelsToRun = [selectedModel, compareModel].filter(Boolean);
    setResults({});
    setRunning(true);
    abortRef.current = new AbortController();
    Promise.all(modelsToRun.map(runPrompt)).finally(() => setRunning(false));
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
  };

  const mapX = (temperature / 2) * 100;
  const mapY = ((1 - topP) / 1) * 100;
  const modelsToRun = [selectedModel, compareModel].filter(Boolean);

  const renderModelOption = (m: { name: string; value: string; isCloud?: boolean; label?: string }) => (
    <option key={m.value} value={m.value}>
      {m.isCloud ? `${m.name} (${m.label})` : m.name}
    </option>
  );

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const _allModelOptions = [
    ...models.map((m) => ({ name: m.name, value: m.name })),
    ...playgroundProviders.map((p) => ({
      name: p.selectedModel || "",
      value: `cloud:${p.id}`,
      isCloud: true,
      label: p.label,
    })),
  ];

  return (
    <div className="p-8 h-screen flex flex-col max-w-7xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Playground</h1>
        <p className="text-zinc-500 text-sm mt-1">Quick single-prompt testing</p>
      </motion.div>

      <div className="flex-1 flex gap-6 min-h-0">
        {/* Left: Controls */}
        <div className="w-[400px] flex-shrink-0 flex flex-col gap-4 overflow-y-auto">
          {/* Prompt input */}
          <GlowCard className="p-4 flex flex-col" animate={false}>
            <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider block mb-3">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              className="bg-transparent text-zinc-200 text-sm outline-none resize-none placeholder:text-zinc-600 min-h-[160px]"
            />
          </GlowCard>

          {/* Model selection */}
          <GlowCard className="p-4" animate={false}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-zinc-500 text-xs font-medium block mb-2">Primary Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm appearance-none outline-none focus:border-white/20"
                >
                  {models.length > 0 && (
                    <optgroup label="LOCAL MODELS">
                      {models.map((m) => renderModelOption({ name: m.name, value: m.name }))}
                    </optgroup>
                  )}
                  {playgroundProviders.length > 0 && (
                    <optgroup label="CLOUD MODELS">
                      {playgroundProviders.map((p) => renderModelOption({
                        name: p.selectedModel || "",
                        value: `cloud:${p.id}`,
                        isCloud: true,
                        label: p.label,
                      }))}
                    </optgroup>
                  )}
                </select>
              </div>
              <div>
                <label className="text-zinc-500 text-xs font-medium block mb-2">Compare With</label>
                <select
                  value={compareModel}
                  onChange={(e) => setCompareModel(e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm appearance-none outline-none focus:border-white/20"
                >
                  <option value="">None</option>
                  {models.length > 0 && (
                    <optgroup label="LOCAL MODELS">
                      {models.filter((m) => m.name !== selectedModel).map((m) =>
                        renderModelOption({ name: m.name, value: m.name })
                      )}
                    </optgroup>
                  )}
                  {playgroundProviders.length > 0 && (
                    <optgroup label="CLOUD MODELS">
                      {playgroundProviders
                        .filter((p) => `cloud:${p.id}` !== selectedModel)
                        .map((p) => renderModelOption({
                          name: p.selectedModel || "",
                          value: `cloud:${p.id}`,
                          isCloud: true,
                          label: p.label,
                        }))}
                    </optgroup>
                  )}
                </select>
              </div>
            </div>
          </GlowCard>

          {/* Parameter 2D map */}
          <GlowCard className="p-4" animate={false}>
            <div className="flex items-center justify-between mb-3">
              <label className="text-zinc-500 text-xs font-medium uppercase tracking-wider">
                Parameters
              </label>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span className="flex items-center gap-1">Temp: <span className="text-zinc-300 font-mono">{temperature.toFixed(2)}</span> <InfoTooltip text="Controls randomness. Lower values produce more focused output, higher values increase creativity and variation." /></span>
                <span className="flex items-center gap-1">Top-P: <span className="text-zinc-300 font-mono">{topP.toFixed(2)}</span> <InfoTooltip text="Nucleus sampling threshold. Lower values restrict output to more probable tokens, higher values allow more diversity." /></span>
              </div>
            </div>

            <div
              className="relative w-full h-28 mb-4 bg-white/[0.03] rounded-xl border border-white/[0.05] cursor-crosshair overflow-hidden"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                setTemperature(parseFloat((x * 2).toFixed(2)));
                setTopP(parseFloat((1 - y).toFixed(2)));
              }}
            >
              <span className="absolute bottom-1 left-2 text-zinc-700 text-xs">Precise</span>
              <span className="absolute bottom-1 right-2 text-zinc-700 text-xs">Creative</span>
              <span className="absolute top-1 left-2 text-zinc-700 text-xs">Focused</span>
              <span className="absolute top-1 right-2 text-zinc-700 text-xs">Wild</span>
              <div
                className="absolute w-3 h-3 rounded-full bg-blue-400 border-2 border-blue-300 shadow-lg -translate-x-1/2 -translate-y-1/2 transition-all"
                style={{ left: `${mapX}%`, top: `${mapY}%` }}
              />
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-zinc-600 flex items-center gap-1">Max Tokens <InfoTooltip text="Maximum number of tokens the model will generate in its response. Higher values allow longer outputs." /></span>
                <span className="text-zinc-400 font-mono">{maxTokens}</span>
              </div>
              <input
                type="range" min={128} max={4096} step={128}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer"
              />
            </div>
          </GlowCard>

          {/* Run button */}
          <div className="flex gap-2">
            {running ? (
              <Button variant="danger" className="flex-1" onClick={stop}>
                <Square size={14} />
                Stop
              </Button>
            ) : (
              <Button
                variant="primary"
                className="flex-1"
                disabled={!prompt.trim() || !selectedModel}
                onClick={run}
              >
                <Play size={14} />
                Run {modelsToRun.length > 1 ? `(${modelsToRun.length} models)` : ""}
              </Button>
            )}
          </div>
        </div>

        {/* Right: Output */}
        <div className="flex-1 flex flex-col gap-3 overflow-y-auto min-h-0">
          {modelsToRun.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-zinc-700 text-sm">
              Select a model to get started
            </div>
          ) : (
            modelsToRun.map((m) => {
              const result = results[m];
              const displayName = getModelDisplayName(m);
              const cloud = isCloudModel(m);
              const color = cloud ? { hex: "#8b5cf6" } : getModelColor(m);
              const isExpanded = expandedModels.has(m);
              const isStreaming = running && result && !result.done;

              return (
                <div
                  key={m}
                  className="bg-white/5 border border-white/[0.06] rounded-2xl overflow-hidden"
                  style={isExpanded && result?.text ? { boxShadow: `0 0 30px ${color.hex}10` } : {}}
                >
                  {/* Header */}
                  <button
                    onClick={() => toggleExpand(m)}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors text-left"
                  >
                    {cloud ? (
                      <Cloud size={14} className="text-violet-400 flex-shrink-0" />
                    ) : (
                      <ModelColorDot name={m} />
                    )}
                    <span className="text-zinc-300 text-sm font-medium flex-1 truncate">{displayName}</span>
                    {isStreaming && (
                      <span className="text-blue-400 text-xs animate-pulse">Streaming...</span>
                    )}
                    {result?.done && (
                      <div className="flex items-center gap-3 text-xs text-zinc-500">
                        <span className="flex items-center gap-1">
                          <Zap size={10} />
                          {result.tokensPerSec.toFixed(1)} t/s
                        </span>
                        <span>{result.totalTokens} tokens</span>
                      </div>
                    )}
                    {!result && !running && (
                      <span className="text-zinc-600 text-xs">No output yet</span>
                    )}
                    <ChevronDown
                      size={14}
                      className={cn(
                        "text-zinc-600 transition-transform flex-shrink-0",
                        isExpanded && "rotate-180"
                      )}
                    />
                  </button>

                  {/* Collapsible body */}
                  <AnimatePresence>
                    {isExpanded && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2 }}
                        className="overflow-hidden"
                      >
                        <div className="border-t border-white/[0.05] px-4 py-3 max-h-96 overflow-y-auto">
                          {cloud && result?.done && (
                            <p className="text-zinc-600 text-xs mb-2 flex items-center gap-1.5">
                              <Cloud size={10} />
                              Cloud model — speed includes network latency
                            </p>
                          )}
                          {result?.text ? (
                            <MarkdownContent content={result.text} />
                          ) : (
                            <p className="text-zinc-600 text-sm text-center py-4">
                              {running ? (
                                <span className="animate-pulse">Waiting for response...</span>
                              ) : (
                                "Run a prompt to see output here"
                              )}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
