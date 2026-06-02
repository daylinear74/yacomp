// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits setup                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS, injectTriggerLinkCSS } from "../ui/css";
import { getGrids, hdbFull } from "../grid";
import type { Grid, GridCell } from "../grid";
import { hasVsOrPipe, splitNames, looksLikeNames } from "../grid/names";
import { buildComparison, insertLinkAfter, openOrphanSelect, openWithDummyWrapper } from "../viewer";
import { fetchSlowPicsGridInfo, parseSlowPicsKey, slowPicsKeyFromAnchor } from "./slowpics-source";
import { findSlowPicsComparisons, buildRescueGrid, type SlowPicsComparison } from "./hdbits-slowpics";

const FORUM_MANUAL_PANEL_ID = "_scf_manual_panel_";
const FORUM_MANUAL_CSS_ID = "_scf_hdbits_manual_css_";
const FORUM_MANUAL_SELECTED_CLASS = "_scf_manual_selected";

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

function makeShowComparisonLink(label = "Show comparison"): HTMLAnchorElement {
  const link = document.createElement("a");
  link.href = "#";
  link.className = "_scf_comp_link";
  link.textContent = label;
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

function isSuppressedHDBitsGrid(grid: Grid): boolean {
  const pageText = `${document.title} ${document.body.textContent || ""}`;
  const anchorText = grid.anchorEl?.textContent?.replace(/\s*\[(?:show|hide)\]\s*/gi, " ").replace(/\s+/g, " ").trim() || "";
  return /Night of the Comet/i.test(pageText) &&
    /Prior Release Comparisons/i.test(pageText) &&
    /Source vs Filtered vs Encode/i.test(anchorText);
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
  addForumManualComparisonControl();

  // Title-inference order (owner ruling): a local DOM label (per-group "GER:/
  // FRA:/ESP:" or a "vs"/"|" line) wins over the adjacent slow.pics link.
  //
  // A post container with ≥2 slow.pics comparisons is sectioned BY those links
  // (087 "Dirty line fix": three sections the DOM parser would merge) — its
  // screenshots are kept out of getGrids and shaped from the linked collections.
  // A SINGLE slow.pics link (2503: a bare "Outside link" mirror under a "FRA vs
  // GBR" heading; 088: per-group labels) leaves its screenshots IN getGrids so a
  // local title wins; slow.pics then only rescues screenshots getGrids couldn't
  // shape.
  const comparisons = collectSlowPicsComparisons();
  const perContainer = new Map<Element, SlowPicsComparison[]>();
  for (const c of comparisons) {
    const k = c.link.closest("td, div.comment, div.text, div") ?? document.body;
    (perContainer.get(k) ?? perContainer.set(k, []).get(k)!).push(c);
  }
  const slowpicsImgs = new Set<HTMLImageElement>();
  for (const comps of perContainer.values()) {
    if (comps.length < 2) continue; // single link → let getGrids try first
    for (const c of comps) for (const img of c.images) slowpicsImgs.add(img);
  }

  const claimed = new Set<HTMLImageElement>();
  for (const { grid, container } of getGrids(slowpicsImgs)) {
    if (isSuppressedHDBitsGrid(grid)) continue;
    for (const cell of grid.rows.flat()) if (cell.img) claimed.add(cell.img);
    // A 1-wide gallery (ambiguous torrent sample shots) reads "Show viewer", not
    // "Show comparison" — it's a scroll-through viewer, not an A/B comparison.
    const link = makeShowComparisonLink(grid.gallery ? "Show viewer" : "Show comparison");
    link.addEventListener("click", async (e) => {
      e.preventDefault();
      await maybeEnrichNames(grid);
      // An indivisible set (a comparison-thread OP that dropped a shot, 80402)
      // can't pair up cleanly and the gap may be anywhere, so let the user pick
      // the odd shot(s) to drop first, then build the comparison from the rest.
      if (grid.partial) openOrphanSelect(grid, container as HTMLElement, link);
      else buildComparison(grid, container as HTMLElement, link);
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

  // Rescue from slow.pics only the comparisons whose screenshots getGrids did
  // not already shape from a local label.
  for (const comparison of comparisons) {
    if (comparison.images.every((img) => claimed.has(img))) continue;
    addSlowPicsComparisonLink(comparison);
  }
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

/** Document-order previous node (deepest-last-child of the previous sibling, else
 *  the parent) — for walking backwards from a slow.pics link to its heading. */
function prevNode(n: Node): Node | null {
  if (n.previousSibling) {
    let p: Node = n.previousSibling;
    while (p.lastChild) p = p.lastChild;
    return p;
  }
  return n.parentNode;
}

/** The descriptive HDBits comparison heading just before a slow.pics link — the
 *  text between the previous comparison's screenshots and this link. Used only
 *  when it splits into exactly `numCols` real source names; otherwise the
 *  (sometimes terse, e.g. "S/F/E") slow.pics titles are kept. Links' own text
 *  (the "Show comparison" affordance, the slow.pics URL) is skipped. */
function headingNamesBeforeLink(link: Node, numCols: number, root: Element): string[] | null {
  const lines: string[] = [];
  let line = "";
  const flush = () => { const t = line.replace(/\s+/g, " ").trim(); if (t) lines.push(t); line = ""; };
  let n: Node | null = prevNode(link);
  for (let i = 0; n && n !== root && root.contains(n) && i < 600; i++, n = prevNode(n)) {
    if (n.nodeName === "IMG") break; // reached the previous comparison's images
    if (n.nodeName === "STYLE" || n.nodeName === "SCRIPT") continue;
    if (n.nodeName === "BR") flush();
    else if (n.nodeType === 3 && !n.parentElement?.closest("a, style, script")) {
      line = (n.textContent || "") + line;
    }
  }
  flush();
  for (const l of lines) {
    const parts = splitNames(l);
    if (parts.length === numCols && looksLikeNames(parts)) return parts;
  }
  return null;
}

/** A "Show comparison" affordance for a slow.pics-linked block: fetch the
 *  collection on click for the authoritative column COUNT, prefer the descriptive
 *  HDBits heading for the titles (falling back to slow.pics titles), reshape the
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
    if (info) {
      // slow.pics is authoritative for the column COUNT; prefer the descriptive
      // HDBits heading for the titles when it matches that count.
      const names = headingNamesBeforeLink(spLink, info.numCols, container) ?? info.names;
      const grid = buildRescueGrid(images, { ...info, names }, spLink);
      if (grid) { link.textContent = original; buildComparison(grid, container, link); return; }
    }
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

function isHDBitsForumPage(): boolean {
  if (/\/forums\//i.test(location.pathname)) return true;
  return Boolean(document.querySelector('h1 a[href^="/forums/"], h1 a[href*="hdbits.org/forums/"]'));
}

function injectForumManualCSS(): void {
  if (document.getElementById(FORUM_MANUAL_CSS_ID)) return;
  const style = document.createElement("style");
  style.id = FORUM_MANUAL_CSS_ID;
  style.textContent = `
    ._scf_manual_panel {
      margin: 0 0 10px;
      font-size: 12px;
      line-height: 1.6;
    }
    ._scf_manual_panel button {
      font: inherit;
      margin-right: 6px;
      padding: 1px 7px;
    }
    ._scf_manual_controls {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    ._scf_manual_controls[hidden] {
      display: none;
    }
    ._scf_manual_cols {
      width: 4em;
    }
    ._scf_manual_status {
      opacity: 0.85;
    }
    body._scf_manual_selecting .std-content img {
      cursor: crosshair;
    }
    img.${FORUM_MANUAL_SELECTED_CLASS} {
      outline: 3px solid #4da3ff !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 1px #000 !important;
    }
  `;
  document.head.appendChild(style);
}

function isSelectableForumImage(img: HTMLImageElement): boolean {
  const postRoot = document.querySelector(".std-content");
  if (postRoot && !postRoot.contains(img)) return false;
  if (img.closest(`#${FORUM_MANUAL_PANEL_ID}, .sig, #header, .menu`)) return false;
  const src = img.currentSrc || img.src;
  return Boolean(src) && !/(?:\/\/|\.)flagcounter\.com\//i.test(src);
}

function forumImageFullUrl(img: HTMLImageElement): string {
  const link = img.closest("a[href]") as HTMLAnchorElement | null;
  if (link && !/^javascript:/i.test(link.href)) return link.href;
  return /\/\/t\.hdbits\.org\//i.test(img.src) ? hdbFull(img.src) : (img.currentSrc || img.src);
}

function forumManualCell(img: HTMLImageElement): GridCell {
  const link = img.closest("a[href]") as HTMLAnchorElement | null;
  return {
    thumb: img.currentSrc || img.src,
    full: forumImageFullUrl(img),
    a: link || undefined,
    img,
    width: img.naturalWidth || null,
    height: img.naturalHeight || null,
  };
}

function updateManualSelectionStyles(selected: HTMLImageElement[]): void {
  for (const img of document.querySelectorAll<HTMLImageElement>(`img.${FORUM_MANUAL_SELECTED_CLASS}`)) {
    img.classList.remove(FORUM_MANUAL_SELECTED_CLASS);
    img.removeAttribute("data-scf-manual-order");
    if (img.dataset.scfManualTitle !== undefined) {
      const original = img.dataset.scfManualTitle;
      if (original) img.title = original;
      else img.removeAttribute("title");
      delete img.dataset.scfManualTitle;
    }
  }

  selected.forEach((img, idx) => {
    if (img.dataset.scfManualTitle === undefined) img.dataset.scfManualTitle = img.title || "";
    img.classList.add(FORUM_MANUAL_SELECTED_CLASS);
    img.dataset.scfManualOrder = String(idx + 1);
    img.title = `Custom comparison #${idx + 1}`;
  });
}

function addForumManualComparisonControl(): void {
  if (!isHDBitsForumPage() || document.getElementById(FORUM_MANUAL_PANEL_ID)) return;
  const title = document.querySelector("h1");
  if (!title) return;

  injectForumManualCSS();

  const selected: HTMLImageElement[] = [];
  let selecting = false;

  const panel = document.createElement("div");
  panel.id = FORUM_MANUAL_PANEL_ID;
  panel.className = "_scf_manual_panel";

  const start = document.createElement("button");
  start.type = "button";
  start.className = "_scf_manual_button";
  start.textContent = "Custom comparison";

  const controls = document.createElement("span");
  controls.className = "_scf_manual_controls";
  controls.hidden = true;

  const colLabel = document.createElement("label");
  colLabel.textContent = "columns ";
  const cols = document.createElement("input");
  cols.type = "number";
  cols.min = "2";
  cols.value = "2";
  cols.className = "_scf_manual_cols";
  colLabel.appendChild(cols);

  const build = document.createElement("button");
  build.type = "button";
  build.className = "_scf_manual_build";
  build.textContent = "Build";

  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "_scf_manual_clear";
  clear.textContent = "Clear";

  const status = document.createElement("span");
  status.className = "_scf_manual_status";
  status.textContent = "0 selected";

  const updateStatus = (message?: string) => {
    status.textContent = message ?? `${selected.length} selected`;
  };

  const setSelecting = (on: boolean) => {
    if (selecting === on) return;
    selecting = on;
    document.body.classList.toggle("_scf_manual_selecting", selecting);
    if (selecting) document.addEventListener("click", onDocumentClick, true);
    else document.removeEventListener("click", onDocumentClick, true);
  };

  const reset = () => {
    selected.splice(0, selected.length);
    updateManualSelectionStyles(selected);
    setSelecting(false);
    controls.hidden = true;
    updateStatus();
  };

  const toggleImage = (img: HTMLImageElement) => {
    const existing = selected.indexOf(img);
    if (existing >= 0) selected.splice(existing, 1);
    else selected.push(img);
    updateManualSelectionStyles(selected);
    updateStatus();
  };

  function onDocumentClick(event: MouseEvent): void {
    const target = event.target;
    if (!(target instanceof HTMLImageElement)) return;
    if (!isSelectableForumImage(target)) return;
    event.preventDefault();
    event.stopPropagation();
    toggleImage(target);
  }

  start.addEventListener("click", () => {
    controls.hidden = false;
    setSelecting(true);
    updateStatus();
  });

  build.addEventListener("click", () => {
    const numCols = Number.parseInt(cols.value, 10);
    if (!(numCols >= 2)) {
      updateStatus("enter 2+ columns");
      return;
    }
    if (selected.length < numCols || selected.length % numCols !== 0) {
      updateStatus(`${selected.length} selected; choose divisible columns`);
      return;
    }

    const rows: GridCell[][] = [];
    for (let i = 0; i < selected.length; i += numCols) {
      rows.push(selected.slice(i, i + numCols).map(forumManualCell));
    }
    const grid: Grid = {
      rows,
      numCols,
      names: Array.from({ length: numCols }, (_, i) => `Source ${i + 1}`),
      anchorEl: panel,
    };
    setSelecting(false);
    updateStatus();
    openWithDummyWrapper(grid);
  });

  clear.addEventListener("click", reset);

  controls.append(colLabel, build, clear, status);
  panel.append(start, controls);
  title.insertAdjacentElement("afterend", panel);
}

export function setupHDBits(): void {
  if (!isHDBitsHost()) return;
  setupHDBitsCore();
}
