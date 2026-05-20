import { describe, test, expect } from "bun:test";
import { parseGPWNames, buildGPWGridFromRows } from "../../src/sites/gpw";

describe("parseGPWNames", () => {
  test("splits comma-separated names", () => {
    expect(parseGPWNames("Source, Encode")).toEqual(["Source", "Encode"]);
  });
  test("strips a trailing colon", () => {
    expect(parseGPWNames("A, B, C:")).toEqual(["A", "B", "C"]);
  });
  test("returns null for a single name", () => {
    expect(parseGPWNames("OnlyOne")).toBeNull();
  });
  test("returns null for empty text", () => {
    expect(parseGPWNames("")).toBeNull();
  });
});

describe("buildGPWGridFromRows", () => {
  test("builds a grid from row URLs", () => {
    const grid = buildGPWGridFromRows([["a", "b"], ["c", "d"]], ["X", "Y"]);
    expect(grid).toEqual({
      rows: [[{ full: "a" }, { full: "b" }], [{ full: "c" }, { full: "d" }]],
      numCols: 2,
      names: ["X", "Y"],
    });
  });
  test("drops names whose count does not match the columns", () => {
    const grid = buildGPWGridFromRows([["a", "b"]], ["X", "Y", "Z"]);
    expect(grid?.names).toBeNull();
  });
  test("returns null for a single-column grid", () => {
    expect(buildGPWGridFromRows([["a"]], null)).toBeNull();
  });
  test("returns null for a ragged grid", () => {
    expect(buildGPWGridFromRows([["a", "b"], ["c"]], null)).toBeNull();
  });
  test("returns null when a cell URL is empty", () => {
    expect(buildGPWGridFromRows([["a", ""]], null)).toBeNull();
  });
  test("returns null for no rows", () => {
    expect(buildGPWGridFromRows([], null)).toBeNull();
  });
});
