"use client";

import { create } from "zustand";
import { LiveRunState, LiveModelState, LivePromptState } from "@/types";

interface RunStoreState {
  liveRun: LiveRunState | null;
  initRun: (runId: string, suiteId: string, models: string[]) => void;
  setModelStatus: (modelIdx: number, status: LiveModelState["status"]) => void;
  setPromptStatus: (
    modelIdx: number,
    promptIdx: number,
    update: Partial<LivePromptState>
  ) => void;
  appendToken: (modelIdx: number, promptIdx: number, token: string) => void;
  setCurrentModel: (idx: number) => void;
  setRunStatus: (status: LiveRunState["status"]) => void;
  tickElapsed: () => void;
  clearRun: () => void;
}

export const useRunStore = create<RunStoreState>((set) => ({
  liveRun: null,

  initRun: (runId, suiteId, models) =>
    set({
      liveRun: {
        runId,
        suiteId,
        suiteType: "standard",
        models: models.map((name) => ({
          name,
          family: "other" as const,
          status: "pending",
          prompts: [],
          currentPromptIndex: 0,
        })),
        currentModelIndex: 0,
        status: "running",
        startedAt: Date.now(),
        elapsedSeconds: 0,
      },
    }),

  setModelStatus: (modelIdx, status) =>
    set((s) => {
      if (!s.liveRun) return s;
      const models = [...s.liveRun.models];
      models[modelIdx] = { ...models[modelIdx], status };
      return { liveRun: { ...s.liveRun, models } };
    }),

  setPromptStatus: (modelIdx, promptIdx, update) =>
    set((s) => {
      if (!s.liveRun) return s;
      const models = [...s.liveRun.models];
      const prompts = [...models[modelIdx].prompts];
      prompts[promptIdx] = { ...prompts[promptIdx], ...update };
      models[modelIdx] = { ...models[modelIdx], prompts, currentPromptIndex: promptIdx };
      return { liveRun: { ...s.liveRun, models } };
    }),

  appendToken: (modelIdx, promptIdx, token) =>
    set((s) => {
      if (!s.liveRun) return s;
      const models = [...s.liveRun.models];
      const prompts = [...models[modelIdx].prompts];
      prompts[promptIdx] = {
        ...prompts[promptIdx],
        response: (prompts[promptIdx].response || "") + token,
      };
      models[modelIdx] = { ...models[modelIdx], prompts };
      return { liveRun: { ...s.liveRun, models } };
    }),

  setCurrentModel: (idx) =>
    set((s) => {
      if (!s.liveRun) return s;
      return { liveRun: { ...s.liveRun, currentModelIndex: idx } };
    }),

  setRunStatus: (status) =>
    set((s) => {
      if (!s.liveRun) return s;
      return { liveRun: { ...s.liveRun, status } };
    }),

  tickElapsed: () =>
    set((s) => {
      if (!s.liveRun) return s;
      return {
        liveRun: {
          ...s.liveRun,
          elapsedSeconds: Math.floor((Date.now() - s.liveRun.startedAt) / 1000),
        },
      };
    }),

  clearRun: () => set({ liveRun: null }),
}));
