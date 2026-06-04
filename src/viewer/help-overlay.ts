// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Shortcuts help overlay — a toggleable keyboard legend (? / toolbar button) ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import { getShadowRoot } from "../ui/shadow";
import { shortcutPairFor } from "../config";
import { formatShortcut } from "../shortcuts/types";
import type { ActionId } from "../shortcuts/registry";

interface LegendRow {
  /** Registry actions whose LIVE bindings render as the key chip (custom
   *  shortcuts are reflected automatically). */
  actions?: ActionId[];
  /** A fixed chip when the key isn't a single bindable action (e.g. "1 – 9"). */
  keys?: string[];
  desc: string;
  /** A faint modifier hint, e.g. "Shift = contrast". */
  note?: string;
}

interface LegendSection {
  title: string;
  rows: LegendRow[];
}

// Curated layout; the keys themselves come from the registry at render time.
const LEGEND: LegendSection[] = [
  {
    title: "Navigation",
    rows: [
      { actions: ["nav.colPrev"], desc: "Previous column" },
      { actions: ["nav.colNext"], desc: "Next column" },
      { actions: ["nav.rowPrev"], desc: "Previous row" },
      { actions: ["nav.rowNext"], desc: "Next row" },
      { keys: ["1 – 9"], desc: "Jump to Nth column" },
    ],
  },
  {
    title: "Zoom",
    rows: [
      { actions: ["zoom.out"], desc: "Zoom out" },
      { actions: ["zoom.in"], desc: "Zoom in" },
      { actions: ["zoom.fit"], desc: "Fit to width" },
      { actions: ["zoom.oneToOne"], desc: "Actual size (1:1)" },
    ],
  },
  {
    title: "Adjustments",
    rows: [
      { actions: ["bright.down", "bright.up"], desc: "Brightness", note: "Shift = contrast" },
      { actions: ["adjust.resetSource"], desc: "Reset current source", note: "Shift = all" },
      { actions: ["gamma.next"], desc: "Gamma mismatch check", note: "Shift = previous" },
    ],
  },
  {
    title: "Toggles",
    rows: [
      { actions: ["filter.next"], desc: "Cycle filter modes", note: "Shift = previous" },
      { actions: ["display.canvas"], desc: "Canvas fill / fit" },
      { actions: ["display.rowNav"], desc: "Row nav sidebar" },
      { actions: ["display.minimap"], desc: "Minimap" },
      { actions: ["display.bgLoad"], desc: "Background loading" },
    ],
  },
  {
    title: "Other",
    rows: [
      { actions: ["viewer.help"], desc: "Toggle this help" },
      { actions: ["viewer.close"], desc: "Reset adjustments / close" },
    ],
  },
];

// Friendlier glyphs for a few shifted-punctuation defaults (display only).
const PRETTY_KEY: Record<string, string> = {
  "Shift + /": "?",
};

function rowChip(row: LegendRow): string {
  if (row.keys) return row.keys.join(" ");
  const chips: string[] = [];
  for (const id of row.actions ?? []) {
    const pair = shortcutPairFor(id);
    const main = formatShortcut(pair.main);
    chips.push(PRETTY_KEY[main] ?? main);
    if (pair.extra) {
      const extra = formatShortcut(pair.extra);
      chips.push(PRETTY_KEY[extra] ?? extra);
    }
  }
  return chips.join(" ");
}

let overlayEl: HTMLElement | null = null;

export function isHelpOpen(): boolean {
  return overlayEl !== null && overlayEl.isConnected;
}

export function hideHelpOverlay(): void {
  overlayEl?.remove();
  overlayEl = null;
}

export function showHelpOverlay(): void {
  if (isHelpOpen()) return;

  const overlay = document.createElement("div");
  overlay.className = "_scf_help_overlay";
  // A press/click anywhere off the panel dismisses (the comparison shows
  // through, so the screen stays usable behind it).
  overlay.addEventListener("mousedown", (e) => {
    if (e.target === overlay) {
      e.stopPropagation();
      hideHelpOverlay();
    }
  });

  const panel = document.createElement("div");
  panel.className = "_scf_help_panel";
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Keyboard shortcuts");

  for (const section of LEGEND) {
    const title = document.createElement("div");
    title.className = "_scf_help_section";
    title.textContent = section.title;
    panel.appendChild(title);

    for (const row of section.rows) {
      const rowEl = document.createElement("div");
      rowEl.className = "_scf_help_row";

      const keys = document.createElement("span");
      keys.className = "_scf_help_keys";
      const chip = document.createElement("kbd");
      chip.className = "_scf_help_chip";
      chip.textContent = rowChip(row);
      keys.appendChild(chip);

      const desc = document.createElement("span");
      desc.className = "_scf_help_desc";
      desc.textContent = row.desc;
      if (row.note) {
        const note = document.createElement("span");
        note.className = "_scf_help_note";
        note.textContent = " · " + row.note;
        desc.appendChild(note);
      }

      rowEl.append(keys, desc);
      panel.appendChild(rowEl);
    }
  }

  overlay.appendChild(panel);
  getShadowRoot().appendChild(overlay);
  overlayEl = overlay;
}

export function toggleHelpOverlay(): void {
  if (isHelpOpen()) hideHelpOverlay();
  else showHelpOverlay();
}
