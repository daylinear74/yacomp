import type { Grid, GridInitialZoom } from "../grid/types";

function clampIndex(value: number | undefined, maxExclusive: number): number {
  if (!Number.isFinite(value) || maxExclusive <= 0) return 0;
  return Math.max(0, Math.min(maxExclusive - 1, Math.trunc(value!)));
}

export function normalizeGridInitialPosition(grid: Grid): { row: number; col: number } {
  return {
    row: clampIndex(grid.initialRow, grid.rows.length),
    col: clampIndex(grid.initialCol, grid.numCols),
  };
}

export function normalizeGridInitialZoom(
  zoom: GridInitialZoom | null | undefined,
): GridInitialZoom {
  if (zoom?.mode === "custom" && Number.isFinite(zoom.width) && zoom.width > 0) {
    return { mode: "custom", width: Math.round(zoom.width) };
  }
  return { mode: "fit" };
}
