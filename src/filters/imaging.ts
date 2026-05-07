// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Image targeting & filter application                                     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { detectCS } from "./colorspace";
import { cur } from "./modes";
import { bcString } from "./brightness";
import { injectFilters } from "./svg";
import { hasAdjustments } from "./brightness";
import { updateHUD } from "../ui/hud";

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

export function buildFilter(svgFilter: string): string {
  const parts: string[] = [];
  if (svgFilter) parts.push(svgFilter);
  const bc = bcString();
  if (bc) parts.push(bc);
  return parts.join(" ");
}

export async function applyToImg(img: HTMLImageElement): Promise<void> {
  img.style.filter = buildFilter(await resolveFilter(img.src));
}

export function syncAll(): void {
  injectFilters();
  getImages().forEach(applyToImg);
  for (const img of document.querySelectorAll("._scf_comp_img") as NodeListOf<HTMLImageElement>) {
    if (!img.src) continue;
    resolveFilter(img.src).then((f) => {
      img.style.filter = buildFilter(f);
    });
  }
  updateHUD();
}
