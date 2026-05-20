import { describe, test, expect } from "bun:test";
import {
  cycleGammaMismatchCheck,
  gammaMismatchCheckExponent,
  gammaMismatchCheckFilter,
  gammaMismatchCheckValueLabel,
  gammaMismatchCheckPowLabel,
  gammaMismatchCheckName,
  gammaMismatchCheckHudLabel,
} from "../../src/filters/gamma-check";

describe("cycleGammaMismatchCheck", () => {
  test("forward from off enters the first preset", () => {
    expect(cycleGammaMismatchCheck(null, 1)).toBe("srgb-bt1886");
  });
  test("forward advances through the presets", () => {
    expect(cycleGammaMismatchCheck("srgb-bt1886", 1)).toBe("aeqt-0p88");
    expect(cycleGammaMismatchCheck("aeqt-0p88", 1)).toBe("legacy-mac");
  });
  test("forward past the last preset returns to off", () => {
    expect(cycleGammaMismatchCheck("legacy-mac", 1)).toBeNull();
  });
  test("backward from off enters the last preset", () => {
    expect(cycleGammaMismatchCheck(null, -1)).toBe("legacy-mac");
  });
  test("backward from the first preset returns to off", () => {
    expect(cycleGammaMismatchCheck("srgb-bt1886", -1)).toBeNull();
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
