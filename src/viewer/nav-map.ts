// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Thumbnail navigation minimap                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { navMapEnabled } from "../filters/zoom";
import type { RowData, Comp } from "./types";

const NAV_MAX = 200;
const NAV_MIN = 48;

export interface NavMap {
  navMapEl: HTMLDivElement;
  navMapImg: HTMLImageElement;
  updateNavMap: () => void;
  cleanup: () => void;
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
  document.body.appendChild(navMapEl);

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
  function navJumpTo(e: MouseEvent) {
    const b = navMapEl.getBoundingClientRect();
    const fx = Math.max(0, Math.min(1, (e.clientX - b.left) / b.width));
    const fy = Math.max(0, Math.min(1, (e.clientY - b.top) / b.height));
    const rd = allRowData[comp.currentRow];
    if (!rd) return;
    const row = rd.rowDiv;
    const tx = fx * row.offsetWidth - compDiv.clientWidth / 2;
    const ty = row.offsetTop + fy * row.offsetHeight - compDiv.clientHeight / 2;
    compDiv.scrollLeft = Math.max(0, Math.min(tx, row.offsetWidth - compDiv.clientWidth));
    compDiv.scrollTop = Math.max(row.offsetTop, Math.min(ty, row.offsetTop + row.offsetHeight - compDiv.clientHeight));
  }
  navMapEl.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    navDragging = true;
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
    navMapEl.style.cursor = "";
  }
  window.addEventListener("mousemove", onNavDragMove);
  window.addEventListener("mouseup", onNavDragEnd);

  function cleanup() {
    navMapEl.remove();
    window.removeEventListener("mousemove", onNavDragMove);
    window.removeEventListener("mouseup", onNavDragEnd);
  }

  return { navMapEl, navMapImg, updateNavMap, cleanup };
}
