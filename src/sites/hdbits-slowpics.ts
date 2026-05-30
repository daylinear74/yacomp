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

export interface UnclaimedBlock {
  /** Unclaimed HDBits thumbnail <img>s in this block (document order). */
  images: HTMLImageElement[];
  /** Node to insert the "Show comparison" affordance after. */
  anchor: Node;
  /** slow.pics/c key introducing this block, if any (else manual entry). */
  slowpicsKey: string | null;
}

function docOrder(a: Node, b: Node): number {
  if (a === b) return 0;
  return a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1;
}

/** Group unclaimed HDBits screenshots into contiguous blocks. A run breaks at a
 *  claimed image (handled by another grid) and at a slow.pics/c link (which
 *  introduces a new comparison). Each block remembers its slow.pics key (for the
 *  fetch path) or null (for manual column entry). */
export function findUnclaimedBlocks(
  container: Element,
  claimed: Set<HTMLImageElement>,
): UnclaimedBlock[] {
  const nodes = [
    ...container.querySelectorAll<HTMLImageElement>('img[src*="//t.hdbits.org/"]'),
    ...[...container.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((a) => parseSlowPicsKey(a.href)),
  ].sort(docOrder);

  const blocks: UnclaimedBlock[] = [];
  let cur: HTMLImageElement[] = [];
  let key: string | null = null;
  let keyNode: Node | null = null;
  const flush = () => {
    if (cur.length) blocks.push({ images: cur, anchor: keyNode ?? cur[0], slowpicsKey: key });
    cur = [];
  };
  for (const node of nodes) {
    if (node instanceof HTMLAnchorElement) {
      flush(); // a slow.pics link starts a new comparison
      key = parseSlowPicsKey(node.href);
      keyNode = node;
    } else {
      if (claimed.has(node)) { flush(); key = null; keyNode = null; }
      else cur.push(node);
    }
  }
  flush();
  return blocks;
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
