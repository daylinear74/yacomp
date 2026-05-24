import { describe, test, expect } from "bun:test";
import {
  calcScrollSpacerHeights,
  resetWheelZoomGesture,
  type WheelZoomGestureState,
} from "../../src/viewer/comparison";

describe("calcScrollSpacerHeights", () => {
  test("computes spacers for centered scrolling", () => {
    const result = calcScrollSpacerHeights(800, 400, 300);
    expect(result.top).toBe(200);
    expect(result.bottom).toBe(250);
  });
  test("clamps to zero when row taller than half viewport", () => {
    const result = calcScrollSpacerHeights(400, 600, 600);
    expect(result.top).toBe(0);
    expect(result.bottom).toBe(0);
  });
});

describe("resetWheelZoomGesture", () => {
  test("clears anchor and timer", () => {
    const state: WheelZoomGestureState = {
      anchor: { comp: {} as any, rowIdx: 0, currentRowIdx: 0, rowXRatio: 0.5, rowYRatio: 0.5, viewportX: 100, viewportY: 100, scrollTopBounds: "content" },
      resetTimer: setTimeout(() => {}, 9999),
    };
    resetWheelZoomGesture(state);
    expect(state.anchor).toBeNull();
    expect(state.resetTimer).toBeNull();
  });
});
