// Test-only bootstrap for the HDBits fixture runner.
//
// The production userscript gates `setupHDBits` on `location.hostname`,
// so it won't run from 127.0.0.1:4173. This entry imports the
// `setupHDBitsCore` from the same module (which contains the actual
// detector logic, minus the host check) and announces readiness on the
// window so Playwright knows the parser has finished and the DOM is
// safe to assert on.
//
// Only the HDBits site hook is wired up here — every other site setup
// is intentionally absent so this fixture exercises one detector at a
// time.

import { setupHDBitsCore } from "../../../src/sites/hdbits";
import { setupKeyboard } from "../../../src/keyboard";

// Test-only GM_xmlhttpRequest stub: serve a canned slow.pics collection page for
// any slow.pics/c/<key> request so the slow.pics rescue/enrichment paths can be
// exercised offline. 3 columns (S/F/E), same inline `var collection = {…}` shape
// the real site renders.
const STUB_SLOWPICS_HTML = `<html><body><script>var collection = ${JSON.stringify({
  key: "STUBKEY",
  name: "stub",
  comparisons: [
    { key: "r1", images: [{ name: "S", publicFileName: "a.png" }, { name: "F", publicFileName: "b.png" }, { name: "E", publicFileName: "c.png" }] },
    { key: "r2", images: [{ name: "S", publicFileName: "d.png" }, { name: "F", publicFileName: "e.png" }, { name: "E", publicFileName: "f.png" }] },
  ],
})};</script></body></html>`;

(globalThis as unknown as { GM_xmlhttpRequest: (d: GMXHRDetails) => void }).GM_xmlhttpRequest = (details) => {
  if (/slow\.pics\/c\//.test(details.url)) {
    details.onload?.({ status: 200, responseText: STUB_SLOWPICS_HTML });
  } else {
    details.onerror?.(new Error("blocked"));
  }
};

function run(): void {
  // Keyboard hooks let the e2e suite press number/arrow keys to drive
  // the viewer once a "Show comparison" link has been clicked. The
  // initial source label is empty until switchColumn fires, so the
  // test presses a digit to populate it before reading source names.
  setupKeyboard();
  setupHDBitsCore();
  (window as unknown as { __yacomp_test_ready: boolean }).__yacomp_test_ready = true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}

export {};
