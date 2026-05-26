// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Keyboard — window capture phase                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { MODES, modeIndex, setModeIndex, cur } from "./filters/modes";
import {
  BC_STEP, BC_MIN, BC_MAX, isDefault, adjustBrightness, brightnessAdjustmentLabel,
  hasAdjustments, resetAdjustments,
} from "./filters/brightness";
import {
  cycleGammaMismatchCheck,
  gammaMismatchCheckName,
  gammaMismatchCheckPowLabel,
  gammaMismatchCheckValueLabel,
} from "./filters/gamma-check";
import { syncAll } from "./filters/imaging";
import { showToast } from "./ui/toast";
import {
  activeComps, navMapEnabled, toggleNavMap,
  fillCanvasEnabled, toggleFillCanvas, applyFillCanvas,
  doZoomIn, doZoomOut, doZoomFit, doZoom1to1,
} from "./filters/zoom";
import { openSlowPicsViewer } from "./sites/slowpics";
import { visibleColumnOffset } from "./viewer/source-visibility";
import type { Comp } from "./viewer/types";

export function sourceNameForColumn(
  comp: Pick<Comp, "sourceNames">,
  col: number,
): string {
  const name = comp.sourceNames?.[col]?.trim();
  return name || "Source " + (col + 1);
}

export function applyBracketAdjustment(
  comp: Comp,
  e: Pick<KeyboardEvent, "code" | "shiftKey">,
): string | null {
  if (e.code !== "BracketLeft" && e.code !== "BracketRight") return null;

  const col = comp.currentCol;
  const direction = e.code === "BracketRight" ? 1 : -1;
  const delta = direction > 0 ? BC_STEP : -BC_STEP;
  const srcName = "Source " + (col + 1);
  if (e.shiftKey) {
    comp.colContrast[col] = Math.max(
      BC_MIN,
      Math.min(BC_MAX, +(comp.colContrast[col] + delta).toFixed(2)),
    );
    return "◐ " + srcName + " Contrast " + Math.round(comp.colContrast[col] * 100) + "%";
  }

  const next = adjustBrightness(comp.colBrightness[col], direction);
  comp.colBrightness[col] = next;
  return "☀ " + srcName + " " + brightnessAdjustmentLabel(next);
}

function isEditing(): boolean {
  const el = document.activeElement;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    !!(el as HTMLElement | null)?.isContentEditable
  );
}

function hasCompAdjustments(): boolean {
  if (hasAdjustments()) return true;
  for (const comp of activeComps) {
    if (comp.colBrightness.some((v) => !isDefault(v))) return true;
    if (comp.colGammaCheck.some(Boolean)) return true;
    if (comp.colContrast.some((v) => !isDefault(v))) return true;
  }
  return false;
}

export function setupKeyboard(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditing()) return;

      // V: open viewer on slow.pics / comp.pics (before comp-only guard)
      if (e.code === "KeyV" && activeComps.length === 0) {
        const btn = document.querySelector<HTMLElement>("[data-yacomp-comppics]");
        if (btn) {
          e.preventDefault();
          e.stopPropagation();
          btn.click();
          return;
        }
        if (openSlowPicsViewer()) {
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }

      if (activeComps.length === 0) return;

      switch (e.code) {
        case "Escape":
          e.preventDefault();
          if (hasCompAdjustments()) {
            resetAdjustments();
            const comp = activeComps[activeComps.length - 1];
            if (comp) {
              comp.colBrightness.fill(1.0);
              comp.colGammaCheck.fill(null);
              comp.colContrast.fill(1.0);
            }
            syncAll();
            showToast(cur().toast);
          } else {
            activeComps[activeComps.length - 1].close();
          }
          break;

        case "Minus": // zoom out
          e.preventDefault();
          doZoomOut();
          break;

        case "Equal": // zoom in (= / +)
          e.preventDefault();
          doZoomIn();
          break;

        case "Digit0": // fit to width
          e.preventDefault();
          doZoomFit();
          break;

        case "KeyO": // 1:1
          e.preventDefault();
          doZoom1to1();
          break;

        case "ArrowLeft":
        case "KeyH": {
          e.preventDefault();
          const comp = activeComps[activeComps.length - 1];
          const offset = visibleColumnOffset(comp.visibleCols, comp.currentCol);
          const next = (offset - 1 + comp.visibleCols.length) % comp.visibleCols.length;
          comp.setColumn(comp.visibleCols[next]);
          break;
        }

        case "ArrowRight":
        case "KeyL": {
          e.preventDefault();
          const comp = activeComps[activeComps.length - 1];
          const offset = visibleColumnOffset(comp.visibleCols, comp.currentCol);
          const next = (offset + 1) % comp.visibleCols.length;
          comp.setColumn(comp.visibleCols[next]);
          break;
        }

        case "ArrowUp":
        case "KeyK": {
          e.preventDefault();
          const comp = activeComps[activeComps.length - 1];
          comp.setRow(comp.currentRow - 1);
          break;
        }

        case "ArrowDown":
        case "KeyJ": {
          e.preventDefault();
          const comp = activeComps[activeComps.length - 1];
          comp.setRow(comp.currentRow + 1);
          break;
        }

        case "Digit1":
        case "Digit2":
        case "Digit3":
        case "Digit4":
        case "Digit5":
        case "Digit6":
        case "Digit7":
        case "Digit8":
        case "Digit9": {
          const comp = activeComps[activeComps.length - 1];
          if (!comp) break;
          const idx = parseInt(e.code.charAt(5), 10) - 1;
          if (idx < comp.visibleCols.length) {
            e.preventDefault();
            comp.setColumn(comp.visibleCols[idx]);
          }
          break;
        }

        case "KeyM": {
          if (activeComps.length === 0) break;
          e.preventDefault();
          toggleNavMap();
          for (const comp of activeComps) {
            if (comp.updateNavMap) comp.updateNavMap();
          }
          showToast(navMapEnabled ? "Minimap ON" : "Minimap OFF");
          break;
        }

        case "BracketLeft":
        case "BracketRight": {
          const comp = activeComps[activeComps.length - 1];
          if (!comp) break;
          const toast = applyBracketAdjustment(comp, e);
          if (!toast) break;
          e.preventDefault();
          syncAll();
          showToast(toast);
          break;
        }
      }
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditing()) return;

      if (e.key === "Escape" && activeComps.length === 0 && hasAdjustments()) {
        resetAdjustments();
        syncAll();
        showToast(cur().toast);
        return;
      }

      // F / Shift+F: cycle filter modes
      if (e.code === "KeyF") {
        if (e.shiftKey) {
          setModeIndex((modeIndex - 1 + MODES.length) % MODES.length);
        } else {
          setModeIndex((modeIndex + 1) % MODES.length);
        }
        syncAll();
        showToast(cur().toast);
        return;
      }

      // B: toggle background-load mode for active comparison
      if (e.code === "KeyB" && activeComps.length > 0) {
        const comp = activeComps[activeComps.length - 1];
        const next = !comp.bgLoadAll();
        comp.setBgLoadAll(next);
        showToast("Lazy load: " + (next ? "bg (load all)" : "viewport only"));
        if (next) comp.triggerBgLoad();
        return;
      }

      // C: toggle canvas fill/fit mode
      if (e.code === "KeyC" && activeComps.length > 0) {
        toggleFillCanvas();
        applyFillCanvas();
        for (const comp of activeComps) comp.updateFillCanvasBtn?.();
        showToast(fillCanvasEnabled ? "Canvas: Fill" : "Canvas: Fit");
        return;
      }

      // R: toggle row nav sidebar
      if (e.code === "KeyR" && activeComps.length > 0) {
        const nav = document.querySelector("._scf_row_nav") as HTMLElement | null;
        if (nav) {
          const visible = nav.style.opacity !== "0";
          nav.style.opacity = visible ? "0" : "1";
          showToast("Row nav: " + (visible ? "off" : "on"));
        }
        return;
      }

      // G / Shift+G: cycle gamma mismatch check presets for current source
      if (e.code === "KeyG" && activeComps.length > 0) {
        const comp = activeComps[activeComps.length - 1];
        const col = comp.currentCol;
        const next = cycleGammaMismatchCheck(comp.colGammaCheck[col], e.shiftKey ? -1 : 1);
        comp.colGammaCheck[col] = next;
        syncAll();
        const srcName = sourceNameForColumn(comp, col);
        if (next) {
          showToast([
            { text: srcName, size: "small", muted: true },
            { text: "Gamma mismatch check", size: "normal" },
            { text: gammaMismatchCheckValueLabel(next), size: "large" },
            { text: gammaMismatchCheckName(next), size: "small" },
            { text: gammaMismatchCheckPowLabel(next), size: "tiny", muted: true },
          ]);
        } else {
          showToast("Gamma mismatch check OFF");
        }
        return;
      }

      // \ : reset current source adjustments; Shift+\ : reset all sources
      if (e.code === "Backslash") {
        const comp = activeComps[activeComps.length - 1];
        if (!comp) return;
        if (e.shiftKey) {
          comp.colBrightness.fill(1.0);
          comp.colGammaCheck.fill(null);
          comp.colContrast.fill(1.0);
          syncAll();
          showToast("↺ Reset all adjustments");
        } else {
          const col = comp.currentCol;
          comp.colBrightness[col] = 1.0;
          comp.colGammaCheck[col] = null;
          comp.colContrast[col] = 1.0;
          syncAll();
          showToast("↺ Reset Source " + (col + 1) + " adjustments");
        }
        return;
      }
    },
    true,
  );
}
