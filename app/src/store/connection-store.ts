"use client";

import { create } from "zustand";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

interface ConnectionState {
  status: ConnectionStatus;
  ollamaVersion: string | null;
  lastChecked: number | null;
  setStatus: (status: ConnectionStatus) => void;
  setVersion: (version: string | null) => void;
  setLastChecked: (ts: number) => void;
}

export const useConnectionStore = create<ConnectionState>((set) => ({
  status: "connecting",
  ollamaVersion: null,
  lastChecked: null,
  setStatus: (status) => set({ status }),
  setVersion: (ollamaVersion) => set({ ollamaVersion }),
  setLastChecked: (lastChecked) => set({ lastChecked }),
}));
