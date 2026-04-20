"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";
import {
  ChevronLeft, Play, Trash2, AlertTriangle,
} from "lucide-react";
import Link from "next/link";
import { GlowCard } from "@/components/ui/glow-card";
import { SkeletonList } from "@/components/ui/skeleton";
import { ScoreBadge, ScoreBar } from "@/components/ui/score-badge";
import { Button } from "@/components/ui/button";
import { ModelRadarChart } from "@/components/charts/radar-chart";
import { getModelColor } from "@/lib/model-colors";
import { formatRelativeTime } from "@/lib/utils";

interface ModelDetails {
  modelfile?: string;
  parameters?: string;
  template?: string;
  details?: {
    family?: string;
    families?: string[];
    parameter_size?: string;
    quantization_level?: string;
    format?: string;
  };
  model_info?: Record<string, unknown>;
}

interface RunScore {
  runId: string;
  runDate: string;
  suiteName: string;
  overallScore: number;
  categoryScores: Record<string, number>;
  avgTokensPerSec: number;
}

export default function ModelProfilePage() {
  const { name } = useParams<{ name: string }>();
  const modelName = decodeURIComponent(name);

  const [details, setDetails] = useState<ModelDetails | null>(null);
  const [runScores, setRunScores] = useState<RunScore[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  const color = getModelColor(modelName);

  useEffect(() => {
    // Load model details
    fetch("/api/models/show", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    })
      .then((r) => r.json())
      .then((d) => setDetails(d))
      .catch(() => {});

    // Load run history for this model
    fetch("/api/results")
      .then((r) => r.json())
      .then(async (data) => {
        if (!data.runs?.length) return;
        const results = await Promise.all(
          data.runs.slice(0, 20).map((r: { id: string }) =>
            fetch(`/api/results/${r.id}`)
              .then((res) => res.json())
              .catch(() => ({ run: null }))
          )
        );
        const scores: RunScore[] = [];
        for (const { run } of results) {
          if (!run?.models) continue;
          const modelResult = run.models.find(
            (m: { model_name: string }) => m.model_name === modelName
          );
          if (modelResult && !modelResult.skipped && modelResult.overall_score > 0) {
            scores.push({
              runId: run.id,
              runDate: run.started_at,
              suiteName: run.suite_name,
              overallScore: modelResult.overall_score,
              categoryScores: modelResult.category_scores,
              avgTokensPerSec: modelResult.avg_tokens_per_sec,
            });
          }
        }
        setRunScores(scores.sort((a, b) => new Date(b.runDate).getTime() - new Date(a.runDate).getTime()));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [modelName]);

  const deleteModel = async () => {
    if (!confirm(`Delete ${modelName}? This cannot be undone.`)) return;
    setDeleting(true);
    await fetch("/api/models/delete", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: modelName }),
    });
    window.location.href = "/models";
  };

  const latestScore = runScores[0];

  if (loading) return <div className="p-8"><SkeletonList count={4} /></div>;

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-8">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/models" className="flex items-center gap-1.5 text-zinc-500 text-[14px] hover:text-zinc-300 mb-2 transition-colors font-medium">
          <ChevronLeft size={15} />
          All Models
        </Link>
      </motion.div>

      {/* Hero Container */}
      <div className="text-white rounded-[24px]">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6 mb-8 mt-2">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3.5 h-3.5 rounded-full shadow-[0_0_12px_rgba(255,255,255,0.2)]" style={{ background: color.hex, boxShadow: `0 0 16px ${color.hex}60` }} />
              <h1 className="text-[34px] font-semibold tracking-tight text-white leading-none">{modelName}</h1>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[14px] font-medium text-zinc-400 mt-4">
              {details?.details?.parameter_size && <span className="bg-white/[0.04] border border-white/5 py-1 px-3 rounded-lg">{details.details.parameter_size}</span>}
              {details?.details?.quantization_level && <span className="bg-white/[0.04] border border-white/5 py-1 px-3 rounded-lg">{details.details.quantization_level}</span>}
              {details?.details?.format && <span className="bg-white/[0.04] border border-white/5 py-1 px-3 rounded-lg">{details.details.format}</span>}
              {details?.details?.family && <span className="bg-white/[0.04] border border-white/5 py-1 px-3 rounded-lg capitalize">{details.details.family}</span>}
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Link href={`/suite`}>
              <Button variant="primary" className="rounded-full shadow-lg h-11 px-6 font-semibold tracking-tight transition-transform hover:scale-[1.02] active:scale-[0.98]">
                <Play size={15} className="mr-1.5" />
                Re-test
              </Button>
            </Link>
            <Button variant="danger" className="rounded-full h-11 px-6 font-semibold border border-red-500/20 bg-red-500/10 text-red-400 hover:bg-red-500/20 shadow-sm transition-transform hover:scale-[1.02] active:scale-[0.98]" onClick={deleteModel} disabled={deleting}>
              <Trash2 size={15} className="mr-1.5" />
              Delete
            </Button>
          </div>
        </div>
        
        {latestScore ? (
          <div className="bg-[#0A0A0C] border border-white/10 p-7 rounded-[20px] flex items-center gap-12 shadow-sm relative overflow-hidden isolate">
            <div className="absolute top-0 right-0 w-64 h-64 rounded-full blur-[100px] opacity-20 pointer-events-none -z-10" style={{ background: color.hex }} />
            <div>
              <p className="text-zinc-500 text-[12px] font-bold uppercase tracking-widest mb-2">Overall Score</p>
              <ScoreBadge score={latestScore.overallScore} size="lg" className="text-[28px] tracking-tight" />
            </div>
            <div className="w-px h-12 bg-white/10 hidden sm:block" />
            <div>
              <p className="text-zinc-500 text-[12px] font-bold uppercase tracking-widest mb-1.5">Avg Speed</p>
              <div className="flex items-end gap-1.5">
                <p className="text-zinc-100 font-mono tabular-nums text-[24px] font-semibold tracking-tight leading-none">
                  {latestScore.avgTokensPerSec.toFixed(1)}
                </p>
                <span className="text-zinc-500 text-[13px] font-medium leading-loose">t/s</span>
              </div>
            </div>
            <div className="w-px h-12 bg-white/10 hidden md:block" />
            <div className="hidden md:block">
              <p className="text-zinc-500 text-[12px] font-bold uppercase tracking-widest mb-2">Last Tested</p>
              <p className="text-zinc-300 text-[14px] font-medium tracking-tight bg-white/5 px-3 py-1.5 rounded-[10px] border border-white/5 block w-fit">{formatRelativeTime(latestScore.runDate)}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 flex items-center gap-3 text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 text-[15px] font-medium">
            <AlertTriangle size={18} />
            <span>This model has never been tested. Run a suite to see performance scores.</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Run history */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest ml-1">Test History</h2>
          {runScores.length > 0 ? (
            <div className="bg-[#0A0A0C] border border-white/10 rounded-[20px] shadow-sm flex flex-col overflow-hidden relative isolate">
              {runScores.map((score, i) => (
                <Link key={score.runId} href={`/results/${score.runId}`}>
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.04 * i }}
                    className="apple-list-row flex items-center gap-4 px-6 py-5 hover:bg-white/[0.04] transition-colors group relative border-b border-white/[0.06]"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-zinc-200 text-[15px] font-semibold tracking-tight truncate group-hover:text-white transition-colors">{score.suiteName}</p>
                      <p className="text-zinc-500 text-[13px] font-medium mt-0.5">{formatRelativeTime(score.runDate)}</p>
                    </div>
                    <div className="flex items-center gap-5">
                      <span className="text-zinc-400 text-[13px] font-mono tracking-tight hidden sm:block bg-white/5 py-1 px-2.5 rounded-lg border border-white/5">
                        {score.avgTokensPerSec.toFixed(1)} <span className="text-zinc-600 text-[11px]">t/s</span>
                      </span>
                      <ScoreBadge score={score.overallScore} size="md" className="font-semibold text-[15px]" />
                    </div>
                  </motion.div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="text-zinc-500 text-[14px] font-medium flex items-center h-24 bg-[#0A0A0C] border border-white/10 rounded-[20px] justify-center shadow-sm">
              No runs recorded yet.
            </div>
          )}
        </div>

        {/* Categories / Radar Chart container */}
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest ml-1">Category Breakdown</h2>
          {latestScore ? (
            <div className="bg-[#0A0A0C] border border-white/10 rounded-[20px] p-6 shadow-sm overflow-hidden relative isolate h-full">
              <ModelRadarChart
                models={[{ name: modelName, categoryScores: latestScore.categoryScores }]}
                height={260}
                showLegend={false}
              />
              <div className="mt-8 grid grid-cols-2 gap-3 border-t border-white/[0.06] pt-6">
                {Object.entries(latestScore.categoryScores).map(([cat, score]) => (
                  <div key={cat} className="flex flex-col gap-1.5 p-3.5 rounded-[12px] bg-white/[0.02] border border-white/[0.04] hover:bg-white/[0.05] transition-colors">
                    <span className="text-[11px] font-semibold text-zinc-400 uppercase tracking-wider truncate mb-1" title={cat}>{cat}</span>
                    <ScoreBar score={score} color={color.hex} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="text-zinc-500 text-[14px] font-medium flex items-center h-24 bg-[#0A0A0C] border border-white/10 rounded-[20px] justify-center shadow-sm">
              Insufficient data for categories.
            </div>
          )}
        </div>
      </div>

      {/* Model Info Details List */}
      {details?.model_info && (
        <section className="pt-2">
          <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4 ml-1">Properties</h2>
          <div className="bg-[#0A0A0C] border border-white/10 rounded-[20px] shadow-sm flex flex-col overflow-hidden">
            {[
              { key: "general.architecture", label: "Architecture" },
              { key: "general.basename", label: "Base Model" },
              { key: "general.finetune", label: "Fine-tune" },
              { key: "general.parameter_count", label: "Parameters", format: (v: unknown) => typeof v === "number" ? `${(v / 1e9).toFixed(1)}B` : String(v) },
              { key: "general.size_label", label: "Size Label" },
              { key: "general.context_length", label: "Context Length", alt: `${details.details?.family}.context_length`, format: (v: unknown) => typeof v === "number" ? v.toLocaleString() + " tokens" : String(v) },
              { key: `${details.details?.family}.vocab_size`, label: "Vocab Size", format: (v: unknown) => typeof v === "number" ? v.toLocaleString() : String(v) },
              { key: `${details.details?.family}.embedding_length`, label: "Embedding Dim" },
              { key: `${details.details?.family}.block_count`, label: "Layers" },
              { key: `${details.details?.family}.attention.head_count`, label: "Attention Heads" },
            ].map(({ key, label, alt, format }) => {
              const val = details.model_info![key] ?? (alt ? details.model_info![alt] : undefined);
              if (val === undefined || val === null) return null;
              return (
                <div key={key} className="apple-list-row flex items-center py-4 px-6 transition-colors hover:bg-white/[0.03]">
                  <span className="text-zinc-400 w-48 text-[14px] font-medium tracking-wide">{label}</span>
                  <span className="text-zinc-200 font-mono flex-1 text-[14px]">{format ? format(val) : String(val)}</span>
                </div>
              );
            }).filter(Boolean)}
          </div>
        </section>
      )}
    </div>
  );
}
