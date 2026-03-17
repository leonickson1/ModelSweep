"use client";

import { memo, useMemo } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Node,
  type Edge,
  type NodeProps,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils";
import { getModelColor } from "@/lib/model-colors";
import { Play, CheckCircle2, Gauge, Zap, Trophy } from "lucide-react";

// ─── Custom Nodes for Pipeline Replay ─────────────────────────────────────────

interface StartNodeData {
  suiteName: string;
  promptCount: number;
  label?: string;
}

const StartNode = memo(function StartNode({ data }: NodeProps & { data: StartNodeData }) {
  return (
    <div className="bg-[#00FF66]/10 backdrop-blur-md border border-[#00FF66]/20 rounded-2xl px-5 py-3.5 shadow-lg shadow-[#00FF66]/5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-full bg-[#00FF66]/20 flex items-center justify-center">
          <Play size={14} className="text-[#00FF66] ml-0.5" />
        </div>
        <div>
          <p className="text-zinc-200 text-sm font-semibold tracking-tight">{data.suiteName}</p>
          <p className="text-zinc-500 text-[10px] font-mono">{data.promptCount} prompts</p>
        </div>
      </div>
      <Handle type="source" position={Position.Right} className="!bg-[#00FF66] !w-2.5 !h-2.5 !border-0" />
    </div>
  );
});

interface ModelBlockData {
  modelName: string;
  family: string;
  score: number;
  tokensPerSec: number;
  duration: number;
  promptCount: number;
  rank: number;
  label?: string;
}

const ModelBlockNode = memo(function ModelBlockNode({ data }: NodeProps & { data: ModelBlockData }) {
  const color = getModelColor(data.family);
  const hex = color?.hex || "#a1a1aa";
  const isWinner = data.rank === 1;

  return (
    <div
      className={cn(
        "backdrop-blur-md border rounded-2xl px-5 py-4 min-w-[220px] shadow-lg transition-all",
        isWinner ? "border-[#00FF66]/30 bg-[#00FF66]/[0.04]" : "border-white/[0.06] bg-white/5"
      )}
      style={isWinner ? { boxShadow: `0 0 40px ${hex}10` } : undefined}
    >
      <Handle type="target" position={Position.Left} className="!w-2.5 !h-2.5 !border-0" style={{ background: hex }} />
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-3 h-3 rounded-full" style={{ background: hex, boxShadow: `0 0 8px ${hex}60` }} />
        <span className="text-zinc-200 text-sm font-semibold tracking-tight truncate max-w-[160px]">{data.modelName}</span>
        {isWinner && <Trophy size={12} className="text-[#00FF66] ml-auto" />}
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider flex items-center gap-1">
            <Gauge size={9} />Score
          </span>
          <span className={cn(
            "text-sm font-mono font-semibold",
            data.score >= 80 ? "text-emerald-400" : data.score >= 50 ? "text-yellow-400" : "text-red-400"
          )}>
            {data.score}
          </span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider flex items-center gap-1">
            <Zap size={9} />Speed
          </span>
          <span className="text-zinc-400 text-xs font-mono">{data.tokensPerSec.toFixed(1)} t/s</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Prompts</span>
          <span className="text-zinc-400 text-xs font-mono">{data.promptCount}</span>
        </div>
      </div>
      {/* Score bar */}
      <div className="mt-3 h-1.5 bg-white/5 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all"
          style={{
            width: `${data.score}%`,
            background: data.score >= 80 ? "#10b981" : data.score >= 50 ? "#eab308" : "#ef4444",
          }}
        />
      </div>
      <Handle type="source" position={Position.Right} className="!w-2.5 !h-2.5 !border-0" style={{ background: hex }} />
    </div>
  );
});

interface FinishNodeData {
  winnerName: string;
  winnerScore: number;
  totalModels: number;
  label?: string;
}

const FinishNode = memo(function FinishNode({ data }: NodeProps & { data: FinishNodeData }) {
  return (
    <div className="bg-[#00FF66]/10 backdrop-blur-md border border-[#00FF66]/20 rounded-2xl px-5 py-4 shadow-lg shadow-[#00FF66]/5">
      <Handle type="target" position={Position.Left} className="!bg-[#00FF66] !w-2.5 !h-2.5 !border-0" />
      <div className="flex items-center gap-2.5 mb-2">
        <div className="w-8 h-8 rounded-full bg-[#00FF66]/20 flex items-center justify-center">
          <CheckCircle2 size={14} className="text-[#00FF66]" />
        </div>
        <div>
          <p className="text-zinc-200 text-sm font-semibold tracking-tight">Complete</p>
          <p className="text-zinc-500 text-[10px] font-mono">{data.totalModels} models tested</p>
        </div>
      </div>
      <div className="bg-white/5 rounded-lg px-3 py-2 mt-1">
        <p className="text-zinc-600 text-[10px] uppercase tracking-wider mb-0.5">Winner</p>
        <p className="text-[#00FF66] text-sm font-semibold truncate">{data.winnerName}</p>
        <p className="text-[#00FF66]/60 text-xs font-mono">Score: {data.winnerScore}</p>
      </div>
    </div>
  );
});

// ─── Node Types ───────────────────────────────────────────────────────────────

const pipelineNodeTypes = {
  startNode: StartNode,
  modelBlock: ModelBlockNode,
  finishNode: FinishNode,
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface ModelData {
  model_name: string;
  family: string;
  overall_score: number;
  avg_tokens_per_sec: number;
  total_duration: number;
  skipped: number;
  promptResults: Array<{ id: string }>;
}

interface PipelineReplayProps {
  suiteName: string;
  suiteType: string;
  models: ModelData[];
  promptCount: number;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PipelineReplay({ suiteName, suiteType, models, promptCount }: PipelineReplayProps) {
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    const activeModels = models
      .filter((m) => !m.skipped)
      .sort((a, b) => b.overall_score - a.overall_score);

    if (activeModels.length === 0) return { nodes: [], edges: [] };

    const winner = activeModels[0];
    const modelCount = activeModels.length;

    // Layout: vertical centering of model blocks
    const modelSpacingY = 140;
    const totalHeight = (modelCount - 1) * modelSpacingY;
    const startY = totalHeight / 2;

    // Start node
    const typeLabel = suiteType === "tool_calling" ? "Tool Calling" :
      suiteType === "conversation" ? "Conversation" :
      suiteType === "adversarial" ? "Adversarial" : "Standard";

    nodes.push({
      id: "start",
      type: "startNode",
      position: { x: 0, y: startY - 20 },
      data: { suiteName: `${suiteName} (${typeLabel})`, promptCount },
    });

    // Model blocks
    for (let i = 0; i < activeModels.length; i++) {
      const m = activeModels[i];
      const nodeId = `model-${i}`;
      const y = i * modelSpacingY;

      nodes.push({
        id: nodeId,
        type: "modelBlock",
        position: { x: 350, y },
        data: {
          modelName: m.model_name,
          family: m.family,
          score: m.overall_score,
          tokensPerSec: m.avg_tokens_per_sec,
          duration: m.total_duration,
          promptCount: m.promptResults.length,
          rank: i + 1,
        },
      });

      // Edge from start to model
      const color = getModelColor(m.family);
      const hex = color?.hex || "#a1a1aa";

      edges.push({
        id: `e-start-${nodeId}`,
        source: "start",
        target: nodeId,
        style: { stroke: hex, strokeWidth: i === 0 ? 2 : 1, opacity: i === 0 ? 1 : 0.5 },
        type: "default",
      });

      // Edge from model to finish
      edges.push({
        id: `e-${nodeId}-finish`,
        source: nodeId,
        target: "finish",
        style: {
          stroke: i === 0 ? "#00FF66" : hex,
          strokeWidth: i === 0 ? 2 : 1,
          opacity: i === 0 ? 1 : 0.4,
        },
        type: "default",
      });
    }

    // Finish node
    nodes.push({
      id: "finish",
      type: "finishNode",
      position: { x: 720, y: startY - 30 },
      data: {
        winnerName: winner.model_name,
        winnerScore: winner.overall_score,
        totalModels: modelCount,
      },
    });

    return { nodes, edges };
  }, [suiteName, suiteType, models, promptCount]);

  if (nodes.length === 0) {
    return (
      <div className="w-full h-[400px] bg-zinc-950/50 rounded-xl border border-white/[0.06] flex items-center justify-center">
        <p className="text-zinc-600 text-sm">No model results to visualize</p>
      </div>
    );
  }

  return (
    <div className="w-full h-[400px] bg-zinc-950/50 rounded-xl border border-white/[0.06] overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={pipelineNodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag
        zoomOnScroll
      >
        <Background color="#18181b" gap={24} size={1} />
        <Controls
          showInteractive={false}
          className="!bg-white/5 !border-white/[0.06] !rounded-lg [&>button]:!bg-transparent [&>button]:!border-white/[0.06] [&>button]:!text-zinc-400"
        />
      </ReactFlow>
    </div>
  );
}
