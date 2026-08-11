/** Split a row-major collection at its final complete row. The caller decides
 *  how to surface the trailing remainder (usually as a separate gallery). */
export function partitionTrailingRemainder<T>(
  items: readonly T[],
  columns: number,
): { complete: T[]; remainder: T[] } {
  if (!Number.isInteger(columns) || columns < 1) {
    return { complete: [], remainder: [...items] };
  }
  const remainderCount = items.length % columns;
  const splitAt = items.length - remainderCount;
  return {
    complete: items.slice(0, splitAt),
    remainder: items.slice(splitAt),
  };
}
