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
    ._scf_source_menu {
      position: fixed;
      left: max(6px, calc(env(safe-area-inset-left) + 6px));
      bottom: max(6px, calc(env(safe-area-inset-bottom) + 6px));
      z-index: 2147483647;
      font: 600 12px/1.2 system-ui, sans-serif;
      text-align: left;
      color: #fff;
      padding: 10px;
    }
    ._scf_source_menu_btn {
      display: flex;
      align-items: center;
      justify-content: flex-start;
      gap: 8px;
      width: 44px;
      min-width: 44px;
      min-height: 44px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      background: rgba(12,12,12,.82);
      color: #fff;
      box-shadow: 0 2px 10px rgba(0,0,0,.4);
      backdrop-filter: blur(8px);
      font: inherit;
      cursor: pointer;
      padding: 0 11px;
      overflow: hidden;
      opacity: .48;
      transition: width .16s ease, opacity .15s ease, background .15s ease, border-color .15s ease;
    }
    ._scf_source_menu:hover ._scf_source_menu_btn,
    ._scf_source_menu_btn:focus-visible,
    ._scf_source_menu._scf_open ._scf_source_menu_btn {
      opacity: 1;
    }
    ._scf_source_menu:hover ._scf_source_menu_btn,
    ._scf_source_menu_btn:focus-visible,
    ._scf_source_menu._scf_open ._scf_source_menu_btn {
      width: 94px;
    }
    ._scf_source_menu_btn:hover,
    ._scf_source_menu_btn:focus-visible,
    ._scf_source_menu._scf_open ._scf_source_menu_btn {
      border-color: rgba(255,255,255,.32);
      background: rgba(24,24,24,.9);
    }
    ._scf_source_menu_btn:focus-visible {
      outline: 2px solid rgba(255,255,255,.72);
      outline-offset: 2px;
    }
    ._scf_source_menu_icon {
      position: relative;
      display: block;
      width: 20px;
      height: 14px;
    }
    ._scf_source_menu_icon::before {
      content: "";
      position: absolute;
      left: 3px;
      top: 2px;
      width: 14px;
      height: 2px;
      border-radius: 2px;
      background: currentColor;
      box-shadow: 0 5px 0 currentColor, 0 10px 0 currentColor;
    }
    ._scf_source_menu_count {
      display: block;
      min-width: 0;
      width: 0;
      overflow: hidden;
      color: rgba(255,255,255,.62);
      font-weight: 700;
      white-space: nowrap;
      transition: width .16s ease;
    }
    ._scf_source_menu:hover ._scf_source_menu_count,
    ._scf_source_menu_btn:focus-visible ._scf_source_menu_count,
    ._scf_source_menu._scf_open ._scf_source_menu_count {
      width: 42px;
    }
    ._scf_source_menu_panel {
      position: absolute;
      left: 10px;
      bottom: 62px;
      width: min(280px, calc(100vw - 32px));
      max-height: min(360px, calc(100vh - 96px));
      overflow-y: auto;
      padding: 6px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 8px;
      background: rgba(12,12,12,.9);
      box-shadow: 0 6px 24px rgba(0,0,0,.55);
      backdrop-filter: blur(10px);
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.32) transparent;
    }
    ._scf_source_option {
      display: grid;
      grid-template-columns: 22px 24px minmax(0, 1fr);
      align-items: center;
      min-height: 40px;
      gap: 6px;
      border-radius: 6px;
      padding: 2px 8px 2px 4px;
      cursor: pointer;
    }
    ._scf_source_option:hover,
    ._scf_source_option._scf_active {
      background: rgba(255,255,255,.11);
    }
    ._scf_source_option input {
      margin: 0;
      accent-color: #fff;
      cursor: pointer;
    }
    ._scf_source_option_idx {
      color: rgba(255,255,255,.48);
      font-size: 11px;
      text-align: right;
    }
    ._scf_source_option_name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `;
  document.head.appendChild(style);
}
