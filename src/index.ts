// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Yet Another Comparison Viewer — Entry point                              ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { siteEnabled } from "./config";
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
import { siteBehaviorEnabled } from "./sites/current-site";

(function () {
  "use strict";

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  MutationObserver: lazy-loaded / SPA images                               ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  const mo = new MutationObserver((mutations) => {
    // This fires on every DOM mutation across untrusted page markup; never let a
    // single bad node tear down the observer.
    try {
      if (!siteBehaviorEnabled() || !hasAdjustments()) return;
      for (const { addedNodes } of mutations) {
        for (const node of addedNodes) {
          if (node.nodeName === "IMG") void applyToImg(node as HTMLImageElement);
          else if ((node as Element).querySelectorAll)
            (node as Element).querySelectorAll("img").forEach((img) => void applyToImg(img));
        }
      }
    } catch (err) {
      console.error("[yacomp] mutation handler failed:", err);
    }
  });

  // ╔═══════════════════════════════════════════════════════════════════════════╗
  // ║  Init                                                                     ║
  // ╚═══════════════════════════════════════════════════════════════════════════╝

  // Run each init step in isolation: a failure in one site's setup (e.g. a parser
  // throwing on unexpected page markup) must not abort the rest of initialization.
  function safe(label: string, fn: () => void): void {
    try {
      fn();
    } catch (err) {
      console.error(`[yacomp] ${label} failed to initialize:`, err);
    }
  }

  function init() {
    safe("menu", () => GM_registerMenuCommand("yacomp Settings", openSettings));
    safe("observer", () => mo.observe(document.body, { childList: true, subtree: true }));
    safe("history", () =>
      (["popstate", "hashchange"] as const).forEach((ev) =>
        window.addEventListener(ev, () => {
          if (siteBehaviorEnabled() && hasAdjustments()) {
            setTimeout(() => {
              if (siteBehaviorEnabled()) syncAll();
            }, 300);
          }
        }),
      ),
    );
    safe("keyboard", setupKeyboard);
    if (siteEnabled("bhd")) safe("bhd", setupBHD);
    if (siteEnabled("comppics")) safe("comppics", setupComppics);
    if (siteEnabled("frds")) safe("frds", setupFRDS);
    if (siteEnabled("gpw")) safe("gpw", setupGPW);
    if (siteEnabled("hdbits")) safe("hdbits", setupHDBits);
    if (siteEnabled("ptp")) safe("ptp", setupPTP);
    if (siteEnabled("slowpics")) safe("slowpics", setupSlowPics);
    if (siteEnabled("ssd")) safe("ssd", setupSSD);
    if (siteEnabled("blutopia") || siteEnabled("aither")) safe("unit3d", setupUnit3D);
  }

  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init);
})();
