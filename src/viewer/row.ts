// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Row building & lazy loading                                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { resolveFilter, buildFilter } from "../filters/imaging";
import type { DragState } from "./drag";
import type { RowData, Comp } from "./types";

export function buildRow(
  rowCells: { full: string }[],
  numCols: number,
  drag: DragState,
  switchColumn: (col: number) => void,
  deferred: boolean,
): RowData {
  const rowDiv = document.createElement("div");
  rowDiv.className = "_scf_comp_row _scf_loading";
  rowDiv.dataset.col = "0";

  const sizer = document.createElement("img");
  sizer.className = "_scf_comp_sizer";
  if (deferred) {
    sizer.dataset.src = rowCells[0].full;
    rowDiv.style.aspectRatio = "16 / 9";
  } else {
    sizer.src = rowCells[0].full;
    sizer.addEventListener("load", () => rowDiv.classList.remove("_scf_loading"), { once: true });
  }
  rowDiv.appendChild(sizer);

  let maxAR = 0;
  const adjustRowAR = (img: HTMLImageElement) => {
    if (!img.naturalWidth || !img.naturalHeight) return;
    const ar = img.naturalHeight / img.naturalWidth;
    if (ar > maxAR) {
      maxAR = ar;
      rowDiv.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
    }
  };

  const imgs: HTMLImageElement[] = [];
  for (let ci = 0; ci < numCols; ci++) {
    const cell = document.createElement("div");
    cell.className = "_scf_comp_cell";
    const img = document.createElement("img");
    img.className = "_scf_comp_img";
    const src = rowCells[ci].full;
    if (!deferred && ci <= 1) {
      img.src = src;
    } else {
      img.dataset.src = src;
    }
    img.style.visibility = ci === 0 ? "visible" : "hidden";
    if (img.src) {
      resolveFilter(img.src).then((f) => {
        img.style.filter = buildFilter(f);
      });
      img.addEventListener("load", () => adjustRowAR(img), { once: true });
    }
    cell.appendChild(img);
    rowDiv.appendChild(cell);
    imgs.push(img);
  }

  rowDiv.addEventListener("mousemove", (e) => {
    if (drag.active) return;
    const relX = Math.max(0, Math.min(0.9999, e.clientX / window.innerWidth));
    const newCol = Math.floor(relX * numCols);
    const prevCol = parseInt(rowDiv.dataset.col!, 10);
    if (newCol !== prevCol) {
      switchColumn(newCol);
    }
  });

  return { rowDiv, sizer, imgs, adjustRowAR };
}

export function loadRow(rd: RowData, comp: Comp): void {
  if (rd.loaded) return;
  rd.loaded = true;
  const { sizer, rowDiv, imgs, adjustRowAR } = rd;
  if (sizer.dataset.src) {
    sizer.src = sizer.dataset.src;
    delete sizer.dataset.src;
    sizer.addEventListener("load", () => rowDiv.classList.remove("_scf_loading"), { once: true });
  }
  const activeCol = comp.currentCol || 0;
  const loadImg = (img: HTMLImageElement) => {
    if (!img.dataset.src) return;
    img.src = img.dataset.src;
    delete img.dataset.src;
    resolveFilter(img.src).then((f) => { img.style.filter = buildFilter(f); });
    img.addEventListener("load", () => adjustRowAR(img), { once: true });
  };
  if (imgs[activeCol]) loadImg(imgs[activeCol]);
  imgs.forEach((img, ci) => {
    if (ci !== activeCol) loadImg(img);
  });
}
