"use client";

import {
  RadarChart as RechartsRadar,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import { getModelColor } from "@/lib/model-colors";

interface RadarDataPoint {
  category: string;
  [modelName: string]: string | number;
}

interface ModelRadarChartProps {
  models: Array<{
    name: string;
    categoryScores: Record<string, number | null>;
  }>;
  height?: number;
  showLegend?: boolean;
}

const CATEGORY_LABELS: Record<string, string> = {
  coding: "Coding",
  creative: "Creative",
  reasoning: "Reasoning",
  instruction: "Instruction",
  speed: "Speed",
};

export function ModelRadarChart({ models, height = 300, showLegend = true }: ModelRadarChartProps) {
  // Determine which categories have data (not null) across any model
  const allCategories = ["coding", "creative", "reasoning", "instruction", "speed"];

  const activeCategories = allCategories.filter((cat) =>
    models.some((m) => m.categoryScores[cat] !== null && m.categoryScores[cat] !== undefined)
  );

  // If < 3 active categories, radar doesn't make visual sense — show simple bars
  if (activeCategories.length < 3) {
    return <SimpleComparison models={models} categories={activeCategories} height={height} />;
  }

  const data: RadarDataPoint[] = activeCategories.map((cat) => {
    // Count how many models have data for this category
    const promptCount = models.filter((m) => m.categoryScores[cat] !== null && m.categoryScores[cat] !== undefined).length;
    const label = `${CATEGORY_LABELS[cat] || cat}${promptCount < models.length ? ` (${promptCount}/${models.length})` : ""}`;

    const point: RadarDataPoint = { category: label };
    for (const model of models) {
      point[model.name] = model.categoryScores[cat] ?? 0;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RechartsRadar data={data} outerRadius="75%">
        <PolarGrid
          stroke="#00FF66"
          strokeOpacity={0.1}
          gridType="polygon"
        />
        <PolarAngleAxis
          dataKey="category"
          tick={{ fill: "#00FF66", fontSize: 10, fontFamily: "monospace", letterSpacing: "1px" }}
        />
        <PolarRadiusAxis
          domain={[0, 100]}
          tick={false}
          axisLine={false}
        />
        {models.map((model, i) => {
          const strokeColor = i === 0 ? "#00FF66" : getModelColor(model.name).hex;
          return (
            <Radar
              key={model.name}
              name={model.name}
              dataKey={model.name}
              stroke={strokeColor}
              fill={strokeColor}
              fillOpacity={0.15}
              strokeWidth={1}
              isAnimationActive
              animationDuration={600}
            />
          );
        })}
        <Tooltip
          contentStyle={{
            background: "#050505",
            border: "1px solid rgba(0,255,102,0.2)",
            borderRadius: 0,
            fontSize: 10,
            fontFamily: "monospace",
            textTransform: "uppercase" as const,
            color: "#fff",
          }}
        />
        {showLegend && (
          <Legend
            iconType="circle"
            iconSize={8}
            wrapperStyle={{ fontSize: 12, color: "#a1a1aa" }}
          />
        )}
      </RechartsRadar>
    </ResponsiveContainer>
  );
}

// Fallback for < 3 categories: simple side-by-side comparison bars
function SimpleComparison({
  models,
  categories,
  height,
}: {
  models: ModelRadarChartProps["models"];
  categories: string[];
  height: number;
}) {
  if (categories.length === 0) {
    return (
      <div className="flex items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-widest" style={{ height }}>
        No Category Data
      </div>
    );
  }

  return (
    <div className="flex flex-col justify-center gap-6 w-full" style={{ minHeight: height }}>
      {categories.map((cat) => (
        <div key={cat} className="space-y-2">
          <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
            {CATEGORY_LABELS[cat] || cat}
          </span>
          {models.map((model, i) => {
            const score = model.categoryScores[cat] ?? 0;
            const color = i === 0 ? "#00FF66" : getModelColor(model.name).hex;
            return (
              <div key={model.name} className="flex items-center gap-3">
                <span className="text-zinc-500 font-mono text-[10px] w-32 truncate">{model.name}</span>
                <div className="flex-1 h-2 bg-zinc-800/60 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-700"
                    style={{ width: `${score}%`, background: color }}
                  />
                </div>
                <span className="font-mono text-xs tabular-nums" style={{ color }}>{score}%</span>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
