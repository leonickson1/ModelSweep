"use client";

import { cn } from "@/lib/utils";

interface GlowCardProps {
  children: React.ReactNode;
  className?: string;
  glowColor?: string;
  animate?: boolean;
  delay?: number;
  onClick?: () => void;
}

export function GlowCard({
  children,
  className,
  onClick,
}: GlowCardProps) {
  return (
    <div
      onClick={onClick}
      className={cn(
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </div>
  );
}
