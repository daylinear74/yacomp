import { describe, test, expect } from "bun:test";
import {
  keyEventToShortcut, keyShortcutMatchesEvent, mouseShortcutMatches,
  shortcutsEqual, isReservedShortcut, isValidShortcut, formatShortcut,
  type Shortcut,
} from "../../src/shortcuts/types";
import { ACTIONS, defaultPair, isActionId } from "../../src/shortcuts/registry";

function kev(
  code: string,
  mods: Partial<Record<"shiftKey" | "ctrlKey" | "altKey" | "metaKey", boolean>> = {},
): KeyboardEvent {
  return {
    code,
    shiftKey: !!mods.shiftKey,
    ctrlKey: !!mods.ctrlKey,
    altKey: !!mods.altKey,
    metaKey: !!mods.metaKey,
  } as KeyboardEvent;
}

describe("key matching", () => {
  test("matches code with exact modifier state (absent modifier must be up)", () => {
    const f: Shortcut = { t: "key", code: "KeyF" };
    expect(keyShortcutMatchesEvent(f, kev("KeyF"))).toBe(true);
    expect(keyShortcutMatchesEvent(f, kev("KeyF", { shiftKey: true }))).toBe(false);
    expect(keyShortcutMatchesEvent(f, kev("KeyG"))).toBe(false);
  });
  test("Shift+F is distinct from F", () => {
    const sf: Shortcut = { t: "key", code: "KeyF", shift: true };
    expect(keyShortcutMatchesEvent(sf, kev("KeyF", { shiftKey: true }))).toBe(true);
    expect(keyShortcutMatchesEvent(sf, kev("KeyF"))).toBe(false);
  });
  test("ctrl / alt / meta participate in the match", () => {
    const co: Shortcut = { t: "key", code: "KeyO", ctrl: true };
    expect(keyShortcutMatchesEvent(co, kev("KeyO", { ctrlKey: true }))).toBe(true);
    expect(keyShortcutMatchesEvent(co, kev("KeyO"))).toBe(false);
  });
  test("keyEventToShortcut records only held modifiers", () => {
    expect(keyEventToShortcut(kev("KeyO"))).toEqual({ t: "key", code: "KeyO" });
    expect(keyEventToShortcut(kev("KeyO", { shiftKey: true, ctrlKey: true }))).toEqual({
      t: "key", code: "KeyO", shift: true, ctrl: true,
    });
  });
});

describe("mouse / equality / validity", () => {
  test("mouseShortcutMatches", () => {
    expect(mouseShortcutMatches({ t: "mouse", g: "dblclick" }, "dblclick")).toBe(true);
    expect(mouseShortcutMatches({ t: "mouse", g: "click" }, "dblclick")).toBe(false);
    expect(mouseShortcutMatches({ t: "key", code: "KeyO" }, "click")).toBe(false);
  });
  test("shortcutsEqual", () => {
    expect(shortcutsEqual({ t: "key", code: "KeyF", shift: true }, { t: "key", code: "KeyF", shift: true })).toBe(true);
    expect(shortcutsEqual({ t: "key", code: "KeyF" }, { t: "key", code: "KeyF", shift: true })).toBe(false);
    expect(shortcutsEqual({ t: "mouse", g: "click" }, { t: "mouse", g: "click" })).toBe(true);
    expect(shortcutsEqual(null, null)).toBe(true);
    expect(shortcutsEqual(null, { t: "mouse", g: "click" })).toBe(false);
  });
  test("isValidShortcut", () => {
    expect(isValidShortcut({ t: "key", code: "KeyO" })).toBe(true);
    expect(isValidShortcut({ t: "key", code: "" })).toBe(false);
    expect(isValidShortcut({ t: "mouse", g: "back" })).toBe(true);
    expect(isValidShortcut({ t: "mouse", g: "scroll" })).toBe(false);
    expect(isValidShortcut(null)).toBe(false);
    expect(isValidShortcut("KeyO")).toBe(false);
  });
});

describe("fixed viewer controls", () => {
  test("reserves only unmodified V and source-number keys", () => {
    expect(isReservedShortcut({ t: "key", code: "KeyV" })).toBe(true);
    expect(isReservedShortcut({ t: "key", code: "Digit1" })).toBe(true);
    expect(isReservedShortcut({ t: "key", code: "Digit9" })).toBe(true);
    expect(isReservedShortcut({ t: "key", code: "Digit0" })).toBe(false);
    expect(isReservedShortcut({ t: "key", code: "KeyV", shift: true })).toBe(false);
    expect(isReservedShortcut({ t: "key", code: "Digit2", shift: true })).toBe(false);
    expect(isReservedShortcut({ t: "key", code: "Digit2", ctrl: true })).toBe(false);
  });
});

describe("formatShortcut", () => {
  test("keys render modifiers and friendly glyphs", () => {
    expect(formatShortcut({ t: "key", code: "KeyF", shift: true })).toBe("Shift + F");
    expect(formatShortcut({ t: "key", code: "ArrowLeft" })).toBe("←");
    expect(formatShortcut({ t: "key", code: "Digit0" })).toBe("0");
    expect(formatShortcut({ t: "key", code: "Escape" })).toBe("Esc");
  });
  test("mouse + none", () => {
    expect(formatShortcut({ t: "mouse", g: "dblclick" })).toBe("Double-click");
    expect(formatShortcut(null)).toBe("—");
  });
});

describe("registry", () => {
  test("ids are unique and every action has a valid default main", () => {
    const ids = ACTIONS.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of ACTIONS) expect(isValidShortcut(a.defaultMain)).toBe(true);
  });
  test("shipped defaults are conflict-free (no two actions share a binding)", () => {
    const keyOf = (s: Shortcut) =>
      s.t === "key" ? `k:${s.code}:${!!s.shift}:${!!s.ctrl}:${!!s.alt}:${!!s.meta}` : `m:${s.g}`;
    const seen = new Set<string>();
    for (const a of ACTIONS) {
      for (const sc of [a.defaultMain, a.defaultExtra]) {
        if (!sc) continue;
        const k = keyOf(sc);
        expect(seen.has(k)).toBe(false);
        seen.add(k);
      }
    }
  });
  test("isActionId / defaultPair", () => {
    expect(isActionId("zoom.in")).toBe(true);
    expect(isActionId("nope")).toBe(false);
    expect(defaultPair("nav.colPrev")).toEqual({
      main: { t: "key", code: "ArrowLeft" }, extra: { t: "key", code: "KeyH" },
    });
  });
});
