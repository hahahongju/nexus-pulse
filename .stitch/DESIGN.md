# Design System: NexusPulse Telemetry OS

## 1. Visual Theme & Atmosphere
- **Atmosphere**: Cockpit Dense (Density: 8.5/10), Asymmetric Technical Grid (Variance: 7/10), Fluid Restrained Micro-motion (Motion: 6/10).
- **Aesthetic**: Clinical aerospace mission-control telemetry. Crisp typographic hierarchy, physical hardware tactile feedback, zero oversaturated AI slop, zero purple neon haze, and restrained luminous accents against deep charcoal and obsidian substrates.

## 2. Color Palette & Functional Roles
- **Obsidian Canvas** (`#09090b` / `zinc-950`): Deep background substrate. Never pure black `#000000`.
- **Card Substrate** (`#121215` / `rgba(18, 18, 21, 0.85)`): Elevated container surface with 16px backdrop blur.
- **Surface Hover** (`#18181b` / `zinc-900`): Interactive elements hover state.
- **Whisper Border** (`rgba(255, 255, 255, 0.08)` / `rgba(39, 39, 42, 0.8)`): 1px razor-sharp structural divider.
- **Charcoal Muted** (`#71717a` / `zinc-500`): Secondary descriptions, units, and structural metadata.
- **Slate Text** (`#a1a1aa` / `zinc-400`): Sub-headers, secondary labels.
- **Pure Crisp Text** (`#f4f4f5` / `zinc-100`): Primary headings and active values.
- **Telemetry Precision Cyan** (`#06b6d4` / `cyan-500`): Primary active telemetry stream, data packets, clock sync.
- **System Emerald** (`#10b981` / `emerald-500`): Normal operating parameters, healthy daemons, online nodes.
- **System Amber** (`#f59e0b` / `amber-500`): Approaching warning thresholds, throttled I/O.
- **Critical Rose** (`#f43f5e` / `rose-500`): Critical threshold breaches, daemon failures, killed tasks.

## 3. Typographic Architecture
- **Font Stack**:
  - Primary UI: `Inter`, system-ui, -apple-system, sans-serif
  - Telemetry & Metrics: `JetBrains Mono`, `Fira Code`, monospace
- **High-Density Number Override**:
  - All percentages, temperatures, frequencies, memory counters, byte rates, and timestamps MUST use `font-mono tabular-nums`.
- **Hierarchy**:
  - Display Title: 1.125rem (18px), tracking-wider, font-bold, uppercase.
  - Section Labels: 0.6875rem (11px), tracking-widest, font-semibold, uppercase, text-zinc-400.
  - Telemetry Numbers: 1.875rem (30px), tracking-tight, font-mono, font-bold.
  - Metadata Units: 0.75rem (12px), font-mono, text-zinc-500.

## 4. Component Stylings & Interaction
- **Cards (`.stitch-panel`)**:
  - 0.75rem (12px) border radius.
  - 1px whisper border (`border-zinc-800/80` or `border-white/[0.08]`).
  - Flat elevation with subtle tinted ambient shadow (`shadow-lg shadow-black/40`).
  - No bloated glowing shadows. Micro-border brighten on hover.
- **Tactile Buttons (`.stitch-btn`)**:
  - Spring-like active state: `active:translate-y-[1px] active:scale-[0.99]`.
  - Subtle inset highlight: `shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]`.
  - Focused rings: `focus-visible:ring-2 focus-visible:ring-cyan-500/50`.
- **Navigation Tabs**:
  - Segmented control dock style with active indicator pill.
  - Clean spatial badge counters with restrained borders.
- **Sparklines & Charts**:
  - Anti-aliased stroke width (1.5px - 2px).
  - Subtle bottom gradient fade with max 15% opacity.
  - High-precision crosshairs and tooltips without neon flares.

## 5. Anti-Patterns (Enforced Banned List)
- ❌ No oversaturated purple/blue AI neon gradients (`from-purple-600 to-pink-600` glow).
- ❌ No pure black (`#000000`).
- ❌ No blurry neon box-shadows (`box-shadow: 0 0 30px #00f0ff`).
- ❌ No emojis in telemetry or technical UI. Use Lucide icons instead.
- ❌ No fake statistics or filler copy.
- ❌ No 100vh height bugs — use `min-h-[100dvh]`.
- ❌ No generic unaligned card layouts — crisp 12-column or 4-column balanced grids.
