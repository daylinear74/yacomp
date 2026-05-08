// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Touch handlers — swipe, pinch-zoom, tap                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  zoomMode, zoomWidth, setZoomMode, setZoomWidth,
  zoomToast,
} from "../filters/zoom";
import { showToast } from "../ui/toast";
import type { Comp } from "./types";

const SWIPE_THRESH = 30;
const SWIPE_MAX_Y = 60;
const TAP_THRESH = 10;
const TAP_MAX_MS = 300;
const HINT_DURATION = 2000;
const HINT_FADE = 600;

interface TouchState {
  startX: number;
  startY: number;
  startTime: number;
  startDist: number;
  isPinch: boolean;
  isDrag: boolean;
  isSwipe: boolean;
  handled: boolean;
  scrollLeft0: number;
  scrollTop0: number;
  pinchBaseWidth: number;
  pinchRowXRatio: number;
  pinchRowYRatio: number;
  pinchRowIdx: number;
  pinchRowTopRatio: number;
}

function touchDist(a: Touch, b: Touch): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

function touchMid(a: Touch, b: Touch): { clientX: number; clientY: number } {
  return {
    clientX: (a.clientX + b.clientX) / 2,
    clientY: (a.clientY + b.clientY) / 2,
  };
}

export function showColumnHint(numCols: number, names: string[] | null): () => void {
  const overlay = document.createElement("div");
  overlay.className = "_scf_col_hint";
  for (let i = 0; i < numCols; i++) {
    const zone = document.createElement("div");
    zone.className = "_scf_col_hint_zone";
    const label = document.createElement("div");
    label.className = "_scf_col_hint_label";
    label.textContent = names?.[i] ?? "Source " + (i + 1);
    zone.appendChild(label);
    overlay.appendChild(zone);
  }
  document.body.appendChild(overlay);

  const fadeTimer = setTimeout(() => {
    overlay.style.opacity = "0";
  }, HINT_DURATION);
  const removeTimer = setTimeout(() => {
    overlay.remove();
  }, HINT_DURATION + HINT_FADE);

  return () => {
    clearTimeout(fadeTimer);
    clearTimeout(removeTimer);
    overlay.remove();
  };
}

export function setupTouchHandlers(
  compDiv: HTMLDivElement,
  comp: Comp,
  switchColumn: (col: number) => void,
): () => void {
  const state: TouchState = {
    startX: 0,
    startY: 0,
    startTime: 0,
    startDist: 0,
    isPinch: false,
    isDrag: false,
    isSwipe: false,
    handled: false,
    scrollLeft0: 0,
    scrollTop0: 0,
    pinchBaseWidth: 0,
    pinchRowXRatio: 0,
    pinchRowYRatio: 0,
    pinchRowIdx: 0,
    pinchRowTopRatio: 0,
  };

  function onTouchStart(e: TouchEvent) {
    state.handled = false;
    state.isSwipe = false;
    state.isDrag = false;
    state.isPinch = false;

    if (e.touches.length === 2) {
      if (!(e.touches[0] as Touch & { touchType?: string }).touchType ||
          (e.touches[0] as Touch & { touchType?: string }).touchType === "direct") {
        e.preventDefault();
        state.isPinch = true;
        state.startDist = touchDist(e.touches[0], e.touches[1]);
        state.pinchBaseWidth = zoomMode === "fit" ? window.innerWidth : zoomWidth;

        const mid = touchMid(e.touches[0], e.touches[1]);
        const rect = compDiv.getBoundingClientRect();
        const vpX = mid.clientX - rect.left;
        const vpY = mid.clientY - rect.top;
        const contentX = compDiv.scrollLeft + vpX;
        const contentY = compDiv.scrollTop + vpY;

        let bestRow = 0;
        for (let i = 0; i < comp.allRowData.length; i++) {
          const row = comp.allRowData[i].rowDiv;
          if (row.offsetTop + row.offsetHeight > contentY) { bestRow = i; break; }
          bestRow = i;
        }
        const row = comp.allRowData[bestRow].rowDiv;
        const rowW = row.offsetWidth || 1;
        const rowH = row.offsetHeight || 1;
        state.pinchRowIdx = bestRow;
        state.pinchRowXRatio = (contentX - row.offsetLeft) / rowW;
        state.pinchRowYRatio = (contentY - row.offsetTop) / rowH;
        state.pinchRowTopRatio = row.offsetTop / (compDiv.scrollHeight || 1);
      }
      return;
    }

    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    state.startX = t.clientX;
    state.startY = t.clientY;
    state.startTime = Date.now();
    state.scrollLeft0 = compDiv.scrollLeft;
    state.scrollTop0 = compDiv.scrollTop;
  }

  function onTouchMove(e: TouchEvent) {
    if (state.isPinch && e.touches.length === 2) {
      e.preventDefault();
      const dist = touchDist(e.touches[0], e.touches[1]);
      const scale = dist / (state.startDist || 1);
      const newWidth = Math.round(state.pinchBaseWidth * scale);

      setZoomWidth(newWidth);
      setZoomMode("custom");

      const rows = compDiv.querySelectorAll("._scf_comp_row") as NodeListOf<HTMLElement>;
      for (const row of rows) row.style.width = newWidth + "px";
      compDiv.classList.add("_scf_zoomed");

      const mid = touchMid(e.touches[0], e.touches[1]);
      const rect = compDiv.getBoundingClientRect();
      const vpX = mid.clientX - rect.left;
      const vpY = mid.clientY - rect.top;

      const row = comp.allRowData[state.pinchRowIdx]?.rowDiv;
      if (row) {
        const rowW = row.offsetWidth || 1;
        const rowH = row.offsetHeight || 1;
        const targetContentX = row.offsetLeft + state.pinchRowXRatio * rowW;
        const targetContentY = row.offsetTop + state.pinchRowYRatio * rowH;
        compDiv.scrollLeft = targetContentX - vpX;
        compDiv.scrollTop = targetContentY - vpY;
      }
      return;
    }

    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const dx = t.clientX - state.startX;
    const dy = t.clientY - state.startY;

    const zoomed = compDiv.classList.contains("_scf_zoomed");
    if (zoomed) {
      state.isDrag = true;
      state.handled = true;
      compDiv.scrollLeft = state.scrollLeft0 - dx;
      compDiv.scrollTop = state.scrollTop0 - dy;
      return;
    }

    if (!state.isSwipe && !state.handled) {
      if (Math.abs(dx) > SWIPE_THRESH && Math.abs(dy) < SWIPE_MAX_Y) {
        state.isSwipe = true;
        state.handled = true;
      }
    }
  }

  function onTouchEnd(e: TouchEvent) {
    if (state.isPinch) {
      if (e.touches.length === 0) {
        state.isPinch = false;
        if (comp.updateScrollSpacers) comp.updateScrollSpacers();
        if (comp.updateNavMap) comp.updateNavMap();
        showToast(zoomToast());
      }
      return;
    }

    if (e.touches.length !== 0) return;
    const ct = e.changedTouches[0];
    if (!ct) return;

    const dx = ct.clientX - state.startX;
    const dy = ct.clientY - state.startY;
    const elapsed = Date.now() - state.startTime;

    if (state.isSwipe) {
      const dir = dx < 0 ? 1 : -1;
      const nextCol = (comp.currentCol + dir + comp.numCols) % comp.numCols;
      switchColumn(nextCol);
      return;
    }

    if (state.isDrag) return;

    if (Math.abs(dx) < TAP_THRESH && Math.abs(dy) < TAP_THRESH && elapsed < TAP_MAX_MS) {
      const relX = Math.max(0, Math.min(0.9999, ct.clientX / window.innerWidth));
      const tappedCol = Math.floor(relX * comp.numCols);
      if (tappedCol !== comp.currentCol) {
        switchColumn(tappedCol);
      }
    }
  }

  compDiv.addEventListener("touchstart", onTouchStart, { passive: false });
  compDiv.addEventListener("touchmove", onTouchMove, { passive: false });
  compDiv.addEventListener("touchend", onTouchEnd);

  return () => {
    compDiv.removeEventListener("touchstart", onTouchStart);
    compDiv.removeEventListener("touchmove", onTouchMove);
    compDiv.removeEventListener("touchend", onTouchEnd);
  };
}
