"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Plus, ClipboardList, Play, Trash2, ChevronRight, Download, Upload } from "lucide-react";
import Link from "next/link";
import { GlowCard } from "@/components/ui/glow-card";
import { SkeletonList } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { formatRelativeTime } from "@/lib/utils";

interface Suite {
  id: string;
  name: string;
  description: string;
  suite_type: string;
  created_at: string;
  last_run_at: string | null;
  is_built_in: number;
  prompt_count: number;
}

const SUITE_TYPE_BADGES: Record<string, { label: string; color: string }> = {
  standard: { label: "Standard", color: "text-zinc-400 bg-zinc-500/10 border-zinc-500/20" },
  tool_calling: { label: "Tools", color: "text-blue-400 bg-blue-500/10 border-blue-500/20" },
  conversation: { label: "Convo", color: "text-violet-400 bg-violet-500/10 border-violet-500/20" },
  adversarial: { label: "Attack", color: "text-rose-400 bg-rose-500/10 border-rose-500/20" },
};

export default function SuitesPage() {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");

  const load = () => {
    setLoading(true);
    fetch("/api/suites")
      .then((r) => r.json())
      .then((d) => setSuites(d.suites || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const createSuite = async () => {
    if (!newName.trim()) return;
    const res = await fetch("/api/suites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: newName.trim(), description: "" }),
    });
    const data = await res.json();
    setCreating(false);
    setNewName("");
    load();
    if (data.id) window.location.href = `/suite/${data.id}`;
  };

  const deleteSuite = async (id: string) => {
    await fetch(`/api/suites/${id}`, { method: "DELETE" });
    load();
  };

  const exportSuite = async (suite: Suite) => {
    const res = await fetch(`/api/suites/${suite.id}`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.suite, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${suite.name.toLowerCase().replace(/\s+/g, "-")}.modelpilot.json`;
    a.click();
  };

  const importSuite = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;
      const text = await file.text();
      const data = JSON.parse(text);
      // Create suite then add prompts
      const res = await fetch("/api/suites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: data.name || "Imported Suite", description: data.description || "" }),
      });
      const { id } = await res.json();
      if (id && data.prompts) {
        for (let i = 0; i < data.prompts.length; i++) {
          const p = data.prompts[i];
          await fetch(`/api/suites/${id}/prompts`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...p, order: i }),
          });
        }
      }
      load();
    };
    input.click();
  };

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between mb-8"
      >
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Test Suites</h1>
            <InfoTooltip text="Test suites define the prompts and scenarios used to evaluate models" />
          </div>
          <p className="text-zinc-500 text-sm mt-1">{suites.length} suites</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={importSuite}>
            <Upload size={14} />
            Import
          </Button>
          <Button variant="primary" size="sm" onClick={() => setCreating(true)}>
            <Plus size={14} />
            New Suite
          </Button>
        </div>
      </motion.div>

      {creating && (
        <GlowCard className="p-4 mb-4" animate={false}>
          <div className="flex items-center gap-3">
            <input
              autoFocus
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") createSuite(); if (e.key === "Escape") setCreating(false); }}
              placeholder="Suite name..."
              className="flex-1 bg-transparent text-zinc-100 text-sm placeholder:text-zinc-600 outline-none border-b border-white/10 pb-1"
            />
            <Button size="sm" onClick={createSuite}>Create</Button>
            <Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
          </div>
        </GlowCard>
      )}

      {loading ? (
        <SkeletonList count={4} />
      ) : suites.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={40} />}
          title="No test suites yet"
          description="Create your first suite to start evaluating models."
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={14} />
              Create Suite
            </Button>
          }
        />
      ) : (
        <div className="space-y-3">
          {suites.map((suite, i) => (
            <motion.div
              key={suite.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 * i }}
              className="group relative bg-white/5 border border-white/[0.06] rounded-2xl p-5 hover:bg-white/[0.07] transition-colors shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
            >
              <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/suite/${suite.id}`}>
                      <h3 className="text-zinc-100 font-medium hover:text-white transition-colors">
                        {suite.name}
                      </h3>
                    </Link>
                    {suite.suite_type && suite.suite_type !== "standard" && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded border ${SUITE_TYPE_BADGES[suite.suite_type]?.color ?? ""}`}>
                        {SUITE_TYPE_BADGES[suite.suite_type]?.label ?? suite.suite_type}
                      </span>
                    )}
                    <InfoTooltip text="Standard: static prompts. Tools: function calling. Convo: multi-turn. Attack: adversarial testing" />
                    {suite.is_built_in === 1 && (
                      <span className="text-xs px-2 py-0.5 bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-md">
                        Built-in
                      </span>
                    )}
                  </div>
                  <p className="text-zinc-500 text-sm truncate">{suite.description || "No description"}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-zinc-600">
                    <span>{suite.prompt_count} {suite.suite_type === 'tool_calling' ? 'scenario' : suite.suite_type === 'conversation' ? 'conversation' : suite.suite_type === 'adversarial' ? 'attack' : 'prompt'}{suite.prompt_count !== 1 ? 's' : ''}</span>
                    {suite.last_run_at && (
                      <span>Last run {formatRelativeTime(suite.last_run_at)}</span>
                    )}
                    {!suite.last_run_at && (
                      <span className="text-yellow-600">Never tested</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => exportSuite(suite)}
                    title="Export"
                  >
                    <Download size={13} />
                  </Button>
                  {suite.is_built_in !== 1 && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={() => deleteSuite(suite.id)}
                      title="Delete"
                    >
                      <Trash2 size={13} />
                    </Button>
                  )}
                  <Link href={`/suite/${suite.id}/run`}>
                    <Button size="sm" variant="primary">
                      <Play size={13} />
                      Run
                    </Button>
                  </Link>
                  <Link href={`/suite/${suite.id}`}>
                    <Button size="sm" variant="secondary">
                      <ChevronRight size={13} />
                    </Button>
                  </Link>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
