// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Mode cycle                                                               ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export interface Mode {
  filter?: string;
  f709?: string;
  f2020?: string;
  label: string | null;
  toast: string;
}

export const MODES: Mode[] = [
  { filter: "", label: null, toast: "◼  Off" },
  {
    filter: "url(#scf-s1)",
    label: "☀️ Solar ×1",
    toast: "☀️  Solar ×1",
  },
  {
    filter: "url(#scf-s2)",
    label: "☀️☀️ Solar ×2",
    toast: "☀️☀️  Solar ×2",
  },
  {
    filter: "url(#scf-hpf)",
    label: "🔬 Residual",
    toast: "🔬  Residual",
  },
  {
    f709: "url(#scf-luma709)",
    f2020: "url(#scf-luma2020)",
    label: "⬜ Luma",
    toast: "⬜  Luma",
  },
  {
    f709: "url(#scf-chroma709)",
    f2020: "url(#scf-chroma2020)",
    label: "🌈 Chroma",
    toast: "🌈  Chroma",
  },
];

export let modeIndex = 0;
export function setModeIndex(i: number): void { modeIndex = i; }
export function cur(): Mode { return MODES[modeIndex]; }
export function active(m?: Mode): boolean {
  const mode = m || cur();
  return !!(mode.filter || mode.f709);
}
