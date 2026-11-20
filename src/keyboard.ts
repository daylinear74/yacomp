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
import { getShadowRoot, isEditing, isYacompEvent } from "./ui/shadow";
import { isHelpOpen, hideHelpOverlay, toggleHelpOverlay } from "./viewer/help-overlay";
import { ACTIONS, type ActionId, type ActionMeta } from "./shortcuts/registry";
import { keyShortcutMatchesEvent, mouseShortcutMatches, type MouseShortcut } from "./shortcuts/types";
import { shortcutCaptureHandler } from "./shortcuts/capture-state";
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

/** Keys a comparison page binds itself: slow.pics uses letters, digits and
 *  Space for image switching, arrows and Space for navigation, and Ctrl with
 *  the zoom keys for its own zoom. Tab, function keys and Cmd/Alt chords stay
 *  with the browser. */
const PAGE_NAV_KEYS = new Set([
  " ", "Spacebar", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown",
]);

const PAGE_ZOOM_KEYS = new Set(["=", "+", "-", "_", "0"]);

export function pageMayBind(e: KeyboardEvent): boolean {
  if (e.metaKey || e.altKey) return false;
  if (e.ctrlKey) return PAGE_ZOOM_KEYS.has(e.key);
  return e.key.length === 1 || PAGE_NAV_KEYS.has(e.key);
}

/** Match before dispatch so release-phase actions also own the keydown. */
export function keyAction(e: KeyboardEvent, hasComp: boolean): ActionMeta | undefined {
  for (const meta of ACTIONS) {
    if (!hasComp && !meta.siteLevel) continue;
    const pair = shortcutPairFor(meta.id);
    if (
      keyShortcutMatchesEvent(pair.main, e) ||
      (pair.extra != null && keyShortcutMatchesEvent(pair.extra, e))
    ) {
      return meta;
    }
  }
}

function sealKey(e: KeyboardEvent, allowDefault = false): void {
  if (!allowDefault) e.preventDefault();
  e.stopImmediatePropagation();
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
  // Keep each physical press with the action and viewer that received it.
  // Closing the viewer or releasing Shift first must not retarget its keyup.
  interface KeyClaim {
    action?: ActionMeta | "page.reset";
    allowDefault?: boolean;
  }
  type HeldKey = KeyClaim & { viewer: Comp | undefined };
  const claimedKeys = new Map<string, HeldKey>();

  function claim(e: KeyboardEvent, options: KeyClaim = {}): void {
    sealKey(e, options.allowDefault);
    claimedKeys.set(e.code, { ...options, viewer: lastComp() });
  }

  function runHeldAction(held: HeldKey, phase: "repeat" | "up"): void {
    const action = held.action;
    if (!action || held.viewer !== lastComp() || (!held.viewer && !siteBehaviorEnabled(hostname))) return;
    if (isEditing() || isHelpOpen() || shortcutCaptureHandler) return;
    if (action === "page.reset") {
      if (phase === "up") {
        resetAdjustments();
        syncAll();
        showToast(cur().toast);
      }
      return;
    }
    if (phase === "up" && action.phase !== "up") return;
    if (phase === "repeat" && (action.phase === "up" || action.repeat === false)) return;
    HANDLERS[action.id]({ source: "key" });
  }

  window.addEventListener(
    "keydown",
    (e) => {
      // Keep the original chord and owner across repeats, even if focus,
      // modifiers, or the viewer changed while the key was held.
      if (e.repeat) {
        const held = claimedKeys.get(e.code);
        if (held) {
          sealKey(e, held.allowDefault);
          runHeldAction(held, "repeat");
        } else if (isHelpOpen() || shortcutCaptureHandler) {
          e.stopImmediatePropagation();
        } else if (activeComps.length && !isEditing() && pageMayBind(e)) {
          // The viewer may have opened over a key held on the host page.
          claim(e);
        }
        return;
      }
      if (shortcutCaptureHandler) {
        claim(e);
        shortcutCaptureHandler(e);
        return;
      }
      if (!document.body) return;
      if (e.isComposing || isEditing()) {
        // Let settings fields receive text, selection and slider changes
        // without also sending the keystroke to slow.pics.
        if (isYacompEvent(e)) claim(e, { allowDefault: true });
        return;
      }
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
          claim(e);
          hideHelpOverlay();
        } else {
          // Allow browser defaults such as copying text from the legend.
          claim(e, { allowDefault: true });
        }
        return;
      }

      // V: open viewer on slow.pics / comp.pics (no viewer open yet).
      if (
        e.code === "KeyV" && !hasComp &&
        !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
      ) {
        const btn = document.querySelector<HTMLElement>("[data-yacomp-comppics]");
        if (btn) {
          claim(e);
          btn.click();
          return;
        }
        if (openSlowPicsViewer()) claim(e);
        return;
      }

      // Fixed digit jumps 1–9 → that source (not customizable).
      if (
        hasComp && /^Digit[1-9]$/.test(e.code) &&
        !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey
      ) {
        claim(e);
        const comp = lastComp();
        const idx = parseInt(e.code.charAt(5), 10) - 1;
        if (comp && idx < comp.visibleCols.length) {
          comp.setColumn(comp.visibleCols[idx]);
        }
        return;
      }

      // Escape leaves native fullscreen before it closes the viewer.
      if (hasComp && e.code === "Escape" && document.fullscreenElement) {
        claim(e);
        void document.exitFullscreen().catch(() => {});
        return;
      }

      // Escape resets page filters on release; reserve its press as well.
      if (
        e.key === "Escape" && !hasComp && hasAdjustments() &&
        !e.ctrlKey && !e.altKey && !e.metaKey
      ) {
        claim(e, { action: "page.reset" });
        return;
      }

      const action = keyAction(e, hasComp);
      if (action) {
        claim(e, { action });
        if (action.phase !== "up") HANDLERS[action.id]({ source: "key" });
      } else if (hasComp && pageMayBind(e)) {
        // Keep native navigation off the page underneath. An unbound Space
        // can still activate a focused button or checkbox in our own UI.
        const target = e.composedPath()[0];
        const activateControl = e.code === "Space" && isYacompEvent(e) &&
          target instanceof Element && !!target.closest("button, input");
        claim(e, { allowDefault: activateControl });
      }
    },
    true,
  );

  window.addEventListener(
    "keyup",
    (e) => {
      const held = claimedKeys.get(e.code);
      if (held === undefined) {
        // The legend or recorder may have opened while a key was held.
        if (isHelpOpen() || shortcutCaptureHandler) e.stopImmediatePropagation();
        else if (activeComps.length && !isEditing() && pageMayBind(e)) sealKey(e);
        return;
      }
      claimedKeys.delete(e.code);
      sealKey(e, held.allowDefault);
      runHeldAction(held, "up");
    },
    true,
  );

  window.addEventListener("blur", () => claimedKeys.clear());
}
