// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Yet Another Comparison Viewer — Entry point                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { hasAdjustments } from "./filters/brightness";
import { applyToImg, syncAll } from "./filters/imaging";
import { setupKeyboard } from "./keyboard";
import { setupHDBits } from "./sites/hdbits";
import { setupPTP } from "./sites/ptp";
import { setupSlowPics } from "./sites/slowpics";

(function () {
  "use strict";

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  MutationObserver: lazy-loaded / SPA images                               ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  const mo = new MutationObserver((mutations) => {
    if (!hasAdjustments()) return;
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node.nodeName === "IMG") applyToImg(node as HTMLImageElement);
        else if ((node as Element).querySelectorAll)
          (node as Element).querySelectorAll("img").forEach((img) => applyToImg(img));
      }
    }
  });

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  Init                                                                     ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  function init() {
    mo.observe(document.body, { childList: true, subtree: true });
    (["popstate", "hashchange"] as const).forEach((ev) =>
      window.addEventListener(ev, () => {
        if (hasAdjustments()) setTimeout(syncAll, 300);
      }),
    );
    setupKeyboard();
    setupHDBits();
    setupPTP();
    setupSlowPics();
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
