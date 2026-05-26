// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Yet Another Comparison Viewer — Entry point                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import "./config";
import { hasAdjustments } from "./filters/brightness";
import { applyToImg, syncAll } from "./filters/imaging";
import { setupKeyboard } from "./keyboard";
import { openSettings } from "./ui/settings";
import { setupComppics } from "./sites/comppics";
import { setupBHD } from "./sites/bhd";
import { setupFRDS } from "./sites/frds";
import { setupGPW } from "./sites/gpw";
import { setupHDBits } from "./sites/hdbits";
import { setupPTP } from "./sites/ptp";
import { setupSlowPics } from "./sites/slowpics";
import { setupSSD } from "./sites/ssd";
import { setupUnit3D } from "./sites/unit3d";

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
    GM_registerMenuCommand("yacomp Settings", openSettings);
    mo.observe(document.body, { childList: true, subtree: true });
    (["popstate", "hashchange"] as const).forEach((ev) =>
      window.addEventListener(ev, () => {
        if (hasAdjustments()) setTimeout(syncAll, 300);
      }),
    );
    setupKeyboard();
    setupBHD();
    setupComppics();
    setupFRDS();
    setupGPW();
    setupHDBits();
    setupPTP();
    setupSlowPics();
    setupSSD();
    setupUnit3D();
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
