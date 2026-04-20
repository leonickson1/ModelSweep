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
      "inline-flex items-center justify-center gap-2 font-medium rounded-md transition-colors " +
      "focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-white/20 " +
      "disabled:opacity-40 disabled:cursor-not-allowed";

    const variants = {
      primary:
        "bg-white text-black hover:bg-zinc-200",
      secondary:
        "text-zinc-400 border border-white/[0.08] hover:text-white hover:border-white/20",
      ghost:
        "text-zinc-500 hover:text-white",
      danger:
        "text-red-400 hover:text-red-300",
      outline:
        "text-zinc-400 border border-white/[0.08] hover:text-white hover:border-white/20",
    };

    const sizes = {
      sm: "text-xs px-2.5 py-1.5",
      md: "text-sm px-3.5 py-2",
      lg: "text-sm px-5 py-2.5",
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
