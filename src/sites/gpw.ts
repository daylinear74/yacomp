// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Great Poster Wall comparison hijack                                      ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { Grid, GridCell } from "../grid";
import { injectCSS } from "../ui/css";
import { openWithDummyWrapper } from "../viewer";
import { cleanText } from "../util";

export function parseGPWNames(text: string): string[] | null {
  const label = cleanText(text).replace(/:$/, "").trim();
  if (!label) return null;

  const names = label.split(/\s*,\s*/).map(cleanText).filter(Boolean);
  return names.length >= 2 ? names : null;
}

export function buildGPWGridFromRows(
  rowUrls: string[][],
  names: string[] | null,
): Grid | null {
  if (!rowUrls.length) return null;

  const numCols = rowUrls[0].length;
  if (numCols < 2) return null;

  const rows: GridCell[][] = [];
  for (const row of rowUrls) {
    if (row.length !== numCols || row.some((src) => !src)) return null;
    rows.push(row.map((full) => ({ full })));
  }

  return {
    rows,
    numCols,
    names: names && names.length === numCols ? names : null,
  };
}

function namesFromComparisonBlock(block: Element): string[] | null {
  return parseGPWNames(block.querySelector(".title")?.textContent || "");
}

function imageSrc(img: HTMLImageElement): string {
  return img.currentSrc ||
    img.src ||
    img.dataset.src ||
    img.getAttribute("data-src") ||
    img.getAttribute("src") ||
    "";
}

function nativeTitleNames(root: Element, numCols: number): string[] | null {
  const titles = [...root.querySelectorAll(".ScreenshotComparison-title")]
    .map((el) => cleanText(el.textContent || ""))
    .filter(Boolean);

  if (titles.length === numCols) return titles;
  if (titles.length > numCols) {
    const firstRow = titles.slice(0, numCols);
    if (firstRow.length === numCols) return firstRow;
  }
  return null;
}

export function parseGPWNativeComparison(root: Element, names: string[] | null = null): Grid | null {
  const rowUrls: string[][] = [];

  for (const row of root.querySelectorAll(".ScreenshotComparison-row")) {
    const urls: string[] = [];
    const seen = new Set<string>();
    const images = row.querySelectorAll(
      "img.ScreenshotComparison-image, .ScreenshotComparison-image img",
    ) as NodeListOf<HTMLImageElement>;
    for (const img of images) {
      const src = imageSrc(img);
      if (!src || seen.has(src)) continue;
      seen.add(src);
      urls.push(src);
    }
    if (urls.length) rowUrls.push(urls);
  }

  const grid = buildGPWGridFromRows(rowUrls, names);
  if (!grid) return null;

  if (!grid.names) grid.names = nativeTitleNames(root, grid.numCols);
  return grid;
}

export function setupGPW(): void {
  if (!/(?:^|\.)greatposterwall\.com$/i.test(location.hostname)) return;
  if (location.pathname !== "/torrents.php") return;
  injectCSS();

  let pendingNames: string[] | null = null;
  let pendingAt = 0;

  document.addEventListener(
    "click",
    (event) => {
      if (!(event.target instanceof Element)) return;

      const link = event.target.closest(".comparison a");
      if (!link) return;

      pendingNames = namesFromComparisonBlock(link.closest(".comparison")!);
      pendingAt = Date.now();
      setTimeout(() => scanNativeComparisons(), 0);
      setTimeout(() => scanNativeComparisons(), 100);
    },
    true,
  );

  function maybeReplaceNative(root: Element): void {
    const marked = root as Element & { _yacomp?: boolean };
    if (marked._yacomp) return;

    const freshNames = Date.now() - pendingAt < 5000 ? pendingNames : null;
    const grid = parseGPWNativeComparison(root, freshNames);
    if (!grid) return;

    marked._yacomp = true;
    const native = root as HTMLElement;
    native.style.display = "none";
    openWithDummyWrapper(grid, () => native.remove());
  }

  function scanNativeComparisons(root: ParentNode = document): void {
    for (const native of root.querySelectorAll(".ScreenshotComparison")) {
      maybeReplaceNative(native);
    }
  }

  new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if (node.nodeType !== 1) continue;
        const el = node as Element;
        const parentNative = el.closest(".ScreenshotComparison");
        if (parentNative) maybeReplaceNative(parentNative);
        if (el.classList.contains("ScreenshotComparison")) maybeReplaceNative(el);
        scanNativeComparisons(el);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

  scanNativeComparisons();
}
