import { describe, test, expect } from "bun:test";
import {
  isDefault, adjustBrightness, brightnessAdjustmentLabel, bcString,
  BC_STEP, BC_MIN, BC_MAX,
} from "../../src/filters/brightness";

describe("isDefault", () => {
  test("1.0 is default", () => expect(isDefault(1.0)).toBe(true));
  test("1.0005 is default (within tolerance)", () => expect(isDefault(1.0005)).toBe(true));
  test("0.95 is not default", () => expect(isDefault(0.95)).toBe(false));
});

describe("adjustBrightness", () => {
  test("increases by step", () => {
    expect(adjustBrightness(1.0, 1)).toBe(1.0 + BC_STEP);
  });
  test("decreases by step", () => {
    expect(adjustBrightness(1.0, -1)).toBe(1.0 - BC_STEP);
  });
  test("clamps at min", () => {
    expect(adjustBrightness(BC_MIN, -1)).toBe(BC_MIN);
  });
  test("clamps at max", () => {
    expect(adjustBrightness(BC_MAX, 1)).toBe(BC_MAX);
  });
});

describe("brightnessAdjustmentLabel", () => {
  test("formats percentage", () => {
    expect(brightnessAdjustmentLabel(1.0)).toBe("Brightness 100%");
    expect(brightnessAdjustmentLabel(0.5)).toBe("Brightness 50%");
  });
});

describe("bcString", () => {
  test("empty when both default", () => {
    expect(bcString(1.0, 1.0)).toBe("");
  });
  test("brightness only", () => {
    expect(bcString(1.5, 1.0)).toBe("brightness(1.50)");
  });
  test("contrast only", () => {
    expect(bcString(1.0, 0.8)).toBe("contrast(0.80)");
  });
  test("both", () => {
    expect(bcString(1.5, 0.8)).toBe("brightness(1.50) contrast(0.80)");
  });
});
