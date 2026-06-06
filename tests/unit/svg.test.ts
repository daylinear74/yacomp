import { describe, expect, test } from "bun:test";
import { svgFilterDefsMarkup } from "../../src/filters/svg";

function expectValuesClose(actual: number[], expected: number[]): void {
  expect(actual).toHaveLength(expected.length);
  for (let i = 0; i < expected.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], 12);
  }
}

function matrixValues(markup: string, filterId: string): number[] {
  const filterMatch = markup.match(new RegExp(`<filter id="${filterId}"[\\s\\S]*?</filter>`));
  expect(filterMatch).not.toBeNull();
  const valuesMatch = filterMatch![0].match(/values="([^"]+)"/);
  expect(valuesMatch).not.toBeNull();
  return valuesMatch![1].trim().split(/\s+/).map(Number);
}

describe("SVG luma/chroma filters", () => {
  test("luma 709 filter is full-range Rec.709 Y in display RGB", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-luma709");

    expectValuesClose(values.slice(0, 5), [0.2126, 0.7152, 0.0722, 0, 0]);
  });

  test("luma 2020 filter is full-range Rec.2020 Y in display RGB", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-luma2020");

    expectValuesClose(values.slice(0, 5), [0.2627, 0.6780, 0.0593, 0, 0]);
  });

  test("chroma 709 filter is the full-range residual over neutral luma", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-chroma709");

    expectValuesClose(values.slice(0, 5), [
      1 - 0.2126,
      -0.7152,
      -0.0722,
      0,
      (128 - 16) / 219,
    ]);
  });

  test("chroma 2020 filter is the full-range residual over neutral luma", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-chroma2020");

    expectValuesClose(values.slice(0, 5), [
      1 - 0.2627,
      -0.6780,
      -0.0593,
      0,
      (128 - 16) / 219,
    ]);
  });
});
