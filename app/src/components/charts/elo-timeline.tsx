"use client";

import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
} from "recharts";
import { getModelColor } from "@/lib/model-colors";

interface EloTimelineProps {
    /** Each entry = a run snapshot: { date, ratings: { modelName: rating } } */
    snapshots: Array<{
        date: string;
        ratings: Record<string, number>;
    }>;
    models: string[];
    height?: number;
}

export function EloTimeline({ snapshots, models, height = 300 }: EloTimelineProps) {
    if (snapshots.length === 0) {
        return (
            <div className="flex items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-widest" style={{ height }}>
                No Elo Data — Run a multi-model test to generate rankings
            </div>
        );
    }

    // Transform data for recharts
    const data = snapshots.map((s) => {
        const point: Record<string, string | number> = {
            date: new Date(s.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        };
        for (const name of models) {
            point[name] = Math.round(s.ratings[name] ?? 1500);
        }
        return point;
    });

    // Compute y-axis domain
    const allRatings = snapshots.flatMap((s) => models.map((m) => s.ratings[m] ?? 1500));
    const minRating = Math.floor((Math.min(...allRatings) - 50) / 50) * 50;
    const maxRating = Math.ceil((Math.max(...allRatings) + 50) / 50) * 50;

    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart data={data} margin={{ top: 8, right: 24, bottom: 8, left: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(0,255,102,0.06)" />
                <XAxis
                    dataKey="date"
                    tick={{ fill: "#52525b", fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    domain={[minRating, maxRating]}
                    tick={{ fill: "#52525b", fontSize: 10, fontFamily: "monospace" }}
                    axisLine={false}
                    tickLine={false}
                    width={50}
                />
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
                {/* Reference line at 1500 */}
                <Line
                    dataKey={() => 1500}
                    stroke="#00FF66"
                    strokeOpacity={0.15}
                    strokeDasharray="4 4"
                    dot={false}
                    isAnimationActive={false}
                    name="Baseline"
                />
                {models.map((name, i) => {
                    const color = i === 0 ? "#00FF66" : getModelColor(name).hex;
                    return (
                        <Line
                            key={name}
                            dataKey={name}
                            stroke={color}
                            strokeWidth={2}
                            dot={{ fill: color, r: 3, strokeWidth: 0 }}
                            isAnimationActive
                            animationDuration={800}
                        />
                    );
                })}
            </LineChart>
        </ResponsiveContainer>
    );
}
