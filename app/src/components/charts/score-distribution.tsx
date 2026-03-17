"use client";

import { motion } from "framer-motion";
import { getModelColor } from "@/lib/model-colors";

interface ScoreDistributionProps {
    models: Array<{
        name: string;
        scores: number[];        // Per-prompt composite scores
        categories?: string[];   // Category per prompt (for coloring)
    }>;
}

const CATEGORY_COLORS: Record<string, string> = {
    coding: "#3b82f6",
    creative: "#a855f7",
    reasoning: "#f59e0b",
    instruction: "#00FF66",
    custom: "#71717a",
};

export function ScoreDistribution({ models }: ScoreDistributionProps) {
    if (models.length === 0) return null;

    const allScores = models.flatMap((m) => m.scores);
    const globalMin = Math.min(...allScores, 0);
    const globalMax = Math.max(...allScores, 100);

    return (
        <div className="w-full space-y-4">
            {models.map((model, mi) => {
                const color = getModelColor(model.name);
                const mean = model.scores.length > 0
                    ? Math.round(model.scores.reduce((a, b) => a + b, 0) / model.scores.length)
                    : 0;

                // IQR calculation
                const sorted = [...model.scores].sort((a, b) => a - b);
                const q1 = sorted[Math.floor(sorted.length * 0.25)] ?? 0;
                const q3 = sorted[Math.floor(sorted.length * 0.75)] ?? 100;

                return (
                    <motion.div
                        key={model.name}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: mi * 0.1 }}
                        className="bg-[#030303] border border-zinc-800/40 p-4"
                    >
                        {/* Model label + stats */}
                        <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-2">
                                <span
                                    className="w-2 h-2 rounded-full flex-shrink-0"
                                    style={{ background: color.hex, boxShadow: `0 0 8px ${color.hex}60` }}
                                />
                                <span className="text-zinc-300 font-mono text-xs uppercase tracking-wider">{model.name}</span>
                            </div>
                            <div className="flex items-center gap-4 text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
                                <span>Mean: <span style={{ color: color.hex }}>{mean}%</span></span>
                                <span>IQR: {q1}–{q3}</span>
                                <span>n={model.scores.length}</span>
                            </div>
                        </div>

                        {/* Strip plot */}
                        <div className="relative h-10 bg-zinc-900/50 border border-zinc-800/40">
                            {/* IQR box */}
                            <div
                                className="absolute top-1 bottom-1 opacity-20 rounded-sm"
                                style={{
                                    left: `${((q1 - globalMin) / (globalMax - globalMin)) * 100}%`,
                                    width: `${((q3 - q1) / (globalMax - globalMin)) * 100}%`,
                                    background: color.hex,
                                }}
                            />

                            {/* Mean line */}
                            <div
                                className="absolute top-0 bottom-0 w-px"
                                style={{
                                    left: `${((mean - globalMin) / (globalMax - globalMin)) * 100}%`,
                                    background: color.hex,
                                    boxShadow: `0 0 6px ${color.hex}80`,
                                }}
                            />

                            {/* Individual score dots */}
                            {model.scores.map((score, si) => {
                                const x = ((score - globalMin) / (globalMax - globalMin)) * 100;
                                // Jitter y position to avoid overlap
                                const y = 20 + (Math.sin(si * 2.3) * 12);
                                const catColor = model.categories?.[si]
                                    ? CATEGORY_COLORS[model.categories[si]] || color.hex
                                    : color.hex;

                                return (
                                    <motion.div
                                        key={si}
                                        initial={{ scale: 0, opacity: 0 }}
                                        animate={{ scale: 1, opacity: 0.9 }}
                                        transition={{ delay: mi * 0.1 + si * 0.02 }}
                                        className="absolute w-2 h-2 rounded-full"
                                        style={{
                                            left: `${x}%`,
                                            top: `${y}%`,
                                            transform: "translate(-50%, -50%)",
                                            background: catColor,
                                            boxShadow: `0 0 4px ${catColor}60`,
                                        }}
                                        title={`Score: ${score}${model.categories?.[si] ? ` (${model.categories[si]})` : ""}`}
                                    />
                                );
                            })}
                        </div>

                        {/* Scale */}
                        <div className="flex justify-between mt-1">
                            <span className="text-zinc-700 font-mono text-[9px]">0</span>
                            <span className="text-zinc-700 font-mono text-[9px]">50</span>
                            <span className="text-zinc-700 font-mono text-[9px]">100</span>
                        </div>
                    </motion.div>
                );
            })}
        </div>
    );
}
