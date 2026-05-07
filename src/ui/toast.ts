// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Toast notification                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

let toastTimer: ReturnType<typeof setTimeout>;

export function showToast(msg: string): void {
  let el = document.getElementById("_scf_toast_");
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
    });
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.style.opacity = "1";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el!.style.opacity = "0"), 2000);
}
