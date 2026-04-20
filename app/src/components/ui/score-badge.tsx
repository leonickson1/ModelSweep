"use client";

import { cn } from "@/lib/utils";

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

function getScoreColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-amber-400";
  if (score >= 40) return "text-orange-400";
  return "text-red-400";
}

export function ScoreBadge({ score, size = "md", className }: ScoreBadgeProps) {
  const color = getScoreColor(score);
  const sizeClasses = {
    sm: "text-xs",
    md: "text-sm",
    lg: "text-lg font-semibold",
  };

  return (
    <span className={cn("font-mono tabular-nums", color, sizeClasses[size], className)}>
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
          <span className="text-zinc-500">{label}</span>
          <span className="text-zinc-300 font-mono tabular-nums">{displayPct}%</span>
        </div>
      )}
      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{ width: `${pct}%`, background: autoColor }}
        />
      </div>
    </div>
  );
}
