"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Trash2 } from "lucide-react";
import Link from "next/link";
import { formatRelativeTime, formatDuration, cn } from "@/lib/utils";

const TYPE_LABEL: Record<string, { label: string; color: string }> = {
  standard: { label: "Standard", color: "text-zinc-500" },
  tool_calling: { label: "Tools", color: "text-blue-400" },
  conversation: { label: "Convo", color: "text-violet-400" },
  adversarial: { label: "Attack", color: "text-rose-400" },
  coding: { label: "Code", color: "text-cyan-400" },
  vision: { label: "Vision", color: "text-amber-400" },
  rag: { label: "RAG", color: "text-emerald-400" },
};

interface RunSummary {
  id: string;
  suite_name: string;
  suite_type?: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  model_count: number;
}

export default function ResultsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/results")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs || []))
      .finally(() => setLoading(false));
  }, []);

  const handleDelete = async (id: string) => {
    await fetch(`/api/results/${id}`, { method: "DELETE" });
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="px-6 md:px-12 py-12 max-w-[1300px] mx-auto text-white">
      <div className="flex items-center justify-between mb-10">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight mb-2">Results</h1>
          <p className="text-zinc-400 text-[17px] font-medium mt-1">{runs.length} run{runs.length !== 1 ? "s" : ""}</p>
        </div>
      </div>

      {loading ? (
        <div className="py-20 text-center text-zinc-500 text-[16px] font-medium">Loading telemetry...</div>
      ) : runs.length === 0 ? (
        <div className="relative w-full py-40 mt-8 flex flex-col items-center text-center">
          
          <div className="relative z-10 w-28 h-28 mb-8 rounded-full border border-white/[0.08] shadow-[0_0_80px_rgba(255,255,255,0.03)] flex items-center justify-center bg-transparent">
               <ChevronRight size={44} className="text-zinc-400 ml-1" />
          </div>
          <h3 className="relative z-10 text-[32px] font-semibold text-white tracking-tight mb-4">No test runs yet</h3>
          <p className="relative z-10 text-zinc-400 text-[17px] font-medium max-w-[380px] mb-10 leading-relaxed">
            Execute your first test suite to generate detailed telemetry and benchmark data.
          </p>
          <Link href="/suite" className="relative z-10 apple-glass px-8 py-4 rounded-full text-[16px] font-semibold tracking-tight hover:bg-white/10 transition-colors bg-white/[0.04] border border-white/10">
            Route to Test Suites
          </Link>
        </div>
      ) : (
        <div className="apple-glass-panel rounded-[28px] overflow-hidden">
          <div className="flex items-center px-6 py-4 text-[13px] font-bold tracking-wider uppercase text-zinc-500 border-b border-white/5">
            <span className="flex-1">Suite</span>
            <span className="w-24">Type</span>
            <span className="w-20 text-right">Models</span>
            <span className="w-28 text-right hidden sm:block">Duration</span>
            <span className="w-32 text-right hidden md:block">Time</span>
            <span className="w-10" />
          </div>

          {runs.map((run) => {
            const st = run.suite_type || "standard";
            const type = TYPE_LABEL[st] || TYPE_LABEL.standard;
            const duration = run.completed_at
              ? (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000
              : null;

            return (
              <div key={run.id} className="relative apple-list-row flex items-center px-6 py-5 hover:bg-white/[0.04] transition-colors group">
                <Link href={`/results/${run.id}`} className="flex items-center flex-1 min-w-0 pr-4">
                  <div className={cn("w-2.5 h-2.5 rounded-full mr-4 flex-shrink-0 shadow-sm",
                    run.status === "completed" ? "bg-[#32D74B]" : run.status === "running" ? "bg-[#FF9F0A] animate-pulse" : "bg-zinc-600"
                  )} />
                  <span className="text-[17px] font-semibold text-white truncate">{run.suite_name}</span>
                </Link>
                <div className="w-24 flex-shrink-0">
                  <span className={cn("text-[11px] font-bold tracking-wider uppercase px-2 py-1 rounded-md bg-white/5 border border-white/5", type.color)}>{type.label}</span>
                </div>
                <span className="w-20 flex-shrink-0 text-right text-[15px] font-medium text-zinc-400 tabular-nums">{run.model_count}</span>
                <span className="w-28 flex-shrink-0 text-right text-[15px] font-medium text-zinc-500 tabular-nums hidden sm:block">
                  {duration !== null ? formatDuration(duration) : "—"}
                </span>
                <span className="w-32 flex-shrink-0 text-right text-[15px] font-medium text-zinc-500 tabular-nums hidden md:block pr-6 group-hover:opacity-0 transition-opacity">
                  {formatRelativeTime(run.started_at)}
                </span>
                
                <div className="absolute right-6 top-1/2 -translate-y-1/2 flex items-center justify-end gap-2 pr-2 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0">
                  <div className="relative group/tooltip">
                    <button
                      onClick={(e) => { e.preventDefault(); handleDelete(run.id); }}
                      className="p-2.5 text-zinc-400 hover:text-red-400 transition-colors rounded-full bg-[#1C1C1E] shadow-sm hover:bg-red-500/10"
                    >
                      <Trash2 size={18} />
                    </button>
                    <div className="absolute -top-10 left-1/2 -translate-x-1/2 px-3 py-1.5 bg-[#2C2C2E] border border-white/10 text-white text-[12px] font-semibold rounded-lg shadow-xl opacity-0 group-hover/tooltip:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-50">
                      Delete
                    </div>
                  </div>
                  <Link href={`/results/${run.id}`} className="ml-2 p-2.5 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors bg-[#1A1A1C] hover:bg-white/10 rounded-full">
                    <ChevronRight size={18} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
