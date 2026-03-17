"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Command, LayoutDashboard, ClipboardList, BarChart2,
  Cpu, Beaker, Settings, Search, ArrowRight,
} from "lucide-react";
import { useModelsStore } from "@/store/models-store";

const STATIC_COMMANDS = [
  { id: "dashboard", label: "Go to Dashboard", href: "/", icon: LayoutDashboard, group: "Navigation" },
  { id: "suites", label: "Go to Test Suites", href: "/suite", icon: ClipboardList, group: "Navigation" },
  { id: "results", label: "Go to Results", href: "/results", icon: BarChart2, group: "Navigation" },
  { id: "models", label: "Go to Models", href: "/models", icon: Cpu, group: "Navigation" },
  { id: "playground", label: "Go to Playground", href: "/playground", icon: Beaker, group: "Navigation" },
  { id: "settings", label: "Go to Settings", href: "/settings", icon: Settings, group: "Navigation" },
];

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const router = useRouter();
  const { models } = useModelsStore();

  const allCommands = [
    ...STATIC_COMMANDS,
    ...models.map((m) => ({
      id: `model-${m.name}`,
      label: `View ${m.name}`,
      href: `/models/${encodeURIComponent(m.name)}`,
      icon: Cpu,
      group: "Models",
    })),
  ];

  const filtered = query
    ? allCommands.filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    : allCommands;

  const grouped = filtered.reduce<Record<string, typeof allCommands>>((acc, cmd) => {
    acc[cmd.group] = [...(acc[cmd.group] || []), cmd];
    return acc;
  }, {});

  const handleSelect = useCallback(
    (href: string) => {
      router.push(href);
      setOpen(false);
      setQuery("");
    },
    [router]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -10 }}
              transition={{ duration: 0.15 }}
              className="pointer-events-auto w-full max-w-lg bg-zinc-900 border border-white/10 rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.7)] overflow-hidden"
            >
              {/* Search input */}
              <div className="flex items-center gap-3 px-4 py-3 border-b border-white/[0.06]">
                <Search size={16} className="text-zinc-500 flex-shrink-0" />
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Type a command or search..."
                  className="flex-1 bg-transparent text-zinc-100 text-sm placeholder:text-zinc-600 outline-none"
                />
                <kbd className="text-zinc-600 text-xs bg-white/5 px-1.5 py-0.5 rounded border border-white/10">ESC</kbd>
              </div>

              {/* Results */}
              <div className="max-h-80 overflow-y-auto p-2">
                {Object.entries(grouped).map(([group, commands]) => (
                  <div key={group} className="mb-2">
                    <div className="px-2 py-1 text-xs text-zinc-600 font-medium">{group}</div>
                    {commands.map((cmd) => (
                      <button
                        key={cmd.id}
                        onClick={() => handleSelect(cmd.href)}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-sm text-zinc-300 hover:bg-white/5 hover:text-zinc-100 transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
                      >
                        <cmd.icon size={15} className="text-zinc-500" />
                        <span className="flex-1">{cmd.label}</span>
                        <ArrowRight size={13} className="text-zinc-700" />
                      </button>
                    ))}
                  </div>
                ))}
                {filtered.length === 0 && (
                  <div className="px-4 py-8 text-center text-zinc-600 text-sm">
                    No commands found for &quot;{query}&quot;
                  </div>
                )}
              </div>

              {/* Footer */}
              <div className="border-t border-white/[0.06] px-4 py-2 flex items-center gap-4">
                <div className="flex items-center gap-1.5 text-xs text-zinc-600">
                  <Command size={11} />
                  <span>K to toggle</span>
                </div>
                <div className="text-xs text-zinc-600">↑↓ navigate · ↵ select</div>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
