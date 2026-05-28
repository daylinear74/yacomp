// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  CSS for inline comparison viewer                                         ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { getShadowRoot } from "./shadow";

// The HDBits opener stays in the host page, outside the isolated viewer root.
export function injectTriggerLinkCSS(): void {
  if (document.getElementById("_scf_comp_link_css_")) return;
  const style = document.createElement("style");
  style.id = "_scf_comp_link_css_";
  style.textContent = `
    ._scf_comp_link {
      color: inherit;
      cursor: pointer;
      text-decoration: underline;
      font-size: inherit;
      line-height: inherit;
    }
    ._scf_comp_link:hover { opacity: .7; }
  `;
  document.head.appendChild(style);
}

export function injectCSS(): void {
  const root = getShadowRoot();
  if (root.getElementById("_scf_css_")) return;
  const style = document.createElement("style");
  style.id = "_scf_css_";
  style.textContent = `
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
      box-sizing: border-box;
      max-height: calc(100vh - 72px);
      overflow-y: auto;
      scrollbar-width: none;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding: 5px 7px 5px 9px;
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
      transform: translateX(0) scale(1);
      transition:
        transform .18s cubic-bezier(.22, 1, .36, 1),
        background .18s cubic-bezier(.22, 1, .36, 1),
        color .18s cubic-bezier(.22, 1, .36, 1),
        box-shadow .18s cubic-bezier(.22, 1, .36, 1);
    }
    ._scf_row_nav_item:is(:hover, :focus-visible):not(._scf_active) {
      background: rgba(255,255,255,.36);
      color: rgba(255,255,255,.94);
      box-shadow: 0 0 0 2px rgba(255,255,255,.1);
      transform: translateX(-1px) scale(1.06);
    }
    ._scf_row_nav_item:focus-visible {
      outline: 1px solid rgba(255,255,255,.72);
      outline-offset: 2px;
    }
    ._scf_row_nav_item._scf_active {
      background: rgba(0,0,0,.62);
      color: rgba(255,255,255,.96);
    }
    ._scf_row_nav_item._scf_active:is(:hover, :focus-visible) {
      background: rgba(0,0,0,.9);
      color: #fff;
      box-shadow: 0 3px 12px rgba(0,0,0,.46);
      transform: translateX(-2px) scale(1.12);
    }
    ._scf_row_nav_item:is(:hover, :focus-visible):active {
      transform: translateX(-1px) scale(.98);
      transition-duration: .08s;
    }
    ._scf_row_nav_item._scf_active:is(:hover, :focus-visible):active {
      transform: translateX(-1px) scale(1.04);
      transition-duration: .08s;
    }
    @media (prefers-reduced-motion: reduce) {
      ._scf_row_nav_item {
        transition: none;
      }
      ._scf_row_nav_item:is(:hover, :focus-visible):not(._scf_active),
      ._scf_row_nav_item._scf_active:is(:hover, :focus-visible),
      ._scf_row_nav_item:is(:hover, :focus-visible):active,
      ._scf_row_nav_item._scf_active:is(:hover, :focus-visible):active {
        transform: none;
      }
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
    ._scf_comp._scf_fill_canvas ._scf_comp_img {
      object-fit: cover;
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
    ._scf_close_btn {
      position: fixed;
      top: max(16px, calc(env(safe-area-inset-top) + 16px));
      z-index: 2147483647;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      min-width: 44px;
      min-height: 44px;
      height: 44px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 999px;
      background: rgba(12,12,12,.82);
      color: #fff;
      cursor: pointer;
      padding: 0;
      opacity: .48;
      box-shadow: 0 2px 10px rgba(0,0,0,.4);
      backdrop-filter: blur(8px);
      transition: opacity .15s ease, background .15s ease, border-color .15s ease;
    }
    ._scf_close_btn:hover,
    ._scf_close_btn:focus-visible {
      opacity: 1;
      border-color: rgba(255,255,255,.32);
      background: rgba(24,24,24,.9);
    }
    ._scf_close_btn:focus-visible {
      outline: 2px solid rgba(255,255,255,.72);
      outline-offset: 2px;
    }
    ._scf_close_btn._scf_left { left: max(16px, calc(env(safe-area-inset-left) + 16px)); }
    ._scf_close_btn._scf_right { right: max(56px, calc(env(safe-area-inset-right) + 56px)); }
    ._scf_close_btn._scf_hidden { display: none; }
    ._scf_close_icon {
      position: relative;
      display: block;
      width: 14px;
      height: 14px;
    }
    ._scf_close_icon::before,
    ._scf_close_icon::after {
      content: "";
      position: absolute;
      top: 50%;
      left: 50%;
      width: 14px;
      height: 2px;
      border-radius: 1px;
      background: currentColor;
    }
    ._scf_close_icon::before { transform: translate(-50%, -50%) rotate(45deg); }
    ._scf_close_icon::after { transform: translate(-50%, -50%) rotate(-45deg); }
    ._scf_toolbar {
      position: fixed;
      left: max(6px, calc(env(safe-area-inset-left) + 6px));
      bottom: max(6px, calc(env(safe-area-inset-bottom) + 6px));
      z-index: 2147483647;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      gap: 6px;
      padding: 10px;
      font: 600 12px/1.2 system-ui, sans-serif;
      text-align: left;
      color: #fff;
    }
    ._scf_source_menu {
      position: relative;
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
    ._scf_fill_canvas_toggle {
      position: relative;
    }
    ._scf_fill_canvas_btn {
      display: flex;
      align-items: center;
      justify-content: center;
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
      padding: 0;
      opacity: .48;
      transition: opacity .15s ease, background .15s ease, border-color .15s ease;
    }
    ._scf_fill_canvas_btn:hover,
    ._scf_fill_canvas_btn:focus-visible,
    ._scf_fill_canvas_toggle._scf_open ._scf_fill_canvas_btn {
      opacity: 1;
      border-color: rgba(255,255,255,.32);
      background: rgba(24,24,24,.9);
    }
    ._scf_fill_canvas_btn._scf_active {
      opacity: 1;
      border-color: rgba(255,255,255,.5);
      background: rgba(40,40,40,.92);
    }
    ._scf_fill_canvas_btn:focus-visible {
      outline: 2px solid rgba(255,255,255,.72);
      outline-offset: 2px;
    }
    ._scf_fill_canvas_icon {
      position: relative;
      display: block;
      width: 20px;
      height: 14px;
    }
    ._scf_fill_canvas_icon::before,
    ._scf_fill_canvas_icon::after {
      content: "";
      position: absolute;
      border: 2px solid currentColor;
      border-radius: 1px;
    }
    ._scf_fill_canvas_icon::before {
      top: 0;
      left: 1px;
      width: 8px;
      height: 6px;
      border-right: none;
      border-bottom: none;
    }
    ._scf_fill_canvas_icon::after {
      bottom: 0;
      right: 1px;
      width: 8px;
      height: 6px;
      border-left: none;
      border-top: none;
    }
    ._scf_fill_canvas_panel {
      position: absolute;
      left: 0;
      bottom: 52px;
      width: 140px;
      padding: 6px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 8px;
      background: rgba(12,12,12,.9);
      box-shadow: 0 6px 24px rgba(0,0,0,.55);
      backdrop-filter: blur(10px);
    }
    ._scf_fill_canvas_option {
      display: grid;
      grid-template-columns: 22px minmax(0, 1fr);
      align-items: center;
      min-height: 36px;
      gap: 6px;
      border-radius: 6px;
      padding: 2px 8px 2px 4px;
      cursor: pointer;
    }
    ._scf_fill_canvas_option:hover,
    ._scf_fill_canvas_option._scf_active {
      background: rgba(255,255,255,.11);
    }
    ._scf_fill_canvas_option input {
      margin: 0;
      accent-color: #fff;
      cursor: pointer;
    }
    ._scf_fill_canvas_option_name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    ._scf_settings_overlay {
      position: fixed;
      top: 0;
      left: 0;
      width: 100vw;
      height: 100vh;
      z-index: 2147483647;
      background: rgba(0,0,0,.6);
      display: flex;
      align-items: center;
      justify-content: center;
    }
    ._scf_settings_panel {
      width: min(420px, calc(100vw - 32px));
      max-height: min(720px, calc(100vh - 48px));
      display: flex;
      flex-direction: column;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 12px;
      background: rgba(12,12,12,.94);
      box-shadow: 0 8px 32px rgba(0,0,0,.6);
      backdrop-filter: blur(12px);
      color: #fff;
      font: 600 13px/1.4 system-ui, sans-serif;
    }
    ._scf_settings_header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px 12px;
      border-bottom: 1px solid rgba(255,255,255,.1);
    }
    ._scf_settings_title {
      font-size: 15px;
      font-weight: 700;
    }
    ._scf_settings_close {
      width: 28px;
      height: 28px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,.5);
      font: 600 18px/28px system-ui, sans-serif;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    ._scf_settings_close:hover { background: rgba(255,255,255,.1); color: #fff; }
    ._scf_settings_body {
      flex: 1;
      overflow-y: auto;
      padding: 12px 20px 16px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,.2) transparent;
    }
    ._scf_settings_group_label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: .8px;
      color: rgba(255,255,255,.4);
      margin: 14px 0 8px;
    }
    ._scf_settings_group_label:first-child { margin-top: 0; }
    ._scf_settings_row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      min-height: 38px;
      padding: 4px 0;
    }
    ._scf_settings_label {
      color: rgba(255,255,255,.88);
      font-weight: 600;
    }
    ._scf_settings_radios {
      display: flex;
      gap: 4px;
    }
    ._scf_settings_radio {
      padding: 5px 12px;
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,.6);
      font: 600 12px/1 system-ui, sans-serif;
      cursor: pointer;
      transition: background .12s, color .12s, border-color .12s;
    }
    ._scf_settings_radio:hover {
      border-color: rgba(255,255,255,.32);
      color: rgba(255,255,255,.88);
    }
    ._scf_settings_radio._scf_selected {
      background: rgba(255,255,255,.14);
      border-color: rgba(255,255,255,.4);
      color: #fff;
    }
    ._scf_settings_toggle {
      position: relative;
      width: 38px;
      height: 22px;
      border: none;
      border-radius: 11px;
      background: rgba(255,255,255,.18);
      cursor: pointer;
      transition: background .15s;
      padding: 0;
    }
    ._scf_settings_toggle._scf_on {
      background: rgba(100,200,120,.7);
    }
    ._scf_settings_toggle::after {
      content: "";
      position: absolute;
      top: 3px;
      left: 3px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: transform .15s;
    }
    ._scf_settings_toggle._scf_on::after {
      transform: translateX(16px);
    }
    ._scf_settings_slider_row {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    ._scf_settings_range {
      width: 120px;
      height: 4px;
      -webkit-appearance: none;
      appearance: none;
      background: rgba(255,255,255,.18);
      border-radius: 2px;
      outline: none;
      cursor: pointer;
    }
    ._scf_settings_range::-webkit-slider-thumb {
      -webkit-appearance: none;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
    }
    ._scf_settings_range::-moz-range-thumb {
      width: 14px;
      height: 14px;
      border: none;
      border-radius: 50%;
      background: #fff;
      cursor: pointer;
    }
    ._scf_settings_value {
      min-width: 42px;
      text-align: right;
      font-size: 12px;
      color: rgba(255,255,255,.6);
      font-variant-numeric: tabular-nums;
    }
    ._scf_settings_footer {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 20px;
      border-top: 1px solid rgba(255,255,255,.1);
    }
    ._scf_settings_reset {
      border: 1px solid rgba(255,255,255,.18);
      border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,.5);
      font: 600 12px/1 system-ui, sans-serif;
      padding: 6px 14px;
      cursor: pointer;
    }
    ._scf_settings_reset:hover { color: #fff; border-color: rgba(255,255,255,.32); }
    ._scf_settings_done {
      border: 1px solid rgba(255,255,255,.3);
      border-radius: 6px;
      background: rgba(255,255,255,.1);
      color: #fff;
      font: 600 12px/1 system-ui, sans-serif;
      padding: 6px 18px;
      cursor: pointer;
    }
    ._scf_settings_done:hover { background: rgba(255,255,255,.18); }
    ._scf_settings_chip_grid {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin: 8px 0;
    }
    ._scf_settings_chip {
      padding: 5px 12px;
      border: 1px solid rgba(255,255,255,.15);
      border-radius: 6px;
      background: transparent;
      color: rgba(255,255,255,.35);
      font: 600 12px/1 system-ui, sans-serif;
      cursor: pointer;
      transition: background .12s, color .12s, border-color .12s;
    }
    ._scf_settings_chip:hover {
      border-color: rgba(255,255,255,.3);
      color: rgba(255,255,255,.6);
    }
    ._scf_settings_chip._scf_on {
      background: rgba(255,255,255,.1);
      border-color: rgba(255,255,255,.35);
      color: rgba(255,255,255,.88);
    }
    ._scf_settings_ordered_list {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin: 4px 0 8px;
    }
    ._scf_settings_ordered_item {
      display: grid;
      grid-template-columns: 22px 16px minmax(0, 1fr);
      align-items: center;
      min-height: 34px;
      gap: 6px;
      padding: 2px 4px;
      border-radius: 6px;
      transition: background .12s;
    }
    ._scf_settings_ordered_item._scf_enabled {
      background: rgba(255,255,255,.05);
      cursor: grab;
    }
    ._scf_settings_ordered_item._scf_enabled:active { cursor: grabbing; }
    ._scf_settings_ordered_item:hover {
      background: rgba(255,255,255,.08);
    }
    ._scf_settings_ordered_item._scf_dragging {
      opacity: .35;
    }
    ._scf_settings_ordered_item._scf_drag_above {
      box-shadow: 0 -2px 0 0 rgba(100,200,120,.6);
    }
    ._scf_settings_ordered_item._scf_drag_below {
      box-shadow: 0 2px 0 0 rgba(100,200,120,.6);
    }
    ._scf_settings_ordered_check {
      margin: 0;
      accent-color: rgba(100,200,120,.8);
      cursor: pointer;
    }
    ._scf_settings_ordered_handle {
      color: rgba(255,255,255,.25);
      font-size: 14px;
      line-height: 1;
      user-select: none;
    }
    ._scf_settings_ordered_item._scf_enabled ._scf_settings_ordered_handle {
      color: rgba(255,255,255,.4);
    }
    ._scf_settings_ordered_label {
      color: rgba(255,255,255,.88);
      font-weight: 600;
      font-size: 12px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    ._scf_settings_ordered_item:not(._scf_enabled) ._scf_settings_ordered_label {
      color: rgba(255,255,255,.4);
    }
    ._scf_settings_ordered_sep {
      height: 1px;
      background: rgba(255,255,255,.1);
      margin: 4px 0;
    }
    ._scf_settings_help {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 14px;
      height: 14px;
      margin-left: 6px;
      padding: 0;
      border: 1px solid rgba(255,255,255,.25);
      border-radius: 50%;
      background: transparent;
      color: rgba(255,255,255,.5);
      font: 700 9px/1 system-ui, sans-serif;
      cursor: help;
      vertical-align: middle;
      transition: color .12s, border-color .12s;
    }
    ._scf_settings_help:hover,
    ._scf_settings_help:focus-visible {
      color: rgba(255,255,255,.9);
      border-color: rgba(255,255,255,.55);
      outline: none;
    }
    ._scf_settings_group_label ._scf_settings_help {
      text-transform: none;
      letter-spacing: 0;
    }
    ._scf_settings_tooltip {
      position: fixed;
      z-index: 10;
      max-width: 280px;
      padding: 8px 10px;
      border-radius: 6px;
      background: rgba(20, 20, 20, .96);
      color: rgba(255,255,255,.92);
      font: 400 12px/1.45 system-ui, sans-serif;
      box-shadow: 0 4px 16px rgba(0,0,0,.5);
      border: 1px solid rgba(255,255,255,.12);
      pointer-events: none;
    }
    ._scf_orphan_select {
      position: fixed;
      inset: 0;
      z-index: 2147483646;
      background: #0b0b0b;
      color: #ddd;
      overflow-y: auto;
      font: 400 13px/1.4 system-ui, sans-serif;
    }
    ._scf_os_header {
      position: sticky;
      top: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 10px 14px;
      background: #161616;
      border-bottom: 1px solid #333;
    }
    ._scf_os_hint { flex: 1; }
    ._scf_os_build, ._scf_os_cancel {
      padding: 6px 12px;
      cursor: pointer;
      border: 1px solid #444;
      background: #222;
      color: #ddd;
      border-radius: 4px;
      font: inherit;
    }
    ._scf_os_build:disabled { opacity: .4; cursor: not-allowed; }
    ._scf_os_grid { display: grid; gap: 4px; padding: 8px; }
    ._scf_os_thumb {
      position: relative;
      cursor: pointer;
      aspect-ratio: 16 / 9;
      background: #1a1a1a;
    }
    ._scf_os_thumb img {
      width: 100%;
      height: 100%;
      object-fit: contain;
      display: block;
    }
    ._scf_os_thumb:hover { outline: 2px solid #4a90d9; }
    ._scf_os_thumb._scf_os_excluded { opacity: .35; outline: 2px solid #c0392b; }
    ._scf_os_badge {
      position: absolute;
      top: 4px;
      right: 4px;
      display: none;
      width: 22px;
      height: 22px;
      line-height: 22px;
      text-align: center;
      background: #c0392b;
      color: #fff;
      border-radius: 50%;
      font-weight: bold;
    }
    ._scf_os_thumb._scf_os_excluded ._scf_os_badge { display: block; }
  `;
  root.appendChild(style);
}
