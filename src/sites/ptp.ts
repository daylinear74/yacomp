// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  PTP comparison hijack                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS } from "../ui/css";
import { openWithDummyWrapper } from "../viewer";
import type { Grid, GridCell } from "../grid";

function parsePTPOnclick(onclick: string): Grid | null {
  // Extract the two array arguments from:
  //   BBCode.ScreenshotComparisonToggleShow(this, [names], [urls])
  let depth = 0,
    start = -1;
  const arrays: string[] = [];
  for (let i = 0; i < onclick.length; i++) {
    if (onclick[i] === "[") {
      if (depth === 0) start = i;
      depth++;
    }
    if (onclick[i] === "]") {
      depth--;
      if (depth === 0 && start !== -1) {
        arrays.push(onclick.substring(start, i + 1));
        start = -1;
      }
    }
  }
  if (arrays.length < 2) return null;

  try {
    const names = (JSON.parse(arrays[0]) as string[]).map((n) => n.trim());
    const urls = JSON.parse(arrays[1]) as string[];
    if (names.length < 2 || urls.length < names.length) return null;
    if (urls.length % names.length !== 0) return null;

    const numCols = names.length;
    const numRows = urls.length / numCols;
    const rows: GridCell[][] = [];
    for (let r = 0; r < numRows; r++) {
      const row: GridCell[] = [];
      for (let c = 0; c < numCols; c++) {
        row.push({ full: urls[r * numCols + c] });
      }
      rows.push(row);
    }
    return { rows, numCols, names };
  } catch (_) {
    return null;
  }
}

function hijackPTPComparison(ptpContainer: HTMLElement): void {
  // Fallback: parse from PTP's DOM when click intercept didn't catch it
  const ptpRows = ptpContainer.querySelectorAll(
    ".js-screenshot-comparison__row",
  );
  if (!ptpRows.length) return;

  const gridRows: GridCell[][] = [];
  let numCols = 0;

  for (const row of ptpRows) {
    const imgs = row.querySelectorAll(".screenshot-comparison__image") as NodeListOf<HTMLImageElement>;
    const rowData: GridCell[] = [];
    for (const img of imgs) {
      rowData.push({ full: img.src });
    }
    if (rowData.length > 0) {
      gridRows.push(rowData);
      if (numCols === 0) numCols = rowData.length;
    }
  }

  if (gridRows.length === 0 || numCols < 2) return;

  // Try to find names from onclick attributes of trigger links on the page
  let names: string[] | null = null;
  for (const link of document.querySelectorAll(
    'a[onclick*="ScreenshotComparisonToggleShow"]',
  )) {
    const parsed = parsePTPOnclick(link.getAttribute("onclick")!);
    if (parsed && parsed.numCols === numCols) {
      names = parsed.names;
      break;
    }
  }

  const grid: Grid = { rows: gridRows, numCols, names };

  // Hide PTP's comparison
  ptpContainer.style.display = "none";

  openWithDummyWrapper(grid, () => {
    const pw = document.getElementById("wrapper");
    if (pw) pw.classList.remove("hidden");
    ptpContainer.remove();
  });
}

export function setupPTP(): void {
  if (!/passthepopcorn/i.test(location.hostname)) return;
  injectCSS();

  // Primary: intercept comparison trigger clicks in capture phase
  // so the event never reaches PTP's inline onclick handler
  document.addEventListener(
    "click",
    (e) => {
      const link = (e.target as Element).closest(
        'a[onclick*="ScreenshotComparisonToggleShow"]',
      );
      if (!link) return;

      const parsed = parsePTPOnclick(link.getAttribute("onclick")!);
      if (!parsed) return;

      e.stopPropagation();
      e.preventDefault();
      openWithDummyWrapper(parsed);
    },
    true,
  );

  // Fallback: IntersectionObserver catches containers becoming visible,
  // whether pre-rendered (hidden then toggled) or dynamically added
  const compIO = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const c = entry.target as HTMLElement & { _yacomp?: boolean };
      if (c._yacomp) continue;
      c._yacomp = true;
      compIO.unobserve(c);
      hijackPTPComparison(c);
    }
  });

  // Observe any containers already in the DOM (pre-rendered, hidden)
  for (const c of document.querySelectorAll(
    ".screenshot-comparison__container",
  )) {
    compIO.observe(c);
  }

  // Feed dynamically added containers to the IntersectionObserver
  new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if ((node as Element).nodeType !== 1) continue;
        const el = node as Element & { _yacomp?: boolean };
        const c = el.classList?.contains("screenshot-comparison__container")
          ? el
          : el.querySelector?.(".screenshot-comparison__container") as (Element & { _yacomp?: boolean }) | null;
        if (c && !c._yacomp) compIO.observe(c);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
}
