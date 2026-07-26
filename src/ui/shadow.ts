// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Shadow DOM root — CSS isolation from host page                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

let host: HTMLDivElement | null = null;
let root: ShadowRoot | null = null;

function init(): void {
  if (root) return;
  host = document.createElement("div");
  host.id = "_scf_root_";
  host.style.cssText =
    "position:absolute;top:0;left:0;width:0;height:0;overflow:visible";
  document.body.appendChild(host);
  root = host.attachShadow({ mode: "open" });
}

export function getShadowRoot(): ShadowRoot {
  if (!root) init();
  return root!;
}

// Input types whose focus must not disable the keyboard shortcuts: they take
// no text, and a click can leave them focused indefinitely (e.g. re-clicking
// the already-selected canvas radio fires no change event to move focus).
// Range stays "editing" so arrow keys keep driving a focused slider.
const NON_EDITING_INPUT_TYPES = new Set([
  "checkbox", "radio", "button", "submit", "reset", "file",
]);

/** True when the focused element takes text/arrow-key input, including one
 *  nested inside an open shadow root (our settings UI lives in a shadow tree). */
export function isEditing(): boolean {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  if (!el) return false;
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.tagName === "TEXTAREA") return true;
  if (el.tagName !== "INPUT") return false;
  return !NON_EDITING_INPUT_TYPES.has((el as HTMLInputElement).type);
}
