// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Keyboard — window capture phase                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { MODES, modeIndex, setModeIndex, cur } from "./filters/modes";
import {
  brightness, contrast, setBrightness, setContrast,
  BC_STEP, BC_MIN, BC_MAX,
  hasAdjustments, resetAdjustments,
} from "./filters/brightness";
import { syncAll } from "./filters/imaging";
import { showToast } from "./ui/toast";
import {
  activeComps, navMapEnabled, toggleNavMap,
  doZoomIn, doZoomOut, doZoomFit, doZoom1to1,
} from "./filters/zoom";

function isEditing(): boolean {
  const el = document.activeElement;
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    !!(el as HTMLElement | null)?.isContentEditable
  );
}

export function setupKeyboard(): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isEditing()) return;
      if (activeComps.length === 0) return;

      switch (e.code) {
        case "Escape":
          e.preventDefault();
          if (hasAdjustments()) {
            resetAdjustments();
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
          comp.setColumn((comp.currentCol - 1 + comp.numCols) % comp.numCols);
          break;
        }

        case "ArrowRight":
        case "KeyL": {
          e.preventDefault();
          const comp = activeComps[activeComps.length - 1];
          comp.setColumn((comp.currentCol + 1) % comp.numCols);
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
          if (idx < comp.numCols) {
            e.preventDefault();
            comp.setColumn(idx);
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

      // [ / ] : brightness down / up;  { / } (Shift+[ / Shift+]) : contrast down / up
      if (e.code === "BracketLeft" || e.code === "BracketRight") {
        const delta = e.code === "BracketRight" ? BC_STEP : -BC_STEP;
        if (e.shiftKey) {
          setContrast(Math.max(BC_MIN, Math.min(BC_MAX, +(contrast + delta).toFixed(2))));
          syncAll();
          showToast("◐ Contrast " + Math.round(contrast * 100) + "%");
        } else {
          setBrightness(Math.max(BC_MIN, Math.min(BC_MAX, +(brightness + delta).toFixed(2))));
          syncAll();
          showToast("☀ Brightness " + Math.round(brightness * 100) + "%");
        }
        return;
      }

      // \ : reset brightness & contrast
      if (e.code === "Backslash") {
        setBrightness(1.0);
        setContrast(1.0);
        syncAll();
        showToast("↺ Reset B/C");
        return;
      }
    },
    true,
  );
}
