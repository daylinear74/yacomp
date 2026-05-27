// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Row building & lazy loading                                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { applyFilterToImg } from "../filters/imaging";
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
  const knownAspectRatio = rowCellsAspectRatio(rowCells);
  if (knownAspectRatio) rowDiv.style.aspectRatio = knownAspectRatio;
  if (deferred) {
    sizer.dataset.src = rowCells[0].full;
    if (!knownAspectRatio) rowDiv.style.aspectRatio = "16 / 9";
  } else {
    sizer.src = rowCells[0].full;
    sizer.addEventListener("load", () => rowDiv.classList.remove("_scf_loading"), { once: true });
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
    const cell = document.createElement("div");
    cell.className = "_scf_comp_cell";
    const img = document.createElement("img");
    img.className = "_scf_comp_img";
    const src = rowCells[ci].full;
    if (!deferred && ci <= 1) {
      img.src = src;
    } else {
      img.dataset.src = src;
    }
    img.style.visibility = ci === 0 ? "visible" : "hidden";
    if (img.src) {
      void applyFilterToImg(img);
      img.addEventListener("load", () => adjustRowAR(img), { once: true });
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

export function loadRow(rd: RowData, comp: Comp): void {
  if (rd.loaded) return;
  rd.loaded = true;
  const { sizer, rowDiv, imgs, adjustRowAR } = rd;
  if (sizer.dataset.src) {
    sizer.src = sizer.dataset.src;
    delete sizer.dataset.src;
    sizer.addEventListener("load", () => rowDiv.classList.remove("_scf_loading"), { once: true });
  }
  const activeCol = comp.currentCol || 0;
  const loadImg = (img: HTMLImageElement, ci: number) => {
    if (!img.dataset.src) return;
    img.src = img.dataset.src;
    delete img.dataset.src;
    void applyFilterToImg(img, {
      brightness: comp.colBrightness[ci],
      contrast: comp.colContrast[ci],
      gammaCheck: comp.colGammaCheck[ci],
    });
    img.addEventListener("load", () => adjustRowAR(img), { once: true });
  };
  if (imgs[activeCol]) loadImg(imgs[activeCol], activeCol);
  imgs.forEach((img, ci) => {
    if (ci !== activeCol) loadImg(img, ci);
  });
}
