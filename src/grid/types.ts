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
  // A single-column "viewer" rather than a comparison: a torrent-page image
  // block whose only candidate title was an unreliable quote/URL blob, so we
  // show the shots as a 1-wide gallery (numCols 1) instead of inventing columns
  // (Holubice 838405). The trigger link reads "Show viewer", not "Show
  // comparison".
  gallery?: boolean;
}
