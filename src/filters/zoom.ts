// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Zoom state                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { showToast } from "../ui/toast";
import type { Comp } from "../viewer/types";

export let zoomMode: "fit" | "1:1" | "custom" = "fit";
export let zoomWidth = 0; // px, used for '1:1' and 'custom'
export let navMapEnabled = true;

export function setZoomMode(m: "fit" | "1:1" | "custom"): void { zoomMode = m; }
export function setZoomWidth(w: number): void { zoomWidth = w; }
export function toggleNavMap(): void { navMapEnabled = !navMapEnabled; }

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
  const minTop = anchor.scrollTopBounds === "row" ? geometry.rowTop : 0;
  const maxTop = anchor.scrollTopBounds === "row"
    ? Math.max(
      minTop,
      geometry.rowTop + geometry.rowHeight - geometry.viewportHeight,
    )
    : Math.max(0, geometry.contentHeight - geometry.viewportHeight);
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

  return {
    comp,
    rowIdx,
    currentRowIdx: point ? rowIdx : comp.currentRow,
    scrollTopBounds: point ? "content" : "row",
    rowXRatio: clamp((comp.compDiv.scrollLeft + viewportX - rowLeft) / rowWidth, 0, 1),
    rowYRatio: clamp(
      (comp.compDiv.scrollTop + viewportY - row.offsetTop) / rowHeight,
      0,
      1,
    ),
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

export function applyZoom(anchors: CapturedZoomAnchor[] = []): void {
  for (const comp of activeComps) {
    const rows = comp.compDiv.querySelectorAll("._scf_comp_row") as NodeListOf<HTMLElement>;
    if (zoomMode === "fit") {
      for (const row of rows) row.style.width = "100vw";
      comp.compDiv.classList.remove("_scf_zoomed");
    } else {
      for (const row of rows) row.style.width = zoomWidth + "px";
      comp.compDiv.classList.add("_scf_zoomed");
    }
  }
  for (const comp of activeComps) {
    if (comp.updateScrollSpacers) comp.updateScrollSpacers();
  }
  for (const anchor of anchors) restoreZoomAnchor(anchor);
  for (const comp of activeComps) {
    if (comp.updateNavMap) comp.updateNavMap();
  }
}

export function zoomToast(): string {
  if (zoomMode === "fit") return "🔍 Fit";
  if (zoomMode === "1:1") return "🔍 1:1";
  return (
    "🔍 " + Math.round((zoomWidth / window.innerWidth) * 100) + "%"
  );
}

export function calcZoom(base: number, direction: number): number {
  return direction > 0
    ? Math.min(Math.round(base * 1.25), window.innerWidth * 8)
    : Math.max(Math.round(base / 1.25), Math.round(window.innerWidth * 0.1));
}

export function doZoomStep(dir: number): void {
  const anchors = captureActiveZoomAnchors();
  const base = zoomMode === "fit" ? window.innerWidth : zoomWidth;
  zoomWidth = calcZoom(base, dir);
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

export function doZoom1to1(): void {
  const sizer = document.querySelector("._scf_comp_sizer") as HTMLImageElement | null;
  if (!sizer) return;
  const anchors = captureActiveZoomAnchors();
  function apply() {
    if (!sizer!.naturalWidth) return;
    zoomWidth = sizer!.naturalWidth;
    zoomMode = "1:1";
    applyZoom(anchors);
    showToast(zoomToast());
  }
  if (sizer.naturalWidth) apply();
  else sizer.addEventListener("load", apply, { once: true });
}
