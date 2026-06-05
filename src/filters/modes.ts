// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Mode cycle                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { filterCycle } from "../config";

export interface Mode {
  id: string;
  filter?: string;
  f709?: string;
  f2020?: string;
  label: string | null;
  toast: string;
}

export const MODES: Mode[] = [
  { id: "off", filter: "", label: null, toast: "◼  Off" },
  { id: "solar1", filter: "url(#scf-s1)", label: "☀️ Solar ×1", toast: "☀️  Solar ×1" },
  { id: "solar2", filter: "url(#scf-s2)", label: "☀️☀️ Solar ×2", toast: "☀️☀️  Solar ×2" },
  { id: "residual", filter: "url(#scf-hpf)", label: "🔬 Residual", toast: "🔬  Residual" },
  {
    id: "luma",
    f709: "url(#scf-luma709)",
    f2020: "url(#scf-luma2020)",
    label: "⬜ Luma",
    toast: "⬜  Luma",
  },
  {
    id: "lumaFull",
    f709: "url(#scf-luma709-full)",
    f2020: "url(#scf-luma2020-full)",
    label: "⬜ Luma Full",
    toast: "⬜  Luma Full",
  },
  {
    id: "chroma",
    f709: "url(#scf-chroma709)",
    f2020: "url(#scf-chroma2020)",
    label: "🌈 Chroma",
    toast: "🌈  Chroma",
  },
  {
    id: "chromaFull",
    f709: "url(#scf-chroma709-full)",
    f2020: "url(#scf-chroma2020-full)",
    label: "🌈 Chroma Full",
    toast: "🌈  Chroma Full",
  },
];

const MODE_BY_ID = new Map(MODES.map((m) => [m.id, m]));

export let modeIndex = 0;
export function setModeIndex(i: number): void { modeIndex = i; }
export function cur(): Mode { return MODES[modeIndex]; }
export function active(m?: Mode): boolean {
  const mode = m || cur();
  return !!(mode.filter || mode.f709);
}

export function cycleMode(direction: number): void {
  const enabled = filterCycle();
  if (enabled.length === 0) {
    modeIndex = 0;
    return;
  }
  const currentId = MODES[modeIndex].id;
  if (currentId === "off") {
    const target = direction > 0 ? enabled[0] : enabled[enabled.length - 1];
    const next = MODE_BY_ID.get(target);
    if (next) modeIndex = MODES.indexOf(next);
    return;
  }
  const idx = enabled.indexOf(currentId as typeof enabled[number]);
  if (idx === -1) {
    modeIndex = 0;
    return;
  }
  const nextIdx = idx + (direction > 0 ? 1 : -1);
  if (nextIdx < 0 || nextIdx >= enabled.length) {
    modeIndex = 0;
  } else {
    const next = MODE_BY_ID.get(enabled[nextIdx]);
    if (next) modeIndex = MODES.indexOf(next);
  }
}
