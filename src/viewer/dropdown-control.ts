// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Toolbar dropdown control (shared scaffolding)                            ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// The toolbar's source-menu and canvas-mode controls are the same dropdown: a
// button that toggles a hidden panel, registered as a toolbar slot, closing on
// an outside click. This builds that scaffold; each caller fills the panel and
// reacts to its own state. Differences are only class names and labels.

import type { Toolbar } from "./toolbar";

export interface ToolbarDropdownConfig {
  containerClass: string;
  buttonClass: string;
  iconClass: string;
  panelClass: string;
  title: string;
  ariaLabel: string;
}

export interface ToolbarDropdown {
  container: HTMLDivElement;
  button: HTMLButtonElement;
  iconEl: HTMLSpanElement;
  panel: HTMLDivElement;
  setOpen: (open: boolean) => void;
  cleanup: () => void;
}

export function createToolbarDropdown(toolbar: Toolbar, config: ToolbarDropdownConfig): ToolbarDropdown {
  const slot = toolbar.addSlot(() => setOpen(false));

  const container = document.createElement("div");
  container.className = config.containerClass;

  const button = document.createElement("button");
  button.type = "button";
  button.className = config.buttonClass;
  button.title = config.title;
  button.setAttribute("aria-label", config.ariaLabel);
  button.setAttribute("aria-expanded", "false");

  const iconEl = document.createElement("span");
  iconEl.className = config.iconClass;
  iconEl.setAttribute("aria-hidden", "true");
  button.appendChild(iconEl);

  const panel = document.createElement("div");
  panel.className = config.panelClass;
  panel.hidden = true;

  container.append(button, panel);
  toolbar.toolbarEl.appendChild(container);
  let pointerOpening = false;

  function setOpen(open: boolean) {
    container.classList.toggle("_scf_open", open);
    panel.hidden = !open;
    button.setAttribute("aria-expanded", String(open));
    if (open) slot.notifyOpen();
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

  return { container, button, iconEl, panel, setOpen, cleanup };
}
