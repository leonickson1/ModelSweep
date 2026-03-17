"use client";

import { create } from "zustand";
import { UserPreferences } from "@/types";

const DEFAULT_PREFS: UserPreferences = {
  ollamaUrl: "http://localhost:11434",
  defaultTemperature: 0.7,
  defaultTopP: 0.9,
  defaultMaxTokens: 1024,
  judgeModel: null,
  communityEnabled: false,
  defaultJudgeEnabled: false,
  weightAuto: 0.3,
  weightJudge: 0.5,
  weightHuman: 0.2,
};

interface PreferencesState extends UserPreferences {
  loaded: boolean;
  setPreferences: (prefs: Partial<UserPreferences>) => void;
  setLoaded: (loaded: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...DEFAULT_PREFS,
  loaded: false,
  setPreferences: (prefs) => set((s) => ({ ...s, ...prefs })),
  setLoaded: (loaded) => set({ loaded }),
}));
