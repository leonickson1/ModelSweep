"use client";

import { useState, useRef } from "react";
import { Plus, FileSearch, ChevronDown, Upload, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface RagChunk {
  id: string;
  text: string;
  source: string;
  tokenCount: number;
}

interface RagDocument {
  id: string;
  filename: string;
  mimeType: string;
  chunks: RagChunk[];
}

interface RagScenario {
  id: string;
  documentId: string;
  question: string;
  groundTruthAnswer: string;
  relevantChunkIds: string[];
  distractorChunkIds: string[];
  answerNotInDocument: boolean;
  difficulty: string;
}

interface RagEditorProps {
  scenarios: RagScenario[];
  documents: RagDocument[];
  suiteId: string;
  readOnly?: boolean;
  onScenariosChange: (scenarios: RagScenario[]) => void;
  onDocumentsChange: (documents: RagDocument[]) => void;
}

const DIFFICULTIES = ["easy", "medium", "hard"];

export function RagEditor({ scenarios, documents, suiteId, readOnly, onScenariosChange, onDocumentsChange }: RagEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const uploadDocument = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("suiteId", suiteId);
      const res = await fetch("/api/rag/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (data.documentId) {
        // Reload to get full document with chunks
        const suiteRes = await fetch(`/api/suites/${suiteId}/rag`);
        const suiteData = await suiteRes.json();
        onDocumentsChange(suiteData.documents || []);
      }
    } finally {
      setUploading(false);
    }
  };

  const addScenario = async (documentId: string) => {
    const res = await fetch(`/api/suites/${suiteId}/rag`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ documentId, question: "", groundTruthAnswer: "", order: scenarios.length }),
    });
    const data = await res.json();
    onScenariosChange([...scenarios, {
      id: data.id, documentId, question: "", groundTruthAnswer: "",
      relevantChunkIds: [], distractorChunkIds: [], answerNotInDocument: false, difficulty: "medium",
    }]);
    setExpandedId(data.id);
  };

  const updateScenario = async (id: string, updates: Partial<RagScenario>) => {
    await fetch(`/api/suites/${suiteId}/rag`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id, ...updates }),
    });
    onScenariosChange(scenarios.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteScenario = async (id: string) => {
    await fetch(`/api/suites/${suiteId}/rag`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id }),
    });
    onScenariosChange(scenarios.filter(s => s.id !== id));
  };

  const toggleChunk = (scenarioId: string, chunkId: string, type: "relevant" | "distractor") => {
    const scenario = scenarios.find(s => s.id === scenarioId);
    if (!scenario) return;
    const field = type === "relevant" ? "relevantChunkIds" : "distractorChunkIds";
    const otherField = type === "relevant" ? "distractorChunkIds" : "relevantChunkIds";
    const current = scenario[field];
    const updated = current.includes(chunkId) ? current.filter(id => id !== chunkId) : [...current, chunkId];
    // Remove from the other list if present
    const otherUpdated = scenario[otherField].filter(id => id !== chunkId);
    updateScenario(scenarioId, { [field]: updated, [otherField]: otherUpdated });
  };

  return (
    <div className="space-y-6">
      {/* Documents section */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">Documents</h2>
          {!readOnly && (
            <Button size="sm" variant="secondary" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload size={12} /> {uploading ? "Uploading..." : "Upload Document"}
            </Button>
          )}
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.txt,.md"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) uploadDocument(f); e.target.value = ""; }}
        />

        {documents.length === 0 ? (
          <div className="border-2 border-dashed border-white/10 rounded-2xl p-10 text-center bg-[#121214]">
            <FileText size={28} className="mx-auto text-zinc-600 mb-3" />
            <p className="text-zinc-400 text-[15px] font-medium">No documents uploaded yet.</p>
            <p className="text-zinc-500 text-[13px] mt-1">Upload a PDF, DOCX, or text file to get started.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map(doc => (
              <div key={doc.id} className="border border-white/10 rounded-2xl p-5 bg-[#121214] apple-list-row">
                <div className="flex items-center gap-3">
                  <FileText size={18} className="text-emerald-400" />
                  <span className="text-white text-[16px] font-medium flex-1">{doc.filename}</span>
                  <span className="text-zinc-500 text-[13px] font-mono">{doc.chunks.length} chunks</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Scenarios section */}
      <div className="pt-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">RAG Scenarios</h2>
          {!readOnly && documents.length > 0 && (
            <Button size="sm" variant="secondary" onClick={() => addScenario(documents[0].id)}>
              <Plus size={12} /> Add Scenario
            </Button>
          )}
        </div>

        {scenarios.length === 0 && documents.length > 0 && (
          <p className="text-zinc-600 text-sm py-4 text-center">No scenarios yet. Add one to test retrieval against your document.</p>
        )}

        {scenarios.map(scenario => {
          const expanded = expandedId === scenario.id;
          const doc = documents.find(d => d.id === scenario.documentId);
          return (
            <div key={scenario.id} className="border-b border-white/[0.05] overflow-hidden mb-0">
              <button
                onClick={() => setExpandedId(expanded ? null : scenario.id)}
                className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.04] transition-colors apple-list-row cursor-pointer"
              >
                <FileSearch size={16} className="text-emerald-400 flex-shrink-0" />
                <span className="text-white text-[17px] font-medium tracking-tight flex-1 truncate">{scenario.question || "New scenario"}</span>
                {scenario.answerNotInDocument && <span className="text-amber-400 text-[12px] font-bold tracking-widest uppercase">ABSTAIN</span>}
                <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", expanded && "rotate-180")} />
              </button>

              {expanded && (
                <div className="p-6 space-y-6 border-t border-white/[0.05] bg-[#09090B]">
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Question</label>
                    <textarea value={scenario.question} onChange={e => updateScenario(scenario.id, { question: e.target.value })} disabled={readOnly} rows={2}
                      className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none resize-none" />
                  </div>

                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Ground Truth Answer</label>
                    <textarea value={scenario.groundTruthAnswer} onChange={e => updateScenario(scenario.id, { groundTruthAnswer: e.target.value })} disabled={readOnly} rows={2}
                      className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none resize-none" />
                  </div>

                  <div className="grid grid-cols-[1fr_auto] gap-6 items-end">
                    <label className="flex items-center gap-3 text-[15px] font-medium text-white cursor-pointer h-12 px-4 rounded-xl border border-white/10 bg-[#121214]">
                      <input type="checkbox" checked={scenario.answerNotInDocument}
                        onChange={e => updateScenario(scenario.id, { answerNotInDocument: e.target.checked })}
                        disabled={readOnly} className="rounded border-white/20 bg-[#1A1A1C] checked:bg-emerald-500 checked:border-emerald-500 w-4 h-4" />
                      Answer is NOT in the document (model should abstain)
                    </label>
                    <div>
                      <select value={scenario.difficulty} onChange={e => updateScenario(scenario.id, { difficulty: e.target.value })} disabled={readOnly}
                        className="w-40 bg-[#1A1A1C] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none focus:border-amber-500/30 h-12">
                        {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                  </div>

                  {/* Chunk selector */}
                  {doc && doc.chunks.length > 0 && (
                    <div className="pt-4 border-t border-white/[0.05]">
                      <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-4">
                        Select Chunks — <span className="text-emerald-400">green = relevant</span> · <span className="text-amber-400">amber = distractor</span>
                      </label>
                      <div className="max-h-64 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
                        {doc.chunks.map(chunk => {
                          const isRelevant = scenario.relevantChunkIds.includes(chunk.id);
                          const isDistractor = scenario.distractorChunkIds.includes(chunk.id);
                          return (
                            <div key={chunk.id}
                              className={cn(
                                "p-4 rounded-xl border text-[14px] cursor-pointer transition-colors",
                                isRelevant ? "border-emerald-500/30 bg-emerald-500/10" :
                                isDistractor ? "border-amber-500/30 bg-amber-500/10" :
                                "border-white/10 bg-[#121214] hover:bg-white/[0.03]"
                              )}>
                              <div className="flex items-center gap-3 mb-2">
                                <span className="text-zinc-500 text-[12px] font-mono">{chunk.source}</span>
                                <span className="text-zinc-500 text-[12px] font-mono">{chunk.tokenCount} tok</span>
                                {!readOnly && (
                                  <div className="ml-auto flex gap-2">
                                    <button onClick={() => toggleChunk(scenario.id, chunk.id, "relevant")}
                                      className={cn("px-2.5 py-1 rounded-md text-[11px] font-mono", isRelevant ? "bg-emerald-500/20 text-emerald-400" : "text-zinc-500 hover:text-emerald-400 bg-white/5 hover:bg-emerald-500/10")}>
                                      relevant
                                    </button>
                                    <button onClick={() => toggleChunk(scenario.id, chunk.id, "distractor")}
                                      className={cn("px-2.5 py-1 rounded-md text-[11px] font-mono", isDistractor ? "bg-amber-500/20 text-amber-400" : "text-zinc-500 hover:text-amber-400 bg-white/5 hover:bg-amber-500/10")}>
                                      distractor
                                    </button>
                                  </div>
                                )}
                              </div>
                              <p className="text-zinc-400 leading-relaxed line-clamp-3 mt-2">{chunk.text}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {!readOnly && (
                    <div className="pt-4 border-t border-white/[0.05]">
                      <button onClick={() => deleteScenario(scenario.id)} className="text-red-400/60 text-[14px] font-semibold hover:text-red-400 transition-colors">
                        Delete scenario
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
