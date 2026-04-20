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

  return (
    <aside className="w-[260px] flex-shrink-0 flex flex-col border-r border-white/5 bg-[#080808]">
      {/* Logo */}
      <div className="px-6 pt-8 pb-8">
        <span className="text-white text-[20px] font-semibold tracking-tight">ModelSweep</span>
        <div className="flex items-center gap-2 mt-2">
          <div className={cn(
            "w-2 h-2 rounded-full",
            status === "connected" ? "bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.4)]" : status === "connecting" ? "bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.4)]" : "bg-red-400"
          )} />
          <span className="text-zinc-500 font-medium text-[13px]">
            {status === "connected" ? "Online" : status === "connecting" ? "Connecting" : "Offline"}
          </span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 space-y-0.5">
        {NAV_ITEMS.map((item) => (
          <NavItem key={item.href} {...item} active={pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href))} />
        ))}
      </nav>

      {/* Bottom */}
      <div className="px-3 pb-4">
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
        "flex items-center gap-3 px-4 py-3 text-[15px] font-medium rounded-xl transition-all",
        active
          ? "text-white bg-white/10 shadow-sm"
          : "text-zinc-400 hover:text-white hover:bg-white/[0.04]"
      )}
    >
      <Icon size={18} strokeWidth={2} />
      <span>{label}</span>
    </Link>
  );
}
