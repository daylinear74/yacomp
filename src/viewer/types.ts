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
  updateScrollSpacers?: () => void;
  updateNavMap: () => void;
  // Auto-hide chrome hooks (① auto-hide UI). Reveal the source label / row nav
  // on a deliberate action; re-evaluate the fit/fill button's "hide at 1:1" rule.
  revealColumnNav?: () => void;
  revealRowNav?: () => void;
  syncFillCanvasVisibility?: () => void;
  close: () => void;
}
