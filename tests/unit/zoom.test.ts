import { describe, test, expect, beforeAll } from "bun:test";

beforeAll(() => {
  // @ts-ignore
  globalThis.window = { innerWidth: 1024 };
});

import { calcZoom } from "../../src/filters/zoom";

describe("calcZoom", () => {
  test("zooms in by 25%", () => {
    expect(calcZoom(1000, 1)).toBe(1250);
  });
  test("zooms out by 25%", () => {
    expect(calcZoom(1000, -1)).toBe(800);
  });
  test("clamps max at 8x viewport", () => {
    expect(calcZoom(1024 * 8, 1)).toBe(1024 * 8);
  });
  test("clamps min at 10% viewport", () => {
    expect(calcZoom(103, -1)).toBe(102);
  });
});
