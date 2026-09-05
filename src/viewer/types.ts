// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Viewer types                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { GammaMismatchCheckId } from "../filters/gamma-check";

export interface RowData {
  rowDiv: HTMLDivElement;
  sizer: HTMLImageElement;
  imgs: HTMLImageElement[];
  adjustRowAR: (img: HTMLImageElement) => void;
  loaded?: boolean;
}

export interface Comp {
  compDiv: HTMLDivElement;
  container: HTMLElement;
  numCols: number;
  numRows: number;
  sourceNames: string[] | null;
  visibleCols: number[];
  currentRow: number;
  currentCol: number;
  suppressRowSync?: boolean;
  rowSyncSuppressToken?: number;
  // The row a deliberate navigation (keys / row-nav click) is smooth-scrolling
  // toward. While set, the scroll sync neither rewrites currentRow from
  // mid-flight geometry nor bounces the highlight; rapid presses accumulate on
  // this target. Cleared on arrival or on a manual scroll gesture.
  navTargetRow?: number | null;
  allRowData: RowData[];
  colBrightness: number[];
  colGammaCheck: (GammaMismatchCheckId | null)[];
  colContrast: number[];
  bgLoadAll: () => boolean;
  setBgLoadAll: (v: boolean) => void;
  triggerBgLoad: () => void;
  setColumn: (col: number) => void;
  setSourceVisible: (col: number, visible: boolean) => void;
  setRow: (rowIdx: number) => void;
  updateSourceMenu?: () => void;
  updateFillCanvasBtn?: () => void;
  updateCloseBtn?: () => void;
  updateRowNav?: (idx: number) => void;
  // Rebuild the source-title banner for the current row+column (per-row names
  // make its content row-dependent). Called wherever currentRow changes.
  updateLabel?: () => void;
  // Keep the viewport-centered loader in sync with the active row and column.
  updateLoadingOverlay?: () => void;
  // Reprioritize pending colorspace work when the visible source/row changes.
  updateActiveFilter?: () => void;
  // Rebuild the banner after the dense/filled title-layout setting changes.
  updateTitleLayout?: () => void;
  updateScrollSpacers?: () => void;
  updateNavMap: () => void;
  // Auto-hide chrome hooks (① auto-hide UI). Reveal the source label / row nav
  // on a deliberate action; re-evaluate the fit/fill button's "hide at 1:1" rule;
  // re-apply the resting state after a chrome-mode / hide-delay settings change.
  revealColumnNav?: () => void;
  revealRowNav?: () => void;
  syncFillCanvasVisibility?: () => void;
  syncAutoHide?: () => void;
  close: () => void;
}
