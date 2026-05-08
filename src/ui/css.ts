// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CSS for inline comparison viewer                                         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

export function injectCSS(): void {
  if (document.getElementById("_scf_css_")) return;
  const style = document.createElement("style");
  style.id = "_scf_css_";
  style.textContent = `
    ._scf_comp_link {
      color: inherit;
      cursor: pointer;
      text-decoration: underline;
      font-size: inherit;
      line-height: inherit;
    }
    ._scf_comp_link:hover { opacity: .7; }

    ._scf_comp {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483646;
      background: #000;
      overflow-y: auto;
      overflow-x: hidden;
      text-align: center;
    }
    ._scf_comp._scf_zoomed {
      overflow: auto;
    }
    ._scf_comp_row {
      position: relative;
      width: 100vw;
      cursor: crosshair;
      margin: 0 auto 2px;
      line-height: 0;
      overflow: hidden;
    }
    ._scf_comp_row._scf_loading::after {
      content: '';
      position: absolute;
      top: 50%;
      left: 50%;
      width: 32px;
      height: 32px;
      margin: -16px 0 0 -16px;
      border: 3px solid rgba(255,255,255,.15);
      border-top-color: #fff;
      border-radius: 50%;
      animation: _scf_spin .7s linear infinite;
      z-index: 1;
    }
    @keyframes _scf_spin { to { transform: rotate(360deg); } }
    ._scf_comp._scf_zoomed ._scf_comp_row {
      cursor: crosshair;
    }
    ._scf_scroll_spacer {
      width: 100%;
      height: 0;
      pointer-events: none;
      line-height: 0;
    }
    ._scf_comp._scf_dragging,
    ._scf_comp._scf_dragging ._scf_comp_row {
      cursor: grabbing !important;
    }
    ._scf_row_nav {
      position: fixed;
      right: 12px;
      top: 50%;
      transform: translateY(-50%);
      max-height: calc(100vh - 24px);
      overflow-y: auto;
      scrollbar-width: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
      z-index: 2147483647;
      pointer-events: none;
      transition: opacity .3s ease;
    }
    ._scf_row_nav::-webkit-scrollbar { display: none; }
    ._scf_row_nav_item {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      background: rgba(255,255,255,.15);
      color: rgba(255,255,255,.5);
      font: 600 11px/24px system-ui, sans-serif;
      text-align: center;
      pointer-events: auto;
      cursor: pointer;
      transition: background .15s, color .15s;
    }
    ._scf_row_nav_item._scf_active {
      background: rgba(255,255,255,.85);
      color: #000;
    }
    ._scf_comp_sizer {
      width: 100%;
      display: block;
      visibility: hidden;
    }
    ._scf_comp_cell {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
    }
    ._scf_comp_img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
      image-rendering: auto;
    }
    ._scf_comp_label {
      position: fixed;
      top: 0;
      left: 50%;
      z-index: 2147483647;
      background: none;
      color: #fff;
      font: bold 16px/1 system-ui, sans-serif;
      padding: 10px 0;
      pointer-events: none;
      white-space: nowrap;
      transform: translateX(-50%);
      text-shadow: 0 1px 4px rgba(0,0,0,.7);
      transition: opacity .15s ease;
    }
    ._scf_nav_map {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 2147483647;
      border: 1px solid rgba(255,255,255,.3);
      background: rgba(0,0,0,.6);
      border-radius: 4px;
      overflow: hidden;
      cursor: crosshair;
      display: none;
      opacity: 0;
      transition: opacity .2s ease;
      pointer-events: none;
      line-height: 0;
    }
    ._scf_nav_map img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: contain;
      user-select: none;
      -webkit-user-drag: none;
    }
    ._scf_nav_map_rect {
      position: absolute;
      top: 0;
      left: 0;
      border: 1.5px solid rgba(255,80,80,.9);
      background: rgba(255,80,80,.15);
      box-sizing: border-box;
      pointer-events: none;
      border-radius: 1px;
    }
    ._scf_touch_toolbar {
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 2147483647;
      display: flex;
      justify-content: center;
      gap: 2px;
      padding: 6px 8px;
      padding-bottom: max(6px, env(safe-area-inset-bottom));
      background: rgba(12,12,12,.88);
      backdrop-filter: blur(8px);
      border-top: 1px solid rgba(255,255,255,.12);
    }
    ._scf_touch_btn {
      appearance: none;
      border: 1px solid rgba(255,255,255,.18);
      background: rgba(255,255,255,.08);
      color: #fff;
      font: 600 12px/1 system-ui, sans-serif;
      padding: 8px 10px;
      border-radius: 6px;
      min-width: 34px;
      text-align: center;
      cursor: pointer;
      -webkit-tap-highlight-color: transparent;
      touch-action: manipulation;
    }
    ._scf_touch_btn:active {
      background: rgba(255,255,255,.25);
    }
    ._scf_col_hint {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      pointer-events: none;
      display: flex;
      transition: opacity .6s ease;
    }
    ._scf_col_hint_zone {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      border-right: 1px solid rgba(255,255,255,.2);
    }
    ._scf_col_hint_zone:last-child {
      border-right: none;
    }
    ._scf_col_hint_label {
      background: rgba(0,0,0,.5);
      color: rgba(255,255,255,.7);
      font: 600 14px/1 system-ui, sans-serif;
      padding: 6px 12px;
      border-radius: 999px;
    }
    @media (hover: hover) and (pointer: fine) {
      ._scf_touch_toolbar { display: none !important; }
      ._scf_col_hint { display: none !important; }
    }
    @media (hover: none), (pointer: coarse) {
      ._scf_row_nav_item {
        width: 32px;
        height: 32px;
        font-size: 13px;
        line-height: 32px;
      }
      ._scf_comp {
        height: calc(100vh - 46px);
        height: calc(100dvh - 46px - env(safe-area-inset-bottom));
      }
      ._scf_nav_map {
        bottom: calc(54px + max(6px, env(safe-area-inset-bottom))) !important;
      }
      ._scf_comp_label {
        font-size: 13px !important;
        padding: 6px 0 !important;
      }
      #_scf_toast_ {
        bottom: calc(54px + max(6px, env(safe-area-inset-bottom))) !important;
      }
      #_scf_hud_ {
        top: 8px !important;
        right: 40px !important;
        font-size: 10px !important;
      }
    }
  `;
  document.head.appendChild(style);
}
