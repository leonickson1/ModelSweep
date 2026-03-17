"use client";

import { create } from "zustand";
import { OllamaModel, OllamaRunningModel } from "@/types";

interface ModelsState {
  models: OllamaModel[];
  runningModels: OllamaRunningModel[];
  loading: boolean;
  error: string | null;
  lastFetched: number | null;
  setModels: (models: OllamaModel[]) => void;
  setRunningModels: (models: OllamaRunningModel[]) => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setLastFetched: (ts: number) => void;
}

export const useModelsStore = create<ModelsState>((set) => ({
  models: [],
  runningModels: [],
  loading: true,
  error: null,
  lastFetched: null,
  setModels: (models) => set({ models }),
  setRunningModels: (runningModels) => set({ runningModels }),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  setLastFetched: (lastFetched) => set({ lastFetched }),
}));
