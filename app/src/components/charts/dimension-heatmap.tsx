"use client";

import { motion } from "framer-motion";
import { getModelColor } from "@/lib/model-colors";

interface DimensionHeatmapProps {
    models: Array<{
        name: string;
        dimensions: {
            relevance: number;
            depth: number;
            coherence: number;
            compliance: number;
            language: number;
        };
    }>;
}

const DIMENSIONS = [
    { key: "relevance", label: "Relevance" },
    { key: "depth", label: "Depth" },
    { key: "coherence", label: "Coherence" },
    { key: "compliance", label: "Compliance" },
    { key: "language", label: "Language" },
];

function getHeatColor(value: number, modelColor: string): string {
    // Scale from dim to bright based on 0-5 score
    const opacity = Math.max(0.08, (value / 5) * 0.8);
    return modelColor.replace(")", `, ${opacity})`).replace("rgb", "rgba");
}

function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) return "rgb(0,255,102)";
    return `rgb(${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)})`;
}

export function DimensionHeatmap({ models }: DimensionHeatmapProps) {
    if (models.length === 0) return null;

    return (
        <div className="w-full">
            {/* Header row */}
            <div className="grid gap-[1px] bg-zinc-800/40" style={{ gridTemplateColumns: `180px repeat(${DIMENSIONS.length}, 1fr)` }}>
                <div className="bg-[#050505] px-4 py-3">
                    <span className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest">Model</span>
                </div>
                {DIMENSIONS.map((dim) => (
                    <div key={dim.key} className="bg-[#050505] px-3 py-3 text-center">
                        <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">{dim.label}</span>
                    </div>
                ))}
            </div>

            {/* Data rows */}
            {models.map((model, mi) => {
                const color = getModelColor(model.name);
                const rgbColor = hexToRgb(color.hex);

                return (
                    <motion.div
                        key={model.name}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: mi * 0.05 }}
                        className="grid gap-[1px] bg-zinc-800/40"
                        style={{ gridTemplateColumns: `180px repeat(${DIMENSIONS.length}, 1fr)` }}
                    >
                        {/* Model name */}
                        <div className="bg-[#030303] px-4 py-4 flex items-center gap-2">
                            <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ background: color.hex, boxShadow: `0 0 8px ${color.hex}60` }}
                            />
                            <span className="text-zinc-300 font-mono text-xs truncate">{model.name}</span>
                        </div>

                        {/* Dimension cells */}
                        {DIMENSIONS.map((dim) => {
                            const value = model.dimensions[dim.key as keyof typeof model.dimensions] ?? 0;
                            const cellBg = getHeatColor(value, rgbColor);

                            return (
                                <div
                                    key={dim.key}
                                    className="bg-[#030303] px-3 py-4 flex flex-col items-center justify-center relative group"
                                >
                                    {/* Heat overlay */}
                                    <div
                                        className="absolute inset-0 transition-opacity"
                                        style={{ background: cellBg }}
                                    />
                                    {/* Score bar */}
                                    <div className="relative z-10 w-full flex flex-col items-center gap-1.5">
                                        <span
                                            className="text-lg font-mono font-medium tabular-nums"
                                            style={{ color: value >= 3.5 ? color.hex : value >= 2 ? "#a1a1aa" : "#52525b" }}
                                        >
                                            {value.toFixed(1)}
                                        </span>
                                        {/* Mini bar */}
                                        <div className="w-full h-1 bg-zinc-800/60 rounded-full overflow-hidden">
                                            <motion.div
                                                initial={{ width: 0 }}
                                                animate={{ width: `${(value / 5) * 100}%` }}
                                                transition={{ duration: 0.6, delay: mi * 0.05 + 0.2 }}
                                                className="h-full rounded-full"
                                                style={{ background: color.hex }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </motion.div>
                );
            })}
        </div>
    );
}
