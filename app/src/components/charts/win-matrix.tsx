"use client";

import { motion } from "framer-motion";
import { getModelColor } from "@/lib/model-colors";

interface WinMatrixProps {
    models: string[];
    /** winRates[modelA][modelB] = A's win rate against B (0–1) */
    winRates: Record<string, Record<string, number>>;
}

export function WinMatrix({ models, winRates }: WinMatrixProps) {
    if (models.length < 2) return null;

    return (
        <div className="w-full overflow-x-auto">
            <div
                className="grid gap-[1px] bg-zinc-800/40 min-w-fit"
                style={{ gridTemplateColumns: `140px repeat(${models.length}, 1fr)` }}
            >
                {/* Header row */}
                <div className="bg-[#050505] px-3 py-3">
                    <span className="text-zinc-600 font-mono text-[10px] uppercase tracking-widest">vs</span>
                </div>
                {models.map((name) => {
                    const color = getModelColor(name);
                    return (
                        <div key={`h-${name}`} className="bg-[#050505] px-2 py-3 text-center">
                            <span
                                className="font-mono text-[10px] uppercase tracking-wider truncate block"
                                style={{ color: color.hex }}
                            >
                                {name.split(":")[0]}
                            </span>
                        </div>
                    );
                })}

                {/* Data rows */}
                {models.map((rowModel, ri) => {
                    const rowColor = getModelColor(rowModel);
                    return (
                        <div
                            key={rowModel}
                            className="contents"
                        >
                            {/* Row label */}
                            <div className="bg-[#030303] px-3 py-4 flex items-center gap-2">
                                <span
                                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                                    style={{ background: rowColor.hex }}
                                />
                                <span className="text-zinc-300 font-mono text-xs truncate">{rowModel.split(":")[0]}</span>
                            </div>

                            {/* Win rate cells */}
                            {models.map((colModel, ci) => {
                                if (ri === ci) {
                                    return (
                                        <div key={`${rowModel}-${colModel}`} className="bg-[#050505] px-3 py-4 flex items-center justify-center">
                                            <span className="text-zinc-700 font-mono text-xs">—</span>
                                        </div>
                                    );
                                }

                                const rate = winRates[rowModel]?.[colModel] ?? 0.5;
                                const pct = Math.round(rate * 100);
                                const isWinning = rate > 0.55;
                                const isLosing = rate < 0.45;

                                return (
                                    <motion.div
                                        key={`${rowModel}-${colModel}`}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        transition={{ delay: (ri * models.length + ci) * 0.02 }}
                                        className="bg-[#030303] px-3 py-4 flex items-center justify-center relative"
                                    >
                                        {/* Background heat */}
                                        <div
                                            className="absolute inset-0"
                                            style={{
                                                background: isWinning
                                                    ? `rgba(0,255,102,${(rate - 0.5) * 0.4})`
                                                    : isLosing
                                                        ? `rgba(239,68,68,${(0.5 - rate) * 0.4})`
                                                        : "transparent",
                                            }}
                                        />
                                        <span
                                            className="relative z-10 font-mono text-sm font-medium tabular-nums"
                                            style={{
                                                color: isWinning ? "#00FF66" : isLosing ? "#ef4444" : "#71717a",
                                            }}
                                        >
                                            {pct}%
                                        </span>
                                    </motion.div>
                                );
                            })}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
