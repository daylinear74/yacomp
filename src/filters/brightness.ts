// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Brightness / Contrast                                                    ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { active, setModeIndex } from "./modes";

export const BC_STEP = 0.05;
export const BC_MIN = 0.05;
export const BC_MAX = 4.0;

export function isDefault(v: number): boolean { return Math.abs(v - 1.0) <= 0.001; }

export function bcString(b: number, c: number): string {
  const parts: string[] = [];
  if (!isDefault(b))
    parts.push("brightness(" + b.toFixed(2) + ")");
  if (!isDefault(c))
    parts.push("contrast(" + c.toFixed(2) + ")");
  return parts.join(" ");
}

export function hasAdjustments(): boolean {
  return active();
}

export function resetAdjustments(): void {
  setModeIndex(0);
}
