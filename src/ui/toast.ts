// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Toast notification                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { toastDuration as toastDur } from "../config";
import { getShadowRoot } from "./shadow";

let toastTimer: ReturnType<typeof setTimeout>;

export interface ToastLine {
  text: string;
  size?: "small" | "normal" | "large" | "tiny";
  muted?: boolean;
  color?: string;
}

export function showToast(msg: string | ToastLine[]): void {
  let el = getShadowRoot().getElementById("_scf_toast_");
  if (!el) {
    el = document.createElement("div");
    el.id = "_scf_toast_";
    Object.assign(el.style, {
      position: "fixed",
      bottom: "28px",
      left: "50%",
      transform: "translateX(-50%)",
      background: "rgba(12,12,12,.88)",
      backdropFilter: "blur(8px)",
      border: "1px solid rgba(255,255,255,.13)",
      boxShadow: "0 4px 16px rgba(0,0,0,.45)",
      color: "#fff",
      font: "600 13px/1 system-ui,sans-serif",
      letterSpacing: ".4px",
      padding: "9px 22px",
      borderRadius: "999px",
      zIndex: "2147483647",
      pointerEvents: "none",
      transition: "opacity .3s ease",
      opacity: "0",
      whiteSpace: "nowrap",
      textAlign: "center",
    });
    getShadowRoot().appendChild(el);
  }
  if (typeof msg === "string") {
    el.textContent = msg;
    Object.assign(el.style, {
      padding: "9px 22px",
      borderRadius: "999px",
      whiteSpace: "nowrap",
      lineHeight: "1",
    });
  } else {
    el.replaceChildren(...msg.map((line) => {
      const div = document.createElement("div");
      div.textContent = line.text;
      const size = line.size || "normal";
      Object.assign(div.style, {
        fontSize: size === "large" ? "16px" : size === "small" ? "12px" : size === "tiny" ? "10px" : "13px",
        fontWeight: size === "large" ? "700" : "600",
        lineHeight: size === "large" ? "1.2" : "1.25",
        opacity: line.muted ? ".72" : "1",
      });
      if (line.color) div.style.color = line.color;
      return div;
    }));
    Object.assign(el.style, {
      padding: "10px 22px",
      borderRadius: "10px",
      whiteSpace: "normal",
      lineHeight: "1.25",
    });
  }
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el!.style.opacity = "0"), toastDur());
}
