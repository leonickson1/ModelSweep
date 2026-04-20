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

interface ConversationTurn {
  userMessage: string;
  modelResponse: string;
  score?: number;
  tokensPerSec?: number;
  ttft?: number;
  contextUsage?: number;
  status: "pending" | "running" | "done" | "error";
}

interface ConversationScenario {
  scenarioId: string;
  scenarioName: string;
  turns: ConversationTurn[];
  overallScore?: number;
  status: "pending" | "running" | "done" | "error";
}

interface ConversationFlowProps {
  modelName: string;
  scenarios: ConversationScenario[];
  currentScenarioIndex: number;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConversationFlow({
  modelName,
  scenarios,
  currentScenarioIndex,
}: ConversationFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 0;

    for (let si = 0; si < scenarios.length; si++) {
      const scenario = scenarios[si];

      // Skip far-future pending scenarios
      if (scenario.status === "pending" && si > currentScenarioIndex + 1) continue;

      const isActiveScenario = si === currentScenarioIndex;

      // Scenario label node (reuse turnDivider as a section header)
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
        const isActiveTurn =
          isActiveScenario &&
          turn.status === "running";

        // ── Turn Divider (between turns, not before the first) ──
        if (ti > 0) {
          const dividerId = `divider-${si}-${ti}`;
          nodes.push({
            id: dividerId,
            type: "turnDivider",
            position: { x: 80, y },
            data: {
              turn: ti,
              contextUsage: turn.contextUsage,
            },
          });

          edges.push({
            id: `e-${prevNodeId}-${dividerId}`,
            source: prevNodeId,
            target: dividerId,
            style: { stroke: "#27272a" },
          });

          prevNodeId = dividerId;
          y += 60;
        }

        // ── User Message Node ──
        const userNodeId = `user-${si}-${ti}`;
        nodes.push({
          id: userNodeId,
          type: "userMessage",
          position: { x: 0, y },
          data: {
            message: turn.userMessage,
            label: "User",
            turnNumber: ti,
          },
        });

        edges.push({
          id: `e-${prevNodeId}-${userNodeId}`,
          source: prevNodeId,
          target: userNodeId,
          animated: isActiveTurn,
          style: { stroke: isActiveTurn ? "#3b82f6" : "#27272a" },
        });

        // ── Model Response Node ──
        const modelNodeId = `model-${si}-${ti}`;
        nodes.push({
          id: modelNodeId,
          type: "modelResponse",
          position: { x: 0, y: y + 100 },
          data: {
            modelName,
            response: turn.modelResponse,
            score: turn.status === "done" ? turn.score : undefined,
            tokensPerSec: turn.tokensPerSec,
            ttft: turn.ttft,
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
          style: { stroke: isActiveTurn ? "#3b82f6" : "#27272a" },
        });

        // ── Score Badge after response ──
        if (turn.status === "done" && turn.score !== undefined) {
          const scoreNodeId = `score-${si}-${ti}`;
          nodes.push({
            id: scoreNodeId,
            type: "scoreNode",
            position: { x: 300, y: y + 110 },
            data: { score: turn.score, label: "%" },
          });

          edges.push({
            id: `e-${modelNodeId}-${scoreNodeId}`,
            source: modelNodeId,
            target: scoreNodeId,
            style: {
              stroke:
                turn.score >= 80
                  ? "#10b981"
                  : turn.score >= 50
                  ? "#eab308"
                  : "#ef4444",
            },
          });
        }

        prevNodeId = modelNodeId;
        y += 180;
      }

      // ── Overall score at end of scenario ──
      if (scenario.status === "done" && scenario.overallScore !== undefined) {
        const overallScoreId = `overall-${si}`;
        nodes.push({
          id: overallScoreId,
          type: "scoreNode",
          position: { x: 0, y },
          data: { score: scenario.overallScore, label: "overall" },
        });

        edges.push({
          id: `e-${prevNodeId}-${overallScoreId}`,
          source: prevNodeId,
          target: overallScoreId,
          style: {
            stroke:
              scenario.overallScore >= 80
                ? "#10b981"
                : scenario.overallScore >= 50
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
    <div className="w-full h-[700px] bg-zinc-950/50 rounded-xl border border-white/[0.06] overflow-hidden relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        proOptions={{ hideAttribution: true }}
        minZoom={0.15}
        maxZoom={2}
        defaultViewport={{ x: 20, y: 20, zoom: 0.7 }}
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
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
