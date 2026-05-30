// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits setup                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS, injectTriggerLinkCSS } from "../ui/css";
import { getGrids } from "../grid";
import type { Grid } from "../grid";
import { hasVsOrPipe } from "../grid/names";
import { buildComparison, insertLinkAfter } from "../viewer";
import { fetchSlowPicsGridInfo, parseSlowPicsKey, slowPicsKeyFromAnchor } from "./slowpics-source";
import { findSlowPicsComparisons, buildRescueGrid, type SlowPicsComparison } from "./hdbits-slowpics";

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

  // slow.pics links are authoritative comparison boundaries. Gather them first
  // and keep their screenshots out of the DOM-heuristic getGrids pass, so each
  // slow.pics comparison (incl. ones getGrids can't shape, like a flat "Dirty
  // line fix" block) is shaped from the linked collection's column count/titles.
  const comparisons = collectSlowPicsComparisons();
  const slowpicsImgs = new Set<HTMLImageElement>();
  for (const c of comparisons) for (const img of c.images) slowpicsImgs.add(img);

  for (const { grid, container } of getGrids(slowpicsImgs)) {
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

  for (const comparison of comparisons) addSlowPicsComparisonLink(comparison);
}

/** All slow.pics-linked comparisons in the page, deduped by link. */
function collectSlowPicsComparisons(): SlowPicsComparison[] {
  const roots = new Set<Element>();
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    if (slowPicsKeyFromAnchor(a.href, a.textContent || "")) {
      roots.add(a.closest("td, div.comment, div.text, div") || document.body);
    }
  }
  const out: SlowPicsComparison[] = [];
  const seen = new Set<HTMLAnchorElement>();
  for (const root of roots) {
    for (const c of findSlowPicsComparisons(root)) {
      if (seen.has(c.link)) continue;
      seen.add(c.link);
      out.push(c);
    }
  }
  return out;
}

/** A "Show comparison" affordance for a slow.pics-linked block: fetch the
 *  collection on click for the authoritative column count + titles, reshape the
 *  HDBits screenshots, render. Falls back to manual column entry on failure. */
function addSlowPicsComparisonLink(comparison: SlowPicsComparison): void {
  const { key, link: spLink, images } = comparison;
  const container = (spLink.closest("td, div, p") || spLink.parentElement) as HTMLElement | null;
  if (!container) return;
  const link = makeShowComparisonLink();
  link.style.display = "block";
  link.style.marginTop = "6px";
  // Warm the ~1s slow.pics fetch on hover so the click feels instant (cached).
  link.addEventListener("mouseenter", () => { void fetchSlowPicsGridInfo(key); });
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    const original = link.textContent;
    link.textContent = "Loading comparison…";
    const info = await fetchSlowPicsGridInfo(key);
    const grid = info && buildRescueGrid(images, info, spLink);
    if (grid) { link.textContent = original; buildComparison(grid, container, link); return; }
    link.remove();
    addManualColumnControl(images, spLink, container);
  });
  insertLinkAfter(spLink, link);
}

/** Last resort: a tiny "columns: [ ] Show comparison" control. The user types
 *  the column count and the flat block is reshaped into that many columns. */
function addManualColumnControl(images: HTMLImageElement[], anchor: Node, container: HTMLElement): void {
  const wrap = document.createElement("span");
  wrap.style.display = "block";
  wrap.style.marginTop = "6px";
  const input = document.createElement("input");
  input.type = "number";
  input.min = "2";
  input.placeholder = "cols";
  input.style.width = "4em";
  const link = makeShowComparisonLink();
  link.addEventListener("click", (e) => {
    e.preventDefault();
    const cols = Number.parseInt(input.value, 10);
    if (!(cols >= 2) || images.length % cols !== 0) {
      link.textContent = `Show comparison (enter a column count that divides ${images.length})`;
      return;
    }
    const names = Array.from({ length: cols }, (_, i) => `Source ${i + 1}`);
    const grid = buildRescueGrid(images, { names, numCols: cols, imageUrls: [] }, anchor);
    if (grid) buildComparison(grid, container, link);
  });
  wrap.append("columns: ", input, " ", link);
  if (anchor.parentNode) insertLinkAfter(anchor, wrap);
  else container.insertBefore(wrap, container.firstChild);
}

export function setupHDBits(): void {
  if (!isHDBitsHost()) return;
  setupHDBitsCore();
}
