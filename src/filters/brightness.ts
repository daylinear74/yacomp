// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Brightness / Contrast                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { active, setModeIndex } from "./modes";

export const BC_STEP = 0.05;
export const BC_MIN = 0.05;
export const BC_MAX = 4.0;

export let brightness = 1.0;
export let contrast = 1.0;

export function setBrightness(v: number): void { brightness = v; }
export function setContrast(v: number): void { contrast = v; }

export function isDefault(v: number): boolean { return Math.abs(v - 1.0) <= 0.001; }

export function bcString(): string {
  const parts: string[] = [];
  if (!isDefault(brightness))
    parts.push("brightness(" + brightness.toFixed(2) + ")");
  if (!isDefault(contrast))
    parts.push("contrast(" + contrast.toFixed(2) + ")");
  return parts.join(" ");
}

export function hasAdjustments(): boolean {
  return (
    active() ||
    !isDefault(brightness) ||
    !isDefault(contrast)
  );
}

export function resetAdjustments(): void {
  setModeIndex(0);
  brightness = 1.0;
  contrast = 1.0;
}
