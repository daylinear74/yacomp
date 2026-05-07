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

export function applyZoom(): void {
  for (const comp of activeComps) {
    const rows = comp.compDiv.querySelectorAll("._scf_comp_row") as NodeListOf<HTMLElement>;
    if (zoomMode === "fit") {
      for (const row of rows) row.style.width = "100vw";
      comp.compDiv.classList.remove("_scf_zoomed");
    } else {
      for (const row of rows) row.style.width = zoomWidth + "px";
      comp.compDiv.classList.add("_scf_zoomed");
    }
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
  const comp = activeComps[activeComps.length - 1];
  if (comp) {
    const oldW = zoomMode === "fit" ? window.innerWidth : zoomWidth;
    const cx = comp.compDiv.scrollLeft + comp.compDiv.clientWidth / 2;
    const cy = comp.compDiv.scrollTop + comp.compDiv.clientHeight / 2;
    zoomWidth = calcZoom(oldW, dir);
    zoomMode = "custom";
    const scale = zoomWidth / oldW;
    applyZoom();
    comp.compDiv.scrollLeft = cx * scale - comp.compDiv.clientWidth / 2;
    comp.compDiv.scrollTop = cy * scale - comp.compDiv.clientHeight / 2;
  } else {
    const base = zoomMode === "fit" ? window.innerWidth : zoomWidth;
    zoomWidth = calcZoom(base, dir);
    zoomMode = "custom";
    applyZoom();
  }
  showToast(zoomToast());
}

export const doZoomIn = (): void => doZoomStep(1);
export const doZoomOut = (): void => doZoomStep(-1);

export function doZoomFit(): void {
  zoomMode = "fit";
  zoomWidth = 0;
  applyZoom();
  showToast(zoomToast());
}

export function doZoom1to1(): void {
  const sizer = document.querySelector("._scf_comp_sizer") as HTMLImageElement | null;
  if (!sizer) return;
  function apply() {
    if (!sizer!.naturalWidth) return;
    zoomWidth = sizer!.naturalWidth;
    zoomMode = "1:1";
    applyZoom();
    showToast(zoomToast());
  }
  if (sizer.naturalWidth) apply();
  else sizer.addEventListener("load", apply, { once: true });
}
