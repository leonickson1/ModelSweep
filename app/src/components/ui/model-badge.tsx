"use client";

import { detectModelFamily, MODEL_COLORS } from "@/lib/model-colors";
import { cn } from "@/lib/utils";

interface ModelBadgeProps {
  name: string;
  size?: "sm" | "md" | "lg";
  showGlow?: boolean;
  className?: string;
}

export function ModelBadge({ name, size = "md", showGlow = false, className }: ModelBadgeProps) {
  const family = detectModelFamily(name);
  const colors = MODEL_COLORS[family];

  const sizeClasses = {
    sm: "text-xs px-2 py-0.5 rounded-md",
    md: "text-sm px-2.5 py-1 rounded-lg",
    lg: "text-base px-3 py-1.5 rounded-xl",
  };

  return (
    <span
      className={cn(
        "relative inline-flex items-center font-medium",
        colors.badgeBg,
        colors.badgeText,
        sizeClasses[size],
        className
      )}
    >
      {showGlow && (
        <span
          className="absolute inset-0 -z-10 blur-xl opacity-40 rounded-full"
          style={{ background: colors.hex }}
        />
      )}
      {name}
    </span>
  );
}

interface ModelColorDotProps {
  name: string;
  size?: number;
}

export function ModelColorDot({ name, size = 8 }: ModelColorDotProps) {
  const family = detectModelFamily(name);
  const colors = MODEL_COLORS[family];
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: size, height: size, background: colors.hex }}
    />
  );
}
