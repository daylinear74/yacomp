// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  config.ts — validation, migration, in-memory mutation                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// These tests target the pure validate()/migrate() helpers and the
// saveConfig()/resetConfig() roundtrip. The module bootstraps from
// GM_getValue at import time; GM_setValue is wrapped in try/catch so it's
// safe to call saveConfig() under bun:test without a userscript host.

import { describe, test, expect, beforeEach } from "bun:test";
import {
  DEFAULTS,
  FILTER_MODE_IDS,
  GAMMA_PRESET_IDS,
  SITE_KEYS,
  bcStep,
  filterCycle,
  gammaCycle,
  getConfig,
  migrate,
  mouseSwitch,
  resetConfig,
  saveConfig,
  siteEnabled,
  validate,
  zoomScaleFactor,
} from "../../src/config";

// Reset state between tests so order independence holds. resetConfig only
// touches the in-memory record (persist() is a no-op under bun:test).
beforeEach(() => {
  resetConfig();
});

describe("validate — numeric clamping", () => {
  test("clamps bcStep to [0.01, 0.25] and falls back when out-of-range", () => {
    expect(validate({ bcStep: 0.1 }).bcStep).toBe(0.1);
    expect(validate({ bcStep: 0.005 }).bcStep).toBe(0.01);
    expect(validate({ bcStep: 99 }).bcStep).toBe(0.25);
  });
  test("rejects non-finite numbers with the default", () => {
    expect(validate({ bcStep: NaN }).bcStep).toBe(DEFAULTS.bcStep);
    expect(validate({ bcStep: "0.1" as unknown as number }).bcStep).toBe(DEFAULTS.bcStep);
    // clampNum's isFinite check kicks in before Math.min, so Infinity is
    // treated as "no usable number" and falls back rather than clamping to
    // the upper bound.
    expect(validate({ bcStep: Infinity }).bcStep).toBe(DEFAULTS.bcStep);
  });
  test("clamps zoomScaleFactor and lazyLoadMargin within bounds", () => {
    expect(validate({ zoomScaleFactor: 1.0 }).zoomScaleFactor).toBe(1.05);
    expect(validate({ zoomScaleFactor: 3.0 }).zoomScaleFactor).toBe(2.0);
    expect(validate({ lazyLoadMargin: -10 }).lazyLoadMargin).toBe(0);
    expect(validate({ lazyLoadMargin: 5000 }).lazyLoadMargin).toBe(2000);
  });
  test("clamps uiHideDelay to [200, 5000] and falls back when invalid", () => {
    expect(validate({ uiHideDelay: 1500 }).uiHideDelay).toBe(1500);
    expect(validate({ uiHideDelay: 50 }).uiHideDelay).toBe(200);
    expect(validate({ uiHideDelay: 99999 }).uiHideDelay).toBe(5000);
    expect(validate({ uiHideDelay: NaN }).uiHideDelay).toBe(DEFAULTS.uiHideDelay);
  });
});

describe("validate — discriminated unions", () => {
  test("defaultZoomMode only accepts 'fit' or '1:1'", () => {
    expect(validate({ defaultZoomMode: "fit" }).defaultZoomMode).toBe("fit");
    expect(validate({ defaultZoomMode: "1:1" }).defaultZoomMode).toBe("1:1");
    expect(validate({ defaultZoomMode: "huge" }).defaultZoomMode).toBe(
      DEFAULTS.defaultZoomMode,
    );
  });
  test("closeBtnPosition only accepts auto/left/right/hide", () => {
    expect(validate({ closeBtnPosition: "left" }).closeBtnPosition).toBe("left");
    expect(validate({ closeBtnPosition: "hide" }).closeBtnPosition).toBe("hide");
    expect(validate({ closeBtnPosition: "center" }).closeBtnPosition).toBe("auto");
  });
  test("uiChromeMode only accepts always/default/autohide", () => {
    expect(validate({ uiChromeMode: "always" }).uiChromeMode).toBe("always");
    expect(validate({ uiChromeMode: "autohide" }).uiChromeMode).toBe("autohide");
    expect(validate({ uiChromeMode: "nope" }).uiChromeMode).toBe(DEFAULTS.uiChromeMode);
  });
  test("ptpGridImageSize only accepts thumbnail/full", () => {
    expect(validate({ ptpGridImageSize: "full" }).ptpGridImageSize).toBe("full");
    expect(validate({ ptpGridImageSize: "thumbnail" }).ptpGridImageSize).toBe("thumbnail");
    expect(validate({ ptpGridImageSize: "tiny" }).ptpGridImageSize).toBe(DEFAULTS.ptpGridImageSize);
  });
  test("ptpGridClick only accepts viewer/tab", () => {
    expect(validate({ ptpGridClick: "tab" }).ptpGridClick).toBe("tab");
    expect(validate({ ptpGridClick: "viewer" }).ptpGridClick).toBe("viewer");
    expect(validate({ ptpGridClick: "nope" }).ptpGridClick).toBe(DEFAULTS.ptpGridClick);
  });
  test("ptpGridToggleStyle only accepts grid/triangles/text/custom", () => {
    expect(validate({ ptpGridToggleStyle: "triangles" }).ptpGridToggleStyle).toBe("triangles");
    expect(validate({ ptpGridToggleStyle: "custom" }).ptpGridToggleStyle).toBe("custom");
    expect(validate({ ptpGridToggleStyle: "nope" }).ptpGridToggleStyle).toBe(DEFAULTS.ptpGridToggleStyle);
  });
  test("ptpGridToggle labels trim, cap length, and fall back when blank or non-string", () => {
    expect(validate({ ptpGridToggleCollapsed: "▶" }).ptpGridToggleCollapsed).toBe("▶");
    expect(validate({ ptpGridToggleExpanded: "  ▼  " }).ptpGridToggleExpanded).toBe("▼");
    expect(validate({ ptpGridToggleCollapsed: "   " }).ptpGridToggleCollapsed).toBe(
      DEFAULTS.ptpGridToggleCollapsed,
    );
    expect(validate({ ptpGridToggleExpanded: 42 as unknown as string }).ptpGridToggleExpanded).toBe(
      DEFAULTS.ptpGridToggleExpanded,
    );
    expect(validate({ ptpGridToggleCollapsed: "x".repeat(50) }).ptpGridToggleCollapsed).toHaveLength(32);
  });
  test("zoomPercentBase only accepts 'original' or 'fit'", () => {
    expect(validate({ zoomPercentBase: "fit" }).zoomPercentBase).toBe("fit");
    expect(validate({ zoomPercentBase: "natural" }).zoomPercentBase).toBe(
      DEFAULTS.zoomPercentBase,
    );
  });
});

describe("validate — boolean fields", () => {
  test("non-boolean falls back to default", () => {
    expect(validate({ mouseSwitch: 1 as unknown as boolean }).mouseSwitch).toBe(
      DEFAULTS.mouseSwitch,
    );
    expect(validate({ verboseZoom: "true" as unknown as boolean }).verboseZoom).toBe(
      DEFAULTS.verboseZoom,
    );
  });
  test("boolean is preserved", () => {
    expect(validate({ mouseSwitch: false }).mouseSwitch).toBe(false);
    expect(validate({ verboseZoom: true }).verboseZoom).toBe(true);
  });
});

describe("validate — enabledSites", () => {
  test("defaults all sites to enabled when missing", () => {
    const sites = validate({}).enabledSites;
    for (const key of SITE_KEYS) expect(sites[key]).toBe(true);
  });
  test("preserves per-site booleans and ignores unknown keys", () => {
    const sites = validate({
      enabledSites: {
        bhd: false,
        hdbits: true,
        unknown: false,
        garbage: 42,
      },
    }).enabledSites;
    expect(sites.bhd).toBe(false);
    expect(sites.hdbits).toBe(true);
    // Sites we didn't mention stay at their default (true).
    expect(sites.ptp).toBe(true);
    expect((sites as Record<string, unknown>).unknown).toBeUndefined();
  });
  test("ignores non-object payload", () => {
    expect(validate({ enabledSites: null }).enabledSites.bhd).toBe(true);
    expect(validate({ enabledSites: "all" }).enabledSites.bhd).toBe(true);
  });
});

describe("validate — ordered id lists (filterCycle, gammaCycle)", () => {
  test("filters out unknown ids and dedupes preserved order", () => {
    const cycle = validate({
      filterCycle: ["chroma", "bogus", "solar1", "chroma", "luma"],
    }).filterCycle;
    expect(cycle).toEqual(["chroma", "solar1", "luma"]);
  });
  test("accepts empty list (user disabled every entry)", () => {
    expect(validate({ filterCycle: [] }).filterCycle).toEqual([]);
    expect(validate({ gammaCycle: [] }).gammaCycle).toEqual([]);
  });
  test("falls back to defaults when payload isn't an array", () => {
    expect(validate({ filterCycle: "chroma" }).filterCycle).toEqual([
      ...FILTER_MODE_IDS,
    ]);
    expect(validate({ gammaCycle: null }).gammaCycle).toEqual([
      ...GAMMA_PRESET_IDS,
    ]);
  });
});

describe("migrate", () => {
  test("v<2 backfills cycle and site fields without overwriting present values", () => {
    const migrated = migrate({ v: 1, bcStep: 0.1 });
    expect(migrated.enabledSites).toEqual(DEFAULTS.enabledSites);
    expect(migrated.filterCycle).toEqual(DEFAULTS.filterCycle);
    expect(migrated.gammaCycle).toEqual(DEFAULTS.gammaCycle);
    expect(migrated.bcStep).toBe(0.1);
  });
  test("v<2 keeps user-provided cycle data intact", () => {
    const migrated = migrate({ v: 1, filterCycle: ["chroma"] });
    expect(migrated.filterCycle).toEqual(["chroma"]);
  });
  test("v=2 is left alone", () => {
    const raw = { v: 2, bcStep: 0.1 };
    const migrated = migrate({ ...raw });
    expect(migrated).toEqual(raw);
  });
});

describe("saveConfig / resetConfig — in-memory mutation", () => {
  test("saveConfig partially updates and getters reflect the new value", () => {
    expect(bcStep()).toBe(DEFAULTS.bcStep);
    saveConfig({ bcStep: 0.1 });
    expect(bcStep()).toBe(0.1);
    expect(zoomScaleFactor()).toBe(DEFAULTS.zoomScaleFactor);
  });
  test("saveConfig revalidates: out-of-range gets clamped", () => {
    saveConfig({ bcStep: 99 });
    expect(bcStep()).toBe(0.25);
  });
  test("siteEnabled honors the saved enabledSites map", () => {
    expect(siteEnabled("bhd")).toBe(true);
    saveConfig({
      enabledSites: { ...getConfig().enabledSites, bhd: false },
    });
    expect(siteEnabled("bhd")).toBe(false);
    expect(siteEnabled("hdbits")).toBe(true);
  });
  test("filterCycle returns whatever saveConfig accepted", () => {
    saveConfig({ filterCycle: ["luma", "chroma"] });
    expect(filterCycle()).toEqual(["luma", "chroma"]);
  });
  test("resetConfig restores every field to DEFAULTS", () => {
    saveConfig({ bcStep: 0.1, mouseSwitch: false, gammaCycle: [] });
    expect(bcStep()).toBe(0.1);
    expect(mouseSwitch()).toBe(false);
    expect(gammaCycle()).toEqual([]);
    resetConfig();
    expect(bcStep()).toBe(DEFAULTS.bcStep);
    expect(mouseSwitch()).toBe(DEFAULTS.mouseSwitch);
    expect(gammaCycle()).toEqual([...GAMMA_PRESET_IDS]);
  });
});
