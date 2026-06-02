// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Keyboard / shortcut dispatch — window capture phase                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { cycleMode, cur } from "./filters/modes";
import {
  BC_MIN, BC_MAX, isDefault, adjustBrightness, brightnessAdjustmentLabel,
  hasAdjustments, resetAdjustments,
} from "./filters/brightness";
import { bcStep, shortcutPairFor } from "./config";
import { siteBehaviorEnabled } from "./sites/current-site";
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
import { getShadowRoot } from "./ui/shadow";
import { ACTIONS, type ActionId } from "./shortcuts/registry";
import { keyShortcutMatchesEvent } from "./shortcuts/types";
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
  const step = bcStep();
  const delta = direction > 0 ? step : -step;
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
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
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

function lastComp(): Comp | undefined {
  return activeComps[activeComps.length - 1];
}

// ── Action handlers ──────────────────────────────────────────────────────────

function navColumn(delta: number): void {
  const c = lastComp();
  if (!c) return;
  const offset = visibleColumnOffset(c.visibleCols, c.currentCol);
  const next = (offset + delta + c.visibleCols.length) % c.visibleCols.length;
  c.setColumn(c.visibleCols[next]);
}

function navRow(delta: number): void {
  const c = lastComp();
  if (c) c.setRow(c.currentRow + delta);
}

function adjustBracket(code: "BracketLeft" | "BracketRight", shiftKey: boolean): void {
  const c = lastComp();
  if (!c) return;
  const toast = applyBracketAdjustment(c, { code, shiftKey });
  if (!toast) return;
  syncAll();
  showToast(toast);
}

function cycleGamma(dir: 1 | -1): void {
  const c = lastComp();
  if (!c) return;
  const col = c.currentCol;
  const next = cycleGammaMismatchCheck(c.colGammaCheck[col], dir);
  c.colGammaCheck[col] = next;
  syncAll();
  if (next) {
    showToast([
      { text: sourceNameForColumn(c, col), size: "small", muted: true },
      { text: "Gamma mismatch check", size: "normal" },
      { text: gammaMismatchCheckValueLabel(next), size: "large" },
      { text: gammaMismatchCheckName(next), size: "small" },
      { text: gammaMismatchCheckPowLabel(next), size: "tiny", muted: true },
    ]);
  } else {
    showToast("Gamma mismatch check OFF");
  }
}

function resetAdjustmentsAction(all: boolean): void {
  const c = lastComp();
  if (!c) return;
  if (all) {
    c.colBrightness.fill(1.0);
    c.colGammaCheck.fill(null);
    c.colContrast.fill(1.0);
    syncAll();
    showToast("↺ Reset all adjustments");
  } else {
    const col = c.currentCol;
    c.colBrightness[col] = 1.0;
    c.colGammaCheck[col] = null;
    c.colContrast[col] = 1.0;
    syncAll();
    showToast("↺ Reset Source " + (col + 1) + " adjustments");
  }
}

function closeViewer(source: "key" | "mouse"): void {
  // Keyboard close resets pending adjustments first (then closes on a second
  // press); a mouse gesture always just closes.
  if (source === "key" && hasCompAdjustments()) {
    resetAdjustments();
    const c = lastComp();
    if (c) {
      c.colBrightness.fill(1.0);
      c.colGammaCheck.fill(null);
      c.colContrast.fill(1.0);
    }
    syncAll();
    showToast(cur().toast);
    return;
  }
  lastComp()?.close();
}

interface ActionCtx {
  source: "key" | "mouse";
}

const HANDLERS: Record<ActionId, (ctx: ActionCtx) => void> = {
  "zoom.in": () => doZoomIn(),
  "zoom.out": () => doZoomOut(),
  "zoom.fit": () => doZoomFit(),
  "zoom.oneToOne": () => doZoom1to1(),

  "nav.colPrev": () => navColumn(-1),
  "nav.colNext": () => navColumn(1),
  "nav.rowPrev": () => navRow(-1),
  "nav.rowNext": () => navRow(1),

  "display.canvas": () => {
    toggleFillCanvas();
    applyFillCanvas();
    for (const comp of activeComps) comp.updateFillCanvasBtn?.();
    showToast(fillCanvasEnabled ? "Canvas: Fill" : "Canvas: Fit");
  },
  "display.minimap": () => {
    toggleNavMap();
    for (const comp of activeComps) comp.updateNavMap?.();
    showToast(navMapEnabled ? "Minimap ON" : "Minimap OFF");
  },
  "display.rowNav": () => {
    const nav = getShadowRoot().querySelector("._scf_row_nav") as HTMLElement | null;
    if (!nav) return;
    const hidden = nav.classList.toggle("_scf_ui_force_hidden");
    showToast("Row nav: " + (hidden ? "off" : "on"));
    if (!hidden) lastComp()?.revealRowNav?.();
  },
  "display.bgLoad": () => {
    const c = lastComp();
    if (!c) return;
    const next = !c.bgLoadAll();
    c.setBgLoadAll(next);
    showToast("Lazy load: " + (next ? "bg (load all)" : "viewport only"));
    if (next) c.triggerBgLoad();
  },

  "filter.next": () => { cycleMode(1); syncAll(); showToast(cur().toast); },
  "filter.prev": () => { cycleMode(-1); syncAll(); showToast(cur().toast); },
  "gamma.next": () => cycleGamma(1),
  "gamma.prev": () => cycleGamma(-1),
  "bright.up": () => adjustBracket("BracketRight", false),
  "bright.down": () => adjustBracket("BracketLeft", false),
  "contrast.up": () => adjustBracket("BracketRight", true),
  "contrast.down": () => adjustBracket("BracketLeft", true),
  "adjust.resetSource": () => resetAdjustmentsAction(false),
  "adjust.resetAll": () => resetAdjustmentsAction(true),

  "viewer.close": (ctx) => closeViewer(ctx.source),
};

/** Run the action whose main/extra binding matches this event, in the given
 *  phase. Returns true if one fired. First registered action wins. */
function dispatchKey(e: KeyboardEvent, phase: "down" | "up"): boolean {
  const hasComp = activeComps.length > 0;
  for (const meta of ACTIONS) {
    if ((meta.phase ?? "down") !== phase) continue;
    if (!hasComp && !meta.siteLevel) continue;
    const pair = shortcutPairFor(meta.id);
    if (
      keyShortcutMatchesEvent(pair.main, e) ||
      (pair.extra != null && keyShortcutMatchesEvent(pair.extra, e))
    ) {
      e.preventDefault();
      HANDLERS[meta.id]({ source: "key" });
      return true;
    }
  }
  return false;
}

export function setupKeyboard(hostname?: string): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (isEditing()) return;
      const hasComp = activeComps.length > 0;
      if (!hasComp && !siteBehaviorEnabled(hostname)) return;

      // V: open viewer on slow.pics / comp.pics (no viewer open yet).
      if (e.code === "KeyV" && !hasComp && !e.ctrlKey && !e.altKey && !e.metaKey) {
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

      // Fixed digit jumps 1–9 → that source (not customizable).
      if (hasComp && /^Digit[1-9]$/.test(e.code) && !e.ctrlKey && !e.altKey && !e.metaKey) {
        const comp = lastComp();
        const idx = parseInt(e.code.charAt(5), 10) - 1;
        if (comp && idx < comp.visibleCols.length) {
          e.preventDefault();
          comp.setColumn(comp.visibleCols[idx]);
        }
        return;
      }

      dispatchKey(e, "down");
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (e) => {
      if (isEditing()) return;
      const hasComp = activeComps.length > 0;
      if (!hasComp && !siteBehaviorEnabled(hostname)) return;

      // No viewer open: Escape clears page-level filter adjustments.
      if (
        e.key === "Escape" && !hasComp && hasAdjustments() &&
        !e.ctrlKey && !e.altKey && !e.metaKey
      ) {
        resetAdjustments();
        syncAll();
        showToast(cur().toast);
        return;
      }

      dispatchKey(e, "up");
    },
    true,
  );
}
