// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Settings modal                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  getConfig, saveConfig, resetConfig, DEFAULTS,
  type YacompConfig,
} from "../config";
import { injectCSS } from "./css";

type Renderer = () => void;

interface RadioDef {
  type: "radio";
  key: keyof YacompConfig;
  label: string;
  options: { label: string; value: string | boolean }[];
}

interface ToggleDef {
  type: "toggle";
  key: keyof YacompConfig;
  label: string;
}

interface SliderDef {
  type: "slider";
  key: keyof YacompConfig;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
}

type SettingDef = RadioDef | ToggleDef | SliderDef;

interface SettingGroup {
  label: string;
  items: SettingDef[];
}

const GROUPS: SettingGroup[] = [
  {
    label: "Viewer Defaults",
    items: [
      {
        type: "radio",
        key: "defaultZoomMode",
        label: "Zoom mode",
        options: [
          { label: "Fit", value: "fit" },
          { label: "1:1", value: "1:1" },
        ],
      },
      {
        type: "radio",
        key: "fillCanvasDefault",
        label: "Canvas",
        options: [
          { label: "Fill", value: true },
          { label: "Fit", value: false },
        ],
      },
      { type: "toggle", key: "navMapDefault", label: "Minimap" },
      { type: "toggle", key: "bgLoadDefault", label: "Background loading" },
    ],
  },
  {
    label: "Adjustments",
    items: [
      {
        type: "slider",
        key: "bcStep",
        label: "Brightness step",
        min: 0.01,
        max: 0.25,
        step: 0.01,
        format: (v) => Math.round(v * 100) + "%",
      },
      {
        type: "slider",
        key: "toastDuration",
        label: "Toast duration",
        min: 500,
        max: 10000,
        step: 100,
        format: (v) => (v / 1000).toFixed(1) + "s",
      },
      {
        type: "slider",
        key: "zoomScaleFactor",
        label: "Zoom scale factor",
        min: 1.05,
        max: 2.0,
        step: 0.05,
        format: (v) => v.toFixed(2) + "x",
      },
      {
        type: "slider",
        key: "lazyLoadMargin",
        label: "Lazy load margin",
        min: 0,
        max: 2000,
        step: 50,
        format: (v) => v + "px",
      },
    ],
  },
];

let overlay: HTMLDivElement | null = null;

function buildRadio(def: RadioDef, renderers: Renderer[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "_scf_settings_row";

  const label = document.createElement("span");
  label.className = "_scf_settings_label";
  label.textContent = def.label;

  const group = document.createElement("div");
  group.className = "_scf_settings_radios";

  const buttons: HTMLButtonElement[] = [];

  for (const opt of def.options) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "_scf_settings_radio";
    btn.textContent = opt.label;
    btn.addEventListener("click", () => {
      saveConfig({ [def.key]: opt.value });
      sync();
    });
    buttons.push(btn);
    group.appendChild(btn);
  }

  function sync() {
    const current = getConfig()[def.key];
    for (let i = 0; i < def.options.length; i++) {
      buttons[i].classList.toggle("_scf_selected", def.options[i].value === current);
    }
  }

  renderers.push(sync);
  row.append(label, group);
  return row;
}

function buildToggle(def: ToggleDef, renderers: Renderer[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "_scf_settings_row";

  const label = document.createElement("span");
  label.className = "_scf_settings_label";
  label.textContent = def.label;

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "_scf_settings_toggle";
  toggle.addEventListener("click", () => {
    saveConfig({ [def.key]: !getConfig()[def.key] });
    sync();
  });

  function sync() {
    toggle.classList.toggle("_scf_on", !!getConfig()[def.key]);
  }

  renderers.push(sync);
  row.append(label, toggle);
  return row;
}

function buildSlider(def: SliderDef, renderers: Renderer[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "_scf_settings_row";

  const label = document.createElement("span");
  label.className = "_scf_settings_label";
  label.textContent = def.label;

  const controls = document.createElement("div");
  controls.className = "_scf_settings_slider_row";

  const range = document.createElement("input");
  range.type = "range";
  range.className = "_scf_settings_range";
  range.min = String(def.min);
  range.max = String(def.max);
  range.step = String(def.step);

  const valueEl = document.createElement("span");
  valueEl.className = "_scf_settings_value";

  range.addEventListener("input", () => {
    const v = parseFloat(range.value);
    saveConfig({ [def.key]: v });
    valueEl.textContent = def.format(v);
  });

  function sync() {
    const v = getConfig()[def.key] as number;
    range.value = String(v);
    valueEl.textContent = def.format(v);
  }

  renderers.push(sync);
  controls.append(range, valueEl);
  row.append(label, controls);
  return row;
}

function close(): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
  }
}

export function openSettings(): void {
  if (overlay) { close(); return; }

  injectCSS();

  overlay = document.createElement("div");
  overlay.className = "_scf_settings_overlay";
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) close();
  });

  const panel = document.createElement("div");
  panel.className = "_scf_settings_panel";

  // Header
  const header = document.createElement("div");
  header.className = "_scf_settings_header";

  const title = document.createElement("span");
  title.className = "_scf_settings_title";
  title.textContent = "yacomp Settings";

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "_scf_settings_close";
  closeBtn.textContent = "×";
  closeBtn.addEventListener("click", close);

  header.append(title, closeBtn);

  // Body
  const body = document.createElement("div");
  body.className = "_scf_settings_body";

  const renderers: Renderer[] = [];

  for (const group of GROUPS) {
    const groupLabel = document.createElement("div");
    groupLabel.className = "_scf_settings_group_label";
    groupLabel.textContent = group.label;
    body.appendChild(groupLabel);

    for (const item of group.items) {
      let el: HTMLElement;
      switch (item.type) {
        case "radio": el = buildRadio(item, renderers); break;
        case "toggle": el = buildToggle(item, renderers); break;
        case "slider": el = buildSlider(item, renderers); break;
      }
      body.appendChild(el);
    }
  }

  // Footer
  const footer = document.createElement("div");
  footer.className = "_scf_settings_footer";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "_scf_settings_reset";
  resetBtn.textContent = "Reset Defaults";
  resetBtn.addEventListener("click", () => {
    resetConfig();
    for (const r of renderers) r();
  });

  const doneBtn = document.createElement("button");
  doneBtn.type = "button";
  doneBtn.className = "_scf_settings_done";
  doneBtn.textContent = "Done";
  doneBtn.addEventListener("click", close);

  footer.append(resetBtn, doneBtn);

  panel.append(header, body, footer);
  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  // Initial render
  for (const r of renderers) r();
}
