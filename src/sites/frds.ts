// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  FRDS comparison hijack                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { setupFieldsetComparison } from "./fieldset-comparison";

export function setupFRDS(): void {
  setupFieldsetComparison({
    host: /^pt\.keepfrds\.com$/i,
    primaryUrl: (anchor) => anchor.href || "",
  });
}
