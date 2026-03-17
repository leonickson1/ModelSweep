"use client";

import { useEffect, useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BarChart2, ChevronRight, CheckCircle2, Clock, Cpu, MoreHorizontal, Trash2, Download, Share2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { SkeletonList } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatRelativeTime, formatDuration, cn } from "@/lib/utils";

type SuiteType = "standard" | "tool_calling" | "conversation" | "adversarial";

const SUITE_TYPE_BADGE: Record<SuiteType, { label: string; color: string; bg: string; border: string }> = {
  standard: { label: "Standard", color: "text-zinc-400", bg: "bg-zinc-500/10", border: "border-zinc-500/20" },
  tool_calling: { label: "Tools", color: "text-blue-400", bg: "bg-blue-500/10", border: "border-blue-500/20" },
  conversation: { label: "Convo", color: "text-violet-400", bg: "bg-violet-500/10", border: "border-violet-500/20" },
  adversarial: { label: "Attack", color: "text-rose-400", bg: "bg-rose-500/10", border: "border-rose-500/20" },
};

interface RunSummary {
  id: string;
  suite_name: string;
  suite_type?: SuiteType;
  started_at: string;
  completed_at: string | null;
  status: string;
  model_count: number;
}

function OverflowMenu({ run, onDelete }: { run: RunSummary; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
        setConfirming(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await fetch(`/api/results/${run.id}`, { method: "DELETE" });
      onDelete();
    } finally {
      setDeleting(false);
      setOpen(false);
    }
  };

  const exportAs = (format: string) => {
    window.location.href = `/api/results/${run.id}/export?format=${format}`;
    setOpen(false);
  };

  return (
    <div ref={menuRef} className="relative" onClick={(e) => e.preventDefault()}>
      <button
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((o) => !o); setConfirming(false); }}
        className="p-1.5 rounded-lg text-zinc-600 hover:text-zinc-400 hover:bg-white/5 transition-colors"
      >
        <MoreHorizontal size={16} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -4 }}
            transition={{ duration: 0.1 }}
            className="absolute right-0 top-8 z-50 min-w-[180px] bg-zinc-900 border border-white/10 rounded-xl shadow-2xl overflow-hidden"
          >
            {!confirming ? (
              <>
                <Link
                  href={`/results/${run.id}/share`}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <Share2 size={13} />
                  Share...
                </Link>
                <button
                  onClick={() => exportAs("json")}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors text-left"
                >
                  <Download size={13} />
                  Export JSON
                </button>
                <button
                  onClick={() => exportAs("csv")}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors text-left"
                >
                  <Download size={13} />
                  Export CSV
                </button>
                <Link
                  href={`/suite/${run.id}`}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm text-zinc-300 hover:bg-white/5 transition-colors"
                  onClick={() => setOpen(false)}
                >
                  <RefreshCw size={13} />
                  Re-run Suite
                </Link>
                <div className="h-px bg-white/[0.06] my-1" />
                <button
                  onClick={() => setConfirming(true)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors text-left"
                >
                  <Trash2 size={13} />
                  Delete Run
                </button>
              </>
            ) : (
              <div className="p-3">
                <p className="text-zinc-300 text-xs font-medium mb-1">Delete this run?</p>
                <p className="text-zinc-500 text-xs mb-3">All results, scores, and votes will be removed permanently.</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setConfirming(false)}
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs text-zinc-400 border border-white/10 hover:bg-white/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 py-1.5 px-2 rounded-lg text-xs text-white bg-red-600 hover:bg-red-700 transition-colors disabled:opacity-50"
                  >
                    {deleting ? "Deleting..." : "Delete"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ResultsPage() {
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRuns = () => {
    fetch("/api/results")
      .then((r) => r.json())
      .then((d) => setRuns(d.runs || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchRuns(); }, []);

  const handleDelete = (id: string) => {
    setRuns((prev) => prev.filter((r) => r.id !== id));
  };

  return (
    <div className="p-8 max-w-4xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Results History</h1>
          <InfoTooltip text="History of all evaluation runs with scores and comparisons" />
        </div>
        <p className="text-zinc-500 text-sm mt-1">{runs.length} test run{runs.length !== 1 ? "s" : ""}</p>
      </motion.div>

      {loading ? (
        <SkeletonList count={5} />
      ) : runs.length === 0 ? (
        <EmptyState
          icon={<BarChart2 size={40} />}
          title="No test runs yet"
          description="Run a test suite to see results here."
          action={
            <Link href="/suite" className="text-sm text-blue-400 hover:underline">
              Go to Test Suites
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {runs.map((run, i) => {
              const duration = run.completed_at
                ? (new Date(run.completed_at).getTime() - new Date(run.started_at).getTime()) / 1000
                : null;

              return (
                <motion.div
                  key={run.id}
                  layout
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -20, transition: { duration: 0.2 } }}
                  transition={{ delay: 0.04 * i }}
                >
                  <div className="group flex items-center gap-4 px-5 py-4 bg-white/5 border border-white/[0.06] rounded-2xl hover:bg-white/[0.07] transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.2)]">
                    <Link href={`/results/${run.id}`} className="flex items-center gap-4 flex-1 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        run.status === "completed" ? "bg-emerald-500" :
                        run.status === "running" ? "bg-blue-500 animate-pulse" : "bg-zinc-600"
                      }`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-zinc-200 font-medium truncate">{run.suite_name}</p>
                          {(() => {
                            const st = (run.suite_type || "standard") as SuiteType;
                            if (st === "standard") return null;
                            const badge = SUITE_TYPE_BADGE[st];
                            return (
                              <span className={cn(
                                "text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0",
                                badge.color, badge.bg, badge.border
                              )}>
                                {badge.label}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-zinc-500">
                          <span className="flex items-center gap-1">
                            <Clock size={10} />
                            {formatRelativeTime(run.started_at)}
                          </span>
                          <span className="flex items-center gap-1">
                            <Cpu size={10} />
                            {run.model_count} model{run.model_count !== 1 ? "s" : ""}
                          </span>
                          {duration !== null && (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 size={10} className="text-emerald-500" />
                              {formatDuration(duration)}
                            </span>
                          )}
                        </div>
                      </div>
                      <ChevronRight size={16} className="text-zinc-700 group-hover:text-zinc-500 transition-colors flex-shrink-0" />
                    </Link>
                    <OverflowMenu run={run} onDelete={() => handleDelete(run.id)} />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
