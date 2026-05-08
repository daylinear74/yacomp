// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  HUD badge                                                                ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { cur } from "../filters/modes";
import { isDefault } from "../filters/brightness";
import { gammaMismatchCheckHudLabel } from "../filters/gamma-check";
import { activeComps } from "../filters/zoom";

export function updateHUD(): void {
  let el = document.getElementById("_scf_hud_");
  if (!el) {
    el = document.createElement("div");
    el.id = "_scf_hud_";
    Object.assign(el.style, {
      position: "fixed",
      top: "12px",
      right: "44px",
      background: "rgba(12,12,12,.82)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,.14)",
      boxShadow: "0 2px 10px rgba(0,0,0,.4)",
      color: "#fff",
      font: "600 11px/1 system-ui,sans-serif",
      letterSpacing: ".3px",
      padding: "5px 12px",
      borderRadius: "8px",
      textAlign: "center",
      whiteSpace: "nowrap",
      zIndex: "2147483647",
      pointerEvents: "none",
      transition: "opacity .25s ease",
      opacity: "0",
    });
    document.body.appendChild(el);
  }

  let text = cur().label || "";

  const comp = activeComps[activeComps.length - 1];
  let gammaInfo: { line1: string; line2: string } | null = null;
  if (comp) {
    const col = comp.currentCol;
    const b = comp.colBrightness[col];
    const g = comp.colGammaCheck[col];
    const c = comp.colContrast[col];
    if (!isDefault(b))
      text += (text ? "  " : "") + "☀" + Math.round(b * 100) + "%";
    if (g)
      gammaInfo = gammaMismatchCheckHudLabel(g);
    if (!isDefault(c))
      text += (text ? "  " : "") + "◐" + Math.round(c * 100) + "%";
  }

  const hasContent = text || gammaInfo;
  el.style.opacity = hasContent ? "1" : "0";
  if (hasContent) {
    el.replaceChildren();
    if (gammaInfo) {
      const line1Parts: string[] = [];
      if (text) line1Parts.push(text + "  ");
      line1Parts.push(gammaInfo.line1);
      const l1 = document.createElement("div");
      l1.textContent = line1Parts.join("");
      el.appendChild(l1);
      const l2 = document.createElement("div");
      l2.textContent = gammaInfo.line2;
      Object.assign(l2.style, { fontSize: "9px", opacity: ".6", marginTop: "2px" });
      el.appendChild(l2);
    } else {
      el.textContent = text;
    }
  }
}
