// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HDBits ⇄ slow.pics bridge                                                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Some HDBits comparisons can't be shaped from the DOM alone — most often a flat
// row of N screenshots under a non-source note ("Dirty line fix:") with no column
// markup. When such a block sits next to a slow.pics/c/<key> link, slow.pics knows
// the real column count and titles, so we fetch it and build the grid from that.

import type { Grid, GridCell } from "../grid";
import { hdbFull } from "../grid/parser";
import { slowPicsKeyFromAnchor, type SlowPicsGridInfo } from "./slowpics-source";

export interface SlowPicsComparison {
  key: string;
  /** The slow.pics link that introduces this comparison. */
  link: HTMLAnchorElement;
  /** HDBits screenshots belonging to it: those after this link and before the
   *  next slow.pics link (document order). */
  images: HTMLImageElement[];
}

function isBefore(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** True when a local text label (e.g. "GER:") sits between a slow.pics link and
 *  a screenshot. Such a screenshot carries its own DOM label, so it belongs to
 *  the DOM parser, not to the slow.pics link — per the title-inference order a
 *  local label outranks the adjacent slow.pics collection. */
function hasLocalLabelBetween(link: Node, img: Node): boolean {
  try {
    const range = document.createRange();
    range.setStartAfter(link);
    range.setEndBefore(img);
    return /[A-Za-z]/.test(range.toString());
  } catch {
    return false;
  }
}

/** slow.pics links are authoritative comparison boundaries: each one owns the
 *  HDBits screenshots that follow it (until the next slow.pics link) AND that
 *  have no local label of their own. Returns one entry per slow.pics link that
 *  has ≥1 such image — these define the comparisons, shaped later from the
 *  fetched collection's column count + titles. */
export function findSlowPicsComparisons(container: Element): SlowPicsComparison[] {
  const links: { a: HTMLAnchorElement; key: string }[] = [];
  for (const a of container.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const key = slowPicsKeyFromAnchor(a.href, a.textContent || "");
    if (key) links.push({ a, key });
  }
  if (!links.length) return [];
  const imgs = [...container.querySelectorAll<HTMLImageElement>('img[src*="//t.hdbits.org/"]')];

  const byLink = new Map<HTMLAnchorElement, HTMLImageElement[]>();
  for (const img of imgs) {
    let owner: HTMLAnchorElement | null = null;
    for (const { a } of links) {
      if (isBefore(a, img)) owner = a;
      else break;
    }
    if (!owner) continue;
    // A screenshot with its own local label belongs to the DOM parser, not here.
    if (hasLocalLabelBetween(owner, img)) continue;
    (byLink.get(owner) ?? byLink.set(owner, []).get(owner)!).push(img);
  }

  return links
    .filter(({ a }) => byLink.get(a)?.length)
    .map(({ a, key }) => ({ key, link: a, images: byLink.get(a)! }));
}

/** Reshape rescued HDBits thumbnails into a grid using slow.pics' column count
 *  and titles. Returns null when the image count doesn't fit the column count. */
export function buildRescueGrid(
  images: HTMLImageElement[],
  info: SlowPicsGridInfo,
  anchorEl?: Node | null,
): Grid | null {
  const numCols = info.numCols;
  if (numCols < 2 || images.length < numCols || images.length % numCols !== 0) return null;
  const cells: GridCell[] = images.map((img) => ({
    thumb: img.src,
    full: hdbFull(img.src),
    img,
    a: img.closest("a") as HTMLAnchorElement | undefined,
  }));
  const rows: GridCell[][] = [];
  for (let i = 0; i < cells.length; i += numCols) rows.push(cells.slice(i, i + numCols));
  return { rows, numCols, names: info.names.slice(0, numCols), anchorEl };
}
