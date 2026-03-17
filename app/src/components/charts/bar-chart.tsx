"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { getModelColor } from "@/lib/model-colors";

interface CategoryBarChartProps {
  models: Array<{
    name: string;
    categoryScores: Record<string, number>;
    avgTokensPerSec?: number;
  }>;
  height?: number;
}

const CATEGORIES = [
  { key: "coding", label: "Coding" },
  { key: "creative", label: "Creative" },
  { key: "reasoning", label: "Reasoning" },
  { key: "instruction", label: "Instruction" },
  { key: "speed", label: "Speed" },
];

export function CategoryBarChart({ models, height = 280 }: CategoryBarChartProps) {
  const data = CATEGORIES.map(({ key, label }) => {
    const point: Record<string, string | number> = { category: label };
    for (const model of models) {
      point[model.name] = model.categoryScores[key] ?? 0;
    }
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, bottom: 4, left: 80 }}>
        <CartesianGrid horizontal={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis
          type="number"
          domain={[0, 100]}
          tick={{ fill: "#52525b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="category"
          tick={{ fill: "#71717a", fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          width={76}
        />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            fontSize: 12,
            color: "#f4f4f5",
          }}
        />
        {models.map((model, i) => {
          const color = getModelColor(model.name);
          return (
            <Bar
              key={model.name}
              dataKey={model.name}
              fill={color.hex}
              fillOpacity={0.8}
              radius={[0, 4, 4, 0]}
              barSize={models.length === 1 ? 14 : 10}
              isAnimationActive
              animationDuration={600 + i * 100}
            />
          );
        })}
      </BarChart>
    </ResponsiveContainer>
  );
}

// Simple horizontal bar for a single model's overall score
interface OverallScoreBarProps {
  models: Array<{ name: string; overallScore: number }>;
  height?: number;
}

export function OverallScoreBar({ models, height = 200 }: OverallScoreBarProps) {
  const data = models.map((m) => ({ name: m.name, score: m.overallScore }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
        <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="name" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fill: "#52525b", fontSize: 10 }} axisLine={false} tickLine={false} />
        <Tooltip
          contentStyle={{
            background: "#18181b",
            border: "1px solid rgba(255,255,255,0.08)",
            borderRadius: 12,
            fontSize: 12,
            color: "#f4f4f5",
          }}
        />
        <Bar dataKey="score" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={600}>
          {data.map((entry) => {
            const color = getModelColor(entry.name);
            return <Cell key={entry.name} fill={color.hex} fillOpacity={0.8} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Sparkline trend
interface SparklineProps {
  data: number[];
  color: string;
  height?: number;
}

export function Sparkline({ data, color, height = 32 }: SparklineProps) {
  const chartData = data.map((v, i) => ({ i, v }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
        <Bar dataKey="v" fill={color} fillOpacity={0.6} radius={[1, 1, 0, 0]} isAnimationActive={false} />
      </BarChart>
    </ResponsiveContainer>
  );
}
