import { fillCanvasEnabled, toggleFillCanvas, applyFillCanvas } from "../filters/zoom";
import { showToast } from "../ui/toast";
import type { Toolbar } from "./toolbar";
import { createToolbarDropdown } from "./dropdown-control";

export interface FillCanvasBtn {
  fillCanvasBtnEl: HTMLDivElement;
  updateFillCanvasBtn: () => void;
  cleanup: () => void;
}

export function createFillCanvasBtn(toolbar: Toolbar): FillCanvasBtn {
  const { container, button, panel, setOpen, cleanup } = createToolbarDropdown(toolbar, {
    containerClass: "_scf_fill_canvas_toggle",
    buttonClass: "_scf_fill_canvas_btn",
    iconClass: "_scf_fill_canvas_icon",
    panelClass: "_scf_fill_canvas_panel",
    title: "Canvas (C)",
    ariaLabel: "Choose canvas mode",
  });

  function setMode(cover: boolean) {
    const changed = fillCanvasEnabled !== cover;
    if (changed) {
      toggleFillCanvas();
      applyFillCanvas();
    }
    updateFillCanvasBtn();
    setOpen(false);
    if (changed) showToast(cover ? "Canvas: Fill" : "Canvas: Fit");
  }

  function updateFillCanvasBtn() {
    button.classList.toggle("_scf_active", fillCanvasEnabled);
    panel.replaceChildren();

    const options: { label: string; cover: boolean }[] = [
      { label: "Fill", cover: true },
      { label: "Fit", cover: false },
    ];

    for (const opt of options) {
      const row = document.createElement("label");
      row.className = "_scf_fill_canvas_option";
      row.classList.toggle("_scf_active", fillCanvasEnabled === opt.cover);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "_scf_fill_canvas_mode";
      input.checked = fillCanvasEnabled === opt.cover;
      input.addEventListener("change", () => setMode(opt.cover));

      const text = document.createElement("span");
      text.className = "_scf_fill_canvas_option_name";
      text.textContent = opt.label;

      row.append(input, text);
      panel.appendChild(row);
    }
  }

  updateFillCanvasBtn();
  return { fillCanvasBtnEl: container, updateFillCanvasBtn, cleanup };
}
