"use client";

import { motion } from "framer-motion";
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
  glowColor,
  animate = true,
  delay = 0,
  onClick,
}: GlowCardProps) {
  const sharedClass = cn(
    "relative bg-[#030303] border border-zinc-800/60 rounded-none sm:rounded-sm",
    "shadow-none",
    onClick && "cursor-pointer hover:border-zinc-700 transition-colors",
    className
  );

  const inner = (
    <>
      {glowColor && (
        <div
          className="absolute inset-0 -z-10 blur-3xl rounded-full opacity-60 pointer-events-none"
          style={{ background: glowColor }}
        />
      )}
      {children}
    </>
  );

  if (!animate) {
    return (
      <div onClick={onClick} className={sharedClass}>
        {inner}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.25, 0.1, 0.25, 1], delay }}
      onClick={onClick}
      className={sharedClass}
    >
      {inner}
    </motion.div>
  );
}
