import { describe, test, expect } from "bun:test";
import {
  parseSlowPicsKey,
  extractCollection,
  collectionToGridInfo,
} from "../../src/sites/slowpics-source";

// Real shape captured from https://slow.pics/c/cAjHr45r (the "dirty line" fix):
// 3 comparisons (rows) × 3 sources named S/F/E, served inline as
// `var collection = {…}` in the page HTML.
const REAL_PAGE = `<!doctype html><html><head></head><body>
<script>
  var origin = "https://slow.pics"
  var collection = {"key":"IXxe2E6t","name":"dirty line","comparisons":[{"key":"88OIaygI","name":"unknown","images":[{"name":"S","sizeValue":"1.0 MiB","publicFileName":"bE1k0gEY.png","width":1280,"height":692},{"name":"F","sizeValue":"1.0 MiB","publicFileName":"fiD7KHnZ.png","width":1280,"height":692},{"name":"E","sizeValue":"1.0 MiB","publicFileName":"EKhTPw0K.png","width":1280,"height":692}],"hentai":false},{"key":"gSZWOY6B","name":"unknown","images":[{"name":"S","sizeValue":"1.1 MiB","publicFileName":"4G2j546D.png","width":1280,"height":692},{"name":"F","sizeValue":"1.1 MiB","publicFileName":"TGtWQ1w1.png","width":1280,"height":692},{"name":"E","sizeValue":"1.1 MiB","publicFileName":"VRQ7TBPR.png","width":1280,"height":692}],"hentai":false}],"canvasMode":"none"};
  doStuff(collection);
</script>
</body></html>`;

describe("parseSlowPicsKey", () => {
  test("extracts /c/<key>", () => {
    expect(parseSlowPicsKey("https://slow.pics/c/cAjHr45r")).toBe("cAjHr45r");
    expect(parseSlowPicsKey("https://www.slow.pics/c/AbC123/")).toBe("AbC123");
    expect(parseSlowPicsKey("/redir.php?url=https://slow.pics/c/xY9z")).toBe("xY9z");
  });
  test("rejects non-comparison urls", () => {
    expect(parseSlowPicsKey("https://slow.pics/")).toBeNull();
    expect(parseSlowPicsKey("https://example.com/c/abc")).toBeNull();
  });
});

describe("extractCollection + collectionToGridInfo", () => {
  test("parses the inline collection from real page HTML", () => {
    const col = extractCollection(REAL_PAGE);
    expect(col).not.toBeNull();
    expect(col!.comparisons.length).toBe(2);
    const info = collectionToGridInfo(col!);
    expect(info).not.toBeNull();
    expect(info!.names).toEqual(["S", "F", "E"]);
    expect(info!.numCols).toBe(3);
    expect(info!.imageUrls[0]).toEqual([
      "https://i.slow.pics/bE1k0gEY.png",
      "https://i.slow.pics/fiD7KHnZ.png",
      "https://i.slow.pics/EKhTPw0K.png",
    ]);
  });
  test("balanced-brace scan ignores braces inside strings", () => {
    const html = `x var collection = {"name":"a } { b","comparisons":[{"images":[{"name":"X","publicFileName":"p.png"},{"name":"Y","publicFileName":"q.png"}]}]} ;`;
    const col = extractCollection(html);
    expect(col).not.toBeNull();
    expect(collectionToGridInfo(col!)!.names).toEqual(["X", "Y"]);
  });
  test("cleans (B)/dotted source names", () => {
    const html = `var collection = {"comparisons":[{"images":[{"name":"(B) Source.A","publicFileName":"p.png"},{"name":"Encode.B","publicFileName":"q.png"}]}]}`;
    expect(collectionToGridInfo(extractCollection(html)!)!.names).toEqual([
      "Source A", "Encode B",
    ]);
  });
  test("returns null when no collection present", () => {
    expect(extractCollection("<html>no data here</html>")).toBeNull();
  });
});

import { buildRescueGrid } from "../../src/sites/hdbits-slowpics";

function mockImg(hash: string): HTMLImageElement {
  return { src: `https://t.hdbits.org/${hash}.jpg`, closest: () => null } as unknown as HTMLImageElement;
}

describe("buildRescueGrid", () => {
  const info = { names: ["S", "F", "E"], numCols: 3, imageUrls: [] };
  test("reshapes a flat 9-image block into a 3x3 grid", () => {
    const imgs = ["a", "b", "c", "d", "e", "f", "g", "h", "i"].map(mockImg);
    const grid = buildRescueGrid(imgs, info)!;
    expect(grid.numCols).toBe(3);
    expect(grid.rows.length).toBe(3);
    expect(grid.names).toEqual(["S", "F", "E"]);
    expect(grid.rows[0].map((c) => c.full)).toEqual([
      "https://i.hdbits.org/a.png",
      "https://i.hdbits.org/b.png",
      "https://i.hdbits.org/c.png",
    ]);
  });
  test("rejects when image count doesn't fit the column count", () => {
    expect(buildRescueGrid(["a", "b", "c", "d"].map(mockImg), info)).toBeNull();
  });
  test("rejects fewer than 2 columns", () => {
    expect(buildRescueGrid([mockImg("a"), mockImg("b")], { names: ["S"], numCols: 1, imageUrls: [] })).toBeNull();
  });
});

import { slowPicsKeyFromAnchor } from "../../src/sites/slowpics-source";

describe("slowPicsKeyFromAnchor (HDBits redirect wrapper)", () => {
  test("reads the slow.pics key from the link text when href is a redirect", () => {
    // Real HDBits shape: href is /redir.php?url=<base64>, text is the URL.
    expect(slowPicsKeyFromAnchor(
      "/redir.php?url=aHR0cHM6Ly9zbG93LnBpY3MvYy9jQWpIcjQ1cg%3D%3D",
      "https://slow.pics/c/cAjHr45r",
    )).toBe("cAjHr45r");
  });
  test("decodes the base64 redirect param when text is unhelpful", () => {
    expect(slowPicsKeyFromAnchor(
      "/redir.php?url=aHR0cHM6Ly9zbG93LnBpY3MvYy9jQWpIcjQ1cg%3D%3D",
      "click here",
    )).toBe("cAjHr45r");
  });
  test("handles a plain direct slow.pics href", () => {
    expect(slowPicsKeyFromAnchor("https://slow.pics/c/AbC123", "")).toBe("AbC123");
  });
  test("returns null for unrelated links", () => {
    expect(slowPicsKeyFromAnchor("/redir.php?url=aHR0cHM6Ly9leGFtcGxlLmNvbQ%3D%3D", "https://example.com")).toBeNull();
    expect(slowPicsKeyFromAnchor("#", "Show comparison")).toBeNull();
  });
});
