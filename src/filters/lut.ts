// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Solar curve LUT                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

const t = 5,
  k = 5.5;
const m = k * Math.PI - 128 / t;
const SCA = -m / 4194304,
  SCB = (3 * m) / 32768,
  SCC = 1 / t;

function solarVal(x: number, off = 0): number {
  const v = x + off;
  return Math.max(
    0,
    Math.min(
      255,
      127.9999 *
        Math.sin(SCA * v ** 3 + SCB * v ** 2 + SCC * v - Math.PI / 2) +
        127.5,
    ),
  );
}

function buildLUT(off: number, passes: number): string {
  return Array.from({ length: 256 }, (_, i) => {
    let v = i;
    for (let p = 0; p < passes; p++) v = solarVal(v, off);
    return (v / 255).toFixed(5);
  }).join(" ");
}

export const lut = {
  s1: { r: buildLUT(0, 1), g: buildLUT(-5, 1), b: buildLUT(+5, 1) },
  s2: { r: buildLUT(0, 2), g: buildLUT(-5, 2), b: buildLUT(+5, 2) },
};
