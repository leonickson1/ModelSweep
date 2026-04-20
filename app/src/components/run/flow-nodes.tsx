"use client";

import { memo } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { MessageSquare, Wrench, AlertTriangle, CheckCircle2, XCircle, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

// ─── User Message Node ──────────────────────────────────────────────────────

interface UserMessageData {
  message: string;
  turnNumber?: number;
  label?: string;
}

export const UserMessageNode = memo(function UserMessageNode({ data }: NodeProps & { data: UserMessageData }) {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/[0.06] rounded-xl px-4 py-3 max-w-[400px] min-w-[200px] shadow-lg">
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2 mb-1.5">
        <MessageSquare size={12} className="text-zinc-500" />
        <span className="text-zinc-500 text-[10px] uppercase tracking-wider">
          {data.label ?? "User"} {data.turnNumber !== undefined ? `T${data.turnNumber + 1}` : ""}
        </span>
      </div>
      <p className="text-zinc-300 text-xs leading-relaxed line-clamp-5">{data.message}</p>
      <Handle type="source" position={Position.Right} className="!bg-zinc-600 !w-2 !h-2 !border-0" />
    </div>
  );
});

// ─── Model Response Node ────────────────────────────────────────────────────

interface ModelResponseData {
  response: string;
  modelName?: string;
  tokensPerSec?: number;
  ttft?: number;
  score?: number;
  status?: "pending" | "running" | "done" | "error";
}

export const ModelResponseNode = memo(function ModelResponseNode({ data }: NodeProps & { data: ModelResponseData }) {
  const isRunning = data.status === "running";
  return (
    <div className={cn(
      "bg-white/5 backdrop-blur-md border rounded-xl px-4 py-3 max-w-[400px] min-w-[200px] shadow-lg",
      isRunning ? "border-blue-500/30" : "border-white/[0.06]"
    )}>
      <Handle type="target" position={Position.Left} className="!bg-blue-500 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2 mb-1.5">
        <div className={cn("w-2 h-2 rounded-full", isRunning ? "bg-blue-400 animate-pulse" : "bg-zinc-600")} />
        <span className="text-zinc-400 text-[10px] uppercase tracking-wider">
          {data.modelName ?? "Model"}
        </span>
        {data.score !== undefined && (
          <span className={cn(
            "ml-auto text-xs font-mono",
            data.score >= 80 ? "text-emerald-400" : data.score >= 50 ? "text-yellow-400" : "text-red-400"
          )}>
            {data.score}%
          </span>
        )}
      </div>
      {data.response ? (
        <p className="text-zinc-300 text-xs leading-relaxed line-clamp-5">{data.response}</p>
      ) : (
        <div className="flex items-center gap-2 text-zinc-600 text-xs">
          {isRunning && <div className="w-3 h-3 border border-blue-400 border-t-transparent rounded-full animate-spin" />}
          {isRunning ? "Generating..." : "Waiting..."}
        </div>
      )}
      {data.tokensPerSec !== undefined && data.tokensPerSec > 0 && (
        <div className="mt-1.5 text-zinc-600 text-[10px] font-mono">
          {data.tokensPerSec.toFixed(1)} tok/s {data.ttft ? `· ${data.ttft.toFixed(0)}ms TTFT` : ""}
        </div>
      )}
      <Handle type="source" position={Position.Right} className="!bg-blue-500 !w-2 !h-2 !border-0" />
    </div>
  );
});

// ─── Tool Call Node ─────────────────────────────────────────────────────────

interface ToolCallData {
  functionName: string;
  arguments: Record<string, unknown>;
  correct?: boolean;
  hallucinated?: boolean;
}

export const ToolCallNode = memo(function ToolCallNode({ data }: NodeProps & { data: ToolCallData }) {
  return (
    <div className={cn(
      "bg-blue-500/5 backdrop-blur-md border rounded-xl px-4 py-3 max-w-[380px] min-w-[180px] shadow-lg",
      data.hallucinated ? "border-red-500/30" : data.correct ? "border-emerald-500/30" : "border-blue-500/20"
    )}>
      <Handle type="target" position={Position.Left} className="!bg-blue-400 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2 mb-1.5">
        <Wrench size={12} className="text-blue-400" />
        <span className="text-blue-300 text-xs font-mono">{data.functionName}</span>
        {data.correct !== undefined && (
          data.correct
            ? <CheckCircle2 size={11} className="ml-auto text-emerald-400" />
            : <XCircle size={11} className="ml-auto text-red-400" />
        )}
        {data.hallucinated && (
          <AlertTriangle size={11} className="ml-auto text-red-400" />
        )}
      </div>
      <div className="space-y-0.5">
        {Object.entries(data.arguments).slice(0, 4).map(([key, val]) => (
          <div key={key} className="text-[10px] flex gap-1">
            <span className="text-zinc-500 font-mono">{key}:</span>
            <span className="text-zinc-400 truncate">{JSON.stringify(val)}</span>
          </div>
        ))}
      </div>
      <Handle type="source" position={Position.Right} className="!bg-blue-400 !w-2 !h-2 !border-0" />
    </div>
  );
});

// ─── Score Node ─────────────────────────────────────────────────────────────

interface ScoreNodeData {
  score: number;
  label?: string;
}

export const ScoreNode = memo(function ScoreNode({ data }: NodeProps & { data: ScoreNodeData }) {
  return (
    <div className="flex items-center gap-2 bg-white/5 backdrop-blur-md border border-white/[0.06] rounded-lg px-3 py-2">
      <Handle type="target" position={Position.Left} className="!bg-zinc-600 !w-2 !h-2 !border-0" />
      <span className={cn(
        "text-lg font-mono font-semibold",
        data.score >= 80 ? "text-emerald-400" : data.score >= 50 ? "text-yellow-400" : "text-red-400"
      )}>
        {data.score}
      </span>
      {data.label && <span className="text-zinc-600 text-[10px]">{data.label}</span>}
    </div>
  );
});

// ─── Breach Alert Node ──────────────────────────────────────────────────────

interface BreachAlertData {
  type: string;
  severity: string;
  evidence: string;
  turn: number;
}

export const BreachAlertNode = memo(function BreachAlertNode({ data }: NodeProps & { data: BreachAlertData }) {
  return (
    <div className="bg-red-500/10 backdrop-blur-md border border-red-500/30 rounded-xl px-4 py-3 max-w-[380px] min-w-[180px] shadow-lg shadow-red-500/10">
      <Handle type="target" position={Position.Left} className="!bg-red-500 !w-2 !h-2 !border-0" />
      <div className="flex items-center gap-2 mb-1.5">
        <Shield size={12} className="text-red-400" />
        <span className="text-red-400 text-[10px] uppercase tracking-wider font-medium">
          Breach — {data.severity}
        </span>
        <span className="ml-auto text-zinc-600 text-[10px]">Turn {data.turn + 1}</span>
      </div>
      <p className="text-red-300/80 text-xs">{data.type.replace("_", " ")}</p>
      <p className="text-zinc-500 text-[10px] mt-1 line-clamp-2">{data.evidence}</p>
    </div>
  );
});

// ─── Turn Divider Node ──────────────────────────────────────────────────────

interface TurnDividerData {
  turn: number;
  contextUsage?: number;
}

export const TurnDividerNode = memo(function TurnDividerNode({ data }: NodeProps & { data: TurnDividerData }) {
  return (
    <div className="flex items-center gap-3 px-3 py-1">
      <div className="h-px flex-1 bg-white/[0.06]" />
      <span className="text-zinc-600 text-[10px] uppercase tracking-wider">Turn {data.turn + 1}</span>
      {data.contextUsage !== undefined && (
        <span className={cn(
          "text-[10px] font-mono",
          data.contextUsage > 85 ? "text-amber-400" : "text-zinc-700"
        )}>
          {data.contextUsage}% ctx
        </span>
      )}
      <div className="h-px flex-1 bg-white/[0.06]" />
    </div>
  );
});

// ─── Export node types map ──────────────────────────────────────────────────

export const nodeTypes = {
  userMessage: UserMessageNode,
  modelResponse: ModelResponseNode,
  toolCall: ToolCallNode,
  scoreNode: ScoreNode,
  breachAlert: BreachAlertNode,
  turnDivider: TurnDividerNode,
};
