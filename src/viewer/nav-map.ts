// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Thumbnail navigation minimap                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { navMapEnabled, fillCanvasEnabled, suppressRowSync } from "../filters/zoom";
import { getShadowRoot } from "../ui/shadow";
import { clamp } from "../util";
import type { RowData, Comp } from "./types";

const NAV_MAX = 200;
const NAV_MIN = 48;

export interface NavMapJumpGeometry {
  fx: number;
  fy: number;
  rowLeft: number;
  rowTop: number;
  rowWidth: number;
  rowHeight: number;
  contentHeight: number;
  viewportWidth: number;
  viewportHeight: number;
}

export interface NavMap {
  navMapImg: HTMLImageElement;
  updateNavMap: () => void;
  cleanup: () => void;
}

export function calcNavMapJumpScroll(
  geometry: NavMapJumpGeometry,
): { scrollLeft: number; scrollTop: number } {
  const rowWidth = geometry.rowWidth || 1;
  const rowHeight = geometry.rowHeight || 1;
  const viewportWidth = geometry.viewportWidth;
  const viewportHeight = geometry.viewportHeight;
  const maxLeft = Math.max(0, geometry.rowLeft + rowWidth - viewportWidth);
  const contentMaxTop = Math.max(0, geometry.contentHeight - viewportHeight);

  let scrollTop: number;
  if (rowHeight <= viewportHeight) {
    scrollTop = geometry.rowTop + rowHeight / 2 - viewportHeight / 2;
  } else {
    scrollTop = clamp(
      geometry.rowTop + geometry.fy * rowHeight - viewportHeight / 2,
      geometry.rowTop,
      geometry.rowTop + rowHeight - viewportHeight,
    );
  }

  return {
    scrollLeft: clamp(
      geometry.rowLeft + geometry.fx * rowWidth - viewportWidth / 2,
      0,
      maxLeft,
    ),
    scrollTop: clamp(scrollTop, 0, contentMaxTop),
  };
}

export function createNavMap(
  compDiv: HTMLDivElement,
  allRowData: RowData[],
  comp: Comp,
): NavMap {
  const navMapEl = document.createElement("div");
  navMapEl.className = "_scf_nav_map";
  const navMapImg = document.createElement("img");
  navMapImg.draggable = false;
  navMapImg.alt = "";
  navMapImg.style.filter = "none";
  navMapEl.appendChild(navMapImg);
  const navMapRect = document.createElement("div");
  navMapRect.className = "_scf_nav_map_rect";
  navMapEl.appendChild(navMapRect);
  getShadowRoot().appendChild(navMapEl);

  function updateNavMap() {
    const zoomed = compDiv.classList.contains("_scf_zoomed");
    if (!zoomed || !navMapEnabled) {
      navMapEl.style.display = "none";
      navMapEl.style.opacity = "0";
      navMapEl.style.pointerEvents = "none";
      return;
    }
    const rd = allRowData[comp.currentRow];
    if (!rd) return;
    const img = rd.imgs[comp.currentCol];
    const src = img && (img.src || img.dataset.src);
    if (src && navMapImg.src !== src) navMapImg.src = src;
    navMapImg.style.objectFit = fillCanvasEnabled ? "cover" : "contain";
    const row = rd.rowDiv;
    const rw = row.offsetWidth || 1;
    const rh = row.offsetHeight || 1;
    const scl = Math.min(NAV_MAX / rw, NAV_MAX / rh);
    navMapEl.style.width = Math.max(Math.round(rw * scl), NAV_MIN) + "px";
    navMapEl.style.height = Math.max(Math.round(rh * scl), NAV_MIN) + "px";
    const rowTop = row.offsetTop;
    const vl = compDiv.scrollLeft / rw;
    const vt = Math.max(0, compDiv.scrollTop - rowTop) / rh;
    const vw = Math.min(compDiv.clientWidth / rw, 1);
    const vh = Math.min(compDiv.clientHeight / rh, 1);
    navMapRect.style.left = (vl * 100) + "%";
    navMapRect.style.top = (vt * 100) + "%";
    navMapRect.style.width = (vw * 100) + "%";
    navMapRect.style.height = (vh * 100) + "%";
    navMapEl.style.display = "block";
    navMapEl.style.opacity = "1";
    navMapEl.style.pointerEvents = "auto";
  }

  // Nav map drag-to-jump
  let navDragging = false;
  let navDragRow: number | null = null;
  function navJumpTo(e: MouseEvent) {
    const b = navMapEl.getBoundingClientRect();
    // A collapsed minimap (hidden mid-drag via the M toggle) measures 0×0;
    // mapping against that box would fling the viewport to a corner.
    if (!b.width || !b.height) return;
    const fx = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - b.top) / b.height));
    const rowIdx = navDragRow ?? comp.currentRow;
    const rd = allRowData[rowIdx];
    if (!rd) return;
    const row = rd.rowDiv;
    const next = calcNavMapJumpScroll({
      fx,
      fy,
      rowLeft: row.offsetLeft,
      rowTop: row.offsetTop,
      rowWidth: row.offsetWidth,
      rowHeight: row.offsetHeight,
      contentHeight: compDiv.scrollHeight,
      viewportWidth: compDiv.clientWidth,
      viewportHeight: compDiv.clientHeight,
    });
    suppressRowSync(comp);
    comp.currentRow = rowIdx;
    compDiv.scrollLeft = next.scrollLeft;
    compDiv.scrollTop = next.scrollTop;
    if (comp.updateRowNav) comp.updateRowNav(rowIdx);
  }
  navMapEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    navDragging = true;
    navDragRow = comp.currentRow;
    navMapEl.style.cursor = "grabbing";
    navJumpTo(e);
  });
  function onNavDragMove(e: MouseEvent) {
    if (!navDragging) return;
    navJumpTo(e);
  }
  function onNavDragEnd() {
    if (!navDragging) return;
    navDragging = false;
    navDragRow = null;
    navMapEl.style.cursor = "";
  }
  window.addEventListener("mousemove", onNavDragMove);
  window.addEventListener("mouseup", onNavDragEnd);

  function cleanup() {
    navMapEl.remove();
    window.removeEventListener("mousemove", onNavDragMove);
    window.removeEventListener("mouseup", onNavDragEnd);
  }

  return { navMapImg, updateNavMap, cleanup };
}
