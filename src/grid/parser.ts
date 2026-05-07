// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Grid parsing                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { GridCell, Grid } from "./types";
import {
  hasVsOrPipe, splitNames, looksLikeNames,
  findComparisonNames,
} from "./names";

function hdbFull(src: string): string {
  return src.replace(
    /\/\/t(\.hdbits\.org\/[^.?]+)\.jpg(\?.*)?$/i,
    "//i$1.png",
  );
}

interface GroupsResult {
  groups: GridCell[][];
  groupLabels: (string | null)[];
  groupLabelEls: (ChildNode | null)[];
}

/** Walk container's childNodes, collecting BR-separated image groups with labels */
function collectGroups(container: Element): GroupsResult | null {
  const groups: GridCell[][] = [];
  const groupLabels: (string | null)[] = [];
  const groupLabelEls: (ChildNode | null)[] = [];
  let group: GridCell[] = [];
  let pendingLabel: string | null = null;
  let pendingLabelEl: ChildNode | null = null;
  for (const node of container.childNodes) {
    if (node.nodeName === "BR") {
      if (group.length) {
        groups.push(group);
        groupLabels.push(pendingLabel);
        groupLabelEls.push(pendingLabelEl);
        group = [];
        pendingLabel = null;
        pendingLabelEl = null;
      }
    } else if (node.nodeName === "A") {
      const img = (node as Element).querySelector("img") as HTMLImageElement | null;
      if (img) {
        const isHdb = /\/\/t\.hdbits\.org\//i.test(img.src);
        const full = isHdb
          ? hdbFull(img.src)
          : /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test((node as HTMLAnchorElement).href)
            ? (node as HTMLAnchorElement).href
            : img.src;
        group.push({ thumb: img.src, full, a: node as HTMLAnchorElement, img });
      }
    } else if (!group.length) {
      const t = (node.textContent || "").trim();
      if (t) {
        pendingLabel = t.replace(/:$/, "").trim();
        pendingLabelEl = node;
      }
    }
  }
  if (group.length) {
    groups.push(group);
    groupLabels.push(pendingLabel);
    groupLabelEls.push(pendingLabelEl);
  }
  if (!groups.length) return null;
  const allImages = groups.flat();
  if (allImages.length < 2) return null;
  return { groups, groupLabels, groupLabelEls };
}

/** When groups carry their own vs/| labels, each becomes its own grid */
function buildMultiCompGrids(groups: GridCell[][], groupLabels: (string | null)[], groupLabelEls: (ChildNode | null)[]): Grid[] | null {
  const hasVsLabels = groupLabels.some(
    (l) => l && hasVsOrPipe(l),
  );
  if (!hasVsLabels) return null;

  const results: Grid[] = [];
  for (let gi = 0; gi < groups.length; gi++) {
    const label = groupLabels[gi];
    const imgs = groups[gi];
    if (!label || imgs.length < 2) continue;
    if (!hasVsOrPipe(label)) continue;

    const names = splitNames(label);
    if (!names || !looksLikeNames(names) || imgs.length % names.length !== 0)
      continue;

    const numCols = names.length;
    const gridRows: GridCell[][] = [];
    for (let i = 0; i < imgs.length; i += numCols) {
      gridRows.push(imgs.slice(i, i + numCols));
    }
    results.push({
      rows: gridRows,
      numCols,
      names,
      anchorEl: groupLabelEls[gi] as Element | null,
    });
  }
  return results.length ? results : null;
}

/** Reshape groups into a grid based on name count */
function reshapeGrid(groups: GridCell[][], allImages: GridCell[], names: string[] | null): { numCols: number; gridRows: GridCell[][] } | null {
  const firstLen = groups[0].length;
  const isProperGrid =
    groups.length >= 2 &&
    firstLen >= 2 &&
    groups.every((g) => g.length === firstLen);

  let numCols: number, gridRows: GridCell[][];

  if (isProperGrid) {
    if (
      names &&
      names.length >= 2 &&
      names.length !== firstLen &&
      allImages.length % names.length === 0
    ) {
      numCols = names.length;
      if (names.length === groups.length) {
        gridRows = [];
        for (let r = 0; r < firstLen; r++) {
          gridRows.push(groups.map((g) => g[r]));
        }
      } else {
        gridRows = [];
        for (let i = 0; i < allImages.length; i += numCols) {
          gridRows.push(allImages.slice(i, i + numCols));
        }
      }
    } else {
      numCols = firstLen;
      gridRows = groups;
    }
  } else {
    if (
      names &&
      names.length >= 2 &&
      allImages.length >= names.length &&
      allImages.length % names.length === 0
    ) {
      numCols = names.length;
    } else {
      return null;
    }
    gridRows = [];
    for (let i = 0; i < allImages.length; i += numCols) {
      gridRows.push(allImages.slice(i, i + numCols));
    }
  }

  if (!gridRows.length || numCols < 2) return null;
  return { numCols, gridRows };
}

export function parseGrid(container: Element): Grid[] | null {
  const collected = collectGroups(container);
  if (!collected) return null;
  const { groups, groupLabels, groupLabelEls } = collected;

  const multiComp = buildMultiCompGrids(groups, groupLabels, groupLabelEls);
  if (multiComp) return multiComp;

  // Prefer per-group text labels over page-level headings.
  // Numeric-only labels (1, 2, 37…) are frame/row indices, not source names —
  // each group is already a row, so skip them and let findComparisonNames run.
  let names: string[] | null = null;
  if (groupLabels.length >= 2 && groupLabels.every((l) => l)) {
    const allNumeric = groupLabels.every((l) => /^\d+$/.test(l!));
    if (!allNumeric) names = groupLabels as string[];
  }
  if (!names) {
    names = findComparisonNames(container);
  }

  const shaped = reshapeGrid(groups, groups.flat(), names);
  if (!shaped) return null;

  // Fallback: match strong count to numCols
  if (!names) {
    let el: Element | null = container;
    for (let up = 0; up < 5 && el; up++, el = el.parentElement) {
      const strongs = el.querySelectorAll("strong");
      if (!strongs.length) continue;
      const candidates = [...strongs]
        .map((s) => s.textContent!.trim())
        .filter((t) => t && !/^(comparison|preview|screenshots?)$/i.test(t));
      if (candidates.length === shaped.numCols) {
        names = candidates;
        break;
      }
    }
  }

  return [{ rows: shaped.gridRows, numCols: shaped.numCols, names }];
}

let _grids: { grid: Grid; container: Element }[] | null = null;
export function getGrids(): { grid: Grid; container: Element }[] {
  if (_grids) return _grids;
  _grids = [];
  const seen = new Set<Element>();
  for (const img of document.querySelectorAll(
    'img[src*="//t.hdbits.org/"]',
  )) {
    const a = img.closest("a");
    if (!a) continue;
    const c = a.parentElement;
    if (!c || seen.has(c)) continue;
    seen.add(c);
    const parsed = parseGrid(c);
    if (parsed) {
      for (const grid of parsed) {
        _grids.push({ grid, container: c });
      }
    }
  }
  return _grids;
}
