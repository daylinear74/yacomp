// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  SVG filter injection                                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { lut } from "./lut";
import { GAMMA_MISMATCH_CHECK_PRESETS, gammaMismatchCheckExponent } from "./gamma-check";
import { getShadowRoot } from "../ui/shadow";

function gammaMismatchCheckFilterDefs(): string {
  return GAMMA_MISMATCH_CHECK_PRESETS.map((preset) => {
    const exponent = gammaMismatchCheckExponent(preset.id).toFixed(6);
    return `<filter id="${preset.svgId}" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feComponentTransfer>
        <feFuncR type="gamma" amplitude="1" exponent="${exponent}" offset="0"/>
        <feFuncG type="gamma" amplitude="1" exponent="${exponent}" offset="0"/>
        <feFuncB type="gamma" amplitude="1" exponent="${exponent}" offset="0"/>
      </feComponentTransfer>
    </filter>`;
  }).join("");
}

function createFilterDefs(): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.id = "_scf_defs_";
  svg.style.cssText =
    "position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;z-index:-9999";
  svg.innerHTML = `<defs>
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
        values="0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0.2126 0.7152 0.0722 0 0 0 0 0 1 0"/>
    </filter>
    <filter id="scf-luma2020" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix"
        values="0.2627 0.6780 0.0593 0 0 0.2627 0.6780 0.0593 0 0 0.2627 0.6780 0.0593 0 0 0 0 0 1 0"/>
    </filter>
    <filter id="scf-chroma709" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix"
        values="0.7874 -0.7152 -0.0722 0 0.5 -0.2126 0.2848 -0.0722 0 0.5 -0.2126 -0.7152 0.9278 0 0.5 0 0 0 1 0"/>
    </filter>
    <filter id="scf-chroma2020" color-interpolation-filters="sRGB" x="0%" y="0%" width="100%" height="100%">
      <feColorMatrix type="matrix"
        values="0.7373 -0.6780 -0.0593 0 0.5 -0.2627 0.3220 -0.0593 0 0.5 -0.2627 -0.6780 0.9407 0 0.5 0 0 0 1 0"/>
    </filter>
    ${gammaMismatchCheckFilterDefs()}
  </defs>`;
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
