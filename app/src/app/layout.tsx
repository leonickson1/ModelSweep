import type { Metadata } from "next";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { ConnectionProvider } from "@/components/layout/connection-provider";
import { CommandPalette } from "@/components/layout/command-palette";

export const metadata: Metadata = {
  title: "ModelSweep — Local LLM Evaluation",
  description: "Build personal test suites, run evaluations across Ollama models, and visualize results.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className="antialiased bg-[#030303] text-zinc-100 min-h-screen relative overflow-hidden">
        <ConnectionProvider>
          <div className="flex h-screen relative z-0">
            <Sidebar />
            <main className="flex-1 overflow-y-auto overflow-x-hidden relative h-full">
              {children}
            </main>
          </div>
          <CommandPalette />
        </ConnectionProvider>
      </body>
    </html>
  );
}
