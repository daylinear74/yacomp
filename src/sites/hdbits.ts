// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits setup                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS } from "../ui/css";
import { getGrids } from "../grid";
import { buildComparison, insertLinkAfter } from "../viewer";

export function setupHDBits(): void {
  if (!/(?:^|\.)hdbits\.org$/.test(location.hostname)) return;
  injectCSS();

  for (const { grid, container } of getGrids()) {
    const link = document.createElement("a");
    link.href = "#";
    link.className = "_scf_comp_link";
    link.textContent = "Show comparison";
    link.addEventListener("click", (e) => {
      e.preventDefault();
      buildComparison(grid, container as HTMLElement, link);
    });

    // Multi-comp: insert after the section's anchor label
    if (grid.anchorEl) {
      insertLinkAfter(grid.anchorEl, link);
      continue;
    }

    // Single-comp: insert after the first <strong> with "|"
    let inserted = false;
    const parent = container.parentElement || container;
    for (const s of parent.querySelectorAll("strong")) {
      if (s.textContent!.includes("|")) {
        insertLinkAfter(s, link);
        inserted = true;
        break;
      }
    }
    if (!inserted) {
      // Insert inside container to avoid invalid HTML when
      // container is a <td> (forum posts)
      link.style.display = "block";
      link.style.marginBottom = "6px";
      container.insertBefore(link, container.firstChild);
    }
  }
}
