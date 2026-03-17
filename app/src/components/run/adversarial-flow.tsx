"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./flow-nodes";

// ─── Types ───────────────────────────────────────────────────────────────────

interface BreachInfo {
  type: string;
  severity: "low" | "medium" | "high" | "critical";
  evidence: string;
}

interface AdversarialTurn {
  attackMessage: string;
  modelResponse: string;
  breach?: BreachInfo;
  status: "pending" | "running" | "done" | "error";
}

interface AdversarialScenario {
  scenarioId: string;
  scenarioName: string;
  turns: AdversarialTurn[];
  robustnessScore?: number;
  status: "pending" | "running" | "done" | "error";
}

interface AdversarialFlowProps {
  modelName: string;
  scenarios: AdversarialScenario[];
  currentScenarioIndex: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function AdversarialFlow({
  modelName,
  scenarios,
  currentScenarioIndex,
}: AdversarialFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 0;

    for (let si = 0; si < scenarios.length; si++) {
      const scenario = scenarios[si];

      // Skip far-future pending scenarios
      if (scenario.status === "pending" && si > currentScenarioIndex + 1) continue;

      const isActiveScenario = si === currentScenarioIndex;

      // Scenario header
      const scenarioHeaderId = `scenario-header-${si}`;
      nodes.push({
        id: scenarioHeaderId,
        type: "turnDivider",
        position: { x: 80, y },
        data: { turn: si, contextUsage: undefined },
      });
      y += 50;

      let prevNodeId = scenarioHeaderId;

      for (let ti = 0; ti < scenario.turns.length; ti++) {
        const turn = scenario.turns[ti];
        const isActiveTurn = isActiveScenario && turn.status === "running";
        const hasBreach = turn.status === "done" && turn.breach !== undefined;

        // Edge color: red for breach turns, blue for active, default otherwise
        const edgeColor = hasBreach
          ? "#ef4444"
          : isActiveTurn
          ? "#3b82f6"
          : "#27272a";

        // ── Attacker Message Node ──
        const userNodeId = `attacker-${si}-${ti}`;
        nodes.push({
          id: userNodeId,
          type: "userMessage",
          position: { x: 0, y },
          data: {
            message: turn.attackMessage,
            label: "Attacker",
            turnNumber: ti,
          },
        });

        edges.push({
          id: `e-${prevNodeId}-${userNodeId}`,
          source: prevNodeId,
          target: userNodeId,
          animated: isActiveTurn,
          style: { stroke: edgeColor },
        });

        // ── Defender Response Node ──
        const modelNodeId = `defender-${si}-${ti}`;
        nodes.push({
          id: modelNodeId,
          type: "modelResponse",
          position: { x: 0, y: y + 100 },
          data: {
            modelName,
            response: turn.modelResponse,
            status:
              turn.status === "running"
                ? "running"
                : turn.status === "done"
                ? "done"
                : "pending",
          },
        });

        edges.push({
          id: `e-${userNodeId}-${modelNodeId}`,
          source: userNodeId,
          target: modelNodeId,
          animated: isActiveTurn,
          style: { stroke: edgeColor },
        });

        // ── Breach Alert Node (if breach detected) ──
        if (hasBreach && turn.breach) {
          const breachNodeId = `breach-${si}-${ti}`;
          nodes.push({
            id: breachNodeId,
            type: "breachAlert",
            position: { x: 320, y: y + 90 },
            data: {
              type: turn.breach.type,
              severity: turn.breach.severity,
              evidence: turn.breach.evidence,
              turn: ti,
            },
          });

          edges.push({
            id: `e-${modelNodeId}-${breachNodeId}`,
            source: modelNodeId,
            target: breachNodeId,
            animated: true,
            style: { stroke: "#ef4444" },
          });
        }

        prevNodeId = modelNodeId;
        y += 180;
      }

      // ── Robustness Score at end of scenario ──
      if (scenario.status === "done" && scenario.robustnessScore !== undefined) {
        const scoreNodeId = `robustness-${si}`;
        nodes.push({
          id: scoreNodeId,
          type: "scoreNode",
          position: { x: 0, y },
          data: { score: scenario.robustnessScore, label: "% robust" },
        });

        edges.push({
          id: `e-${prevNodeId}-${scoreNodeId}`,
          source: prevNodeId,
          target: scoreNodeId,
          style: {
            stroke:
              scenario.robustnessScore >= 80
                ? "#10b981"
                : scenario.robustnessScore >= 50
                ? "#eab308"
                : "#ef4444",
          },
        });

        y += 80;
      }

      y += 40;
    }

    return { nodes, edges };
  }, [scenarios, currentScenarioIndex, modelName]);

  return (
    <div className="w-full h-[500px] bg-zinc-950/50 rounded-xl border border-white/[0.06] overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.2}
        maxZoom={1.5}
        defaultViewport={{ x: 20, y: 20, zoom: 0.85 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background color="transparent" gap={20} size={0} />
        <Controls
          showInteractive={false}
          className="!bg-white/5 !border-white/[0.06] !rounded-lg [&>button]:!bg-transparent [&>button]:!border-white/[0.06] [&>button]:!text-zinc-400"
        />
      </ReactFlow>
    </div>
  );
}
