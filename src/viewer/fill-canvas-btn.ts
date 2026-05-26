import { fillCanvasEnabled, toggleFillCanvas, applyFillCanvas } from "../filters/zoom";
import { showToast } from "../ui/toast";
import type { Toolbar } from "./toolbar";

export interface FillCanvasBtn {
  fillCanvasBtnEl: HTMLDivElement;
  updateFillCanvasBtn: () => void;
  cleanup: () => void;
}

export function createFillCanvasBtn(toolbar: Toolbar): FillCanvasBtn {
  const slot = toolbar.addSlot(() => setOpen(false));

  const fillCanvasBtnEl = document.createElement("div");
  fillCanvasBtnEl.className = "_scf_fill_canvas_toggle";

  const button = document.createElement("button");
  button.type = "button";
  button.className = "_scf_fill_canvas_btn";
  button.title = "Canvas (C)";
  button.setAttribute("aria-label", "Choose canvas mode");
  button.setAttribute("aria-expanded", "false");

  const iconEl = document.createElement("span");
  iconEl.className = "_scf_fill_canvas_icon";
  iconEl.setAttribute("aria-hidden", "true");
  button.appendChild(iconEl);

  const panel = document.createElement("div");
  panel.className = "_scf_fill_canvas_panel";
  panel.hidden = true;

  fillCanvasBtnEl.append(button, panel);
  toolbar.toolbarEl.appendChild(fillCanvasBtnEl);
  let pointerOpening = false;

  function setOpen(open: boolean) {
    fillCanvasBtnEl.classList.toggle("_scf_open", open);
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) slot.notifyOpen();
  }

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

  updateFillCanvasBtn();
  return { fillCanvasBtnEl, updateFillCanvasBtn, cleanup };
}
