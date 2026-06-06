// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Auto-hide chrome controller (① auto-hide UI)                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Three visibility modes (config `uiChromeMode`), applied to two groups of
// chrome — the source titles + row nav ("nav"), and the corner buttons (close,
// toolbar = source menu + fit/fill):
//
//   always   — everything stays fully visible.
//   default  — nav sits dimmed and brightens to full on the relevant action
//              (mouse move / digit for titles, arrow / scroll for row nav),
//              then settles back to dim; buttons auto-hide after inactivity and
//              return on any movement.
//   autohide — nav is fully hidden and shows only on the relevant action;
//              buttons appear only when the cursor comes near them (proximity),
//              and are otherwise completely gone.

import { uiChromeMode, uiHideDelay } from "../config";
import { zoomMode } from "../filters/zoom";

/** opacity:0 + pointer-events:none — fully hidden. */
const HIDDEN = "_scf_ui_autohidden";
/** lowered opacity, still interactive — the "default" mode resting state. */
const DIMMED = "_scf_ui_dimmed";
/** display:none — a persistent override (R key for row nav, 1:1 for fill btn). */
const FORCE_HIDDEN = "_scf_ui_force_hidden";

/** How close (px) the cursor must come to a button before it surfaces (autohide). */
const PROXIMITY_PAD = 100;
/** Grace after the cursor leaves a button's zone before it fades, to avoid
 *  flicker at the boundary and while travelling onto the button itself. */
const PROXIMITY_HIDE_MS = 350;

export interface AutoHideTargets {
  compDiv: HTMLElement;
  labelEl: HTMLElement;
  rowNavEl: HTMLElement | null;
  closeBtnEl: HTMLElement;
  toolbarEl: HTMLElement;
  fillCanvasBtnEl: HTMLElement;
}

export interface AutoHide {
  /** Surface the source titles (and, in "default", the buttons) on a column action. */
  revealColumnNav: () => void;
  /** Surface the row nav (and, in "default", the buttons) on a row action. */
  revealRowNav: () => void;
  /** Re-apply the fit/fill button's "hidden entirely at 1:1" rule. */
  syncFillCanvasVisibility: () => void;
  /** Re-apply the current mode's resting state (init + on settings change). */
  resync: () => void;
  cleanup: () => void;
}

export function createAutoHide(t: AutoHideTargets): AutoHide {
  let titleTimer: ReturnType<typeof setTimeout> | null = null;
  let rowTimer: ReturnType<typeof setTimeout> | null = null;
  let buttonTimer: ReturnType<typeof setTimeout> | null = null;
  const proxTimers = new Map<HTMLElement, ReturnType<typeof setTimeout>>();
  const buttons = [t.closeBtnEl, t.toolbarEl];

  const mode = (): "always" | "default" | "autohide" => uiChromeMode();

  /** Apply exactly one of full (none) / dimmed / hidden to an element, leaving
   *  any persistent FORCE_HIDDEN override untouched. */
  function set(el: HTMLElement | null, cls: string | null): void {
    if (!el) return;
    el.classList.remove(HIDDEN, DIMMED);
    if (cls) el.classList.add(cls);
  }

  /** Resting state for the nav group (titles + row nav), by mode. */
  function restNav(): string | null {
    const m = mode();
    return m === "always" ? null : m === "default" ? DIMMED : HIDDEN;
  }
  /** Resting state for the button group — hidden unless "always". */
  function restButton(): string | null {
    return mode() === "always" ? null : HIDDEN;
  }

  // ── nav group: full on action, settle back after the hide delay ───────────
  function revealColumnNav(): void {
    if (mode() === "always") return;
    set(t.labelEl, null);
    if (titleTimer) clearTimeout(titleTimer);
    titleTimer = setTimeout(() => set(t.labelEl, restNav()), uiHideDelay());
    if (mode() === "default") revealButtonsTimed();
  }
  function revealRowNav(): void {
    if (!t.rowNavEl || mode() === "always") return;
    set(t.rowNavEl, null);
    if (rowTimer) clearTimeout(rowTimer);
    rowTimer = setTimeout(() => set(t.rowNavEl, restNav()), uiHideDelay());
    if (mode() === "default") revealButtonsTimed();
  }

  // ── button group, "default" mode: timed auto-hide on inactivity ───────────
  function revealButtonsTimed(): void {
    for (const el of buttons) set(el, null);
    if (buttonTimer) clearTimeout(buttonTimer);
    buttonTimer = setTimeout(() => {
      for (const el of buttons) set(el, HIDDEN);
    }, uiHideDelay());
  }

  // ── button group, "autohide" mode: proximity reveal ───────────────────────
  function clearProx(el: HTMLElement): void {
    const tm = proxTimers.get(el);
    if (tm) {
      clearTimeout(tm);
      proxTimers.delete(el);
    }
  }
  function showProx(el: HTMLElement): void {
    clearProx(el);
    set(el, null);
  }
  function hideProxSoon(el: HTMLElement): void {
    if (el.classList.contains(HIDDEN) || proxTimers.has(el)) return;
    proxTimers.set(
      el,
      setTimeout(() => {
        proxTimers.delete(el);
        set(el, HIDDEN);
      }, PROXIMITY_HIDE_MS),
    );
  }
  function cursorNear(el: HTMLElement, x: number, y: number): boolean {
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return false; // display:none (hidden close / 1:1 fill)
    return (
      x >= r.left - PROXIMITY_PAD &&
      x <= r.right + PROXIMITY_PAD &&
      y >= r.top - PROXIMITY_PAD &&
      y <= r.bottom + PROXIMITY_PAD
    );
  }
  function evalProximity(x: number, y: number): void {
    for (const el of buttons) {
      if (cursorNear(el, x, y)) showProx(el);
      else hideProxSoon(el);
    }
  }

  function syncFillCanvasVisibility(): void {
    // Meaningless at 1:1 (each image is native) — hide entirely there; otherwise
    // it rides along with the toolbar's auto-hide.
    t.fillCanvasBtnEl.classList.toggle(FORCE_HIDDEN, zoomMode === "1:1");
  }

  const onMove = (e: MouseEvent): void => {
    const m = mode();
    if (m === "always") return;
    // A mouse move surfaces both the titles and the row nav (+ buttons in
    // "default"); in "autohide" the buttons are instead gated by proximity.
    revealColumnNav();
    revealRowNav();
    if (m === "autohide") evalProximity(e.clientX, e.clientY);
  };
  const onScroll = (): void => revealRowNav();
  t.compDiv.addEventListener("mousemove", onMove);
  t.compDiv.addEventListener("scroll", onScroll, { passive: true });

  // Hover-pin the buttons: resting the cursor on one fires no compDiv mousemove
  // (they're sibling nodes), so keep it up while hovered.
  const hoverCleanups: (() => void)[] = [];
  for (const el of buttons) {
    const enter = (): void => {
      const m = mode();
      if (m === "always") return;
      if (m === "default") {
        for (const b of buttons) set(b, null);
        if (buttonTimer) clearTimeout(buttonTimer);
      } else {
        showProx(el);
      }
    };
    const leave = (): void => {
      const m = mode();
      if (m === "always") return;
      if (m === "default") revealButtonsTimed();
      else hideProxSoon(el);
    };
    el.addEventListener("mouseenter", enter);
    el.addEventListener("mouseleave", leave);
    hoverCleanups.push(() => {
      el.removeEventListener("mouseenter", enter);
      el.removeEventListener("mouseleave", leave);
    });
  }

  function clearAllTimers(): void {
    if (titleTimer) {
      clearTimeout(titleTimer);
      titleTimer = null;
    }
    if (rowTimer) {
      clearTimeout(rowTimer);
      rowTimer = null;
    }
    if (buttonTimer) {
      clearTimeout(buttonTimer);
      buttonTimer = null;
    }
    for (const el of buttons) clearProx(el);
  }

  function resync(): void {
    clearAllTimers();
    syncFillCanvasVisibility();
    set(t.labelEl, restNav());
    set(t.rowNavEl, restNav());
    if (mode() === "default") {
      // Buttons behave "as now": surfaced on open (discoverable), then they
      // auto-hide once activity stops.
      revealButtonsTimed();
    } else {
      // "always" → full; "autohide" → hidden until the cursor comes near.
      for (const el of buttons) set(el, restButton());
    }
  }

  resync();

  function cleanup(): void {
    clearAllTimers();
    t.compDiv.removeEventListener("mousemove", onMove);
    t.compDiv.removeEventListener("scroll", onScroll);
    for (const fn of hoverCleanups) fn();
  }

  return { revealColumnNav, revealRowNav, syncFillCanvasVisibility, resync, cleanup };
}
