---
name: modelsweep-design
description: ModelSweep-specific design system, color tokens, component patterns, and data integration rules. Use alongside the frontend-design skill for all ModelSweep UI work.
---

# ModelSweep Design System

This skill defines the specific visual identity and technical patterns for ModelSweep,
an open-source evaluation workbench for local LLMs. Use this alongside the
frontend-design skill. The frontend-design skill handles general aesthetic quality.
This skill handles ModelSweep-specific identity, data patterns, and constraints.

## Aesthetic Direction

ModelSweep's aesthetic is "observatory control room meets editorial data journalism."
Think Bloomberg Terminal elegance, not startup landing page energy. Think The Pudding's
data essays, not a SaaS dashboard. The UI should feel like a place where serious
decisions are made about which AI models to trust, presented with the visual
confidence of a well-designed research publication.

Key feeling: calm authority. Not flashy, not boring. Confident, precise, beautiful.

## Theme System

ModelSweep supports two themes. Both must be implemented for every component.
Use CSS custom properties on `<html>` for all color values.

### Dark Theme (class="dark", default)

The dark theme uses deep obsidian backgrounds with frosted glass surfaces and
colored ambient glows behind model-related elements.

```
--bg-base:           #09090b        Page background (zinc-950)
--bg-surface:        rgba(255,255,255,0.04)   Glass panels
--bg-surface-hover:  rgba(255,255,255,0.07)   Hover state
--border-subtle:     rgba(255,255,255,0.06)   Panel edges
--text-heading:      #f4f4f5        Headings (zinc-100)
--text-body:         #a1a1aa        Body copy (zinc-400)
--text-muted:        #52525b        Timestamps (zinc-600)
--shadow-panel:      0 8px 32px rgba(0,0,0,0.4)
```

Surface pattern for dark:
```css
.panel {
  background: var(--bg-surface);
  backdrop-filter: blur(12px);
  border: 1px solid var(--border-subtle);
  border-radius: 1rem;
  box-shadow: var(--shadow-panel);
}
```

### Light Theme (class="light")

The light theme uses warm paper-like backgrounds with solid white surfaces
and soft layered shadows. NOT pure white. Warm stone tones.

```
--bg-base:           #fafaf9        Warm off-white (stone-50)
--bg-surface:        #ffffff        Solid white panels
--bg-surface-hover:  #f5f5f4        Hover (stone-100)
--border-subtle:     rgba(0,0,0,0.07)    Soft borders
--text-heading:      #1c1917        Headings (stone-900)
--text-body:         #57534e        Body copy (stone-600)
--text-muted:        #a8a29e        Timestamps (stone-400)
--shadow-panel:      0 1px 3px rgba(0,0,0,0.06), 0 8px 24px rgba(0,0,0,0.03)
```

Surface pattern for light:
```css
.panel {
  background: var(--bg-surface);
  backdrop-filter: none;
  border: 1px solid var(--border-subtle);
  border-radius: 1rem;
  box-shadow: var(--shadow-panel);
}
```

### Button Colors (both themes)

| Type | Dark BG | Dark Text | Light BG | Light Text |
|------|---------|-----------|----------|------------|
| Primary | zinc-100 (#f4f4f5) | zinc-900 | zinc-900 (#18181b) | white |
| Secondary | transparent | zinc-300 | transparent | stone-700 |
| Danger | red-500/15 | red-400 | red-50 | red-600 |
| Positive | emerald-500/15 | emerald-400 | green-50 | green-600 |

## Model Signature Colors

Every LLM model family has a fixed accent color. This color is used for chart
lines, progress rings, sidebar indicators, ambient glows (dark), and left-border
accents (light). These NEVER change between themes. Only their application method
changes (glow vs border-accent).

```
llama / meta:       amber    #f59e0b
qwen / alibaba:     blue     #3b82f6
mistral:            violet   #8b5cf6
deepseek:           emerald  #10b981
gemma / google:     rose     #f43f5e
phi / microsoft:    cyan     #06b6d4
openai:             green    #22c55e
anthropic:          orange   #f97316
unknown / other:    zinc     #71717a
```

In dark theme, apply as ambient glow:
```html
<div class="absolute inset-0 -z-10 opacity-[0.08] blur-3xl rounded-full"
     style="background: var(--model-color)" />
```

In light theme, apply as left border + tinted background:
```html
<div class="border-l-4 bg-[var(--model-color)]/5"
     style="border-color: var(--model-color)" />
```

## Typography

Use exactly two font families loaded via Google Fonts or next/font:

- **Display / headings**: "DM Sans" weight 500-700. Tracking tight (-0.025em).
  Clean, geometric, professional. Not generic like Inter but not distracting.
- **Mono / numbers / stats**: "JetBrains Mono" weight 400-500. For scores,
  tokens/sec, model names, code snippets. Use tabular-nums for aligned columns.

Body text uses DM Sans at weight 400.

Heading scale:
- Page title: text-2xl font-semibold tracking-tight
- Section title: text-lg font-medium tracking-tight
- Card title: text-base font-medium
- Label: text-sm font-medium text-[var(--text-muted)]
- Body: text-sm leading-relaxed text-[var(--text-body)]
- Stat number: text-3xl font-mono font-semibold tabular-nums

## Data Integration Rules

Every component that displays data must follow these patterns:

### Ollama API Endpoints (primary data source)
```
GET  /api/tags       list installed models
GET  /api/ps         currently loaded models
POST /api/show       model metadata (family, params, quantization, license)
POST /api/chat       inference with streaming
POST /api/generate   preload (keep_alive:-1) and unload (keep_alive:0)
```

### Cloud Provider Endpoints (optional, configured in Settings)
```
OpenAI:    POST https://api.openai.com/v1/chat/completions
Anthropic: POST https://api.anthropic.com/v1/messages
Google:    POST https://generativelanguage.googleapis.com/v1/models/{model}:generateContent
Custom:    POST {user_base_url}/v1/chat/completions
```

### Component State Requirements

Every component that fetches data MUST implement these four states:

1. **Loading**: Skeleton placeholder using bg-[var(--bg-surface)] animate-pulse.
   Match the shape of the expected content. Never use a spinner.

2. **Error**: Inline message below the component header. Include a retry button.
   Never use a modal or browser alert. Text: text-red-400 (dark) / text-red-600 (light).

3. **Empty**: Helpful message with an action. Example: "No test results yet.
   Run your first test suite to see scores here." Include a primary action button.

4. **Disconnected**: If the component depends on Ollama and Ollama is not
   running, show a subtle banner: "Ollama not detected at localhost:11434.
   Start Ollama to see your models." Do NOT block the entire page. Other
   data (history from SQLite) should still display.

## Score Display Convention

- Overall score: 0-100, displayed as large number with "/100" suffix in muted text
- Category scores: 0-100, displayed as horizontal bars with number label
- Speed: displayed as "XX t/s" (tokens per second), font-mono
- Progress rings: stroke-width 3, track color var(--bg-surface), fill color is
  model signature color, animated on mount (draw from 0 to value over 600ms)

## Animation Guidelines

Use Framer Motion for React. CSS transitions for simple hover/focus states.

- Page entry: elements fade in from y:12 to y:0, opacity 0 to 1, staggered
  by 50ms per element, duration 300ms, easeOut
- Charts: animate on data load. Radar draws segments sequentially. Bars grow
  from 0 width. Progress rings draw clockwise.
- Hover: scale(1.01) on cards, brightness increase on buttons. Duration 150ms.
- Theme transition: all color properties transition over 200ms.
- Do NOT: bounce, spring on text, rotate elements, use parallax, or add
  loading animations longer than 300ms. Subtle and swift. Never distracting.

## What This App Is NOT

- NOT a chat interface. Never generate chat bubbles, message lists, or
  conversation threads.
- NOT a landing page. No hero sections, no CTAs, no testimonials.
- It IS a data-rich workbench. Think Grafana, Vercel Dashboard, Linear.
  Dense but not cluttered. Every pixel earns its place.

## Layout Structure

- Sidebar navigation (collapsible, 240px expanded, 64px collapsed)
- Main content area with max-width 1400px, centered
- Pages use CSS Grid for multi-column layouts: grid-cols-1 lg:grid-cols-2
  for comparison views, grid-cols-1 lg:grid-cols-3 for card grids
- Responsive: at <768px, sidebar becomes bottom tab bar, grids collapse
  to single column

## File & Directory Conventions

```
src/
  app/                    Next.js App Router pages
    layout.tsx            Root layout with theme provider, font loading
    page.tsx              Dashboard
    suite/
    results/
    models/
    playground/
    community/
    settings/
  components/
    ui/                   Primitives (Panel, Button, Badge, ProgressRing, etc.)
    charts/               Radar, Bar, SpeedComparison, TrendLine
    models/               ModelCard, ModelBadge, ModelColorDot
    scoring/              ScoreDisplay, VoteButtons, ScoreBreakdown
    layout/               Sidebar, TopBar, CommandPalette
  lib/
    ollama.ts             Ollama API client
    providers/            Cloud provider adapters (openai.ts, anthropic.ts, etc.)
    scoring.ts            Auto-scoring engine
    db.ts                 SQLite connection and queries
    store.ts              Zustand stores
    colors.ts             Model family color mapping
    share.ts              Share image generation
  types/
    index.ts              All TypeScript interfaces
```
