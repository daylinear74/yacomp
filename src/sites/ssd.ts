// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Spring Sunday comparison hijack                                           ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS } from "../ui/css";
import { openWithDummyWrapper } from "../viewer";
import type { Grid, GridCell } from "../grid";

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function parseSSDNames(fieldset: Element): string[] | null {
  const legend = cleanText(fieldset.querySelector("legend")?.textContent || "");
  const match = legend.match(/[:：]\s*(.+)$/);
  if (!match) return null;

  const names = match[1].split(/\s*[,，]\s*/).map(cleanText).filter(Boolean);
  return names.length >= 2 ? names : null;
}

function proxiedOriginal(src: string): string | null {
  try {
    return new URL(src, location.href).searchParams.get("url");
  } catch (_) {
    return null;
  }
}

function collectSSDRows(fieldset: Element): GridCell[][] {
  const rows: GridCell[][] = [];
  let row: GridCell[] = [];

  function flushRow() {
    if (!row.length) return;
    rows.push(row);
    row = [];
  }

  for (const node of fieldset.childNodes) {
    if (node.nodeName === "BR") {
      flushRow();
      continue;
    }
    if (node.nodeType !== 1) continue;

    const a = node as HTMLAnchorElement;
    if (!a.matches("a")) continue;

    const img = a.querySelector("img") as HTMLImageElement | null;
    if (!img) continue;

    const src = img.currentSrc || img.src || img.getAttribute("src") || "";
    const full = img.dataset.originalUrl || img.getAttribute("data-original-url") || proxiedOriginal(src) || src;
    if (full) row.push({ full });
  }

  flushRow();
  return rows;
}

function reshapeRows(rows: GridCell[][], numCols: number): GridCell[][] | null {
  const cells = rows.flat();
  if (cells.length < numCols || cells.length % numCols !== 0) return null;

  const reshaped: GridCell[][] = [];
  for (let i = 0; i < cells.length; i += numCols) {
    reshaped.push(cells.slice(i, i + numCols));
  }
  return reshaped;
}

function parseSSDComparison(fieldset: Element): Grid | null {
  const names = parseSSDNames(fieldset);
  if (!names) return null;

  const rows = reshapeRows(collectSSDRows(fieldset), names.length);
  if (!rows || !rows.length) return null;

  return { rows, numCols: names.length, names };
}

export function setupSSD(): void {
  if (!/(?:^|\.)springsunday\.net$/i.test(location.hostname)) return;
  injectCSS();

  document.addEventListener(
    "click",
    (e) => {
      if (!(e.target instanceof Element)) return;

      const fieldset = e.target.closest("fieldset");
      if (!fieldset) return;

      const grid = parseSSDComparison(fieldset);
      if (!grid) return;

      e.stopPropagation();
      e.preventDefault();
      openWithDummyWrapper(grid);
    },
    true,
  );
}
