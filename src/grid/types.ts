// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Grid types                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export interface GridCell {
  thumb?: string;
  full: string;
  a?: HTMLAnchorElement;
  img?: HTMLImageElement;
}

export interface Grid {
  rows: GridCell[][];
  numCols: number;
  names: string[] | null;
  anchorEl?: Node | null;
}
