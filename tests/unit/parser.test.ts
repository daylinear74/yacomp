import { describe, test, expect } from "bun:test";
import { reshapeGrid } from "../../src/grid/parser";
import type { GridCell } from "../../src/grid/types";

const cell = (full: string): GridCell => ({ full });
const fulls = (rows: GridCell[][]): string[][] =>
  rows.map((row) => row.map((c) => c.full));

describe("reshapeGrid", () => {
  test("keeps a proper grid as-is when names match the column count", () => {
    const groups = [[cell("a"), cell("b")], [cell("c"), cell("d")]];
    const result = reshapeGrid(groups, groups.flat(), ["X", "Y"]);
    expect(result?.numCols).toBe(2);
    expect(fulls(result!.gridRows)).toEqual([["a", "b"], ["c", "d"]]);
  });

  test("keeps a proper grid as-is when there are no names", () => {
    const groups = [[cell("a"), cell("b")], [cell("c"), cell("d")]];
    const result = reshapeGrid(groups, groups.flat(), null);
    expect(result?.numCols).toBe(2);
    expect(fulls(result!.gridRows)).toEqual([["a", "b"], ["c", "d"]]);
  });

  test("transposes when each group holds one source's frames", () => {
    const groups = [
      [cell("a1"), cell("a2"), cell("a3")],
      [cell("b1"), cell("b2"), cell("b3")],
    ];
    const result = reshapeGrid(groups, groups.flat(), ["A", "B"]);
    expect(result?.numCols).toBe(2);
    expect(fulls(result!.gridRows)).toEqual([
      ["a1", "b1"], ["a2", "b2"], ["a3", "b3"],
    ]);
  });

  test("flat-reshapes a proper grid when the name count overrides it", () => {
    const groups = [[cell("a"), cell("b")], [cell("c"), cell("d")]];
    const result = reshapeGrid(groups, groups.flat(), ["W", "X", "Y", "Z"]);
    expect(result?.numCols).toBe(4);
    expect(fulls(result!.gridRows)).toEqual([["a", "b", "c", "d"]]);
  });

  test("flat-reshapes a ragged group list using the name count", () => {
    const groups = [[cell("a")], [cell("b"), cell("c"), cell("d")]];
    const result = reshapeGrid(groups, groups.flat(), ["X", "Y"]);
    expect(result?.numCols).toBe(2);
    expect(fulls(result!.gridRows)).toEqual([["a", "b"], ["c", "d"]]);
  });

  test("returns null when ragged images do not divide by the name count", () => {
    const groups = [[cell("a")], [cell("b"), cell("c")]];
    expect(reshapeGrid(groups, groups.flat(), ["X", "Y"])).toBeNull();
  });

  test("returns null for a ragged group list with no names", () => {
    const groups = [[cell("a")], [cell("b"), cell("c")]];
    expect(reshapeGrid(groups, groups.flat(), null)).toBeNull();
  });
});
