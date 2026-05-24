// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Grid types                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export interface GridCell {
  thumb?: string;
  full: string;
  a?: HTMLAnchorElement;
  img?: HTMLImageElement;
  width?: number | null;
  height?: number | null;
}

export type GridInitialZoom =
  | { mode: "fit" }
  | { mode: "custom"; width: number };

export interface Grid {
  rows: GridCell[][];
  numCols: number;
  names: string[] | null;
  anchorEl?: Node | null;
  initialRow?: number;
  initialCol?: number;
  initialZoom?: GridInitialZoom | null;
}
