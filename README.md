# yacomp

**Yet Another Comparison Viewer** — a userscript for side-by-side screenshot comparison on tracker and image hosting sites.

Hover to switch sources, scroll through rows, zoom and pan, and apply visual analysis filters — all without leaving the page.

## Supported Sites

| Site | How it works |
|------|-------------|
| **HDBits** | Detects image grids in forum posts, adds "Show comparison" links |
| **PassThePopcorn** | Hijacks PTP's built-in comparison viewer with a better one |
| **UNIT3D** | Hijacks UNIT3D's built-in comparison viewer on Blutopia and Aither |
| **slow.pics** | Adds a viewer button to comparison pages |

## Features

- **Hover to compare** — move the mouse across the image to switch between sources
- **Keyboard navigation** — arrow keys or vim keys (H/J/K/L) to change source/row, 1-9 for direct source selection
- **Zoom & pan** — `+`/`-` to zoom, `0` to fit, `O` for 1:1, Ctrl+Wheel for cursor-centered zoom, drag to pan
- **Visual filters** — press `F` to cycle through:
  - Solar curve (x1, x2) — exaggerates compression artifacts
  - Residual — high-pass filter showing fine detail differences
  - Luma — grayscale view using correct BT.709/BT.2020 coefficients
  - Chroma — isolated color channel view
- **Brightness / Contrast** — per-source adjustment: `[` / `]` to adjust brightness, `{` / `}` for contrast on the current source only; `\` to reset current source, `Shift+\` to reset all
- **Auto colorspace detection** — reads ICC profiles from PNG/JPEG headers to apply correct BT.709 or BT.2020 luma/chroma matrices
- **Lazy loading** — rows load as you scroll; press `B` to background-load everything
- **Navigation minimap** — appears when zoomed in, drag to jump around; toggle with `M`
- **Row nav sidebar** — numbered dots for quick row switching; toggle with `R`

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F` / `Shift+F` | Cycle filter forward / backward |
| `[` / `]` | Brightness down / up (current source) |
| `{` / `}` | Contrast down / up (current source) |
| `\` | Reset current source B/C |
| `Shift+\` | Reset all sources B/C |
| `+` / `-` | Zoom in / out |
| `0` | Fit to window |
| `O` | 1:1 zoom |
| `H` / `L` or `Left` / `Right` | Previous / next source |
| `K` / `J` or `Up` / `Down` | Previous / next row |
| `1`-`9` | Jump to source N |
| `M` | Toggle minimap |
| `R` | Toggle row nav |
| `B` | Toggle background loading |
| `Esc` | Reset filters, or close viewer |

## Install

1. Install [Tampermonkey](https://www.tampermonkey.net/) or [Violentmonkey](https://violentmonkey.github.io/)
2. Install directly from the [latest release](https://github.com/daylinear74/yacomp/releases/latest/download/yacomp.user.js) — your userscript manager will pick it up automatically
3. Updates are delivered automatically via the `@updateURL` in the script header

## Development

Requires [Bun](https://bun.sh/).

```bash
bun install           # Install deps + set up git hooks

bun run build         # Build → dist/yacomp.user.js
bun run watch         # Auto-rebuild on file changes
bun run typecheck     # Type-check only (no output)
bun run verify        # Verify build output integrity
bun run check         # Full pipeline: typecheck + build + verify
bun run clean         # Remove dist/
```

## License

MIT
