"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  ClipboardList,
  BarChart2,
  Cpu,
  Beaker,
  Settings,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useConnectionStore } from "@/store/connection-store";

const NAV_ITEMS = [
  { href: "/", icon: LayoutDashboard, label: "Dashboard" },
  { href: "/suite", icon: ClipboardList, label: "Test Suites" },
  { href: "/results", icon: BarChart2, label: "Results" },
  { href: "/models", icon: Cpu, label: "Models" },
  { href: "/playground", icon: Beaker, label: "Playground" },
];

const BOTTOM_ITEMS = [
  { href: "/settings", icon: Settings, label: "Settings" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { status } = useConnectionStore();

  const statusColor = {
    connected: "bg-[#00FF66] shadow-[0_0_8px_#00FF66]",
    connecting: "bg-yellow-500 animate-pulse",
    disconnected: "bg-red-500",
  }[status];

  return (
    <aside className="w-[220px] flex-shrink-0 flex flex-col border-r border-zinc-800/40 bg-[#000000]">
      {/* Logo */}
      <div className="p-5 pb-4 border-b border-zinc-800/40">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-none border border-[#00FF66]/30 bg-[#00FF66]/5 flex items-center justify-center">
            <Zap size={14} className="text-[#00FF66]" />
          </div>
          <span className="text-white font-mono font-bold uppercase tracking-widest text-xs">Pilot.SYS</span>
        </div>

        {/* Connection status */}
        <div className="flex items-center gap-2 mt-4">
          <div className={cn("w-1.5 h-1.5 rounded-full", statusColor)} />
          <span className="text-zinc-500 font-mono text-[10px] uppercase tracking-widest">
            {status === "connected" ? "Ollama Online" : status === "connecting" ? "Connecting..." : "Ollama Offline"}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}
      </nav>

      {/* Bottom items */}
      <div className="p-3 space-y-0.5 border-t border-white/[0.06]">
        {BOTTOM_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href} />
        ))}
      </div>
    </aside>
  );
}

interface NavItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  active: boolean;
}

function NavItem({ href, icon: Icon, label, active }: NavItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2.5 text-xs font-mono uppercase tracking-widest transition-all",
        "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[#00FF66] border border-transparent",
        active
          ? "bg-[#00FF66]/10 text-[#00FF66] border-[#00FF66]/20"
          : "text-zinc-500 hover:text-white hover:bg-zinc-900"
      )}
    >
      <Icon size={14} />
      <span>{label}</span>
    </Link>
  );
}
