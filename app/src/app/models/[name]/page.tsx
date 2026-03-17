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
    parameter_size?: string;
    quantization_level?: string;
    format?: string;
  };
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
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
        <Link href="/models" className="flex items-center gap-1.5 text-zinc-500 text-xs hover:text-zinc-300 mb-4 transition-colors">
          <ChevronLeft size={13} />
          All Models
        </Link>
      </motion.div>

      {/* Hero */}
      <GlowCard
        className="p-6 overflow-hidden"
        glowColor={color.hex + "20"}
        delay={0.05}
      >
        <div
          className="absolute top-0 left-0 right-0 h-1"
          style={{ background: `linear-gradient(90deg, ${color.hex}80, transparent)` }}
        />
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <div className="w-3 h-3 rounded-full" style={{ background: color.hex }} />
              <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">{modelName}</h1>
            </div>
            <div className="flex items-center gap-4 text-xs text-zinc-500">
              {details?.details?.parameter_size && <span>{details.details.parameter_size}</span>}
              {details?.details?.quantization_level && <span>{details.details.quantization_level}</span>}
              {details?.details?.format && <span>{details.details.format}</span>}
              {details?.details?.family && <span className="capitalize">{details.details.family}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/suite`}>
              <Button variant="primary" size="sm">
                <Play size={13} />
                Re-test
              </Button>
            </Link>
            <Button variant="danger" size="sm" onClick={deleteModel} disabled={deleting}>
              <Trash2 size={13} />
              Delete
            </Button>
          </div>
        </div>

        {latestScore && (
          <div className="mt-5 flex items-center gap-8">
            <div>
              <p className="text-zinc-600 text-xs mb-1">Overall Score</p>
              <ScoreBadge score={latestScore.overallScore} size="lg" />
            </div>
            <div>
              <p className="text-zinc-600 text-xs mb-1">Avg Speed</p>
              <p className="text-zinc-100 font-mono tabular-nums text-lg font-semibold">
                {latestScore.avgTokensPerSec.toFixed(1)}
                <span className="text-zinc-500 text-sm font-normal ml-1">t/s</span>
              </p>
            </div>
            <div>
              <p className="text-zinc-600 text-xs mb-1">Last Tested</p>
              <p className="text-zinc-300 text-sm">{formatRelativeTime(latestScore.runDate)}</p>
            </div>
          </div>
        )}

        {!latestScore && (
          <div className="mt-4 flex items-center gap-2 text-yellow-500 text-sm">
            <AlertTriangle size={14} />
            <span>This model has never been tested.</span>
          </div>
        )}
      </GlowCard>

      {/* Radar chart */}
      {latestScore && (
        <GlowCard className="p-5" delay={0.1}>
          <h2 className="text-zinc-400 text-sm font-medium mb-4">Category Performance</h2>
          <ModelRadarChart
            models={[{ name: modelName, categoryScores: latestScore.categoryScores }]}
            height={280}
            showLegend={false}
          />
          <div className="mt-4 grid grid-cols-5 gap-2">
            {Object.entries(latestScore.categoryScores).map(([cat, score]) => (
              <ScoreBar
                key={cat}
                label={cat}
                score={score}
                color={color.hex}
              />
            ))}
          </div>
        </GlowCard>
      )}

      {/* Run history */}
      {runScores.length > 0 && (
        <GlowCard className="p-5" delay={0.15}>
          <h2 className="text-zinc-400 text-sm font-medium mb-4">Test History</h2>
          <div className="space-y-2">
            {runScores.map((score, i) => (
              <Link key={score.runId} href={`/results/${score.runId}`}>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.04 * i }}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/5 transition-colors group"
                >
                  <div className="flex-1">
                    <p className="text-zinc-300 text-sm">{score.suiteName}</p>
                    <p className="text-zinc-600 text-xs">{formatRelativeTime(score.runDate)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-zinc-500 text-xs font-mono">
                      {score.avgTokensPerSec.toFixed(1)} t/s
                    </span>
                    <ScoreBadge score={score.overallScore} size="sm" />
                  </div>
                </motion.div>
              </Link>
            ))}
          </div>
        </GlowCard>
      )}
    </div>
  );
}
