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

function collectTextLines(node: ChildNode, lines: string[]): void {
  if (node.nodeName === "BR") {
    lines.push("");
    return;
  }
  if (node.nodeType === 3) {
    lines[lines.length - 1] += node.textContent || "";
    return;
  }
  for (const child of node.childNodes) {
    collectTextLines(child, lines);
  }
}

function textAfterLastBreak(el: Element): string | null {
  const lines = [""];
  collectTextLines(el, lines);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  return nonEmpty[nonEmpty.length - 1] || null;
}

function labelTextFromNode(node: ChildNode): string | null {
  const t = node.nodeType === 1
    ? textAfterLastBreak(node as Element)
    : (node.textContent || "").trim();
  return t ? t.replace(/:$/, "").trim() : null;
}

/** Walk container's childNodes, collecting BR-separated image groups with labels */
function collectGroups(container: Element): GroupsResult | null {
  const groups: GridCell[][] = [];
  const groupLabels: (string | null)[] = [];
  const groupLabelEls: (ChildNode | null)[] = [];
  let group: GridCell[] = [];
  let pendingLabel: string | null = null;
  let pendingLabelEl: ChildNode | null = null;

  const visit = (node: ChildNode): void => {
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
    } else if (node.nodeType === 1 && (node as Element).querySelector("img")) {
      for (const child of node.childNodes) visit(child);
    } else if (!group.length) {
      const t = labelTextFromNode(node);
      if (t) {
        pendingLabel = t;
        pendingLabelEl = node;
      }
    }
  };

  for (const node of container.childNodes) {
    visit(node);
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
  const labeledGroups = groupLabels
    .map((label, index) => ({ label, index }))
    .filter((g): g is { label: string; index: number } => !!g.label && hasVsOrPipe(g.label));
  if (!labeledGroups.length) return null;
  if (groups.length > 1 && labeledGroups.length === 1) return null;

  const results: Grid[] = [];
  for (let i = 0; i < labeledGroups.length; i++) {
    const { label, index } = labeledGroups[i];
    const nextIndex = labeledGroups[i + 1]?.index ?? groups.length;
    const sectionGroups = groups.slice(index, nextIndex);
    const imgs = sectionGroups.flat();
    if (imgs.length < 2) continue;

    const names = splitNames(label);
    if (!names || !looksLikeNames(names))
      continue;

    const shaped = reshapeGrid(sectionGroups, imgs, names);
    if (!shaped) continue;
    results.push({
      rows: shaped.gridRows,
      numCols: shaped.numCols,
      names,
      anchorEl: groupLabelEls[index],
    });
  }
  return results.length ? results : null;
}

function singleGroupLabelInfo(groupLabels: (string | null)[], groupLabelEls: (ChildNode | null)[]): { names: string[]; anchorEl: ChildNode | null } | null {
  const labels = groupLabels
    .map((label, index) => ({ label, index }))
    .filter((g): g is { label: string; index: number } => !!g.label && hasVsOrPipe(g.label));
  if (labels.length !== 1) return null;
  const names = splitNames(labels[0].label);
  return looksLikeNames(names) ? { names, anchorEl: groupLabelEls[labels[0].index] } : null;
}

function leadingBoldLabelInfo(container: Element): { names: string[]; anchorEl: Element } | null {
  const bolds: Element[] = [];
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeName === "STRONG" || node.nodeName === "B") {
      const t = node.textContent!.trim();
      if (t) bolds.push(node as Element);
    }
  }
  if (bolds.length < 2) return null;
  const names = bolds.map((b) => b.textContent!.trim()).filter(Boolean);
  if (!looksLikeNames(names)) return null;
  return { names, anchorEl: bolds[bolds.length - 1] };
}

function hasLocalNonNameHeading(groupLabels: (string | null)[]): boolean {
  const firstImageLabel = groupLabels.find((label) => !!label);
  if (!firstImageLabel) return false;
  if (/^\d+$/.test(firstImageLabel)) return false;
  if (/^(?:screenshots?|screenshot\s+comparison|comparison)$/i.test(firstImageLabel)) return false;
  return !hasVsOrPipe(firstImageLabel);
}

function trimTrailingLabeledSectionAfterSingleGridLabel(collected: GroupsResult): GroupsResult {
  const gridLabelIndexes = collected.groupLabels
    .map((label, index) => ({ label, index }))
    .filter((g): g is { label: string; index: number } => !!g.label && hasVsOrPipe(g.label))
    .map((g) => g.index);
  if (gridLabelIndexes.length !== 1) return collected;

  let sawUnlabeledGridRow = false;
  let sectionIndex = -1;
  for (let i = gridLabelIndexes[0] + 1; i < collected.groupLabels.length; i++) {
    if (!collected.groupLabels[i]) {
      sawUnlabeledGridRow = true;
    } else if (sawUnlabeledGridRow) {
      sectionIndex = i;
      break;
    }
  }

  if (sectionIndex < 0) return collected;
  return {
    groups: collected.groups.slice(0, sectionIndex),
    groupLabels: collected.groupLabels.slice(0, sectionIndex),
    groupLabelEls: collected.groupLabelEls.slice(0, sectionIndex),
  };
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
  let collected = collectGroups(container);
  if (!collected) return null;
  let { groups, groupLabels, groupLabelEls } = collected;

  const multiComp = buildMultiCompGrids(groups, groupLabels, groupLabelEls);
  if (multiComp) return multiComp;

  collected = trimTrailingLabeledSectionAfterSingleGridLabel(collected);
  ({ groups, groupLabels, groupLabelEls } = collected);

  // Prefer per-group text labels over page-level headings.
  // Numeric-only labels (1, 2, 37…) are frame/row indices, not source names —
  // each group is already a row, so skip them and let findComparisonNames run.
  let names: string[] | null = null;
  let anchorEl: ChildNode | null = null;
  if (groupLabels.length >= 2 && groupLabels.every((l) => l)) {
    const allNumeric = groupLabels.every((l) => /^\d+$/.test(l!));
    if (!allNumeric) names = groupLabels as string[];
  }
  if (!names) {
    const singleLabel = singleGroupLabelInfo(groupLabels, groupLabelEls);
    if (singleLabel) {
      names = singleLabel.names;
      anchorEl = singleLabel.anchorEl;
    }
  }
  if (!names) {
    const leadingBold = leadingBoldLabelInfo(container);
    if (leadingBold) {
      names = leadingBold.names;
      anchorEl = leadingBold.anchorEl;
    }
  }
  if (!names && hasLocalNonNameHeading(groupLabels)) {
    return null;
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

  return [{ rows: shaped.gridRows, numCols: shaped.numCols, names, anchorEl }];
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
