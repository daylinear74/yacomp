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
- On HDB forum pages, yacomp also adds a **Custom comparison** fallback below
  the page title. Use it when forum markup is too irregular for safe automatic
  detection: click or drag across screenshots, enter the column count, and build
  a viewer with `Source 1`, `Source 2`, ... column names.
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

### Viewer defaults

- **Initial zoom mode** (`Fit` / `1:1`) — whether the viewer opens scaled to
  fit the viewport or at native 1:1 pixels. Default `1:1`.
- **Zoom indicator base** (`Original` / `Fit`) — what 100% in the zoom HUD
  refers to. `Original` means 100% = source's native pixels; `Fit` means
  100% = scaled-to-viewport. Default `Original`.
- **Verbose zoom info** — when on, the zoom toast adds pixel counts and
  viewport callouts; when off, the toast is a single-line percentage label.
  Default off.
- **Fill canvas by default** — whether each row canvas fills the viewport
  (cropping) or fits inside it (letterbox) at open. Toggle later with `C`.
  Default off (fit).
- **Minimap by default** — whether the thumbnail navigation minimap is on at
  open. Toggle later with `M`. Default on.
- **Background loading by default** — when on, all rows start downloading
  immediately at open rather than waiting for lazy-load. Toggle later with
  `B`. Default off.
- **Hover to switch source** — when on, moving the cursor across a row
  switches the visible source by horizontal position; when off, switching
  requires the keyboard or source menu. Default on.
- **Close button position** (`Auto` / `Left` / `Right`) — `Auto` places the
  button on the left on macOS and on the right elsewhere, to match each
  platform's native window controls.

### Adjustments

- **Brightness / contrast step** — the increment applied per `[` / `]` and
  `{` / `}` press. Range 0.01–0.25, default 0.05.
- **Toast duration** — how long a HUD toast stays visible, in milliseconds.
  Range 500–10000 ms, default 2000 ms.
- **Zoom scale factor** — the multiplier applied per `+` / `-` press. 1.25
  means each step grows or shrinks the image by 25%. Range 1.05–2.0, default
  1.25.
- **Lazy-load margin** — how far outside the visible area, in pixels,
  deferred rows start downloading. Measured in CSS pixels against the
  viewer's scroll container, **not** relative to image size, so the number
  of rows actually covered shifts with the current zoom (a row rendered
  smaller fits more of the margin). Range 0–2000 px, default 200 px. Set to
  0 to load only when a row enters view; raise it to start downloads earlier
  at the cost of bandwidth.

### Sites

Per-site toggle for every supported integration (HDB, PTP, BLU, ATH, BHD,
GPW, SSD, FRDS, slow.pics, comp.pics). Disabling a site stops yacomp from
injecting on that site without requiring an uninstall — useful for
temporarily falling back to a site's native viewer.

### Filter cycle

Pick which visual filters are reachable via `F` / `Shift+F`, and drag to
reorder them. Unchecked filters are skipped by the cycle; the order in the
list is the order the cycle walks.

### Gamma cycle

Pick which gamma-mismatch presets are reachable via `G` / `Shift+G`, and
drag to reorder them. Same skip-and-order behavior as the filter cycle.

### Storage and migration

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
