// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Fieldset comparison hijack (shared: SpringSunday, FRDS)                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// These trackers render a comparison as a <fieldset> whose <legend> ends in a
// comma-separated source list ("…: Source A, Source B"), with the screenshots
// as <a><img> rows separated by <br>. They differ only in their host and in how
// the full-resolution image URL is recovered from a thumbnail — captured in the
// per-site config so the parse/reshape/click logic lives here once.

import { injectCSS } from "../ui/css";
import { openWithDummyWrapper } from "../viewer";
import { cleanText } from "../util";
import type { Grid, GridCell } from "../grid";

export interface FieldsetComparisonConfig {
  /** Hostname(s) this adapter activates on. */
  host: RegExp;
  /** The primary full-resolution URL for a thumbnail (before the shared
   *  proxiedOriginal / src fallbacks). Return "" to fall through. */
  primaryUrl: (anchor: HTMLAnchorElement, img: HTMLImageElement) => string;
}

function parseNames(fieldset: Element): string[] | null {
  const legend = cleanText(fieldset.querySelector("legend")?.textContent || "");
  const match = legend.match(/[:：]\s*(.+)$/);
  if (!match) return null;

  const names = match[1].split(/\s*[,，]\s*/).map(cleanText).filter(Boolean);
  return names.length >= 2 ? names : null;
}

/** A thumbnail proxied as `…?url=<original>` — recover the original. */
function proxiedOriginal(src: string): string | null {
  try {
    return new URL(src, location.href).searchParams.get("url");
  } catch {
    return null;
  }
}

function collectRows(fieldset: Element, config: FieldsetComparisonConfig): GridCell[][] {
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
    const full = config.primaryUrl(a, img) || proxiedOriginal(src) || src;
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

function parseComparison(fieldset: Element, config: FieldsetComparisonConfig): Grid | null {
  const names = parseNames(fieldset);
  if (!names) return null;

  const rows = reshapeRows(collectRows(fieldset, config), names.length);
  if (!rows || !rows.length) return null;

  return { rows, numCols: names.length, names };
}

export function setupFieldsetComparison(config: FieldsetComparisonConfig): void {
  if (!config.host.test(location.hostname)) return;
  injectCSS();

  document.addEventListener(
    "click",
    (e) => {
      if (!(e.target instanceof Element)) return;

      const fieldset = e.target.closest("fieldset");
      if (!fieldset) return;

      const grid = parseComparison(fieldset, config);
      if (!grid) return;

      e.stopPropagation();
      e.preventDefault();
      openWithDummyWrapper(grid);
    },
    true,
  );
}
