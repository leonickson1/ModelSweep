"use client";

import { useEffect, useState } from "react";
import { useRef } from "react";
import { Plus, Trash2, Play, Download, ChevronRight, Container, RotateCcw, Loader2, Upload } from "lucide-react";
import Link from "next/link";
import { formatRelativeTime, cn } from "@/lib/utils";

interface Suite {
  id: string;
  name: string;
  description: string;
  suite_type: string;
  is_built_in: number;
  prompt_count: number;
  last_run_at: string | null;
}

const TYPE_LABEL: Record<string, { label: string; color: string; bg: string }> = {
  standard: { label: "Standard", color: "text-zinc-300", bg: "bg-white/5" },
  tool_calling: { label: "Tools", color: "text-blue-400", bg: "bg-blue-500/10" },
  conversation: { label: "Convo", color: "text-violet-400", bg: "bg-violet-500/10" },
  adversarial: { label: "Attack", color: "text-rose-400", bg: "bg-rose-500/10" },
  coding: { label: "Code", color: "text-cyan-400", bg: "bg-cyan-500/10" },
  vision: { label: "Vision", color: "text-amber-400", bg: "bg-amber-500/10" },
  rag: { label: "RAG", color: "text-emerald-400", bg: "bg-emerald-500/10" },
};

const SCENARIO_WORD: Record<string, string> = {
  tool_calling: "scenario",
  conversation: "conversation",
  adversarial: "attack",
  coding: "scenario",
  vision: "scenario",
  rag: "scenario",
};

export default function SuitesPage() {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [restoreMsg, setRestoreMsg] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const restoreDefaults = async () => {
    const ok = window.confirm(
      "Restore the built-in test suites you've deleted?\n\nYour own suites won't be touched — only the default starter suites (General Intelligence, Coding, Writing, OWASP LLM Top 10, etc.) will be brought back if missing."
    );
    if (!ok) return;
    setRestoring(true);
    setRestoreMsg(null);
    try {
      const res = await fetch("/api/suites/restore-defaults", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setRestoreMsg(data.error || `Failed (${res.status})`);
      } else if (data.restored > 0) {
        setRestoreMsg(`Restored ${data.restored} built-in suite${data.restored !== 1 ? "s" : ""}.`);
      } else {
        setRestoreMsg("All built-in suites were already present.");
      }
      load();
    } catch (err) {
      setRestoreMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setRestoring(false);
      setTimeout(() => setRestoreMsg(null), 4000);
    }
  };

  const importSuite = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text);
      // Handle both { suite: {...} } and direct {...} formats
      const suiteData = json.suite || json;
      const res = await fetch("/api/suites/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suite: suiteData }),
      });
      const data = await res.json();
      if (!res.ok) {
        setRestoreMsg(data.error || `Import failed (${res.status})`);
      } else {
        setRestoreMsg(`Imported "${data.name}" (${data.suiteType}) with ${Object.values(data.counts as Record<string, number>).reduce((a, b) => a + b, 0)} items.`);
        load();
        if (data.id) window.location.href = `/suite/${data.id}`;
      }
    } catch (err) {
      setRestoreMsg(err instanceof Error ? err.message : "Invalid JSON file");
    }
    setTimeout(() => setRestoreMsg(null), 5000);
  };

  const exportSuite = async (suite: Suite) => {
    const res = await fetch(`/api/suites/${suite.id}`);
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data.suite, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${suite.name.toLowerCase().replace(/\s+/g, "-")}.modelsweep.json`;
    a.click();
  };

  return (
    <div className="px-6 md:px-12 py-12 max-w-[1300px] mx-auto min-h-screen">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
        <div>
          <h1 className="text-4xl font-semibold text-white tracking-tight mb-2">Test Suites</h1>
          <p className="text-zinc-400 text-[17px] font-medium tracking-tight">{suites.length} active suite{suites.length !== 1 ? "s" : ""}</p>
        </div>
        <div className="flex items-center gap-3">
          {!creating && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.modelsweep.json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) importSuite(file);
                  e.target.value = "";
                }}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                title="Import a .modelsweep.json suite file"
                className="h-11 px-5 rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 font-medium text-[14px] hover:bg-white/[0.08] hover:text-white transition-colors flex items-center gap-2"
              >
                <Upload size={15} /> Import
              </button>
              <button
                onClick={restoreDefaults}
                disabled={restoring}
                title="Bring back built-in starter suites you've deleted"
                className="h-11 px-5 rounded-full border border-white/10 bg-white/[0.03] text-zinc-300 font-medium text-[14px] hover:bg-white/[0.08] hover:text-white transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {restoring ? <Loader2 size={15} className="animate-spin" /> : <RotateCcw size={15} />}
                {restoring ? "Restoring..." : "Restore defaults"}
              </button>
            </>
          )}
          {creating ? (
            <div className="apple-glass p-1.5 pr-2 pl-4 rounded-full flex items-center gap-3">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createSuite()}
                placeholder="Name your suite..."
                className="bg-transparent border-none text-[15px] font-medium text-white placeholder:text-zinc-500 focus:outline-none w-56 px-2"
              />
              <button className="h-9 px-5 rounded-full bg-white text-black font-semibold text-[14px] shadow-sm hover:scale-105 active:scale-95 transition-transform" onClick={createSuite}>Create</button>
              <button className="h-9 px-5 rounded-full text-zinc-400 font-medium text-[14px] hover:text-white transition-colors" onClick={() => { setCreating(false); setNewName(""); }}>Cancel</button>
            </div>
          ) : (
            <button className="h-11 px-6 rounded-full bg-white text-black font-semibold text-[16px] tracking-tight hover:bg-zinc-200 transition-colors active:scale-95 flex items-center justify-center shadow-md" onClick={() => setCreating(true)}>
              <Plus size={18} className="mr-2" /> New Suite
            </button>
          )}
        </div>
      </div>

      {restoreMsg && (
        <div className="mb-6 px-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-zinc-300 text-sm">
          {restoreMsg}
        </div>
      )}

      {loading ? (
        <div className="py-24 text-center text-zinc-500 text-[16px] font-medium">Loading suites...</div>
      ) : suites.length === 0 ? (
        <div className="py-24 flex flex-col items-center justify-center text-center">
          <div className="w-24 h-24 mb-6 rounded-[32px] apple-glass flex items-center justify-center shadow-lg">
             <Container size={44} className="text-zinc-300 stroke-[1.5px]" />
          </div>
          <p className="text-3xl font-semibold tracking-tight text-white mb-3">No Suites Found</p>
          <p className="text-zinc-400 text-[17px] font-medium mb-8 max-w-[340px]">Create your first test suite to group evaluations by domain.</p>
          <button className="h-12 px-8 rounded-full bg-white text-black text-[16px] font-semibold tracking-tight hover:scale-105 active:scale-95 transition-transform flex items-center shadow-lg" onClick={() => setCreating(true)}>
             Create Suite
          </button>
        </div>
      ) : (
        <div className="bg-[#0A0A0C] border border-white/10 rounded-2xl overflow-hidden shadow-2xl relative isolate filter drop-shadow-[0_0_20px_rgba(255,255,255,0.02)]">
          {/* List Header */}
          <div className="flex items-center p-4 px-6 text-[13px] font-semibold uppercase tracking-wider text-zinc-500 border-b border-white/10 bg-white/[0.02]">
            <span className="flex-1 text-left">Suite</span>
            <span className="w-24 hidden sm:block">Type</span>
            <span className="w-32 text-right">Scenarios</span>
            <span className="w-48 text-right hidden lg:block">Last Run</span>
            <span className="w-6 hidden lg:block" />
          </div>

          <div className="flex flex-col">
            {suites.map((suite) => {
              const type = TYPE_LABEL[suite.suite_type] || TYPE_LABEL.standard;
              const word = SCENARIO_WORD[suite.suite_type] || "prompt";

              return (
                <div key={suite.id} className="apple-list-row flex items-center p-5 px-6 transition-colors hover:bg-white/[0.04] group cursor-pointer" onClick={() => window.location.href = `/suite/${suite.id}`}>
                  <div className="flex-1 min-w-0 pr-4">
                    <span className="text-[17px] text-white font-medium truncate block mb-1 tracking-tight">{suite.name}</span>
                    {suite.description && <span className="text-[14px] text-zinc-400 truncate block">{suite.description}</span>}
                  </div>
                  
                  <div className="w-24 flex-shrink-0 hidden sm:block">
                     <span className={cn("px-2.5 py-1 rounded-md text-[11px] font-bold tracking-wider uppercase", type.bg, type.color)}>{type.label}</span>
                  </div>
                  
                  <span className="w-32 flex-shrink-0 text-right text-[15px] font-medium text-zinc-300">
                    {suite.prompt_count} <span className="text-zinc-500 ml-1">{word}{suite.prompt_count !== 1 ? "s" : ""}</span>
                  </span>
                  
                  <div className="w-48 flex-shrink-0 flex items-center justify-end hidden lg:flex relative">
                    <span className="text-[15px] font-medium text-zinc-500 group-hover:opacity-0 transition-opacity absolute right-0">
                      {suite.last_run_at ? formatRelativeTime(suite.last_run_at) : "—"}
                    </span>
                    
                    <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-all duration-200 translate-x-2 group-hover:translate-x-0 relative z-10" onClick={(e) => e.stopPropagation()}>
                      <div className="relative group/tooltip">
                        <button onClick={() => exportSuite(suite)} className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-full transition-colors bg-[#1C1C1E] shadow-sm">
                          <Download size={16} />
                        </button>
                      </div>

                      <div className="relative group/tooltip">
                        <button onClick={() => deleteSuite(suite.id)} className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-full transition-colors bg-[#1C1C1E] shadow-sm">
                          <Trash2 size={16} />
                        </button>
                      </div>

                      <div className="relative group/tooltip">
                        <Link href={`/suite/${suite.id}/run`} className="p-2 text-zinc-400 hover:text-[#32D74B] hover:bg-[#32D74B]/10 rounded-full transition-colors ml-1 block bg-[#1C1C1E] shadow-sm">
                          <Play size={16} />
                        </Link>
                      </div>

                      <div className="relative group/tooltip">
                        <Link href={`/suite/${suite.id}`} className="ml-1 p-2 flex items-center text-zinc-500 hover:text-zinc-300 transition-colors bg-[#1C1C1E] hover:bg-white/10 rounded-full">
                          <ChevronRight size={16} />
                        </Link>
                      </div>
                    </div>
                  </div>
                  
                  <span className="w-6 hidden lg:block" />
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
