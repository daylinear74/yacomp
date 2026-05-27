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
