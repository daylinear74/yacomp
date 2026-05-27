# yacomp

![CI](https://github.com/daylinear74/yacomp/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-black)

**Yet Another Comparison Viewer** — a userscript for side-by-side screenshot
comparison on tracker and image hosting sites.

yacomp gives comparison pages a consistent fullscreen viewer across different
sites: hover to switch sources, navigate rows from the keyboard, zoom and pan,
and use visual filters to inspect compression artifacts, luma/chroma
differences, brightness drift, and gamma mismatches.

## Supported Sites

| Integration style | Sites |
| --- | --- |
| Detect grids | HDB |
| Replace native viewer | PTP, BLU, ATH, BHD, GPW, SSD, FRDS |
| Add viewer mode | slow.pics, comp.pics |

## Install & Usage

Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/)
or [Violentmonkey](https://violentmonkey.github.io/), then **[click here to
install the latest release](https://github.com/daylinear74/yacomp/releases/latest/download/yacomp.user.js)**.

- On grid-detection sites, yacomp adds a **Show comparison** link near detected
  screenshot grids.
- On native-viewer sites, use the site's comparison UI as usual; yacomp takes
  over when the viewer opens.
- On slow.pics and comp.pics, yacomp adds a native-style button that opens the
  current comparison in yacomp.

## Features

- **Consistent comparison viewer**: open supported site comparisons in the same
  fullscreen UI.
- **Fast source and row navigation**: hover, arrow/vim keys, and number keys for
  switching sources and rows.
- **Zoom and pan**: fit, 1:1, incremental zoom, `Ctrl` + wheel zoom, drag
  panning, minimap, and row navigation.
- **Visual filters**: solar, residual, luma, and chroma modes for artifact and
  channel inspection.
- **Per-source adjustments**: brightness, contrast, and gamma mismatch checks
  for the selected source.
- **Colorspace-aware luma/chroma**: BT.709/BT.2020 handling from URL hints or
  PNG/JPEG ICC profile data when available.
- **Lazy loading**: rows load on demand, with optional background loading and
  synchronization for dynamically added images.

## Shortcuts

| Key | Action |
| --- | --- |
| `V` | Open yacomp viewer on slow.pics / comp.pics comparison pages |
| `F` / `Shift+F` | Cycle visual filter forward / backward |
| `[` / `]` | Decrease / increase brightness for the current source |
| `{` / `}` | Decrease / increase contrast for the current source |
| `G` / `Shift+G` | Cycle gamma mismatch check for the current source |
| `\` | Reset adjustments for the current source |
| `Shift+\` | Reset adjustments for all sources |
| `+` / `-` | Zoom in / out |
| `Ctrl` + wheel | Cursor-centered zoom |
| `0` | Fit to window |
| `O` | Show image at 1:1 |
| `C` | Toggle canvas fill / fit |
| `H` / `L` or `Left` / `Right` | Previous / next source |
| `K` / `J` or `Up` / `Down` | Previous / next row |
| `1`-`9` | Jump to source number |
| `M` | Toggle minimap |
| `R` | Toggle row navigation |
| `B` | Toggle background loading |
| `Esc` | Reset active adjustments, or close the viewer |

## Configuration

Open the settings panel from the userscript manager menu (**yacomp Settings**).
Settings persist via `GM_setValue` and are scoped per userscript manager.

- **Viewer defaults** — initial zoom mode (`Fit` / `1:1`), the meaning of
  100% in the zoom indicator (`Original` native pixels vs `Fit` to viewport),
  brief/verbose zoom info, canvas fill vs fit, minimap, background loading,
  hover-to-switch source, and close-button position (auto / left / right).
- **Adjustments** — brightness/contrast step size, toast duration, zoom scale
  factor, and lazy-load margin.
- **Sites** — enable or disable yacomp per supported site without uninstalling.
- **Filter cycle** — pick which visual filters are reachable via `F` /
  `Shift+F`, and drag to reorder them.
- **Gamma cycle** — pick which gamma-mismatch presets are reachable via `G` /
  `Shift+G`, and drag to reorder them.

A schema version is stored alongside the config; older payloads are migrated
forward on first load, and unknown or out-of-range values fall back to the
built-in defaults.

## Development

The project uses Bun and TypeScript. The built userscript is written to
`dist/yacomp.user.js`.

```bash
bun install
bun run build       # Build dist/yacomp.user.js
bun run watch       # Rebuild when src/ changes
bun run typecheck   # Type-check without emitting files
bun run typecheck:tests # Type-check tests and Playwright config
bun run verify      # Sanity-check the generated userscript
bun run test        # Run unit tests
bunx playwright install chromium # Install local browser for e2e tests
bun run test:e2e    # Run Playwright viewer tests
bun run fixture     # Serve the local viewer fixture
bun run check       # typecheck + build + verify
bun run clean       # Remove dist/
```

Core code lives in `src/`: `sites/` contains site adapters, `viewer/` contains
the fullscreen comparison UI, and `filters/` contains zoom, colorspace, and
visual filter logic. Userscript metadata and URL matches live in
`meta/banner.txt`.

For new site support, parse the page into the shared grid model and reuse the
existing viewer instead of adding site-specific viewer behavior.

Unit tests live in `tests/unit`. Playwright e2e tests live in `tests/e2e` and
use the local fixture in `tests/fixtures/viewer`, so viewer controls can be
tested without external network access.

CI runs type-checking, build verification, unit tests, installs Playwright
Chromium, and runs the e2e suite for pushes and pull requests targeting `main`.
Releases are tag-driven: pushing a `v*` tag builds and uploads
`dist/yacomp.user.js`.

## License

MIT
