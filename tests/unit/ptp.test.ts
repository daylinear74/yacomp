import { describe, test, expect } from "bun:test";
import { parsePTPOnclick } from "../../src/sites/ptp";

const onclick = (names: string, urls: string) =>
  `BBCode.ScreenshotComparisonToggleShow(this, ${names}, ${urls})`;

describe("parsePTPOnclick", () => {
  test("parses a single-row comparison", () => {
    const grid = parsePTPOnclick(onclick('["Source", "Encode"]', '["u1", "u2"]'));
    expect(grid).toEqual({
      rows: [[{ full: "u1" }, { full: "u2" }]],
      numCols: 2,
      names: ["Source", "Encode"],
    });
  });

  test("splits a flat URL list into rows", () => {
    const grid = parsePTPOnclick(onclick('["A", "B"]', '["u1", "u2", "u3", "u4"]'));
    expect(grid?.rows.map((r) => r.map((c) => c.full))).toEqual([
      ["u1", "u2"],
      ["u3", "u4"],
    ]);
  });

  test("trims whitespace around names", () => {
    const grid = parsePTPOnclick(onclick('["  A  ", " B "]', '["u1", "u2"]'));
    expect(grid?.names).toEqual(["A", "B"]);
  });

  test("returns null without two array arguments", () => {
    expect(parsePTPOnclick("doSomethingElse()")).toBeNull();
  });

  test("returns null for a single name", () => {
    expect(parsePTPOnclick(onclick('["Only"]', '["u1"]'))).toBeNull();
  });

  test("returns null when the URL count is not a multiple of names", () => {
    expect(parsePTPOnclick(onclick('["A", "B"]', '["u1", "u2", "u3"]'))).toBeNull();
  });
});
