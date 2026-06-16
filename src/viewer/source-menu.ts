import type { Comp } from "./types";
import type { Toolbar } from "./toolbar";
import { sourceMenuCountText } from "./source-visibility";

export interface SourceMenu {
  updateSourceMenu: () => void;
  cleanup: () => void;
}

function sourceName(comp: Comp, col: number): string {
  const name = comp.sourceNames?.[col]?.trim();
  return name || "Source " + (col + 1);
}

export function createSourceMenu(comp: Comp, toolbar: Toolbar): SourceMenu {
  const slot = toolbar.addSlot(() => setOpen(false));

  const sourceMenuEl = document.createElement("div");
  sourceMenuEl.className = "_scf_source_menu";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "_scf_source_menu_btn";
  button.title = "Sources";
  button.setAttribute("aria-label", "Choose visible sources");
  button.setAttribute("aria-expanded", "false");

  const iconEl = document.createElement("span");
  iconEl.className = "_scf_source_menu_icon";
  iconEl.setAttribute("aria-hidden", "true");

  const countEl = document.createElement("span");
  countEl.className = "_scf_source_menu_count";
  button.append(iconEl, countEl);

  const panel = document.createElement("div");
  panel.className = "_scf_source_menu_panel";
  panel.hidden = true;

  sourceMenuEl.append(button, panel);
  toolbar.toolbarEl.appendChild(sourceMenuEl);
  let pointerOpening = false;

  function setOpen(open: boolean) {
    sourceMenuEl.classList.toggle("_scf_open", open);
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) slot.notifyOpen();
  }

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

  button.addEventListener("pointerdown", () => {
    pointerOpening = true;
  });
  button.addEventListener("click", () => {
    setOpen(panel.hidden);
    if (pointerOpening) button.blur();
    pointerOpening = false;
  });

  const closeOnOutsideClick = (e: MouseEvent) => {
    if (!toolbar.toolbarEl.contains(e.target as Node | null)) setOpen(false);
  };
  document.addEventListener("mousedown", closeOnOutsideClick);

  function cleanup() {
    document.removeEventListener("mousedown", closeOnOutsideClick);
  }

  updateSourceMenu();
  return { updateSourceMenu, cleanup };
}
