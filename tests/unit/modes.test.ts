// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  cycleMode — config-driven filter cycle                                   ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// cycleMode reads filterCycle() from config at every call. Tests mutate the
// in-memory config via saveConfig() and then walk the cycle, asserting the
// MODES[modeIndex].id at each step. Off (`modeIndex === 0`) is always the
// rest state between forward/backward sweeps.

import { describe, test, expect, beforeEach } from "bun:test";
import { resetConfig, saveConfig } from "../../src/config";
import { MODES, cycleMode, setModeIndex, modeIndex } from "../../src/filters/modes";

function curId(): string {
  return MODES[modeIndex].id;
}

beforeEach(() => {
  resetConfig();
  setModeIndex(0);
});

describe("cycleMode — full default cycle", () => {
  test("forward from off walks every enabled mode then returns to off", () => {
    const seen: string[] = [];
    for (let i = 0; i < 7; i++) {
      cycleMode(1);
      seen.push(curId());
    }
    expect(seen).toEqual([
      "solar1", "solar2", "residual", "luma", "chroma", "off", "solar1",
    ]);
  });
  test("backward from off lands on the last enabled mode", () => {
    cycleMode(-1);
    expect(curId()).toBe("chroma");
  });
});

describe("cycleMode — restricted enabled set", () => {
  test("user with only chroma enabled toggles between off and chroma", () => {
    saveConfig({ filterCycle: ["chroma"] });
    cycleMode(1);
    expect(curId()).toBe("chroma");
    cycleMode(1);
    expect(curId()).toBe("off");
    cycleMode(1);
    expect(curId()).toBe("chroma");
  });
  test("custom order is honored (not the FILTER_MODE_IDS source order)", () => {
    // luma → chroma → solar1 — opposite of the default sequence's first triplet.
    saveConfig({ filterCycle: ["luma", "chroma", "solar1"] });
    cycleMode(1); expect(curId()).toBe("luma");
    cycleMode(1); expect(curId()).toBe("chroma");
    cycleMode(1); expect(curId()).toBe("solar1");
    cycleMode(1); expect(curId()).toBe("off");
  });
  test("backward from a non-off mode returns to off when the mode is the cycle's first entry", () => {
    saveConfig({ filterCycle: ["solar1", "luma"] });
    cycleMode(1); // off → solar1
    expect(curId()).toBe("solar1");
    cycleMode(-1); // solar1 → off
    expect(curId()).toBe("off");
  });
});

describe("cycleMode — degenerate inputs", () => {
  test("empty filterCycle pins the mode at off", () => {
    saveConfig({ filterCycle: [] });
    cycleMode(1);
    expect(curId()).toBe("off");
    cycleMode(-1);
    expect(curId()).toBe("off");
  });
  test("current mode no longer in the cycle resets to off (recovery path)", () => {
    // Simulate: user is on chroma, then opens settings and removes chroma.
    saveConfig({ filterCycle: ["solar1", "luma", "chroma"] });
    cycleMode(1); cycleMode(1); cycleMode(1);
    expect(curId()).toBe("chroma");
    saveConfig({ filterCycle: ["solar1", "luma"] });
    cycleMode(1);
    expect(curId()).toBe("off");
  });
});
