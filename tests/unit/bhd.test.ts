import { describe, test, expect } from "bun:test";
import { parseBHDLaunchNames, buildBHDGridFromCells } from "../../src/sites/bhd";

describe("parseBHDLaunchNames", () => {
  test("splits comma-separated names", () => {
    expect(parseBHDLaunchNames("Source, Encode", 2)).toEqual(["Source", "Encode"]);
  });
  test("strips a trailing [Show] affordance", () => {
    expect(parseBHDLaunchNames("Source, Encode [Show]", 2)).toEqual([
      "Source", "Encode",
    ]);
  });
  test("strips a trailing 'Comparison' word", () => {
    expect(parseBHDLaunchNames("A, B, C Comparison", 3)).toEqual(["A", "B", "C"]);
  });
  test("returns null when the name count does not match", () => {
    expect(parseBHDLaunchNames("A, B", 3)).toBeNull();
  });
  test("returns null for blank text", () => {
    expect(parseBHDLaunchNames("   ", 2)).toBeNull();
  });
});

describe("buildBHDGridFromCells", () => {
  test("builds a single-row grid", () => {
    const grid = buildBHDGridFromCells(
      [
        { pair: 0, item: 0, src: "a" },
        { pair: 0, item: 1, src: "b" },
      ],
      2,
      ["X", "Y"],
    );
    expect(grid).toEqual({
      rows: [[{ full: "a" }, { full: "b" }]],
      numCols: 2,
      names: ["X", "Y"],
    });
  });

  test("orders rows by ascending pair index", () => {
    const grid = buildBHDGridFromCells(
      [
        { pair: 1, item: 0, src: "c" },
        { pair: 1, item: 1, src: "d" },
        { pair: 0, item: 0, src: "a" },
        { pair: 0, item: 1, src: "b" },
      ],
      2,
      ["X", "Y"],
    );
    expect(grid?.rows.map((r) => r.map((c) => c.full))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  test("falls back to per-cell titles when names are missing", () => {
    const grid = buildBHDGridFromCells(
      [
        { pair: 0, item: 0, src: "a", title: "Remux" },
        { pair: 0, item: 1, src: "b", title: "Encode" },
      ],
      2,
      null,
    );
    expect(grid?.names).toEqual(["Remux", "Encode"]);
  });

  test("returns null for an incomplete row", () => {
    expect(
      buildBHDGridFromCells([{ pair: 0, item: 0, src: "a" }], 2, null),
    ).toBeNull();
  });

  test("returns null when max is below 2", () => {
    expect(
      buildBHDGridFromCells([{ pair: 0, item: 0, src: "a" }], 1, null),
    ).toBeNull();
  });

  test("returns null when there are no cells", () => {
    expect(buildBHDGridFromCells([], 2, ["X", "Y"])).toBeNull();
  });
});
