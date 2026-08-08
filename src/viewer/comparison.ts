// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Comparison builder — orchestrator                                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS } from "../ui/css";
import { getShadowRoot } from "../ui/shadow";
import { injectFilters } from "../filters/svg";
import { showToast, hideToast } from "../ui/toast";
import { updateHUD } from "../ui/hud";
import {
  defaultZoomMode as cfgZoomMode,
  fillCanvasDefault, navMapDefault, bgLoadDefault, lazyLoadMargin,
  mouseSwitch as cfgMouseSwitch, sourceTitleLayout as cfgSourceTitleLayout,
} from "../config";
import {
  setZoomMode, setZoomWidth,
  applyZoom, calcZoom, snapZoom, captureZoomAnchor, zoomToast,
  doZoom1to1, refit1to1, centerOnActiveCell, zoomStepBaseWidth,
  fillCanvasEnabled, applyFillCanvas, setFillCanvas, setNavMap,
  activeComps, addComp, removeComp,
  type CapturedZoomAnchor,
} from "../filters/zoom";
import { setupDragHandlers } from "./drag";
import { buildRow, fillRow, loadRow, loadRowColumn } from "./row";
import { createNavMap } from "./nav-map";
import { createRowNav } from "./row-nav";
import { createSourceMenu } from "./source-menu";
import { createFillCanvasBtn } from "./fill-canvas-btn";
import { createToolbar } from "./toolbar";
import { toggleHelpOverlay, hideHelpOverlay } from "./help-overlay";
import { normalizeGridInitialPosition, normalizeGridInitialZoom } from "./initial-state";
import { createCloseBtn } from "./close-btn";
import { createAutoHide } from "./auto-hide";
import { setupCompMouseShortcuts } from "../keyboard";
import {
  createDefaultVisibleColumns,
  pointerVisibleColumn,
  setColumnVisibility,
} from "./source-visibility";
import type { Grid } from "../grid/types";
import type { RowData, Comp } from "./types";

const WHEEL_ZOOM_GESTURE_MS = 200;

export interface WheelZoomGestureState {
  anchor: CapturedZoomAnchor | null;
  resetTimer: ReturnType<typeof setTimeout> | null;
}

export function resetWheelZoomGesture(state: WheelZoomGestureState): void {
  if (state.resetTimer) clearTimeout(state.resetTimer);
  state.anchor = null;
  state.resetTimer = null;
}

export function getWheelZoomGestureAnchor(
  state: WheelZoomGestureState,
  comp: Comp,
  point: { clientX: number; clientY: number },
): CapturedZoomAnchor | null {
  if (!state.anchor) state.anchor = captureZoomAnchor(comp, point);
  if (state.resetTimer) clearTimeout(state.resetTimer);
  state.resetTimer = setTimeout(() => {
    state.anchor = null;
    state.resetTimer = null;
  }, WHEEL_ZOOM_GESTURE_MS);
  return state.anchor;
}

export function syncCurrentRowFromScroll(
  comp: Comp,
  updateRowNav: (idx: number) => void,
): void {
  if (comp.suppressRowSync) return;

  const mid = comp.compDiv.scrollTop + comp.compDiv.clientHeight / 2;
  let closest = 0;
  let closestDist = Infinity;
  for (let i = 0; i < comp.allRowData.length; i++) {
    const row = comp.allRowData[i].rowDiv;
    const rowMid = row.offsetTop + row.offsetHeight / 2;
    const dist = Math.abs(rowMid - mid);
    if (dist < closestDist) {
      closestDist = dist;
      closest = i;
    }
  }
  if (comp.navTargetRow != null) {
    // A deliberate navigation is in flight: ignore mid-scroll geometry until
    // the target row wins the closest-row race, then resume normal syncing.
    if (closest !== comp.navTargetRow) return;
    comp.navTargetRow = null;
  }
  if (closest !== comp.currentRow) {
    comp.currentRow = closest;
    updateRowNav(closest);
    comp.updateLabel?.();
  }
}

export function calcScrollSpacerHeights(
  viewportHeight: number,
  firstRowHeight: number,
  lastRowHeight: number,
): { top: number; bottom: number } {
  const halfViewport = viewportHeight / 2;
  return {
    top: Math.max(0, halfViewport - firstRowHeight / 2),
    bottom: Math.max(0, halfViewport - lastRowHeight / 2),
  };
}

export function buildComparison(grid: Grid, container: HTMLElement, btn: HTMLElement): void {
  injectCSS();
  injectFilters();

  if (!activeComps.length) {
    setFillCanvas(fillCanvasDefault());
    setNavMap(navMapDefault());
  }
  setZoomMode("fit");
  setZoomWidth(0);
  const initialPosition = normalizeGridInitialPosition(grid);
  const initialZoom = normalizeGridInitialZoom(grid.initialZoom);
  if (initialZoom.mode === "custom") {
    setZoomMode("custom");
    setZoomWidth(initialZoom.width);
  }

  const shadowRoot = getShadowRoot();
  let labelEl = shadowRoot.getElementById("_scf_comp_label_");
  if (!labelEl) {
    labelEl = document.createElement("div");
    labelEl.id = "_scf_comp_label_";
    labelEl.className = "_scf_comp_label";
    shadowRoot.appendChild(labelEl);
  }
  labelEl.innerHTML = "";
  // Visibility is owned by the auto-hide controller (created below); the label
  // starts hidden until the first reveal.
  labelEl.classList.add("_scf_ui_autohidden");

  const compDiv = document.createElement("div") as HTMLDivElement;
  compDiv.className = "_scf_comp";
  const wheelZoomGesture: WheelZoomGestureState = { anchor: null, resetTimer: null };

  const { drag, onDragMove, onDragEnd } = setupDragHandlers(compDiv);
  // Grabbing the canvas (drag pan or scrollbar) is a manual scroll gesture too.
  compDiv.addEventListener("mousedown", () => {
    comp.navTargetRow = null;
  });
  // Canvas mouse-gesture shortcuts (e.g. click / double-click to close).
  setupCompMouseShortcuts(compDiv, drag);

  // Ctrl+Wheel zoom (centered on cursor)
  compDiv.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) {
      // A plain wheel is a manual scroll: it takes over from any in-flight
      // deliberate row navigation.
      comp.navTargetRow = null;
      return;
    }
    e.preventDefault();
    const oldW = zoomStepBaseWidth();
    const anchor = getWheelZoomGestureAnchor(wheelZoomGesture, comp, e);
    setZoomWidth(snapZoom(oldW, calcZoom(oldW, e.deltaY < 0 ? 1 : -1)));
    setZoomMode("custom");
    applyZoom(anchor ? [anchor] : []);
    showToast(zoomToast());
  }, { passive: false });

  const allRowData: RowData[] = [];

  let bgLoadAll = bgLoadDefault();

  // Forward-declare comp so loadRow/switchColumn can reference it
  const comp = {} as Comp;
  comp.visibleCols = createDefaultVisibleColumns(grid.numCols);
  const topSpacer = document.createElement("div");
  topSpacer.className = "_scf_scroll_spacer";
  const bottomSpacer = document.createElement("div");
  bottomSpacer.className = "_scf_scroll_spacer";
  compDiv.appendChild(topSpacer);

  /** The scroll container's content box ends before a classic scrollbar.
   * `clientWidth` is in CSS pixels, so it already reflects the browser's
   * scrollbar width at the current DPI and zoom level. */
  function comparisonViewportWidth(): number {
    return Math.max(1, compDiv.clientWidth || document.documentElement.clientWidth || window.innerWidth);
  }

  function pointerColumnForEvent(e: MouseEvent): number {
    return pointerVisibleColumn(
      e.clientX - compDiv.getBoundingClientRect().left,
      comparisonViewportWidth(),
      comp.visibleCols,
    );
  }

  // The source-title banner. With per-row names (grid.rowNames — slow.pics)
  // the current row's names win; every other grid renders grid.names exactly
  // as before. Rebuilt on column switches, and on row changes when (and only
  // when) per-row names exist.
  let lastLabelText: string | null = null;
  let labelViewportWidth = 0;

  function wrappedLineInfo(el: HTMLElement): { lines: number; charsInLastLine: number } {
    const textNode = el.firstChild;
    const text = textNode?.textContent || "";
    if (!textNode || textNode.nodeType !== Node.TEXT_NODE || !text) {
      return { lines: 0, charsInLastLine: 0 };
    }

    const range = document.createRange();
    let lines = 0;
    let lastTop: number | null = null;
    let charsInLastLine = 0;
    for (let start = 0; start < text.length;) {
      const codePoint = text.codePointAt(start)!;
      const char = String.fromCodePoint(codePoint);
      const end = start + char.length;
      range.setStart(textNode, start);
      range.setEnd(textNode, end);
      const rect = range.getClientRects()[0];
      if (rect && rect.width) {
        if (lastTop === null || Math.abs(rect.top - lastTop) > 0.5) {
          lines++;
          lastTop = rect.top;
          charsInLastLine = 0;
        }
        if (!/\s/u.test(char)) charsInLastLine++;
      }
      start = end;
    }
    return { lines, charsInLastLine };
  }

  function unwrappedTextWidth(text: string): number {
    const measure = document.createElement("span");
    measure.textContent = text;
    measure.style.cssText = "position:fixed;visibility:hidden;white-space:nowrap;width:max-content;max-width:none";
    labelEl!.appendChild(measure);
    const width = measure.getBoundingClientRect().width;
    measure.remove();
    return width;
  }

  /** Avoid a one- or two-character orphaned second line without shrinking
   * genuinely long names that benefit from the column-layout wrap. */
  function compactNearOrphanedColumnLabels(): void {
    const items = [...labelEl!.querySelectorAll<HTMLElement>("._scf_comp_label_item")];
    for (const item of items) item.style.fontSize = "";

    for (const item of items) {
      const index = item.querySelector<HTMLElement>("._scf_comp_label_index");
      const name = item.querySelector<HTMLElement>("._scf_comp_label_name");
      if (!index || !name) continue;
      const { lines, charsInLastLine } = wrappedLineInfo(name);
      if (lines !== 2 || charsInLastLine > 2) continue;

      const style = getComputedStyle(item);
      const contentWidth = item.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight);
      const requiredWidth = index.getBoundingClientRect().width + unwrappedTextWidth(name.textContent || "");
      if (contentWidth <= 0 || requiredWidth <= contentWidth) continue;
      const baseFontSize = parseFloat(style.fontSize);
      item.style.fontSize = `${baseFontSize * Math.max(0, contentWidth - 0.5) / requiredWidth}px`;
    }
  }

  function buildLabel(col: number): void {
    const names = grid.rowNames?.[comp.currentRow] ?? grid.names ?? [];
    labelEl!.replaceChildren();
    labelEl!.classList.remove("_scf_comp_label_columns");
    labelEl!.style.gridTemplateColumns = "";
    const viewportWidth = comparisonViewportWidth();
    labelViewportWidth = viewportWidth;
    labelEl!.style.setProperty("--_scf_comp_viewport_width", `${viewportWidth}px`);
    // Column titles are a comparison affordance. A single-column grid is a
    // gallery viewer — plain images, no source-name banner.
    if (grid.numCols > 1) {
      for (let i = 0; i < comp.visibleCols.length; i++) {
        const visibleCol = comp.visibleCols[i];
        const n = names[visibleCol] ?? "Source " + (visibleCol + 1);
        const part = document.createElement("span");
        part.className = "_scf_comp_label_item";
        const index = document.createElement("span");
        index.className = "_scf_comp_label_index";
        index.textContent = (i + 1) + ". ";
        const name = document.createElement("span");
        name.className = "_scf_comp_label_name";
        name.textContent = n;
        part.append(index, name);
        if (visibleCol !== col) part.style.opacity = ".4";
        labelEl!.appendChild(part);
      }
    }
    if (cfgSourceTitleLayout() === "filled") {
      labelEl!.classList.add("_scf_comp_label_columns");
      labelEl!.style.gridTemplateColumns = `repeat(${comp.visibleCols.length}, minmax(0, 1fr))`;
      compactNearOrphanedColumnLabels();
    }
    // Row navigation can change the names themselves — surface the banner so
    // the change is visible even in auto-hidden chrome. (Column switches only
    // move the active-entry highlight; their reveal stays in switchColumn.)
    const text = labelEl!.textContent || "";
    if (lastLabelText !== null && text !== lastLabelText) comp.revealColumnNav?.();
    lastLabelText = text;
  }

  function switchColumn(col: number) {
    if (!comp.visibleCols.includes(col)) return;
    comp.currentCol = col;
    for (const rowData of allRowData) {
      const { rowDiv, imgs, loaded } = rowData;
      // Only promote a deferred src → src in rows the IO has already
      // loaded. Unloaded rows keep their `dataset.src` and pick up the
      // new active column when they're eventually scrolled into view
      // (loadRow reads `comp.currentCol` at IO-fire time). Without this
      // gate, switchColumn would mass-load `col` across every row in
      // the grid, defeating lazy load.
      if (loaded) {
        const img = imgs[col];
        if (img && !img.src && img.dataset.src) {
          loadRowColumn(rowData, comp, col);
        }
      }
      imgs.forEach((img, i) => {
        img.style.visibility = i === col ? "visible" : "hidden";
      });
      // Spinner state only makes sense for rows the user can actually
      // see right now. Unloaded rows still carry the initial
      // `_scf_loading` class from buildRow; loadRow will clear it when
      // the sizer lands.
      if (loaded) {
        const activeImg = imgs[col];
        if (activeImg && activeImg.src && !activeImg.complete) {
          rowDiv.classList.add("_scf_loading");
          activeImg.addEventListener("load", () => rowDiv.classList.remove("_scf_loading"), { once: true });
          // A dead column image never fires `load`; clear the spinner on error
          // too so switching to a 404 source doesn't leave it spinning.
          activeImg.addEventListener("error", () => rowDiv.classList.remove("_scf_loading"), { once: true });
        } else {
          rowDiv.classList.remove("_scf_loading");
        }
      }
      rowDiv.dataset.col = String(col);
    }
    buildLabel(col);
    comp.revealColumnNav?.();
    // Update nav map thumbnail for new column (only when zoomed)
    if (compDiv.classList.contains("_scf_zoomed")) {
      const rd = allRowData[comp.currentRow || 0];
      if (rd) {
        const img = rd.imgs[col];
        const src = img && (img.src || img.dataset.src);
        if (src && navMap.navMapImg && navMap.navMapImg.src !== src) navMap.navMapImg.src = src;
      }
    }
    comp.updateSourceMenu?.();
    updateHUD();
  }

  for (let ri = 0; ri < grid.rows.length; ri++) {
    // Reserve each row's TRUE aspect ratio from the page thumbnails (already
    // loaded in the grid). Without this a row falls back to a 16/9 placeholder
    // until its full image lands, then reflows — which shifts the centered cell
    // and recomputes the top/bottom spacers, so the viewer "jumps" on open.
    for (const cell of grid.rows[ri]) {
      if ((cell.width == null || cell.height == null) && cell.img?.naturalWidth && cell.img.naturalHeight) {
        cell.width = cell.img.naturalWidth;
        cell.height = cell.img.naturalHeight;
      }
    }
    const rowData = buildRow(
      grid.rows[ri],
      grid.numCols,
      drag,
      switchColumn,
      pointerColumnForEvent,
      ri > 0 && ri !== initialPosition.row,
    );
    if (ri === 0 || ri === initialPosition.row) rowData.loaded = true;
    compDiv.appendChild(rowData.rowDiv);
    allRowData.push(rowData);
  }
  compDiv.appendChild(bottomSpacer);

  // IntersectionObserver: load deferred rows as they enter the viewport
  const rowObserver = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) {
        const rd = allRowData.find((r) => r.rowDiv === entry.target);
        if (rd) {
          loadRow(rd, comp);
          rowObserver.unobserve(entry.target);
        }
      }
    }
  }, { root: compDiv, rootMargin: lazyLoadMargin() + "px", threshold: 0 });

  for (let i = 1; i < allRowData.length; i++) {
    rowObserver.observe(allRowData[i].rowDiv);
  }

  let closed = false;

  function triggerBgLoad() {
    // The kickoff timers below can fire after an early close; a closed viewer
    // must not promote deferred cells into detached rows.
    if (closed || !bgLoadAll) return;
    for (let i = 0; i < allRowData.length; i++) {
      const rd = allRowData[i];
      if (!rd.loaded) rowObserver.unobserve(rd.rowDiv);
      // fillRow handles both "row not yet IO-loaded" and "row loaded but
      // only the active column was promoted" — it idempotently promotes
      // every remaining `dataset.src` → `src`.
      fillRow(rd, comp);
    }
  }

  const bgLoadTimers: ReturnType<typeof setTimeout>[] = [];
  const row0Sizer = allRowData[0].sizer;
  if (row0Sizer.complete) {
    bgLoadTimers.push(setTimeout(triggerBgLoad, 200));
  } else {
    row0Sizer.addEventListener(
      "load",
      () => bgLoadTimers.push(setTimeout(triggerBgLoad, 200)),
      { once: true },
    );
    bgLoadTimers.push(setTimeout(triggerBgLoad, 3000));
  }

  const origContainerDisplay = container.style.display;
  const origBtnDisplay = btn.style.display;

  // Populate comp
  comp.compDiv = compDiv;
  comp.container = container;
  comp.numCols = grid.numCols;
  comp.numRows = allRowData.length;
  comp.sourceNames = grid.names;
  comp.currentRow = initialPosition.row;
  comp.currentCol = initialPosition.col;
  comp.colBrightness = new Array(grid.numCols).fill(1.0);
  comp.colGammaCheck = new Array(grid.numCols).fill(null);
  comp.colContrast = new Array(grid.numCols).fill(1.0);
  comp.allRowData = allRowData;
  comp.bgLoadAll = () => bgLoadAll;
  comp.setBgLoadAll = (v: boolean) => { bgLoadAll = v; };
  comp.triggerBgLoad = triggerBgLoad;
  comp.updateScrollSpacers = () => {
    const first = allRowData[0]?.rowDiv;
    const last = allRowData[allRowData.length - 1]?.rowDiv;
    if (!first || !last) return;
    const spacers = calcScrollSpacerHeights(
      compDiv.clientHeight,
      first.offsetHeight,
      last.offsetHeight,
    );
    topSpacer.style.height = spacers.top + "px";
    bottomSpacer.style.height = spacers.bottom + "px";
  };
  comp.updateTitleLayout = () => buildLabel(comp.currentCol);

  compDiv.addEventListener("mousemove", (e) => {
    if (drag.active || !cfgMouseSwitch()) return;
    const newCol = pointerColumnForEvent(e);
    if (newCol !== comp.currentCol) switchColumn(newCol);
  });

  comp.setColumn = (col: number) => {
    if (col < 0 || col >= grid.numCols) return;
    if (!comp.visibleCols.includes(col)) return;
    switchColumn(col);
    // A DELIBERATE column move (keyboard / column-nav) re-fits 1:1 to this
    // column's native width; the mouse-sweep (raw switchColumn) does not, so
    // sweeping to compare stays at one stable scale instead of resizing.
    refit1to1();
  };

  comp.setSourceVisible = (col: number, visible: boolean) => {
    const prevVisible = comp.visibleCols;
    const nextVisible = setColumnVisibility(prevVisible, col, visible, grid.numCols);
    const changed = (
      nextVisible.length !== prevVisible.length ||
      nextVisible.some((c, i) => c !== prevVisible[i])
    );
    if (!changed) {
      if (!visible && prevVisible.length <= 1 && prevVisible.includes(col)) {
        showToast("At least one source must stay visible");
      }
      comp.updateSourceMenu?.();
      return;
    }

    const prevIndex = Math.max(0, prevVisible.indexOf(col));
    comp.visibleCols = nextVisible;
    if (!nextVisible.includes(comp.currentCol)) {
      switchColumn(nextVisible[Math.min(prevIndex, nextVisible.length - 1)]);
    } else {
      switchColumn(comp.currentCol);
    }
    showToast("Sources: " + nextVisible.length + " / " + grid.numCols);
  };

  // Row navigation sidebar
  const rowNav = createRowNav(allRowData, comp);
  comp.updateRowNav = rowNav.updateRowNav;

  // Row changes re-render the banner ONLY for grids with per-row names
  // (slow.pics). Left unset otherwise, so every other site's row navigation
  // stays a label no-op exactly as before.
  if (grid.rowNames) {
    comp.updateLabel = () => buildLabel(comp.currentCol);
  }

  // Thumbnail navigation minimap
  const navMap = createNavMap(compDiv, allRowData, comp);
  comp.updateNavMap = navMap.updateNavMap;

  // Bottom-left toolbar (hosts source menu + fill canvas toggle)
  const toolbar = createToolbar();

  // Shortcuts help button (added first → sits at the top) → toggles the legend.
  const helpBtnEl = document.createElement("div");
  helpBtnEl.className = "_scf_help_btn";
  const helpButton = document.createElement("button");
  helpButton.type = "button";
  helpButton.className = "_scf_help_button";
  helpButton.title = "Keyboard shortcuts (?)";
  helpButton.setAttribute("aria-label", "Keyboard shortcuts");
  helpButton.textContent = "?";
  helpButton.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleHelpOverlay();
  });
  helpBtnEl.appendChild(helpButton);
  toolbar.toolbarEl.appendChild(helpBtnEl);

  // Fill canvas toggle button (added next → appears below help)
  const fillCanvasBtn = createFillCanvasBtn(toolbar);
  comp.updateFillCanvasBtn = fillCanvasBtn.updateFillCanvasBtn;

  // Source visibility menu (added last → appears at bottom)
  const sourceMenu = createSourceMenu(comp, toolbar);
  comp.updateSourceMenu = sourceMenu.updateSourceMenu;

  // Close button (top-left on Mac, top-right on Windows)
  const closeBtn = createCloseBtn(() => comp.close());
  comp.updateCloseBtn = closeBtn.updatePosition;

  // Auto-hide chrome controller (① auto-hide UI) — fades the label, row nav,
  // close button and toolbar after a spell of no activity; reveals on action.
  const autoHide = createAutoHide({
    compDiv,
    labelEl,
    rowNavEl: rowNav.rowNavEl,
    closeBtnEl: closeBtn.closeBtnEl,
    toolbarEl: toolbar.toolbarEl,
    fillCanvasBtnEl: fillCanvasBtn.fillCanvasBtnEl,
  });
  comp.revealColumnNav = autoHide.revealColumnNav;
  comp.revealRowNav = autoHide.revealRowNav;
  comp.syncFillCanvasVisibility = autoHide.syncFillCanvasVisibility;
  comp.syncAutoHide = autoHide.resync;

  // Populate the source-name label (and menu/HUD state) for the initial
  // column too — before this ran only for col != 0, so a viewer opened on the
  // default column showed an empty label until the first switch.
  switchColumn(initialPosition.col);

  comp.setRow = (rowIdx: number) => {
    if (rowIdx < 0 || rowIdx >= comp.numRows) return;
    comp.currentRow = rowIdx;
    comp.navTargetRow = rowIdx;
    comp.updateLabel?.();
    allRowData[rowIdx].rowDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    rowNav.updateRowNav(rowIdx);
    comp.revealRowNav?.();
    showToast("Row " + (rowIdx + 1) + " / " + comp.numRows);
  };

  // Sync row indicator + nav map on manual scroll
  compDiv.addEventListener("scroll", () => {
    if (rowNav.rowNavEl) {
      syncCurrentRowFromScroll(comp, rowNav.updateRowNav);
    }
    navMap.updateNavMap();
  });

  const onResize = () => {
    comp.updateScrollSpacers?.();
    if (comparisonViewportWidth() !== labelViewportWidth) buildLabel(comp.currentCol);
  };
  let spacerResizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    spacerResizeObserver = new ResizeObserver(onResize);
    spacerResizeObserver.observe(compDiv);
    if (allRowData[0]) spacerResizeObserver.observe(allRowData[0].rowDiv);
    if (allRowData[allRowData.length - 1]) {
      spacerResizeObserver.observe(allRowData[allRowData.length - 1].rowDiv);
    }
  }
  // On window resize the devicePixelRatio may have changed (monitor move /
  // browser zoom), so re-apply 1:1 at the new scale. Kept off the spacer
  // observer's handler to avoid a resize→refit→resize loop.
  const onWindowResize = () => {
    comp.updateScrollSpacers?.();
    buildLabel(comp.currentCol);
    refit1to1();
  };
  window.addEventListener("resize", onWindowResize);

  // The page scroll position at open — restored on close so dismissing the
  // viewer never moves the page (hiding the container would otherwise reflow it).
  const pageScrollX = window.scrollX;
  const pageScrollY = window.scrollY;
  // Re-centers the active cell as it measures; disconnected on settle/close.
  let openCenterRO: ResizeObserver | null = null;

  function closeThis() {
    closed = true;
    for (const timer of bgLoadTimers) clearTimeout(timer);
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    window.removeEventListener("resize", onWindowResize);
    if (spacerResizeObserver) spacerResizeObserver.disconnect();
    openCenterRO?.disconnect();

    rowObserver.disconnect();
    resetWheelZoomGesture(wheelZoomGesture);
    compDiv.remove();
    rowNav.cleanup();
    navMap.cleanup();
    sourceMenu.cleanup();
    fillCanvasBtn.cleanup();
    closeBtn.cleanup();
    toolbar.cleanup();
    autoHide.cleanup();
    hideHelpOverlay();
    document.body.style.overflow = "";
    container.style.display = origContainerDisplay;
    btn.style.display = origBtnDisplay;
    window.scrollTo(pageScrollX, pageScrollY);

    // Label persists in the shadow root (reused by id) — leave it hidden so it
    // doesn't flash on the next open until the first reveal.
    labelEl!.classList.add("_scf_ui_autohidden");
    labelEl!.innerHTML = "";

    setZoomMode("fit");
    setZoomWidth(0);

    removeComp(comp);
    // The HUD and toast are fixed overlays on the shared shadow root — clear
    // them so per-column readouts don't float over the host page. The HUD
    // re-renders from the remaining comps (or the page-level filter mode).
    hideToast();
    updateHUD();
  }

  comp.close = closeThis;

  container.style.display = "none";
  btn.style.display = "none";
  document.body.style.overflow = "hidden";
  shadowRoot.appendChild(compDiv);
  comp.updateScrollSpacers();
  // The initial label is built before the viewer attaches so it can render
  // immediately. Rebuild after attachment to pick up this container's actual
  // content width, including any reserved scrollbar gutter.
  buildLabel(comp.currentCol);

  addComp(comp);
  if (fillCanvasEnabled) applyFillCanvas();
  if (initialZoom.mode === "custom") {
    applyZoom();
  } else if (cfgZoomMode() === "1:1") {
    // 1:1 from the ACTIVE column's native width (doZoom1to1 waits for its image
    // to measure); silent so opening doesn't pop a zoom toast.
    doZoom1to1({ silent: true });
  }
  rowNav.updateRowNav(initialPosition.row);

  // Always open centered on the active cell — every entry path (Show
  // comparison, an HDBits/PTP image click, V), at any zoom, and for images both
  // smaller and larger than the viewport.
  const centerNow = (): void => {
    comp.updateScrollSpacers?.();
    centerOnActiveCell(comp);
    comp.updateNavMap();
  };
  requestAnimationFrame(centerNow);
  // The active image is usually unmeasured at open (lazy / still loading), so
  // the first center used placeholder geometry — which lands the cell off
  // (top-left, or "half this row half the next"). Re-center as the active row
  // resizes (image lands, 1:1 width applies) until it has settled, or until the
  // user takes over. A ResizeObserver is robust to the exact load timing.
  const activeRow = allRowData[initialPosition.row]?.rowDiv;
  if (activeRow && typeof ResizeObserver !== "undefined") {
    openCenterRO = new ResizeObserver(() => {
      requestAnimationFrame(centerNow);
      const img = allRowData[initialPosition.row]?.imgs[initialPosition.col];
      if (img?.complete && img.naturalWidth) openCenterRO?.disconnect();
    });
    openCenterRO.observe(activeRow);
    const stop = (): void => openCenterRO?.disconnect();
    compDiv.addEventListener("wheel", stop, { once: true, passive: true });
    compDiv.addEventListener("mousedown", stop, { once: true });
  }
}

/** Insert a link node after refNode, keeping repeated comparison links in order. */
export function insertLinkAfter(refNode: Node, link: HTMLElement): void {
  const isCompLink = (node: Node | null): boolean => {
    if (!node || node.nodeType !== 1) return false;
    const el = node as Element & { className?: string };
    return (
      el.classList?.contains("_scf_comp_link") ||
      /\b_scf_comp_link\b/.test(el.className || "")
    );
  };

  let insertionPoint = refNode.nextSibling;
  let needLeadingBreak = true;
  if (insertionPoint && insertionPoint.nodeName === "BR") {
    needLeadingBreak = false;
    insertionPoint = insertionPoint.nextSibling;
    while (insertionPoint && isCompLink(insertionPoint)) {
      insertionPoint = insertionPoint.nextSibling;
      if (insertionPoint && insertionPoint.nodeName === "BR") {
        insertionPoint = insertionPoint.nextSibling;
      }
    }
  }

  if (needLeadingBreak) {
    refNode.parentNode!.insertBefore(document.createElement("br"), insertionPoint);
  }
  refNode.parentNode!.insertBefore(link, insertionPoint);
  refNode.parentNode!.insertBefore(
    document.createElement("br"),
    link.nextSibling,
  );
}

export function openWithDummyWrapper(grid: Grid, extraCleanup?: () => void): void {
  injectCSS();
  injectFilters();

  const sr = getShadowRoot();
  const wrapper = document.createElement("div");
  wrapper.style.display = "none";
  sr.appendChild(wrapper);

  const dummyBtn = document.createElement("span");
  dummyBtn.style.display = "none";
  sr.appendChild(dummyBtn);

  buildComparison(grid, wrapper, dummyBtn);

  const comp = activeComps[activeComps.length - 1];
  const origClose = comp.close;
  comp.close = function () {
    origClose();
    wrapper.remove();
    dummyBtn.remove();
    if (extraCleanup) extraCleanup();
  };
}
