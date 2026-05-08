export function createDefaultVisibleColumns(numCols: number): number[] {
  return Array.from({ length: Math.max(0, numCols) }, (_, i) => i);
}

export function setColumnVisibility(
  visibleColumns: number[],
  col: number,
  visible: boolean,
  numCols: number,
): number[] {
  if (col < 0 || col >= numCols) return visibleColumns;

  const current = visibleColumns.filter((c, idx) => (
    c >= 0 &&
    c < numCols &&
    visibleColumns.indexOf(c) === idx
  ));

  if (visible) {
    return current.includes(col)
      ? current
      : [...current, col].sort((a, b) => a - b);
  }

  if (!current.includes(col) || current.length <= 1) return current;
  return current.filter((c) => c !== col);
}

export function pointerVisibleColumn(
  clientX: number,
  viewportWidth: number,
  visibleColumns: number[],
): number {
  if (!visibleColumns.length) return 0;
  const width = Math.max(1, viewportWidth);
  const relX = Math.max(0, Math.min(0.9999, clientX / width));
  return visibleColumns[Math.floor(relX * visibleColumns.length)];
}

export function visibleColumnOffset(
  visibleColumns: number[],
  col: number,
): number {
  return visibleColumns.indexOf(col);
}

export function sourceMenuCountText(visibleCount: number, totalCount: number): string {
  return visibleCount + " / " + totalCount;
}
