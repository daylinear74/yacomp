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
      right: "14px",
      background: "rgba(12,12,12,.82)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,.14)",
      boxShadow: "0 2px 10px rgba(0,0,0,.4)",
      color: "#fff",
      font: "600 11px/1 system-ui,sans-serif",
      letterSpacing: ".3px",
      padding: "5px 12px",
      borderRadius: "999px",
      zIndex: "2147483647",
      pointerEvents: "none",
      transition: "opacity .25s ease",
      opacity: "0",
    });
    document.body.appendChild(el);
  }

  let text = cur().label || "";

  const comp = activeComps[activeComps.length - 1];
  if (comp) {
    const col = comp.currentCol;
    const b = comp.colBrightness[col];
    const g = comp.colGammaCheck[col];
    const c = comp.colContrast[col];
    if (!isDefault(b))
      text += (text ? "  " : "") + "☀" + Math.round(b * 100) + "%";
    if (g)
      text += (text ? "  " : "") + gammaMismatchCheckHudLabel(g);
    if (!isDefault(c))
      text += (text ? "  " : "") + "◐" + Math.round(c * 100) + "%";
  }

  el.style.opacity = text ? "1" : "0";
  if (text) el.textContent = text;
}
