// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  slow.pics setup                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { openWithDummyWrapper } from "../viewer";
import type { GridCell, GridInitialZoom } from "../grid";

type SlowPicsCanvasMode = "none" | "fit-width" | "fit-height";

interface SlowPicsImage {
  name: string;
  publicFileName: string;
  width?: number | null;
  height?: number | null;
}

interface SlowPicsComparison {
  key?: string;
  images: SlowPicsImage[];
}

interface SlowPicsCollection {
  canvasMode?: SlowPicsCanvasMode | string | null;
  comparisons: SlowPicsComparison[];
}

interface SlowPicsPositionHints {
  comparisonKey?: string | null;
  publicFileName?: string | null;
  imageName?: string | null;
  activeImageIndex?: number | null;
}

interface SlowPicsDomReader {
  getElementById(id: string): Element | null;
  querySelector(selector: string): Element | null;
}

interface SlowPicsLocationReader {
  pathname: string;
  search: string;
}

declare global {
  interface Window {
    unsafeWindow?: Window;
    collection?: SlowPicsCollection;
  }
}

function parsePublicFileName(value: string | null | undefined): string | null {
  if (!value) return null;
  const clean = value.split("#", 1)[0].split("?", 1)[0];
  const fileName = clean.split("/").filter(Boolean).pop();
  return fileName || null;
}

function parseComparisonKeyFromPath(pathname: string): string | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "c" || !parts[1]) return null;
  return decodeURIComponent(parts[1]);
}

function parseImageIndexFromDropdownId(id: string | null | undefined): number | null {
  const match = /^dropdown-image-(\d+)$/.exec(id || "");
  if (!match) return null;
  return Number.parseInt(match[1], 10);
}

function comparisonIndexByKey(
  collection: SlowPicsCollection,
  key: string | null | undefined,
): number | null {
  if (!key) return null;
  const idx = collection.comparisons.findIndex((comparison) => comparison.key === key);
  return idx >= 0 ? idx : null;
}

export function findSlowPicsPosition(
  collection: SlowPicsCollection,
  hints: SlowPicsPositionHints,
): { row: number; col: number } | null {
  const publicFileName = parsePublicFileName(hints.publicFileName);
  if (publicFileName) {
    for (let row = 0; row < collection.comparisons.length; row++) {
      const col = collection.comparisons[row].images.findIndex(
        (image) => parsePublicFileName(image.publicFileName) === publicFileName,
      );
      if (col >= 0) return { row, col };
    }
  }

  const row = comparisonIndexByKey(collection, hints.comparisonKey);
  if (row !== null) {
    const images = collection.comparisons[row].images;
    if (hints.imageName) {
      const col = images.findIndex((image) => image.name === hints.imageName);
      if (col >= 0) return { row, col };
    }
    if (
      hints.activeImageIndex !== null &&
      hints.activeImageIndex !== undefined &&
      hints.activeImageIndex >= 0 &&
      hints.activeImageIndex < images.length
    ) {
      return { row, col: hints.activeImageIndex };
    }
    return { row, col: 0 };
  }

  return null;
}

export function readSlowPicsCurrentPosition(
  collection: SlowPicsCollection,
  dom: SlowPicsDomReader = document,
  pageLocation: SlowPicsLocationReader = location,
): { row: number; col: number } | null {
  const image = dom.getElementById("image") as HTMLImageElement | null;
  const activeImage = dom.querySelector("#images-dropdown .dropdown-item.active") as HTMLElement | null;
  const activeComparison = dom.querySelector(
    "#comparisons-dropdown .dropdown-item.active, #preview a.preview-active",
  ) as HTMLAnchorElement | null;
  const activeComparisonPath = activeComparison?.href
    ? new URL(activeComparison.href, "https://slow.pics" + pageLocation.pathname).pathname
    : "";
  const comparisonKey =
    parseComparisonKeyFromPath(pageLocation.pathname) ||
    parseComparisonKeyFromPath(activeComparisonPath);

  return findSlowPicsPosition(collection, {
    comparisonKey,
    publicFileName: parsePublicFileName(image?.currentSrc || image?.src),
    imageName: image?.alt || null,
    activeImageIndex: parseImageIndexFromDropdownId(activeImage?.id),
  });
}

export function openSlowPicsViewer(): boolean {
  const col = (window.unsafeWindow || window).collection;
  if (!col || !col.comparisons || !col.comparisons.length) return false;
  const comps = col.comparisons;
  const names = comps[0].images.map((im) =>
    im.name.replace(/^\([BIP]\) /, "").replaceAll(".", " ")
  );
  const numCols = names.length;
  const rows: GridCell[][] = comps.map((c) =>
    c.images.map((im) => ({
      full: "https://i.slow.pics/" + im.publicFileName,
      width: im.width,
      height: im.height,
    }))
  );
  const currentPosition = readSlowPicsCurrentPosition(col);
  openWithDummyWrapper({
    rows,
    numCols,
    names,
    initialRow: currentPosition?.row,
    initialCol: currentPosition?.col,
    initialZoom: { mode: "fit" },
  });
  return true;
}

export function setupSlowPics(): void {
  if (!/slow\.pics\/c\//.test(location.href)) return;

  function addButton(parent: Element, className: string): void {
    const btn = document.createElement("a");
    btn.textContent = "🔍";
    btn.className = className;
    btn.title = "Open comparison viewer (V)";
    btn.style.cursor = "pointer";
    btn.addEventListener("click", () => openSlowPicsViewer());
    parent.appendChild(btn);
  }

  const bar = document.querySelector(".footer-position .container-fluid");
  if (bar) addButton(bar, "btn btn-success ms-2");

  const navImages = document.querySelector("#images")?.parentElement;
  if (navImages) {
    const navBtn = document.createElement("a");
    navBtn.className = "nav-link d-inline-block";
    navBtn.textContent = "🔍";
    navBtn.title = "Open comparison viewer (V)";
    navBtn.style.cursor = "pointer";
    navBtn.addEventListener("click", () => openSlowPicsViewer());
    navImages.after(navBtn);
  }
}
