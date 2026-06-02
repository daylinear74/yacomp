// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Auto-hide chrome controller (① auto-hide UI)                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Keeps the viewer minimal: the source label ("column nav"), row nav, close
// button and toolbar fade out after a spell of no activity and reveal again on
// a relevant action. Reveals are SCOPED — moving the mouse or pressing a digit
// surfaces the column nav, while arrow/h/j/k and scrolling surface the row nav —
// but everything shares one hide timer, so once activity stops the whole chrome
// settles. There is no proximity hotspot: when hidden, the UI is fully gone
// until an action brings it back. "Always show" pins everything on.

import { uiHideDelay, uiAlwaysShow } from "../config";
import { zoomMode } from "../filters/zoom";

/** opacity:0 + pointer-events:none, transitioned — the idle/auto-hidden state. */
const HIDDEN = "_scf_ui_autohidden";
/** display:none — a persistent override (R key for row nav, 1:1 for fill btn). */
const FORCE_HIDDEN = "_scf_ui_force_hidden";

export interface AutoHideTargets {
  compDiv: HTMLElement;
  labelEl: HTMLElement;
  rowNavEl: HTMLElement | null;
  closeBtnEl: HTMLElement;
  toolbarEl: HTMLElement;
  fillCanvasBtnEl: HTMLElement;
}

export interface AutoHide {
  /** Show the source label + corner chrome; reset the hide timer. */
  revealColumnNav: () => void;
  /** Show the row nav + corner chrome; reset the hide timer. */
  revealRowNav: () => void;
  /** Re-apply the fit/fill button's "hidden entirely at 1:1" rule. */
  syncFillCanvasVisibility: () => void;
  cleanup: () => void;
}

export function createAutoHide(t: AutoHideTargets): AutoHide {
  let hideTimer: ReturnType<typeof setTimeout> | null = null;
  let hovering = false;
  // Corner chrome reveals on ANY activity; the label / row nav are scoped.
  const corners = [t.closeBtnEl, t.toolbarEl];
  const all = [t.labelEl, t.closeBtnEl, t.toolbarEl, ...(t.rowNavEl ? [t.rowNavEl] : [])];
  // Elements the pointer can rest on — hovering one must not let it fade away.
  const hoverable = [t.closeBtnEl, t.toolbarEl, ...(t.rowNavEl ? [t.rowNavEl] : [])];

  function clearTimer(): void {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  function hideAll(): void {
    for (const el of all) el.classList.add(HIDDEN);
  }

  function scheduleHide(): void {
    clearTimer();
    if (uiAlwaysShow() || hovering) return;
    hideTimer = setTimeout(hideAll, uiHideDelay());
  }

  function show(...els: (HTMLElement | null)[]): void {
    for (const el of els) el?.classList.remove(HIDDEN);
  }

  function revealColumnNav(): void {
    show(t.labelEl, ...corners);
    scheduleHide();
  }

  function revealRowNav(): void {
    show(t.rowNavEl, ...corners);
    scheduleHide();
  }

  function syncFillCanvasVisibility(): void {
    // The fit/fill canvas toggle is meaningless at 1:1 (each image is native),
    // so hide it entirely there; otherwise it auto-hides with the toolbar.
    t.fillCanvasBtnEl.classList.toggle(FORCE_HIDDEN, zoomMode === "1:1");
  }

  const onMove = (): void => revealColumnNav();
  const onScroll = (): void => revealRowNav();
  t.compDiv.addEventListener("mousemove", onMove);
  t.compDiv.addEventListener("scroll", onScroll, { passive: true });

  // Hover-pause: the chrome lives outside compDiv (sibling nodes in the shadow
  // root), so the cursor resting on a button fires no compDiv mousemove. Pin
  // visibility while the pointer is over any control, resume timing on leave.
  const onEnter = (): void => {
    hovering = true;
    clearTimer();
  };
  const onLeave = (): void => {
    hovering = false;
    scheduleHide();
  };
  for (const el of hoverable) {
    el.addEventListener("mouseenter", onEnter);
    el.addEventListener("mouseleave", onLeave);
  }

  syncFillCanvasVisibility();
  // Briefly surface everything on open so the controls are discoverable, then
  // let them settle (or stay, when "always show" is on).
  show(...all);
  scheduleHide();

  function cleanup(): void {
    clearTimer();
    t.compDiv.removeEventListener("mousemove", onMove);
    t.compDiv.removeEventListener("scroll", onScroll);
    for (const el of hoverable) {
      el.removeEventListener("mouseenter", onEnter);
      el.removeEventListener("mouseleave", onLeave);
    }
  }

  return { revealColumnNav, revealRowNav, syncFillCanvasVisibility, cleanup };
}
