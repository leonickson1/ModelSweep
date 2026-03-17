"use client";

import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getScoreColor(score: number) {
  if (score >= 80) return { bg: "bg-[#050505]", text: "text-[#00FF66]", border: "border-[#00FF66]/20" };
  if (score >= 60) return { bg: "bg-[#050505]", text: "text-amber-400", border: "border-amber-500/20" };
  if (score >= 40) return { bg: "bg-[#050505]", text: "text-orange-400", border: "border-orange-500/20" };
  return { bg: "bg-[#050505]", text: "text-red-500", border: "border-red-500/20" };
}

export function ScoreBadge({ score, size = "md", className }: ScoreBadgeProps) {
  const colors = getScoreColor(score);
  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 rounded-none",
    md: "text-sm px-2.5 py-1 rounded-none font-mono tracking-widest",
    lg: "text-lg px-3 py-1.5 rounded-none font-mono font-bold tracking-widest",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center border font-mono tabular-nums uppercase",
        colors.bg, colors.text, colors.border,
        sizeClasses[size],
        className
      )}
    >
      {score}%
    </span>
  );
}

interface ScoreBarProps {
  score: number;
  label?: string;
  color?: string;
  className?: string;
  maxScore?: number;
}

export function ScoreBar({ score, label, color, className, maxScore = 100 }: ScoreBarProps) {
  const normalized = (score / maxScore) * 100;
  const pct = Math.min(100, Math.max(0, score > 0 ? Math.max(normalized, 4) : 0));
  const displayPct = Math.round(Math.min(100, Math.max(0, normalized)));
  const autoColor = color ?? (displayPct >= 80 ? "#10b981" : displayPct >= 60 ? "#eab308" : "#ef4444");

  return (
    <div className={cn("space-y-1", className)}>
      {label && (
        <div className="flex justify-between text-xs">
          <span className="text-zinc-400">{label}</span>
          <span className="text-zinc-300 font-mono tabular-nums">{displayPct}%</span>
        </div>
      )}
      <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: autoColor }}
        />
      </div>
    </div>
  );
}
