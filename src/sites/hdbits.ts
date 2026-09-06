// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits setup                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS, injectTriggerLinkCSS } from "../ui/css";
import { hdbitsImageClick, hdbitsManualAllThreads } from "../config";
import { getGrids, hdbFull, externalImageFullUrl, isTorrentDescriptionContainer, partitionTrailingRemainder } from "../grid";
import type { Grid, GridCell } from "../grid";
import { hasVsOrPipe, splitNames, looksLikeNames, isNonSourceLabel, looksLikeProse, tidyName } from "../grid/names";
import { buildComparison, insertLinkAfter, openOrphanSelect, openWithDummyWrapper } from "../viewer";
import { fetchSlowPicsGridInfo, slowPicsKeyFromAnchor, type SlowPicsGridInfo } from "./slowpics-source";
import {
  findSlowPicsComparisons,
  buildRescueGridPartition,
  hasLocalLabelBetween,
  type SlowPicsComparison,
  type RescueGridPartition,
} from "./hdbits-slowpics";
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
    ._scf_torrent_viewer_sep {
      margin-left: 6px;
      opacity: .4;
      user-select: none;
    }
    ._scf_torrent_viewer_switch {
      display: inline-block;
      vertical-align: middle;
      margin-left: 6px;
      cursor: pointer;
      color: inherit;
      text-decoration: none;
      font-size: 1.15em;
      line-height: 1;
      opacity: .7;
    }
    ._scf_torrent_viewer_switch:hover { opacity: 1; }
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
  for (const node of document.querySelectorAll("._scf_torrent_viewer_sep, ._scf_torrent_viewer_switch")) {
    node.remove();
  }
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

  // Normalize the gap the page happened to carry: exactly ONE blank line
  // between the preceding line (usually the section title) and the link, and
  // NO blank line between the link and the first image.
  let cursor = first.previousSibling;
  while (cursor && (isBreakNode(cursor) || isBlankTextNode(cursor))) {
    const previous = cursor.previousSibling;
    parent.removeChild(cursor);
    cursor = previous;
  }
  if (previousMeaningful && previousMeaningful.parentNode === parent) {
    parent.insertBefore(document.createElement("br"), first);
    parent.insertBefore(document.createElement("br"), first);
  }
  parent.insertBefore(link, first);
  parent.insertBefore(document.createElement("br"), first);
  return true;
}

interface ImageRunInsertion {
  dispose(): void;
}

function insertNodeBeforeImageRun(
  images: HTMLImageElement[],
  node: Node,
  container: HTMLElement,
): ImageRunInsertion {
  const first = images[0];
  const firstNode = first ? (first.closest("a[href]") ?? first) : null;
  const parent = firstNode?.parentNode;
  if (!firstNode || !parent) {
    container.insertBefore(node, container.firstChild);
    return {
      dispose() {
        if (node.isConnected && node.parentNode === container) container.removeChild(node);
      },
    };
  }

  // Preserve the page's exact original spacing so a temporary builder control
  // can put it back. Normal controls live for the page lifetime and simply keep
  // the normalized one-line gap.
  const removedSeparators: Node[] = [];
  let current: Node | null = firstNode.previousSibling;
  while (current && (isBreakNode(current) || isBlankTextNode(current))) {
    const previous = current.previousSibling;
    removedSeparators.unshift(current);
    current.parentNode?.removeChild(current);
    current = previous;
  }

  const previousMeaningful = previousMeaningfulSibling(firstNode);
  const insertedSeparators: HTMLBRElement[] = [];
  const restoreOriginalSpacing = () => {
    for (const separator of insertedSeparators) {
      if (separator.parentNode === parent) separator.remove();
    }
    if (firstNode.parentNode !== parent) return;
    for (const separator of removedSeparators) {
      if (!separator.parentNode) parent.insertBefore(separator, firstNode);
    }
  };
  if (
    previousMeaningful instanceof HTMLElement &&
    previousMeaningful.classList.contains("_scf_column_control") &&
    previousMeaningful.parentNode === parent
  ) {
    const displacedControl = previousMeaningful;
    previousMeaningful.replaceWith(node);
    const separator = document.createElement("br");
    insertedSeparators.push(separator);
    parent.insertBefore(separator, firstNode);
    return {
      dispose() {
        // A newer control may already have replaced this one. Only restore the
        // displaced control while our node is still the connected DOM owner.
        if (!node.isConnected || node.parentNode !== parent || firstNode.parentNode !== parent) return;
        parent.replaceChild(displacedControl, node);
        restoreOriginalSpacing();
      },
    };
  }

  const previous = firstNode.previousSibling;
  if (previous && !isBreakNode(previous)) {
    const separator = document.createElement("br");
    insertedSeparators.push(separator);
    parent.insertBefore(separator, firstNode);
  }
  parent.insertBefore(node, firstNode);
  const separator = document.createElement("br");
  insertedSeparators.push(separator);
  parent.insertBefore(separator, firstNode);
  return {
    dispose() {
      if (!node.isConnected || node.parentNode !== parent || firstNode.parentNode !== parent) return;
      parent.removeChild(node);
      restoreOriginalSpacing();
    },
  };
}

function gridFromCells(cells: GridCell[], cols: number, anchor: Node | null | undefined): Grid | null {
  if (cols < 1 || cols > cells.length || !cells.length) return null;
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

function installSeparateGallery(grid: Grid | null, container: HTMLElement): void {
  if (!grid?.gallery) return;
  const cells = grid.rows.flat();
  const images = cells.map((cell) => cell.img).filter((img): img is HTMLImageElement => !!img);
  if (!images.length) return;
  addManualColumnControlFromCells(
    cells,
    grid.anchorEl ?? images[0],
    container,
    images,
  );
}

function openRescuePartitionAt(
  partition: RescueGridPartition,
  container: HTMLElement,
  link: HTMLAnchorElement,
  initialIndex?: number,
): void {
  installSeparateGallery(partition.remainder, container);
  const comparisonCount = partition.comparison.rows.flat().length;
  if (initialIndex === undefined || initialIndex < comparisonCount) {
    const positioned = initialIndex === undefined
      ? partition.comparison
      : {
          ...partition.comparison,
          initialRow: Math.floor(initialIndex / partition.comparison.numCols),
          initialCol: initialIndex % partition.comparison.numCols,
        };
    buildComparison(positioned, container, link);
    return;
  }
  if (!partition.remainder) return;
  openWithDummyWrapper({
    ...partition.remainder,
    initialRow: initialIndex - comparisonCount,
    initialCol: 0,
  });
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

interface ManualColumnControl {
  element: HTMLSpanElement;
  link: HTMLAnchorElement;
  select: HTMLSelectElement;
  dispose(): void;
}

function addManualColumnControlFromCells(
  cells: GridCell[],
  anchor: Node,
  container: HTMLElement,
  images: HTMLImageElement[],
  initialColumns = 1,
  refreshCells?: () => GridCell[],
): ManualColumnControl {
  injectColumnSelectCSS();
  const previousOpeners = images.map((img) => imageOpeners.get(img));
  const installedOpeners: ImageOpener[] = [];
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
  const startingColumns = Math.max(1, Math.min(initialColumns, cells.length));
  select.value = String(startingColumns);
  const columnsText = document.createTextNode(startingColumns === 1 ? " column" : " columns");
  const link = makeShowComparisonLink("Show Viewer");
  const submit = (initialIndex?: number) => {
    const cols = Number.parseInt(select.value, 10);
    if (!(cols >= 1) || cols > cells.length) return;
    const grid = gridFromCells(refreshCells?.() ?? cells, cols, anchor);
    if (!grid) return;
    const positioned = initialIndex === undefined
      ? grid
      : {
          ...grid,
          initialRow: Math.floor(initialIndex / cols),
          initialCol: initialIndex % cols,
        };
    select.blur();
    if (cols === 1) {
      openWithDummyWrapper(positioned);
      return;
    }
    buildComparison(positioned, container, link);
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
  images.forEach((img, idx) => {
    const openImage = () => submit(idx);
    installedOpeners.push(openImage);
    onImageClickOpen(
      img,
      (img.closest("a") as HTMLAnchorElement | null) ?? undefined,
      openImage,
      true,
    );
  });
  wrap.append(link, " with ", select, columnsText);
  const insertion = insertNodeBeforeImageRun(images, wrap, container);
  return {
    element: wrap,
    link,
    select,
    dispose() {
      insertion.dispose();
      images.forEach((img, idx) => {
        // Do not clobber an opener installed by a newer control/setup pass.
        if (imageOpeners.get(img) !== installedOpeners[idx]) return;
        const previous = previousOpeners[idx];
        if (previous) imageOpeners.set(img, previous);
        else imageOpeners.delete(img);
      });
    },
  };
}

interface TorrentViewerSwitchTarget {
  link: HTMLAnchorElement;
  cells: GridCell[];
  images: HTMLImageElement[];
  anchor: Node;
  container: HTMLElement;
}

interface ComparisonOpenState {
  generation: number;
  inFlightGeneration: number | null;
}

const comparisonOpenStates = new WeakMap<HTMLAnchorElement, ComparisonOpenState>();

function comparisonOpenState(link: HTMLAnchorElement): ComparisonOpenState {
  let state = comparisonOpenStates.get(link);
  if (!state) {
    state = { generation: 0, inFlightGeneration: null };
    comparisonOpenStates.set(link, state);
  }
  return state;
}

function beginComparisonOpen(link: HTMLAnchorElement): number | null {
  const state = comparisonOpenState(link);
  if (state.inFlightGeneration === state.generation) return null;
  state.inFlightGeneration = state.generation;
  return state.generation;
}

function finishComparisonOpen(link: HTMLAnchorElement, generation: number): boolean {
  const state = comparisonOpenState(link);
  if (state.inFlightGeneration !== generation) return false;
  state.inFlightGeneration = null;
  return true;
}

function invalidateComparisonOpens(link: HTMLAnchorElement): void {
  comparisonOpenState(link).generation++;
}

function isCurrentComparisonOpen(link: HTMLAnchorElement, generation: number): boolean {
  return link.isConnected && comparisonOpenState(link).generation === generation;
}

/** Add a compact mode switch beside an inferred torrent/offer comparison. Automatic
 *  detection remains the default, while Viewer mode reuses the existing column
 *  control and can be switched back to the original comparison. */
function addTorrentViewerSwitch(target: TorrentViewerSwitchTarget): void {
  const { link, cells, images, anchor, container } = target;
  if (
    !link.isConnected ||
    !isTorrentDescriptionContainer(link) ||
    images.length < 2
  ) return;
  if (link.nextElementSibling?.classList.contains("_scf_torrent_viewer_sep")) return;
  injectColumnSelectCSS();

  const sep = document.createElement("span");
  sep.className = "_scf_torrent_viewer_sep";
  sep.textContent = "|";
  sep.setAttribute("aria-hidden", "true");

  const toggle = document.createElement("a");
  toggle.href = "#";
  toggle.className = "_scf_torrent_viewer_switch";
  toggle.setAttribute("role", "button");
  toggle.textContent = "⇄";
  const comparisonImageOpeners = images.map((img) => imageOpeners.get(img));
  const comparisonLabel = link.textContent;
  let viewerControl: ManualColumnControl | null = null;
  let viewerColumns = 1;

  const setSwitchDestination = (toViewer: boolean): void => {
    toggle.title = toViewer ? "Switch to Viewer" : "Switch to comparison";
    toggle.setAttribute(
      "aria-label",
      toViewer ? "Switch comparison to Viewer" : "Switch Viewer to comparison",
    );
  };

  const placeSwitchAfter = (element: Element): void => {
    element.insertAdjacentElement("afterend", toggle);
    element.insertAdjacentElement("afterend", sep);
  };

  const switchToViewer = (): void => {
    invalidateComparisonOpens(link);
    link.textContent = comparisonLabel;
    link.remove();
    sep.remove();
    toggle.remove();
    viewerControl = addManualColumnControlFromCells(cells, anchor, container, images, viewerColumns);
    setSwitchDestination(false);
    placeSwitchAfter(viewerControl.element);
  };

  const switchToComparison = (): void => {
    if (!viewerControl) return;
    viewerColumns = Number.parseInt(viewerControl.select.value, 10) || 1;
    viewerControl.element.replaceWith(link);
    viewerControl = null;
    images.forEach((img, idx) => {
      const open = comparisonImageOpeners[idx];
      if (open) imageOpeners.set(img, open);
      else imageOpeners.delete(img);
    });
    setSwitchDestination(true);
  };

  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (viewerControl) switchToComparison();
    else switchToViewer();
  });

  setSwitchDestination(true);
  placeSwitchAfter(link);
}

function immediateImagesAfter(node: Node): HTMLImageElement[] {
  const images: HTMLImageElement[] = [];
  for (let cur = node.nextSibling; cur; cur = cur.nextSibling) {
    if (cur.nodeType === Node.COMMENT_NODE) continue; // a comment doesn't end the run
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
  }
}

// One image-click handler per on-page image, across both the getGrids and
// slow.pics-rescue paths.
type ImageOpener = (e: Event) => void;
const wiredImages = new WeakSet<HTMLImageElement>();
let imageOpeners = new WeakMap<HTMLImageElement, ImageOpener>();
const descriptionFallbackOpeners = new WeakMap<HTMLImageElement, ImageOpener>();
let descriptionClickFallbackInstalled = false;

function onImageClickOpen(
  img: HTMLImageElement | undefined,
  anchor: HTMLAnchorElement | undefined,
  open: (e: Event) => void,
  replace = false,
): void {
  if (!img) return;
  if (wiredImages.has(img)) {
    if (replace || !imageOpeners.has(img)) imageOpeners.set(img, open);
    return;
  }
  wiredImages.add(img);
  imageOpeners.set(img, open);
  (anchor ?? img).addEventListener(
    "click",
    (e) => {
      if (hdbitsImageClick() !== "viewer") return; // leave HDBits' native behavior
      // A single anchor can wrap multiple images. Only dispatch the image
      // actually clicked, not every registered image inside that anchor.
      const clicked = e.target instanceof Element ? e.target.closest("img") : null;
      if ((clicked ?? anchor?.querySelector("img") ?? img) !== img) return;
      const currentOpen = imageOpeners.get(img);
      if (!currentOpen) return;
      if (descriptionFallbackOpeners.get(img) === currentOpen &&
          !descriptionImageContainers().some((root) => root.contains(img))) return;
      e.preventDefault();
      e.stopPropagation();
      currentOpen(e);
    },
    true, // capture, to beat any page-level image handler
  );
}

/** Exact description cells, not the entire #details table (which also holds
 *  cast portraits, subtitle flags, and other site controls). */
function descriptionImageContainers(): HTMLElement[] {
  if (!document.querySelector("div.torrent-title, table#details")) return [];
  const roots = new Set<HTMLElement>();
  for (const label of document.querySelectorAll("div.label")) {
    if (!/^description$/i.test((label.textContent || "").trim())) continue;
    const td = label.closest("td");
    if (td && !td.closest("td.text, td.comment")) roots.add(td);
  }
  const details = document.querySelector("table#details");
  for (const row of details?.querySelectorAll(":scope > tbody > tr, :scope > tr") ?? []) {
    const label = row.querySelector(":scope > td > div.label");
    if (!/^tags$/i.test((label?.textContent || "").trim())) continue;
    const td = row.nextElementSibling?.querySelector<HTMLElement>(":scope > td");
    const nextLabel = td?.querySelector(":scope > div.label");
    if (td && (!nextLabel || /^description$/i.test((nextLabel.textContent || "").trim()))) roots.add(td);
  }
  return [...roots].filter((root) => ![...roots].some((other) => other !== root && other.contains(root)));
}

function descriptionImageCell(img: HTMLImageElement): GridCell {
  const anchor = img.closest<HTMLAnchorElement>("a[href]");
  const imageLink = anchor?.querySelectorAll("img").length === 1 ? anchor : null;
  const responsive = img.hasAttribute("srcset") || img.parentElement?.tagName === "PICTURE";
  const source = img.getAttribute("data-src") || img.getAttribute("data-original") ||
    img.getAttribute("data-lazy-src") || (responsive ? img.currentSrc : img.src) || img.currentSrc || img.src;
  let thumb = source;
  try {
    if (source) thumb = new URL(source, document.baseURI).href;
  } catch {
    // Keep an unresolvable source local to its image.
  }
  const full = imageLink && /\/\/img\.hdbits\.org\//i.test(imageLink.href)
    ? hdbFull(imageLink.href)
    : hdbFull(externalImageFullUrl(thumb, imageLink?.href));
  return { img, a: anchor ?? undefined, thumb, full, width: img.naturalWidth || null, height: img.naturalHeight || null };
}

/** Only collect images without an existing comparison/gallery opener. Prose,
 *  separate paragraph/figure blocks, and blank lines divide fallback groups;
 *  a single row break and inline image wrappers keep a screenshot run intact. */
function unhandledDescriptionImageGroups(root: HTMLElement): HTMLImageElement[][] {
  const groups: HTMLImageElement[][] = [];
  let group: HTMLImageElement[] = [];
  let breaks = 0;
  let block: Element | null = null;
  const flush = () => { if (group.length) groups.push(group); group = []; breaks = 0; block = null; };
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node instanceof Element && node.matches("script, style, noscript, ._scf_column_control, ._scf_comp_link, ._scf_torrent_viewer_sep, ._scf_torrent_viewer_switch")
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (node instanceof HTMLImageElement) {
      if (imageOpeners.has(node)) { flush(); continue; }
      const nextBlock = node.closest("p, figure, .div_showhide");
      if (group.length && nextBlock !== block) flush();
      block = nextBlock;
      group.push(node);
      breaks = 0;
    } else if (node.nodeName === "BR") {
      if (++breaks >= 2) flush();
    } else if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent || "").trim()) flush();
    } else if (node instanceof Element && /^(HR|P|FIGURE|H[1-6])$/.test(node.tagName)) {
      flush();
    }
  }
  flush();
  return groups;
}

function addUnhandledDescriptionViewers(root: HTMLElement): void {
  for (const images of unhandledDescriptionImageGroups(root)) {
    const first = images[0];
    const anchor = first.closest<HTMLAnchorElement>("a[href]");
    const node = anchor ?? first;
    // Inline illustrations/smilies stay clickable without inserting a toolbar
    // and line breaks into their surrounding sentence or technical log.
    const inline = images.length === 1 && (first.closest("pre, code") ||
      [node.previousSibling, node.nextSibling].some((sibling) => sibling?.nodeType === Node.TEXT_NODE && (sibling.textContent || "").trim()));
    if (inline) {
      onImageClickOpen(first, anchor ?? undefined, () => openImageViewer([descriptionImageCell(first)], node));
    } else {
      const refresh = () => images.map(descriptionImageCell);
      const control = addManualColumnControlFromCells(refresh(), node, root, images, 1, refresh);
      if (images.length === 1) control.element.replaceChildren(control.link);
    }
    for (const img of images) descriptionFallbackOpeners.set(img, imageOpeners.get(img)!);
  }
}

function setupDescriptionImageViewers(): void {
  const roots = descriptionImageContainers();
  for (const root of roots) addUnhandledDescriptionViewers(root);
  if (!roots.length || descriptionClickFallbackInstalled) return;
  descriptionClickFallbackInstalled = true;
  // Delegate the last-resort path so images inserted after setup also work.
  // Existing openers always win, including a user's selected Viewer columns.
  document.addEventListener("click", (event) => {
    if (hdbitsImageClick() !== "viewer" || !(event.target instanceof HTMLImageElement)) return;
    const img = event.target;
    const root = descriptionImageContainers().find((container) => container.contains(img));
    if (!root) return;
    if (!imageOpeners.has(img)) addUnhandledDescriptionViewers(root);
    // Reuse registered openers even if a lazy loader moved an image to a new
    // anchor after setup; the old anchor's capture listener cannot follow it.
    const open = imageOpeners.get(img);
    if (!open) return;
    event.preventDefault();
    event.stopPropagation();
    open(event);
  }, true);
}

/** Make each of a comparison's on-page images open the yacomp viewer at that
 *  shot (config `hdbitsImageClick`). The "Show comparison" link still opens the
 *  whole grid; this just adds a per-image entry point at the right row/col.
 *  Read live, so toggling the setting takes effect without a reload. */
function attachGridImageClicks(grid: Grid, container: HTMLElement, link: HTMLAnchorElement): void {
  // The trigger link and every image share one per-link in-flight guard: the
  // enrichment fetch can take ~1s, and mixed entry points must not stack viewers.
  for (let r = 0; r < grid.rows.length; r++) {
    const row = grid.rows[r];
    for (let c = 0; c < row.length; c++) {
      onImageClickOpen(row[c].img, row[c].a, () => {
        const generation = beginComparisonOpen(link);
        if (generation === null) return;
        void maybeEnrichNames(grid)
          .then(() => {
            if (!isCurrentComparisonOpen(link, generation)) return;
            if (grid.partial) openOrphanSelect(grid, container, link);
            else buildComparison({ ...grid, initialRow: r, initialCol: c }, container, link);
          })
          .finally(() => {
            finishComparisonOpen(link, generation);
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
    // HDBits wraps external links as /redir.php?url=<base64> with the real
    // URL in the link text — read both, like every other slow.pics probe.
    const key = slowPicsKeyFromAnchor(a.href, a.textContent || "");
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
  // Capture listeners survive a same-page setup rerun. Start a fresh dispatch
  // map so they receive this run's controls instead of detached old closures.
  imageOpeners = new WeakMap<HTMLImageElement, ImageOpener>();
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
  const torrentViewerSwitches: TorrentViewerSwitchTarget[] = [];
  for (const { grid, container } of getGrids(slowpicsImgs)) {
    for (const cell of grid.rows.flat()) if (cell.img) claimed.add(cell.img);
    const cells = grid.rows.flat();
    const images = cells.map((cell) => cell.img).filter((img): img is HTMLImageElement => !!img);
    const link = grid.gallery
      ? addManualColumnControlFromCells(
          cells,
          grid.anchorEl ?? firstGridNode(grid) ?? container,
          container as HTMLElement,
          images,
        ).link
      : makeShowComparisonLink();
    const open = async (e: Event): Promise<void> => {
      e.preventDefault();
      // A second click while the enrichment fetch is in flight would stack a
      // second viewer over the first.
      const generation = beginComparisonOpen(link);
      if (generation === null) return;
      try {
        await maybeEnrichNames(grid);
        if (!isCurrentComparisonOpen(link, generation)) return;
        // Retain the legacy partial-grid picker for explicit callers. Parsed
        // title-derived grids partition their short final row into a gallery.
        if (grid.partial) openOrphanSelect(grid, container as HTMLElement, link);
        else buildComparison(grid, container as HTMLElement, link);
      } finally {
        finishComparisonOpen(link, generation);
      }
    };
    if (!grid.gallery) link.addEventListener("click", (e) => { void open(e); });

    if (!grid.gallery) {
      torrentViewerSwitches.push({
        link,
        cells,
        images,
        anchor: grid.anchorEl ?? images[0] ?? container,
        container: container as HTMLElement,
      });
    }

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
  for (const target of torrentViewerSwitches) addTorrentViewerSwitch(target);

  // Rescue from slow.pics only the comparisons whose screenshots getGrids did
  // not already shape from a local label.
  for (const comparison of comparisons) {
    if (comparison.images.every((img) => claimed.has(img))) continue;
    addSlowPicsComparisonLink(comparison);
  }
  setupDescriptionImageViewers();
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
    return;
  }
  const cells = images.map(forumManualCell);
  const link = makeShowComparisonLink();
  // insertLinkAfter supplies the line breaks; keep the adjacent switch inline.
  link.style.display = "inline-block";
  link.style.marginTop = "6px";
  // Warm the ~1s slow.pics fetch on hover so the click feels instant (cached).
  link.addEventListener("mouseenter", () => { void fetchSlowPicsGridInfo(key); });
  link.addEventListener("click", async (e) => {
    e.preventDefault();
    const generation = beginComparisonOpen(link);
    if (generation === null) return;
    const original = link.textContent;
    link.textContent = "Loading comparison…";
    try {
      const info = await fetchSlowPicsGridInfo(key);
      if (!isCurrentComparisonOpen(link, generation)) return;
      const resolved = resolveSlowPicsInfo(info, images, spLink, container);
      if (resolved) {
        // slow.pics is authoritative for the column COUNT; prefer the descriptive
        // HDBits heading for the titles when it matches that count. Placeholder
        // / missing titles fall back to the viewer manual-column control below.
        const partition = buildRescueGridPartition(images, resolved, spLink);
        if (partition) {
          openRescuePartitionAt(partition, container, link);
          return;
        }
      }
      link.remove();
      addManualColumnControl(images, spLink, container);
    } finally {
      // Restore the label even when resolving threw, so a transient failure
      // doesn't leave a link stuck on "Loading comparison…".
      if (finishComparisonOpen(link, generation)) {
        link.textContent = original;
      }
    }
  });

  // Click any of this comparison's images to open the viewer at that shot.
  // Rescued comparisons aren't in getGrids, so the column shape is only known
  // after the slow.pics fetch — reshape then, mapping the flat index to row/col.
  images.forEach((img, idx) => {
    onImageClickOpen(img, (img.closest("a") as HTMLAnchorElement | null) ?? undefined, () => {
      const generation = beginComparisonOpen(link);
      if (generation === null) return;
      void fetchSlowPicsGridInfo(key).then((info) => {
        if (!isCurrentComparisonOpen(link, generation)) return;
        const resolved = resolveSlowPicsInfo(info, images, spLink, container);
        if (resolved) {
          const partition = buildRescueGridPartition(images, resolved, spLink);
          if (partition) {
            openRescuePartitionAt(partition, container, link, idx);
            return;
          }
        }
        openImageViewer(cells, spLink, idx);
      }).finally(() => {
        finishComparisonOpen(link, generation);
      });
    });
  });

  insertLinkAfter(spLink, link);
  addTorrentViewerSwitch({
    link,
    cells,
    images,
    anchor: spLink,
    container,
  });
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
      width: auto;
      vertical-align: middle;
    }
    ._scf_manual_panel ._scf_manual_cols_lock {
      margin: 0 0 0 -2px;
      padding: 0 3px;
      border: 1px solid transparent;
      background: transparent;
      font-size: 11px;
      line-height: 1;
      cursor: pointer;
      opacity: 0.7;
      vertical-align: middle;
    }
    ._scf_manual_panel ._scf_manual_cols_lock:hover {
      opacity: 1;
    }
    ._scf_manual_panel ._scf_manual_cols_lock._scf_locked {
      opacity: 1;
      border-color: #4da3ff;
      border-radius: 4px;
    }
    ._scf_manual_names {
      width: 16em;
    }
    ._scf_manual_grouped_label {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      white-space: nowrap;
    }
    ._scf_manual_grouped_label ._scf_manual_grouped {
      margin: 0;
      flex: none;
    }
    ._scf_manual_status {
      opacity: 0.85;
    }
    ._scf_manual_help_wrap {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    ._scf_manual_panel ._scf_manual_help {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 16px;
      height: 16px;
      margin: 0;
      padding: 0;
      border: 1px solid rgba(128, 128, 128, 0.55);
      border-radius: 50%;
      background: transparent;
      color: inherit;
      opacity: 0.6;
      font: 700 10px/1 system-ui, sans-serif;
      cursor: help;
      transition: opacity 0.12s, border-color 0.12s;
    }
    ._scf_manual_panel ._scf_manual_help:hover,
    ._scf_manual_panel ._scf_manual_help:focus-visible {
      opacity: 1;
      border-color: #4da3ff;
      outline: none;
    }
    ._scf_manual_hint {
      position: absolute;
      top: calc(100% + 7px);
      right: 0;
      z-index: 2147483601;
      display: none;
      width: max-content;
      max-width: 280px;
      padding: 7px 10px;
      background: #15171c;
      color: #eaeaea;
      border: 1px solid #4da3ff;
      border-radius: 6px;
      font-size: 11px;
      line-height: 1.45;
      white-space: normal;
      box-shadow: 0 6px 22px rgba(0, 0, 0, 0.55);
    }
    ._scf_manual_help_wrap:hover ._scf_manual_hint,
    ._scf_manual_help:focus-visible + ._scf_manual_hint {
      display: block;
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
      background-color: #e0a32e;
      color: #1a1205;
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
      // Controls inserted by yacomp are not author content and must not split
      // the original image gallery for custom selection. This matters when an
      // automatic parser has already inserted a remainder viewer between the
      // complete comparison rows and their trailing images.
      const parent = node.parentElement;
      if (parent?.closest("._scf_column_control, ._scf_comp_link")) continue;
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
function forumTextUnderPointer(event: MouseEvent): { text: string; range: Range } | null {
  const doc = document as unknown as {
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node } | null;
  };
  const node: Node | undefined =
    doc.caretRangeFromPoint?.(event.clientX, event.clientY)?.startContainer ??
    doc.caretPositionFromPoint?.(event.clientX, event.clientY)?.offsetNode;
  if (node && node.nodeType === Node.TEXT_NODE && node.parentElement?.closest("td.comment, h1")) {
    const t = (node.textContent ?? "").trim();
    if (t) {
      const range = document.createRange();
      range.selectNode(node);
      return { text: t, range };
    }
  }
  // Fallback only to a SMALL inline label element — never a block container,
  // whose textContent would greedily span many lines ("Also here … CZE … Audio").
  const el = event.target;
  if (
    el instanceof HTMLElement &&
    !(el instanceof HTMLImageElement) &&
    el.closest("td.comment, h1") &&
    /^(?:STRONG|B|SPAN|FONT|EM|U|I|A|LABEL)$/.test(el.tagName)
  ) {
    const t = (el.textContent ?? "").trim();
    if (t && t.length <= 60) {
      const range = document.createRange();
      range.selectNodeContents(el);
      return { text: t, range };
    }
  }
  return null;
}

const FORUM_TITLE_HIGHLIGHT = "_scf_manual_title";

/** Paint the chosen title text(s) with the CSS Custom Highlight API so each
 *  picked column stays marked on the page (in its own colour, distinct from the
 *  image-selection outline) after the native selection is cleared. Returns false
 *  when the API is unavailable (older browsers keep the native selection). */
function setForumTitleHighlights(ranges: Range[]): boolean {
  const win = window as unknown as {
    CSS?: { highlights?: { set(key: string, highlight: unknown): void; delete(key: string): void } };
    Highlight?: new (...ranges: Range[]) => unknown;
  };
  if (!win.CSS?.highlights || !win.Highlight) return false;
  if (ranges.length) {
    win.CSS.highlights.set(FORUM_TITLE_HIGHLIGHT, new win.Highlight(...ranges.map((r) => r.cloneRange())));
  } else {
    win.CSS.highlights.delete(FORUM_TITLE_HIGHLIGHT);
  }
  return true;
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
  injectColumnSelectCSS(); // the builder's column dropdown reuses the viewer's select look

  const selected: HTMLImageElement[] = [];
  // Accumulated column titles, with the page range of each pick (for the
  // on-page highlight). A plain click/selection of a label replaces the first
  // column (keeping the rest); Ctrl/⌘-click adds the next column — so picking
  // "USA", then ⌘-clicking "CZE" builds "USA | CZE", and a later plain click
  // rotates the first column. A label that already reads as 2+ names (e.g.
  // "Source vs Encode") replaces the whole title at once. When the column count
  // is LOCKED (the lock toggle), ⌘-click rotates within those fixed slots instead
  // of growing the title; otherwise it adds columns. ⌘-clicking a name already in
  // the title does nothing.
  const titleParts: string[] = [];
  const titleRanges: (Range | null)[] = [];
  let titlePointer = 0;
  let colsLocked = false;
  let anchor: HTMLImageElement | null = null;
  let selecting = false;
  let dragSelecting = false;
  let dragMoved = false;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragStartImage: HTMLImageElement | null = null;
  let suppressNextClick = false;
  let suppressNextClickTimer: number | null = null;

  const clearClickSuppression = () => {
    suppressNextClick = false;
    if (suppressNextClickTimer !== null) {
      window.clearTimeout(suppressNextClickTimer);
      suppressNextClickTimer = null;
    }
  };

  const expireClickSuppressionSoon = () => {
    if (suppressNextClickTimer !== null) window.clearTimeout(suppressNextClickTimer);
    suppressNextClickTimer = window.setTimeout(clearClickSuppression, 0);
  };

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
  const cols = document.createElement("select");
  cols.className = "_scf_manual_cols _scf_column_select";
  colLabel.appendChild(cols);

  // Lock the column count: once on, the dropdown freezes and Ctrl/⌘-clicking a
  // title rotates within these columns instead of adding more.
  const colsLock = document.createElement("button");
  colsLock.type = "button";
  colsLock.className = "_scf_manual_cols_lock";
  colsLock.title = "Lock the column count — Ctrl/⌘-click a title then rotates within these columns instead of adding more";
  colsLock.setAttribute("aria-pressed", "false");
  colsLock.textContent = "🔓";
  const setColsLocked = (locked: boolean) => {
    colsLocked = locked;
    cols.disabled = locked;
    colsLock.textContent = locked ? "🔒" : "🔓";
    colsLock.setAttribute("aria-pressed", String(locked));
    colsLock.classList.toggle("_scf_locked", locked);
  };
  colsLock.addEventListener("click", () => setColsLocked(!colsLocked));

  // The column options are the divisors (≥2) of the current selection, so every
  // one Build-s cleanly. An explicit `preferred` count (an auto-detected row
  // width, or a label's name count picked before the images) is always offered
  // even when it doesn't divide yet — and with nothing selected we still show a
  // sensible default so the dropdown is never empty. Repopulated on every
  // selection change; keeps the current pick when still valid.
  function repopulateColumns(preferred?: number): void {
    if (colsLocked) return; // the count is frozen by the lock toggle
    const total = selected.length;
    const valid: number[] = [];
    for (let c = 2; c <= total; c++) if (total % c === 0) valid.push(c);
    if (preferred !== undefined && preferred >= 2 && !valid.includes(preferred)) {
      valid.push(preferred);
      valid.sort((a, b) => a - b);
    }
    if (valid.length === 0) valid.push(preferred && preferred >= 2 ? preferred : 2);
    const current = Number.parseInt(cols.value, 10);
    const want =
      preferred !== undefined && valid.includes(preferred) ? preferred
      : valid.includes(current) ? current
      : valid[0];
    cols.replaceChildren(
      ...valid.map((c) => {
        const option = document.createElement("option");
        option.value = String(c);
        option.textContent = String(c);
        return option;
      }),
    );
    cols.value = String(want);
  }
  repopulateColumns(); // never leave the dropdown empty before the first selection

  // Source-grouped layout: the poster put each source in its own contiguous
  // block of shots (all of column A, then all of column B) instead of
  // interleaving them row by row. When ticked, Build reads the selection
  // column-major and transposes it; otherwise it chunks the selection into
  // side-by-side rows.
  const groupedLabel = document.createElement("label");
  groupedLabel.className = "_scf_manual_grouped_label";
  groupedLabel.title =
    "Grouped by source: each source's shots are in one contiguous block (all of column A, " +
    "then all of column B) rather than interleaved row by row.";
  const sourceGrouped = document.createElement("input");
  sourceGrouped.type = "checkbox";
  sourceGrouped.className = "_scf_manual_grouped";
  const groupedText = document.createElement("span");
  groupedText.textContent = "grouped by source";
  groupedLabel.append(sourceGrouped, groupedText);

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
  let builtRemainderControl: ManualColumnControl | null = null;

  const clearBuiltRemainder = () => {
    builtRemainderControl?.dispose();
    builtRemainderControl = null;
  };

  // The selection how-to lives behind a "?" hint instead of crowding the bar.
  const helpWrap = document.createElement("span");
  helpWrap.className = "_scf_manual_help_wrap";
  const help = document.createElement("button");
  help.type = "button";
  help.className = "_scf_manual_help";
  help.textContent = "?";
  help.setAttribute("aria-label", "Selection help");
  help.tabIndex = 0;
  help.addEventListener("click", (e) => e.preventDefault());
  const hint = document.createElement("span");
  hint.className = "_scf_manual_hint";
  hint.setAttribute("role", "tooltip");
  hint.textContent =
    "Click a gallery to select it · Ctrl/⌘-click an image toggles it · Shift-click selects a range · " +
    "click (or select) a label to name a column, Ctrl/⌘-click labels to add more columns.";
  helpWrap.append(help, hint);

  const updateStatus = (message?: string) => {
    status.textContent = message ?? `${selected.length} selected`;
  };

  const updateSelectionStatus = (whenEmpty?: string) => {
    if (!selected.length) {
      updateStatus(whenEmpty);
      return;
    }
    const titleColumns = titleParts.length >= 2 ? titleParts.length : 0;
    if (titleColumns && selected.length >= titleColumns) {
      const partition = partitionTrailingRemainder(selected, titleColumns);
      if (partition.remainder.length) {
        updateStatus(
          `${selected.length} selected; ${partition.complete.length} comparison + ` +
          `${partition.remainder.length} separate`,
        );
        return;
      }
    }
    updateStatus();
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
      clearClickSuppression();
      clearForumTitleHighlight();
    }
  };

  const reset = () => {
    clearBuiltRemainder();
    selected.splice(0, selected.length);
    titleParts.splice(0, titleParts.length);
    titleRanges.splice(0, titleRanges.length);
    titlePointer = 0;
    setColsLocked(false);
    anchor = null;
    namesInput.value = "";
    sourceGrouped.checked = false;
    updateManualSelectionStyles(selected);
    setForumTitleHighlights([]);
    setSelecting(false);
    controls.hidden = true;
    updateStatus();
  };

  const refreshSelection = () => {
    updateManualSelectionStyles(selected);
    repopulateColumns(titleParts.length >= 2 ? titleParts.length : undefined);
    updateSelectionStatus();
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
    if (n >= 2) repopulateColumns(n);
  };

  const renderTitle = () => {
    namesInput.value = titleParts.join(" | ");
    // While unlocked, keep the column count in step with the title.
    if (!colsLocked && titleParts.length >= 2) setColumns(titleParts.length);
    updateSelectionStatus(titleParts.length ? `title: ${titleParts.join(" | ")}` : undefined);
    setForumTitleHighlights(titleRanges.filter((r): r is Range => !!r));
  };

  // The column name(s) a clicked/selected bit of text yields: a line that reads
  // as 2+ source names ("Source vs Encode") gives all of them; otherwise a
  // single clean label ("USA") gives one. Prose, URLs and non-source labels
  // (quotes, footers) give nothing.
  const titleNamesFromText = (text: string): string[] => {
    const multi = splitNames(text);
    if (multi.length >= 2 && looksLikeNames(multi)) return multi.map(tidyName).filter(Boolean);
    const single = text.trim();
    if (
      single &&
      single.length <= 48 &&
      !/https?:\/\//i.test(single) &&
      !isNonSourceLabel(single) &&
      !looksLikeProse([single])
    ) {
      const name = tidyName(single);
      if (name) return [name];
    }
    return [];
  };

  const setSlot = (i: number, name: string, range: Range | null) => {
    titleParts[i] = name;
    titleRanges[i] = range;
  };

  // Apply a picked label. A plain pick replaces the whole title when the text is
  // itself a 2+ name comparison, else replaces just the first column (keeping the
  // rest). Ctrl/⌘ adds the next column — rotating within the fixed slots when the
  // count was pinned manually, else growing the title; a name already used is a
  // no-op. Returns true when the title changed.
  const addTitle = (names: string[], append: boolean, range: Range | null): boolean => {
    if (!names.length) return false;
    if (!append) {
      if (names.length >= 2) {
        titleParts.splice(0, titleParts.length, ...names);
        titleRanges.splice(0, titleRanges.length, range, ...names.slice(1).map(() => null));
        titlePointer = names.length;
      } else {
        setSlot(0, names[0], range);
        titlePointer = 1;
      }
      renderTitle();
      return true;
    }
    let changed = false;
    for (const name of names) {
      if (titleParts.includes(name)) continue; // already a column — ⌘-click is a no-op
      if (colsLocked) {
        const n = Number.parseInt(cols.value, 10) || titleParts.length || 2;
        setSlot(titlePointer % n, name, range);
        titlePointer = (titlePointer + 1) % n;
      } else {
        setSlot(titleParts.length, name, range);
        titlePointer = titleParts.length;
      }
      changed = true;
    }
    if (changed) renderTitle();
    return changed;
  };

  // A non-collapsed text selection inside the post is a title pick — lets you
  // grab just part of a line as a column. Ctrl/⌘ adds; otherwise it replaces the
  // first column. Returns true when it was used.
  const tryTitleFromSelection = (append: boolean): boolean => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) return false;
    const text = sel.toString().trim();
    if (!text) return false;
    const host = sel.anchorNode instanceof Element ? sel.anchorNode : sel.anchorNode?.parentElement;
    if (!host?.closest("td.comment, h1")) return false;
    const names = titleNamesFromText(text);
    if (!names.length) return false;
    if (!addTitle(names, append, sel.getRangeAt(0).cloneRange())) return false;
    sel.removeAllRanges();
    return true;
  };

  // Additive single-image add used by the drag sweep.
  const addImage = (img: HTMLImageElement) => {
    if (selected.includes(img)) return;
    selected.push(img);
    selected.sort(docOrder);
    refreshSelection();
  };

  const selectImageFromPointer = (img: HTMLImageElement, event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey) {
      // Ctrl/⌘ toggles a single image — fine add or deselect.
      if (selected.includes(img)) setSelection(selected.filter((x) => x !== img));
      else setSelection([...selected, img]);
      anchor = img;
    } else if (event.shiftKey && anchor) {
      // Shift extends the range from the last anchor to this image.
      setSelection([...selected, ...forumImagesBetween(anchor, img)]);
    } else {
      // A plain pointer action selects the whole contiguous gallery.
      const group = forumGroupOf(img);
      setSelection(group);
      anchor = img;
      setColumns(titleParts.length >= 2 ? titleParts.length : forumRowWidth(group, img));
    }
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
      tryTitleFromSelection(event.metaKey || event.ctrlKey);
      return;
    }
    if (dragMoved) {
      event.preventDefault();
      event.stopPropagation();
      suppressNextClick = true;
      // Some browsers do not dispatch a click after a prevented/off-target
      // drag mouseup. Do not let the one-click guard leak into the user's next
      // independent interaction when there is no generated click to consume.
      expireClickSuppressionSoon();
    } else if (dragStartImage) {
      // Chrome can omit `click` after a previous off-target drag, while still
      // delivering this complete down/up pair. Apply image-selection semantics
      // on the reliable mouseup and consume a generated click if one follows.
      event.preventDefault();
      event.stopPropagation();
      selectImageFromPointer(dragStartImage, event);
      suppressNextClick = true;
      expireClickSuppressionSoon();
    }
    dragSelecting = false;
    dragMoved = false;
    dragStartImage = null;
  }

  function onDocumentClick(event: MouseEvent): void {
    // The click generated by a drag release is not a click — consume it
    // wherever it lands. Clearing only on image hits left the flag armed
    // after a release over whitespace, eating the NEXT real click (and a
    // release over a text label silently overwrote the column title).
    if (suppressNextClick) {
      clearClickSuppression();
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const img = imageFromEvent(event);
    if (img) {
      event.preventDefault();
      event.stopPropagation();
      // Programmatic/synthetic clicks may have no preceding mouseup; retain a
      // click fallback for those while pointer clicks use the reliable path.
      selectImageFromPointer(img, event);
      return;
    }
    // A click on a text label names a column. Plain click sets the first column
    // (or the whole title if the label is itself a 2+ name line); Ctrl/⌘-click
    // appends the next column.
    const picked = forumTextUnderPointer(event);
    if (!picked) return;
    const names = titleNamesFromText(picked.text);
    if (names.length) {
      event.preventDefault();
      event.stopPropagation();
      addTitle(names, event.metaKey || event.ctrlKey, picked.range);
    }
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
    if (selected.length < numCols) {
      updateStatus(`${selected.length} selected; choose at least ${numCols}`);
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

    // Grouped mode treats the selection as equal-size contiguous source
    // blocks. Without explicit source boundaries an indivisible selection
    // cannot be separated safely: trimming a row-major tail first could pair
    // two screenshots from the same source.
    if (sourceGrouped.checked && selected.length % numCols !== 0) {
      updateStatus(`${selected.length} selected; grouped sources need equal image counts`);
      return;
    }

    const partition = typed
      ? partitionTrailingRemainder(selected, numCols)
      : { complete: [...selected], remainder: [] as HTMLImageElement[] };
    if (!typed && selected.length % numCols !== 0) {
      updateStatus(`${selected.length} selected; choose divisible columns or a title`);
      return;
    }
    if (partition.complete.length < numCols) {
      updateStatus(`${selected.length} selected; no complete comparison row`);
      return;
    }

    const rows: GridCell[][] = [];
    if (sourceGrouped.checked) {
      // Column-major: the selection is `numCols` contiguous per-source blocks;
      // transpose so row r pairs the r-th shot of each block.
      const perCol = partition.complete.length / numCols;
      for (let r = 0; r < perCol; r++) {
        const row: GridCell[] = [];
        for (let c = 0; c < numCols; c++) row.push(forumManualCell(partition.complete[c * perCol + r]));
        rows.push(row);
      }
    } else {
      for (let i = 0; i < partition.complete.length; i += numCols) {
        rows.push(partition.complete.slice(i, i + numCols).map(forumManualCell));
      }
    }
    const grid: Grid = {
      rows,
      numCols,
      names,
      anchorEl: panel,
    };
    // A successful build supersedes the prior build's separate Viewer. Its
    // disposer also restores (or removes) the image-click openers it replaced.
    clearBuiltRemainder();
    // Keep the floating toolbar + selection up so closing the viewer returns to
    // the builder for another pass, rather than dropping out of selecting mode.
    if (partition.remainder.length) {
      const remainderContainer = partition.remainder[0].closest("td.comment") as HTMLElement | null;
      if (remainderContainer) {
        const remainderCells = partition.remainder.map(forumManualCell);
        builtRemainderControl = addManualColumnControlFromCells(
          remainderCells,
          partition.remainder[0],
          remainderContainer,
          partition.remainder,
        );
      }
      updateStatus(
        `${selected.length} selected; ${partition.complete.length} comparison + ` +
        `${partition.remainder.length} separate`,
      );
    } else {
      updateStatus();
    }
    openWithDummyWrapper(grid);
  });

  clear.addEventListener("click", reset);

  controls.append(namesLabel, colLabel, colsLock, groupedLabel, build, clear, status, helpWrap);
  panel.append(start, controls);
  title.insertAdjacentElement("afterend", panel);
}

export function setupHDBits(): void {
  if (!isHDBitsHost()) return;
  setupHDBitsCore();
}
