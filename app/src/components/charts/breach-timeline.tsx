"use client";

type Severity = "low" | "medium" | "critical";

interface Breach {
    turn: number;
    severity: Severity;
}

interface ModelBreachData {
    name: string;
    color: string;
    maxTurns: number;
    breaches: Breach[];
}

interface BreachTimelineProps {
    models: ModelBreachData[];
}

const SEVERITY_COLORS: Record<Severity, string> = {
    low: "#facc15",       // yellow-400
    medium: "#f97316",    // orange-500
    critical: "#ef4444",  // red-500
};

function TriangleMarker({
    cx,
    cy,
    severity,
}: {
    cx: number;
    cy: number;
    severity: Severity;
}) {
    const size = severity === "critical" ? 7 : 5;
    const color = SEVERITY_COLORS[severity];
    return (
        <polygon
            points={`${cx},${cy - size} ${cx - size},${cy + size} ${cx + size},${cy + size}`}
            fill={color}
            stroke={color}
            strokeWidth={0.5}
        />
    );
}

function SurvivedDot({ cx, cy }: { cx: number; cy: number }) {
    return <circle cx={cx} cy={cy} r={3} fill="#22c55e" />;
}

export function BreachTimeline({ models }: BreachTimelineProps) {
    if (models.length === 0) {
        return (
            <div className="flex items-center justify-center text-zinc-600 font-mono text-xs uppercase tracking-widest h-32">
                No adversarial data available
            </div>
        );
    }

    const ROW_HEIGHT = 40;
    const LABEL_WIDTH = 140;
    const BADGE_WIDTH = 100;
    const PADDING_X = 16;
    const svgWidth = 600;
    const barStart = LABEL_WIDTH;
    const barEnd = svgWidth - BADGE_WIDTH - PADDING_X;
    const barLength = barEnd - barStart;
    const svgHeight = models.length * ROW_HEIGHT + 24;

    // Global max turns for uniform scaling
    const globalMaxTurns = Math.max(...models.map((m) => m.maxTurns), 1);

    function turnToX(turn: number): number {
        return barStart + (turn / globalMaxTurns) * barLength;
    }

    return (
        <div className="w-full overflow-x-auto">
            <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full"
                style={{ minWidth: 480 }}
            >
                {models.map((model, rowIndex) => {
                    const y = rowIndex * ROW_HEIGHT + 20;
                    const breachTurns = new Set(
                        model.breaches.map((b) => b.turn)
                    );
                    const hasCritical = model.breaches.some(
                        (b) => b.severity === "critical"
                    );
                    const breached = model.breaches.length > 0;

                    return (
                        <g key={model.name}>
                            {/* Model name label */}
                            <text
                                x={LABEL_WIDTH - 12}
                                y={y + 4}
                                textAnchor="end"
                                className="text-[11px] font-mono"
                                fill="#a1a1aa"
                            >
                                {model.name.length > 16
                                    ? model.name.slice(0, 15) + "\u2026"
                                    : model.name}
                            </text>

                            {/* Track line */}
                            <line
                                x1={barStart}
                                y1={y}
                                x2={turnToX(model.maxTurns)}
                                y2={y}
                                stroke={model.color}
                                strokeWidth={2}
                                strokeOpacity={0.3}
                            />

                            {/* Turn markers */}
                            {Array.from(
                                { length: model.maxTurns },
                                (_, t) => {
                                    const turn = t + 1;
                                    const cx = turnToX(turn);
                                    const breach = model.breaches.find(
                                        (b) => b.turn === turn
                                    );

                                    if (breach) {
                                        return (
                                            <TriangleMarker
                                                key={turn}
                                                cx={cx}
                                                cy={y}
                                                severity={breach.severity}
                                            />
                                        );
                                    }

                                    if (!breachTurns.has(turn)) {
                                        return (
                                            <SurvivedDot
                                                key={turn}
                                                cx={cx}
                                                cy={y}
                                            />
                                        );
                                    }

                                    return null;
                                }
                            )}

                            {/* Badge on right */}
                            <g
                                transform={`translate(${barEnd + 12}, ${y - 8})`}
                            >
                                <rect
                                    width={76}
                                    height={16}
                                    rx={4}
                                    fill={
                                        breached
                                            ? hasCritical
                                                ? "rgba(239,68,68,0.15)"
                                                : "rgba(249,115,22,0.15)"
                                            : "rgba(34,197,94,0.15)"
                                    }
                                />
                                <text
                                    x={38}
                                    y={11}
                                    textAnchor="middle"
                                    className="text-[9px] font-mono uppercase tracking-wider"
                                    fill={
                                        breached
                                            ? hasCritical
                                                ? "#ef4444"
                                                : "#f97316"
                                            : "#22c55e"
                                    }
                                >
                                    {breached ? "BREACHED" : "SURVIVED"}
                                </text>
                            </g>
                        </g>
                    );
                })}

                {/* Legend */}
                <g transform={`translate(${barStart}, ${svgHeight - 8})`}>
                    <circle cx={0} cy={0} r={3} fill="#22c55e" />
                    <text x={8} y={3} fill="#71717a" className="text-[9px] font-mono">
                        Survived
                    </text>
                    <polygon
                        points="60,0 55,6 65,6"
                        fill="#f97316"
                    />
                    <text x={70} y={3} fill="#71717a" className="text-[9px] font-mono">
                        Medium
                    </text>
                    <polygon
                        points="120,0 114,7 126,7"
                        fill="#ef4444"
                    />
                    <text x={131} y={3} fill="#71717a" className="text-[9px] font-mono">
                        Critical
                    </text>
                </g>
            </svg>
        </div>
    );
}
