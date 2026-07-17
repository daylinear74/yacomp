// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  User configuration — persistent settings via GM_getValue / GM_setValue  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  isReservedShortcut, isValidShortcut, mouseShortcutMatches, shortcutsEqual,
  type Shortcut, type ShortcutPair,
} from "./shortcuts/types";
import { ACTIONS, defaultPair, isActionId, type ActionId } from "./shortcuts/registry";

export const SITE_KEYS = [
  "bhd", "comppics", "frds", "gpw", "hdbits", "ptp", "slowpics", "ssd",
  "blutopia", "aither",
] as const;
export type SiteKey = typeof SITE_KEYS[number];

export const SITE_LABELS: Record<SiteKey, string> = {
  bhd: "BHD",
  comppics: "comp.pics",
  frds: "FRDS",
  gpw: "GPW",
  hdbits: "HDB",
  ptp: "PTP",
  slowpics: "slow.pics",
  ssd: "SSD",
  blutopia: "BLU",
  aither: "ATH",
};

export const FILTER_MODE_IDS = [
  "solar1", "solar2", "residual", "luma", "chroma",
] as const;
export type FilterModeId = typeof FILTER_MODE_IDS[number];

export const GAMMA_PRESET_IDS = [
  "aeqt-0p88", "srgb-bt1886", "legacy-mac",
] as const;
export type GammaPresetId = typeof GAMMA_PRESET_IDS[number];

export interface YacompConfig {
  v: number;
  defaultZoomMode: "fit" | "1:1";
  fillCanvasDefault: boolean;
  navMapDefault: boolean;
  bgLoadDefault: boolean;
  bcStep: number;
  toastDuration: number;
  zoomScaleFactor: number;
  lazyLoadMargin: number;
  mouseSwitch: boolean;
  zoomPercentBase: "original" | "fit";
  // What "1:1" maps one source pixel to: a physical device pixel (HiDPI-aware —
  // a 4K shot fills a 1080p@2x screen) or a CSS pixel (the browser's logical 100%,
  // which looks 2x magnified on Retina). No effect when devicePixelRatio is 1.
  oneToOnePixels: "device" | "logical";
  verboseZoom: boolean;
  closeBtnPosition: "auto" | "left" | "right" | "hide";
  // Viewer chrome visibility policy (① auto-hide UI):
  //  "always"   — source titles, row nav and buttons all stay fully visible.
  //  "default"  — titles + row nav sit dimmed (full on action); buttons auto-hide.
  //  "autohide" — titles + row nav hidden (show on action); buttons show only
  //               when the cursor is near them.
  uiChromeMode: "always" | "default" | "autohide";
  uiHideDelay: number;
  // PTP inline image grid: load the comparison's shots at PTP's thumbnail
  // (/t/) or full (/i/) resolution. Non-PTP-hosted URLs are shown as-is.
  ptpGridImageSize: "thumbnail" | "full";
  // What clicking a PTP grid tile does: open the yacomp viewer at that image,
  // or open the full image in a new browser tab.
  ptpGridClick: "viewer" | "tab";
  // What clicking an HDBits comparison image does: open the yacomp viewer at
  // that shot, or leave HDBits' native behavior (open the full image).
  hdbitsImageClick: "viewer" | "native";
  // Whether the HDBits forum custom-comparison builder appears in every thread,
  // or (default) only in Comparisons-forum threads.
  hdbitsManualAllThreads: boolean;
  // The PTP grid toggle's label style: a preset glyph/word pair, or "custom"
  // to use the free-text labels below.
  ptpGridToggleStyle: "grid" | "triangles" | "text" | "custom";
  // Custom toggle labels, by fold state — used only when the style is "custom".
  ptpGridToggleCollapsed: string;
  ptpGridToggleExpanded: string;
  enabledSites: Record<SiteKey, boolean>;
  filterCycle: FilterModeId[];
  gammaCycle: GammaPresetId[];
  // Customizable shortcuts (③): only user OVERRIDES are stored, keyed by action
  // id. The effective binding is the override or the registry default.
  shortcuts: Partial<Record<ActionId, ShortcutPair>>;
}

const STORAGE_KEY = "yacomp_config";
const CURRENT_VERSION = 4;

const ALL_SITES_ENABLED = Object.fromEntries(
  SITE_KEYS.map((k) => [k, true]),
) as Record<SiteKey, boolean>;

export const DEFAULTS: Readonly<YacompConfig> = {
  v: CURRENT_VERSION,
  defaultZoomMode: "1:1",
  fillCanvasDefault: false,
  navMapDefault: true,
  bgLoadDefault: false,
  bcStep: 0.05,
  toastDuration: 2000,
  zoomScaleFactor: 1.25,
  lazyLoadMargin: 200,
  mouseSwitch: true,
  zoomPercentBase: "original",
  oneToOnePixels: "logical" as const,
  verboseZoom: false,
  closeBtnPosition: "auto" as const,
  uiChromeMode: "default" as const,
  uiHideDelay: 1000,
  ptpGridImageSize: "thumbnail" as const,
  ptpGridClick: "viewer" as const,
  hdbitsImageClick: "viewer" as const,
  hdbitsManualAllThreads: false,
  ptpGridToggleStyle: "grid" as const,
  ptpGridToggleCollapsed: "▦",
  ptpGridToggleExpanded: "▦",
  enabledSites: ALL_SITES_ENABLED,
  filterCycle: [...FILTER_MODE_IDS],
  gammaCycle: [...GAMMA_PRESET_IDS],
  shortcuts: {},
};

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== "number" || !isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
}

// A short free-text label (e.g. the PTP grid toggle glyph). Trimmed, length-
// capped, and never empty — a blank label would be an unclickable control.
function validateLabel(val: unknown, fallback: string): string {
  if (typeof val !== "string") return fallback;
  const t = val.trim();
  return t ? t.slice(0, 32) : fallback;
}

function validateEnabledSites(raw: unknown): Record<SiteKey, boolean> {
  const result = { ...ALL_SITES_ENABLED };
  if (typeof raw !== "object" || raw === null) return result;
  const obj = raw as Record<string, unknown>;
  for (const key of SITE_KEYS) {
    if (typeof obj[key] === "boolean") result[key] = obj[key] as boolean;
  }
  return result;
}

function validateOrderedIdList<T extends string>(
  raw: unknown,
  knownIds: readonly T[],
  fallback: readonly T[],
): T[] {
  if (!Array.isArray(raw)) return [...fallback];
  const known = new Set<string>(knownIds);
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of raw) {
    if (typeof item === "string" && known.has(item) && !seen.has(item)) {
      seen.add(item);
      result.push(item as T);
    }
  }
  return result;
}

function validateShortcuts(raw: unknown): Partial<Record<ActionId, ShortcutPair>> {
  const out: Partial<Record<ActionId, ShortcutPair>> = {};
  if (typeof raw !== "object" || raw === null) return out;
  for (const [id, val] of Object.entries(raw as Record<string, unknown>)) {
    if (!isActionId(id)) continue;
    if (typeof val !== "object" || val === null) continue;
    const v = val as Record<string, unknown>;
    // A binding must have a valid `main`; `extra` is optional.
    if (!isValidShortcut(v.main) || isReservedShortcut(v.main)) continue;
    const extra = isValidShortcut(v.extra) && !isReservedShortcut(v.extra)
      ? (v.extra as Shortcut)
      : null;
    out[id] = { main: v.main as Shortcut, extra };
  }
  return out;
}

export function validate(raw: Record<string, unknown>): YacompConfig {
  return {
    v: CURRENT_VERSION,
    defaultZoomMode:
      raw.defaultZoomMode === "fit" || raw.defaultZoomMode === "1:1"
        ? raw.defaultZoomMode
        : DEFAULTS.defaultZoomMode,
    fillCanvasDefault:
      typeof raw.fillCanvasDefault === "boolean"
        ? raw.fillCanvasDefault
        : DEFAULTS.fillCanvasDefault,
    navMapDefault:
      typeof raw.navMapDefault === "boolean"
        ? raw.navMapDefault
        : DEFAULTS.navMapDefault,
    bgLoadDefault:
      typeof raw.bgLoadDefault === "boolean"
        ? raw.bgLoadDefault
        : DEFAULTS.bgLoadDefault,
    bcStep: clampNum(raw.bcStep, 0.01, 0.25, DEFAULTS.bcStep),
    toastDuration: clampNum(raw.toastDuration, 500, 10000, DEFAULTS.toastDuration),
    zoomScaleFactor: clampNum(raw.zoomScaleFactor, 1.05, 2.0, DEFAULTS.zoomScaleFactor),
    lazyLoadMargin: clampNum(raw.lazyLoadMargin, 0, 2000, DEFAULTS.lazyLoadMargin),
    mouseSwitch:
      typeof raw.mouseSwitch === "boolean"
        ? raw.mouseSwitch
        : DEFAULTS.mouseSwitch,
    zoomPercentBase:
      raw.zoomPercentBase === "original" || raw.zoomPercentBase === "fit"
        ? raw.zoomPercentBase
        : DEFAULTS.zoomPercentBase,
    oneToOnePixels:
      raw.oneToOnePixels === "device" || raw.oneToOnePixels === "logical"
        ? raw.oneToOnePixels
        : DEFAULTS.oneToOnePixels,
    verboseZoom:
      typeof raw.verboseZoom === "boolean"
        ? raw.verboseZoom
        : DEFAULTS.verboseZoom,
    closeBtnPosition:
      raw.closeBtnPosition === "auto" || raw.closeBtnPosition === "left" || raw.closeBtnPosition === "right" || raw.closeBtnPosition === "hide"
        ? raw.closeBtnPosition
        : DEFAULTS.closeBtnPosition,
    uiChromeMode:
      raw.uiChromeMode === "always" || raw.uiChromeMode === "default" || raw.uiChromeMode === "autohide"
        ? raw.uiChromeMode
        : DEFAULTS.uiChromeMode,
    uiHideDelay: clampNum(raw.uiHideDelay, 200, 5000, DEFAULTS.uiHideDelay),
    ptpGridImageSize:
      raw.ptpGridImageSize === "thumbnail" || raw.ptpGridImageSize === "full"
        ? raw.ptpGridImageSize
        : DEFAULTS.ptpGridImageSize,
    ptpGridClick:
      raw.ptpGridClick === "viewer" || raw.ptpGridClick === "tab"
        ? raw.ptpGridClick
        : DEFAULTS.ptpGridClick,
    hdbitsImageClick:
      raw.hdbitsImageClick === "viewer" || raw.hdbitsImageClick === "native"
        ? raw.hdbitsImageClick
        : DEFAULTS.hdbitsImageClick,
    hdbitsManualAllThreads:
      typeof raw.hdbitsManualAllThreads === "boolean"
        ? raw.hdbitsManualAllThreads
        : DEFAULTS.hdbitsManualAllThreads,
    ptpGridToggleStyle:
      raw.ptpGridToggleStyle === "grid" || raw.ptpGridToggleStyle === "triangles" ||
      raw.ptpGridToggleStyle === "text" || raw.ptpGridToggleStyle === "custom"
        ? raw.ptpGridToggleStyle
        : DEFAULTS.ptpGridToggleStyle,
    ptpGridToggleCollapsed: validateLabel(raw.ptpGridToggleCollapsed, DEFAULTS.ptpGridToggleCollapsed),
    ptpGridToggleExpanded: validateLabel(raw.ptpGridToggleExpanded, DEFAULTS.ptpGridToggleExpanded),
    enabledSites: validateEnabledSites(raw.enabledSites),
    filterCycle: validateOrderedIdList(raw.filterCycle, FILTER_MODE_IDS, DEFAULTS.filterCycle),
    gammaCycle: validateOrderedIdList(raw.gammaCycle, GAMMA_PRESET_IDS, DEFAULTS.gammaCycle),
    shortcuts: validateShortcuts(raw.shortcuts),
  };
}

export function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const v = typeof raw.v === "number" ? raw.v : 0;
  if (v < 2) {
    raw.enabledSites ??= DEFAULTS.enabledSites;
    raw.filterCycle ??= DEFAULTS.filterCycle;
    raw.gammaCycle ??= DEFAULTS.gammaCycle;
  }
  // v3 (prerelease only) added separate "lumaFull"/"chromaFull" cycle entries.
  // The luma/chroma filters are now full-range by default, so those ids are
  // gone; validateOrderedIdList drops them from any stored cycle and the
  // version bump re-persists the cleaned config.
  return raw;
}

let config: YacompConfig;

try {
  const stored = GM_getValue(STORAGE_KEY, DEFAULTS as unknown) as Record<string, unknown>;
  const raw = typeof stored === "object" && stored !== null ? stored : {};
  config = validate(migrate(raw));
  if ((stored as { v?: number })?.v !== CURRENT_VERSION) {
    GM_setValue(STORAGE_KEY, config);
  }
} catch {
  config = { ...DEFAULTS };
}

// Typed getters
export function defaultZoomMode(): "fit" | "1:1" { return config.defaultZoomMode; }
export function fillCanvasDefault(): boolean { return config.fillCanvasDefault; }
export function navMapDefault(): boolean { return config.navMapDefault; }
export function bgLoadDefault(): boolean { return config.bgLoadDefault; }
export function bcStep(): number { return config.bcStep; }
export function toastDuration(): number { return config.toastDuration; }
export function zoomScaleFactor(): number { return config.zoomScaleFactor; }
export function lazyLoadMargin(): number { return config.lazyLoadMargin; }
export function mouseSwitch(): boolean { return config.mouseSwitch; }
export function zoomPercentBase(): "original" | "fit" { return config.zoomPercentBase; }
export function oneToOnePixels(): "device" | "logical" { return config.oneToOnePixels; }
export function verboseZoom(): boolean { return config.verboseZoom; }
export function closeBtnPosition(): "auto" | "left" | "right" | "hide" { return config.closeBtnPosition; }
export function uiChromeMode(): "always" | "default" | "autohide" { return config.uiChromeMode; }
export function uiHideDelay(): number { return config.uiHideDelay; }
export function ptpGridImageSize(): "thumbnail" | "full" { return config.ptpGridImageSize; }
export function ptpGridClick(): "viewer" | "tab" { return config.ptpGridClick; }
export function hdbitsImageClick(): "viewer" | "native" { return config.hdbitsImageClick; }
export function hdbitsManualAllThreads(): boolean { return config.hdbitsManualAllThreads; }
export function ptpGridToggleStyle(): "grid" | "triangles" | "text" | "custom" { return config.ptpGridToggleStyle; }
export function ptpGridToggleCollapsed(): string { return config.ptpGridToggleCollapsed; }
export function ptpGridToggleExpanded(): string { return config.ptpGridToggleExpanded; }

export function siteEnabled(key: SiteKey): boolean { return config.enabledSites[key]; }

/** Effective binding for an action: the user override or the registry default. */
export function shortcutPairFor(id: ActionId): ShortcutPair {
  return config.shortcuts[id] ?? defaultPair(id);
}

/** True when "close viewer" is bound (main or extra) to a canvas click /
 *  double-click — in which case the close button is redundant and hidden. */
export function closeUsesCanvasClick(): boolean {
  const p = shortcutPairFor("viewer.close");
  return [p.main, p.extra].some(
    (s) => s != null && (mouseShortcutMatches(s, "click") || mouseShortcutMatches(s, "dblclick")),
  );
}

/** Persist a full binding pair for one action (settings editor). */
export function setShortcutPair(id: ActionId, pair: ShortcutPair): void {
  saveConfig({ shortcuts: { ...config.shortcuts, [id]: pair } });
}

/** Restore every shortcut to its registry default. */
export function resetShortcuts(): void {
  saveConfig({ shortcuts: {} });
}

/** The other action already using `sc` (any slot), or null — for hard-locking
 *  duplicate bindings. The (excludeId, excludeSlot) being edited is ignored. */
export function findShortcutConflict(
  sc: Shortcut,
  excludeId: ActionId,
  excludeSlot: "main" | "extra",
): ActionId | null {
  for (const meta of ACTIONS) {
    const p = shortcutPairFor(meta.id);
    if (!(meta.id === excludeId && excludeSlot === "main") && shortcutsEqual(p.main, sc)) {
      return meta.id;
    }
    if (!(meta.id === excludeId && excludeSlot === "extra") && p.extra && shortcutsEqual(p.extra, sc)) {
      return meta.id;
    }
  }
  return null;
}
export function filterCycle(): readonly FilterModeId[] { return config.filterCycle; }
export function gammaCycle(): readonly GammaPresetId[] { return config.gammaCycle; }
export function getConfig(): Readonly<YacompConfig> { return config; }

// GM_setValue is provided by the userscript host. In unit tests and dev
// fixtures it may be undefined — fall back silently so the in-memory
// config can still be mutated without crashing the caller.
function persist(): void {
  try {
    GM_setValue(STORAGE_KEY, config);
  } catch {
    // no-op: GM_setValue unavailable (tests, fixture); in-memory state is
    // still authoritative for the current session.
  }
}

export function saveConfig(partial: Partial<YacompConfig>): void {
  Object.assign(config, partial);
  config.v = CURRENT_VERSION;
  config = validate(config as unknown as Record<string, unknown>);
  persist();
}

export function resetConfig(): void {
  config = { ...DEFAULTS };
  persist();
}

/** Pretty-printed JSON of the current config — for the settings export button. */
export function exportConfig(): string {
  return JSON.stringify(config, null, 2);
}

/** Replace the whole config from imported JSON (validated + migrated). Returns
 *  false on parse error or non-object payload; the current config is untouched. */
export function importConfig(json: string): boolean {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return false;
  }
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return false;
  config = validate(migrate(raw as Record<string, unknown>));
  persist();
  return true;
}
