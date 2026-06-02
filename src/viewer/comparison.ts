// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Comparison builder — orchestrator                                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS } from "../ui/css";
import { getShadowRoot } from "../ui/shadow";
import { injectFilters } from "../filters/svg";
import { showToast } from "../ui/toast";
import { updateHUD } from "../ui/hud";
import {
  defaultZoomMode as cfgZoomMode,
  fillCanvasDefault, navMapDefault, bgLoadDefault, lazyLoadMargin,
  mouseSwitch as cfgMouseSwitch,
} from "../config";
import {
  zoomMode, zoomWidth, setZoomMode, setZoomWidth,
  applyZoom, calcZoom, snapZoom, captureZoomAnchor, zoomToast, navMapEnabled,
  doZoom1to1, refit1to1,
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
import { normalizeGridInitialPosition, normalizeGridInitialZoom } from "./initial-state";
import { createCloseBtn } from "./close-btn";
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
  if (closest !== comp.currentRow) {
    comp.currentRow = closest;
    updateRowNav(closest);
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
  labelEl.style.opacity = "0";

  const compDiv = document.createElement("div") as HTMLDivElement;
  compDiv.className = "_scf_comp";
  const wheelZoomGesture: WheelZoomGestureState = { anchor: null, resetTimer: null };

  const { drag, onDragMove, onDragEnd } = setupDragHandlers(compDiv);

  // Ctrl+Wheel zoom (centered on cursor)
  compDiv.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const oldW = zoomMode === "fit" ? window.innerWidth : zoomWidth;
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

  function pointerColumnForEvent(e: MouseEvent): number {
    return pointerVisibleColumn(e.clientX, window.innerWidth, comp.visibleCols);
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
        } else {
          rowDiv.classList.remove("_scf_loading");
        }
      }
      rowDiv.dataset.col = String(col);
    }
    const names = grid.names || [];
    labelEl!.replaceChildren();
    for (let i = 0; i < comp.visibleCols.length; i++) {
      const visibleCol = comp.visibleCols[i];
      const n = names[visibleCol] ?? "Source " + (visibleCol + 1);
      const label = (i + 1) + ". " + n;
      const part = document.createElement("span");
      part.textContent = label;
      if (visibleCol !== col) part.style.opacity = ".4";
      labelEl!.appendChild(part);
      if (i < comp.visibleCols.length - 1) {
        labelEl!.appendChild(document.createTextNode("\u00a0 "));
      }
    }
    labelEl!.style.opacity = "1";
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

  function triggerBgLoad() {
    if (!bgLoadAll) return;
    for (let i = 0; i < allRowData.length; i++) {
      const rd = allRowData[i];
      if (!rd.loaded) rowObserver.unobserve(rd.rowDiv);
      // fillRow handles both "row not yet IO-loaded" and "row loaded but
      // only the active column was promoted" — it idempotently promotes
      // every remaining `dataset.src` → `src`.
      fillRow(rd, comp);
    }
  }

  const row0Sizer = allRowData[0].sizer;
  if (row0Sizer.complete) {
    setTimeout(triggerBgLoad, 200);
  } else {
    row0Sizer.addEventListener("load", () => setTimeout(triggerBgLoad, 200), { once: true });
    setTimeout(triggerBgLoad, 3000);
  }

  compDiv.addEventListener("mouseleave", () => {
    labelEl!.style.opacity = "0";
  });

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

  // Thumbnail navigation minimap
  const navMap = createNavMap(compDiv, allRowData, comp);
  comp.updateNavMap = navMap.updateNavMap;

  // Bottom-left toolbar (hosts source menu + fill canvas toggle)
  const toolbar = createToolbar();

  // Fill canvas toggle button (added first → appears above source menu)
  const fillCanvasBtn = createFillCanvasBtn(toolbar);
  comp.updateFillCanvasBtn = fillCanvasBtn.updateFillCanvasBtn;

  // Source visibility menu (added last → appears at bottom)
  const sourceMenu = createSourceMenu(comp, toolbar);
  comp.updateSourceMenu = sourceMenu.updateSourceMenu;

  // Close button (top-left on Mac, top-right on Windows)
  const closeBtn = createCloseBtn(() => comp.close());
  comp.updateCloseBtn = closeBtn.updatePosition;

  if (initialPosition.col !== 0) switchColumn(initialPosition.col);

  comp.setRow = (rowIdx: number) => {
    if (rowIdx < 0 || rowIdx >= comp.numRows) return;
    comp.currentRow = rowIdx;
    allRowData[rowIdx].rowDiv.scrollIntoView({ behavior: "smooth", block: "center" });
    rowNav.updateRowNav(rowIdx);
    showToast("Row " + (rowIdx + 1) + " / " + comp.numRows);
  };

  // Sync row indicator + nav map on manual scroll
  compDiv.addEventListener("scroll", () => {
    if (rowNav.rowNavEl) {
      syncCurrentRowFromScroll(comp, rowNav.updateRowNav);
    }
    navMap.updateNavMap();
  });

  const onResize = () => comp.updateScrollSpacers?.();
  let spacerResizeObserver: ResizeObserver | null = null;
  if (typeof ResizeObserver !== "undefined") {
    spacerResizeObserver = new ResizeObserver(onResize);
    spacerResizeObserver.observe(compDiv);
    if (allRowData[0]) spacerResizeObserver.observe(allRowData[0].rowDiv);
    if (allRowData[allRowData.length - 1]) {
      spacerResizeObserver.observe(allRowData[allRowData.length - 1].rowDiv);
    }
  }
  window.addEventListener("resize", onResize);

  function closeThis() {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
    window.removeEventListener("resize", onResize);
    if (spacerResizeObserver) spacerResizeObserver.disconnect();

    rowObserver.disconnect();
    resetWheelZoomGesture(wheelZoomGesture);
    compDiv.remove();
    rowNav.cleanup();
    navMap.cleanup();
    sourceMenu.cleanup();
    fillCanvasBtn.cleanup();
    closeBtn.cleanup();
    toolbar.cleanup();
    document.body.style.overflow = "";
    container.style.display = origContainerDisplay;
    btn.style.display = origBtnDisplay;

    labelEl!.style.opacity = "0";
    labelEl!.innerHTML = "";

    setZoomMode("fit");
    setZoomWidth(0);

    removeComp(comp);
  }

  comp.close = closeThis;

  container.style.display = "none";
  btn.style.display = "none";
  document.body.style.overflow = "hidden";
  shadowRoot.appendChild(compDiv);
  comp.updateScrollSpacers();

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
  if (initialPosition.row !== 0) {
    requestAnimationFrame(() => {
      const row = allRowData[initialPosition.row];
      if (!row) return;
      row.rowDiv.scrollIntoView({ behavior: "auto", block: "center" });
      comp.updateNavMap();
    });
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
