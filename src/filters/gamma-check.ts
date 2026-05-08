// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Gamma mismatch check                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export type GammaMismatchCheckId =
  | "srgb-bt1886"
  | "aeqt-0p88"
  | "legacy-mac";

export interface GammaMismatchCheckPreset {
  id: GammaMismatchCheckId;
  ratio: number;
  formula: string;
  label: string;
  svgId: string;
}

export const GAMMA_MISMATCH_CHECK_NOTE =
  "Gamma mismatch check applies a nonlinear power curve; it does not fix range, matrix, ICC/profile, or tone-mapping errors.";

export const GAMMA_MISMATCH_CHECK_PRESETS: GammaMismatchCheckPreset[] = [
  {
    id: "srgb-bt1886",
    ratio: 0.917,
    formula: "2.2/2.4",
    label: "sRGB 2.2↔BT.1886 2.4",
    svgId: "scf-gamma-mismatch-srgb-bt1886",
  },
  {
    id: "aeqt-0p88",
    ratio: 0.88,
    formula: "2.2/2.5",
    label: "0.88 AE/QT folklore 2.2↔CRT 2.5",
    svgId: "scf-gamma-mismatch-aeqt-0p88",
  },
  {
    id: "legacy-mac",
    ratio: 0.818,
    formula: "1.8/2.2",
    label: "Legacy Mac 1.8↔2.2",
    svgId: "scf-gamma-mismatch-legacy-mac",
  },
];

const PRESET_BY_ID = new Map(GAMMA_MISMATCH_CHECK_PRESETS.map((preset) => [preset.id, preset]));

export function cycleGammaMismatchCheck(
  current: GammaMismatchCheckId | null,
  direction: number,
): GammaMismatchCheckId | null {
  const idx = current
    ? GAMMA_MISMATCH_CHECK_PRESETS.findIndex((preset) => preset.id === current)
    : -1;
  const count = GAMMA_MISMATCH_CHECK_PRESETS.length + 1;
  const nextIdx = (idx + (direction > 0 ? 1 : -1) + count) % count;
  return nextIdx === GAMMA_MISMATCH_CHECK_PRESETS.length
    ? null
    : GAMMA_MISMATCH_CHECK_PRESETS[nextIdx].id;
}

export function gammaMismatchCheckExponent(id: GammaMismatchCheckId): number {
  const ratio = PRESET_BY_ID.get(id)?.ratio || 1;
  return 1 / ratio;
}

export function gammaMismatchCheckFilter(id: GammaMismatchCheckId | null): string {
  if (!id) return "";
  const preset = PRESET_BY_ID.get(id);
  return preset ? "url(#" + preset.svgId + ")" : "";
}

export function gammaMismatchCheckValueLabel(id: GammaMismatchCheckId): string {
  const preset = PRESET_BY_ID.get(id)!;
  return (preset.ratio * 100).toFixed(1) + "% (" + preset.formula + ")";
}

export function gammaMismatchCheckPowLabel(id: GammaMismatchCheckId): string {
  const ratio = PRESET_BY_ID.get(id)!.ratio.toFixed(3);
  return "pow(1/" + ratio + ")";
}

export function gammaMismatchCheckName(id: GammaMismatchCheckId): string {
  return PRESET_BY_ID.get(id)!.label;
}

export function gammaMismatchCheckLabel(id: GammaMismatchCheckId): string {
  return gammaMismatchCheckValueLabel(id) + " — "
    + gammaMismatchCheckName(id) + " — "
    + gammaMismatchCheckPowLabel(id);
}

export interface GammaMismatchCheckHudInfo {
  line1: string;
  line2: string;
}

export function gammaMismatchCheckHudLabel(id: GammaMismatchCheckId): GammaMismatchCheckHudInfo {
  const preset = PRESET_BY_ID.get(id)!;
  return {
    line1: "γ " + (preset.ratio * 100).toFixed(1) + "% (" + preset.formula + ")",
    line2: preset.label,
  };
}
