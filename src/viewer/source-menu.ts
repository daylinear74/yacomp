import type { Comp } from "./types";
import type { Toolbar } from "./toolbar";
import { sourceMenuCountText } from "./source-visibility";
import { createToolbarDropdown } from "./dropdown-control";

export interface SourceMenu {
  updateSourceMenu: () => void;
  cleanup: () => void;
}

function sourceName(comp: Comp, col: number): string {
  const name = comp.sourceNames?.[col]?.trim();
  return name || "Source " + (col + 1);
}

export function createSourceMenu(comp: Comp, toolbar: Toolbar): SourceMenu {
  const { button, panel, cleanup } = createToolbarDropdown(toolbar, {
    containerClass: "_scf_source_menu",
    buttonClass: "_scf_source_menu_btn",
    iconClass: "_scf_source_menu_icon",
    panelClass: "_scf_source_menu_panel",
    title: "Sources",
    ariaLabel: "Choose visible sources",
  });

  const countEl = document.createElement("span");
  countEl.className = "_scf_source_menu_count";
  button.append(countEl);

  function updateSourceMenu() {
    countEl.textContent = sourceMenuCountText(comp.visibleCols.length, comp.numCols);
    panel.replaceChildren();

    for (let col = 0; col < comp.numCols; col++) {
      const row = document.createElement("label");
      row.className = "_scf_source_option";
      row.classList.toggle("_scf_active", col === comp.currentCol);

      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = comp.visibleCols.includes(col);
      input.disabled = input.checked && comp.visibleCols.length <= 1;
      input.addEventListener("change", () => {
        comp.setSourceVisible(col, input.checked);
      });

      const idx = document.createElement("span");
      idx.className = "_scf_source_option_idx";
      idx.textContent = String(col + 1);

      const text = document.createElement("span");
      text.className = "_scf_source_option_name";
      text.textContent = sourceName(comp, col);

      row.append(input, idx, text);
      panel.appendChild(row);
    }
  }

  updateSourceMenu();
  return { updateSourceMenu, cleanup };
}
