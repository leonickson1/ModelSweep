import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
      },
      colors: {
        zinc: {
          950: "#09090b",
        },
        model: {
          llama: "#f59e0b",
          qwen: "#3b82f6",
          mistral: "#8b5cf6",
          deepseek: "#10b981",
          gemma: "#f43f5e",
          phi: "#06b6d4",
          other: "#a1a1aa",
        },
        neon: {
          green: "#00FF66",
        },
      },
      backdropBlur: {
        xs: "2px",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "spin-slow": "spin 3s linear infinite",
      },
      boxShadow: {
        glow: "0 0 40px rgba(59, 130, 246, 0.15)",
        "glow-amber": "0 0 40px rgba(245, 158, 11, 0.15)",
        "glow-violet": "0 0 40px rgba(139, 92, 246, 0.15)",
        "glow-emerald": "0 0 40px rgba(16, 185, 129, 0.15)",
        "glow-rose": "0 0 40px rgba(244, 63, 94, 0.15)",
        "glow-cyan": "0 0 40px rgba(6, 182, 212, 0.15)",
        "glow-neon": "0 0 40px rgba(0, 255, 102, 0.2)",
        "glow-neon-strong": "0 0 60px rgba(0, 255, 102, 0.4)",
        card: "0 8px 32px rgba(0,0,0,0.4)",
      },
    },
  },
  plugins: [],
};

export default config;
