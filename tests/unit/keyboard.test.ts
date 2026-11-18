import { describe, test, expect } from "bun:test";
import { pageMayBind, siteLevelActionOwns } from "../../src/keyboard";

function kev(
  code: string,
  key: string,
  mods: Partial<Record<"shiftKey" | "ctrlKey" | "altKey" | "metaKey", boolean>> = {},
): KeyboardEvent {
  return {
    code,
    key,
    shiftKey: !!mods.shiftKey,
    ctrlKey: !!mods.ctrlKey,
    altKey: !!mods.altKey,
    metaKey: !!mods.metaKey,
  } as KeyboardEvent;
}

describe("pageMayBind", () => {
  test("covers the navigation and switching keys a comparison page binds", () => {
    expect(pageMayBind(kev("ArrowLeft", "ArrowLeft"))).toBe(true);
    expect(pageMayBind(kev("Space", " "))).toBe(true);
    expect(pageMayBind(kev("Digit3", "3"))).toBe(true);
    expect(pageMayBind(kev("KeyQ", "q"))).toBe(true);
    expect(pageMayBind(kev("KeyF", "f", { shiftKey: true }))).toBe(true);
  });

  test("covers the page's own zoom chords", () => {
    expect(pageMayBind(kev("Equal", "=", { ctrlKey: true }))).toBe(true);
    expect(pageMayBind(kev("Digit0", "0", { ctrlKey: true }))).toBe(true);
    expect(pageMayBind(kev("KeyS", "s", { ctrlKey: true }))).toBe(false);
  });

  test("leaves browser and OS chords alone", () => {
    expect(pageMayBind(kev("KeyF", "f", { metaKey: true }))).toBe(false);
    expect(pageMayBind(kev("KeyF", "f", { altKey: true }))).toBe(false);
    expect(pageMayBind(kev("Tab", "Tab"))).toBe(false);
    expect(pageMayBind(kev("F5", "F5"))).toBe(false);
  });
});

describe("siteLevelActionOwns", () => {
  test("claims the filter cycle that also runs outside the viewer", () => {
    expect(siteLevelActionOwns(kev("KeyF", "f"))).toBe(true);
    expect(siteLevelActionOwns(kev("KeyF", "f", { shiftKey: true }))).toBe(true);
  });

  test("leaves viewer-only actions to the page", () => {
    expect(siteLevelActionOwns(kev("KeyM", "m"))).toBe(false);
    expect(siteLevelActionOwns(kev("KeyR", "r"))).toBe(false);
    expect(siteLevelActionOwns(kev("ArrowLeft", "ArrowLeft"))).toBe(false);
  });

  test("ignores the same key with other modifiers", () => {
    expect(siteLevelActionOwns(kev("KeyF", "f", { ctrlKey: true }))).toBe(false);
    expect(siteLevelActionOwns(kev("KeyF", "f", { altKey: true }))).toBe(false);
  });
});
