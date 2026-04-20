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
    <div className="px-6 md:px-12 py-12 h-screen flex flex-col max-w-[1500px] mx-auto text-white">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-10">
        <h1 className="text-4xl font-semibold tracking-tight mb-2">Playground</h1>
        <p className="text-zinc-400 text-[17px] font-medium mt-1">Quick single-prompt testing</p>
      </motion.div>

      <div className="flex-1 flex gap-8 min-h-0">
        {/* Left: Controls */}
        <div className="w-[450px] flex-shrink-0 flex flex-col gap-6 overflow-y-auto pr-2 custom-scrollbar">
          {/* Prompt input */}
          <div className="apple-glass rounded-[24px] p-6 flex flex-col">
            <label className="text-zinc-400 text-[12px] font-bold uppercase tracking-wider block mb-4">
              Prompt
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter your prompt here..."
              className="w-full bg-transparent text-white text-[16px] outline-none resize-none placeholder:text-zinc-600 min-h-[180px] leading-relaxed"
            />
          </div>

          {/* Model selection */}
          <div className="apple-glass rounded-[24px] p-6">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-zinc-400 text-[13px] font-semibold block mb-3">Primary Model</label>
                <select
                  value={selectedModel}
                  onChange={(e) => setModel(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] font-medium appearance-none outline-none focus:border-zinc-500 transition-colors"
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
                <label className="text-zinc-400 text-[13px] font-semibold block mb-3">Compare With</label>
                <select
                  value={compareModel}
                  onChange={(e) => setCompareModel(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-[15px] font-medium appearance-none outline-none focus:border-zinc-500 transition-colors"
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
          </div>

          {/* Parameter 2D map */}
          <div className="apple-glass rounded-[24px] p-6">
            <div className="flex items-center justify-between mb-5">
              <label className="text-zinc-400 text-[12px] font-bold uppercase tracking-wider">
                Parameters
              </label>
              <div className="flex items-center gap-4 text-[13px] text-zinc-500 font-medium font-mono">
                <span className="flex items-center gap-1.5">Temp: <span className="text-white font-mono">{temperature.toFixed(2)}</span> <InfoTooltip text="Controls randomness. Lower values produce more focused output, higher values increase creativity and variation." /></span>
                <span className="flex items-center gap-1.5">Top-P: <span className="text-white font-mono">{topP.toFixed(2)}</span> <InfoTooltip text="Nucleus sampling threshold. Lower values restrict output to more probable tokens, higher values allow more diversity." /></span>
              </div>
            </div>

            <div
              className="relative w-full h-[140px] mb-6 bg-black/40 rounded-xl border border-white/10 cursor-crosshair overflow-hidden"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const x = (e.clientX - rect.left) / rect.width;
                const y = (e.clientY - rect.top) / rect.height;
                setTemperature(parseFloat((x * 2).toFixed(2)));
                setTopP(parseFloat((1 - y).toFixed(2)));
              }}
            >
              <span className="absolute bottom-2 left-3 text-zinc-600 text-[13px] font-medium tracking-tight">Precise</span>
              <span className="absolute bottom-2 right-3 text-zinc-600 text-[13px] font-medium tracking-tight">Creative</span>
              <span className="absolute top-2 left-3 text-zinc-600 text-[13px] font-medium tracking-tight">Focused</span>
              <span className="absolute top-2 right-3 text-zinc-600 text-[13px] font-medium tracking-tight">Wild</span>
              <div
                className="absolute w-4 h-4 rounded-full bg-blue-500 border-2 border-blue-300 shadow-lg -translate-x-1/2 -translate-y-1/2 transition-all cursor-grab active:cursor-grabbing"
                style={{ left: `${mapX}%`, top: `${mapY}%` }}
              />
            </div>

            <div>
              <div className="flex justify-between text-[13px] mb-3 font-medium">
                <span className="text-zinc-400 flex items-center gap-1.5">Max Tokens <InfoTooltip text="Maximum number of tokens the model will generate in its response. Higher values allow longer outputs." /></span>
                <span className="text-white font-mono font-bold tracking-wider">{maxTokens}</span>
              </div>
              <input
                type="range" min={128} max={4096} step={128}
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))}
                className="w-full h-1.5 bg-black/50 rounded-full appearance-none cursor-pointer border border-white/10"
              />
            </div>
          </div>

          {/* Run button */}
          <div className="flex gap-3 pb-8">
            {running ? (
              <button className="flex-1 h-12 rounded-full font-semibold px-6 bg-red-500/10 text-red-400 flex items-center justify-center gap-2 hover:bg-red-500/20 transition-all active:scale-[0.98]" onClick={stop}>
                <Square size={16} />
                Stop
              </button>
            ) : (
              <button
                className="flex-1 h-12 rounded-full font-semibold px-6 bg-white text-black flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none shadow-sm"
                disabled={!prompt.trim() || !selectedModel}
                onClick={run}
              >
                <Play size={16} className="fill-current" />
                Run {modelsToRun.length > 1 ? `(${modelsToRun.length} models)` : ""}
              </button>
            )}
          </div>
        </div>

        {/* Right: Output */}
        <div className="flex-1 flex flex-col gap-5 overflow-y-auto min-h-0 pr-4 custom-scrollbar">
          {modelsToRun.length === 0 ? (
            <div className="flex-1 flex items-center justify-center text-zinc-500 text-[16px] font-medium">
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
                  className="apple-glass rounded-[28px] overflow-hidden transition-all duration-300"
                  style={isExpanded && result?.text ? { boxShadow: `0 0 40px ${color.hex}15` } : {}}
                >
                  {/* Header */}
                  <button
                    onClick={() => toggleExpand(m)}
                    className="w-full flex items-center gap-4 px-6 py-5 hover:bg-white/[0.04] transition-colors text-left"
                  >
                    {cloud ? (
                      <Cloud size={20} className="text-violet-400 flex-shrink-0" />
                    ) : (
                      <div className="w-2 h-2 rounded-full shadow-sm" style={{ background: color.hex }} />
                    )}
                    <span className="text-white text-[17px] font-semibold flex-1 truncate tracking-tight">{displayName}</span>
                    {isStreaming && (
                      <span className="text-blue-400 text-[13px] font-medium animate-pulse tracking-tight">Streaming...</span>
                    )}
                    {result?.done && (
                      <div className="flex items-center gap-4 text-[13px] text-zinc-400 font-mono font-medium">
                        <span className="flex items-center gap-1.5">
                          <Zap size={14} />
                          {result.tokensPerSec.toFixed(1)} t/s
                        </span>
                        <span>{result.totalTokens} tok</span>
                      </div>
                    )}
                    {!result && !running && (
                      <span className="text-zinc-600 text-[14px]">No output yet</span>
                    )}
                    <ChevronDown
                      size={18}
                      className={cn(
                         "text-zinc-500 transition-transform flex-shrink-0 ml-2",
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
                        <div className="border-t border-white/5 px-6 py-5 max-h-[600px] overflow-y-auto custom-scrollbar text-zinc-300">
                          {cloud && result?.done && (
                            <p className="text-zinc-500 text-[13px] font-medium mb-3 flex items-center gap-2">
                              <Cloud size={14} />
                              Cloud model — speed includes network latency
                            </p>
                          )}
                          {result?.text ? (
                            <div className="text-[16px] leading-relaxed">
                               <MarkdownContent content={result.text} />
                            </div>
                          ) : (
                            <p className="text-zinc-500 text-[15px] font-medium text-center py-8">
                              {running ? (
                                <span className="animate-pulse tracking-tight text-white/70">Generating response...</span>
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
