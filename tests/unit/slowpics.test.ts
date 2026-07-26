import { describe, test, expect } from "bun:test";
import { slowPicsRowNames } from "../../src/sites/slowpics";

describe("slowPicsRowNames", () => {
  test("keeps per-row frame-type markers and reads dots as spaces", () => {
    const comps = [
      {
        images: [
          { name: "(B) Source.A", publicFileName: "a1.webp" },
          { name: "(B) Encode.X", publicFileName: "a2.webp" },
        ],
      },
      {
        images: [
          { name: "(P) Source.A", publicFileName: "b1.webp" },
          { name: "(P) Encode.X", publicFileName: "b2.webp" },
        ],
      },
    ];
    expect(slowPicsRowNames(comps)).toEqual([
      ["(B) Source A", "(B) Encode X"],
      ["(P) Source A", "(P) Encode X"],
    ]);
  });

  test("passes marker-less names through unchanged", () => {
    const comps = [
      { images: [{ name: "FRA", publicFileName: "x.webp" }, { name: "TWN", publicFileName: "y.webp" }] },
    ];
    expect(slowPicsRowNames(comps)).toEqual([["FRA", "TWN"]]);
  });
});
