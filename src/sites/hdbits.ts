// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits setup                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS, injectTriggerLinkCSS } from "../ui/css";
import { getGrids } from "../grid";
import type { Grid } from "../grid";
import { hasVsOrPipe } from "../grid/names";
import { buildComparison, insertLinkAfter } from "../viewer";
import { fetchSlowPicsGridInfo, parseSlowPicsKey } from "./slowpics-source";
import { findSlowPicsRescues, buildRescueGrid } from "./hdbits-slowpics";

export function findComparisonLinkAnchor(container: Element): Node | null {
  const parent = container.parentElement || container;
  for (const s of parent.querySelectorAll("strong")) {
    if (hasVsOrPipe(s.textContent || "")) return s;
  }
  return null;
}

export function isHDBitsHost(hostname: string = location.hostname): boolean {
  return /(?:^|\.)hdbits\.org$/.test(hostname);
}

function makeShowComparisonLink(): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = "#";
  link.className = "_scf_comp_link";
  link.textContent = "Show comparison";
  return link;
}

/** Nearest preceding slow.pics/c key for a DOM node (its comparison's link). */
function slowPicsKeyBefore(node: Node | null | undefined): string | null {
  if (!node) return null;
  let owner: string | null = null;
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const key = parseSlowPicsKey(a.href);
    if (!key) continue;
    if (a.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) owner = key;
    else break;
  }
  return owner;
}

// Names the DOM parser assigns when it couldn't read real source titles —
// safe to overwrite with slow.pics' authoritative column titles.
function namesAreGeneric(names: string[] | null): boolean {
  if (!names) return true;
  return names.every((n) => /^(Source(\s+\d+)?|Filtered|Encode)$/.test(n.trim()));
}

/** On click, upgrade a grid's generic/absent names with slow.pics column
 *  titles (when the linked comparison has the same column count). */
async function maybeEnrichNames(grid: Grid): Promise<void> {
  if (!namesAreGeneric(grid.names)) return;
  const key = slowPicsKeyBefore(grid.rows[0]?.[0]?.img);
  if (!key) return;
  const info = await fetchSlowPicsGridInfo(key);
  if (info && info.numCols === grid.numCols) grid.names = info.names.slice(0, grid.numCols);
}

// The setup body without the host guard, so test fixtures can drive the
// detector from any origin (e.g. http://127.0.0.1:4173). Production goes
// through `setupHDBits` below, which keeps the host check intact.
export function setupHDBitsCore(): void {
  injectCSS();
  injectTriggerLinkCSS();

  const grids = getGrids();
  const claimed = new Set<HTMLImageElement>();
  for (const { grid } of grids) {
    for (const cell of grid.rows.flat()) if (cell.img) claimed.add(cell.img);
  }

  for (const { grid, container } of grids) {
    const link = makeShowComparisonLink();
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await maybeEnrichNames(grid);
      buildComparison(grid, container as HTMLElement, link);
    });

    // Keep links for a BBCode hide block inside its hidden content. Inserting
    // after the external label breaks HDBits' adjacent-sibling toggle lookup.
    if (grid.anchorEl && !container.closest("div.div_showhide")) {
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

  setupSlowPicsRescues(claimed);
}

/** Rescue comparisons the DOM parser couldn't shape: a slow.pics-linked block of
 *  screenshots with no column markup (e.g. a flat row under "Dirty line fix:").
 *  The grid size + titles come from the linked slow.pics collection, fetched on
 *  demand when the user clicks the link. */
function setupSlowPicsRescues(claimed: Set<HTMLImageElement>): void {
  const roots = new Set<Element>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (parseSlowPicsKey(a.href)) roots.add(a.closest("td, div, p") || document.body);
  }
  for (const root of roots) {
    for (const rescue of findSlowPicsRescues(root, claimed)) {
      if (rescue.images.some((img) => claimed.has(img))) continue;
      const container = (rescue.link.closest("td, div, p") || rescue.link.parentElement) as HTMLElement | null;
      if (!container) continue;
      for (const img of rescue.images) claimed.add(img);

      const link = makeShowComparisonLink();
      link.style.display = "block";
      link.style.marginTop = "6px";
      link.addEventListener("click", async (e) => {
        e.preventDefault();
        const info = await fetchSlowPicsGridInfo(rescue.key);
        if (!info) { link.textContent = "Show comparison (slow.pics unavailable)"; return; }
        const grid = buildRescueGrid(rescue.images, info, rescue.link);
        if (!grid) { link.textContent = "Show comparison (couldn't fit columns)"; return; }
        buildComparison(grid, container, link);
      });
      insertLinkAfter(rescue.link, link);
    }
  }
}

export function setupHDBits(): void {
  if (!isHDBitsHost()) return;
  setupHDBitsCore();
}
