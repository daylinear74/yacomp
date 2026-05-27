import { describe, test, expect, beforeEach } from "bun:test";
import {
  cycleGammaMismatchCheck,
  gammaMismatchCheckExponent,
  gammaMismatchCheckFilter,
  gammaMismatchCheckValueLabel,
  gammaMismatchCheckPowLabel,
  gammaMismatchCheckName,
  gammaMismatchCheckHudLabel,
} from "../../src/filters/gamma-check";
import { resetConfig, saveConfig } from "../../src/config";

beforeEach(() => {
  resetConfig();
});

describe("cycleGammaMismatchCheck — default cycle (all presets enabled)", () => {
  test("forward from off enters the first preset", () => {
    expect(cycleGammaMismatchCheck(null, 1)).toBe("aeqt-0p88");
  });
  test("forward advances through the presets", () => {
    expect(cycleGammaMismatchCheck("aeqt-0p88", 1)).toBe("srgb-bt1886");
    expect(cycleGammaMismatchCheck("srgb-bt1886", 1)).toBe("legacy-mac");
  });
  test("forward past the last preset returns to off", () => {
    expect(cycleGammaMismatchCheck("legacy-mac", 1)).toBeNull();
  });
  test("backward from off enters the last preset", () => {
    expect(cycleGammaMismatchCheck(null, -1)).toBe("legacy-mac");
  });
  test("backward from the first preset returns to off", () => {
    expect(cycleGammaMismatchCheck("aeqt-0p88", -1)).toBeNull();
  });
});

describe("cycleGammaMismatchCheck — honors configurable gammaCycle", () => {
  // The function reads gammaCycle() at every call. These tests pin down the
  // configurable-subset behavior: changing the user's enabled set in
  // settings must actually narrow the cycle.

  test("single-preset cycle toggles between that preset and off", () => {
    saveConfig({ gammaCycle: ["aeqt-0p88"] });
    expect(cycleGammaMismatchCheck(null, 1)).toBe("aeqt-0p88");
    expect(cycleGammaMismatchCheck("aeqt-0p88", 1)).toBeNull();
    expect(cycleGammaMismatchCheck(null, -1)).toBe("aeqt-0p88");
  });
  test("two-preset cycle in custom order is honored", () => {
    saveConfig({ gammaCycle: ["legacy-mac", "srgb-bt1886"] });
    expect(cycleGammaMismatchCheck(null, 1)).toBe("legacy-mac");
    expect(cycleGammaMismatchCheck("legacy-mac", 1)).toBe("srgb-bt1886");
    expect(cycleGammaMismatchCheck("srgb-bt1886", 1)).toBeNull();
  });
  test("empty cycle keeps the user at off", () => {
    saveConfig({ gammaCycle: [] });
    expect(cycleGammaMismatchCheck(null, 1)).toBeNull();
    expect(cycleGammaMismatchCheck(null, -1)).toBeNull();
  });
  test("active preset removed from the cycle: forward skips to start, backward to last", () => {
    // User was on aeqt-0p88, then removed it from settings. The function
    // treats the no-longer-present id as idx -1 and the modular arithmetic
    // (count = enabled.length + 1) wraps it to the cycle's bookends.
    saveConfig({ gammaCycle: ["srgb-bt1886", "legacy-mac"] });
    // (idx=-1) + 1 + 3 = 3, 3 % 3 = 0 → first remaining preset.
    expect(cycleGammaMismatchCheck("aeqt-0p88", 1)).toBe("srgb-bt1886");
    // (idx=-1) + -1 + 3 = 1, 1 % 3 = 1 → enabledIds[1] (last enabled).
    expect(cycleGammaMismatchCheck("aeqt-0p88", -1)).toBe("legacy-mac");
  });
});

describe("gammaMismatchCheckExponent", () => {
  test("is the reciprocal of the preset ratio", () => {
    expect(gammaMismatchCheckExponent("srgb-bt1886")).toBeCloseTo(1 / 0.917, 5);
    expect(gammaMismatchCheckExponent("aeqt-0p88")).toBeCloseTo(1 / 0.88, 5);
  });
});

describe("gammaMismatchCheckFilter", () => {
  test("empty string when off", () => {
    expect(gammaMismatchCheckFilter(null)).toBe("");
  });
  test("references the preset's SVG filter id", () => {
    expect(gammaMismatchCheckFilter("srgb-bt1886")).toBe(
      "url(#scf-gamma-mismatch-srgb-bt1886)",
    );
  });
});

describe("gamma label formatting", () => {
  test("value label shows the percentage and formula", () => {
    expect(gammaMismatchCheckValueLabel("srgb-bt1886")).toBe("91.7% (2.2/2.4)");
  });
  test("pow label shows the reciprocal exponent", () => {
    expect(gammaMismatchCheckPowLabel("aeqt-0p88")).toBe("pow(1/0.880)");
  });
  test("name label is the preset's human label", () => {
    expect(gammaMismatchCheckName("legacy-mac")).toBe("Legacy Mac 1.8↔2.2");
  });
  test("HUD label splits into two lines", () => {
    expect(gammaMismatchCheckHudLabel("srgb-bt1886")).toEqual({
      line1: "γ 91.7% (2.2/2.4)",
      line2: "sRGB 2.2↔BT.1886 2.4",
    });
  });
});
