"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "outline";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "secondary", size = "md", children, ...props }, ref) => {
    const base =
      "inline-flex items-center justify-center gap-2 font-medium rounded-xl transition-all " +
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/20 " +
      "disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 hover:border-blue-500/50",
      secondary:
        "bg-white/5 text-zinc-300 border border-white/[0.08] hover:bg-white/10 hover:text-zinc-100",
      ghost:
        "text-zinc-400 hover:text-zinc-200 hover:bg-white/5",
      danger:
        "bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20",
      outline:
        "bg-transparent border border-zinc-700 text-zinc-300 hover:text-white hover:border-[#00FF66] hover:bg-[#00FF66]/10",
    };

    const sizes = {
      sm: "text-xs px-3 py-1.5 rounded-lg",
      md: "text-sm px-4 py-2",
      lg: "text-base px-5 py-2.5",
    };

    return (
      <button
        ref={ref}
        className={cn(base, variants[variant], sizes[size], className)}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
