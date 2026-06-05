// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SVG filter injection                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { lut } from "./lut";
import { GAMMA_MISMATCH_CHECK_PRESETS, gammaMismatchCheckExponent } from "./gamma-check";
import { getShadowRoot } from "../ui/shadow";

const LIMITED_LUMA_SCALE = 219 / 255;
const LIMITED_LUMA_OFFSET = 16 / 255;
const LIMITED_CHROMA_SCALE = 224 / 255;
const LIMITED_CHROMA_OFFSET = 128 / 255;

function matrixRows(values: number[][]): string {
  return values.map((row) => row.map(String).join(" ")).join(" ");
}

function lumaMatrix(kr: number, kg: number, kb: number): string {
  const row = [
    kr * LIMITED_LUMA_SCALE,
    kg * LIMITED_LUMA_SCALE,
    kb * LIMITED_LUMA_SCALE,
    0,
    LIMITED_LUMA_OFFSET,
  ];
  return matrixRows([
    row,
    row,
    row,
    [0, 0, 0, 1, 0],
  ]);
}

function chromaResidualMatrix(kr: number, kg: number, kb: number): string {
  return matrixRows([
    [
      (1 - kr) * LIMITED_CHROMA_SCALE,
      -kg * LIMITED_CHROMA_SCALE,
      -kb * LIMITED_CHROMA_SCALE,
      0,
      LIMITED_CHROMA_OFFSET,
    ],
    [
      -kr * LIMITED_CHROMA_SCALE,
      (1 - kg) * LIMITED_CHROMA_SCALE,
      -kb * LIMITED_CHROMA_SCALE,
      0,
      LIMITED_CHROMA_OFFSET,
    ],
    [
      -kr * LIMITED_CHROMA_SCALE,
      -kg * LIMITED_CHROMA_SCALE,
      (1 - kb) * LIMITED_CHROMA_SCALE,
      0,
      LIMITED_CHROMA_OFFSET,
    ],
    [0, 0, 0, 1, 0],
  ]);
}

function gammaMismatchCheckFilterDefs(): string {
  return GAMMA_MISMATCH_CHECK_PRESETS.map((preset) => {
    const exponent = gammaMismatchCheckExponent(preset.id).toFixed(6);
    // Luma-only additive gamma — matches VapourSynth std.Levels planes=0
    // exactly in display-RGB space (U/V untouched ⇔ same Δ added to R,G,B):
    //   Y   = 0.2126·R + 0.7152·G + 0.0722·B
    //   R'  = R + pow(Y, 1/ratio) − Y    (same for G, B)
    //
    // feComposite arithmetic only takes inputs in [0,1], so the (Y'−Y) delta
    // is biased by +1 in step 2 and the bias is removed in step 3:
    //   deltaPos = pow(Y, 1/ratio) − Y + 1   (always ∈ [0,2])
    //   output   = SourceGraphic + deltaPos − 1
    return `<filter id="${preset.svgId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix" in="SourceGraphic" result="luma"
        values="0.2126 0.7152 0.0722 0 0
                0.2126 0.7152 0.0722 0 0
                0.2126 0.7152 0.0722 0 0
                0 0 0 1 0"/>
      <feComponentTransfer in="luma" result="gammaLuma">
        <feFuncR type="gamma" amplitude="1" exponent="${exponent}" offset="0"/>
        <feFuncG type="gamma" amplitude="1" exponent="${exponent}" offset="0"/>
        <feFuncB type="gamma" amplitude="1" exponent="${exponent}" offset="0"/>
      </feComponentTransfer>
      <feComposite in="gammaLuma" in2="luma" operator="arithmetic" result="deltaPos"
        k1="0" k2="1" k3="-1" k4="1"/>
      <feComposite in="SourceGraphic" in2="deltaPos" operator="arithmetic"
        k1="0" k2="1" k3="1" k4="-1"/>
    </filter>`;
  }).join("");
}

export function svgFilterDefsMarkup(): string {
  return `<defs>
    <filter id="scf-s1" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feComponentTransfer>
        <feFuncR type="table" tableValues="${lut.s1.r}"/>
        <feFuncG type="table" tableValues="${lut.s1.g}"/>
        <feFuncB type="table" tableValues="${lut.s1.b}"/>
      </feComponentTransfer>
    </filter>
    <filter id="scf-s2" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feComponentTransfer>
        <feFuncR type="table" tableValues="${lut.s2.r}"/>
        <feFuncG type="table" tableValues="${lut.s2.g}"/>
        <feFuncB type="table" tableValues="${lut.s2.b}"/>
      </feComponentTransfer>
    </filter>
    <filter id="scf-hpf" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="smooth"/>
      <feBlend in="SourceGraphic" in2="smooth" mode="difference" result="residual"/>
      <feComponentTransfer in="residual">
        <feFuncR type="gamma" amplitude="1" exponent="0.35" offset="0"/>
        <feFuncG type="gamma" amplitude="1" exponent="0.35" offset="0"/>
        <feFuncB type="gamma" amplitude="1" exponent="0.35" offset="0"/>
      </feComponentTransfer>
    </filter>
    <filter id="scf-luma709" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix"
        values="${lumaMatrix(0.2126, 0.7152, 0.0722)}"/>
    </filter>
    <filter id="scf-luma2020" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix"
        values="${lumaMatrix(0.2627, 0.6780, 0.0593)}"/>
    </filter>
    <filter id="scf-chroma709" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix"
        values="${chromaResidualMatrix(0.2126, 0.7152, 0.0722)}"/>
    </filter>
    <filter id="scf-chroma2020" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix"
        values="${chromaResidualMatrix(0.2627, 0.6780, 0.0593)}"/>
    </filter>
    ${gammaMismatchCheckFilterDefs()}
  </defs>`;
}

function createFilterDefs(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "_scf_defs_";
  svg.style.cssText =
    "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;z-index:-9999";
  svg.innerHTML = svgFilterDefsMarkup();
  return svg;
}

function injectFiltersInto(root: Document | ShadowRoot): void {
  if (root.getElementById("_scf_defs_")) return;
  const container = root === document ? document.body : root;
  container.appendChild(createFilterDefs());
}

export function injectFilters(): void {
  // Fragment URLs resolve inside the filtered image's own tree. Page images
  // and shadow viewer images need identical mode and gamma-mismatch defs.
  injectFiltersInto(document);
  injectFiltersInto(getShadowRoot());
}
