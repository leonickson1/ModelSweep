"use client";

import { cn } from "@/lib/utils";
import type { SuiteType } from "@/types";
import { ListTodo, Wrench, MessageSquare, ShieldAlert, Code2, Image as ImageIcon, BookText } from "lucide-react";

interface SuiteTypeSelectorProps {
  value: SuiteType;
  onChange: (type: SuiteType) => void;
  disabled?: boolean;
}

const SUITE_TYPES: {
  value: SuiteType;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  { value: "standard", label: "Standard", description: "Test models with individual prompts. Best for comparing output quality, coding ability, and writing style.", icon: ListTodo },
  { value: "tool_calling", label: "Tools", description: "Define mock tools and test scenarios. Evaluate which models pick the right tool and format parameters correctly.", icon: Wrench },
  { value: "conversation", label: "Convo", description: "Test multi-turn conversation coherence. Define personas, run dynamic dialogues, and score context retention.", icon: MessageSquare },
  { value: "coding", label: "Code", description: "Write coding challenges with test cases. Models generate code, Docker runs it against your tests.", icon: Code2 },
  { value: "adversarial", label: "Attack", description: "Test adversarial robustness and system prompt defense. Run red-team attacks to find vulnerabilities.", icon: ShieldAlert },
  { value: "vision", label: "Vision", description: "Test vision models on image understanding. Upload images, define questions, and score on object ID, OCR, counting, and more.", icon: ImageIcon },
  { value: "rag", label: "RAG", description: "Upload a document, define questions with ground truth answers. Test whether models use retrieved context faithfully.", icon: BookText },
];

export function SuiteTypeSelector({ value, onChange, disabled }: SuiteTypeSelectorProps) {
  const selected = SUITE_TYPES.find((t) => t.value === value) ?? SUITE_TYPES[0];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        {SUITE_TYPES.map((type) => {
          const Icon = type.icon;
          const isSelected = value === type.value;
          return (
            <button
              key={type.value}
              onClick={() => !disabled && onChange(type.value)}
              disabled={disabled}
              className={cn(
                "flex flex-col items-start gap-2 p-4 rounded-2xl transition-all duration-200 border text-left",
                isSelected
                  ? "bg-white text-black border-white shadow-[0_0_20px_rgba(255,255,255,0.1)] scale-[1.02]"
                  : "bg-[#121214] border-white/5 text-zinc-400 hover:bg-white/5 hover:border-white/10 hover:text-white",
                disabled && "opacity-40 cursor-not-allowed hover:bg-[#121214] hover:scale-100 hover:border-white/5"
              )}
            >
              <Icon size={18} className={cn("mb-1", isSelected ? "text-black" : "")} />
              <span className="text-[15px] font-semibold tracking-tight leading-none">{type.label}</span>
            </button>
          );
        })}
      </div>
      <div className="p-4 rounded-2xl bg-white/[0.03] border border-white/[0.05]">
        <p className="text-zinc-400 text-[14px] leading-relaxed">{selected.description}</p>
      </div>
    </div>
  );
}
