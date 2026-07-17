// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Row building & lazy loading                                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { applyFilterToImg, syncAll } from "../filters/imaging";
import { hasAdjustments } from "../filters/brightness";
import { sizeRowOnLoad } from "../filters/zoom";
import { mouseSwitch } from "../config";
import type { DragState } from "./drag";
import type { RowData, Comp } from "./types";

interface ImageDimensions {
  naturalWidth: number;
  naturalHeight: number;
}

interface KnownCellDimensions {
  width?: number | null;
  height?: number | null;
}

function rowCanvasAspectRatio(images: Iterable<ImageDimensions | KnownCellDimensions>): string | null {
  let maxWidth = 0;
  let maxHeight = 0;

  for (const img of images) {
    const width = "naturalWidth" in img ? img.naturalWidth : img.width;
    const height = "naturalHeight" in img ? img.naturalHeight : img.height;
    if (!width || !height) continue;
    maxWidth = Math.max(maxWidth, width);
    maxHeight = Math.max(maxHeight, height);
  }

  return maxWidth && maxHeight ? `${maxWidth} / ${maxHeight}` : null;
}

export function rowCellsAspectRatio(rowCells: KnownCellDimensions[]): string | null {
  return rowCanvasAspectRatio(rowCells);
}

function hdbNextFallbackSrc(src: string): string | null {
  const match = src.match(/^((?:https?:)?\/\/i\.hdbits\.org\/[^/?#]+)\.(png|jpe?g|webp)([?#].*)?$/i);
  if (!match) return null;
  const ext = match[2].toLowerCase();
  const next = ext === "png" ? "jpg" : ext === "jpg" || ext === "jpeg" ? "webp" : null;
  return next ? `${match[1]}.${next}${match[3] ?? ""}` : null;
}

function installHdbImageFallback(img: HTMLImageElement, onGiveUp?: () => void): void {
  img.addEventListener("error", () => {
    const fallback = hdbNextFallbackSrc(img.currentSrc || img.src);
    const tried = (img.dataset.hdbFallbackTried || "").split(",").filter(Boolean);
    if (!fallback || tried.includes(fallback)) {
      // No (further) format to try — the image is dead. Tell the caller so a
      // row spinner can stop instead of spinning forever over a blank cell.
      onGiveUp?.();
      return;
    }
    img.dataset.hdbFallbackTried = [...tried, fallback].join(",");
    img.src = fallback;
    // A colorspace lookup for the failed URL may still be in flight. Invalidate
    // that generation and resolve the filter again for the fallback URL,
    // preserving the comparison's current per-column adjustments.
    if (img.classList.contains("_scf_comp_img") && hasAdjustments()) syncAll();
  });
}

export function buildRow(
  rowCells: { full: string; width?: number | null; height?: number | null }[],
  numCols: number,
  drag: DragState,
  switchColumn: (col: number) => void,
  pointerColumnForEvent: (e: MouseEvent) => number,
  deferred: boolean,
): RowData {
  const rowDiv = document.createElement("div");
  rowDiv.className = "_scf_comp_row _scf_loading";
  rowDiv.dataset.col = "0";

  const sizer = document.createElement("img");
  sizer.className = "_scf_comp_sizer";
  // A dead sizer image fires `error`, never `load`, so clear the row's loading
  // spinner when the fallback chain is exhausted (a 404 screenshot on an old
  // thread would otherwise spin forever over a blank row).
  installHdbImageFallback(sizer, () => rowDiv.classList.remove("_scf_loading"));
  const knownAspectRatio = rowCellsAspectRatio(rowCells);
  if (knownAspectRatio) rowDiv.style.aspectRatio = knownAspectRatio;
  if (deferred) {
    sizer.dataset.src = rowCells[0].full;
    if (!knownAspectRatio) rowDiv.style.aspectRatio = "16 / 9";
  } else {
    sizer.addEventListener("load", () => rowDiv.classList.remove("_scf_loading"), { once: true });
    sizer.src = rowCells[0].full;
  }
  rowDiv.appendChild(sizer);

  const knownDimensions = new Map<HTMLImageElement, ImageDimensions>();
  const adjustRowAR = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    knownDimensions.set(img, {
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
    });
    const aspectRatio = rowCanvasAspectRatio(knownDimensions.values());
    if (aspectRatio) rowDiv.style.aspectRatio = aspectRatio;
  };

  const imgs: HTMLImageElement[] = [];
  for (let ci = 0; ci < numCols; ci++) {
    // A partial final row (the "orphan" of an indivisible comparison-thread
    // grid, 80402) has fewer cells than numCols — stop at the gap instead of
    // dereferencing a missing cell. Missing cells are always trailing (the row
    // is a contiguous slice), so the imgs[] indices still map to columns.
    if (!rowCells[ci]) break;
    const cell = document.createElement("div");
    cell.className = "_scf_comp_cell";
    const img = document.createElement("img");
    img.className = "_scf_comp_img";
    installHdbImageFallback(img);
    const src = rowCells[ci].full;
    // Eager-load only column 0 of non-deferred rows; every other cell
    // waits until the user activates it (switchColumn / loadRowColumn)
    // or the row enters the IO buffer (loadRow loads the active col).
    if (!deferred && ci === 0) {
      img.addEventListener("load", () => adjustRowAR(img), { once: true });
      img.src = src;
    } else {
      img.dataset.src = src;
    }
    img.style.visibility = ci === 0 ? "visible" : "hidden";
    if (img.src) {
      void applyFilterToImg(img);
    }
    cell.appendChild(img);
    rowDiv.appendChild(cell);
    imgs.push(img);
  }

  rowDiv.addEventListener("mousemove", (e) => {
    if (drag.active || !mouseSwitch()) return;
    const newCol = pointerColumnForEvent(e);
    const prevCol = parseInt(rowDiv.dataset.col!, 10);
    if (newCol !== prevCol) {
      switchColumn(newCol);
    }
  });

  return { rowDiv, sizer, imgs, adjustRowAR };
}

// Promotes a single cell's deferred `dataset.src` → `src` and applies the
// column's current filter. No-op if the cell is already loaded.
function loadCellSrc(
  img: HTMLImageElement,
  ci: number,
  comp: Comp,
  adjustRowAR: (img: HTMLImageElement) => void,
): void {
  if (!img.dataset.src) return;
  const src = img.dataset.src;
  delete img.dataset.src;
  img.addEventListener("load", () => adjustRowAR(img), { once: true });
  img.src = src;
  void applyFilterToImg(img, {
    brightness: comp.colBrightness[ci],
    contrast: comp.colContrast[ci],
    gammaCheck: comp.colGammaCheck[ci],
  });
}

// IO-triggered row entry: load the sizer (for the row's natural aspect
// ratio) and only the *active* column. Hidden columns stay deferred until
// the user switches to them via switchColumn → loadRowColumn, or until
// fillRow runs in bg-load mode.
export function loadRow(rd: RowData, comp: Comp): void {
  if (rd.loaded) return;
  rd.loaded = true;
  const { sizer, rowDiv, imgs, adjustRowAR } = rd;
  if (sizer.dataset.src) {
    const src = sizer.dataset.src;
    delete sizer.dataset.src;
    sizer.addEventListener("load", () => rowDiv.classList.remove("_scf_loading"), { once: true });
    sizer.src = src;
  }
  const activeCol = comp.currentCol || 0;
  if (imgs[activeCol]) loadCellSrc(imgs[activeCol], activeCol, comp, adjustRowAR);
  // When zoomed, a row scrolling in must take its OWN native width × the
  // current scale (it may be a different resolution than rows already on
  // screen). Sizes once the active cell measures; no-op in fit.
  sizeRowOnLoad(rd, comp);
}

// switchColumn hook: promote one column's deferred src in a row that's
// already been loaded. No-op for cells that already have `src`, and the
// caller is expected to gate this by `rd.loaded` so unloaded rows stay
// lazy.
export function loadRowColumn(rd: RowData, comp: Comp, col: number): void {
  const img = rd.imgs[col];
  if (!img) return;
  loadCellSrc(img, col, comp, rd.adjustRowAR);
}

// Background-load hook: ensure every cell in the row has been promoted
// from `dataset.src` → `src`. Used by triggerBgLoad and by the user's
// explicit "load all" toggle.
export function fillRow(rd: RowData, comp: Comp): void {
  if (!rd.loaded) loadRow(rd, comp);
  const { imgs, adjustRowAR } = rd;
  for (let ci = 0; ci < imgs.length; ci++) {
    loadCellSrc(imgs[ci], ci, comp, adjustRowAR);
  }
}
