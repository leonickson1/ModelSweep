"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Cpu, Search, ArrowUpDown, AlertTriangle } from "lucide-react";
import Link from "next/link";
import { useModelsStore } from "@/store/models-store";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { getModelColor } from "@/lib/model-colors";
import { formatBytes, formatRelativeTime, cn } from "@/lib/utils";

type SortKey = "name" | "size" | "score" | "modified";

interface ModelScore {
  modelName: string;
  overallScore: number;
  lastRunAt: string;
}

// Circular score ring using SVG
function ScoreRing({ score, color, size = 64 }: { score: number; color: string; size?: number }) {
  const r = size * 0.38;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (score / 100) * circumference;

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="flex-shrink-0">
      {/* Track */}
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth={size * 0.075} />
      {/* Fill — animated via CSS stroke-dashoffset */}
      <motion.circle
        cx={cx} cy={cy} r={r}
        fill="none"
        stroke={color}
        strokeWidth={size * 0.075}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference - filled }}
        transition={{ duration: 0.8, ease: [0.25, 0.1, 0.25, 1], delay: 0.1 }}
        transform={`rotate(-90 ${cx} ${cy})`}
      />
      {/* Score text */}
      <text
        x={cx} y={cy + 1}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="white"
        fontSize={size * 0.22}
        fontWeight="600"
        fontFamily="Inter, system-ui, sans-serif"
      >
        {score}
      </text>
      <text
        x={cx} y={cy + size * 0.185}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="rgba(255,255,255,0.35)"
        fontSize={size * 0.14}
        fontFamily="Inter, system-ui, sans-serif"
      >
        %
      </text>
    </svg>
  );
}

// Family tag extracted from model name
function familyTag(name: string): string {
  const n = name.toLowerCase();
  if (n.includes("llama")) return "Llama";
  if (n.includes("qwen")) return "Qwen";
  if (n.includes("mistral") || n.includes("mixtral")) return "Mistral";
  if (n.includes("deepseek")) return "DeepSeek";
  if (n.includes("gemma")) return "Gemma";
  if (n.includes("phi")) return "Phi";
  if (n.includes("codellama")) return "CodeLlama";
  if (n.includes("vicuna")) return "Vicuna";
  if (n.includes("orca")) return "Orca";
  if (n.includes("nous")) return "Nous";
  if (n.includes("wizard")) return "Wizard";
  if (n.includes("starling")) return "Starling";
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

  const untested = models.filter((m) => !scores[m.name]);
  const lowScoring = Object.values(scores).filter((s) => s.overallScore < 40);

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Models</h1>
          <InfoTooltip text="All locally installed Ollama models with their evaluation scores" />
        </div>
        <p className="text-zinc-500 text-sm mt-1">
          {models.length} installed · {formatBytes(models.reduce((a, m) => a + m.size, 0))} total
        </p>
      </motion.div>

      {/* Alerts */}
      {untested.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-yellow-500/8 border border-yellow-500/15 rounded-xl text-xs text-yellow-400">
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span>{untested.length} model{untested.length !== 1 ? "s" : ""} never tested.</span>
            <Link href="/suite" className="ml-auto underline hover:no-underline">Test now</Link>
          </div>
        </motion.div>
      )}
      {lowScoring.length > 0 && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mb-4">
          <div className="flex items-center gap-3 px-4 py-3 bg-red-500/8 border border-red-500/15 rounded-xl text-xs text-red-400">
            <AlertTriangle size={13} className="flex-shrink-0" />
            <span>{lowScoring.length} model{lowScoring.length !== 1 ? "s" : ""} scored below 40% — consider removing them.</span>
          </div>
        </motion.div>
      )}

      {/* Search & Sort */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-600" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models..."
            className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/[0.06] rounded-xl text-zinc-300 text-sm placeholder:text-zinc-600 outline-none focus:border-white/20"
          />
        </div>
        {(["name", "size", "score", "modified"] as SortKey[]).map((key) => (
          <button
            key={key}
            onClick={() => toggleSort(key)}
            className={cn(
              "flex items-center gap-1 px-3 py-2 rounded-xl text-xs transition-colors border capitalize",
              sortKey === key
                ? "bg-white/10 text-zinc-200 border-white/20"
                : "bg-white/5 text-zinc-500 border-white/[0.06] hover:bg-white/8"
            )}
          >
            {key}
            <ArrowUpDown size={10} />
          </button>
        ))}
      </div>

      {models.length === 0 ? (
        <EmptyState
          icon={<Cpu size={40} />}
          title="No models installed"
          description="Install models via Ollama to see them here."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-[1px] bg-zinc-800/40 border border-zinc-800/40">
          {filtered.map((model, i) => {
            const color = getModelColor(model.name);
            const score = scores[model.name];
            const family = familyTag(model.name);

            return (
              <motion.div
                key={model.name}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.04 * i, duration: 0.35, ease: [0.25, 0.1, 0.25, 1] }}
                whileHover={{ y: -3, transition: { duration: 0.15 } }}
              >
                <Link href={`/models/${encodeURIComponent(model.name)}`} className="block h-full">
                  <div className="group relative h-full bg-[#050505] overflow-hidden hover:bg-[#0A1A10] transition-colors duration-200">

                    {/* Colored left border */}
                    <div
                      className="absolute left-0 top-0 bottom-0 w-[2px]"
                      style={{ background: color.hex, boxShadow: `0 0 8px ${color.hex}` }}
                    />

                    {/* Subtle glow on hover */}
                    <div
                      className="absolute inset-0 opacity-0 group-hover:opacity-[0.04] transition-opacity duration-300 pointer-events-none"
                      style={{ background: `radial-gradient(ellipse at 20% 50%, ${color.hex}, transparent 70%)` }}
                    />

                    <div className="pl-6 pr-4 pt-5 pb-5">
                      {/* Top row: name + family tag */}
                      <div className="flex items-start justify-between gap-2 mb-4">
                        <div className="min-w-0">
                          <div className="text-zinc-100 font-mono font-bold uppercase tracking-widest text-sm leading-tight truncate">
                            {model.name}
                          </div>
                          <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                            <span
                              className="text-[9px] font-mono tracking-widest uppercase px-2 py-1 rounded-none border"
                              style={{ background: color.hex + "10", color: color.hex, borderColor: color.hex + "30" }}
                            >
                              {family}
                            </span>
                            {model.details?.parameter_size && (
                              <span className="text-[9px] px-2 py-1 border border-zinc-800 bg-black text-zinc-500 font-mono tracking-widest uppercase">
                                {model.details.parameter_size}
                              </span>
                            )}
                            {model.details?.quantization_level && (
                              <span className="text-[9px] px-2 py-1 border border-zinc-800 bg-black text-zinc-500 font-mono tracking-widest uppercase">
                                {model.details.quantization_level}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Score ring or untested placeholder */}
                        <div className="flex flex-col items-center gap-1">
                        {score ? (
                          <ScoreRing score={score.overallScore} color={color.hex} size={58} />
                        ) : (
                          <div className="w-[58px] h-[58px] rounded-full border border-zinc-800 flex items-center justify-center flex-shrink-0">
                            <span className="text-zinc-600 font-mono text-[8px] uppercase tracking-widest text-center leading-tight">un<br />tested</span>
                          </div>
                        )}
                        <InfoTooltip text="Overall evaluation score across all test suites" />
                        </div>
                      </div>

                      {/* Divider */}
                      <div className="h-px bg-zinc-900 mb-4" />

                      {/* Bottom row: size + last run */}
                      <div className="flex items-center justify-between text-xs font-mono uppercase tracking-widest">
                        <span className="text-zinc-600">{formatBytes(model.size)}</span>
                        {score ? (
                          <span className="text-[#00FF66]">
                            {formatRelativeTime(score.lastRunAt)}
                          </span>
                        ) : (
                          <span className="text-zinc-700">Never tested</span>
                        )}
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
