"use client";

import { motion } from "framer-motion";
import { FileText, Wrench, MessageSquare, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SuiteType } from "@/types";

interface SuiteTypeSelectorProps {
  value: SuiteType;
  onChange: (type: SuiteType) => void;
  disabled?: boolean;
}

const SUITE_TYPES: {
  value: SuiteType;
  label: string;
  sublabel: string;
  icon: React.ReactNode;
  color: string;
  glowColor: string;
  description: string;
}[] = [
  {
    value: "standard",
    label: "Standard",
    sublabel: "Single Prompt",
    icon: <FileText size={20} />,
    color: "text-zinc-300 border-zinc-500/30 bg-zinc-500/10",
    glowColor: "bg-zinc-500/10",
    description:
      "Test models with individual prompts. Best for comparing output quality, coding ability, and writing style.",
  },
  {
    value: "tool_calling",
    label: "Tools",
    sublabel: "Function Calling",
    icon: <Wrench size={20} />,
    color: "text-blue-300 border-blue-500/30 bg-blue-500/10",
    glowColor: "bg-blue-500/10",
    description:
      "Define mock tools and test scenarios. Evaluate which models pick the right tool, format parameters correctly, and avoid unnecessary calls.",
  },
  {
    value: "conversation",
    label: "Convo",
    sublabel: "Multi Turn",
    icon: <MessageSquare size={20} />,
    color: "text-violet-300 border-violet-500/30 bg-violet-500/10",
    glowColor: "bg-violet-500/10",
    description:
      "Test multi-turn conversation coherence. Define personas, run dynamic dialogues, and score context retention.",
  },
  {
    value: "adversarial",
    label: "Attack",
    sublabel: "Red Team",
    icon: <Shield size={20} />,
    color: "text-rose-300 border-rose-500/30 bg-rose-500/10",
    glowColor: "bg-rose-500/10",
    description:
      "Test adversarial robustness and system prompt defense. Run red-team attacks to find vulnerabilities.",
  },
];

export function SuiteTypeSelector({ value, onChange, disabled }: SuiteTypeSelectorProps) {
  const selected = SUITE_TYPES.find((t) => t.value === value) ?? SUITE_TYPES[0];
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const isComingSoon = (_type: SuiteType) => false; // All modes now available

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-4 gap-2">
        {SUITE_TYPES.map((type) => {
          const active = value === type.value;
          const comingSoon = isComingSoon(type.value);
          return (
            <motion.button
              key={type.value}
              onClick={() => !disabled && !comingSoon && onChange(type.value)}
              whileHover={!disabled && !comingSoon ? { scale: 1.02 } : undefined}
              whileTap={!disabled && !comingSoon ? { scale: 0.98 } : undefined}
              className={cn(
                "relative flex flex-col items-center gap-1.5 py-3 px-2 rounded-xl border transition-all text-center",
                "bg-white/5 backdrop-blur-md",
                active
                  ? type.color
                  : "border-white/[0.06] text-zinc-500 hover:bg-white/[0.08]",
                (disabled || comingSoon) && "opacity-40 cursor-not-allowed",
                "focus-visible:ring-2 focus-visible:ring-white/20 outline-none"
              )}
              disabled={disabled || comingSoon}
            >
              {active && (
                <motion.div
                  layoutId="suite-type-glow"
                  className={cn("absolute inset-0 rounded-xl blur-xl opacity-30", type.glowColor)}
                  transition={{ type: "spring", stiffness: 300, damping: 30 }}
                />
              )}
              <span className="relative z-10">{type.icon}</span>
              <span className="relative z-10 text-xs font-medium">{type.label}</span>
              <span className="relative z-10 text-[10px] opacity-60">{type.sublabel}</span>
              {/* All modes available */}
            </motion.button>
          );
        })}
      </div>
      <p className="text-zinc-500 text-xs">{selected.description}</p>
    </div>
  );
}
