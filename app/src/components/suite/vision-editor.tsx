"use client";

import { useState, useRef } from "react";
import { Plus, Eye, ChevronDown, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VisionScenario {
  id: string;
  name: string;
  imageData: string;
  imageMime: string;
  question: string;
  category: string;
  expectedAnswer: string | null;
  rubric: string;
  difficulty: string;
}

interface VisionEditorProps {
  scenarios: VisionScenario[];
  suiteId: string;
  readOnly?: boolean;
  onScenariosChange: (scenarios: VisionScenario[]) => void;
}

const CATEGORIES = [
  { value: "object_id", label: "Object Identification" },
  { value: "ocr", label: "OCR / Text Reading" },
  { value: "counting", label: "Counting" },
  { value: "spatial", label: "Spatial Reasoning" },
  { value: "description", label: "Description" },
  { value: "reasoning", label: "Visual Reasoning" },
];
const DIFFICULTIES = ["easy", "medium", "hard"];

export function VisionEditor({ scenarios, suiteId, readOnly, onScenariosChange }: VisionEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  const addScenario = async () => {
    const res = await fetch(`/api/suites/${suiteId}/vision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "New Vision Scenario", category: "description", order: scenarios.length }),
    });
    const data = await res.json();
    onScenariosChange([...scenarios, {
      id: data.id, name: "New Vision Scenario", imageData: "", imageMime: "image/png",
      question: "", category: "description", expectedAnswer: null, rubric: "", difficulty: "medium",
    }]);
    setExpandedId(data.id);
  };

  const updateScenario = async (id: string, updates: Partial<VisionScenario>) => {
    await fetch(`/api/suites/${suiteId}/vision`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id, ...updates }),
    });
    onScenariosChange(scenarios.map(s => s.id === id ? { ...s, ...updates } : s));
  };

  const deleteScenario = async (id: string) => {
    await fetch(`/api/suites/${suiteId}/vision`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenarioId: id }),
    });
    onScenariosChange(scenarios.filter(s => s.id !== id));
  };

  const handleImageUpload = async (scenarioId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1]; // Remove data URI prefix
      updateScenario(scenarioId, { imageData: base64, imageMime: file.type });
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-zinc-500 text-[13px] font-bold uppercase tracking-widest">Vision Scenarios</h2>
        {!readOnly && (
          <Button size="sm" variant="secondary" onClick={addScenario}>
            <Plus size={12} /> Add Scenario
          </Button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const file = e.target.files?.[0];
          if (file && uploadingFor) handleImageUpload(uploadingFor, file);
          e.target.value = "";
        }}
      />

      {scenarios.length === 0 && (
        <p className="text-zinc-600 text-sm py-8 text-center">No vision scenarios yet. Add one to get started.</p>
      )}

      {scenarios.map(scenario => {
        const expanded = expandedId === scenario.id;
        return (
          <div key={scenario.id} className="border-b border-white/[0.05] overflow-hidden">
            <button
              onClick={() => setExpandedId(expanded ? null : scenario.id)}
              className="w-full flex items-center gap-4 px-6 py-5 text-left hover:bg-white/[0.04] transition-colors apple-list-row cursor-pointer"
            >
              <Eye size={16} className="text-amber-400 flex-shrink-0" />
              <span className="text-white text-[17px] font-medium tracking-tight flex-1 truncate">{scenario.name}</span>
              <span className="text-zinc-400 text-[14px] font-medium">{CATEGORIES.find(c => c.value === scenario.category)?.label ?? scenario.category}</span>
              {scenario.imageData && <span className="text-emerald-500 text-[12px] font-bold tracking-widest uppercase">HAS IMAGE</span>}
              <ChevronDown size={14} className={cn("text-zinc-600 transition-transform", expanded && "rotate-180")} />
            </button>

            {expanded && (
              <div className="p-6 space-y-6 border-t border-white/[0.05] bg-[#09090B]">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Name</label>
                    <input value={scenario.name} onChange={e => updateScenario(scenario.id, { name: e.target.value })} disabled={readOnly}
                      className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none focus:border-amber-500/30" />
                  </div>
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Category</label>
                    <select value={scenario.category} onChange={e => updateScenario(scenario.id, { category: e.target.value })} disabled={readOnly}
                      className="w-full bg-[#1A1A1C] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none">
                      {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                </div>

                {/* Image upload */}
                <div>
                  <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Image</label>
                  {scenario.imageData ? (
                    <div className="relative">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={`data:${scenario.imageMime};base64,${scenario.imageData}`} alt="Scenario" className="max-h-40 rounded-xl border border-white/10" />
                      {!readOnly && (
                        <button onClick={() => { setUploadingFor(scenario.id); fileInputRef.current?.click(); }}
                          className="absolute top-2 left-2 bg-black/60 text-white font-semibold text-[13px] px-3 py-1.5 rounded-lg hover:bg-black/80 transition-colors">
                          Replace
                        </button>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={() => { setUploadingFor(scenario.id); fileInputRef.current?.click(); }}
                      disabled={readOnly}
                      className="w-full h-32 border-2 border-dashed border-white/10 rounded-xl flex items-center justify-center gap-3 text-zinc-500 text-[15px] font-medium hover:border-amber-500/30 hover:text-white transition-colors bg-[#121214]"
                    >
                      <Upload size={20} /> Upload Image
                    </button>
                  )}
                </div>

                <div>
                  <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Question</label>
                  <textarea value={scenario.question} onChange={e => updateScenario(scenario.id, { question: e.target.value })} disabled={readOnly} rows={2}
                    className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none resize-none" />
                </div>

                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Expected Answer</label>
                    <input value={scenario.expectedAnswer ?? ""} onChange={e => updateScenario(scenario.id, { expectedAnswer: e.target.value || null })} disabled={readOnly}
                      placeholder="For objective categories"
                      className="w-full bg-[#121214] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none placeholder:text-zinc-600" />
                  </div>
                  <div>
                    <label className="text-zinc-500 text-[13px] font-bold tracking-widest uppercase block mb-3">Difficulty</label>
                    <select value={scenario.difficulty} onChange={e => updateScenario(scenario.id, { difficulty: e.target.value })} disabled={readOnly}
                      className="w-full bg-[#1A1A1C] border border-white/10 rounded-xl px-4 py-3 text-[15px] font-medium text-white focus:outline-none">
                      {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>

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
  );
}
