import { describe, test, expect } from "bun:test";
import {
  splitNames, hasVsOrPipe, looksLikeNames,
} from "../../src/grid/names";

describe("splitNames", () => {
  test("splits on pipe", () => {
    expect(splitNames("Source A | Source B")).toEqual(["Source A", "Source B"]);
  });
  test("splits on vs", () => {
    expect(splitNames("Encode vs Source")).toEqual(["Encode", "Source"]);
  });
  test("splits on vs.", () => {
    expect(splitNames("BDRemux vs. Encode")).toEqual(["BDRemux", "Encode"]);
  });
  test("splits on comma", () => {
    expect(splitNames("A, B, C")).toEqual(["A", "B", "C"]);
  });
  test("splits on dash", () => {
    expect(splitNames("Source - Encode")).toEqual(["Source", "Encode"]);
  });
  test("splits on slash", () => {
    expect(splitNames("Left / Right")).toEqual(["Left", "Right"]);
  });
  test("strips generic heading prefix", () => {
    expect(splitNames("Screenshot Comparison A | B")).toEqual(["A", "B"]);
  });
  test("single name returns array", () => {
    expect(splitNames("JustOneName")).toEqual(["JustOneName"]);
  });
});

describe("hasVsOrPipe", () => {
  test("pipe", () => expect(hasVsOrPipe("A | B")).toBe(true));
  test("vs", () => expect(hasVsOrPipe("A vs B")).toBe(true));
  test("comma", () => expect(hasVsOrPipe("A, B")).toBe(true));
  test("plain text", () => expect(hasVsOrPipe("hello world")).toBe(false));
});

describe("looksLikeNames", () => {
  test("valid names", () => {
    expect(looksLikeNames(["Source", "Encode"])).toBe(true);
  });
  test("rejects years", () => {
    expect(looksLikeNames(["2024", "Source"])).toBe(false);
  });
  test("rejects runtimes", () => {
    expect(looksLikeNames(["120 min", "Source"])).toBe(false);
  });
  test("rejects single item", () => {
    expect(looksLikeNames(["OnlyOne"])).toBe(false);
  });
});
