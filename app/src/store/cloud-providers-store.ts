"use client";

import { create } from "zustand";

export interface CloudProvider {
  id: string;
  providerType: "openai" | "anthropic" | "custom";
  label: string;
  maskedKey: string;
  baseUrl?: string | null;
  selectedModel: string | null;
  useForJudging: boolean;
  useForPlayground: boolean;
}

interface CloudProvidersState {
  providers: CloudProvider[];
  loaded: boolean;
  fetchProviders: () => Promise<void>;
}

export const useCloudProvidersStore = create<CloudProvidersState>((set) => ({
  providers: [],
  loaded: false,
  fetchProviders: async () => {
    try {
      const res = await fetch("/api/providers");
      const data = await res.json();
      set({ providers: data.providers || [], loaded: true });
    } catch {
      set({ loaded: true });
    }
  },
}));
