// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  UNIT3D comparison hijack                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { siteEnabled, type SiteKey } from "../config";
import { injectCSS } from "../ui/css";
import { openWithDummyWrapper } from "../viewer";
import type { Grid, GridCell } from "../grid";

const UNIT3D_HOST_RE = /(?:^|\.)((blutopia|aither)\.cc)$/i;

function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").replace(/:$/, "").trim();
}

function namesFromText(root: Element): string[] | null {
  const textEl = root.querySelector(".comparison__text");
  if (!textEl) return null;

  const clone = textEl.cloneNode(true) as Element;
  clone.querySelector(".comparison__button")?.remove();
  const text = cleanText(clone.textContent || "");
  if (!text) return null;

  const parts = text.split(/\s+vs\.?\s+/i).map(cleanText).filter(Boolean);
  return parts.length >= 2 ? parts : null;
}

export function parseUnit3DComparison(root: Element): Grid | null {
  const rows: GridCell[][] = [];
  let numCols = 0;

  for (const row of root.querySelectorAll(".comparison__screenshots .comparison__row")) {
    const rowCells: GridCell[] = [];
    for (const img of row.querySelectorAll("img.comparison__image") as NodeListOf<HTMLImageElement>) {
      const full = img.currentSrc || img.src || img.getAttribute("src");
      if (full) rowCells.push({ full });
    }
    if (!rowCells.length) continue;
    if (numCols === 0) numCols = rowCells.length;
    if (rowCells.length !== numCols) return null;
    rows.push(rowCells);
  }

  if (!rows.length || numCols < 2) return null;

  const captionNames = [
    ...root.querySelectorAll(".comparison__screenshots .comparison__row:first-of-type .comparison__figcaption"),
  ].map((el) => cleanText(el.textContent || "")).filter(Boolean);
  const names = captionNames.length === numCols ? captionNames : namesFromText(root);

  return { rows, numCols, names: names && names.length === numCols ? names : null };
}

const HOST_SITE_KEY: Record<string, SiteKey> = {
  blutopia: "blutopia",
  aither: "aither",
};

export function setupUnit3D(): void {
  const m = location.hostname.match(UNIT3D_HOST_RE);
  if (!m) return;
  const key = HOST_SITE_KEY[m[2].toLowerCase()];
  if (key && !siteEnabled(key)) return;
  injectCSS();

  document.addEventListener(
    "click",
    (e) => {
      const button = (e.target as Element).closest(".comparison__button");
      if (!button) return;

      const root = button.closest(".comparison");
      if (!root) return;

      const grid = parseUnit3DComparison(root);
      if (!grid) return;

      e.stopPropagation();
      e.preventDefault();
      openWithDummyWrapper(grid);
    },
    true,
  );
}
