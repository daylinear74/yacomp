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
  test("luma filters expose the limited Y preview", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-luma709");

    expectValuesClose(values.slice(0, 5), [
      0.2126 * 219 / 255,
      0.7152 * 219 / 255,
      0.0722 * 219 / 255,
      0,
      16 / 255,
    ]);
  });

  test("full luma filters keep display RGB luma in full range", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-luma709-full");

    expectValuesClose(values.slice(0, 5), [
      0.2126,
      0.7152,
      0.0722,
      0,
      0,
    ]);
  });

  test("chroma filters expose the limited chroma preview", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-chroma709");

    expectValuesClose(values.slice(0, 5), [
      (1 - 0.2126) * 224 / 255,
      -0.7152 * 224 / 255,
      -0.0722 * 224 / 255,
      0,
      128 / 255,
    ]);
  });

  test("full chroma filters keep full-range RGB residuals over neutral luma", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-chroma709-full");

    expectValuesClose(values.slice(0, 5), [
      1 - 0.2126,
      -0.7152,
      -0.0722,
      0,
      (128 - 16) / 219,
    ]);
  });
});
