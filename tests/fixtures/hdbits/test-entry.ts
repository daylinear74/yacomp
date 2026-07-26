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
import { saveConfig, getConfig, resetConfig } from "../../../src/config";

// Test-only GM_xmlhttpRequest stub: serve canned slow.pics collection pages so
// rescue/enrichment paths can be exercised offline. UnknownNamesKey simulates a
// successful fetch with unusable source names; FetchFailKey simulates no fetch.
function stubSlowPicsHtml(url: string): string {
  const names = /UnknownNamesKey/i.test(url) ? ["unknown", "", "Unknown"] : ["S", "F", "E"];
  return `<html><body><script>var collection = ${JSON.stringify({
    key: "STUBKEY",
    name: "stub",
    comparisons: [
      { key: "r1", images: names.map((name, i) => ({ name, publicFileName: `${i + 1}.png` })) },
      { key: "r2", images: names.map((name, i) => ({ name, publicFileName: `${i + 4}.png` })) },
    ],
  })};</script></body></html>`;
}

(globalThis as unknown as { GM_xmlhttpRequest: (d: GMXHRDetails) => void }).GM_xmlhttpRequest = (details) => {
  if (/slow\.pics\/c\//.test(details.url)) {
    if (/FetchFailKey/i.test(details.url)) {
      details.onerror?.(new Error("blocked"));
      return;
    }
    const respond = (): void => {
      details.onload?.({ status: 200, responseText: stubSlowPicsHtml(details.url) });
    };
    // SlowFetchKey simulates the real ~1s collection fetch so tests can race
    // user input against an in-flight request; every other key resolves
    // synchronously to keep the rest of the suite instant.
    if (/SlowFetchKey/i.test(details.url)) setTimeout(respond, 300);
    else respond();
  } else {
    details.onerror?.(new Error("blocked"));
  }
};

function run(): void {
  // Keyboard hooks let the e2e suite press number/arrow keys to drive
  // the viewer once a "Show comparison" link has been clicked.
  setupKeyboard();
  setupHDBitsCore();
  (window as unknown as { __yacomp: unknown }).__yacomp = { saveConfig, getConfig, resetConfig };
  (window as unknown as { __yacomp_test_ready: boolean }).__yacomp_test_ready = true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", run);
} else {
  run();
}

export {};
