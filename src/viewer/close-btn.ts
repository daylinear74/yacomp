import { closeBtnPosition } from "../config";
import { getShadowRoot } from "../ui/shadow";

const isMac = /Mac|iPhone|iPad/.test(navigator.userAgent);

function resolvePosition(): "left" | "right" {
  const pref = closeBtnPosition();
  if (pref === "left" || pref === "right") return pref;
  return isMac ? "left" : "right";
}

export interface CloseBtn {
  closeBtnEl: HTMLButtonElement;
  updatePosition: () => void;
  cleanup: () => void;
}

export function createCloseBtn(onClose: () => void): CloseBtn {
  const closeBtnEl = document.createElement("button");
  closeBtnEl.type = "button";
  closeBtnEl.title = "Close (Esc)";
  closeBtnEl.setAttribute("aria-label", "Close viewer");

  const iconEl = document.createElement("span");
  iconEl.className = "_scf_close_icon";
  iconEl.setAttribute("aria-hidden", "true");
  closeBtnEl.appendChild(iconEl);

  closeBtnEl.addEventListener("click", (e) => {
    e.stopPropagation();
    onClose();
  });
  closeBtnEl.addEventListener("mousedown", (e) => e.stopPropagation());

  function updatePosition() {
    const pos = resolvePosition();
    closeBtnEl.className = "_scf_close_btn" + (pos === "left" ? " _scf_left" : " _scf_right");
  }

  updatePosition();
  getShadowRoot().appendChild(closeBtnEl);

  function cleanup() {
    closeBtnEl.remove();
  }

  return { closeBtnEl, updatePosition, cleanup };
}
