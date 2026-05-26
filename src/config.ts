// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  User configuration — persistent settings via GM_getValue / GM_setValue  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

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
}

const STORAGE_KEY = "yacomp_config";
const CURRENT_VERSION = 1;

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
};

function clampNum(val: unknown, min: number, max: number, fallback: number): number {
  if (typeof val !== "number" || !isFinite(val)) return fallback;
  return Math.max(min, Math.min(max, val));
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
  };
}

let config: YacompConfig;

try {
  const stored = GM_getValue(STORAGE_KEY, DEFAULTS as unknown) as Record<string, unknown>;
  config = validate(typeof stored === "object" && stored !== null ? stored : {});
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
