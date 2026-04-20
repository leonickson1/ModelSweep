"use client";

import { useEffect, useState } from "react";
import { Search, Download, ArrowUpDown } from "lucide-react";
import Link from "next/link";
import { useModelsStore } from "@/store/models-store";
import { formatBytes, formatRelativeTime, cn } from "@/lib/utils";

type SortKey = "name" | "size" | "score" | "modified";

interface ModelScore {
  modelName: string;
  overallScore: number;
  lastRunAt: string;
}

function familyTag(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("llama")) return "Llama";
  if (n.includes("qwen")) return "Qwen";
  if (n.includes("mistral") || n.includes("mixtral")) return "Mistral";
  if (n.includes("deepseek")) return "DeepSeek";
  if (n.includes("gemma")) return "Gemma";
  if (n.includes("phi")) return "Phi";
  return "Other";
}

export default function ModelsPage() {
  const { models } = useModelsStore();
  const [scores, setScores] = useState<Record<string, ModelScore>>({});
  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("modified");
  const [sortAsc, setSortAsc] = useState(false);

  useEffect(() => {
    fetch("/api/results")
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.runs?.length) return;
        const recent = data.runs.slice(0, 10);
        const results = await Promise.all(
          recent.map((r: { id: string }) =>
            fetch(`/api/results/${r.id}`)
              .then((res) => res.json())
              .catch(() => ({ run: null }))
          )
        );
        const scoreMap: Record<string, ModelScore> = {};
        for (const { run } of results) {
          if (!run?.models) continue;
          for (const m of run.models) {
            if (!m.skipped && m.overall_score > 0) {
              const existing = scoreMap[m.model_name];
              if (!existing || m.overall_score > existing.overallScore) {
                scoreMap[m.model_name] = {
                  modelName: m.model_name,
                  overallScore: m.overall_score,
                  lastRunAt: run.started_at,
                };
              }
            }
          }
        }
        setScores(scoreMap);
      })
      .catch(() => { });
  }, []);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc((a) => !a);
    else { setSortKey(key); setSortAsc(key === "name"); }
  };

  const filtered = models
    .filter((m) => m.name.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = a.name.localeCompare(b.name);
      else if (sortKey === "size") cmp = a.size - b.size;
      else if (sortKey === "modified") cmp = new Date(a.modified_at).getTime() - new Date(b.modified_at).getTime();
      else if (sortKey === "score") {
        const sa = scores[a.name]?.overallScore ?? -1;
        const sb = scores[b.name]?.overallScore ?? -1;
        cmp = sa - sb;
      }
      return sortAsc ? cmp : -cmp;
    });

  const totalSize = models.reduce((a, m) => a + m.size, 0);

  return (
    <div className="px-6 md:px-12 py-12 max-w-[1300px] mx-auto min-h-screen">
      
      {/* Segmented Control */}
      <div className="flex justify-center mb-12">
        <div className="apple-glass p-1.5 rounded-full flex gap-1 bg-white/[0.04]">
          <button className="px-8 py-2.5 rounded-full bg-white text-black text-[15px] font-semibold shadow-md transition-colors">
            Installed
          </button>
          <Link href="/models/browse" className="px-8 py-2.5 rounded-full text-[15px] font-medium text-zinc-400 hover:text-white transition-colors">
            Browse
          </Link>
        </div>
      </div>

      {/* Header */}
      <div className="mb-10">
        <h1 className="text-4xl font-semibold text-white tracking-tight mb-2">Models</h1>
        <p className="text-zinc-400 text-[17px] font-medium tracking-tight">
          {models.length} installed <span className="mx-1 text-zinc-600">&middot;</span> {formatBytes(totalSize)} disk usage
        </p>
      </div>

      {/* Search Bar - Apple Style */}
      <div className="relative mb-8">
        <div className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-500">
           <Search size={18} />
        </div>
        <input
          type="text"
          placeholder="Search installed models..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full apple-glass bg-white/[0.03] border border-white/10 rounded-[20px] pl-12 pr-4 py-4 text-[16px] text-white placeholder:text-zinc-500 focus:outline-none focus:border-white/20 focus:bg-white/[0.05] transition-all shadow-sm"
        />
      </div>

      {/* Table Panel */}
      <div className="apple-glass-panel rounded-[28px] overflow-hidden">
        {/* Table Header */}
        <div className="flex items-center p-4 px-6 text-[13px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-white/10 bg-white/[0.02]">
          <button onClick={() => toggleSort("name")} className="flex items-center gap-1.5 flex-1 hover:text-zinc-300 transition-colors text-left">
            Model {sortKey === "name" && <ArrowUpDown size={12} />}
          </button>
          <span className="w-24 hidden sm:block text-left">Family</span>
          <button onClick={() => toggleSort("size")} className="flex items-center gap-1.5 w-24 text-right justify-end hover:text-zinc-300 transition-colors">
            Size {sortKey === "size" && <ArrowUpDown size={12} />}
          </button>
          <button onClick={() => toggleSort("score")} className="flex items-center gap-1.5 w-20 text-right justify-end hover:text-zinc-300 transition-colors">
            Score {sortKey === "score" && <ArrowUpDown size={12} />}
          </button>
          <button onClick={() => toggleSort("modified")} className="flex items-center gap-1.5 w-32 text-right justify-end hover:text-zinc-300 transition-colors hidden md:flex">
            Last Run {sortKey === "modified" && <ArrowUpDown size={12} />}
          </button>
        </div>

        {filtered.length === 0 && (
          <div className="py-24 flex flex-col items-center justify-center text-center">
            <Search size={48} className="text-zinc-600 mb-4 stroke-1" />
            <p className="text-[17px] text-zinc-400 font-medium">
              {query ? "No models match your search." : "No models installed."}
            </p>
          </div>
        )}

        {filtered.map((model) => {
          const score = scores[model.name];
          const family = familyTag(model.name);
          return (
            <Link key={model.name} href={`/models/${encodeURIComponent(model.name)}`}>
              <div className="apple-list-row flex items-center p-5 px-6 transition-colors hover:bg-white/[0.04]">
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <span className="text-[17px] font-medium text-white truncate drop-shadow-sm mb-0.5">{model.name}</span>
                  <span className="text-[13px] text-zinc-400 font-mono">
                     {model.details?.parameter_size} <span className="mx-1 text-zinc-600">&middot;</span> {model.details?.quantization_level}
                  </span>
                </div>
                <span className="w-24 text-[14px] text-zinc-400 hidden sm:block font-medium">{family}</span>
                <span className="w-24 text-right text-[15px] text-zinc-400 font-mono tracking-tight">{formatBytes(model.size)}</span>
                <div className="w-20 text-right">
                  <span className={cn("text-[17px] font-semibold tracking-tight",
                    score ? (score.overallScore >= 80 ? "text-[#32D74B]" : score.overallScore >= 60 ? "text-[#FF9F0A]" : "text-white") : "text-zinc-600"
                  )}>
                    {score ? `${score.overallScore}%` : "—"}
                  </span>
                </div>
                <span className="w-32 text-right text-[14px] text-zinc-500 font-medium tracking-tight hidden md:block">
                  {score ? formatRelativeTime(score.lastRunAt) : "—"}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
