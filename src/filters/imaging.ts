// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Image targeting & filter application                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { detectCS } from "./colorspace";
import { cur } from "./modes";
import { bcString } from "./brightness";
import { gammaMismatchCheckFilter, type GammaMismatchCheckId } from "./gamma-check";
import { injectFilters } from "./svg";
import { active } from "./modes";
import { updateHUD } from "../ui/hud";
import { activeComps } from "./zoom";
import type { Comp } from "../viewer/types";

export const LUMA_CHROMA_FILTER_CONCURRENCY = 4;

export interface CompImageFilterTarget {
  comp: Comp;
  row: number;
  col: number;
  img: HTMLImageElement;
}

export interface FilterApplyOptions {
  brightness?: number;
  contrast?: number;
  gammaCheck?: GammaMismatchCheckId | null;
  shouldApply?: () => boolean;
}

let filterSyncGeneration = 0;

export function currentFilterSyncGuard(): () => boolean {
  const generation = filterSyncGeneration;
  return () => generation === filterSyncGeneration;
}

export function createFilterSyncGuard(): () => boolean {
  filterSyncGeneration++;
  return currentFilterSyncGuard();
}

export function orderedRowsAroundAnchor(totalRows: number, currentRow: number): number[] {
  if (totalRows <= 0) return [];
  const anchor = Math.max(0, Math.min(totalRows - 1, Math.trunc(currentRow)));
  const rows = [anchor];
  for (let distance = 1; rows.length < totalRows; distance++) {
    const before = anchor - distance;
    const after = anchor + distance;
    if (before >= 0) rows.push(before);
    if (after < totalRows) rows.push(after);
  }
  return rows;
}

export function orderedColumnsAroundAnchor(totalCols: number, currentCol: number): number[] {
  if (totalCols <= 0) return [];
  const anchor = Math.max(0, Math.min(totalCols - 1, Math.trunc(currentCol)));
  const cols = [anchor];
  // Expand leftward first (toward column 0), then rightward (toward the end).
  // The user's eye moves outward from the anchor; loading nearby columns first
  // means the next likely-needed image is filtered before the far edge.
  for (let col = anchor - 1; col >= 0; col--) cols.push(col);
  for (let col = anchor + 1; col < totalCols; col++) cols.push(col);
  return cols;
}

export function orderedCompImageTargetsByAnchor(comp: Comp): CompImageFilterTarget[] {
  const targets: CompImageFilterTarget[] = [];
  const rows = orderedRowsAroundAnchor(comp.allRowData.length, comp.currentRow);
  const cols = orderedColumnsAroundAnchor(comp.numCols, comp.currentCol);
  for (const row of rows) {
    const rd = comp.allRowData[row];
    if (!rd) continue;
    for (const col of cols) {
      const img = rd.imgs[col];
      if (img?.src) targets.push({ comp, row, col, img });
    }
  }
  return targets;
}

export function shouldApplyFilterToImage(img: HTMLImageElement): boolean {
  if (
    img.closest("._scf_comp") ||
    img.closest("._scf_nav_map") ||
    img.closest("#_scf_hud_") ||
    img.closest("#_scf_toast_")
  )
    return false;
  if (img.offsetWidth > 200 || img.naturalWidth > 200) return true;
  if (img.classList.contains("screenshot-comparison__image")) return true;
  return false;
}

export function getImages(): HTMLImageElement[] {
  return [...document.querySelectorAll("img")].filter(shouldApplyFilterToImage) as HTMLImageElement[];
}

export async function resolveFilter(src: string): Promise<string> {
  const mode = cur();
  if (mode.f709) {
    const cs = await detectCS(src);
    return cs === "2020" ? mode.f2020! : mode.f709;
  }
  return mode.filter || "";
}

export function buildFilter(
  svgFilter: string,
  b = 1.0,
  c = 1.0,
  gammaCheck: GammaMismatchCheckId | null = null,
): string {
  const parts: string[] = [];
  // Gamma is a per-source calibration. Apply it before the shared analysis
  // mode so Solar/Residual/Luma/Chroma inspect the corrected pixels.
  const gamma = gammaMismatchCheckFilter(gammaCheck);
  if (gamma) parts.push(gamma);
  if (svgFilter) parts.push(svgFilter);
  const bc = bcString(b, c);
  if (bc) parts.push(bc);
  return parts.join(" ");
}

export async function applyFilterToImg(
  img: HTMLImageElement,
  options: FilterApplyOptions = {},
): Promise<void> {
  const shouldApply = options.shouldApply ?? currentFilterSyncGuard();
  const source = img.src;
  const filter = buildFilter(
    await resolveFilter(source),
    options.brightness,
    options.contrast,
    options.gammaCheck ?? null,
  );
  if (!shouldApply() || img.isConnected === false || img.src !== source) return;
  img.style.filter = filter;
}

export async function applyToImg(img: HTMLImageElement): Promise<void> {
  if (!shouldApplyFilterToImage(img)) return;
  await applyFilterToImg(img);
}

async function applyToCompTargetIfCurrent(
  target: CompImageFilterTarget,
  shouldApply: () => boolean,
): Promise<void> {
  const { comp, col, img } = target;
  await applyFilterToImg(img, {
    brightness: comp.colBrightness[col],
    contrast: comp.colContrast[col],
    gammaCheck: comp.colGammaCheck[col],
    shouldApply,
  });
}

function deferNextFilterTarget(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export async function runBoundedFilterQueue<T>(
  targets: T[],
  concurrency: number,
  shouldApply: () => boolean,
  applyTarget: (target: T) => Promise<void>,
): Promise<void> {
  if (!targets.length || !shouldApply()) return;
  const limit = Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : 1));
  const workerCount = Math.min(limit, targets.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (shouldApply()) {
      const index = nextIndex++;
      const target = targets[index];
      if (target === undefined) return;
      await applyTarget(target);
      await deferNextFilterTarget();
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}

type FilterTargetTask =
  | { type: "viewer"; target: CompImageFilterTarget }
  | { type: "page"; img: HTMLImageElement };

// Splits viewer targets into the anchor cell(s) — the currently visible image
// in each open comp — and everything else. The anchors must run *before* the
// background queue so users see the active image's filter apply immediately;
// running them inside the concurrent queue lets non-anchor work win the race
// when detectCS() blocks on a network fetch.
export function partitionAnchorTargets(
  viewerTargets: CompImageFilterTarget[],
): { anchors: CompImageFilterTarget[]; rest: CompImageFilterTarget[] } {
  const anchors: CompImageFilterTarget[] = [];
  const rest: CompImageFilterTarget[] = [];
  for (const target of viewerTargets) {
    if (
      target.row === target.comp.currentRow &&
      target.col === target.comp.currentCol
    ) {
      anchors.push(target);
    } else {
      rest.push(target);
    }
  }
  return { anchors, rest };
}

// Awaits one full paint cycle: `requestAnimationFrame` fires *before* the
// browser paints, so the second nested call resolves after that paint has
// completed. The setTimeout fallback keeps this usable in non-DOM
// environments (Bun unit tests).
export function yieldToBrowserPaint(): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    } else {
      setTimeout(resolve, 0);
    }
  });
}

// Awaits the anchors sequentially, optionally yields so the browser can paint
// the just-applied anchor filter, then drains the rest through the bounded
// concurrent queue. Exported so the "anchor-first" guarantee can be exercised
// in unit tests without a DOM.
export async function applyAnchorsThenQueue<A, T>(
  anchors: A[],
  queueTargets: T[],
  concurrency: number,
  shouldApply: () => boolean,
  applyAnchor: (anchor: A) => Promise<void>,
  applyQueueTarget: (target: T) => Promise<void>,
  yieldBetween?: () => Promise<void>,
): Promise<void> {
  for (const anchor of anchors) {
    if (!shouldApply()) return;
    await applyAnchor(anchor);
  }
  if (!shouldApply()) return;
  // Only pay the yield cost when there's actually an anchor to paint —
  // otherwise (e.g. page-image-only sync) the yield is pure latency.
  if (yieldBetween && anchors.length > 0) {
    await yieldBetween();
    if (!shouldApply()) return;
  }
  await runBoundedFilterQueue(queueTargets, concurrency, shouldApply, applyQueueTarget);
}

async function applyFilterTargetsConcurrently(
  viewerTargets: CompImageFilterTarget[],
  pageTargets: HTMLImageElement[],
  shouldApply: () => boolean,
): Promise<void> {
  const { anchors, rest } = partitionAnchorTargets(viewerTargets);
  const queueTargets: FilterTargetTask[] = [
    ...rest.map((target) => ({ type: "viewer" as const, target })),
    ...pageTargets.map((img) => ({ type: "page" as const, img })),
  ];
  await applyAnchorsThenQueue(
    anchors,
    queueTargets,
    LUMA_CHROMA_FILTER_CONCURRENCY,
    shouldApply,
    (anchor) => applyToCompTargetIfCurrent(anchor, shouldApply),
    async (task) => {
      if (task.type === "viewer") {
        await applyToCompTargetIfCurrent(task.target, shouldApply);
      } else {
        await applyFilterToImg(task.img, { shouldApply });
      }
    },
    yieldToBrowserPaint,
  );
}

export function syncAll(): void {
  const shouldApply = createFilterSyncGuard();
  const mode = cur();
  const pageImages = getImages();
  const viewerTargets = activeComps.flatMap(orderedCompImageTargetsByAnchor);
  injectFilters();
  if (active(mode)) {
    if (mode.f709) {
      void applyFilterTargetsConcurrently(viewerTargets, pageImages, shouldApply);
      updateHUD();
      return;
    }
    pageImages.forEach((img) => {
      void applyFilterToImg(img, { shouldApply });
    });
  } else {
    for (const img of pageImages) {
      img.style.filter = "";
    }
  }
  viewerTargets.forEach((target) => {
    void applyToCompTargetIfCurrent(target, shouldApply);
  });
  updateHUD();
}
