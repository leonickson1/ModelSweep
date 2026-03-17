import { ModelFamily } from "@/types";

export interface ModelColorConfig {
  accent: string;
  hex: string;
  glow: string;
  glowShadow: string;
  badgeBg: string;
  badgeText: string;
  chartColor: string;
}

export const MODEL_COLORS: Record<ModelFamily, ModelColorConfig> = {
  llama: {
    accent: "amber",
    hex: "#f59e0b",
    glow: "bg-amber-500/10",
    glowShadow: "shadow-amber-500/20",
    badgeBg: "bg-amber-500/15",
    badgeText: "text-amber-400",
    chartColor: "#f59e0b",
  },
  qwen: {
    accent: "blue",
    hex: "#3b82f6",
    glow: "bg-blue-500/10",
    glowShadow: "shadow-blue-500/20",
    badgeBg: "bg-blue-500/15",
    badgeText: "text-blue-400",
    chartColor: "#3b82f6",
  },
  mistral: {
    accent: "violet",
    hex: "#8b5cf6",
    glow: "bg-violet-500/10",
    glowShadow: "shadow-violet-500/20",
    badgeBg: "bg-violet-500/15",
    badgeText: "text-violet-400",
    chartColor: "#8b5cf6",
  },
  deepseek: {
    accent: "emerald",
    hex: "#10b981",
    glow: "bg-emerald-500/10",
    glowShadow: "shadow-emerald-500/20",
    badgeBg: "bg-emerald-500/15",
    badgeText: "text-emerald-400",
    chartColor: "#10b981",
  },
  gemma: {
    accent: "rose",
    hex: "#f43f5e",
    glow: "bg-rose-500/10",
    glowShadow: "shadow-rose-500/20",
    badgeBg: "bg-rose-500/15",
    badgeText: "text-rose-400",
    chartColor: "#f43f5e",
  },
  phi: {
    accent: "cyan",
    hex: "#06b6d4",
    glow: "bg-cyan-500/10",
    glowShadow: "shadow-cyan-500/20",
    badgeBg: "bg-cyan-500/15",
    badgeText: "text-cyan-400",
    chartColor: "#06b6d4",
  },
  other: {
    accent: "zinc",
    hex: "#a1a1aa",
    glow: "bg-zinc-500/10",
    glowShadow: "shadow-zinc-500/20",
    badgeBg: "bg-zinc-500/15",
    badgeText: "text-zinc-400",
    chartColor: "#a1a1aa",
  },
};

export function detectModelFamily(modelName: string): ModelFamily {
  const lower = modelName.toLowerCase();
  if (lower.includes("llama") || lower.includes("meta")) return "llama";
  if (lower.includes("qwen") || lower.includes("alibaba")) return "qwen";
  if (lower.includes("mistral") || lower.includes("mixtral")) return "mistral";
  if (lower.includes("deepseek")) return "deepseek";
  if (lower.includes("gemma") || lower.includes("google")) return "gemma";
  if (lower.includes("phi") || lower.includes("microsoft")) return "phi";
  return "other";
}

export function getModelColor(modelNameOrFamily: string): ModelColorConfig {
  const family = detectModelFamily(modelNameOrFamily);
  return MODEL_COLORS[family];
}

// Returns hex colors in stable order for multiple models in a chart
export function getChartColors(modelNames: string[]): string[] {
  return modelNames.map((name) => getModelColor(name).hex);
}
