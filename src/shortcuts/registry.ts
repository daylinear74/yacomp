// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Action registry — the bindable actions and their default shortcuts.       ║
// ║  Pure metadata (no handlers) so config + settings can import it freely.     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { Shortcut, ShortcutPair } from "./types";

export type ActionId =
  | "zoom.in" | "zoom.out" | "zoom.fit" | "zoom.oneToOne"
  | "nav.colPrev" | "nav.colNext" | "nav.rowPrev" | "nav.rowNext"
  | "display.canvas" | "display.minimap" | "display.rowNav" | "display.bgLoad"
  | "filter.next" | "filter.prev" | "gamma.next" | "gamma.prev"
  | "bright.up" | "bright.down" | "contrast.up" | "contrast.down"
  | "adjust.resetSource" | "adjust.resetAll"
  | "viewer.help" | "viewer.close";

export interface ActionMeta {
  id: ActionId;
  label: string;
  group: "Zoom" | "Navigate" | "Display" | "Adjust" | "Viewer";
  defaultMain: Shortcut;
  defaultExtra: Shortcut | null;
  /** Keyboard phase the action fires on (default "down"). */
  phase?: "down" | "up";
  /** Works without an open comparison (filters apply to page images too). */
  siteLevel?: boolean;
}

const key = (code: string, mods?: { shift?: boolean; ctrl?: boolean; alt?: boolean; meta?: boolean }): Shortcut => ({
  t: "key", code, ...mods,
});

export const ACTIONS: ActionMeta[] = [
  // ── Zoom ──
  { id: "zoom.in", label: "Zoom in", group: "Zoom", defaultMain: key("Equal"), defaultExtra: null },
  { id: "zoom.out", label: "Zoom out", group: "Zoom", defaultMain: key("Minus"), defaultExtra: null },
  { id: "zoom.fit", label: "Fit width", group: "Zoom", defaultMain: key("Digit0"), defaultExtra: null },
  { id: "zoom.oneToOne", label: "Actual size (1:1)", group: "Zoom", defaultMain: key("KeyO"), defaultExtra: null },

  // ── Navigate ──
  { id: "nav.colPrev", label: "Previous source", group: "Navigate", defaultMain: key("ArrowLeft"), defaultExtra: key("KeyH") },
  { id: "nav.colNext", label: "Next source", group: "Navigate", defaultMain: key("ArrowRight"), defaultExtra: key("KeyL") },
  { id: "nav.rowPrev", label: "Previous row", group: "Navigate", defaultMain: key("ArrowUp"), defaultExtra: key("KeyK") },
  { id: "nav.rowNext", label: "Next row", group: "Navigate", defaultMain: key("ArrowDown"), defaultExtra: key("KeyJ") },

  // ── Display ──
  { id: "display.canvas", label: "Canvas fill / fit", group: "Display", defaultMain: key("KeyC"), defaultExtra: null, phase: "up" },
  { id: "display.minimap", label: "Minimap", group: "Display", defaultMain: key("KeyM"), defaultExtra: null },
  { id: "display.rowNav", label: "Row nav sidebar", group: "Display", defaultMain: key("KeyR"), defaultExtra: null, phase: "up" },
  { id: "display.bgLoad", label: "Background loading", group: "Display", defaultMain: key("KeyB"), defaultExtra: null, phase: "up" },

  // ── Adjust ──
  { id: "filter.next", label: "Filter mode next", group: "Adjust", defaultMain: key("KeyF"), defaultExtra: null, phase: "up", siteLevel: true },
  { id: "filter.prev", label: "Filter mode prev", group: "Adjust", defaultMain: key("KeyF", { shift: true }), defaultExtra: null, phase: "up", siteLevel: true },
  { id: "gamma.next", label: "Gamma check next", group: "Adjust", defaultMain: key("KeyG"), defaultExtra: null, phase: "up" },
  { id: "gamma.prev", label: "Gamma check prev", group: "Adjust", defaultMain: key("KeyG", { shift: true }), defaultExtra: null, phase: "up" },
  { id: "bright.up", label: "Brightness up", group: "Adjust", defaultMain: key("BracketRight"), defaultExtra: null },
  { id: "bright.down", label: "Brightness down", group: "Adjust", defaultMain: key("BracketLeft"), defaultExtra: null },
  { id: "contrast.up", label: "Contrast up", group: "Adjust", defaultMain: key("BracketRight", { shift: true }), defaultExtra: null },
  { id: "contrast.down", label: "Contrast down", group: "Adjust", defaultMain: key("BracketLeft", { shift: true }), defaultExtra: null },
  { id: "adjust.resetSource", label: "Reset source adjustments", group: "Adjust", defaultMain: key("Backslash"), defaultExtra: null, phase: "up" },
  { id: "adjust.resetAll", label: "Reset all adjustments", group: "Adjust", defaultMain: key("Backslash", { shift: true }), defaultExtra: null, phase: "up" },

  // ── Viewer ──
  { id: "viewer.help", label: "Toggle shortcuts help", group: "Viewer", defaultMain: key("Slash", { shift: true }), defaultExtra: null },
  { id: "viewer.close", label: "Close viewer", group: "Viewer", defaultMain: key("Escape"), defaultExtra: null },
];

const BY_ID = new Map<ActionId, ActionMeta>(ACTIONS.map((a) => [a.id, a]));

export function actionMeta(id: ActionId): ActionMeta {
  return BY_ID.get(id)!;
}

export function defaultPair(id: ActionId): ShortcutPair {
  const m = BY_ID.get(id)!;
  return { main: m.defaultMain, extra: m.defaultExtra };
}

export function isActionId(x: unknown): x is ActionId {
  return typeof x === "string" && BY_ID.has(x as ActionId);
}
