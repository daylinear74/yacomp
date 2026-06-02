// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  PTP comparison hijack                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { injectCSS, injectPTPGridCSS } from "../ui/css";
import { ptpGridImageSize, ptpGridClick } from "../config";
import { openWithDummyWrapper } from "../viewer";
import type { Grid, GridCell } from "../grid";

export function parsePTPOnclick(onclick: string): Grid | null {
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

// ── Inline image grid (the "old-school" folding grid beside Show comparison) ──

// PTP image hosting serves the full screenshot at /i/<id>.<ext> and a thumbnail
// at /t/<id>.<ext>. Anchored to the passthepopcorn.me host so a comparison that
// links to some other image host is left untouched.
const PTP_FULL_IMAGE_RE = /^(https?:\/\/(?:[^/]+\.)?passthepopcorn\.me)\/i\//i;

/** Thumbnail (/t/) form of a PTP image URL; non-PTP URLs are returned as-is. */
export function ptpThumbUrl(full: string): string {
  return full.replace(PTP_FULL_IMAGE_RE, "$1/t/");
}

export interface PTPGridTile {
  /** Always the full image — the tile links out to it in a new tab. */
  href: string;
  /** What renders inline: the thumbnail (default) or the full image. */
  src: string;
}

/** Tile descriptors for the inline grid, in the comparison's image order. */
export function ptpGridTiles(urls: string[], useThumbnail: boolean): PTPGridTile[] {
  return urls.map((full) => ({
    href: full,
    src: useThumbnail ? ptpThumbUrl(full) : full,
  }));
}

/** Flatten a parsed grid's cells back to the original image-URL order. */
function gridImageUrls(grid: Grid): string[] {
  return grid.rows.flatMap((row) => row.map((cell) => cell.full));
}

// Single-glyph "fold a grid" affordance.
const GRID_ICON = "▦"; // ▦

function populatePTPGrid(gridEl: HTMLElement, grid: Grid): void {
  const urls = gridImageUrls(grid);
  const tiles = ptpGridTiles(urls, ptpGridImageSize() === "thumbnail");
  const frag = document.createDocumentFragment();
  tiles.forEach((tile, i) => {
    const a = document.createElement("a");
    a.href = tile.href; // full image — used when "open in new tab" is chosen
    a.target = "_blank";
    a.rel = "noreferrer";
    const row = Math.floor(i / grid.numCols);
    const col = i % grid.numCols;
    a.addEventListener("click", (e) => {
      // Config is read live, so changing the setting affects open grids too.
      if (ptpGridClick() === "tab") return; // let the anchor open a new tab
      e.preventDefault();
      openWithDummyWrapper({ ...grid, initialRow: row, initialCol: col });
    });
    const img = document.createElement("img");
    img.className = "_scf_ptp_grid_img";
    img.loading = "lazy";
    img.src = tile.src;
    a.appendChild(img);
    frag.appendChild(a);
  });
  gridEl.appendChild(frag);
}

type GridLink = HTMLElement & { _scfPtpGrid?: boolean };

/** Add a folding image-grid toggle (and its lazily-built grid) beside one PTP
 *  "Show comparison" link. No-op if the onclick can't be parsed or the link was
 *  already processed. */
function addPTPGridToggle(link: GridLink): void {
  if (link._scfPtpGrid) return;
  const onclick = link.getAttribute("onclick");
  if (!onclick) return;
  const grid = parsePTPOnclick(onclick);
  if (!grid) return;
  link._scfPtpGrid = true;

  const toggle = document.createElement("a");
  toggle.href = "#";
  toggle.className = "_scf_ptp_grid_toggle";
  toggle.title = "Toggle image grid";
  toggle.setAttribute("role", "button");
  toggle.setAttribute("aria-label", "Toggle image grid");
  toggle.setAttribute("aria-expanded", "false");
  toggle.textContent = GRID_ICON;

  const gridEl = document.createElement("div");
  gridEl.className = "_scf_ptp_grid";
  gridEl.style.gridTemplateColumns = `repeat(${grid.numCols}, 1fr)`;

  let populated = false;
  toggle.addEventListener("click", (e) => {
    e.preventDefault();
    const open = gridEl.classList.toggle("_scf_open");
    toggle.classList.toggle("_scf_open", open);
    toggle.setAttribute("aria-expanded", String(open));
    // Lazy: a comparison can carry 50+ shots — only fetch once first expanded.
    if (open && !populated) {
      populated = true;
      populatePTPGrid(gridEl, grid);
    }
  });

  // Order ends up: <link> <toggle> <grid>.
  link.insertAdjacentElement("afterend", gridEl);
  link.insertAdjacentElement("afterend", toggle);
}

/** Scan a subtree for PTP comparison links and attach a grid toggle to each. */
export function injectPTPGrids(root: ParentNode = document): void {
  injectPTPGridCSS();
  for (const link of root.querySelectorAll('a[onclick*="ScreenshotComparisonToggleShow"]')) {
    addPTPGridToggle(link as GridLink);
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

  // Inline image-grid toggles beside each "Show comparison" link. Server-side
  // posts are present at load; the observer below catches AJAX-loaded ones.
  injectPTPGrids(document);
  new MutationObserver((mutations) => {
    for (const { addedNodes } of mutations) {
      for (const node of addedNodes) {
        if ((node as Element).nodeType !== 1) continue;
        const el = node as Element & { matches?: (s: string) => boolean };
        if (el.matches?.('a[onclick*="ScreenshotComparisonToggleShow"]')) {
          addPTPGridToggle(el as GridLink);
        }
        injectPTPGrids(el);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });

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
