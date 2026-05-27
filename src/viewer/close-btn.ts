import { closeBtnPosition } from "../config";
import { getShadowRoot } from "../ui/shadow";

// Exported as a pure function so the platform fallback can be exercised
// in unit tests without poking at `navigator.userAgent` (which the real
// module-level constant resolves once at import time).
export function resolveCloseBtnPosition(
  pref: "auto" | "left" | "right",
  isMac: boolean,
): "left" | "right" {
  if (pref === "left" || pref === "right") return pref;
  return isMac ? "left" : "right";
}

const isMac =
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad/.test(navigator.userAgent);

function resolvePosition(): "left" | "right" {
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
    closeBtnEl.className = "_scf_close_btn" + (pos === "left" ? " _scf_left" : " _scf_right");
  }

  updatePosition();
  getShadowRoot().appendChild(closeBtnEl);

  function cleanup() {
    closeBtnEl.remove();
  }

  return { closeBtnEl, updatePosition, cleanup };
}
