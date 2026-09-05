// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Settings modal                                                          ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import {
  getConfig, saveConfig, resetConfig,
  type YacompConfig,
  SITE_KEYS, SITE_LABELS, type SiteKey,
  FILTER_MODE_IDS, type FilterModeId,
  GAMMA_PRESET_IDS, type GammaPresetId,
  shortcutPairFor, setShortcutPair, resetShortcuts, findShortcutConflict,
  exportConfig, importConfig,
} from "../config";
import { injectCSS } from "./css";
import { getShadowRoot } from "./shadow";
import { showToast } from "./toast";
import { activeComps, zoomToast, refit1to1 } from "../filters/zoom";
import { refreshPTPGridToggles } from "../sites/ptp";
import {
  formatShortcut, isReservedShortcut, keyEventToShortcut, type Shortcut,
} from "../shortcuts/types";
import { ACTIONS, actionMeta, type ActionId } from "../shortcuts/registry";
import { setShortcutCapturing } from "../shortcuts/capture-state";

type Renderer = () => void;

interface RadioDef {
  type: "radio";
  key: keyof YacompConfig;
  label: string;
  tooltip?: string;
  options: { label: string; value: string | boolean }[];
  onSave?: () => void;
}

interface ToggleDef {
  type: "toggle";
  key: keyof YacompConfig;
  label: string;
  tooltip?: string;
  onSave?: () => void;
}

interface SliderDef {
  type: "slider";
  key: keyof YacompConfig;
  label: string;
  tooltip?: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onSave?: () => void;
}

interface TextDef {
  type: "text";
  key: keyof YacompConfig;
  label: string;
  tooltip?: string;
  placeholder?: string;
  maxLength?: number;
  // When set, the row is shown only while this returns true (re-evaluated
  // whenever a radio changes, which re-runs every row's sync).
  visibleWhen?: () => boolean;
  onSave?: () => void;
}

type SettingDef = RadioDef | ToggleDef | SliderDef | TextDef;

interface SettingGroup {
  label: string;
  tooltip?: string;
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
        tooltip: "Initial zoom when the viewer opens. 1:1 shows source pixels at native size; Fit scales the row to the viewport.",
        options: [
          { label: "Fit", value: "fit" },
          { label: "1:1", value: "1:1" },
        ],
      },
      {
        type: "radio",
        key: "zoomPercentBase",
        label: "Zoom 100%",
        tooltip: "What the zoom HUD's percentage refers to. Original = source's native pixels; Fit = scaled-to-viewport.",
        options: [
          { label: "Original", value: "original" },
          { label: "Fit", value: "fit" },
        ],
        onSave: () => { if (activeComps.length) showToast(zoomToast()); },
      },
      {
        type: "radio",
        key: "oneToOnePixels",
        label: "1:1 pixels",
        tooltip: "What a source pixel maps to at 1:1 on a HiDPI / Retina screen. Device = one physical screen pixel (a 4K shot fills a 1080p@2x panel, pixel-perfect); Logical = one CSS pixel (the browser's 100%, ~2x magnified on Retina). No effect on standard displays.",
        options: [
          { label: "Logical", value: "logical" },
          { label: "Device", value: "device" },
        ],
        onSave: () => { refit1to1(); if (activeComps.length) showToast(zoomToast()); },
      },
      {
        type: "radio",
        key: "verboseZoom",
        label: "Zoom info",
        tooltip: "Brief shows a single-line percentage toast. Verbose adds pixel counts and viewport callouts.",
        options: [
          { label: "Brief", value: false },
          { label: "Verbose", value: true },
        ],
        onSave: () => { if (activeComps.length) showToast(zoomToast()); },
      },
      {
        type: "radio",
        key: "fillCanvasDefault",
        label: "Canvas",
        tooltip: "Whether each row canvas fills the viewport (cropping) or fits inside it (letterbox) at open. Toggle later with C.",
        options: [
          { label: "Fill", value: true },
          { label: "Fit", value: false },
        ],
      },
      {
        type: "toggle",
        key: "navMapDefault",
        label: "Minimap",
        tooltip: "Whether the thumbnail navigation minimap is on at viewer open. Toggle later with M.",
      },
      {
        type: "toggle",
        key: "bgLoadDefault",
        label: "Background loading",
        tooltip: "When on, all rows download immediately at open instead of waiting for lazy-load. Toggle later with B.",
      },
      {
        type: "toggle",
        key: "mouseSwitch",
        label: "Mouse switch",
        tooltip: "When on, moving the cursor across a row switches the visible source by horizontal position.",
      },
      {
        type: "radio",
        key: "sourceTitleLayout",
        label: "Title layout",
        tooltip: "Dense keeps all source titles centered together at the top. Filled gives every visible source an equal-width column aligned with mouse switching; each title block is centered while its text stays left-aligned.",
        options: [
          { label: "Dense", value: "dense" },
          { label: "Filled", value: "filled" },
        ],
        onSave: () => { for (const c of activeComps) c.updateTitleLayout?.(); },
      },
      {
        type: "radio",
        key: "closeBtnPosition",
        label: "Close button",
        tooltip: "Where the viewer's close button sits. Auto picks left on macOS and right elsewhere. Hide removes the button — close via Esc.",
        options: [
          { label: "Auto", value: "auto" },
          { label: "Left", value: "left" },
          { label: "Right", value: "right" },
          { label: "Hide", value: "hide" },
        ],
        onSave: () => { for (const c of activeComps) c.updateCloseBtn?.(); },
      },
      {
        type: "radio",
        key: "uiChromeMode",
        label: "Chrome",
        tooltip: "Viewer UI visibility. Always = source titles, row nav and buttons stay shown. Default = titles + row nav sit dimmed (full on action), buttons auto-hide. Auto-hide = titles + row nav show only on action, buttons show only when the cursor is near them.",
        options: [
          { label: "Always", value: "always" },
          { label: "Default", value: "default" },
          { label: "Auto-hide", value: "autohide" },
        ],
        onSave: () => { for (const c of activeComps) c.syncAutoHide?.(); },
      },
      {
        type: "slider",
        key: "uiHideDelay",
        label: "UI hide delay",
        tooltip: "How long the viewer chrome stays at full before settling back (dimmed or hidden, per the Chrome mode) after the last activity. Ignored in Always mode.",
        min: 200,
        max: 5000,
        step: 100,
        format: (v) => (v / 1000).toFixed(1) + "s",
        onSave: () => { for (const c of activeComps) c.syncAutoHide?.(); },
      },
      {
        type: "radio",
        key: "ptpGridImageSize",
        label: "PTP image grid",
        tooltip: "Resolution for the inline image grid toggled beside PTP's \"Show comparison\" link. Thumbnail loads PTP's /t/ previews (light); Full loads the /i/ originals. Non-PTP-hosted images are shown as-is.",
        options: [
          { label: "Thumbnail", value: "thumbnail" },
          { label: "Full", value: "full" },
        ],
      },
      {
        type: "radio",
        key: "ptpGridClick",
        label: "PTP grid click",
        tooltip: "What clicking an image in the PTP grid does. Viewer opens the yacomp comparison viewer at that shot; New tab opens the full image in a new browser tab.",
        options: [
          { label: "Viewer", value: "viewer" },
          { label: "New tab", value: "tab" },
        ],
      },
      {
        type: "radio",
        key: "hdbitsImageClick",
        label: "HDBits image click",
        tooltip: "What clicking a comparison image on HDBits does. Viewer opens the yacomp comparison viewer at that shot; Native keeps HDBits' default (open the full image).",
        options: [
          { label: "Viewer", value: "viewer" },
          { label: "Native", value: "native" },
        ],
      },
      {
        type: "toggle",
        key: "hdbitsManualAllThreads",
        label: "Custom comparison everywhere",
        tooltip: "Show the HDBits forum custom-comparison builder in every thread. Off (default): only in Comparisons-forum threads.",
      },
      {
        type: "radio",
        key: "ptpGridToggleStyle",
        label: "PTP grid button",
        tooltip: "The fold toggle beside PTP's \"Show comparison\". ▦ is a single glyph; ▶ ▼ swaps between closed/open arrows; Text reads \"Show grid\"/\"Hide grid\"; Custom lets you type your own.",
        options: [
          { label: "▦", value: "grid" },
          { label: "▶ ▼", value: "triangles" },
          { label: "Text", value: "text" },
          { label: "Custom", value: "custom" },
        ],
        onSave: () => refreshPTPGridToggles(),
      },
      {
        type: "text",
        key: "ptpGridToggleCollapsed",
        label: "Custom (closed)",
        tooltip: "Used with the Custom style: the toggle's label while the grid is folded shut.",
        placeholder: "▦",
        visibleWhen: () => getConfig().ptpGridToggleStyle === "custom",
        onSave: () => refreshPTPGridToggles(),
      },
      {
        type: "text",
        key: "ptpGridToggleExpanded",
        label: "Custom (open)",
        tooltip: "Used with the Custom style: the toggle's label while the grid is open.",
        placeholder: "▦",
        visibleWhen: () => getConfig().ptpGridToggleStyle === "custom",
        onSave: () => refreshPTPGridToggles(),
      },
    ],
  },
  {
    label: "Adjustments",
    items: [
      {
        type: "slider",
        key: "bcStep",
        label: "Brightness step",
        tooltip: "Increment applied per [ ] and { } press. 5% means each step shifts brightness or contrast by 0.05.",
        min: 0.01,
        max: 0.25,
        step: 0.01,
        format: (v) => Math.round(v * 100) + "%",
      },
      {
        type: "slider",
        key: "toastDuration",
        label: "Toast duration",
        tooltip: "How long a HUD toast stays visible before fading out.",
        min: 500,
        max: 10000,
        step: 100,
        format: (v) => (v / 1000).toFixed(1) + "s",
      },
      {
        type: "slider",
        key: "zoomScaleFactor",
        label: "Zoom scale factor",
        tooltip: "Multiplier applied per + / − press. 1.25× means each step grows or shrinks the image by 25%.",
        min: 1.05,
        max: 2.0,
        step: 0.05,
        format: (v) => v.toFixed(2) + "x",
      },
      {
        type: "slider",
        key: "lazyLoadMargin",
        label: "Lazy load margin",
        tooltip: "How far outside the visible area, in CSS pixels, deferred rows start downloading. Not relative to image size — zoom level changes how many rows fit in the margin.",
        min: 0,
        max: 2000,
        step: 50,
        format: (v) => v + "px",
      },
    ],
  },
];

const SITES_TOOLTIP =
  "Per-site toggle. Disabling stops yacomp from injecting on that site without uninstalling.";
const FILTER_CYCLE_TOOLTIP =
  "Visual filters reachable via F / Shift+F. Uncheck to skip; drag enabled rows to reorder.";
const BACKUP_TOOLTIP =
  "Export all settings to a JSON file, or import one to restore them. Importing replaces every current setting.";

const SHORTCUTS_TOOLTIP =
  "Click a field, then press a key (modifiers included) or pick a mouse button. Every action needs a main shortcut; the extra is optional (× clears it). Esc cancels capture; a duplicate binding is rejected.";

const GAMMA_CYCLE_TOOLTIP =
  "Gamma-mismatch presets reachable via G / Shift+G. Uncheck to skip; drag enabled rows to reorder.";

let overlay: HTMLDivElement | null = null;

// Tooltip controller is set when the settings overlay opens and cleared on
// close. buildHelpIcon captures the icon -> tooltip wiring via this closure
// so row-building helpers don't have to thread the tooltip element through.
let tooltipController: {
  show: (anchor: HTMLElement, text: string) => void;
  hide: () => void;
} | null = null;

function buildHelpIcon(text: string): HTMLElement {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "_scf_settings_help";
  btn.textContent = "?";
  btn.setAttribute("aria-label", "More info");
  btn.tabIndex = 0;
  btn.addEventListener("mouseenter", () => tooltipController?.show(btn, text));
  btn.addEventListener("mouseleave", () => tooltipController?.hide());
  btn.addEventListener("focus", () => tooltipController?.show(btn, text));
  btn.addEventListener("blur", () => tooltipController?.hide());
  // Don't let clicks bubble into nearby controls (e.g. radio buttons).
  btn.addEventListener("click", (e) => e.preventDefault());
  return btn;
}

function buildGroupLabel(text: string, tooltip?: string): HTMLElement {
  const el = document.createElement("div");
  el.className = "_scf_settings_group_label";
  el.textContent = text;
  if (tooltip) el.appendChild(buildHelpIcon(tooltip));
  return el;
}

function buildSettingLabel(text: string, tooltip?: string): HTMLElement {
  const el = document.createElement("span");
  el.className = "_scf_settings_label";
  el.textContent = text;
  if (tooltip) el.appendChild(buildHelpIcon(tooltip));
  return el;
}

function buildRadio(def: RadioDef, renderers: Renderer[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "_scf_settings_row";

  const label = buildSettingLabel(def.label, def.tooltip);

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
      // Re-sync every row, not just this one, so rows gated on this value
      // (visibleWhen) show/hide immediately.
      for (const r of renderers) r();
      def.onSave?.();
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

  const label = buildSettingLabel(def.label, def.tooltip);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "_scf_settings_toggle";
  toggle.addEventListener("click", () => {
    saveConfig({ [def.key]: !getConfig()[def.key] });
    sync();
    def.onSave?.();
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

  const label = buildSettingLabel(def.label, def.tooltip);

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
    def.onSave?.();
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

function buildText(def: TextDef, renderers: Renderer[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "_scf_settings_row";

  const label = buildSettingLabel(def.label, def.tooltip);

  const input = document.createElement("input");
  input.type = "text";
  input.className = "_scf_settings_text";
  input.maxLength = def.maxLength ?? 32;
  if (def.placeholder) input.placeholder = def.placeholder;

  input.addEventListener("input", () => {
    saveConfig({ [def.key]: input.value });
    def.onSave?.();
  });

  function sync() {
    if (def.visibleWhen) row.style.display = def.visibleWhen() ? "" : "none";
    input.value = String(getConfig()[def.key] ?? "");
  }

  renderers.push(sync);
  row.append(label, input);
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

// ── Shortcuts editor ─────────────────────────────────────────────────────────

let activeShortcutCapture: (() => void) | null = null;

function startShortcutCapture(
  wrap: HTMLElement,
  btn: HTMLButtonElement,
  id: ActionId,
  slot: "main" | "extra",
  refreshAll: () => void,
): void {
  activeShortcutCapture?.(); // cancel any in-flight capture
  setShortcutCapturing(true);
  btn.classList.add("_scf_capturing");
  btn.textContent = "Press a key…";

  const chips = document.createElement("div");
  chips.className = "_scf_shortcut_chips";
  const gestures: { g: "click" | "dblclick" | "middle" | "back" | "forward"; label: string }[] = [
    { g: "click", label: "Click" },
    { g: "dblclick", label: "2×" },
    { g: "middle", label: "Mid" },
    { g: "back", label: "Back" },
    { g: "forward", label: "Fwd" },
  ];
  for (const { g, label } of gestures) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = "_scf_shortcut_chip";
    chip.textContent = label;
    chip.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      commit({ t: "mouse", g });
    });
    chips.appendChild(chip);
  }
  wrap.appendChild(chips);

  function commit(sc: Shortcut): void {
    if (isReservedShortcut(sc)) {
      cleanup();
      showToast("Reserved for viewer open / source number jump");
      refreshAll();
      return;
    }
    const conflict = findShortcutConflict(sc, id, slot);
    cleanup();
    if (conflict) {
      showToast("Already bound to " + actionMeta(conflict).label);
      refreshAll();
      return;
    }
    const cur = shortcutPairFor(id);
    setShortcutPair(
      id,
      slot === "main" ? { main: sc, extra: cur.extra } : { main: cur.main, extra: sc },
    );
    refreshAll();
    if (id === "viewer.close") for (const c of activeComps) c.updateCloseBtn?.();
  }

  function onKey(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.key === "Escape") { cleanup(); refreshAll(); return; }
    // Wait for the real key — a lone modifier press isn't a binding.
    if (/^(?:Shift|Control|Alt|Meta)(?:Left|Right)$/.test(e.code)) return;
    commit(keyEventToShortcut(e));
  }

  function onOutside(e: Event): void {
    if (!wrap.contains(e.target as Node)) { cleanup(); refreshAll(); }
  }

  function cleanup(): void {
    activeShortcutCapture = null;
    setShortcutCapturing(false);
    btn.classList.remove("_scf_capturing");
    chips.remove();
    window.removeEventListener("keydown", onKey, true);
    // Listener lives on the shadow root: a document-level one would see events
    // retargeted to the host, making every in-panel click look "outside".
    getShadowRoot().removeEventListener("mousedown", onOutside, true);
  }

  activeShortcutCapture = () => { cleanup(); refreshAll(); };
  window.addEventListener("keydown", onKey, true);
  // Defer so the click that started capture doesn't immediately cancel it.
  setTimeout(() => getShadowRoot().addEventListener("mousedown", onOutside, true), 0);
}

function buildCaptureField(
  id: ActionId,
  slot: "main" | "extra",
  refreshAll: () => void,
  refreshFns: Renderer[],
): HTMLElement {
  const wrap = document.createElement("div");
  wrap.className = "_scf_shortcut_field";

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "_scf_shortcut_btn";

  const isExtra = slot === "extra";
  const clear = document.createElement("button");
  clear.type = "button";
  clear.className = "_scf_shortcut_clear";
  clear.textContent = "×";
  clear.title = "Clear";
  clear.addEventListener("click", (e) => {
    e.stopPropagation();
    const cur = shortcutPairFor(id);
    setShortcutPair(id, { main: cur.main, extra: null });
    refreshAll();
  });

  function render(): void {
    const pair = shortcutPairFor(id);
    const sc = slot === "main" ? pair.main : pair.extra;
    btn.textContent = formatShortcut(sc);
    btn.classList.toggle("_scf_shortcut_empty", sc == null);
    if (isExtra) clear.style.display = sc ? "" : "none";
  }
  refreshFns.push(render);
  render();

  btn.addEventListener("click", () => startShortcutCapture(wrap, btn, id, slot, refreshAll));

  wrap.appendChild(btn);
  if (isExtra) wrap.appendChild(clear);
  return wrap;
}

const SHORTCUT_GROUPS = ["Zoom", "Navigate", "Display", "Adjust", "Viewer"] as const;

function buildShortcutsEditor(renderers: Renderer[]): HTMLElement {
  const container = document.createElement("div");
  container.className = "_scf_shortcuts";

  const refreshFns: Renderer[] = [];
  const refreshAll = (): void => { for (const f of refreshFns) f(); };

  for (const group of SHORTCUT_GROUPS) {
    const heading = document.createElement("div");
    heading.className = "_scf_shortcuts_subhead";
    heading.textContent = group;
    container.appendChild(heading);

    for (const meta of ACTIONS.filter((a) => a.group === group)) {
      const row = document.createElement("div");
      row.className = "_scf_shortcut_row";
      const label = document.createElement("span");
      label.className = "_scf_settings_label";
      label.textContent = meta.label;
      const fields = document.createElement("div");
      fields.className = "_scf_shortcut_fields";
      fields.append(
        buildCaptureField(meta.id, "main", refreshAll, refreshFns),
        buildCaptureField(meta.id, "extra", refreshAll, refreshFns),
      );
      row.append(label, fields);
      container.appendChild(row);
    }
  }

  const resetRow = document.createElement("div");
  resetRow.className = "_scf_shortcut_reset_row";
  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "_scf_settings_reset";
  resetBtn.textContent = "Reset shortcuts";
  resetBtn.addEventListener("click", () => {
    resetShortcuts();
    refreshAll();
    for (const c of activeComps) c.updateCloseBtn?.();
  });
  resetRow.appendChild(resetBtn);
  container.appendChild(resetRow);

  renderers.push(refreshAll);
  return container;
}

// ── Import / export ──────────────────────────────────────────────────────────

function downloadText(filename: string, text: string): void {
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Push freshly-imported config into any open viewer + the settings rows. */
function applyImportedConfig(renderers: Renderer[]): void {
  for (const r of renderers) r();
  for (const c of activeComps) {
    c.updateCloseBtn?.();
    c.syncAutoHide?.();
    c.updateFillCanvasBtn?.();
    c.updateSourceMenu?.();
    c.updateTitleLayout?.();
  }
  refreshPTPGridToggles();
}

function buildBackupSection(renderers: Renderer[]): HTMLElement {
  const row = document.createElement("div");
  row.className = "_scf_settings_backup";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.className = "_scf_settings_reset";
  exportBtn.textContent = "Export";
  exportBtn.addEventListener("click", () => downloadText("yacomp-config.json", exportConfig()));

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.className = "_scf_settings_reset";
  importBtn.textContent = "Import";

  const fileInput = document.createElement("input");
  fileInput.type = "file";
  fileInput.accept = "application/json,.json";
  fileInput.style.display = "none";
  fileInput.addEventListener("change", () => {
    const file = fileInput.files?.[0];
    fileInput.value = "";
    if (!file) return;
    void file.text().then((text) => {
      if (importConfig(text)) {
        applyImportedConfig(renderers);
        showToast("Settings imported");
      } else {
        showToast("Couldn't import — not a valid config file");
      }
    });
  });
  importBtn.addEventListener("click", () => fileInput.click());

  row.append(exportBtn, importBtn, fileInput);
  return row;
}

function close(): void {
  if (overlay) {
    overlay.remove();
    overlay = null;
    tooltipController = null;
  }
  // Drop any half-finished capture so its global listeners don't linger.
  activeShortcutCapture?.();
}

const TOOLTIP_GAP = 6;
const TOOLTIP_EDGE_MARGIN = 8;

function positionTooltip(tooltipEl: HTMLElement, anchor: HTMLElement): void {
  const a = anchor.getBoundingClientRect();
  const t = tooltipEl.getBoundingClientRect();
  let left = a.left + a.width / 2 - t.width / 2;
  let top = a.bottom + TOOLTIP_GAP;
  if (top + t.height > window.innerHeight - TOOLTIP_EDGE_MARGIN) {
    top = a.top - t.height - TOOLTIP_GAP;
  }
  left = Math.max(
    TOOLTIP_EDGE_MARGIN,
    Math.min(window.innerWidth - t.width - TOOLTIP_EDGE_MARGIN, left),
  );
  tooltipEl.style.left = left + "px";
  tooltipEl.style.top = Math.max(TOOLTIP_EDGE_MARGIN, top) + "px";
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

  // Shared tooltip element — appended to the overlay so it isn't clipped by
  // the body's overflow:auto. Positioned via JS on icon hover/focus.
  const tooltipEl = document.createElement("div");
  tooltipEl.className = "_scf_settings_tooltip";
  tooltipEl.style.display = "none";
  tooltipController = {
    show: (anchor, text) => {
      tooltipEl.textContent = text;
      tooltipEl.style.display = "block";
      tooltipEl.style.left = "0";
      tooltipEl.style.top = "0";
      positionTooltip(tooltipEl, anchor);
    },
    hide: () => {
      tooltipEl.style.display = "none";
    },
  };

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
    body.appendChild(buildGroupLabel(group.label, group.tooltip));

    for (const item of group.items) {
      let el: HTMLElement;
      switch (item.type) {
        case "radio": el = buildRadio(item, renderers); break;
        case "toggle": el = buildToggle(item, renderers); break;
        case "slider": el = buildSlider(item, renderers); break;
        case "text": el = buildText(item, renderers); break;
      }
      body.appendChild(el);
    }
  }

  // Sites group
  body.appendChild(buildGroupLabel("Sites", SITES_TOOLTIP));
  body.appendChild(buildSiteChips(renderers));

  // Filter Cycle group
  body.appendChild(buildGroupLabel("Filter Cycle", FILTER_CYCLE_TOOLTIP));
  body.appendChild(buildOrderedList(FILTER_MODE_IDS, FILTER_MODE_LABELS, "filterCycle", renderers));

  // Gamma Check Cycle group
  body.appendChild(buildGroupLabel("Gamma Check Cycle", GAMMA_CYCLE_TOOLTIP));
  body.appendChild(buildOrderedList(GAMMA_PRESET_IDS, GAMMA_PRESET_LABELS, "gammaCycle", renderers));

  // Shortcuts editor
  body.appendChild(buildGroupLabel("Shortcuts", SHORTCUTS_TOOLTIP));
  body.appendChild(buildShortcutsEditor(renderers));

  // Backup (import / export)
  body.appendChild(buildGroupLabel("Backup", BACKUP_TOOLTIP));
  body.appendChild(buildBackupSection(renderers));

  // Footer
  const footer = document.createElement("div");
  footer.className = "_scf_settings_footer";

  const resetBtn = document.createElement("button");
  resetBtn.type = "button";
  resetBtn.className = "_scf_settings_reset";
  resetBtn.textContent = "Reset Defaults";
  resetBtn.addEventListener("click", () => {
    resetConfig();
    for (const c of activeComps) {
      c.updateCloseBtn?.();
      c.updateTitleLayout?.();
    }
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
  overlay.appendChild(tooltipEl);
  getShadowRoot().appendChild(overlay);

  // Initial render
  for (const r of renderers) r();
}
