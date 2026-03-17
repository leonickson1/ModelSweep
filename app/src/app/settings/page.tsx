"use client";

import { useState, useEffect, useCallback, type ReactNode } from "react";
import { motion } from "framer-motion";
import {
  Save, RefreshCw, CheckCircle2, AlertTriangle,
  Link2, Cloud, BarChart2, Info,
  Eye, EyeOff, ChevronDown, ChevronUp, Plus, Loader2,
  Shield,
} from "lucide-react";
import { usePreferencesStore } from "@/store/preferences-store";
import { useCloudProvidersStore, type CloudProvider } from "@/store/cloud-providers-store";
import { GlowCard } from "@/components/ui/glow-card";
import { Button } from "@/components/ui/button";
import { InfoTooltip } from "@/components/ui/info-tooltip";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

type TabId = "connection" | "cloud" | "scoring" | "data" | "about";

type TestStatus = "idle" | "testing" | "success" | "error";

// ─── Connection Tab ──────────────────────────────────────────────────────────

function ConnectionTab() {
  const prefs = usePreferencesStore();
  const [ollamaUrl, setOllamaUrl] = useState(prefs.ollamaUrl);
  const [temperature, setTemperature] = useState(prefs.defaultTemperature);
  const [topP, setTopP] = useState(prefs.defaultTopP);
  const [maxTokens, setMaxTokens] = useState(prefs.defaultMaxTokens);
  const [judgeModel, setJudgeModel] = useState(prefs.judgeModel || "");
  const [saved, setSaved] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);

  useEffect(() => {
    setOllamaUrl(prefs.ollamaUrl);
    setTemperature(prefs.defaultTemperature);
    setTopP(prefs.defaultTopP);
    setMaxTokens(prefs.defaultMaxTokens);
    setJudgeModel(prefs.judgeModel || "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.loaded]);

  const save = async () => {
    const updates = { ollamaUrl, defaultTemperature: temperature, defaultTopP: topP, defaultMaxTokens: maxTokens, judgeModel: judgeModel || null };
    await fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    prefs.setPreferences(updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  const testConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(4000) });
      setTestResult(res.ok ? "ok" : "fail");
    } catch {
      setTestResult("fail");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-5">
      <GlowCard className="p-5" animate={false}>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-zinc-400 text-sm font-medium">Ollama Connection</h2>
          <InfoTooltip text="URL and port where your Ollama instance is running. Test to verify connectivity." />
        </div>
        <div className="space-y-3">
          <div>
            <label className="text-zinc-500 text-xs block mb-1.5">Ollama URL</label>
            <div className="flex gap-2">
              <input
                value={ollamaUrl}
                onChange={(e) => setOllamaUrl(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-white/20"
                placeholder="http://localhost:11434"
              />
              <Button variant="secondary" size="sm" onClick={testConnection} disabled={testing}>
                <RefreshCw size={13} className={testing ? "animate-spin" : ""} />
                Test
              </Button>
            </div>
            {testResult === "ok" && <p className="flex items-center gap-1.5 mt-2 text-emerald-400 text-xs"><CheckCircle2 size={12} />Connected successfully</p>}
            {testResult === "fail" && <p className="flex items-center gap-1.5 mt-2 text-red-400 text-xs"><AlertTriangle size={12} />Could not connect. Is Ollama running?</p>}
          </div>
        </div>
      </GlowCard>

      <GlowCard className="p-5" animate={false}>
        <div className="flex items-center gap-2 mb-4">
          <h2 className="text-zinc-400 text-sm font-medium">Default Parameters</h2>
          <InfoTooltip text="Default inference parameters used for evaluation runs. Individual runs may override these." />
        </div>
        <div className="space-y-4">
          {[
            { label: "Temperature", value: temperature, set: setTemperature, min: 0, max: 2, step: 0.05 },
            { label: "Top-P", value: topP, set: setTopP, min: 0, max: 1, step: 0.05 },
          ].map(({ label, value, set, min, max, step }) => (
            <div key={label}>
              <div className="flex justify-between text-xs mb-2">
                <span className="text-zinc-500">{label}</span>
                <span className="text-zinc-300 font-mono">{value}</span>
              </div>
              <input type="range" min={min} max={max} step={step} value={value}
                onChange={(e) => set(parseFloat(e.target.value))}
                className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
            </div>
          ))}
          <div>
            <div className="flex justify-between text-xs mb-2">
              <span className="text-zinc-500">Max Tokens</span>
              <span className="text-zinc-300 font-mono">{maxTokens}</span>
            </div>
            <input type="range" min={128} max={8192} step={128} value={maxTokens}
              onChange={(e) => setMaxTokens(parseInt(e.target.value))}
              className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer" />
          </div>
        </div>
      </GlowCard>

      <GlowCard className="p-5" animate={false}>
        <h2 className="text-zinc-400 text-sm font-medium mb-2">Local LLM Judge</h2>
        <p className="text-zinc-600 text-xs mb-3">Default Ollama model to use when LLM-as-Judge is enabled in a run.</p>
        <input
          value={judgeModel}
          onChange={(e) => setJudgeModel(e.target.value)}
          className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-white/20"
          placeholder="e.g. llama3:8b"
        />
      </GlowCard>

      <Button variant="primary" size="lg" className="w-full" onClick={save}>
        {saved ? <><CheckCircle2 size={15} />Saved</> : <><Save size={15} />Save Settings</>}
      </Button>
    </div>
  );
}

// ─── Cloud Provider Panel ────────────────────────────────────────────────────

const PROVIDER_META: Record<string, { name: string; color: string; placeholder: string; helpUrl: string }> = {
  openai: {
    name: "OpenAI", color: "#22c55e", placeholder: "sk-proj-...",
    helpUrl: "platform.openai.com/api-keys",
  },
  anthropic: {
    name: "Anthropic", color: "#f97316", placeholder: "sk-ant-...",
    helpUrl: "console.anthropic.com",
  },
};

function StatusBadge({ status }: { status: "connected" | "not_set" }) {
  if (status === "connected") {
    return (
      <span className="flex items-center gap-1.5 text-xs text-emerald-400">
        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
        Connected
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-zinc-500">
      <span className="w-1.5 h-1.5 rounded-full bg-zinc-600" />
      Not Set
    </span>
  );
}

function ProviderPanel({ providerType, existing, onSaved }: {
  providerType: "openai" | "anthropic";
  existing: CloudProvider | null;
  onSaved: () => void;
}) {
  const meta = PROVIDER_META[providerType];
  const [expanded, setExpanded] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [useForJudging, setUseForJudging] = useState(existing?.useForJudging ?? true);
  const [useForPlayground, setUseForPlayground] = useState(existing?.useForPlayground ?? true);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(existing?.selectedModel || "");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing) {
      setSelectedModel(existing.selectedModel || "");
      setUseForJudging(existing.useForJudging);
      setUseForPlayground(existing.useForPlayground);
    }
  }, [existing]);

  const testConnection = async () => {
    const key = apiKey.trim();
    if (!key) return;
    setTestStatus("testing");
    setTestError("");
    setAvailableModels([]);

    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_type: providerType, api_key: key }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
        setAvailableModels(data.models || []);
        if (data.models?.length > 0 && !selectedModel) {
          setSelectedModel(data.models[0]);
        }
      } else {
        setTestStatus("error");
        setTestError(data.error || "Test failed");
      }
    } catch {
      setTestStatus("error");
      setTestError("Network error");
    }
  };

  const save = async () => {
    if (!apiKey.trim() || !selectedModel) return;
    setSaving(true);
    try {
      if (existing) {
        await fetch(`/api/providers/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            apiKey: apiKey.trim(),
            selectedModel,
            useForJudging,
            useForPlayground,
          }),
        });
      } else {
        await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerType,
            label: meta.name,
            apiKey: apiKey.trim(),
            selectedModel,
            useForJudging,
            useForPlayground,
          }),
        });
      }
      setApiKey("");
      setTestStatus("idle");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    await fetch(`/api/providers/${existing.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    setApiKey("");
    setSelectedModel("");
    setAvailableModels([]);
    setTestStatus("idle");
    onSaved();
  };

  return (
    <div className="border border-white/[0.07] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left"
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: meta.color }} />
        <span className="text-zinc-200 text-sm font-medium flex-1">{meta.name}</span>
        <StatusBadge status={existing ? "connected" : "not_set"} />
        {expanded ? <ChevronUp size={14} className="text-zinc-600 ml-2" /> : <ChevronDown size={14} className="text-zinc-600 ml-2" />}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.05] p-4 space-y-4 bg-white/[0.02]">
          {/* API Key */}
          <div>
            <label className="text-zinc-500 text-xs block mb-1.5">API Key</label>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  type={showKey ? "text" : "password"}
                  value={apiKey}
                  onChange={(e) => { setApiKey(e.target.value); setTestStatus("idle"); }}
                  placeholder={existing ? `${existing.maskedKey} (enter new to replace)` : meta.placeholder}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-white/20 pr-9"
                />
                <button
                  onClick={() => setShowKey((s) => !s)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400"
                >
                  {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
                </button>
              </div>
            </div>
            <p className="text-zinc-600 text-xs mt-1.5">Get your key at {meta.helpUrl}</p>
          </div>

          {/* Model dropdown - only after successful test */}
          {(testStatus === "success" || existing?.selectedModel) && (
            <div>
              <label className="text-zinc-500 text-xs block mb-1.5">Model</label>
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm appearance-none outline-none focus:border-white/20"
              >
                <option value="">Select a model...</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
                {existing?.selectedModel && !availableModels.includes(existing.selectedModel) && (
                  <option value={existing.selectedModel}>{existing.selectedModel}</option>
                )}
              </select>
              <p className="text-zinc-600 text-xs mt-1">Options fetched from your account</p>
            </div>
          )}

          {/* Use for */}
          <div>
            <label className="text-zinc-500 text-xs block mb-2">Use for</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useForJudging} onChange={(e) => setUseForJudging(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-zinc-400 text-xs">Judging</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useForPlayground} onChange={(e) => setUseForPlayground(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-zinc-400 text-xs">Playground</span>
              </label>
            </div>
          </div>

          {/* Status message */}
          {testStatus === "testing" && (
            <p className="flex items-center gap-1.5 text-blue-400 text-xs">
              <Loader2 size={12} className="animate-spin" />
              Testing...
            </p>
          )}
          {testStatus === "success" && (
            <p className="flex items-center gap-1.5 text-emerald-400 text-xs">
              <CheckCircle2 size={12} />
              Connected. Found {availableModels.length} models.
            </p>
          )}
          {testStatus === "error" && (
            <p className="flex items-center gap-1.5 text-red-400 text-xs">
              <AlertTriangle size={12} />
              {testError}
            </p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={testConnection} disabled={!apiKey.trim() || testStatus === "testing"}>
              <RefreshCw size={12} className={testStatus === "testing" ? "animate-spin" : ""} />
              Test Connection
            </Button>
            <Button variant="primary" size="sm" onClick={save} disabled={saving || testStatus !== "success" || !selectedModel}>
              <Save size={12} />
              {saving ? "Saving..." : "Save"}
            </Button>
            <div className="flex-1" />
            {existing && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} className="text-red-400/70 text-xs hover:text-red-400 transition-colors">
                Delete Provider
              </button>
            )}
            {existing && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs">Remove? Key will be deleted.</span>
                <button onClick={() => setConfirmDelete(false)} className="text-zinc-400 text-xs hover:text-zinc-200">Cancel</button>
                <Button variant="danger" size="sm" onClick={remove}>Remove</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CustomProviderPanel({ existing, onSaved }: {
  existing: CloudProvider | null;
  onSaved: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [label, setLabel] = useState(existing?.label || "");
  const [baseUrl, setBaseUrl] = useState(existing?.baseUrl || "");
  const [apiKey, setApiKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [useForJudging, setUseForJudging] = useState(existing?.useForJudging ?? true);
  const [useForPlayground, setUseForPlayground] = useState(existing?.useForPlayground ?? true);
  const [testStatus, setTestStatus] = useState<TestStatus>("idle");
  const [testError, setTestError] = useState("");
  const [availableModels, setAvailableModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState(existing?.selectedModel || "");
  const [manualModel, setManualModel] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (existing) {
      setLabel(existing.label);
      setBaseUrl(existing.baseUrl || "");
      setSelectedModel(existing.selectedModel || "");
      setUseForJudging(existing.useForJudging);
      setUseForPlayground(existing.useForPlayground);
    }
  }, [existing]);

  const testConnection = async () => {
    if (!apiKey.trim() || !baseUrl.trim()) return;
    setTestStatus("testing");
    setTestError("");
    setAvailableModels([]);

    try {
      const res = await fetch("/api/providers/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_type: "custom", api_key: apiKey.trim(), base_url: baseUrl.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTestStatus("success");
        setAvailableModels(data.models || []);
        if (data.models?.length > 0 && !selectedModel) {
          setSelectedModel(data.models[0]);
        }
      } else {
        setTestStatus("error");
        setTestError(data.error || "Test failed");
      }
    } catch {
      setTestStatus("error");
      setTestError("Network error");
    }
  };

  const effectiveModel = selectedModel || manualModel;

  const save = async () => {
    if (!apiKey.trim() || !baseUrl.trim() || !effectiveModel || !label.trim()) return;
    setSaving(true);
    try {
      if (existing) {
        await fetch(`/api/providers/${existing.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label.trim(),
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
            selectedModel: effectiveModel,
            useForJudging,
            useForPlayground,
          }),
        });
      } else {
        await fetch("/api/providers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            providerType: "custom",
            label: label.trim(),
            apiKey: apiKey.trim(),
            baseUrl: baseUrl.trim(),
            selectedModel: effectiveModel,
            useForJudging,
            useForPlayground,
          }),
        });
      }
      setApiKey("");
      setTestStatus("idle");
      onSaved();
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!existing) return;
    await fetch(`/api/providers/${existing.id}`, { method: "DELETE" });
    setConfirmDelete(false);
    setApiKey("");
    setSelectedModel("");
    setAvailableModels([]);
    setTestStatus("idle");
    onSaved();
  };

  return (
    <div className="border border-white/[0.07] rounded-2xl overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/[0.03] transition-colors text-left"
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-purple-400" />
        <span className="text-zinc-200 text-sm font-medium flex-1">
          {existing?.label || "Custom Endpoint"}
        </span>
        <StatusBadge status={existing ? "connected" : "not_set"} />
        {expanded ? <ChevronUp size={14} className="text-zinc-600 ml-2" /> : <ChevronDown size={14} className="text-zinc-600 ml-2" />}
      </button>

      {expanded && (
        <div className="border-t border-white/[0.05] p-4 space-y-3 bg-white/[0.02]">
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Name</label>
            <input value={label} onChange={(e) => setLabel(e.target.value)}
              placeholder="Together AI Llama 70B"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-white/20" />
            <p className="text-zinc-600 text-xs mt-1">This name appears in model selectors</p>
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Base URL (must include /v1)</label>
            <input value={baseUrl} onChange={(e) => { setBaseUrl(e.target.value); setTestStatus("idle"); }}
              placeholder="https://api.together.xyz/v1"
              className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-white/20" />
          </div>
          <div>
            <label className="text-zinc-500 text-xs block mb-1">API Key</label>
            <div className="relative">
              <input type={showKey ? "text" : "password"} value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setTestStatus("idle"); }}
                placeholder={existing ? `${existing.maskedKey} (enter new to replace)` : "Enter API key"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-white/20 pr-9" />
              <button onClick={() => setShowKey((s) => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-600 hover:text-zinc-400">
                {showKey ? <EyeOff size={13} /> : <Eye size={13} />}
              </button>
            </div>
          </div>

          {/* Model selection */}
          <div>
            <label className="text-zinc-500 text-xs block mb-1">Model</label>
            {availableModels.length > 0 ? (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm appearance-none outline-none focus:border-white/20"
              >
                <option value="">Select a model...</option>
                {availableModels.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            ) : (
              <input value={manualModel}
                onChange={(e) => setManualModel(e.target.value)}
                placeholder={existing?.selectedModel || "meta-llama/Llama-3-70b-Instruct"}
                className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-zinc-300 text-sm outline-none focus:border-white/20" />
            )}
            <p className="text-zinc-600 text-xs mt-1">
              {availableModels.length > 0 ? "Options fetched from endpoint" : "Test connection to auto-detect, or type a model ID manually"}
            </p>
          </div>

          {/* Use for */}
          <div>
            <label className="text-zinc-500 text-xs block mb-2">Use for</label>
            <div className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useForJudging} onChange={(e) => setUseForJudging(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-zinc-400 text-xs">Judging</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={useForPlayground} onChange={(e) => setUseForPlayground(e.target.checked)} className="w-3.5 h-3.5 rounded" />
                <span className="text-zinc-400 text-xs">Playground</span>
              </label>
            </div>
          </div>

          {/* Status */}
          {testStatus === "testing" && (
            <p className="flex items-center gap-1.5 text-blue-400 text-xs"><Loader2 size={12} className="animate-spin" />Testing...</p>
          )}
          {testStatus === "success" && (
            <p className="flex items-center gap-1.5 text-emerald-400 text-xs"><CheckCircle2 size={12} />Connected. Found {availableModels.length} models.</p>
          )}
          {testStatus === "error" && (
            <p className="flex items-center gap-1.5 text-red-400 text-xs"><AlertTriangle size={12} />{testError}</p>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <Button variant="secondary" size="sm" onClick={testConnection} disabled={!apiKey.trim() || !baseUrl.trim() || testStatus === "testing"}>
              <RefreshCw size={12} className={testStatus === "testing" ? "animate-spin" : ""} />
              Test Connection
            </Button>
            <Button variant="primary" size="sm" onClick={save}
              disabled={saving || !label.trim() || !apiKey.trim() || !baseUrl.trim() || !effectiveModel}>
              <Save size={12} />
              {saving ? "Saving..." : "Save"}
            </Button>
            <div className="flex-1" />
            {existing && !confirmDelete && (
              <button onClick={() => setConfirmDelete(true)} className="text-red-400/70 text-xs hover:text-red-400 transition-colors">
                Delete Provider
              </button>
            )}
            {existing && confirmDelete && (
              <div className="flex items-center gap-2">
                <span className="text-zinc-500 text-xs">Remove?</span>
                <button onClick={() => setConfirmDelete(false)} className="text-zinc-400 text-xs hover:text-zinc-200">Cancel</button>
                <Button variant="danger" size="sm" onClick={remove}>Remove</Button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function CloudTab() {
  const { providers, fetchProviders } = useCloudProvidersStore();
  const [customPanelCount, setCustomPanelCount] = useState(1);

  const load = useCallback(() => { fetchProviders(); }, [fetchProviders]);
  useEffect(() => { load(); }, [load]);

  const openaiProvider = providers.find((p) => p.providerType === "openai") || null;
  const anthropicProvider = providers.find((p) => p.providerType === "anthropic") || null;
  const customProviders = providers.filter((p) => p.providerType === "custom");

  // Ensure we show at least one custom panel
  const customSlots = Math.max(customPanelCount, customProviders.length);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-zinc-300 text-sm font-medium">Cloud Model Providers</h2>
        <p className="text-zinc-600 text-xs mt-1">
          Connect cloud APIs for judging and playground use
        </p>
      </div>
      <div className="space-y-3">
        <ProviderPanel providerType="openai" existing={openaiProvider} onSaved={load} />
        <ProviderPanel providerType="anthropic" existing={anthropicProvider} onSaved={load} />

        {Array.from({ length: customSlots }).map((_, i) => (
          <CustomProviderPanel
            key={customProviders[i]?.id || `new-${i}`}
            existing={customProviders[i] || null}
            onSaved={load}
          />
        ))}

        <button
          onClick={() => setCustomPanelCount((c) => c + 1)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-2xl border border-dashed border-white/[0.08] text-zinc-500 text-xs hover:border-white/[0.15] hover:text-zinc-400 transition-colors"
        >
          <Plus size={13} />
          Add Another Custom Endpoint
        </button>
      </div>
    </div>
  );
}

// ─── Scoring Tab ──────────────────────────────────────────────────────────────

function ScoringTab() {
  const prefs = usePreferencesStore();
  const [wAuto, setWAuto] = useState(Math.round((prefs.weightAuto ?? 0.3) * 100));
  const [wJudge, setWJudge] = useState(Math.round((prefs.weightJudge ?? 0.5) * 100));
  const [wHuman, setWHuman] = useState(Math.round((prefs.weightHuman ?? 0.2) * 100));
  const [saved, setSaved] = useState(false);

  const total = wAuto + wJudge + wHuman;

  const adjustWeight = (changed: "auto" | "judge" | "human", newVal: number) => {
    const clampedVal = Math.min(100, Math.max(0, newVal));
    if (changed === "auto") {
      const remaining = 100 - clampedVal;
      const ratio = (wJudge + wHuman) > 0 ? wJudge / (wJudge + wHuman) : 0.7;
      setWAuto(clampedVal);
      setWJudge(Math.round(remaining * ratio));
      setWHuman(remaining - Math.round(remaining * ratio));
    } else if (changed === "judge") {
      const remaining = 100 - clampedVal;
      const ratio = (wAuto + wHuman) > 0 ? wAuto / (wAuto + wHuman) : 0.6;
      setWJudge(clampedVal);
      setWAuto(Math.round(remaining * ratio));
      setWHuman(remaining - Math.round(remaining * ratio));
    } else {
      const remaining = 100 - clampedVal;
      const ratio = (wAuto + wJudge) > 0 ? wAuto / (wAuto + wJudge) : 0.375;
      setWHuman(clampedVal);
      setWAuto(Math.round(remaining * ratio));
      setWJudge(remaining - Math.round(remaining * ratio));
    }
  };

  const save = async () => {
    const updates = {
      weightAuto: wAuto / 100,
      weightJudge: wJudge / 100,
      weightHuman: wHuman / 100,
    };
    await fetch("/api/preferences", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(updates) });
    prefs.setPreferences(updates);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const reset = () => { setWAuto(30); setWJudge(50); setWHuman(20); };

  const previewAuto = 90, previewJudge = 70, previewHuman = 80;
  const previewScore = Math.round((previewAuto * wAuto + previewJudge * wJudge + previewHuman * wHuman) / 100);

  const sliders = [
    { label: "Auto Checks", desc: "Format, code validity, speed", value: wAuto, key: "auto" as const, color: "bg-blue-500" },
    { label: "Judge Score", desc: "LLM evaluation of quality", value: wJudge, key: "judge" as const, color: "bg-purple-500" },
    { label: "Your Votes", desc: "Thumbs and preferences", value: wHuman, key: "human" as const, color: "bg-emerald-500" },
  ];

  return (
    <div className="space-y-5">
      <GlowCard className="p-5" animate={false}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-zinc-300 text-sm font-medium">Score Weights</h2>
              <InfoTooltip text="Control how auto checks, LLM judge scores, and your manual votes are blended into the final composite score" />
            </div>
            <p className="text-zinc-600 text-xs mt-0.5">How much each layer influences the final score</p>
          </div>
          <button onClick={reset} className="text-zinc-500 text-xs hover:text-zinc-300 transition-colors">
            Reset defaults
          </button>
        </div>

        <div className="space-y-5">
          {sliders.map(({ label, desc, value, key, color }) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1.5">
                <div>
                  <span className="text-zinc-300 text-sm">{label}</span>
                  <span className="text-zinc-600 text-xs ml-2">{desc}</span>
                </div>
                <span className="text-zinc-200 font-mono text-sm font-medium">{value}%</span>
              </div>
              <div className="relative">
                <div className="w-full h-1.5 bg-white/10 rounded-full">
                  <div className={`h-full ${color} rounded-full transition-all`} style={{ width: `${value}%` }} />
                </div>
                <input
                  type="range" min={0} max={100} step={1} value={value}
                  onChange={(e) => adjustWeight(key, parseInt(e.target.value))}
                  className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
                />
              </div>
            </div>
          ))}
        </div>

        <div className={cn("mt-4 text-center text-xs font-medium", total !== 100 ? "text-red-400" : "text-zinc-600")}>
          Total: {total}% {total !== 100 && "(must equal 100%)"}
        </div>
      </GlowCard>

      <GlowCard className="p-4" animate={false}>
        <p className="text-zinc-500 text-xs mb-2">Preview — with these weights:</p>
        <p className="text-zinc-500 text-xs">Auto: 90, Judge: 70, Votes: 80</p>
        <p className="text-zinc-300 text-sm mt-1">
          Final score: <span className="text-zinc-100 font-semibold font-mono">{previewScore}/100</span>
        </p>
        <p className="text-zinc-600 text-xs mt-1">
          When a layer is unavailable, its weight is redistributed proportionally.
        </p>
      </GlowCard>

      <Button variant="primary" size="lg" className="w-full" onClick={save} disabled={total !== 100}>
        {saved ? <><CheckCircle2 size={15} />Saved</> : <><Save size={15} />Save Weights</>}
      </Button>
    </div>
  );
}

// ─── Danger Zone / Data Tab ──────────────────────────────────────────────────

function DangerZoneAction({ title, description, buttonLabel, onConfirm }: {
  title: string;
  description: string;
  buttonLabel: string;
  onConfirm: () => Promise<void>;
  isPrimary?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string | null>(null);

  const execute = async () => {
    setLoading(true);
    try {
      await onConfirm();
      setResult("Done");
      setConfirming(false);
      setTimeout(() => setResult(null), 3000);
    } catch (err) {
      setResult(`Error: ${err}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-start justify-between gap-4 p-4 bg-red-500/[0.04] border border-red-500/10 rounded-xl">
      <div className="flex-1 min-w-0">
        <h3 className="text-zinc-200 text-sm font-medium">{title}</h3>
        <p className="text-zinc-500 text-xs mt-0.5">{description}</p>
        {result && (
          <p className={cn("text-xs mt-2", result.startsWith("Error") ? "text-red-400" : "text-emerald-400")}>
            {result}
          </p>
        )}
      </div>
      <div className="flex-shrink-0">
        {!confirming ? (
          <Button variant="danger" size="sm" onClick={() => setConfirming(true)}>
            {buttonLabel}
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <button onClick={() => setConfirming(false)} className="text-zinc-400 text-xs hover:text-zinc-200">
              Cancel
            </button>
            <Button variant="danger" size="sm" onClick={execute} disabled={loading}>
              {loading ? <Loader2 size={12} className="animate-spin" /> : null}
              Yes, Delete
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function DataTab() {
  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-zinc-300 text-sm font-medium">Danger Zone</h2>
          <InfoTooltip text="Permanently delete stored data. These actions cannot be undone." />
        </div>
        <p className="text-zinc-600 text-xs mt-1">
          Destructive actions that cannot be undone. Proceed with caution.
        </p>
      </div>

      <div className="space-y-3">
        <DangerZoneAction
          title="Clear All Test Data"
          description="Deletes all test runs, results, scores, and votes. Test suites and API keys are kept."
          buttonLabel="Clear Data"
          onConfirm={async () => {
            const res = await fetch("/api/data/runs", { method: "DELETE" });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
          }}
        />

        <DangerZoneAction
          title="Clear Test Suites"
          description="Deletes all custom test suites and their prompts. Built-in starter suites will be restored on next load. Test results referencing these suites are also deleted."
          buttonLabel="Clear Suites"
          onConfirm={async () => {
            const res = await fetch("/api/data/suites", { method: "DELETE" });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
          }}
        />

        <DangerZoneAction
          title="Reset Everything"
          description="Returns ModelSweep to factory state. Deletes ALL data: runs, suites, scores, votes. API keys are also removed. This cannot be undone."
          buttonLabel="Reset Everything"
          isPrimary
          onConfirm={async () => {
            const res = await fetch("/api/data/all", { method: "DELETE" });
            const data = await res.json();
            if (data.error) throw new Error(data.error);
          }}
        />
      </div>
    </div>
  );
}

// ─── About Tab ────────────────────────────────────────────────────────────────

function AboutTab() {
  return (
    <GlowCard className="p-5" animate={false}>
      <h2 className="text-zinc-300 text-sm font-medium mb-3">ModelSweep</h2>
      <div className="space-y-2 text-xs text-zinc-500">
        <p>Compare local LLMs side-by-side with automatic scoring and optional LLM-as-judge.</p>
        <p>All runs are stored locally. No data is sent to external servers.</p>
        <div className="pt-2 border-t border-white/[0.05]">
          <p>Powered by <span className="text-zinc-400">Ollama</span></p>
          <p className="mt-1 text-zinc-600">Cloud provider API keys are stored in SQLite and only sent to the respective provider&apos;s API endpoint.</p>
        </div>
      </div>
    </GlowCard>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: "connection", label: "Connection", icon: <Link2 size={14} /> },
  { id: "cloud", label: "Cloud Providers", icon: <Cloud size={14} /> },
  { id: "scoring", label: "Scoring", icon: <BarChart2 size={14} /> },
  { id: "data", label: "Danger Zone", icon: <Shield size={14} /> },
  { id: "about", label: "About", icon: <Info size={14} /> },
];

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<TabId>("connection");

  return (
    <div className="p-8 max-w-5xl mx-auto">
      <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <h1 className="text-2xl font-semibold text-zinc-100 tracking-tight">Settings</h1>
        <p className="text-zinc-500 text-sm mt-1">Configure ModelSweep</p>
      </motion.div>

      <div className="flex gap-6">
        {/* Vertical tab nav */}
        <div className="w-44 flex-shrink-0">
          <nav className="space-y-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm transition-colors text-left",
                  activeTab === tab.id
                    ? tab.id === "data" ? "bg-red-500/10 text-red-400" : "bg-white/10 text-zinc-200"
                    : tab.id === "data" ? "text-red-400/60 hover:bg-red-500/5 hover:text-red-400" : "text-zinc-500 hover:bg-white/5 hover:text-zinc-300"
                )}
              >
                <span className={
                  activeTab === tab.id
                    ? tab.id === "data" ? "text-red-400" : "text-zinc-300"
                    : tab.id === "data" ? "text-red-500/50" : "text-zinc-600"
                }>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Tab content */}
        <div className="flex-1 min-w-0">
          {activeTab === "connection" && <AnimatePresenceWrapper><ConnectionTab /></AnimatePresenceWrapper>}
          {activeTab === "cloud" && <AnimatePresenceWrapper><CloudTab /></AnimatePresenceWrapper>}
          {activeTab === "scoring" && <AnimatePresenceWrapper><ScoringTab /></AnimatePresenceWrapper>}
          {activeTab === "data" && <AnimatePresenceWrapper><DataTab /></AnimatePresenceWrapper>}
          {activeTab === "about" && <AnimatePresenceWrapper><AboutTab /></AnimatePresenceWrapper>}
        </div>
      </div>
    </div>
  );
}

function AnimatePresenceWrapper({ children }: { children: ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.15 }}
    >
      {children}
    </motion.div>
  );
}
