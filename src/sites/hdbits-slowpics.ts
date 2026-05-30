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
import { parseSlowPicsKey, type SlowPicsGridInfo } from "./slowpics-source";

export interface SlowPicsRescue {
  key: string;
  /** The slow.pics link that introduces this comparison. */
  link: HTMLAnchorElement;
  /** Unclaimed HDBits thumbnail <img>s belonging to it (document order). */
  images: HTMLImageElement[];
}

function isBefore(a: Node, b: Node): boolean {
  return (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/** Group every unclaimed HDBits screenshot under the nearest preceding
 *  slow.pics/c link. Each group with ≥1 image becomes a rescue candidate. */
export function findSlowPicsRescues(
  container: Element,
  claimed: Set<HTMLImageElement>,
): SlowPicsRescue[] {
  const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")]
    .filter((a) => parseSlowPicsKey(a.href));
  if (!links.length) return [];
  const imgs = [...container.querySelectorAll<HTMLImageElement>('img[src*="//t.hdbits.org/"]')];

  const byLink = new Map<HTMLAnchorElement, HTMLImageElement[]>();
  for (const img of imgs) {
    if (claimed.has(img)) continue;
    // nearest preceding slow.pics link (links are in document order)
    let owner: HTMLAnchorElement | null = null;
    for (const link of links) {
      if (isBefore(link, img)) owner = link;
      else break;
    }
    if (!owner) continue;
    (byLink.get(owner) ?? byLink.set(owner, []).get(owner)!).push(img);
  }

  const rescues: SlowPicsRescue[] = [];
  for (const link of links) {
    const images = byLink.get(link);
    if (images && images.length) {
      rescues.push({ key: parseSlowPicsKey(link.href)!, link, images });
    }
  }
  return rescues;
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
