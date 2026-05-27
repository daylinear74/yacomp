import { describe, test, expect, beforeAll, beforeEach } from "bun:test";

beforeAll(() => {
  // Minimum DOM globals for zoom math + shadow-root lookups (zoomToast and
  // snapZoom both call getShadowRoot() lazily). The stubs are partial on
  // purpose — bun:test runs in Node and tsc complains about every missing
  // property if we don't cast through unknown.
  (globalThis as Record<string, unknown>).window = { innerWidth: 1024 };
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({
      attachShadow: () => ({ querySelector: () => null, getElementById: () => null }),
      style: { cssText: "" },
    }),
    body: { appendChild: () => undefined },
  };
});

import { calcZoom, snapZoom, zoomToast } from "../../src/filters/zoom";
import { resetConfig, saveConfig } from "../../src/config";

beforeEach(() => {
  resetConfig();
});

describe("calcZoom — default scale factor (1.25)", () => {
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

describe("calcZoom — honors configurable zoomScaleFactor", () => {
  test("user-tweaked 1.5x scale factor changes the step size", () => {
    saveConfig({ zoomScaleFactor: 1.5 });
    expect(calcZoom(1000, 1)).toBe(1500);
    expect(calcZoom(1500, -1)).toBe(1000);
  });
  test("upper-bound 2.0x doubles each step", () => {
    saveConfig({ zoomScaleFactor: 2.0 });
    expect(calcZoom(500, 1)).toBe(1000);
  });
  test("near-1.0 factor barely moves (1.05x)", () => {
    saveConfig({ zoomScaleFactor: 1.05 });
    expect(calcZoom(1000, 1)).toBe(1050);
  });
});

describe("snapZoom — snaps to reference width on crossing", () => {
  // In unit tests no shadow-DOM sizer exists, so getReferenceWidth falls
  // back to window.innerWidth (1024). The function snaps when the move
  // crosses that boundary.

  test("zooming in across the reference width lands on it", () => {
    // base 800 (< 1024 ref), next 1100 would jump past — snap to 1024.
    expect(snapZoom(800, 1100)).toBe(1024);
  });
  test("zooming out across the reference width also snaps", () => {
    expect(snapZoom(1300, 900)).toBe(1024);
  });
  test("no snap when the move stays on one side of the reference", () => {
    expect(snapZoom(800, 950)).toBe(950);
    expect(snapZoom(1300, 1100)).toBe(1100);
  });
  test("no snap when starting exactly at the reference width", () => {
    expect(snapZoom(1024, 1280)).toBe(1280);
  });
});

describe("zoomToast — verboseZoom toggle", () => {
  test("brief mode returns the single-line emoji label", () => {
    saveConfig({ verboseZoom: false });
    const toast = zoomToast();
    expect(typeof toast).toBe("string");
    expect(toast).toMatch(/^🔍/);
  });
  test("verbose mode returns multi-line ToastLine[]", () => {
    saveConfig({ verboseZoom: true });
    const toast = zoomToast();
    expect(Array.isArray(toast)).toBe(true);
    if (Array.isArray(toast)) {
      // The leading line carries the emoji label; subsequent lines are pixel
      // counts and viewport callouts. We only assert structure here — the
      // exact strings depend on naturalWidth, which the e2e suite covers.
      expect(toast.length).toBeGreaterThanOrEqual(2);
      expect((toast[0] as { size?: string }).size).toBe("large");
    }
  });
});
