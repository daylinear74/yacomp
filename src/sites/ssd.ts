// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Spring Sunday comparison hijack                                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { setupFieldsetComparison } from "./fieldset-comparison";

export function setupSSD(): void {
  setupFieldsetComparison({
    host: /(?:^|\.)springsunday\.net$/i,
    primaryUrl: (_anchor, img) =>
      img.dataset.originalUrl || img.getAttribute("data-original-url") || "",
  });
}
