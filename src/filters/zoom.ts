// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Zoom state                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { zoomScaleFactor, zoomPercentBase, verboseZoom, oneToOnePixels } from "../config";
import { showToast, type ToastLine } from "../ui/toast";
import { getShadowRoot } from "../ui/shadow";
import type { Comp, RowData } from "../viewer/types";

export let zoomMode: "fit" | "1:1" | "custom" = "fit";
export let zoomWidth = 0; // px, used for '1:1' and 'custom'
export let navMapEnabled = true;

export function setZoomMode(m: "fit" | "1:1" | "custom"): void { zoomMode = m; }
export function setZoomWidth(w: number): void { zoomWidth = w; }
export function toggleNavMap(): void { navMapEnabled = !navMapEnabled; }

export let fillCanvasEnabled = false;
export function toggleFillCanvas(): void { fillCanvasEnabled = !fillCanvasEnabled; }
export function setFillCanvas(v: boolean): void { fillCanvasEnabled = v; }
export function setNavMap(v: boolean): void { navMapEnabled = v; }

export function applyFillCanvas(): void {
  for (const comp of activeComps) {
    comp.compDiv.classList.toggle("_scf_fill_canvas", fillCanvasEnabled);
    if (comp.updateNavMap) comp.updateNavMap();
  }
}

export let activeComps: Comp[] = [];
export function addComp(c: Comp): void { activeComps.push(c); }
export function removeComp(c: Comp): void { activeComps = activeComps.filter((x) => x !== c); }

export interface RowZoomAnchor {
  rowXRatio: number;
  rowYRatio: number;
  viewportX: number;
  viewportY: number;
  scrollTopBounds: "row" | "content";
}

export interface RowZoomGeometry {
  rowLeft: number;
  rowTop: number;
  rowWidth: number;
  rowHeight: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface CapturedZoomAnchor extends RowZoomAnchor {
  comp: Comp;
  rowIdx: number;
  currentRowIdx: number;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function suppressRowSync(comp: Comp): void {
  const token = (comp.rowSyncSuppressToken || 0) + 1;
  comp.rowSyncSuppressToken = token;
  comp.suppressRowSync = true;
  const clear = () => {
    if (comp.rowSyncSuppressToken !== token) return;
    comp.suppressRowSync = false;
  };
  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(() => window.requestAnimationFrame(clear));
  } else {
    setTimeout(clear, 0);
  }
}

export function calcAnchoredRowScroll(
  anchor: RowZoomAnchor,
  geometry: RowZoomGeometry,
): { scrollLeft: number; scrollTop: number } {
  const maxLeft = Math.max(0, geometry.rowWidth - geometry.viewportWidth);
  const scrollLeft = geometry.rowLeft + geometry.rowWidth * anchor.rowXRatio - anchor.viewportX;
  const contentMinTop = 0;
  const contentMaxTop = Math.max(0, geometry.contentHeight - geometry.viewportHeight);
  const shouldBoundToRow = anchor.scrollTopBounds === "row"
    && geometry.rowHeight > geometry.viewportHeight;
  const minTop = shouldBoundToRow ? geometry.rowTop : contentMinTop;
  const maxTop = shouldBoundToRow
    ? Math.max(
      minTop,
      geometry.rowTop + geometry.rowHeight - geometry.viewportHeight,
    )
    : contentMaxTop;
  return {
    scrollLeft: clamp(
      scrollLeft,
      0,
      maxLeft,
    ),
    scrollTop: clamp(
      geometry.rowTop + geometry.rowHeight * anchor.rowYRatio - anchor.viewportY,
      minTop,
      maxTop,
    ),
  };
}

function rowIndexAtViewportY(comp: Comp, viewportY: number): number {
  const contentY = comp.compDiv.scrollTop + viewportY;
  let closest = 0;
  let closestDist = Infinity;
  for (let i = 0; i < comp.allRowData.length; i++) {
    const row = comp.allRowData[i].rowDiv;
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (contentY >= top && contentY <= bottom) return i;
    const dist = contentY < top ? top - contentY : contentY - bottom;
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  return closest;
}

export function captureZoomAnchor(
  comp: Comp,
  point?: { clientX: number; clientY: number },
): CapturedZoomAnchor | null {
  if (!comp.allRowData.length) return null;

  let viewportX = comp.compDiv.clientWidth / 2;
  let viewportY = comp.compDiv.clientHeight / 2;
  if (point) {
    const rect = comp.compDiv.getBoundingClientRect();
    viewportX = clamp(point.clientX - rect.left, 0, comp.compDiv.clientWidth);
    viewportY = clamp(point.clientY - rect.top, 0, comp.compDiv.clientHeight);
  }

  const rowIdx = clamp(
    point ? rowIndexAtViewportY(comp, viewportY) : comp.currentRow,
    0,
    comp.allRowData.length - 1,
  );
  const row = comp.allRowData[rowIdx].rowDiv;
  const rowLeft = row.offsetLeft;
  const rowWidth = row.offsetWidth || 1;
  const rowHeight = row.offsetHeight || 1;

  const rowXRatio = point
    ? clamp((comp.compDiv.scrollLeft + viewportX - rowLeft) / rowWidth, 0, 1)
    : 0.5;
  const rowYRatio = point
    ? clamp((comp.compDiv.scrollTop + viewportY - row.offsetTop) / rowHeight, 0, 1)
    : 0.5;

  return {
    comp,
    rowIdx,
    currentRowIdx: point ? rowIdx : comp.currentRow,
    scrollTopBounds: point ? "content" : "row",
    rowXRatio,
    rowYRatio,
    viewportX,
    viewportY,
  };
}

function captureActiveZoomAnchors(): CapturedZoomAnchor[] {
  return activeComps
    .map((comp) => captureZoomAnchor(comp))
    .filter((anchor): anchor is CapturedZoomAnchor => anchor !== null);
}

function restoreZoomAnchor(anchor: CapturedZoomAnchor): void {
  const row = anchor.comp.allRowData[anchor.rowIdx]?.rowDiv;
  if (!row) return;
  const next = calcAnchoredRowScroll(anchor, {
    rowLeft: row.offsetLeft,
    rowTop: row.offsetTop,
    rowWidth: row.offsetWidth || 1,
    rowHeight: row.offsetHeight || 1,
    contentHeight: anchor.comp.compDiv.scrollHeight,
    viewportWidth: anchor.comp.compDiv.clientWidth,
    viewportHeight: anchor.comp.compDiv.clientHeight,
  });
  suppressRowSync(anchor.comp);
  anchor.comp.compDiv.scrollLeft = next.scrollLeft;
  anchor.comp.compDiv.scrollTop = next.scrollTop;
  anchor.comp.currentRow = anchor.currentRowIdx;
  if (anchor.comp.updateRowNav) anchor.comp.updateRowNav(anchor.currentRowIdx);
}

/** Center the viewport on the active row's active cell — horizontally and
 *  vertically. Used on every viewer open (and re-applied once the active image
 *  measures) so it always starts at the image center, even when the image is
 *  larger than the viewport (e.g. a 4K shot at 1:1 in a 1080p viewport). */
export function centerOnActiveCell(comp: Comp): void {
  const rd = comp.allRowData[comp.currentRow];
  if (!rd) return;
  const row = rd.rowDiv;
  const cw = comp.compDiv.clientWidth;
  const ch = comp.compDiv.clientHeight;
  const next = calcAnchoredRowScroll(
    { rowXRatio: 0.5, rowYRatio: 0.5, viewportX: cw / 2, viewportY: ch / 2, scrollTopBounds: "row" },
    {
      rowLeft: row.offsetLeft,
      rowTop: row.offsetTop,
      rowWidth: row.offsetWidth || 1,
      rowHeight: row.offsetHeight || 1,
      contentHeight: comp.compDiv.scrollHeight,
      viewportWidth: cw,
      viewportHeight: ch,
    },
  );
  suppressRowSync(comp);
  comp.compDiv.scrollLeft = next.scrollLeft;
  comp.compDiv.scrollTop = next.scrollTop;
}

/** How many source pixels collapse into one CSS pixel at 1:1. In "device" mode
 *  that's the live devicePixelRatio (so a source pixel maps to a physical screen
 *  pixel — a 4K shot fills a 1080p@2x panel); in "logical" mode it's 1 (the
 *  browser's CSS 100%). Read live so dragging across monitors / browser zoom
 *  takes effect on the next applyZoom. */
function oneToOneScale(): number {
  if (oneToOnePixels() !== "device") return 1;
  return window.devicePixelRatio || 1;
}

/** CSS-pixel width for a source image at 1:1, HiDPI-compensated. */
function oneToOneWidth(naturalWidth: number): number {
  if (!naturalWidth) return 0;
  return Math.round(naturalWidth / oneToOneScale());
}

/** Zoom scale relative to each row's own native (device-1:1) width: 1 at 1:1,
 *  and zoomWidth / reference when zoomed. The factor is global but applied
 *  per-row, so a comparison that mixes resolutions across rows (057: 785px
 *  bitrate charts beside 1920px screenshots) keeps each row at its OWN native ×
 *  the same factor instead of flattening every row to one width. */
function currentZoomScale(): number {
  if (zoomMode === "1:1") return 1;
  const ref = activeColumnNaturalWidth();
  return ref ? zoomWidth / ref : 1;
}

/** Size one row to (its active column's native width ÷ DPR) × scale — each image
 *  at its own resolution, scaled by the common factor. If the active image
 *  hasn't measured yet (lazy / deferred), set a fallback now and finish once it
 *  loads at the live scale, guarded so a mid-load column switch can't apply a
 *  stale width. */
function sizeRowScaled(rd: RowData, comp: Comp, scale: number): void {
  const img = rd.imgs[comp.currentCol];
  if (img?.naturalWidth) {
    rd.rowDiv.style.width = `${Math.round(oneToOneWidth(img.naturalWidth) * scale)}px`;
    return;
  }
  rd.rowDiv.style.width = rd.sizer?.naturalWidth
    ? `${Math.round(oneToOneWidth(rd.sizer.naturalWidth) * scale)}px`
    : "100vw";
  img?.addEventListener(
    "load",
    () => {
      if (zoomMode !== "fit" && rd.imgs[comp.currentCol] === img && img.naturalWidth) {
        rd.rowDiv.style.width = `${Math.round(oneToOneWidth(img.naturalWidth) * currentZoomScale())}px`;
      }
    },
    { once: true },
  );
  // The sizer (the row's col-0 full image) is a reliable resolution source: if
  // the active column's own image is still loading — or its one-shot load was
  // missed — size from the sizer the moment it lands so the row reaches its
  // device-1:1 width instead of being stranded at the fit-width fallback (which
  // reads as the logical/"real" size on a HiDPI screen).
  if (rd.sizer && !rd.sizer.naturalWidth) {
    rd.sizer.addEventListener(
      "load",
      () => {
        if (zoomMode !== "fit" && !rd.imgs[comp.currentCol]?.naturalWidth && rd.sizer?.naturalWidth) {
          rd.rowDiv.style.width = `${Math.round(oneToOneWidth(rd.sizer.naturalWidth) * currentZoomScale())}px`;
        }
      },
      { once: true },
    );
  }
}

/** Scroll-in / deliberate-switch hook (row.ts): size a row to its active column
 *  once that image lands, at the current zoom scale. No-op in fit. A mouse-sweep
 *  does NOT call this — it loads the swept-to column width-neutrally — so the
 *  scale stays put during the compare gesture; only a deliberate switch
 *  (refit1to1 → applyZoom) re-fits. */
export function sizeRowOnLoad(rd: RowData, comp: Comp): void {
  if (zoomMode === "fit") return;
  sizeRowScaled(rd, comp, currentZoomScale());
}

export function applyZoom(anchors: CapturedZoomAnchor[] = []): void {
  for (const comp of activeComps) {
    if (zoomMode === "fit") {
      for (const rd of comp.allRowData) rd.rowDiv.style.width = "100vw";
      comp.compDiv.classList.remove("_scf_zoomed");
    } else {
      // 1:1 (scale 1) and custom (scale ≠ 1) share one per-row scaled path.
      const scale = currentZoomScale();
      for (const rd of comp.allRowData) sizeRowScaled(rd, comp, scale);
      comp.compDiv.classList.add("_scf_zoomed");
    }
  }
  for (const comp of activeComps) {
    if (comp.updateScrollSpacers) comp.updateScrollSpacers();
  }
  for (const anchor of anchors) restoreZoomAnchor(anchor);
  for (const comp of activeComps) {
    if (comp.updateNavMap) comp.updateNavMap();
    // applyZoom is the choke point for every zoom-mode change, so re-evaluate
    // the fit/fill button's "hidden entirely at 1:1" rule here.
    if (comp.syncFillCanvasVisibility) comp.syncFillCanvasVisibility();
  }
}

function getReferenceWidth(): number {
  if (zoomPercentBase() === "fit") return window.innerWidth;
  // Device-adjusted so 1:1 reads as 100% (physical) in device mode.
  return activeColumnNaturalWidth() || oneToOneWidth(getSizerNaturalWidth()) || window.innerWidth;
}

/** Raw source-pixel width of the column-0 sizer (NOT device-adjusted) — the
 *  image's true native width, for the toast's "Native" readout. */
function getSizerNaturalWidth(): number {
  const sizer = getShadowRoot().querySelector("._scf_comp_sizer") as HTMLImageElement | null;
  return sizer?.naturalWidth || 0;
}

/** The currently-viewed row's active image: its true source size (raw) and its
 *  on-screen rendered size — for the toast, so "Original / On screen" track the
 *  row + image you're actually looking at, not the first loaded one. */
function currentRowReadout(): { nativeW: number; nativeH: number; screenW: number } {
  const sizer = getShadowRoot().querySelector("._scf_comp_sizer") as HTMLImageElement | null;
  let nativeW = sizer?.naturalWidth || 0;
  let nativeH = sizer?.naturalHeight || 0;
  let screenW = oneToOneWidth(nativeW);
  const comp = activeComps[activeComps.length - 1];
  if (comp) {
    const rd = comp.allRowData[comp.currentRow];
    if (rd) {
      const img = rd.imgs[comp.currentCol];
      if (img?.naturalWidth) {
        nativeW = img.naturalWidth;
        nativeH = img.naturalHeight;
      }
      screenW = Math.round(rd.rowDiv.offsetWidth) || oneToOneWidth(nativeW);
    }
  }
  return { nativeW, nativeH, screenW };
}

/** Native pixel width of the ACTIVE column's image (from any loaded row), so 1:1
 *  shows each column at its own resolution instead of always column 0's sizer
 *  (a 1080p source and a 4K encode in one comparison should each be 1:1). Falls
 *  back to the column-0 sizer until the active column has measured. */
function activeColumnNaturalWidth(): number {
  const comp = activeComps[activeComps.length - 1];
  if (comp) {
    for (const rd of comp.allRowData) {
      const img = rd.imgs[comp.currentCol];
      if (img?.naturalWidth) return oneToOneWidth(img.naturalWidth);
    }
  }
  // 0 (not "the sizer") when the active column hasn't measured, so doZoom1to1 /
  // refit1to1 wait for its image instead of locking to column 0's width.
  return 0;
}

const TOAST_NATIVE_COLOR = "#7ee0a0"; // green — the image's native resolution
const TOAST_SCREEN_COLOR = "#8ab4f8"; // blue — what it renders at on this screen

export function formatDevicePixelRatio(dpr: number): string {
  if (!Number.isFinite(dpr) || dpr <= 0) return "1";
  return String(Number(dpr.toFixed(2)));
}

export function zoomToast(): string | ToastLine[] {
  const briefLabel = zoomMode === "fit"
    ? "🔍 Fit"
    : zoomMode === "1:1"
      ? "🔍 1:1"
      : "🔍 " + Math.round((zoomWidth / getReferenceWidth()) * 100) + "%";

  // In device mode on a HiDPI screen a source pixel ≠ a CSS pixel, so a single
  // "Npx / N%" hides what's happening — call out native vs on-screen at every
  // zoom level (1:1, +/- custom, and fit), not just 1:1.
  const dpr = window.devicePixelRatio || 1;
  const dprLabel = formatDevicePixelRatio(dpr);
  const showDevice = oneToOnePixels() === "device" && dprLabel !== "1";

  if (!verboseZoom() && !showDevice) return briefLabel;

  const lines: ToastLine[] = [{ text: briefLabel, size: "large" }];

  if (showDevice) {
    const { nativeW, nativeH, screenW } = currentRowReadout();
    if (nativeW) {
      // On-screen height from the image's own aspect (per-image, not the row).
      const screenH = nativeH ? Math.round((screenW * nativeH) / nativeW) : 0;
      const nativeRes = nativeH ? nativeW + "×" + nativeH : nativeW + "px";
      const screenRes = screenH ? screenW + "×" + screenH : screenW + "px";
      lines.push({ text: "Original " + nativeRes, size: "small", color: TOAST_NATIVE_COLOR });
      lines.push({
        text: "On screen " + screenRes + "@" + dprLabel + "x",
        size: "small",
        color: TOAST_SCREEN_COLOR,
      });
    }
    if (verboseZoom()) {
      lines.push({ text: "Viewport " + window.innerWidth + "px", size: "tiny", muted: true });
    }
    return lines;
  }

  const vw = window.innerWidth;
  const ow = getSizerNaturalWidth();
  const ew = zoomMode === "fit" ? vw : zoomWidth;
  lines.push({ text: ew + "px", size: "normal" });

  if (ow && ow === vw) {
    lines.push({ text: "Viewport · Original " + vw + "px (" + Math.round((ew / vw) * 100) + "%)", size: "small", muted: true });
  } else {
    lines.push({ text: "Viewport " + vw + "px (" + Math.round((ew / vw) * 100) + "%)", size: "small", muted: true });
    if (ow) {
      lines.push({ text: "Original " + ow + "px (" + Math.round((ew / ow) * 100) + "%)", size: "small", muted: true });
    }
  }

  return lines;
}

export function calcZoom(base: number, direction: number): number {
  const scale = zoomScaleFactor();
  return direction > 0
    ? Math.min(Math.round(base * scale), window.innerWidth * 8)
    : Math.max(Math.round(base / scale), Math.round(window.innerWidth * 0.1));
}

export function snapZoom(base: number, next: number): number {
  const ref = getReferenceWidth();
  if (ref > 0 && base !== ref) {
    if ((next > base && base < ref && next > ref) ||
        (next < base && base > ref && next < ref)) {
      return ref;
    }
  }
  return next;
}

export function zoomStepBaseWidth(): number {
  // At 1:1 the global zoomWidth can still be 0 (the active image hadn't measured
  // when 1:1 was applied — per-row sizing doesn't set it), so read the live 1:1
  // width; guard any 0 with the viewport so a first +/- or Ctrl+Wheel never
  // collapses to 0px.
  return (
    zoomMode === "fit" ? window.innerWidth
      : zoomMode === "1:1" ? activeColumnNaturalWidth()
        : zoomWidth
  ) || window.innerWidth;
}

export function doZoomStep(dir: number): void {
  const anchors = captureActiveZoomAnchors();
  const base = zoomStepBaseWidth();
  zoomWidth = snapZoom(base, calcZoom(base, dir));
  zoomMode = "custom";
  applyZoom(anchors);
  showToast(zoomToast());
}

export const doZoomIn = (): void => doZoomStep(1);
export const doZoomOut = (): void => doZoomStep(-1);

export function doZoomFit(): void {
  const anchors = captureActiveZoomAnchors();
  zoomMode = "fit";
  zoomWidth = 0;
  applyZoom(anchors);
  showToast(zoomToast());
}

export function doZoom1to1(opts: { silent?: boolean } = {}): void {
  const anchors = opts.silent ? [] : captureActiveZoomAnchors();
  zoomMode = "1:1";
  // Keep a representative width as the zoom-in/out base; 1:1 itself renders
  // per-row in applyZoom and ignores this. Rows whose active image hasn't
  // measured yet fall back to the sizer/fit-width and are corrected per-row
  // once that image loads.
  zoomWidth = activeColumnNaturalWidth() || zoomWidth;
  applyZoom(anchors);
  if (!opts.silent) showToast(zoomToast());
}

/** Re-apply 1:1 per-row after a deliberate column switch (each row to the new
 *  column's native width). No-op outside 1:1. */
export function refit1to1(): void {
  if (zoomMode !== "1:1") return;
  zoomWidth = activeColumnNaturalWidth() || zoomWidth;
  applyZoom();
}
