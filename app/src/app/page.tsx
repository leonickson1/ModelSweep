"use client";

import { useEffect, useState } from "react";
import { Play, ChevronRight, Zap, Target, Activity, LayoutGrid, PackageOpen } from "lucide-react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { useModelsStore } from "@/store/models-store";
import { useConnectionStore } from "@/store/connection-store";
import { detectModelFamily } from "@/lib/model-colors";
import { formatBytes, formatRelativeTime, cn } from "@/lib/utils";

type SuiteType = "standard" | "tool_calling" | "conversation" | "adversarial" | "coding" | "vision" | "rag";

const SUITE_TYPE_BADGE: Record<string, { label: string; color: string; bg: string; border: string }> = {
  standard: { label: "Standard", color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
  tool_calling: { label: "Tools", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  conversation: { label: "Convo", color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  adversarial: { label: "Attack", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
  coding: { label: "Code", color: "text-cyan-400", bg: "bg-cyan-500/10", border: "border-cyan-500/20" },
  vision: { label: "Vision", color: "text-amber-400", bg: "bg-amber-500/10", border: "border-amber-500/20" },
  rag: { label: "RAG", color: "text-emerald-400", bg: "bg-emerald-500/10", border: "border-emerald-500/20" },
};

interface RunSummary {
  id: string;
  suite_name: string;
  suite_type?: SuiteType;
  started_at: string;
  status: string;
  model_count: number;
}

interface ModelScore {
  modelName: string;
  overallScore: number;
  runId: string;
  runDate: string;
  categoryScores: { coding: number | null; creative: number | null; reasoning: number | null; instruction: number | null; speed: number | null };
  avgTokensPerSec: number;
  avgTTFT: number;
  family: string;
  eloRating?: number;
  eloConfidence?: number;
}

const listVariant = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05, duration: 0.3 } }
};

const itemVariant = {
  hidden: { opacity: 0, scale: 0.98 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } }
};

export default function DashboardPage() {
  const { models } = useModelsStore();
  const { status: connStatus } = useConnectionStore();
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [topModels, setTopModels] = useState<ModelScore[]>([]);
  const [runsLoading, setRunsLoading] = useState(true);
  const [eloRatings, setEloRatings] = useState<Record<string, { rating: number; confidence: number }>>({});

  useEffect(() => {
    fetch("/api/elo")
      .then((r) => r.json())
      .then((data) => {
        if (data.ratings) {
          const map: Record<string, { rating: number; confidence: number }> = {};
          for (const r of data.ratings) {
            map[r.modelName] = { rating: r.rating, confidence: r.confidence };
          }
          setEloRatings(map);
        }
      })
      .catch(() => { });
  }, []);

  useEffect(() => {
    fetch("/api/results")
      .then((r) => r.json())
      .then((data) => {
        if (data.runs) setRuns(data.runs);
      })
      .catch(() => { })
      .finally(() => setRunsLoading(false));
  }, []);

  useEffect(() => {
    if (runs.length === 0) return;
    Promise.all(
      runs.slice(0, 5).map((r) =>
        fetch(`/api/results/${r.id}`)
          .then((res) => res.json())
          .catch(() => ({ run: null }))
      )
    ).then((results) => {
      const scores: Record<string, ModelScore> = {};
      for (const { run } of results) {
        if (!run?.models) continue;
        for (const model of run.models) {
          if (!model.skipped && model.overall_score > 0) {
            const existing = scores[model.model_name];
            if (!existing || model.overall_score > existing.overallScore) {
              const cats = model.categoryScores || {};
              scores[model.model_name] = {
                modelName: model.model_name,
                overallScore: model.overall_score,
                runId: run.id,
                runDate: run.started_at,
                categoryScores: {
                  coding: cats.coding !== undefined ? cats.coding : null,
                  creative: cats.creative !== undefined ? cats.creative : null,
                  reasoning: cats.reasoning !== undefined ? cats.reasoning : null,
                  instruction: cats.instruction !== undefined ? cats.instruction : null,
                  speed: cats.speed !== undefined ? cats.speed : null,
                },
                avgTokensPerSec: model.avg_tokens_per_sec ?? 0,
                avgTTFT: model.avg_ttft ?? 0,
                family: model.family ?? detectModelFamily(model.model_name),
                eloRating: eloRatings[model.model_name]?.rating,
                eloConfidence: eloRatings[model.model_name]?.confidence,
              };
            }
          }
        }
      }
      const sorted = Object.values(scores)
        .sort((a, b) => b.overallScore - a.overallScore)
        .slice(0, 7);
      setTopModels(sorted);
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runs, eloRatings]);

  const disconnected = connStatus === "disconnected";
  const recentRuns = runs.slice(0, 8);
  const showFirstRun = !runsLoading && runs.length === 0 && models.length > 0;
  
  const fastestModel = topModels.length > 0
    ? topModels.reduce((best, m) => m.avgTokensPerSec > best.avgTokensPerSec ? m : best, topModels[0])
    : null;
  const avgScore = topModels.length > 0
    ? Math.round(topModels.reduce((a, m) => a + m.overallScore, 0) / topModels.length)
    : null;

  return (
    <motion.div 
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      className="px-6 md:px-12 py-12 max-w-[1300px] mx-auto min-h-screen"
    >
      {/* Header */ }
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-white mb-2">Dashboard</h1>
          <p className="text-zinc-400 text-[17px] font-medium tracking-tight">
            {models.length} {models.length === 1 ? "Model" : "Models"} Available
          </p>
        </div>
        
        <div className="flex items-center gap-4">
          <Link href="/playground">
            <button className="h-11 px-6 rounded-full apple-glass font-medium text-[16px] text-zinc-300 hover:text-white transition-colors active:scale-95 shadow-sm hover:shadow-md">
              Playground
            </button>
          </Link>
          <Link href="/suite">
            <button className="h-11 px-6 rounded-full bg-white text-black font-semibold text-[16px] tracking-tight hover:bg-zinc-200 transition-colors active:scale-95 flex items-center justify-center shadow-md">
              <Play size={16} className="mr-2" fill="currentColor" /> Run Suite
            </button>
          </Link>
        </div>
      </div>

      <AnimatePresence>
        {disconnected && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }} 
            animate={{ opacity: 1, height: 'auto' }} 
            exit={{ opacity: 0, height: 0 }}
            className="mb-8"
          >
            <div className="py-4 px-6 rounded-2xl bg-red-500/10 border border-red-500/20 text-red-400 text-[15px] font-medium flex items-center gap-3">
              <Activity size={18} className="animate-pulse" />
              <span>Ollama engine is disconnected. Please start your local server.</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Stats Widgets */}
      {!showFirstRun && topModels.length > 0 && (
        <motion.div variants={listVariant} initial="hidden" animate="show" className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-16">
          <motion.div variants={itemVariant} className="apple-glass-panel p-8 rounded-[28px] flex flex-col justify-between min-h-[160px]">
            <div className="flex items-center gap-2 text-zinc-400 mb-2 font-medium text-[15px]">
              <LayoutGrid size={18} className="text-zinc-400" />
              <span>Total Evaluations</span>
            </div>
            <p className="text-5xl font-bold tracking-tight text-white">{runs.length}</p>
          </motion.div>
          
          <motion.div variants={itemVariant} className="apple-glass-panel p-8 rounded-[28px] flex flex-col justify-between min-h-[160px]">
            <div className="flex items-center gap-2 text-zinc-400 mb-2 font-medium text-[15px]">
              <Target size={18} className="text-zinc-400" />
              <span>Global Accuracy</span>
            </div>
            <p className="text-5xl font-bold tracking-tight text-white">{avgScore !== null ? `${avgScore}%` : "—"}</p>
          </motion.div>

          <motion.div variants={itemVariant} className="apple-glass-panel p-8 rounded-[28px] flex flex-col justify-between min-h-[160px]">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-zinc-400 font-medium text-[15px]">
                <Zap size={18} className="text-zinc-400" />
                <span>Peak Velocity</span>
              </div>
              <span className="text-[14px] font-mono text-zinc-400 truncate max-w-[120px]">{fastestModel?.modelName || ""}</span>
            </div>
            <p className="text-5xl font-bold tracking-tight text-white">
              {fastestModel ? fastestModel.avgTokensPerSec.toFixed(0) : "—"}
              <span className="text-2xl font-semibold text-zinc-500 ml-1.5">t/s</span>
            </p>
          </motion.div>
        </motion.div>
      )}

      {showFirstRun && (
        <motion.div variants={itemVariant} initial="hidden" animate="show" className="relative w-full rounded-[40px] overflow-hidden border border-white/[0.04] bg-[#09090B] flex flex-col xl:flex-row min-h-[500px]">
          {/* Ambient Glowing background */}
          <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[70%] rounded-full bg-[#0A84FF]/20 blur-[130px] pointer-events-none mix-blend-screen" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[60%] h-[80%] rounded-full bg-[#32D74B]/15 blur-[140px] pointer-events-none mix-blend-screen" />

          <div className="relative z-10 flex-1 p-12 lg:p-16 flex flex-col justify-center items-start border-b xl:border-b-0 xl:border-r border-white/[0.05] bg-black/40 xl:bg-transparent backdrop-blur-3xl">
             <div className="w-20 h-20 mb-8 rounded-[24px] apple-glass shadow-lg flex items-center justify-center border border-white/[0.08] bg-white/[0.02]">
                <PackageOpen size={36} className="text-[#32D74B] stroke-[2px]" />
             </div>
             <h3 className="text-[36px] font-semibold tracking-tight text-white mb-5 leading-tight">You are ready to evaluate</h3>
             <p className="text-zinc-400 text-[18px] font-medium leading-relaxed max-w-[480px] mb-10">
               ModelSweep is synchronized with your Ollama daemon. You have <strong className="text-white">{models.length} local models</strong> ready for evaluation. Click below to create your first suite and generate telemetry.
             </p>
             <Link href="/suite">
                <button className="h-14 px-10 rounded-full bg-white text-black font-semibold text-[17px] tracking-tight hover:scale-[1.03] active:scale-95 transition-transform shadow-xl flex items-center justify-center">
                  Start Evaluation
                </button>
             </Link>
          </div>
          
          <div className="relative z-10 w-full xl:w-[420px] p-12 flex flex-col max-h-[600px] overflow-hidden bg-black/60 backdrop-blur-3xl">
             <h4 className="text-[13px] font-bold text-zinc-500 uppercase tracking-widest mb-8">Installed Models</h4>
             <div className="flex-1 overflow-y-auto custom-scrollbar space-y-5 pr-3">
               {models.map(m => (
                 <div key={m.name} className="flex items-center justify-between group">
                   <div className="flex items-center gap-4 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full bg-zinc-700 group-hover:bg-[#0A84FF] transition-colors flex-shrink-0 shadow-sm" />
                      <span className="text-[16px] font-semibold text-zinc-200 group-hover:text-white transition-colors truncate">{m.name}</span>
                   </div>
                   <span className="text-zinc-600 text-[13px] font-mono tracking-wider ml-4 flex-shrink-0">{m.size ? formatBytes(m.size) : ""}</span>
                 </div>
               ))}
               {models.length === 0 && (
                 <p className="text-zinc-500 text-[15px] font-medium">No local models found in Ollama daemon.</p>
               )}
             </div>
             <div className="pt-8 mt-6 border-t border-white/[0.05]">
                <Link href="/models/browse" className="text-[#0A84FF] hover:text-[#409CFF] font-semibold text-[15px] transition-colors flex items-center gap-1.5 group/link">
                  Install more models <ChevronRight size={16} className="group-hover/link:translate-x-1 transition-transform" />
                </Link>
             </div>
          </div>
        </motion.div>
      )}

      {/* Grouped Lists layout (macOS style) */}
      {!showFirstRun && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          
          {/* Top Models */}
          {topModels.length > 0 && (
            <motion.section variants={listVariant} initial="hidden" animate="show" className="flex flex-col">
              <div className="flex items-center justify-between mx-4 mb-4">
                <h3 className="text-[20px] font-semibold text-white/90 tracking-tight">Leaderboard</h3>
                <Link href="/models" className="text-[15px] font-medium text-[#0A84FF] hover:text-[#409CFF] transition-colors">See All</Link>
              </div>
              
              <div className="apple-glass-panel rounded-[28px] overflow-hidden">
                {topModels.map((model, i) => (
                  <Link key={model.modelName} href={`/results/${model.runId}`}>
                    <div className="apple-list-row flex items-center p-5 transition-colors hover:bg-white/[0.04]">
                      <span className={cn("text-[20px] font-semibold w-10 text-center", i === 0 ? "text-[#32D74B]" : "text-zinc-400")}>{i + 1}</span>
                      <div className="flex-1 min-w-0 px-4">
                        <p className="text-[17px] font-medium text-white truncate">{model.modelName}</p>
                        <p className="text-[14px] text-zinc-400 truncate mt-0.5">{model.family}</p>
                      </div>
                      <div className="text-right flex items-center gap-6">
                        <div className="hidden sm:block text-right">
                           <p className="text-[15px] font-medium text-white">{model.avgTokensPerSec.toFixed(1)} t/s</p>
                           <p className="text-[13px] text-zinc-400 mt-0.5">Speed</p>
                        </div>
                        <div className="w-px h-10 bg-white/10 hidden sm:block" />
                        <p className={cn("text-[22px] font-semibold tracking-tight min-w-[50px] text-right", i === 0 ? "text-[#32D74B]" : "text-white")}>
                          {model.overallScore}%
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.section>
          )}

          {/* Recent Runs */}
          <motion.section variants={listVariant} initial="hidden" animate="show" className="flex flex-col">
           <div className="flex items-center justify-between mx-4 mb-4">
              <h3 className="text-[20px] font-semibold text-white/90 tracking-tight">Recent Activity</h3>
              <Link href="/results" className="text-[15px] font-medium text-[#0A84FF] hover:text-[#409CFF] transition-colors">All Runs</Link>
            </div>
            
            <div className="apple-glass-panel rounded-[28px] overflow-hidden">
              {recentRuns.map((run, i) => {
                const st = (run.suite_type || "standard") as string;
                const badge = SUITE_TYPE_BADGE[st];
                return (
                  <Link key={run.id} href={`/results/${run.id}`}>
                    <div className="apple-list-row flex items-center p-5 transition-colors hover:bg-white/[0.04]">
                      <div className={cn("w-3 h-3 rounded-full mx-2 flex-shrink-0",
                         run.status === "completed" ? "bg-[#32D74B]" : 
                         run.status === "running" ? "bg-[#FF9F0A] animate-pulse" : "bg-zinc-500"
                      )} />
                      <div className="flex-1 min-w-0 px-4">
                        <div className="flex items-center gap-3">
                           <p className="text-[17px] font-medium text-white truncate">{run.suite_name}</p>
                           {badge && <span className={cn("text-[11px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md", badge.bg, badge.color)}>{badge.label}</span>}
                        </div>
                        <p className="text-[14px] text-zinc-400 truncate mt-1">{run.model_count} Models evaluated</p>
                      </div>
                      <div className="text-right flex items-center gap-3">
                        <span className="text-[14px] text-zinc-400 mr-1">{formatRelativeTime(run.started_at)}</span>
                        <ChevronRight size={18} className="text-zinc-500" />
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.section>
        </div>
      )}

    </motion.div>
  );
}
