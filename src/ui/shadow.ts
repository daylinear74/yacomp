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

export function getShadowHost(): HTMLElement {
  if (!host) init();
  return host!;
}
