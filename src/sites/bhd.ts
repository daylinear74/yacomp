// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  BeyondHD comparison hijack                                                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { Grid, GridCell } from "../grid";
import { injectCSS } from "../ui/css";
import { openWithDummyWrapper } from "../viewer";
import { cleanText } from "../util";

export interface BHDScreenCell {
  pair: number;
  item: number;
  src: string;
  title?: string | null;
}

function numericAttr(el: Element, name: string): number | null {
  const value = el.getAttribute(name);
  if (!value || !/^\d+$/.test(value)) return null;
  return Number(value);
}

function launchContainer(launch: Element): Element {
  return launch.closest(".screenParent") || launch;
}

export function parseBHDLaunchNames(text: string, max: number): string[] | null {
  const label = cleanText(text)
    .replace(/\s*\[\s*Show\s*\]\s*$/i, "")
    .replace(/\s+Comparison\s*$/i, "")
    .trim();
  if (!label) return null;

  const names = label.split(/\s*,\s*/).map(cleanText).filter(Boolean);
  return names.length === max ? names : null;
}

function namesFromCells(cells: BHDScreenCell[], max: number): string[] | null {
  const names = new Array<string | null>(max).fill(null);
  for (const cell of cells) {
    if (cell.item < 0 || cell.item >= max) continue;
    const title = cleanText(cell.title || "");
    if (!title) continue;
    names[cell.item] ??= title;
  }

  return names.every((name) => name) ? names as string[] : null;
}

export function buildBHDGridFromCells(
  cells: BHDScreenCell[],
  max: number,
  names: string[] | null,
): Grid | null {
  if (!Number.isInteger(max) || max < 2) return null;
  if (!cells.length) return null;

  const byPair = new Map<number, GridCell[]>();
  for (const cell of cells) {
    if (!cell.src || !Number.isInteger(cell.pair) || !Number.isInteger(cell.item)) return null;
    if (cell.item < 0 || cell.item >= max) return null;

    let row = byPair.get(cell.pair);
    if (!row) {
      row = new Array<GridCell>(max);
      byPair.set(cell.pair, row);
    }
    row[cell.item] = { full: cell.src };
  }

  const rows = [...byPair.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, row]) => row);

  if (
    !rows.length ||
    rows.some((row) => row.length !== max || Array.from({ length: max }, (_, index) => !row[index]).some(Boolean))
  ) {
    return null;
  }

  const validNames = names && names.length === max ? names : namesFromCells(cells, max);
  return { rows, numCols: max, names: validNames };
}

export function parseBHDFrame(frame: Element, launch?: Element | null): Grid | null {
  const launchRoot = launch ? launchContainer(launch) : null;
  const max = (launchRoot && numericAttr(launchRoot, "max")) || numericAttr(frame, "max");
  if (!max) return null;

  const cells: BHDScreenCell[] = [];
  for (const row of frame.querySelectorAll(".screenComparison.sc-container")) {
    for (const imageBox of row.querySelectorAll(".screenImg[item]")) {
      const img = imageBox.querySelector("img") as HTMLImageElement | null;
      const src = img?.currentSrc || img?.src || img?.getAttribute("src") || "";
      const pair = numericAttr(imageBox, "pair") ?? numericAttr(row, "pair");
      const item = numericAttr(imageBox, "item");
      if (!src || pair === null || item === null) continue;

      const title = row.querySelector(`.sc-title[item="${item}"]`)?.textContent || null;
      cells.push({ pair, item, src, title });
    }
  }

  const names = launchRoot ? parseBHDLaunchNames(launchRoot.textContent || "", max) : namesFromCells(cells, max);
  return buildBHDGridFromCells(cells, max, names);
}

function frameForLaunch(launch: Element): Element | null {
  const frameId = launch.getAttribute("frame") || launchContainer(launch).getAttribute("frame");
  if (!frameId) return null;

  const byId = document.getElementById("frame" + frameId);
  if (byId) return byId;

  const root = launch.closest("#screenMain") || document;
  for (const candidate of root.querySelectorAll(".sc-frame")) {
    if (candidate.getAttribute("frame") === frameId) return candidate;
  }
  return null;
}

export function setupBHD(): void {
  if (!/(?:^|\.)beyond-hd\.me$/i.test(location.hostname)) return;
  if (!/^\/(?:library\/title|torrents|forum\/topics)\//.test(location.pathname)) return;
  injectCSS();

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;

      const launch = event.target.closest(".screenLaunch");
      if (!launch) return;

      const frame = frameForLaunch(launch);
      if (!frame) return;

      const grid = parseBHDFrame(frame, launch);
      if (!grid) return;

      event.stopPropagation();
      event.preventDefault();
      openWithDummyWrapper(grid);
    },
    true,
  );
}
