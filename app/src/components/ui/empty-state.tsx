"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn(
        "flex flex-col items-center justify-center text-center p-12",
        className
      )}
    >
      <div className="text-zinc-600 mb-4">{icon}</div>
      <h3 className="text-zinc-300 font-semibold text-base mb-1.5">{title}</h3>
      <p className="text-zinc-500 text-sm max-w-sm">{description}</p>
      {action && <div className="mt-6">{action}</div>}
    </motion.div>
  );
}

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
  className?: string;
}

export function ErrorState({ message, onRetry, className }: ErrorStateProps) {
  return (
    <div className={cn("flex items-center gap-3 p-4 rounded-xl bg-red-500/10 border border-red-500/20", className)}>
      <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
      <p className="text-red-400 text-sm flex-1">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-red-400 text-xs underline hover:text-red-300 focus-visible:outline-none"
        >
          Retry
        </button>
      )}
    </div>
  );
}
