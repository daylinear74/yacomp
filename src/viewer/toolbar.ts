import { getShadowRoot } from "../ui/shadow";

export interface ToolbarSlot {
  notifyOpen: () => void;
}

export interface Toolbar {
  toolbarEl: HTMLDivElement;
  addSlot: (close: () => void) => ToolbarSlot;
  cleanup: () => void;
}

export function createToolbar(): Toolbar {
  const toolbarEl = document.createElement("div");
  toolbarEl.className = "_scf_toolbar";

  const panelCloseHandlers: (() => void)[] = [];

  function addSlot(close: () => void): ToolbarSlot {
    panelCloseHandlers.push(close);
    return {
      notifyOpen() {
        for (const handler of panelCloseHandlers) {
          if (handler !== close) handler();
        }
      },
    };
  }

  const stop = (e: Event) => e.stopPropagation();
  for (const eventName of ["click", "mousedown", "mousemove", "pointermove", "wheel"]) {
    toolbarEl.addEventListener(eventName, stop);
  }

  getShadowRoot().appendChild(toolbarEl);

  function cleanup() {
    toolbarEl.remove();
  }

  return { toolbarEl, addSlot, cleanup };
}
