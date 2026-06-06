import { closeBtnPosition, closeUsesCanvasClick } from "../config";
import { getShadowRoot } from "../ui/shadow";

// Exported as a pure function so the platform fallback can be exercised
// in unit tests without poking at `navigator.userAgent` (which the real
// module-level constant resolves once at import time).
export function resolveCloseBtnPosition(
  pref: "auto" | "left" | "right" | "hide",
  isMac: boolean,
): "left" | "right" | "hide" {
  if (pref === "left" || pref === "right" || pref === "hide") return pref;
  return isMac ? "left" : "right";
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

function resolvePosition(): "left" | "right" | "hide" {
  // Bound to a canvas click/double-click → the button is redundant, hide it.
  if (closeUsesCanvasClick()) return "hide";
  return resolveCloseBtnPosition(closeBtnPosition(), isMac);
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
    const sideClass = pos === "left" ? " _scf_left" : " _scf_right";
    closeBtnEl.className = "_scf_close_btn" + sideClass + (pos === "hide" ? " _scf_hidden" : "");
  }

  updatePosition();
  getShadowRoot().appendChild(closeBtnEl);

  function cleanup() {
    closeBtnEl.remove();
  }

  return { closeBtnEl, updatePosition, cleanup };
}
