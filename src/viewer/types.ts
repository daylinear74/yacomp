// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Viewer types                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

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
  allRowData: RowData[];
  navMapEl: HTMLDivElement;
  bgLoadAll: () => boolean;
  setBgLoadAll: (v: boolean) => void;
  triggerBgLoad: () => void;
  setColumn: (col: number) => void;
  setRow: (rowIdx: number) => void;
  updateNavMap: () => void;
  close: () => void;
}
