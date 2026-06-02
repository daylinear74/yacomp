// PTP fixture entry. setupPTP()'s real hostname guard won't pass on
// 127.0.0.1, so the test mounts the inline-grid feature directly via
// injectPTPGrids and exposes the config hooks Playwright drives.

import { injectPTPGrids } from "../../../src/sites/ptp";
import { saveConfig, resetConfig, getConfig } from "../../../src/config";

function boot(): void {
  injectPTPGrids(document);

  (window as unknown as { __yacomp: unknown }).__yacomp = {
    saveConfig,
    resetConfig,
    getConfig,
  };
  (window as unknown as { __yacomp_test_ready: boolean }).__yacomp_test_ready = true;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", boot, { once: true });
} else {
  boot();
}
