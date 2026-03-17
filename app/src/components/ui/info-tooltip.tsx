'use client';

import { useState } from 'react';
import { Info } from 'lucide-react';

interface InfoTooltipProps {
  text: string;
}

export function InfoTooltip({ text }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <span
      className="relative inline-flex items-center"
      onMouseEnter={() => setVisible(true)}
      onMouseLeave={() => setVisible(false)}
    >
      <Info
        size={13}
        className="text-zinc-600 hover:text-zinc-400 transition-colors cursor-help flex-shrink-0"
      />
      {visible && (
        <span className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 z-50 w-56 px-3 py-2 text-xs text-zinc-300 bg-zinc-900 border border-white/10 rounded-lg shadow-xl pointer-events-none whitespace-normal leading-relaxed">
          {text}
        </span>
      )}
    </span>
  );
}
