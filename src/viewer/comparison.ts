// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Comparison builder — orchestrator                                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS } from "../ui/css";
import { injectFilters } from "../filters/svg";
import { resolveFilter, buildFilter } from "../filters/imaging";
import { showToast } from "../ui/toast";
import { updateHUD } from "../ui/hud";
import {
  zoomMode, zoomWidth, setZoomMode, setZoomWidth,
  applyZoom, calcZoom, zoomToast, navMapEnabled,
  activeComps, addComp, removeComp,
} from "../filters/zoom";
import { setupDragHandlers, pointerColumn } from "./drag";
import { buildRow, loadRow } from "./row";
import { createNavMap } from "./nav-map";
import { createRowNav } from "./row-nav";
import type { Grid } from "../grid/types";
import type { RowData, Comp } from "./types";

export function buildComparison(grid: Grid, container: HTMLElement, btn: HTMLElement): void {
  injectCSS();
  injectFilters();

  setZoomMode("fit");
  setZoomWidth(0);

  let labelEl = document.getElementById("_scf_comp_label_");
  if (!labelEl) {
    labelEl = document.createElement("div");
    labelEl.id = "_scf_comp_label_";
    labelEl.className = "_scf_comp_label";
    document.body.appendChild(labelEl);
  }
  labelEl.innerHTML = "";
  labelEl.style.opacity = "0";

  const compDiv = document.createElement("div") as HTMLDivElement;
  compDiv.className = "_scf_comp";

  const { drag, onDragMove, onDragEnd } = setupDragHandlers(compDiv);

  // Ctrl+Wheel zoom (centered on cursor)
  compDiv.addEventListener("wheel", (e) => {
    if (!e.ctrlKey) return;
    e.preventDefault();
    const oldW = zoomMode === "fit" ? window.innerWidth : zoomWidth;
    const rect = compDiv.getBoundingClientRect();
    const cx = compDiv.scrollLeft + (e.clientX - rect.left);
    const cy = compDiv.scrollTop + (e.clientY - rect.top);
    setZoomWidth(calcZoom(oldW, e.deltaY < 0 ? 1 : -1));
    setZoomMode("custom");
    const scale = zoomWidth / oldW;
    applyZoom();
    compDiv.scrollLeft = cx * scale - (e.clientX - rect.left);
    compDiv.scrollTop = cy * scale - (e.clientY - rect.top);
    showToast(zoomToast());
  }, { passive: false });

  const allRowData: RowData[] = [];

  let bgLoadAll = false;

  // Forward-declare comp so loadRow/switchColumn can reference it
  const comp = {} as Comp;

  function switchColumn(col: number) {
    comp.currentCol = col;
    for (const { rowDiv: rd, imgs: ri, adjustRowAR: adjAR } of allRowData) {
      ri.forEach((img, i) => {
        if (i === col && !img.src && img.dataset.src) {
          img.src = img.dataset.src;
          delete img.dataset.src;
          resolveFilter(img.src).then((f) => {
            img.style.filter = buildFilter(f);
          });
          img.addEventListener("load", () => adjAR(img), { once: true });
        }
        img.style.visibility = i === col ? "visible" : "hidden";
      });
      const activeImg = ri[col];
      if (activeImg && activeImg.src && !activeImg.complete) {
        rd.classList.add("_scf_loading");
        activeImg.addEventListener("load", () => rd.classList.remove("_scf_loading"), { once: true });
      } else {
        rd.classList.remove("_scf_loading");
      }
      rd.dataset.col = String(col);
    }
    const names = grid.names || [];
    const parts: string[] = [];
    for (let i = 0; i < grid.numCols; i++) {
      const n = names[i] ?? "Source " + (i + 1);
      const label = (i + 1) + ". " + n;
      parts.push(i === col
        ? label
        : '<span style="opacity:.4">' + label + "</span>");
    }
    labelEl!.innerHTML = parts.join("&nbsp; ");
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
    updateHUD();
  }

  for (let ri = 0; ri < grid.rows.length; ri++) {
    const rowData = buildRow(grid.rows[ri], grid.numCols, drag, switchColumn, ri > 0);
    if (ri === 0) rowData.loaded = true;
    compDiv.appendChild(rowData.rowDiv);
    allRowData.push(rowData);
  }

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
  }, { root: compDiv, rootMargin: "200px", threshold: 0 });

  for (let i = 1; i < allRowData.length; i++) {
    rowObserver.observe(allRowData[i].rowDiv);
  }

  function triggerBgLoad() {
    if (!bgLoadAll) return;
    for (let i = 1; i < allRowData.length; i++) {
      if (!allRowData[i].loaded) {
        loadRow(allRowData[i], comp);
        rowObserver.unobserve(allRowData[i].rowDiv);
      }
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
  comp.link = btn;
  comp.numCols = grid.numCols;
  comp.numRows = allRowData.length;
  comp.currentRow = 0;
  comp.currentCol = 0;
  comp.colBrightness = new Array(grid.numCols).fill(1.0);
  comp.colContrast = new Array(grid.numCols).fill(1.0);
  comp.allRowData = allRowData;
  comp.bgLoadAll = () => bgLoadAll;
  comp.setBgLoadAll = (v: boolean) => { bgLoadAll = v; };
  comp.triggerBgLoad = triggerBgLoad;

  compDiv.addEventListener("mousemove", (e) => {
    if (drag.active) return;
    const newCol = pointerColumn(e, grid.numCols);
    if (newCol !== comp.currentCol) switchColumn(newCol);
  });

  comp.setColumn = (col: number) => {
    if (col < 0 || col >= grid.numCols) return;
    switchColumn(col);
    comp.currentCol = col;
  };

  // Row navigation sidebar
  const rowNav = createRowNav(allRowData, comp);

  // Thumbnail navigation minimap
  const navMap = createNavMap(compDiv, allRowData, comp);
  comp.navMapEl = navMap.navMapEl as HTMLDivElement;
  comp.updateNavMap = navMap.updateNavMap;

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
      const mid = compDiv.scrollTop + compDiv.clientHeight / 2;
      let closest = 0;
      let closestDist = Infinity;
      for (let i = 0; i < allRowData.length; i++) {
        const rowMid = allRowData[i].rowDiv.offsetTop + allRowData[i].rowDiv.offsetHeight / 2;
        const dist = Math.abs(rowMid - mid);
        if (dist < closestDist) {
          closestDist = dist;
          closest = i;
        }
      }
      if (closest !== comp.currentRow) {
        comp.currentRow = closest;
        rowNav.updateRowNav(closest);
      }
    }
    navMap.updateNavMap();
  });

  function closeThis() {
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);

    rowObserver.disconnect();
    compDiv.remove();
    rowNav.cleanup();
    navMap.cleanup();
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
  document.body.appendChild(compDiv);

  addComp(comp);
}

/** Insert a link node after refNode, skipping past any trailing BR */
export function insertLinkAfter(refNode: Node, link: HTMLElement): void {
  const next = refNode.nextSibling;
  if (next && next.nodeName === "BR") {
    next.parentNode!.insertBefore(link, next.nextSibling);
    next.parentNode!.insertBefore(
      document.createElement("br"),
      link.nextSibling,
    );
  } else {
    refNode.parentNode!.insertBefore(link, refNode.nextSibling);
  }
}

export function openWithDummyWrapper(grid: Grid, extraCleanup?: () => void): void {
  injectCSS();
  injectFilters();

  const wrapper = document.createElement("div");
  wrapper.style.display = "none";
  document.body.appendChild(wrapper);

  const dummyBtn = document.createElement("span");
  dummyBtn.style.display = "none";
  document.body.appendChild(dummyBtn);

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
