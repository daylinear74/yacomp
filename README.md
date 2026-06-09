# yacomp

![CI](https://github.com/daylinear74/yacomp/actions/workflows/ci.yml/badge.svg)
![License](https://img.shields.io/badge/license-MIT-blue.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue)
![Runtime](https://img.shields.io/badge/runtime-Bun-black)

**Yet Another Comparison Viewer** — a userscript for side-by-side screenshot
comparison on tracker and image-hosting sites.

yacomp gives comparison pages a consistent fullscreen viewer across different
sites: hover to switch sources, navigate rows from the keyboard, zoom and pan,
and apply visual filters to inspect compression artifacts, luma/chroma
differences, brightness drift, and gamma mismatches.

## Supported sites

| Integration style | Sites |
| --- | --- |
| Detect screenshot grids and viewer galleries | HDB |
| Replace the native viewer | PTP, BLU, ATH, BHD, GPW, SSD, FRDS |
| Add a viewer button | slow.pics, comp.pics |

## Install & usage

Install a userscript manager such as [Tampermonkey](https://www.tampermonkey.net/)
or [Violentmonkey](https://violentmonkey.github.io/), then **[click here to
install the latest release](https://github.com/daylinear74/yacomp/releases/latest/download/yacomp.user.js)**.

- On HDB torrent pages, detected comparison grids get a **Show comparison** link.
  Other screenshot groups get a compact **Show Viewer** control placed directly
  above the image run, and image clicks open the same gallery viewer by default.
  If a block is ambiguous, **Show Viewer** includes a column-count field:
  blank or `1` opens it as a gallery, while `2+` builds a manual comparison; a
  non-divisible image count leaves the final row short.
- On HDB forum pages it also adds a **Custom comparison** builder below the page
  title, for markup too irregular to auto-detect safely (see *Features*).
- On native-viewer sites, use the site's comparison UI as usual; yacomp takes
  over when the viewer opens.
- On slow.pics / comp.pics it adds a native-style button — and the `V` key —
  that opens the current comparison in yacomp.

## Features

- **Consistent comparison viewer** — open any supported comparison in the same
  fullscreen UI, regardless of the site's native presentation.
- **HDB screenshot gallery viewer** — torrent screenshots that are not safe
  comparisons get a local **Show Viewer** control and also open in the same
  viewer from an image click, so image-host thumbnails, saved pages, and sample
  galleries do not fall back to tiny native previews.
- **Fast source & row navigation** — hover to switch sources by horizontal
  position, plus arrow / vim / number keys for sources and rows.
- **Zoom & pan** — fit, 1:1, incremental zoom, `Ctrl` + wheel cursor-centered
  zoom, drag panning, a minimap, and a row-navigation sidebar.
- **Visual filters** — Solar ×1 / ×2, Residual, Luma, and Chroma modes for
  artifact and channel inspection.
- **Per-source adjustments** — brightness, contrast, and gamma-mismatch checks
  (sRGB ↔ BT.1886, the 0.88 AE/QuickTime fix, Legacy Mac) for the selected
  source only.
- **Colorspace-aware luma/chroma** — BT.709 / BT.2020 handling from URL hints or
  PNG/JPEG ICC profile data when available.
- **Custom comparison builder** (HDB forums) — when markup is too irregular for
  safe auto-detection, click or drag across screenshots to select a group
  (`Shift` / `Ctrl` to extend or toggle the selection), pull the column title
  straight from highlighted text, set the column count, and build a viewer.
- **Customizable shortcuts** — rebind any action to a key (modifiers included) or
  a mouse button from the settings panel; each action takes a main binding plus
  an optional second one.
- **Shortcuts help overlay** — press `?` (or the toolbar button) for a live
  keyboard legend that reflects your current bindings.
- **Per-site toggles** — turn any integration off without uninstalling, to fall
  back to a site's native viewer.
- **Lazy loading** — rows load on demand, with optional background loading and
  automatic syncing for dynamically added (lazy / SPA) images.

> **Chrome / Edge note:** a browser GPU bug can render the visual filters
> slightly off (filtered images look a touch dark). To avoid it for now, disable
> hardware acceleration — *Settings → System → "Use graphics acceleration when
> available"* → off, then relaunch.

## Shortcuts

Every shortcut is rebindable in **yacomp Settings**; the defaults are:

| Key | Action |
| --- | --- |
| `V` | Open the yacomp viewer on a slow.pics / comp.pics page |
| `F` / `Shift+F` | Cycle visual filter forward / backward |
| `[` / `]` | Decrease / increase brightness for the current source |
| `{` / `}` | Decrease / increase contrast for the current source |
| `G` / `Shift+G` | Cycle gamma-mismatch check forward / backward |
| `\` / `Shift+\` | Reset adjustments for the current source / all sources |
| `+` / `-` | Zoom in / out |
| `Ctrl` + wheel | Cursor-centered zoom |
| `0` | Fit to width |
| `O` | Actual size (1:1) |
| `C` | Toggle canvas fill / fit |
| `H` / `L` or `←` / `→` | Previous / next source |
| `K` / `J` or `↑` / `↓` | Previous / next row |
| `1`–`9` | Jump to source number |
| `M` | Toggle minimap |
| `R` | Toggle row-navigation sidebar |
| `B` | Toggle background loading |
| `?` | Toggle the shortcuts help overlay |
| `Esc` | Reset active adjustments, or close the viewer |

## Configuration

Open the settings panel from the userscript manager menu (**yacomp Settings**).
Settings persist via `GM_setValue` and are scoped per userscript manager.

### Viewer defaults

- **Initial zoom mode** (`Fit` / `1:1`) — whether the viewer opens scaled to fit
  the viewport or at native 1:1 pixels. Default `1:1`.
- **Zoom indicator base** (`Original` / `Fit`) — what 100% in the zoom HUD refers
  to. `Original` = source's native pixels; `Fit` = scaled-to-viewport. Default
  `Original`.
- **Verbose zoom info** — when on, the zoom toast adds pixel counts and viewport
  callouts; when off, it's a single-line percentage label. Default off.
- **Fill canvas by default** — whether each row fills the viewport (cropping) or
  fits inside it (letterbox) at open. Toggle later with `C`. Default off (fit).
- **Minimap by default** — whether the thumbnail navigation minimap is on at
  open. Toggle later with `M`. Default on.
- **Background loading by default** — when on, all rows start downloading at open
  rather than waiting for lazy-load. Toggle later with `B`. Default off.
- **Hover to switch source** — when on, moving the cursor across a row switches
  the visible source by horizontal position; when off, switching needs the
  keyboard or source menu. Default on.
- **Close button position** (`Auto` / `Left` / `Right`) — `Auto` places it on the
  left on macOS and on the right elsewhere, matching native window controls.

### Adjustments

- **Brightness / contrast step** — the increment per `[` / `]` and `{` / `}`
  press. Range 0.01–0.25, default 0.05.
- **Toast duration** — how long a HUD toast stays visible. Range 500–10000 ms,
  default 2000 ms.
- **Zoom scale factor** — the multiplier per `+` / `-` press (1.25 = ±25% per
  step). Range 1.05–2.0, default 1.25.
- **Lazy-load margin** — how far outside the visible area, in CSS pixels,
  deferred rows start downloading. Measured against the viewer's scroll
  container, **not** image size, so the number of rows covered shifts with zoom.
  Range 0–2000 px, default 200 px.

### Shortcuts

Rebind any action to a key (with modifiers) or a mouse button. Click a field,
then press the key or mouse button to capture it; `Esc` cancels and a duplicate
binding is rejected. Each action needs a main binding; the optional extra (e.g.
arrow **and** vim keys) can be cleared with `×`.

### Sites

A per-site toggle for every supported integration (HDB, PTP, BLU, ATH, BHD, GPW,
SSD, FRDS, slow.pics, comp.pics). Disabling a site stops yacomp from injecting
there without an uninstall.

- **HDB image click** (`Viewer` / `Native`) — controls what happens when clicking
  HDB comparison or gallery thumbnails. `Viewer` opens yacomp at that image;
  `Native` leaves the original HDB/image-host link behavior alone. This does not
  remove the **Show comparison** / **Show Viewer** controls. Default `Viewer`.

### Filter cycle

Pick which visual filters are reachable via `F` / `Shift+F`, and drag to reorder
them. Unchecked filters are skipped; the list order is the cycle order.

### Gamma cycle

Pick which gamma-mismatch presets are reachable via `G` / `Shift+G`, and drag to
reorder them. Same skip-and-order behavior as the filter cycle.

### Storage and migration

A schema version is stored alongside the config; older payloads are migrated
forward on first load, and unknown or out-of-range values fall back to the
built-in defaults.

## Development

The project uses Bun and TypeScript. The built userscript is written to
`dist/yacomp.user.js`.

```bash
bun install
bun run build            # Build dist/yacomp.user.js
bun run watch            # Rebuild when src/ changes
bun run typecheck        # Type-check without emitting files
bun run typecheck:tests  # Type-check tests and Playwright config
bun run verify           # Sanity-check the generated userscript
bun run test             # Run unit tests
bunx playwright install chromium  # Install local browser for e2e tests
bun run test:e2e         # Run Playwright viewer tests
bun run fixture          # Serve the local viewer fixture
bun run check            # typecheck + build + verify
bun run clean            # Remove dist/
```

Core code lives in `src/`: `sites/` contains site adapters, `viewer/` the
fullscreen comparison UI, `filters/` the zoom / colorspace / visual-filter
logic, and `shortcuts/` the bindable action registry. Userscript metadata and
URL matches live in `meta/banner.txt`.

For new site support, parse the page into the shared grid model and reuse the
existing viewer rather than adding site-specific viewer behavior.

Unit tests live in `tests/unit`. Playwright e2e tests live in `tests/e2e` and use
the local fixture in `tests/fixtures/viewer`, so viewer controls can be tested
without external network access.

CI runs type-checking, build verification, unit tests, and the e2e suite on
pushes and pull requests targeting `main`. Releases are tag-driven: pushing a
`v*` tag builds and uploads `dist/yacomp.user.js`.

## License

MIT
