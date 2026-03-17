"use client";

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { nodeTypes } from "./flow-nodes";

interface ToolCallData {
  functionName: string;
  arguments: Record<string, unknown>;
}

interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  userMessage: string;
  status: "pending" | "running" | "done" | "error";
  overallScore: number;
  textResponse: string;
  actualToolCalls: ToolCallData[];
}

interface ToolFlowProps {
  modelName: string;
  scenarios: ScenarioResult[];
  currentScenarioIndex: number;
}

export default function ToolFlow({ modelName, scenarios, currentScenarioIndex }: ToolFlowProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    let y = 0;

    for (let si = 0; si < scenarios.length; si++) {
      const scenario = scenarios[si];
      if (scenario.status === "pending" && si > currentScenarioIndex + 1) continue;

      const baseY = y;
      const userNodeId = `user-${si}`;
      const modelNodeId = `model-${si}`;

      // User message node
      nodes.push({
        id: userNodeId,
        type: "userMessage",
        position: { x: 0, y: baseY },
        data: { message: scenario.userMessage || scenario.scenarioName, label: `Scenario ${si + 1}` },
      });

      // Model response / thinking node
      nodes.push({
        id: modelNodeId,
        type: "modelResponse",
        position: { x: 340, y: baseY },
        data: {
          modelName,
          response: scenario.textResponse,
          score: scenario.status === "done" ? scenario.overallScore : undefined,
          status: scenario.status === "running" ? "running" : scenario.status === "done" ? "done" : "pending",
        },
      });

      edges.push({
        id: `e-user-model-${si}`,
        source: userNodeId,
        target: modelNodeId,
        animated: scenario.status === "running",
        style: { stroke: scenario.status === "running" ? "#3b82f6" : "#27272a" },
      });

      // Tool call nodes
      if (scenario.actualToolCalls.length > 0) {
        let toolX = 680;
        let prevId = modelNodeId;

        for (let ti = 0; ti < scenario.actualToolCalls.length; ti++) {
          const tc = scenario.actualToolCalls[ti];
          const toolNodeId = `tool-${si}-${ti}`;

          nodes.push({
            id: toolNodeId,
            type: "toolCall",
            position: { x: toolX, y: baseY },
            data: {
              functionName: tc.functionName,
              arguments: tc.arguments,
              correct: scenario.overallScore >= 60,
            },
          });

          edges.push({
            id: `e-${prevId}-${toolNodeId}`,
            source: prevId,
            target: toolNodeId,
            style: { stroke: "#3b82f6" },
          });

          prevId = toolNodeId;
          toolX += 300;
        }

        // Score node at end
        if (scenario.status === "done") {
          const scoreNodeId = `score-${si}`;
          nodes.push({
            id: scoreNodeId,
            type: "scoreNode",
            position: { x: toolX, y: baseY + 10 },
            data: { score: scenario.overallScore, label: "%" },
          });
          edges.push({
            id: `e-${prevId}-score-${si}`,
            source: prevId,
            target: scoreNodeId,
            style: { stroke: scenario.overallScore >= 60 ? "#10b981" : "#ef4444" },
          });
        }
      } else if (scenario.status === "done") {
        // No tool calls — show score directly
        const scoreNodeId = `score-${si}`;
        nodes.push({
          id: scoreNodeId,
          type: "scoreNode",
          position: { x: 680, y: baseY + 10 },
          data: { score: scenario.overallScore, label: "%" },
        });
        edges.push({
          id: `e-model-score-${si}`,
          source: modelNodeId,
          target: scoreNodeId,
          style: { stroke: scenario.overallScore >= 60 ? "#10b981" : "#ef4444" },
        });
      }

      y += 120;
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
        minZoom={0.3}
        maxZoom={1.5}
        defaultViewport={{ x: 20, y: 20, zoom: 0.85 }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background color="#18181b" gap={20} size={1} />
      </ReactFlow>
    </div>
  );
}
