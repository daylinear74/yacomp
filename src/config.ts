// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  User configuration — persistent settings via GM_getValue / GM_setValue  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

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
  "srgb-bt1886", "aeqt-0p88", "legacy-mac",
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
  enabledSites: Record<SiteKey, boolean>;
  filterCycle: FilterModeId[];
  gammaCycle: GammaPresetId[];
}

const STORAGE_KEY = "yacomp_config";
const CURRENT_VERSION = 2;

const ALL_SITES_ENABLED = Object.fromEntries(
  SITE_KEYS.map((k) => [k, true]),
) as Record<SiteKey, boolean>;

export const DEFAULTS: Readonly<YacompConfig> = {
  v: CURRENT_VERSION,
  defaultZoomMode: "fit",
  fillCanvasDefault: false,
  navMapDefault: true,
  bgLoadDefault: false,
  bcStep: 0.05,
  toastDuration: 2000,
  zoomScaleFactor: 1.25,
  lazyLoadMargin: 200,
  mouseSwitch: true,
  zoomPercentBase: "original",
  enabledSites: ALL_SITES_ENABLED,
  filterCycle: [...FILTER_MODE_IDS],
  gammaCycle: [...GAMMA_PRESET_IDS],
};

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== "number" || !isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
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

function validate(raw: Record<string, unknown>): YacompConfig {
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
    enabledSites: validateEnabledSites(raw.enabledSites),
    filterCycle: validateOrderedIdList(raw.filterCycle, FILTER_MODE_IDS, DEFAULTS.filterCycle),
    gammaCycle: validateOrderedIdList(raw.gammaCycle, GAMMA_PRESET_IDS, DEFAULTS.gammaCycle),
  };
}

function migrate(raw: Record<string, unknown>): Record<string, unknown> {
  const v = typeof raw.v === "number" ? raw.v : 0;
  if (v < 2) {
    raw.enabledSites ??= DEFAULTS.enabledSites;
    raw.filterCycle ??= DEFAULTS.filterCycle;
    raw.gammaCycle ??= DEFAULTS.gammaCycle;
  }
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

export function siteEnabled(key: SiteKey): boolean { return config.enabledSites[key]; }
export function filterCycle(): readonly FilterModeId[] { return config.filterCycle; }
export function gammaCycle(): readonly GammaPresetId[] { return config.gammaCycle; }
export function getConfig(): Readonly<YacompConfig> { return config; }

export function saveConfig(partial: Partial<YacompConfig>): void {
  Object.assign(config, partial);
  config.v = CURRENT_VERSION;
  config = validate(config as unknown as Record<string, unknown>);
  GM_setValue(STORAGE_KEY, config);
}

export function resetConfig(): void {
  config = { ...DEFAULTS };
  GM_setValue(STORAGE_KEY, config);
}
