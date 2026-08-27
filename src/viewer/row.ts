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

type ManagedImageStatus = "idle" | "pending" | "settled";

interface ManagedImageState {
  rowDiv: HTMLDivElement;
  status: ManagedImageStatus;
}

const managedImageStates = new WeakMap<HTMLImageElement, ManagedImageState>();
const rowLoadingOwners = new WeakMap<HTMLDivElement, HTMLImageElement>();

function settleManagedImage(img: HTMLImageElement): void {
  const state = managedImageStates.get(img);
  if (!state) return;
  state.status = "settled";
  if (rowLoadingOwners.get(state.rowDiv) === img) {
    state.rowDiv.classList.remove("_scf_loading");
  }
}

function setManagedImageSrc(img: HTMLImageElement, src: string): void {
  const state = managedImageStates.get(img);
  if (state) state.status = "pending";
  img.src = src;
}

/**
 * Make one image the sole owner of a row's spinner. Async completion from a
 * previously active cell (or the row's sizer) can still update its own load
 * state, but cannot settle the spinner after ownership has moved elsewhere.
 */
export function setRowLoadingOwner(
  rowDiv: HTMLDivElement,
  img: HTMLImageElement | null,
): void {
  if (!img) {
    rowLoadingOwners.delete(rowDiv);
    rowDiv.classList.remove("_scf_loading");
    return;
  }

  rowLoadingOwners.set(rowDiv, img);
  rowDiv.classList.toggle("_scf_loading", managedImageStates.get(img)?.status === "pending");
}

function installHdbImageFallback(img: HTMLImageElement, rowDiv: HTMLDivElement): void {
  managedImageStates.set(img, { rowDiv, status: "idle" });

  img.addEventListener("load", () => settleManagedImage(img));
  img.addEventListener("error", () => {
    // `src` is the URL assigned for this attempt. Unlike `currentSrc`, it does
    // not lag behind when an error handler advances the fallback chain.
    const fallback = hdbNextFallbackSrc(img.src);
    if (!fallback) {
      // No further format to try. This is the only error that settles the
      // managed request; png/jpg failures remain pending while the next URL
      // is attempted.
      settleManagedImage(img);
      return;
    }
    setManagedImageSrc(img, fallback);
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
  initialCol: number,
  deferred: boolean,
): RowData {
  const activeCol = rowCells[initialCol] ? initialCol : 0;
  const rowDiv = document.createElement("div");
  rowDiv.className = "_scf_comp_row _scf_loading";
  rowDiv.dataset.col = String(activeCol);

  const sizer = document.createElement("img");
  sizer.className = "_scf_comp_sizer";
  installHdbImageFallback(sizer, rowDiv);
  const knownAspectRatio = rowCellsAspectRatio(rowCells);
  if (knownAspectRatio) rowDiv.style.aspectRatio = knownAspectRatio;
  if (deferred) {
    sizer.dataset.src = rowCells[activeCol].full;
    if (!knownAspectRatio) rowDiv.style.aspectRatio = "16 / 9";
  } else {
    setManagedImageSrc(sizer, rowCells[activeCol].full);
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
    installHdbImageFallback(img, rowDiv);
    const src = rowCells[ci].full;
    // Eager-load only the active column of non-deferred rows; every other cell
    // waits until the user activates it (switchColumn / loadRowColumn)
    // or the row enters the IO buffer (loadRow loads the active col).
    if (!deferred && ci === activeCol) {
      img.addEventListener("load", () => adjustRowAR(img), { once: true });
      setManagedImageSrc(img, src);
    } else {
      img.dataset.src = src;
    }
    img.style.visibility = ci === activeCol ? "visible" : "hidden";
    if (img.src) {
      void applyFilterToImg(img);
    }
    cell.appendChild(img);
    rowDiv.appendChild(cell);
    imgs.push(img);
  }

  // The visible cell, not the layout-only sizer, owns the spinner. This keeps
  // an independently decoded/failed sizer from hiding a still-pending image.
  if (!deferred) setRowLoadingOwner(rowDiv, imgs[activeCol] ?? sizer);

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
  setManagedImageSrc(img, src);
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
  const activeCol = comp.currentCol || 0;
  if (sizer.dataset.src) {
    // The sizer gives the row a real resolution early. Point it at the ACTIVE
    // column's URL so it shares that cell's download and decode — with its
    // original column-0 URL, browsing any other column paid two full-res
    // images per lazily-loaded row. Falls back to column 0 for a short row.
    const src = imgs[activeCol]?.dataset.src || imgs[activeCol]?.src || sizer.dataset.src;
    delete sizer.dataset.src;
    setManagedImageSrc(sizer, src);
  }
  const activeImg = imgs[activeCol];
  if (activeImg) loadCellSrc(activeImg, activeCol, comp, adjustRowAR);
  setRowLoadingOwner(rowDiv, activeImg ?? sizer);
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
