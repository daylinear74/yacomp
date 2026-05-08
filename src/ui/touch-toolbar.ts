// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Touch toolbar — floating control bar for touch devices                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { MODES, modeIndex, setModeIndex, cur } from "../filters/modes";
import {
  cycleGammaMismatchCheck,
  gammaMismatchCheckName,
  gammaMismatchCheckPowLabel,
  gammaMismatchCheckValueLabel,
} from "../filters/gamma-check";
import { syncAll } from "../filters/imaging";
import { showToast, type ToastLine } from "../ui/toast";
import {
  doZoomIn, doZoomOut, doZoomFit, doZoom1to1,
  toggleNavMap, navMapEnabled,
} from "../filters/zoom";
import { applyBracketAdjustment } from "../keyboard";
import type { Comp } from "../viewer/types";

function filterLabel(): string {
  const mode = cur();
  if (!mode.label) return "◼";
  const match = mode.label.match(/^(\S+)/);
  return match ? match[1] : "F";
}

export function isTouchDevice(): boolean {
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

export function createTouchToolbar(comp: Comp): { el: HTMLDivElement; cleanup: () => void } {
  const el = document.createElement("div");
  el.className = "_scf_touch_toolbar";

  const filterBtn = mkBtn(filterLabel(), "Cycle filter", () => {
    setModeIndex((modeIndex + 1) % MODES.length);
    syncAll();
    showToast(cur().toast);
    filterBtn.textContent = filterLabel();
  });

  const gammaBtn = mkBtn("γ", "Gamma check", () => {
    const col = comp.currentCol;
    const next = cycleGammaMismatchCheck(comp.colGammaCheck[col], 1);
    comp.colGammaCheck[col] = next;
    syncAll();
    if (next) {
      showToast([
        { text: "Source " + (col + 1), size: "small", muted: true },
        { text: "Gamma mismatch check", size: "normal" },
        { text: gammaMismatchCheckValueLabel(next), size: "large" },
        { text: gammaMismatchCheckName(next), size: "small" },
        { text: gammaMismatchCheckPowLabel(next), size: "tiny", muted: true },
      ] as ToastLine[]);
    } else {
      showToast("Gamma mismatch check OFF");
    }
  });

  mkBtn("☀+", "Brightness up", () => {
    const toast = applyBracketAdjustment(comp, { code: "BracketRight", shiftKey: false });
    if (toast) { syncAll(); showToast(toast); }
  });

  mkBtn("☀−", "Brightness down", () => {
    const toast = applyBracketAdjustment(comp, { code: "BracketLeft", shiftKey: false });
    if (toast) { syncAll(); showToast(toast); }
  });

  mkBtn("+", "Zoom in", () => doZoomIn());
  mkBtn("−", "Zoom out", () => doZoomOut());
  mkBtn("Fit", "Fit to width", () => doZoomFit());
  mkBtn("1:1", "Original size", () => doZoom1to1());

  mkBtn("M", "Minimap", () => {
    toggleNavMap();
    if (comp.updateNavMap) comp.updateNavMap();
    showToast(navMapEnabled ? "Minimap ON" : "Minimap OFF");
  });

  mkBtn("⎋", "Close", () => comp.close());

  document.body.appendChild(el);

  return {
    el,
    cleanup: () => el.remove(),
  };

  function mkBtn(label: string, title: string, action: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "_scf_touch_btn";
    b.textContent = label;
    b.title = title;
    b.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      action();
    });
    el.appendChild(b);
    return b;
  }
}
