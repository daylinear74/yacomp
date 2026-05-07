// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Image targeting & filter application                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { detectCS } from "./colorspace";
import { cur } from "./modes";
import { bcString } from "./brightness";
import { gammaMismatchCheckFilter, type GammaMismatchCheckId } from "./gamma-check";
import { injectFilters } from "./svg";
import { active } from "./modes";
import { updateHUD } from "../ui/hud";
import { activeComps } from "./zoom";

export function getImages(): HTMLImageElement[] {
  return [...document.querySelectorAll("img")].filter((img) => {
    if (
      img.closest("._scf_comp") ||
      img.closest("._scf_nav_map") ||
      img.closest("#_scf_hud_") ||
      img.closest("#_scf_toast_")
    )
      return false;
    if (img.offsetWidth > 200 || img.naturalWidth > 200) return true;
    if (img.classList.contains("screenshot-comparison__image")) return true;
    return false;
  }) as HTMLImageElement[];
}

export async function resolveFilter(src: string): Promise<string> {
  const mode = cur();
  if (mode.f709) {
    const cs = await detectCS(src);
    return cs === "2020" ? mode.f2020! : mode.f709;
  }
  return mode.filter || "";
}

export function buildFilter(
  svgFilter: string,
  b = 1.0,
  c = 1.0,
  gammaCheck: GammaMismatchCheckId | null = null,
): string {
  const parts: string[] = [];
  if (svgFilter) parts.push(svgFilter);
  const gamma = gammaMismatchCheckFilter(gammaCheck);
  if (gamma) parts.push(gamma);
  const bc = bcString(b, c);
  if (bc) parts.push(bc);
  return parts.join(" ");
}

export async function applyToImg(img: HTMLImageElement): Promise<void> {
  img.style.filter = buildFilter(await resolveFilter(img.src));
}

export function syncAll(): void {
  injectFilters();
  if (active()) {
    getImages().forEach(applyToImg);
  } else {
    for (const img of getImages()) {
      img.style.filter = "";
    }
  }
  for (const comp of activeComps) {
    const colB = comp.colBrightness;
    const colC = comp.colContrast;
    const colG = comp.colGammaCheck;
    for (const rd of comp.allRowData) {
      rd.imgs.forEach((img, i) => {
        if (!img.src) return;
        resolveFilter(img.src).then((f) => {
          img.style.filter = buildFilter(f, colB[i], colC[i], colG[i]);
        });
      });
    }
  }
  updateHUD();
}
