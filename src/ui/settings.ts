// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Settings modal                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  getConfig, saveConfig, resetConfig, DEFAULTS,
  type YacompConfig,
  SITE_KEYS, SITE_LABELS, type SiteKey,
  FILTER_MODE_IDS, type FilterModeId,
  GAMMA_PRESET_IDS, type GammaPresetId,
} from "../config";
import { injectCSS } from "./css";
import { getShadowRoot } from "./shadow";

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
      { type: "toggle", key: "mouseSwitch", label: "Mouse switch" },
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

const FILTER_MODE_LABELS: Record<FilterModeId, string> = {
  solar1: "Solar x1",
  solar2: "Solar x2",
  residual: "Residual",
  luma: "Luma",
  chroma: "Chroma",
};

const GAMMA_PRESET_LABELS: Record<GammaPresetId, string> = {
  "srgb-bt1886": "0.92",
  "aeqt-0p88": "0.88",
  "legacy-mac": "0.82",
};

function buildSiteChips(renderers: Renderer[]): HTMLElement {
  const grid = document.createElement("div");
  grid.className = "_scf_settings_chip_grid";

  const chips: { key: SiteKey; btn: HTMLButtonElement }[] = [];

  for (const key of SITE_KEYS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "_scf_settings_chip";
    btn.textContent = SITE_LABELS[key];
    btn.addEventListener("click", () => {
      const current = getConfig().enabledSites;
      saveConfig({ enabledSites: { ...current, [key]: !current[key] } });
      sync();
    });
    chips.push({ key, btn });
    grid.appendChild(btn);
  }

  function sync() {
    const sites = getConfig().enabledSites;
    for (const { key, btn } of chips) {
      btn.classList.toggle("_scf_on", !!sites[key]);
    }
  }

  renderers.push(sync);
  return grid;
}

function buildOrderedList<T extends string>(
  allIds: readonly T[],
  labels: Record<T, string>,
  configKey: "filterCycle" | "gammaCycle",
  renderers: Renderer[],
): HTMLElement {
  const container = document.createElement("div");
  container.className = "_scf_settings_ordered_list";

  let dragSrcIdx = -1;

  function commitReorder(fromIdx: number, toIdx: number, above: boolean): void {
    if (fromIdx === toIdx) return;
    const current = [...(getConfig()[configKey] as string[])];
    const [moved] = current.splice(fromIdx, 1);
    let insertAt = toIdx > fromIdx ? toIdx - 1 : toIdx;
    if (!above) insertAt++;
    current.splice(insertAt, 0, moved);
    saveConfig({ [configKey]: current });
    rebuild();
  }

  function buildEnabledItem(id: T, label: string, index: number): HTMLElement {
    const row = document.createElement("div");
    row.className = "_scf_settings_ordered_item _scf_enabled";
    row.draggable = true;

    row.addEventListener("dragstart", (e) => {
      dragSrcIdx = index;
      row.classList.add("_scf_dragging");
      e.dataTransfer!.effectAllowed = "move";
    });
    row.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const above = e.clientY < rect.top + rect.height / 2;
      row.classList.toggle("_scf_drag_above", above);
      row.classList.toggle("_scf_drag_below", !above);
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("_scf_drag_above", "_scf_drag_below");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      row.classList.remove("_scf_drag_above", "_scf_drag_below");
      const rect = row.getBoundingClientRect();
      commitReorder(dragSrcIdx, index, e.clientY < rect.top + rect.height / 2);
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("_scf_dragging");
      container.querySelectorAll("._scf_drag_above, ._scf_drag_below").forEach((el) => {
        el.classList.remove("_scf_drag_above", "_scf_drag_below");
      });
      dragSrcIdx = -1;
    });

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = true;
    checkbox.className = "_scf_settings_ordered_check";
    checkbox.addEventListener("change", (e) => {
      e.stopPropagation();
      const current = [...(getConfig()[configKey] as string[])];
      const idx = current.indexOf(id);
      if (idx !== -1) current.splice(idx, 1);
      saveConfig({ [configKey]: current });
      rebuild();
    });

    const handle = document.createElement("span");
    handle.className = "_scf_settings_ordered_handle";
    handle.textContent = "⡇";

    const labelEl = document.createElement("span");
    labelEl.className = "_scf_settings_ordered_label";
    labelEl.textContent = label;

    row.append(checkbox, handle, labelEl);
    return row;
  }

  function buildDisabledItem(id: T, label: string): HTMLElement {
    const row = document.createElement("div");
    row.className = "_scf_settings_ordered_item";

    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.checked = false;
    checkbox.className = "_scf_settings_ordered_check";
    checkbox.addEventListener("change", () => {
      const current = [...(getConfig()[configKey] as string[])];
      current.push(id);
      saveConfig({ [configKey]: current });
      rebuild();
    });

    const handle = document.createElement("span");
    handle.className = "_scf_settings_ordered_handle";

    const labelEl = document.createElement("span");
    labelEl.className = "_scf_settings_ordered_label";
    labelEl.textContent = label;

    row.append(checkbox, handle, labelEl);
    return row;
  }

  function rebuild(): void {
    container.replaceChildren();
    const enabled = getConfig()[configKey] as T[];
    const enabledSet = new Set<string>(enabled);
    const disabled = allIds.filter((id) => !enabledSet.has(id));

    for (let i = 0; i < enabled.length; i++) {
      container.appendChild(buildEnabledItem(enabled[i], labels[enabled[i]], i));
    }

    if (enabled.length > 0 && disabled.length > 0) {
      const sep = document.createElement("div");
      sep.className = "_scf_settings_ordered_sep";
      container.appendChild(sep);
    }

    for (const id of disabled) {
      container.appendChild(buildDisabledItem(id, labels[id]));
    }
  }

  renderers.push(rebuild);
  return container;
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

  // Sites group
  const sitesLabel = document.createElement("div");
  sitesLabel.className = "_scf_settings_group_label";
  sitesLabel.textContent = "Sites";
  body.appendChild(sitesLabel);
  body.appendChild(buildSiteChips(renderers));

  // Filter Cycle group
  const filterLabel = document.createElement("div");
  filterLabel.className = "_scf_settings_group_label";
  filterLabel.textContent = "Filter Cycle";
  body.appendChild(filterLabel);
  body.appendChild(buildOrderedList(FILTER_MODE_IDS, FILTER_MODE_LABELS, "filterCycle", renderers));

  // Gamma Check Cycle group
  const gammaLabel = document.createElement("div");
  gammaLabel.className = "_scf_settings_group_label";
  gammaLabel.textContent = "Gamma Check Cycle";
  body.appendChild(gammaLabel);
  body.appendChild(buildOrderedList(GAMMA_PRESET_IDS, GAMMA_PRESET_LABELS, "gammaCycle", renderers));

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
  getShadowRoot().appendChild(overlay);

  // Initial render
  for (const r of renderers) r();
}
