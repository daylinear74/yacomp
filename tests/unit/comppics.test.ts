import { describe, test, expect } from "bun:test";
import {
  parseComppicsComparisonData,
  isComppicsNativeHotkey,
  extractArray,
} from "../../src/sites/comppics";

const PAGE = "https://comp.pics/compare/abc";

describe("extractArray (comp.pics compareData literal)", () => {
  test("reads a plain string array", () => {
    expect(extractArray(`var x = { imageNames: ["Remux","WEB-DL"] };`, "imageNames"))
      .toEqual(["Remux", "WEB-DL"]);
  });

  test("keeps names whose text contains a ] (bracket tags don't truncate)", () => {
    // HDR comparisons routinely tag sources "[B] Remux", "WEB-DL [HDR]" — the
    // non-greedy regex used to stop at the first ] and drop every column name.
    expect(extractArray(`compareData = { imageNames: ["[B] Remux","WEB-DL [HDR]","[DV] Encode"] }`, "imageNames"))
      .toEqual(["[B] Remux", "WEB-DL [HDR]", "[DV] Encode"]);
  });

  test("returns null for a missing key", () => {
    expect(extractArray(`var x = { imageUrls: ["a.png"] }`, "imageNames")).toBeNull();
  });

  test("isolates the right array among several", () => {
    expect(extractArray(`{ imageUrls: ["a.png","b.png"], imageNames: ["A","B"], totalRows: 1 }`, "imageNames"))
      .toEqual(["A", "B"]);
  });
});

describe("parseComppicsComparisonData", () => {
  test("builds a grid and resolves relative image paths", () => {
    const grid = parseComppicsComparisonData(
      { imageUrls: ["a.webp", "b.webp"], totalColumns: 2, totalRows: 1 },
      PAGE,
    );
    expect(grid).toEqual({
      rows: [[
        { full: "https://comp.pics/uploads/a.webp" },
        { full: "https://comp.pics/uploads/b.webp" },
      ]],
      numCols: 2,
      names: null,
    });
  });

  test("keeps absolute image URLs as-is", () => {
    const grid = parseComppicsComparisonData(
      {
        imageUrls: ["https://cdn.example/a.png", "https://cdn.example/b.png"],
        totalColumns: 2,
        totalRows: 1,
      },
      PAGE,
    );
    expect(grid?.rows[0].map((c) => c.full)).toEqual([
      "https://cdn.example/a.png",
      "https://cdn.example/b.png",
    ]);
  });

  test("splits a flat image list into rows", () => {
    const grid = parseComppicsComparisonData(
      {
        imageUrls: ["http://x/a", "http://x/b", "http://x/c", "http://x/d"],
        totalColumns: 2,
        totalRows: 2,
      },
      PAGE,
    );
    expect(grid?.rows.map((r) => r.map((c) => c.full))).toEqual([
      ["http://x/a", "http://x/b"],
      ["http://x/c", "http://x/d"],
    ]);
  });

  test("collapses per-row numbered names to a single column name", () => {
    const grid = parseComppicsComparisonData(
      {
        imageUrls: ["http://x/1", "http://x/2", "http://x/3", "http://x/4"],
        totalColumns: 2,
        totalRows: 2,
        imageNames: ["Encode-1", "Source-1", "Encode-2", "Source-2"],
      },
      PAGE,
    );
    expect(grid?.names).toEqual(["Encode", "Source"]);
  });

  test("keeps distinct names when they are not numbered", () => {
    const grid = parseComppicsComparisonData(
      {
        imageUrls: ["http://x/a", "http://x/b"],
        totalColumns: 2,
        totalRows: 1,
        imageNames: ["Remux", "Web-DL"],
      },
      PAGE,
    );
    expect(grid?.names).toEqual(["Remux", "Web-DL"]);
  });

  test("returns null when the image count contradicts the dimensions", () => {
    expect(
      parseComppicsComparisonData(
        { imageUrls: ["a", "b", "c"], totalColumns: 2, totalRows: 1 },
        PAGE,
      ),
    ).toBeNull();
  });

  test("returns null for fewer than two columns", () => {
    expect(
      parseComppicsComparisonData(
        { imageUrls: ["a"], totalColumns: 1, totalRows: 1 },
        PAGE,
      ),
    ).toBeNull();
  });
});

const key = (code: string, mods: Partial<KeyboardEvent> = {}) =>
  ({ code, ...mods }) as unknown as KeyboardEvent;

describe("isComppicsNativeHotkey", () => {
  test("recognises native navigation keys", () => {
    expect(isComppicsNativeHotkey(key("ArrowLeft"))).toBe(true);
    expect(isComppicsNativeHotkey(key("Digit3"))).toBe(true);
    expect(isComppicsNativeHotkey(key("KeyS"))).toBe(true);
  });
  test("ignores unrelated keys", () => {
    expect(isComppicsNativeHotkey(key("KeyZ"))).toBe(false);
  });
  test("ignores keys held with a modifier", () => {
    expect(isComppicsNativeHotkey(key("ArrowLeft", { ctrlKey: true }))).toBe(false);
  });
});
