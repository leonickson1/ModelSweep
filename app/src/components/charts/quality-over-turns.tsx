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

interface ModelTurnData {
    name: string;
    color: string;
    perTurnScores: number[];
}

interface QualityOverTurnsProps {
    models: ModelTurnData[];
    height?: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
    if (!active || !payload || payload.length === 0) return null;

    return (
        <div className="bg-zinc-950 border border-white/10 rounded-lg px-3 py-2 shadow-xl">
            <p className="text-zinc-500 text-[10px] font-mono uppercase tracking-wider mb-1">
                {label}
            </p>
            {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
            {payload.map((entry: any) => (
                <div
                    key={entry.dataKey}
                    className="flex items-center gap-2 text-xs font-mono"
                >
                    <span
                        className="inline-block w-2 h-2 rounded-full"
                        style={{ backgroundColor: entry.color }}
                    />
                    <span className="text-zinc-300">{entry.name}</span>
                    <span className="text-zinc-100 ml-auto tabular-nums">
                        {typeof entry.value === "number"
                            ? entry.value.toFixed(1)
                            : entry.value}
                    </span>
                </div>
            ))}
        </div>
    );
}

export function QualityOverTurns({
    models,
    height = 300,
}: QualityOverTurnsProps) {
    if (models.length === 0) {
        return (
            <div
                className="flex items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-widest"
                style={{ height }}
            >
                No per-turn data available
            </div>
        );
    }

    // Find max turn count across all models
    const maxTurns = Math.max(...models.map((m) => m.perTurnScores.length));

    if (maxTurns === 0) {
        return (
            <div
                className="flex items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-widest"
                style={{ height }}
            >
                No turn scores recorded
            </div>
        );
    }

    // Transform data for recharts: one row per turn
    const data = Array.from({ length: maxTurns }, (_, i) => {
        const point: Record<string, string | number> = {
            turn: `T${i + 1}`,
        };
        for (const model of models) {
            if (i < model.perTurnScores.length) {
                point[model.name] = model.perTurnScores[i];
            }
        }
        return point;
    });

    return (
        <ResponsiveContainer width="100%" height={height}>
            <LineChart
                data={data}
                margin={{ top: 8, right: 24, bottom: 8, left: 0 }}
            >
                <CartesianGrid
                    vertical={false}
                    stroke="rgba(255,255,255,0.05)"
                />
                <XAxis
                    dataKey="turn"
                    tick={{
                        fill: "#71717a",
                        fontSize: 10,
                        fontFamily: "monospace",
                    }}
                    axisLine={false}
                    tickLine={false}
                />
                <YAxis
                    domain={[0, 5]}
                    ticks={[0, 1, 2, 3, 4, 5]}
                    tick={{
                        fill: "#71717a",
                        fontSize: 10,
                        fontFamily: "monospace",
                    }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                />
                <Tooltip content={<CustomTooltip />} />
                {models.map((model) => (
                    <Line
                        key={model.name}
                        dataKey={model.name}
                        name={model.name}
                        stroke={model.color}
                        strokeWidth={2}
                        dot={{
                            fill: model.color,
                            r: 3,
                            strokeWidth: 0,
                        }}
                        connectNulls
                        isAnimationActive
                        animationDuration={600}
                    />
                ))}
            </LineChart>
        </ResponsiveContainer>
    );
}
