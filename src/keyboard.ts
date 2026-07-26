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
import { getShadowRoot, isEditing } from "./ui/shadow";
import { isHelpOpen, hideHelpOverlay, toggleHelpOverlay } from "./viewer/help-overlay";
import { ACTIONS, type ActionId } from "./shortcuts/registry";
import { keyShortcutMatchesEvent, mouseShortcutMatches, type MouseShortcut } from "./shortcuts/types";
import { isShortcutCapturing } from "./shortcuts/capture-state";
import type { DragState } from "./viewer/drag";
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
  const srcName = sourceNameForColumn(comp, col);
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
  // Step from the in-flight navigation target when there is one, so rapid
  // presses accumulate instead of re-deriving from a mid-scroll currentRow.
  if (c) c.setRow((c.navTargetRow ?? c.currentRow) + delta);
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

  "viewer.help": () => toggleHelpOverlay(),
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

/** Run the action bound (main/extra) to this mouse gesture. Viewer-only. */
function dispatchMouse(g: MouseShortcut["g"]): boolean {
  if (activeComps.length === 0) return false;
  for (const meta of ACTIONS) {
    const pair = shortcutPairFor(meta.id);
    if (mouseShortcutMatches(pair.main, g) || (pair.extra != null && mouseShortcutMatches(pair.extra, g))) {
      HANDLERS[meta.id]({ source: "mouse" });
      return true;
    }
  }
  return false;
}

function mouseGestureBound(g: MouseShortcut["g"]): boolean {
  if (activeComps.length === 0) return false;
  return ACTIONS.some((meta) => {
    const pair = shortcutPairFor(meta.id);
    return mouseShortcutMatches(pair.main, g) || (pair.extra != null && mouseShortcutMatches(pair.extra, g));
  });
}

/** Canvas mouse-gesture shortcuts (click / dblclick / middle / back / forward),
 *  set up per comparison. Listeners live on compDiv, so they only fire for the
 *  image area and are torn down with it. A pan (drag) is never a click. */
export function setupCompMouseShortcuts(compDiv: HTMLElement, drag: DragState): void {
  let downX = 0, downY = 0;

  compDiv.addEventListener("mousedown", (e) => {
    if (e.button === 0) {
      downX = e.clientX;
      downY = e.clientY;
      return;
    }
    // Stop the browser navigating/scrolling when an aux button is bound.
    const g = e.button === 1 ? "middle" : e.button === 3 ? "back" : e.button === 4 ? "forward" : null;
    if (g && mouseGestureBound(g)) e.preventDefault();
  });

  compDiv.addEventListener("mouseup", (e) => {
    if (e.button !== 0 || drag.active) return;
    if (Math.abs(e.clientX - downX) > 4 || Math.abs(e.clientY - downY) > 4) return;
    dispatchMouse("click");
  });

  compDiv.addEventListener("dblclick", () => dispatchMouse("dblclick"));

  compDiv.addEventListener("auxclick", (e) => {
    const g = e.button === 1 ? "middle" : e.button === 3 ? "back" : e.button === 4 ? "forward" : null;
    if (g && dispatchMouse(g)) e.preventDefault();
  });
}

export function setupKeyboard(hostname?: string): void {
  window.addEventListener(
    "keydown",
    (e) => {
      if (isShortcutCapturing() || isEditing()) return;
      const hasComp = activeComps.length > 0;
      if (!hasComp && !siteBehaviorEnabled(hostname)) return;

      // While the shortcuts legend is up it is modal: a close binding (its own
      // key, or Escape) dismisses it; every other key is swallowed so it doesn't
      // drive the viewer underneath.
      if (isHelpOpen()) {
        const help = shortcutPairFor("viewer.help");
        if (
          e.code === "Escape" ||
          keyShortcutMatchesEvent(help.main, e) ||
          (help.extra != null && keyShortcutMatchesEvent(help.extra, e))
        ) {
          e.preventDefault();
          hideHelpOverlay();
        }
        e.stopPropagation();
        return;
      }

      // V: open viewer on slow.pics / comp.pics (no viewer open yet).
      if (
        e.code === "KeyV" && !hasComp &&
        !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
      ) {
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
      if (
        hasComp && /^Digit[1-9]$/.test(e.code) &&
        !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
      ) {
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
      if (isShortcutCapturing() || isEditing()) return;
      const hasComp = activeComps.length > 0;
      if (!hasComp && !siteBehaviorEnabled(hostname)) return;

      // Modal legend: swallow key-ups too so a held key doesn't leak through.
      if (isHelpOpen()) {
        e.stopPropagation();
        return;
      }

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
