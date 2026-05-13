// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits setup                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS } from "../ui/css";
import { getGrids } from "../grid";
import { hasVsOrPipe } from "../grid/names";
import { buildComparison, insertLinkAfter } from "../viewer";

export function findComparisonLinkAnchor(container: Element): Node | null {
  const parent = container.parentElement || container;
  for (const s of parent.querySelectorAll("strong")) {
    if (hasVsOrPipe(s.textContent || "")) return s;
  }
  return null;
}

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

    // Single-comp fallback: insert after the first comparison-like heading.
    const anchor = findComparisonLinkAnchor(container);
    if (anchor) {
      insertLinkAfter(anchor, link);
    } else {
      // Insert inside container to avoid invalid HTML when
      // container is a <td> (forum posts)
      link.style.display = "block";
      link.style.marginBottom = "6px";
      container.insertBefore(link, container.firstChild);
    }
  }
}
