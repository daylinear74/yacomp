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
  test("luma filters map display RGB into limited Y range 16..235", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-luma709");

    expectValuesClose(values.slice(0, 5), [
      0.2126 * 219 / 255,
      0.7152 * 219 / 255,
      0.0722 * 219 / 255,
      0,
      16 / 255,
    ]);
  });

  test("chroma filters use limited chroma range 16..240, centered at 128", () => {
    const values = matrixValues(svgFilterDefsMarkup(), "scf-chroma709");

    expectValuesClose(values.slice(0, 5), [
      (1 - 0.2126) * 224 / 255,
      -0.7152 * 224 / 255,
      -0.0722 * 224 / 255,
      0,
      128 / 255,
    ]);
  });
});
