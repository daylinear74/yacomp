// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits setup                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS, injectTriggerLinkCSS } from "../ui/css";
import { hdbitsImageClick, hdbitsManualAllThreads } from "../config";
import { getGrids, hdbFull } from "../grid";
import type { Grid, GridCell } from "../grid";
import { hasVsOrPipe, splitNames, looksLikeNames } from "../grid/names";
import { buildComparison, insertLinkAfter, openOrphanSelect, openWithDummyWrapper } from "../viewer";
import { fetchSlowPicsGridInfo, parseSlowPicsKey, slowPicsKeyFromAnchor, type SlowPicsGridInfo } from "./slowpics-source";
import { findSlowPicsComparisons, buildRescueGrid, hasLocalLabelBetween, type SlowPicsComparison } from "./hdbits-slowpics";
import { genericSourceNames } from "../util";

const FORUM_MANUAL_PANEL_ID = "_scf_manual_panel_";
const FORUM_MANUAL_CSS_ID = "_scf_hdbits_manual_css_";
const FORUM_MANUAL_SELECTED_CLASS = "_scf_manual_selected";
const COLUMN_SELECT_CSS_ID = "_scf_hdbits_column_select_css_";

function injectColumnSelectCSS(): void {
  if (document.getElementById(COLUMN_SELECT_CSS_ID)) return;
  const style = document.createElement("style");
  style.id = COLUMN_SELECT_CSS_ID;
  style.textContent = `
    ._scf_column_select {
      font: inherit;
      color: #777;
      color: color-mix(in srgb, currentColor 45%, #999);
      padding: 0 1px;
      margin: 0;
    }
  `;
  document.head.appendChild(style);
}

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

function isBlankTextNode(node: Node | null): boolean {
  return node?.nodeType === Node.TEXT_NODE && !(node.textContent || "").trim();
}

function isBreakNode(node: Node | null): boolean {
  return node?.nodeName === "BR";
}

function isLegacyManualColumnControl(node: Node | null): node is HTMLElement {
  if (!(node instanceof HTMLElement) || node.classList.contains("_scf_column_control")) return false;
  const text = (node.textContent || "").replace(/\s+/g, " ").trim();
  return (
    /^columns:/i.test(text) &&
    !!node.querySelector("._scf_comp_link") &&
    !!node.querySelector('input[type="number"], input[placeholder="cols"]')
  );
}

function removeExistingComparisonLinks(): void {
  for (const control of document.querySelectorAll("._scf_column_control")) {
    control.remove();
  }
  for (const link of [...document.querySelectorAll<HTMLAnchorElement>("._scf_comp_link")]) {
    const wrapper = link.parentElement;
    if (isLegacyManualColumnControl(wrapper)) wrapper.remove();
    else link.remove();
  }
}

function firstGridNode(grid: Grid): Node | null {
  const first = grid.rows[0]?.[0];
  return first?.a ?? first?.img ?? null;
}

function isTorrentDescriptionContainer(container: Element): boolean {
  const details = document.querySelector("table#details");
  return !!details?.contains(container);
}

function previousMeaningfulSibling(node: Node): Node | null {
  for (let previous = node.previousSibling; previous; previous = previous.previousSibling) {
    if (previous.nodeType === Node.COMMENT_NODE) continue;
    if (isBlankTextNode(previous)) continue;
    if (isBreakNode(previous)) continue;
    return previous;
  }
  return null;
}

function isExistingComparisonLink(node: Node | null): node is HTMLAnchorElement {
  return node instanceof HTMLAnchorElement && node.classList.contains("_scf_comp_link");
}

function insertLinkBeforeGridImages(grid: Grid, link: HTMLAnchorElement): boolean {
  const first = firstGridNode(grid);
  const parent = first?.parentNode;
  if (!first || !parent) return false;

  const previousMeaningful = previousMeaningfulSibling(first);
  if (isExistingComparisonLink(previousMeaningful) && previousMeaningful.parentNode === parent) {
    previousMeaningful.replaceWith(link);
    if (link.nextSibling === first) parent.insertBefore(document.createElement("br"), first);
    return true;
  }

  const previous = first.previousSibling;
  if (previous && previous.nodeName !== "BR") {
    parent.insertBefore(document.createElement("br"), first);
  }
  parent.insertBefore(link, first);
  parent.insertBefore(document.createElement("br"), first);
  return true;
}

function insertNodeBeforeImageRun(images: HTMLImageElement[], node: Node, container: HTMLElement): void {
  const first = images[0];
  const firstNode = first ? (first.closest("a[href]") ?? first) : null;
  const parent = firstNode?.parentNode;
  if (!firstNode || !parent) {
    container.insertBefore(node, container.firstChild);
    return;
  }

  let current: Node | null = firstNode.previousSibling;
  while (current && (isBreakNode(current) || isBlankTextNode(current))) {
    const previous = current.previousSibling;
    current.parentNode?.removeChild(current);
    current = previous;
  }

  const previousMeaningful = previousMeaningfulSibling(firstNode);
  if (
    previousMeaningful instanceof HTMLElement &&
    previousMeaningful.classList.contains("_scf_column_control") &&
    previousMeaningful.parentNode === parent
  ) {
    previousMeaningful.replaceWith(node);
    let nextNode: Node | null = node.nextSibling;
    while (nextNode && (isBreakNode(nextNode) || isBlankTextNode(nextNode))) {
      const next = nextNode.nextSibling;
      nextNode.parentNode?.removeChild(nextNode);
      nextNode = next;
    }
    parent.insertBefore(document.createElement("br"), firstNode);
    return;
  }

  const previous = firstNode.previousSibling;
  if (previous && !isBreakNode(previous)) {
    parent.insertBefore(document.createElement("br"), firstNode);
  }
  parent.insertBefore(node, firstNode);
  parent.insertBefore(document.createElement("br"), firstNode);
}

function gridFromCells(cells: GridCell[], cols: number, anchor: Node | null | undefined): Grid | null {
  if (cols < 1 || cols > cells.length || cells.length < 2) return null;
  const rows: GridCell[][] = [];
  for (let i = 0; i < cells.length; i += cols) {
    rows.push(cells.slice(i, i + cols));
  }
  return {
    rows,
    numCols: cols,
    names: cols === 1 ? null : genericSourceNames(cols),
    anchorEl: anchor ?? null,
    gallery: cols === 1,
  };
}

function openImageViewer(cells: GridCell[], anchor: Node | null | undefined, initialRow = 0): void {
  const grid = gridFromCells(cells, 1, anchor);
  if (!grid) return;
  openWithDummyWrapper({ ...grid, initialRow, initialCol: 0 });
}

function isScreenshotLikeImage(img: HTMLImageElement): boolean {
  const src = img.currentSrc || img.src;
  const href = img.closest<HTMLAnchorElement>("a[href]")?.href || "";
  return /\/\/t\.hdbits\.org\//i.test(src) ||
    /\/\/img\.hdbits\.org\//i.test(href) ||
    /\b(?:imgbox\.com|pixhost\.to|imagebam\.com)\b/i.test(href);
}

function elementHasScreenshotImage(el: Element): boolean {
  return [...el.querySelectorAll<HTMLImageElement>("img")].some(isScreenshotLikeImage);
}

function elementHasComparisonControl(el: Element): boolean {
  return [...el.querySelectorAll<HTMLAnchorElement>("._scf_comp_link")]
    .some((link) => link.textContent === "Show comparison");
}

function addManualColumnControlFromCells(
  cells: GridCell[],
  anchor: Node,
  container: HTMLElement,
  images: HTMLImageElement[],
): HTMLAnchorElement {
  injectColumnSelectCSS();
  const wrap = document.createElement("span");
  wrap.className = "_scf_column_control";
  const select = document.createElement("select");
  select.className = "_scf_column_select";
  for (let i = 1; i <= cells.length; i++) {
    const option = document.createElement("option");
    option.value = String(i);
    option.textContent = String(i);
    select.appendChild(option);
  }
  select.value = "1";
  const columnsText = document.createTextNode(" column");
  const link = makeShowComparisonLink("Show Viewer");
  const submit = () => {
    const cols = Number.parseInt(select.value, 10);
    if (!(cols >= 1) || cols > cells.length) return;
    const grid = gridFromCells(cells, cols, anchor);
    if (!grid) return;
    select.blur();
    if (cols === 1) {
      openWithDummyWrapper(grid);
      return;
    }
    buildComparison(grid, container, link);
  };
  select.addEventListener("change", () => {
    columnsText.data = select.value === "1" ? " column" : " columns";
  });
  select.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    submit();
  });
  link.addEventListener("click", (e) => {
    e.preventDefault();
    submit();
  });
  wrap.append(link, " with ", select, columnsText);
  insertNodeBeforeImageRun(images, wrap, container);
  return link;
}

function immediateImagesAfter(node: Node): HTMLImageElement[] {
  const images: HTMLImageElement[] = [];
  for (let cur = node.nextSibling; cur; cur = cur.nextSibling) {
    if (cur.nodeName === "BR") continue;
    if (cur.nodeType === Node.TEXT_NODE && !(cur.textContent || "").trim()) continue;
    const found = cur instanceof HTMLImageElement
      ? [cur]
      : cur instanceof Element
        ? [...cur.querySelectorAll<HTMLImageElement>("img")]
        : [];
    if (!found.length) break;
    images.push(...found);
  }
  return images;
}

function downgradeTrailingTorrentComparisonLinks(): void {
  for (const link of document.querySelectorAll<HTMLAnchorElement>("._scf_comp_link")) {
    if (link.textContent !== "Show comparison" || !isTorrentDescriptionContainer(link)) continue;
    const previous = previousMeaningfulSibling(link);
    if (
      !(previous instanceof Element) ||
      !elementHasScreenshotImage(previous) ||
      elementHasComparisonControl(previous)
    ) {
      continue;
    }
    const images = immediateImagesAfter(link);
    if (images.length < 2) continue;
    const parent = link.parentElement;
    if (!parent) continue;
    link.remove();
    const cells = images.map(forumManualCell);
    addManualColumnControlFromCells(cells, images[0], parent, images);
    images.forEach((img, idx) => {
      onImageClickOpen(img, (img.closest("a") as HTMLAnchorElement | null) ?? undefined, (e) => {
        e.preventDefault();
        openImageViewer(cells, images[0], idx);
      });
    });
  }
}

// One image-click handler per on-page image, across both the getGrids and
// slow.pics-rescue paths.
const wiredImages = new WeakSet<HTMLImageElement>();

function onImageClickOpen(
  img: HTMLImageElement | undefined,
  anchor: HTMLAnchorElement | undefined,
  open: (e: Event) => void,
): void {
  if (!img || wiredImages.has(img)) return;
  wiredImages.add(img);
  (anchor ?? img).addEventListener(
    "click",
    (e) => {
      if (hdbitsImageClick() !== "viewer") return; // leave HDBits' native behavior
      e.preventDefault();
      e.stopPropagation();
      open(e);
    },
    true, // capture, to beat any page-level image handler
  );
}

/** Make each of a comparison's on-page images open the yacomp viewer at that
 *  shot (config `hdbitsImageClick`). The "Show comparison" link still opens the
 *  whole grid; this just adds a per-image entry point at the right row/col.
 *  Read live, so toggling the setting takes effect without a reload. */
function attachGridImageClicks(grid: Grid, container: HTMLElement, link: HTMLAnchorElement): void {
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r];
    for (let c = 0; c < row.length; c++) {
      onImageClickOpen(row[c].img, row[c].a, () => {
        void maybeEnrichNames(grid).then(() => {
          if (grid.partial) openOrphanSelect(grid, container, link);
          else buildComparison({ ...grid, initialRow: r, initialCol: c }, container, link);
        });
      });
    }
  }
}

/** Nearest preceding slow.pics/c key for a DOM node (its comparison's link).
 *  Ownership follows the rescue path's boundary rule: a local text label
 *  between the link and the screenshots means the grid is the DOM parser's own
 *  caption-labeled comparison, and the link — e.g. a NOTES bullet much earlier
 *  in the post pointing at a DIFFERENT comparison — must not rename it. */
function slowPicsKeyBefore(node: Node | null | undefined): string | null {
  if (!node) return null;
  let owner: { key: string; link: HTMLAnchorElement } | null = null;
  for (const a of document.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const key = parseSlowPicsKey(a.href);
    if (!key) continue;
    if (a.compareDocumentPosition(node) & Node.DOCUMENT_POSITION_FOLLOWING) owner = { key, link: a };
    else break;
  }
  if (!owner || hasLocalLabelBetween(owner.link, node)) return null;
  return owner.key;
}

// Names the DOM parser assigns when it couldn't read real source titles —
// safe to overwrite with slow.pics' authoritative column titles.
function namesAreGeneric(names: string[] | null): boolean {
  if (!names) return true;
  return names.every((n) => /^(Source(\s+\d+)?|Filtered|Encode)$/.test(n.trim()));
}

function slowPicsNamesAreUsable(names: string[] | null | undefined): names is string[] {
  if (!names?.length) return false;
  return names.every((name) => {
    const trimmed = name.trim();
    return !!trimmed && !/^unknown$/i.test(trimmed);
  });
}

function slowPicsUsableNames(info: { names: string[]; numCols: number }): string[] | null {
  return slowPicsNamesAreUsable(info.names) ? info.names.slice(0, info.numCols) : null;
}

function imageRangeNode(img: HTMLImageElement): Node {
  return img.closest("a[href]") ?? img;
}

function hasLineBreakBetweenImages(a: HTMLImageElement, b: HTMLImageElement): boolean {
  try {
    const range = document.createRange();
    range.setStartAfter(imageRangeNode(a));
    range.setEndBefore(imageRangeNode(b));
    return !!range.cloneContents().querySelector("br");
  } catch {
    return false;
  }
}

function visualColumnCount(images: HTMLImageElement[]): number | null {
  if (images.length < 2) return null;
  const rows: number[] = [];
  let count = 1;
  for (let i = 0; i < images.length - 1; i++) {
    if (hasLineBreakBetweenImages(images[i], images[i + 1])) {
      rows.push(count);
      count = 1;
    } else {
      count++;
    }
  }
  rows.push(count);
  const cols = rows.length > 1 ? rows[0] : 0;
  return cols >= 2 && rows.every((row) => row === cols) && images.length % cols === 0 ? cols : null;
}

function fallbackColumnCounts(total: number, visualCols: number | null): number[] {
  const preferred = [visualCols ?? 0, 3, 2, 4, 5, 6];
  return [...new Set(preferred)].filter((cols) => cols >= 2 && total % cols === 0);
}

function fallbackSlowPicsInfo(
  images: HTMLImageElement[],
  spLink: HTMLAnchorElement,
  container: HTMLElement,
): SlowPicsGridInfo | null {
  const counts = fallbackColumnCounts(images.length, visualColumnCount(images));
  for (const numCols of counts) {
    const names = headingNamesBeforeLink(spLink, numCols, container);
    if (names) return { names, numCols, imageUrls: [] };
  }
  return null;
}

function hasLocalSlowPicsColumnNames(
  images: HTMLImageElement[],
  spLink: HTMLAnchorElement,
  container: HTMLElement,
): boolean {
  const counts = fallbackColumnCounts(images.length, visualColumnCount(images));
  return counts.some((numCols) => !!headingNamesBeforeLink(spLink, numCols, container));
}

function resolveSlowPicsInfo(
  info: SlowPicsGridInfo | null,
  images: HTMLImageElement[],
  spLink: HTMLAnchorElement,
  container: HTMLElement,
): SlowPicsGridInfo | null {
  const base = info ?? fallbackSlowPicsInfo(images, spLink, container);
  if (!base) return null;
  const localNames = headingNamesBeforeLink(spLink, base.numCols, container);
  const names = localNames ?? slowPicsUsableNames(base);
  return names ? { ...base, names } : null;
}

/** On click, upgrade a grid's generic/absent names with slow.pics column
 *  titles (when the linked comparison has the same column count). */
async function maybeEnrichNames(grid: Grid): Promise<void> {
  if (!namesAreGeneric(grid.names)) return;
  const key = slowPicsKeyBefore(grid.rows[0]?.[0]?.img);
  if (!key) return;
  const info = await fetchSlowPicsGridInfo(key);
  const names = info && info.numCols === grid.numCols ? slowPicsUsableNames(info) : null;
  if (names) grid.names = names;
}

// The setup body without the host guard, so test fixtures can drive the
// detector from any origin (e.g. http://127.0.0.1:4173). Production goes
// through `setupHDBits` below, which keeps the host check intact.
export function setupHDBitsCore(): void {
  injectCSS();
  injectTriggerLinkCSS();
  removeExistingComparisonLinks();
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
    for (const cell of grid.rows.flat()) if (cell.img) claimed.add(cell.img);
    const cells = grid.rows.flat();
    const images = cells.map((cell) => cell.img).filter((img): img is HTMLImageElement => !!img);
    const link = grid.gallery
      ? addManualColumnControlFromCells(cells, grid.anchorEl ?? firstGridNode(grid) ?? container, container as HTMLElement, images)
      : makeShowComparisonLink();
    const open = async (e: Event): Promise<void> => {
      e.preventDefault();
      await maybeEnrichNames(grid);
      // An indivisible set (a comparison-thread OP that dropped a shot, 80402)
      // can't pair up cleanly and the gap may be anywhere, so let the user pick
      // the odd shot(s) to drop first, then build the comparison from the rest.
      if (grid.partial) openOrphanSelect(grid, container as HTMLElement, link);
      else buildComparison(grid, container as HTMLElement, link);
    };
    if (!grid.gallery) link.addEventListener("click", (e) => { void open(e); });

    // Click any recognized HDBits grid image to jump straight into the viewer.
    attachGridImageClicks(grid, container as HTMLElement, link);
    if (grid.gallery) continue;

    if (insertLinkBeforeGridImages(grid, link)) continue;

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
  downgradeTrailingTorrentComparisonLinks();

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
  let sawLine = false;
  const flush = (): boolean => {
    const t = line.replace(/\s+/g, " ").trim();
    line = "";
    if (!t) return false;
    lines.push(t);
    sawLine = true;
    return true;
  };
  let n: Node | null = prevNode(link);
  for (let i = 0; n && n !== root && root.contains(n) && i < 600; i++, n = prevNode(n)) {
    if (n.nodeName === "IMG") break; // reached the previous comparison's images
    if (n.nodeName === "STYLE" || n.nodeName === "SCRIPT") continue;
    if (n.nodeName === "BR") {
      if (!flush() && sawLine) break;
    }
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
  if (isTorrentDescriptionContainer(container) && !hasLocalSlowPicsColumnNames(images, spLink, container)) {
    addManualColumnControl(images, spLink, container);
    const cells = images.map(forumManualCell);
    images.forEach((img, idx) => {
      onImageClickOpen(img, (img.closest("a") as HTMLAnchorElement | null) ?? undefined, () => {
        openImageViewer(cells, spLink, idx);
      });
    });
    return;
  }
  const link = makeShowComparisonLink();
  let resolving = false;
  link.style.display = "block";
  link.style.marginTop = "6px";
  // Warm the ~1s slow.pics fetch on hover so the click feels instant (cached).
  link.addEventListener("mouseenter", () => { void fetchSlowPicsGridInfo(key); });
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    if (resolving) return;
    resolving = true;
    const original = link.textContent;
    link.textContent = "Loading comparison…";
    try {
      const info = await fetchSlowPicsGridInfo(key);
      const resolved = resolveSlowPicsInfo(info, images, spLink, container);
      if (resolved) {
        // slow.pics is authoritative for the column COUNT; prefer the descriptive
        // HDBits heading for the titles when it matches that count. Placeholder
        // / missing titles fall back to the viewer manual-column control below.
        const grid = buildRescueGrid(images, resolved, spLink);
        if (grid) {
          link.textContent = original;
          buildComparison(grid, container, link);
          return;
        }
      }
      link.remove();
      addManualColumnControl(images, spLink, container);
    } finally {
      resolving = false;
    }
  });

  // Click any of this comparison's images to open the viewer at that shot.
  // Rescued comparisons aren't in getGrids, so the column shape is only known
  // after the slow.pics fetch — reshape then, mapping the flat index to row/col.
  images.forEach((img, idx) => {
    onImageClickOpen(img, (img.closest("a") as HTMLAnchorElement | null) ?? undefined, () => {
      void fetchSlowPicsGridInfo(key).then((info) => {
        const resolved = resolveSlowPicsInfo(info, images, spLink, container);
        if (resolved) {
          const grid = buildRescueGrid(images, resolved, spLink);
          if (grid) {
            buildComparison(
              { ...grid, initialRow: Math.floor(idx / grid.numCols), initialCol: idx % grid.numCols },
              container,
              link,
            );
            return;
          }
        }
        openImageViewer(images.map(forumManualCell), spLink, idx);
      });
    });
  });

  insertLinkAfter(spLink, link);
}

/** Last resort: a compact "Show Viewer" control with a columns dropdown. One
 *  column opens a plain viewer gallery; 2+ columns reshape the block as a
 *  manual comparison, allowing a short final row. */
function addManualColumnControl(images: HTMLImageElement[], anchor: Node, container: HTMLElement): void {
  addManualColumnControlFromCells(images.map(forumManualCell), anchor, container, images);
}

function isHDBitsForumPage(): boolean {
  if (/\/forums\//i.test(location.pathname)) return true;
  return Boolean(document.querySelector('h1 a[href^="/forums/"], h1 a[href*="hdbits.org/forums/"]'));
}

// Pure predicate over the H1 breadcrumb's forum anchors, kept DOM-free so the
// comparison-thread rule is unit-testable.
export function forumAnchorsAreComparison(
  anchors: { href: string; text: string }[],
): boolean {
  return anchors.some(
    (a) => /[?&]forumid=40\b/.test(a.href) || a.text.trim() === "Comparisons",
  );
}

// A comparison thread breadcrumbs to the "Comparisons" forum (forumid=40), e.g.
//   <h1>…<a href="/forums/viewforum?forumid=40">Comparisons</a> &gt; [Comparisons] …</h1>
export function isHDBitsComparisonThread(): boolean {
  const h1 = document.querySelector("h1");
  if (!h1) return false;
  const anchors = Array.from(
    h1.querySelectorAll<HTMLAnchorElement>('a[href*="viewforum"]'),
    (a) => ({ href: a.getAttribute("href") || "", text: a.textContent || "" }),
  );
  return forumAnchorsAreComparison(anchors);
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
    ._scf_manual_names {
      width: 16em;
    }
    ._scf_manual_status {
      opacity: 0.85;
    }
    body._scf_manual_selecting .std-content img {
      cursor: crosshair;
      -webkit-user-drag: none;
      user-select: none;
    }
    img.${FORUM_MANUAL_SELECTED_CLASS} {
      outline: 3px solid #4da3ff !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 1px #000 !important;
    }
    ._scf_manual_panel._scf_manual_floating {
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      z-index: 2147483600;
      display: inline-flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 8px;
      margin: 0;
      padding: 8px 12px;
      max-width: 96vw;
      background: #15171c;
      color: #eaeaea;
      border: 1px solid #4da3ff;
      border-radius: 8px;
      box-shadow: 0 8px 28px rgba(0, 0, 0, 0.55);
    }
    ._scf_manual_panel._scf_manual_floating label,
    ._scf_manual_panel._scf_manual_floating ._scf_manual_status {
      color: #eaeaea;
      opacity: 1;
    }
    ::highlight(_scf_manual_title) {
      background-color: #6a4dff;
      color: #fff;
    }
  `;
  document.head.appendChild(style);
}

function isSelectableForumImage(img: HTMLImageElement): boolean {
  const postRoot = document.querySelector(".std-content");
  if (postRoot && !postRoot.contains(img)) return false;
  if (!img.closest("td.comment")) return false;
  if (img.closest(`#${FORUM_MANUAL_PANEL_ID}, .sig, #header, .menu`)) return false;
  const src = img.currentSrc || img.src;
  return Boolean(src) && !/(?:\/\/|\.)flagcounter\.com\//i.test(src);
}

function forumImageFullUrl(img: HTMLImageElement): string {
  const src = img.currentSrc || img.src;
  if (/\/\/t\.hdbits\.org\//i.test(src)) return hdbFull(src);

  const link = img.closest("a[href]") as HTMLAnchorElement | null;
  if (link && !/^javascript:/i.test(link.href)) {
    if (/\/\/img\.hdbits\.org\//i.test(link.href)) {
      // Saved local forum pages only have the downloaded thumbnail asset; keep
      // that preview loadable, while real HDBits pages use the actual full file.
      if (/\/hdbits\/saved-assets\//.test(src)) return src;
      return hdbFull(link.href);
    }
    if (/\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(link.href)) return link.href;
  }
  return src;
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

/** All post images eligible for manual selection, in document order. */
function selectableForumImages(): HTMLImageElement[] {
  return [...document.querySelectorAll<HTMLImageElement>("img")].filter(isSelectableForumImage);
}

/** Comparator that orders two nodes by their position in the document. */
function docOrder(a: Node, b: Node): number {
  if (a === b) return 0;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/** Contiguous runs of selectable images. A run is broken only by substantive
 *  content (a non-blank text line, a heading, or an <hr>); <br>, <a> wrappers
 *  and whitespace are connective and keep a gallery together. */
function forumImageGroups(): HTMLImageElement[][] {
  const root = document.querySelector(".std-content") ?? document.body;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  const groups: HTMLImageElement[][] = [];
  let current: HTMLImageElement[] = [];
  const flush = () => {
    if (current.length) {
      groups.push(current);
      current = [];
    }
  };
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof HTMLImageElement) {
      if (isSelectableForumImage(node)) current.push(node);
    } else if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent ?? "").trim()) flush();
    } else if (node instanceof HTMLElement && (node.tagName === "HR" || /^H[1-6]$/.test(node.tagName))) {
      flush();
    }
  }
  flush();
  return groups;
}

/** The contiguous gallery a given image belongs to. */
function forumGroupOf(img: HTMLImageElement): HTMLImageElement[] {
  for (const group of forumImageGroups()) if (group.includes(img)) return group;
  return [img];
}

/** Selectable images from a to b inclusive, in document order (shift-range). */
function forumImagesBetween(a: HTMLImageElement, b: HTMLImageElement): HTMLImageElement[] {
  const all = selectableForumImages();
  let i = all.indexOf(a);
  let j = all.indexOf(b);
  if (i < 0 || j < 0) return [b];
  if (i > j) [i, j] = [j, i];
  return all.slice(i, j + 1);
}

/** How many images share the clicked image's visual row — the gallery's natural
 *  column count (0 when it can't tell, e.g. a lone image). */
function forumRowWidth(group: HTMLImageElement[], clicked: HTMLImageElement): number {
  const top = clicked.getBoundingClientRect().top;
  const n = group.filter((img) => Math.abs(img.getBoundingClientRect().top - top) <= 4).length;
  return n >= 2 ? n : 0;
}

/** The text line or label under the pointer, for column-name extraction. */
function forumTextUnderPointer(event: MouseEvent): string | null {
  const doc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
  };
  const node: Node | undefined =
    doc.caretRangeFromPoint?.(event.clientX, event.clientY)?.startContainer ??
    doc.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode;
  if (node && node.nodeType === Node.TEXT_NODE && node.parentElement?.closest("td.comment")) {
    const t = (node.textContent ?? "").trim();
    if (t) return t;
  }
  const el = event.target;
  if (el instanceof HTMLElement && !(el instanceof HTMLImageElement) && el.closest("td.comment")) {
    const t = (el.textContent ?? "").trim();
    if (t && t.length <= 200) return t;
  }
  return null;
}

const FORUM_TITLE_HIGHLIGHT = "_scf_manual_title";

/** Paint the chosen title text with the CSS Custom Highlight API so it stays
 *  marked on the page after the native selection is cleared. Returns false when
 *  the API is unavailable (older browsers keep the native selection instead). */
function setForumTitleHighlight(range: Range): boolean {
  const win = window as unknown as {
    CSS?: { highlights?: { set(key: string, highlight: unknown): void } };
    Highlight?: new (range: Range) => unknown;
  };
  if (win.CSS?.highlights && win.Highlight) {
    win.CSS.highlights.set(FORUM_TITLE_HIGHLIGHT, new win.Highlight(range.cloneRange()));
    return true;
  }
  return false;
}

function clearForumTitleHighlight(): void {
  (window as unknown as { CSS?: { highlights?: { delete(key: string): void } } })
    .CSS?.highlights?.delete(FORUM_TITLE_HIGHLIGHT);
}

function addForumManualComparisonControl(): void {
  if (!isHDBitsForumPage() || document.getElementById(FORUM_MANUAL_PANEL_ID)) return;
  // Default to comparison-forum threads only; the "all threads" setting opts in everywhere.
  if (!isHDBitsComparisonThread() && !hdbitsManualAllThreads()) return;
  const title = document.querySelector("h1");
  if (!title) return;

  injectForumManualCSS();

  const selected: HTMLImageElement[] = [];
  let anchor: HTMLImageElement | null = null;
  let selecting = false;
  let dragSelecting = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartImage: HTMLImageElement | null = null;
  let suppressNextClick = false;

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

  const namesLabel = document.createElement("label");
  namesLabel.textContent = "names ";
  const namesInput = document.createElement("input");
  namesInput.type = "text";
  namesInput.className = "_scf_manual_names";
  namesInput.placeholder = "Source | Filtered | Encode";
  namesLabel.appendChild(namesInput);

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
    // While selecting, float the controls as a fixed top bar so they stay
    // reachable as you scroll a long post; the inline trigger button hides.
    panel.classList.toggle("_scf_manual_floating", selecting);
    start.style.display = selecting ? "none" : "";
    if (selecting) {
      document.addEventListener("mousedown", onDocumentMouseDown, true);
      document.addEventListener("mousemove", onDocumentMouseMove, true);
      document.addEventListener("mouseup", onDocumentMouseUp, true);
      document.addEventListener("click", onDocumentClick, true);
    } else {
      document.removeEventListener("mousedown", onDocumentMouseDown, true);
      document.removeEventListener("mousemove", onDocumentMouseMove, true);
      document.removeEventListener("mouseup", onDocumentMouseUp, true);
      document.removeEventListener("click", onDocumentClick, true);
      dragSelecting = false;
      dragMoved = false;
      dragStartImage = null;
      suppressNextClick = false;
      clearForumTitleHighlight();
    }
  };

  const reset = () => {
    selected.splice(0, selected.length);
    anchor = null;
    namesInput.value = "";
    updateManualSelectionStyles(selected);
    setSelecting(false);
    controls.hidden = true;
    updateStatus();
  };

  const refreshSelection = () => {
    updateManualSelectionStyles(selected);
    updateStatus();
  };

  // Selection is kept in document order so rows assemble top-to-bottom,
  // left-to-right regardless of the order images were clicked.
  const setSelection = (imgs: HTMLImageElement[]) => {
    const seen = new Set<HTMLImageElement>();
    const next: HTMLImageElement[] = [];
    for (const candidate of imgs) {
      if (isSelectableForumImage(candidate) && !seen.has(candidate)) {
        seen.add(candidate);
        next.push(candidate);
      }
    }
    next.sort(docOrder);
    selected.splice(0, selected.length, ...next);
    refreshSelection();
  };

  const setColumns = (n: number) => {
    if (n >= 2) cols.value = String(n);
  };

  // Fill the column names (and matching count) from a label, optionally keeping
  // the source text highlighted on the page so the choice is visible.
  const applyTitle = (parts: string[], range?: Range) => {
    namesInput.value = parts.join(" | ");
    setColumns(parts.length);
    updateStatus(`title: ${parts.join(" | ")}`);
    if (range && setForumTitleHighlight(range)) {
      window.getSelection()?.removeAllRanges();
    }
  };

  // A non-collapsed text selection inside the post that parses to 2+ names is a
  // title pick — apply it and mark the text. Returns true when it was used.
  const tryTitleFromSelection = (): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const text = sel.toString().trim();
    if (!text) return false;
    const host = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    if (!host?.closest("td.comment")) return false;
    const parts = splitNames(text);
    if (parts.length < 2 || !looksLikeNames(parts)) return false;
    applyTitle(parts, sel.getRangeAt(0));
    return true;
  };

  // Additive single-image add used by the drag sweep.
  const addImage = (img: HTMLImageElement) => {
    if (selected.includes(img)) return;
    selected.push(img);
    selected.sort(docOrder);
    refreshSelection();
  };

  function imageFromEvent(event: MouseEvent): HTMLImageElement | null {
    for (const target of event.composedPath()) {
      if (target instanceof HTMLImageElement && isSelectableForumImage(target)) return target;
    }
    const pointTarget = document.elementFromPoint(event.clientX, event.clientY);
    if (pointTarget instanceof HTMLImageElement && isSelectableForumImage(pointTarget)) return pointTarget;
    return null;
  }

  function onDocumentMouseDown(event: MouseEvent): void {
    if (event.button !== 0) return;
    const img = imageFromEvent(event);
    if (!img) return;
    event.preventDefault();
    event.stopPropagation();
    dragSelecting = true;
    dragMoved = false;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragStartImage = img;
  }

  function onDocumentMouseMove(event: MouseEvent): void {
    if (!dragSelecting) return;
    const dx = Math.abs(event.clientX - dragStartX);
    const dy = Math.abs(event.clientY - dragStartY);
    const img = imageFromEvent(event);
    if (!dragMoved && (dx > 3 || dy > 3 || (img && img !== dragStartImage))) {
      dragMoved = true;
      suppressNextClick = true;
      if (dragStartImage) addImage(dragStartImage);
    }
    if (!dragMoved) return;
    event.preventDefault();
    event.stopPropagation();
    if (img) addImage(img);
    if (event.clientY < 80) window.scrollBy(0, -24);
    else if (event.clientY > window.innerHeight - 80) window.scrollBy(0, 24);
  }

  function onDocumentMouseUp(event: MouseEvent): void {
    if (!dragSelecting) {
      // Not an image drag — a text selection in the post may be a title pick.
      tryTitleFromSelection();
      return;
    }
    if (dragMoved) {
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = true;
    }
    dragSelecting = false;
    dragMoved = false;
    dragStartImage = null;
  }

  function onDocumentClick(event: MouseEvent): void {
    const img = imageFromEvent(event);
    if (img) {
      event.preventDefault();
      event.stopPropagation();
      if (suppressNextClick) {
        suppressNextClick = false;
        return;
      }
      if (event.metaKey || event.ctrlKey) {
        // Ctrl/⌘-click toggles a single image — fine add or deselect.
        if (selected.includes(img)) setSelection(selected.filter((x) => x !== img));
        else setSelection([...selected, img]);
        anchor = img;
      } else if (event.shiftKey && anchor) {
        // Shift-click adds the range from the anchor to here.
        setSelection([...selected, ...forumImagesBetween(anchor, img)]);
      } else {
        // A plain click selects the whole contiguous gallery.
        const group = forumGroupOf(img);
        setSelection(group);
        anchor = img;
        setColumns(forumRowWidth(group, img));
      }
      return;
    }
    // A click on a text label fills the column names from it.
    const text = forumTextUnderPointer(event);
    if (!text) return;
    const parts = splitNames(text);
    if (parts.length >= 2 && looksLikeNames(parts)) {
      event.preventDefault();
      event.stopPropagation();
      applyTitle(parts);
    }
  }

  start.addEventListener("click", () => {
    controls.hidden = false;
    setSelecting(true);
    updateStatus("click a gallery · Ctrl-click toggles · Shift-click ranges · click a label to name");
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

    let names: string[];
    const typed = namesInput.value.trim();
    if (typed) {
      names = splitNames(typed).map((part) => part.trim()).filter(Boolean);
      if (names.length !== numCols) {
        updateStatus(`names (${names.length}) ≠ columns (${numCols})`);
        return;
      }
    } else {
      names = Array.from({ length: numCols }, (_, i) => `Source ${i + 1}`);
    }

    const rows: GridCell[][] = [];
    for (let i = 0; i < selected.length; i += numCols) {
      rows.push(selected.slice(i, i + numCols).map(forumManualCell));
    }
    const grid: Grid = {
      rows,
      numCols,
      names,
      anchorEl: panel,
    };
    setSelecting(false);
    updateStatus();
    openWithDummyWrapper(grid);
  });

  clear.addEventListener("click", reset);

  controls.append(namesLabel, colLabel, build, clear, status);
  panel.append(start, controls);
  title.insertAdjacentElement("afterend", panel);
}

export function setupHDBits(): void {
  if (!isHDBitsHost()) return;
  setupHDBitsCore();
}
