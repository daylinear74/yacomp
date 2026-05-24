import { describe, test, expect } from "bun:test";
import {
  createDefaultVisibleColumns,
  setColumnVisibility,
  pointerVisibleColumn,
  visibleColumnOffset,
  sourceMenuCountText,
} from "../../src/viewer/source-visibility";

describe("createDefaultVisibleColumns", () => {
  test("lists every column", () => {
    expect(createDefaultVisibleColumns(3)).toEqual([0, 1, 2]);
  });
  test("empty for zero columns", () => {
    expect(createDefaultVisibleColumns(0)).toEqual([]);
  });
  test("empty for a negative count", () => {
    expect(createDefaultVisibleColumns(-2)).toEqual([]);
  });
});

describe("setColumnVisibility", () => {
  test("hides a visible column", () => {
    expect(setColumnVisibility([0, 1, 2], 1, false, 3)).toEqual([0, 2]);
  });
  test("shows a hidden column in sorted order", () => {
    expect(setColumnVisibility([0, 2], 1, true, 3)).toEqual([0, 1, 2]);
  });
  test("refuses to hide the last visible column", () => {
    expect(setColumnVisibility([1], 1, false, 3)).toEqual([1]);
  });
  test("ignores an out-of-range column", () => {
    expect(setColumnVisibility([0, 1], 5, true, 3)).toEqual([0, 1]);
  });
  test("showing an already-visible column is a no-op", () => {
    expect(setColumnVisibility([0, 1], 1, true, 3)).toEqual([0, 1]);
  });
  test("hiding an already-hidden column is a no-op", () => {
    expect(setColumnVisibility([0, 2], 1, false, 3)).toEqual([0, 2]);
  });
});

describe("pointerVisibleColumn", () => {
  test("maps the left edge to the first visible column", () => {
    expect(pointerVisibleColumn(0, 1000, [0, 1, 2])).toBe(0);
  });
  test("maps the right edge to the last visible column", () => {
    expect(pointerVisibleColumn(999, 1000, [0, 1, 2])).toBe(2);
  });
  test("maps the middle band", () => {
    expect(pointerVisibleColumn(500, 1000, [0, 1, 2])).toBe(1);
  });
  test("respects a sparse visible set", () => {
    expect(pointerVisibleColumn(500, 1000, [1, 3])).toBe(3);
  });
  test("returns 0 when nothing is visible", () => {
    expect(pointerVisibleColumn(500, 1000, [])).toBe(0);
  });
});

describe("visibleColumnOffset", () => {
  test("returns the index within the visible set", () => {
    expect(visibleColumnOffset([0, 2, 4], 2)).toBe(1);
  });
  test("returns -1 when the column is not visible", () => {
    expect(visibleColumnOffset([0, 2, 4], 3)).toBe(-1);
  });
});

describe("sourceMenuCountText", () => {
  test("formats visible / total", () => {
    expect(sourceMenuCountText(2, 3)).toBe("2 / 3");
  });
});
