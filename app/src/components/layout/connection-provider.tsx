"use client";

import { useEffect } from "react";
import { useConnectionStore } from "@/store/connection-store";
import { useModelsStore } from "@/store/models-store";
import { usePreferencesStore } from "@/store/preferences-store";

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const { setStatus } = useConnectionStore();
  const { setModels, setRunningModels } = useModelsStore();
  const { setPreferences, setLoaded } = usePreferencesStore();

  useEffect(() => {
    // Load preferences once
    fetch("/api/preferences")
      .then((r) => r.json())
      .then((data) => {
        if (data.preferences) {
          setPreferences(data.preferences);
        }
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, [setPreferences, setLoaded]);

  useEffect(() => {
    const check = async () => {
      try {
        setStatus("connecting");
        const res = await fetch("/api/health");
        const data = await res.json();
        if (data.connected) {
          setStatus("connected");
          // Refresh models
          const [modelsRes, psRes] = await Promise.all([
            fetch("/api/models"),
            fetch("/api/models/ps"),
          ]);
          const [modelsData, psData] = await Promise.all([
            modelsRes.json(),
            psRes.json(),
          ]);
          if (modelsData.models) setModels(modelsData.models);
          if (psData.models) setRunningModels(psData.models);
        } else {
          setStatus("disconnected");
        }
      } catch {
        setStatus("disconnected");
      }
    };

    check();
    const interval = setInterval(check, 10000);
    return () => clearInterval(interval);
  }, [setStatus, setModels, setRunningModels]);

  return <>{children}</>;
}
