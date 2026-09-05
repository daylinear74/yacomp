import { describe, test, expect, beforeEach } from "bun:test";
import {
  isDefault, adjustBrightness, brightnessAdjustmentLabel, bcString,
  BC_MIN, BC_MAX,
} from "../../src/filters/brightness";
import { resetConfig, saveConfig } from "../../src/config";

beforeEach(() => {
  resetConfig();
});

describe("isDefault", () => {
  test("1.0 is default", () => expect(isDefault(1.0)).toBe(true));
  test("1.0005 is default (within tolerance)", () => expect(isDefault(1.0005)).toBe(true));
  test("0.95 is not default", () => expect(isDefault(0.95)).toBe(false));
});

describe("adjustBrightness — default bcStep", () => {
  test("increases by the default step (0.05)", () => {
    expect(adjustBrightness(1.0, 1)).toBe(1.05);
  });
  test("decreases by the default step", () => {
    expect(adjustBrightness(1.0, -1)).toBe(0.95);
  });
  test("clamps at min", () => {
    expect(adjustBrightness(BC_MIN, -1)).toBe(BC_MIN);
  });
  test("clamps at max", () => {
    expect(adjustBrightness(BC_MAX, 1)).toBe(BC_MAX);
  });
});

describe("adjustBrightness — honors configurable bcStep", () => {
  // adjustBrightness reads bcStep() from config at call time. These tests
  // are the safety net for users who tweak the step in settings: changing
  // DEFAULTS.bcStep in src/config.ts must NOT silently change the
  // configurable-step behavior these assertions pin down.

  test("0.10 step is applied symmetrically", () => {
    saveConfig({ bcStep: 0.10 });
    expect(adjustBrightness(1.0, 1)).toBeCloseTo(1.10, 5);
    expect(adjustBrightness(1.0, -1)).toBeCloseTo(0.90, 5);
  });
  test("0.01 fine-grain step nudges by 1%", () => {
    saveConfig({ bcStep: 0.01 });
    expect(adjustBrightness(1.0, 1)).toBeCloseTo(1.01, 5);
  });
  test("0.25 max step still clamps within [BC_MIN, BC_MAX]", () => {
    saveConfig({ bcStep: 0.25 });
    expect(adjustBrightness(BC_MAX - 0.01, 1)).toBe(BC_MAX);
    expect(adjustBrightness(BC_MIN + 0.01, -1)).toBe(BC_MIN);
  });
  test("rounds to 2 decimal places regardless of step", () => {
    saveConfig({ bcStep: 0.07 });
    // 1.0 + 0.07 = 1.07; the +0.01 toFixed roundtrip should leave it alone.
    expect(adjustBrightness(1.0, 1)).toBe(1.07);
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
