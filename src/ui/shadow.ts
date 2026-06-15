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

/** True when the focused element is a text field, including one nested inside
 *  an open shadow root (our settings UI lives in a shadow tree). */
export function isEditing(): boolean {
  let el: Element | null = document.activeElement;
  while (el?.shadowRoot?.activeElement) {
    el = el.shadowRoot.activeElement;
  }
  const tag = el?.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    !!(el as HTMLElement | null)?.isContentEditable
  );
}
