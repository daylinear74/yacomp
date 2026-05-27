// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Row navigation sidebar                                                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { getShadowRoot } from "../ui/shadow";
import type { Comp, RowData } from "./types";

export interface RowNav {
  rowNavEl: HTMLDivElement | null;
  updateRowNav: (idx: number) => void;
  cleanup: () => void;
}

export function createRowNav(allRowData: RowData[], comp: Comp): RowNav {
  let rowNavEl: HTMLDivElement | null = null;

  if (allRowData.length > 1) {
    rowNavEl = document.createElement("div");
    rowNavEl.className = "_scf_row_nav";
    for (let i = 0; i < allRowData.length; i++) {
      const item = document.createElement("div");
      item.className = "_scf_row_nav_item" + (i === 0 ? " _scf_active" : "");
      item.textContent = String(i + 1);
      item.addEventListener("click", () => comp.setRow(i));
      rowNavEl.appendChild(item);
    }
    getShadowRoot().appendChild(rowNavEl);
  }

  function updateRowNav(idx: number) {
    if (!rowNavEl) return;
    const items = rowNavEl.children;
    for (let i = 0; i < items.length; i++) {
      items[i].classList.toggle("_scf_active", i === idx);
    }
    if (items[idx]) items[idx].scrollIntoView({ block: "nearest" });
  }

  function cleanup() {
    if (rowNavEl) rowNavEl.remove();
  }

  return { rowNavEl, updateRowNav, cleanup };
}
