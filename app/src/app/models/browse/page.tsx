"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Download, Check, ChevronLeft, Loader2, Package, AlertCircle } from "lucide-react";
import Link from "next/link";
import { GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";

interface LibraryModel {
  name: string;
  description: string;
  pulls: string;
  tags: string[];
  updated: string;
}

interface PullState {
  status: "idle" | "pulling" | "done" | "error";
  percent: number;
  statusText: string;
}

export default function BrowseModelsPage() {
  const [models, setModels] = useState<LibraryModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [installedModels, setInstalledModels] = useState<Set<string>>(new Set());
  const [pullStates, setPullStates] = useState<Record<string, PullState>>({});

  const fetchLibrary = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/models/browse");
      const data = await res.json();
      setModels(data.models || []);
      setError(data.error || null);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchInstalled = useCallback(async () => {
    try {
      const res = await fetch("/api/models");
      const data = await res.json();
      const names = new Set<string>();
      for (const m of data.models || []) {
        // Extract base name (e.g., "llama3.2:7b" -> "llama3.2")
        const base = (m.name || m.model || "").split(":")[0];
        names.add(base);
      }
      setInstalledModels(names);
    } catch {
      // non-fatal
    }
  }, []);

  useEffect(() => {
    fetchLibrary();
    fetchInstalled();
  }, [fetchLibrary, fetchInstalled]);

  const pullModel = async (modelName: string) => {
    setPullStates(prev => ({
      ...prev,
      [modelName]: { status: "pulling", percent: 0, statusText: "Starting..." },
    }));

    try {
      const res = await fetch("/api/models/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: modelName }),
      });

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));
            if (data.type === "progress") {
              setPullStates(prev => ({
                ...prev,
                [modelName]: {
                  status: "pulling",
                  percent: data.percent || 0,
                  statusText: data.status || "Downloading...",
                },
              }));
            } else if (data.type === "complete") {
              setPullStates(prev => ({
                ...prev,
                [modelName]: { status: "done", percent: 100, statusText: "Installed!" },
              }));
              setInstalledModels(prev => {
                const next = new Set(Array.from(prev));
                next.add(modelName.split(":")[0]);
                return next;
              });
            } else if (data.type === "error") {
              setPullStates(prev => ({
                ...prev,
                [modelName]: { status: "error", percent: 0, statusText: data.error },
              }));
            }
          } catch {
            // skip
          }
        }
      }
    } catch (err) {
      setPullStates(prev => ({
        ...prev,
        [modelName]: { status: "error", percent: 0, statusText: String(err) },
      }));
    }
  };

  const filtered = models.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen px-6 md:px-12 py-12 max-w-[1300px] mx-auto text-white">
      {/* Header */}
      <div>
        <Link href="/models" className="inline-flex items-center gap-2 text-zinc-400 hover:text-white transition-colors text-[15px] font-medium mb-8">
          <ChevronLeft size={18} />
          Back to Models
        </Link>

        <div className="flex items-center justify-between mb-10">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight mb-2">Browse Models</h1>
            <p className="text-zinc-400 text-[17px] font-medium mt-1">
              {models.length} models available from the Ollama library
            </p>
          </div>
        </div>

        {/* Search */}
        <div className="relative mb-12">
          <Search size={20} className="absolute left-5 top-1/2 -translate-y-1/2 text-zinc-500" />
          <input
            type="text"
            placeholder="Search models..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full apple-glass bg-white/[0.03] border border-white/10 rounded-[20px] pl-14 pr-6 py-4 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all shadow-sm"
          />
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-zinc-600" />
            <span className="ml-3 text-zinc-600 text-sm">Loading model library...</span>
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="flex items-center gap-2 text-red-400 text-sm mb-6">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Grid */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <AnimatePresence>
              {filtered.map((model, i) => {
                const baseName = model.name.split(":")[0];
                const isInstalled = installedModels.has(baseName);
                const pullState = pullStates[model.name];

                return (
                  <motion.div
                    key={model.name}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(i * 0.015, 0.3) }}
                  >
                    <div className="apple-glass rounded-[24px] p-6 h-full flex flex-col hover:bg-white/[0.04] transition-colors border border-white/[0.05]">
                      <div className="flex items-start justify-between mb-4">
                        <div className="flex items-center gap-3">
                          <Package size={18} className="text-[#32D74B]/80" />
                          <h3 className="text-[18px] font-semibold text-white tracking-tight">{model.name}</h3>
                        </div>
                        {isInstalled && !pullState && (
                          <span className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-mono font-bold tracking-wider uppercase px-2 py-1 bg-emerald-500/10 rounded-md">
                            <Check size={14} />
                            Installed
                          </span>
                        )}
                      </div>

                      <p className="text-[15px] text-zinc-400 leading-relaxed flex-1 mb-6 line-clamp-3">
                        {model.description || "No description available"}
                      </p>

                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4 text-[13px] text-zinc-500 font-medium font-mono">
                          {model.pulls && <span>{model.pulls} pulls</span>}
                          {model.updated && <span>{model.updated}</span>}
                        </div>

                        {pullState?.status === "pulling" ? (
                          <div className="flex items-center gap-3">
                            <div className="w-24 h-2 bg-black/50 border border-white/10 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-[#32D74B] rounded-full transition-all duration-300"
                                style={{ width: `${pullState.percent}%` }}
                              />
                            </div>
                            <span className="text-[12px] text-zinc-400 font-mono font-bold w-10 text-right">
                              {pullState.percent}%
                            </span>
                          </div>
                        ) : pullState?.status === "done" ? (
                          <span className="flex items-center gap-1.5 text-[12px] text-emerald-400 font-mono font-bold tracking-wider uppercase px-2 py-1 bg-emerald-500/10 rounded-md">
                            <Check size={14} />
                            Done
                          </span>
                        ) : pullState?.status === "error" ? (
                          <button className="px-4 py-1.5 bg-red-500/10 text-red-400 text-[14px] font-semibold rounded-full hover:bg-red-500/20 transition-colors" onClick={() => pullModel(model.name)}>
                            Retry
                          </button>
                        ) : isInstalled ? null : (
                          <button className="px-4 py-1.5 apple-glass text-zinc-300 text-[14px] font-semibold rounded-full hover:text-white hover:bg-white/10 transition-colors flex items-center gap-1.5" onClick={() => pullModel(model.name)}>
                            <Download size={14} />
                            Install
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        )}

        {!loading && filtered.length === 0 && models.length > 0 && (
          <div className="text-center py-20 text-zinc-600 text-sm">
            No models matching &ldquo;{search}&rdquo;
          </div>
        )}
      </div>
    </div>
  );
}
