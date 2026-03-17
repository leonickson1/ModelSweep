"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Users, Lock, Wrench, Shield, Trophy } from "lucide-react";
import Link from "next/link";
import { usePreferencesStore } from "@/store/preferences-store";
import { Button } from "@/components/ui/button";
import { getModelColor } from "@/lib/model-colors";
import { cn } from "@/lib/utils";

// ─── Mock Data ──────────────────────────────────────────────────────────────

const MOCK_OVERALL_LEADERBOARD = [
  { rank: 1, model: "qwen2.5:7b", score: 87, speed: 42.1, runs: 234, users: 89 },
  { rank: 2, model: "llama3.1:8b", score: 84, speed: 38.6, runs: 312, users: 127 },
  { rank: 3, model: "deepseek-r1:7b", score: 82, speed: 35.2, runs: 189, users: 72 },
  { rank: 4, model: "mistral:7b", score: 79, speed: 44.8, runs: 156, users: 63 },
  { rank: 5, model: "gemma2:9b", score: 77, speed: 31.4, runs: 98, users: 41 },
  { rank: 6, model: "phi3:14b", score: 75, speed: 22.7, runs: 67, users: 28 },
  { rank: 7, model: "llama3.2:3b", score: 68, speed: 58.3, runs: 145, users: 54 },
];

const MOCK_TOOL_LEADERBOARD = [
  { rank: 1, model: "qwen2.5:7b", select: 92, params: 88, restraint: 95, overall: 91, users: 45 },
  { rank: 2, model: "llama3.1:8b", select: 89, params: 85, restraint: 90, overall: 88, users: 62 },
  { rank: 3, model: "mistral:7b", select: 85, params: 82, restraint: 88, overall: 85, users: 38 },
  { rank: 4, model: "deepseek-r1:7b", select: 83, params: 80, restraint: 86, overall: 83, users: 29 },
  { rank: 5, model: "phi3:14b", select: 78, params: 75, restraint: 82, overall: 78, users: 17 },
  { rank: 6, model: "gemma2:9b", select: 74, params: 70, restraint: 80, overall: 75, users: 22 },
];

const MOCK_ROBUSTNESS_LEADERBOARD = [
  { rank: 1, model: "llama3.1:8b", robustness: 94, avgBreaches: 0.3, survivalRate: 97, users: 51 },
  { rank: 2, model: "qwen2.5:7b", robustness: 91, avgBreaches: 0.5, survivalRate: 94, users: 38 },
  { rank: 3, model: "mistral:7b", robustness: 87, avgBreaches: 0.8, survivalRate: 89, users: 32 },
  { rank: 4, model: "deepseek-r1:7b", robustness: 82, avgBreaches: 1.2, survivalRate: 82, users: 24 },
  { rank: 5, model: "phi3:14b", robustness: 78, avgBreaches: 1.5, survivalRate: 76, users: 15 },
  { rank: 6, model: "gemma2:9b", robustness: 71, avgBreaches: 2.1, survivalRate: 68, users: 19 },
];

type Tab = "overall" | "tool_calling" | "robustness";

export default function CommunityPage() {
  const { communityEnabled } = usePreferencesStore();
  const [activeTab, setActiveTab] = useState<Tab>("overall");

  if (!communityEnabled) {
    return (
      <div className="p-8 max-w-2xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="text-center py-16">
          <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/[0.06] flex items-center justify-center mx-auto mb-5">
            <Lock size={28} className="text-zinc-500" />
          </div>
          <h1 className="text-2xl font-semibold text-zinc-100 mb-3">Community is Off</h1>
          <p className="text-zinc-500 text-sm max-w-md mx-auto mb-6 leading-relaxed">
            Community features let you share model scores with the global leaderboard and download
            test suites built by other users. Your prompts and responses are never shared.
          </p>
          <p className="text-zinc-600 text-xs mb-6">Community features require opt-in in Settings.</p>
          <Link href="/settings">
            <Button variant="primary">Enable in Settings</Button>
          </Link>
        </motion.div>
      </div>
    );
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: "overall", label: "Overall", icon: <Trophy size={14} /> },
    { id: "tool_calling", label: "Tool Calling", icon: <Wrench size={14} /> },
    { id: "robustness", label: "Robustness", icon: <Shield size={14} /> },
  ];

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight flex items-center gap-3">
          <Users size={22} />
          Community Hub
        </h1>
        <p className="text-zinc-500 text-sm mt-1">Global leaderboards from community-shared evaluations</p>
      </motion.div>

      {/* Tab bar */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex gap-1 mb-6 bg-white/5 backdrop-blur-md border border-white/[0.06] rounded-xl p-1 w-fit"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all",
              "focus-visible:ring-2 focus-visible:ring-white/20 focus-visible:outline-none",
              activeTab === tab.id
                ? "bg-white/10 text-zinc-100 border border-white/[0.08]"
                : "text-zinc-500 hover:text-zinc-300"
            )}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </motion.div>

      {/* Overall Leaderboard */}
      {activeTab === "overall" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white/5 backdrop-blur-md border border-white/[0.06] rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <h2 className="text-zinc-200 text-sm font-semibold">Global Model Rankings</h2>
            <p className="text-zinc-600 text-xs mt-0.5">Aggregated from community-shared evaluation results</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider border-b border-white/[0.04]">
                <th className="text-left px-6 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">Model</th>
                <th className="text-right px-4 py-3">Score</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Speed</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Runs</th>
                <th className="text-right px-6 py-3">Users</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_OVERALL_LEADERBOARD.map((row, i) => {
                const color = getModelColor(row.model);
                return (
                  <motion.tr
                    key={row.model}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.03 * i }}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className={cn("px-6 py-3 text-sm font-mono tabular-nums", i === 0 ? "text-amber-400" : "text-zinc-600")}>
                      {String(row.rank).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color.hex }} />
                        <span className="text-zinc-200 text-sm font-medium">{row.model}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-zinc-200">{row.score}%</td>
                    <td className="px-4 py-3 text-right text-xs font-mono tabular-nums text-zinc-500 hidden sm:table-cell">{row.speed} t/s</td>
                    <td className="px-4 py-3 text-right text-xs font-mono tabular-nums text-zinc-600 hidden md:table-cell">{row.runs}</td>
                    <td className="px-6 py-3 text-right text-xs font-mono tabular-nums text-zinc-600">{row.users}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-white/[0.06] text-center">
            <span className="text-zinc-600 text-xs font-mono">Mock data -- will be populated when community sharing is implemented</span>
          </div>
        </motion.div>
      )}

      {/* Tool Calling Leaderboard */}
      {activeTab === "tool_calling" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white/5 backdrop-blur-md border border-white/[0.06] rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Wrench size={14} className="text-blue-400" />
              <h2 className="text-zinc-200 text-sm font-semibold">Tool Calling Leaderboard</h2>
            </div>
            <p className="text-zinc-600 text-xs mt-0.5">Model accuracy across tool calling dimensions</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider border-b border-white/[0.04]">
                <th className="text-left px-6 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">Model</th>
                <th className="text-right px-4 py-3">Select%</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Params%</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Restraint%</th>
                <th className="text-right px-4 py-3">Overall%</th>
                <th className="text-right px-6 py-3">Users</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_TOOL_LEADERBOARD.map((row, i) => {
                const color = getModelColor(row.model);
                return (
                  <motion.tr
                    key={row.model}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.03 * i }}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className={cn("px-6 py-3 text-sm font-mono tabular-nums", i === 0 ? "text-blue-400" : "text-zinc-600")}>
                      {String(row.rank).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color.hex }} />
                        <span className="text-zinc-200 text-sm font-medium">{row.model}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-blue-300">{row.select}%</td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-zinc-400 hidden sm:table-cell">{row.params}%</td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-zinc-400 hidden md:table-cell">{row.restraint}%</td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-zinc-200">{row.overall}%</td>
                    <td className="px-6 py-3 text-right text-xs font-mono tabular-nums text-zinc-600">{row.users}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-white/[0.06] text-center">
            <span className="text-zinc-600 text-xs font-mono">Mock data -- will be populated when community sharing is implemented</span>
          </div>
        </motion.div>
      )}

      {/* Robustness Leaderboard */}
      {activeTab === "robustness" && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
          className="bg-white/5 backdrop-blur-md border border-white/[0.06] rounded-2xl overflow-hidden"
        >
          <div className="px-6 py-4 border-b border-white/[0.06]">
            <div className="flex items-center gap-2">
              <Shield size={14} className="text-rose-400" />
              <h2 className="text-zinc-200 text-sm font-semibold">Robustness Leaderboard</h2>
            </div>
            <p className="text-zinc-600 text-xs mt-0.5">Model resilience against adversarial attacks</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="text-zinc-600 text-[10px] font-mono uppercase tracking-wider border-b border-white/[0.04]">
                <th className="text-left px-6 py-3 w-12">#</th>
                <th className="text-left px-4 py-3">Model</th>
                <th className="text-right px-4 py-3">Robustness%</th>
                <th className="text-right px-4 py-3 hidden sm:table-cell">Avg Breaches</th>
                <th className="text-right px-4 py-3 hidden md:table-cell">Survival Rate%</th>
                <th className="text-right px-6 py-3">Users</th>
              </tr>
            </thead>
            <tbody>
              {MOCK_ROBUSTNESS_LEADERBOARD.map((row, i) => {
                const color = getModelColor(row.model);
                return (
                  <motion.tr
                    key={row.model}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.03 * i }}
                    className="border-b border-white/[0.03] hover:bg-white/[0.02] transition-colors"
                  >
                    <td className={cn("px-6 py-3 text-sm font-mono tabular-nums", i === 0 ? "text-rose-400" : "text-zinc-600")}>
                      {String(row.rank).padStart(2, "0")}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: color.hex }} />
                        <span className="text-zinc-200 text-sm font-medium">{row.model}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-rose-300">{row.robustness}%</td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-zinc-400 hidden sm:table-cell">{row.avgBreaches}</td>
                    <td className="px-4 py-3 text-right text-sm font-mono tabular-nums text-zinc-400 hidden md:table-cell">{row.survivalRate}%</td>
                    <td className="px-6 py-3 text-right text-xs font-mono tabular-nums text-zinc-600">{row.users}</td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-6 py-3 border-t border-white/[0.06] text-center">
            <span className="text-zinc-600 text-xs font-mono">Mock data -- will be populated when community sharing is implemented</span>
          </div>
        </motion.div>
      )}
    </div>
  );
}
