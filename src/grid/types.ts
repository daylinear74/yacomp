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
  // The final row is short (fewer than numCols cells) because the count is
  // indivisible — a comparison-thread OP that dropped a screenshot (80402).
  // The viewer renders the lone trailing "orphan" cell with a click-to-ignore
  // affordance so the rest of the grid still pairs up cleanly.
  partial?: boolean;
}
