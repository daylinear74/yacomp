import { describe, test, expect } from "bun:test";
import { parsePTPOnclick, ptpThumbUrl, ptpGridTiles } from "../../src/sites/ptp";

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

describe("ptpThumbUrl", () => {
  test("rewrites a PTP /i/ full URL to its /t/ thumbnail", () => {
    expect(ptpThumbUrl("https://passthepopcorn.me/i/KsL6h1J7Brh.png")).toBe(
      "https://passthepopcorn.me/t/KsL6h1J7Brh.png",
    );
  });

  test("handles http and a subdomain, preserving the extension", () => {
    expect(ptpThumbUrl("http://passthepopcorn.me/i/x.jpg")).toBe("http://passthepopcorn.me/t/x.jpg");
    expect(ptpThumbUrl("https://img.passthepopcorn.me/i/y.png")).toBe(
      "https://img.passthepopcorn.me/t/y.png",
    );
  });

  test("leaves non-PTP hosts untouched (only /i/ on passthepopcorn.me is rewritten)", () => {
    expect(ptpThumbUrl("https://ptpimg.me/i/abc.png")).toBe("https://ptpimg.me/i/abc.png");
    expect(ptpThumbUrl("https://example.com/i/abc.png")).toBe("https://example.com/i/abc.png");
    // look-alike domain must NOT be rewritten
    expect(ptpThumbUrl("https://notpassthepopcorn.me/i/abc.png")).toBe(
      "https://notpassthepopcorn.me/i/abc.png",
    );
    // only the /i/ path segment is the trigger
    expect(ptpThumbUrl("https://passthepopcorn.me/torrents/i/abc.png")).toBe(
      "https://passthepopcorn.me/torrents/i/abc.png",
    );
  });
});

describe("ptpGridTiles", () => {
  const ptp = "https://passthepopcorn.me/i/AAA.png";
  const ext = "https://example.com/i/BBB.png";

  test("thumbnail mode: src is the thumbnail, href stays the full image", () => {
    expect(ptpGridTiles([ptp, ext], true)).toEqual([
      { href: ptp, src: "https://passthepopcorn.me/t/AAA.png" },
      { href: ext, src: ext }, // non-PTP unchanged
    ]);
  });

  test("full mode: src and href are both the full image", () => {
    expect(ptpGridTiles([ptp], false)).toEqual([{ href: ptp, src: ptp }]);
  });

  test("preserves order", () => {
    const urls = ["https://passthepopcorn.me/i/1.png", "https://passthepopcorn.me/i/2.png"];
    expect(ptpGridTiles(urls, true).map((t) => t.href)).toEqual(urls);
  });
});
