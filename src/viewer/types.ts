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
  link: HTMLElement;
  numCols: number;
  numRows: number;
  currentRow: number;
  currentCol: number;
  suppressRowSync?: boolean;
  rowSyncSuppressToken?: number;
  allRowData: RowData[];
  navMapEl: HTMLDivElement;
  colBrightness: number[];
  colGammaCheck: (GammaMismatchCheckId | null)[];
  colContrast: number[];
  bgLoadAll: () => boolean;
  setBgLoadAll: (v: boolean) => void;
  triggerBgLoad: () => void;
  setColumn: (col: number) => void;
  setRow: (rowIdx: number) => void;
  updateRowNav?: (idx: number) => void;
  updateScrollSpacers?: () => void;
  updateNavMap: () => void;
  close: () => void;
}
