// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Shortcut model — keyboard + mouse bindings (③ customizable shortcuts)     ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

/** A keyboard chord: a `KeyboardEvent.code` plus required modifier state.
 *  Absent modifier flags mean "must NOT be held". */
export interface KeyShortcut {
  t: "key";
  code: string;
  shift?: boolean;
  ctrl?: boolean;
  alt?: boolean;
  meta?: boolean;
}

/** A mouse gesture on the comparison canvas. */
export interface MouseShortcut {
  t: "mouse";
  g: "click" | "dblclick" | "middle" | "back" | "forward";
}

export type Shortcut = KeyShortcut | MouseShortcut;

/** Each action binds a required `main` and an optional `extra`. */
export interface ShortcutPair {
  main: Shortcut;
  extra: Shortcut | null;
}

export const MOUSE_GESTURES = ["click", "dblclick", "middle", "back", "forward"] as const;

/** Fixed viewer controls that are handled outside the customizable action
 * registry. Modified variants remain available for user bindings. */
export function isReservedShortcut(sc: Shortcut): boolean {
  if (
    sc.t !== "key" || sc.shift || sc.ctrl || sc.alt || sc.meta
  ) return false;
  return sc.code === "KeyV" || /^Digit[1-9]$/.test(sc.code);
}

export function keyEventToShortcut(e: KeyboardEvent): KeyShortcut {
  const sc: KeyShortcut = { t: "key", code: e.code };
  if (e.shiftKey) sc.shift = true;
  if (e.ctrlKey) sc.ctrl = true;
  if (e.altKey) sc.alt = true;
  if (e.metaKey) sc.meta = true;
  return sc;
}

/** True when a stored key shortcut exactly matches a keyboard event, including
 *  modifier state (absent flag === modifier must be up). */
export function keyShortcutMatchesEvent(sc: Shortcut, e: KeyboardEvent): boolean {
  return (
    sc.t === "key" &&
    sc.code === e.code &&
    !!sc.shift === e.shiftKey &&
    !!sc.ctrl === e.ctrlKey &&
    !!sc.alt === e.altKey &&
    !!sc.meta === e.metaKey
  );
}

export function mouseShortcutMatches(sc: Shortcut, g: MouseShortcut["g"]): boolean {
  return sc.t === "mouse" && sc.g === g;
}

export function shortcutsEqual(a: Shortcut | null, b: Shortcut | null): boolean {
  if (!a || !b) return a === b;
  if (a.t === "key" && b.t === "key") {
    return (
      a.code === b.code &&
      !!a.shift === !!b.shift &&
      !!a.ctrl === !!b.ctrl &&
      !!a.alt === !!b.alt &&
      !!a.meta === !!b.meta
    );
  }
  if (a.t === "mouse" && b.t === "mouse") return a.g === b.g;
  return false;
}

export function isValidShortcut(x: unknown): x is Shortcut {
  if (typeof x !== "object" || x === null) return false;
  const s = x as Record<string, unknown>;
  if (s.t === "key") return typeof s.code === "string" && s.code.length > 0;
  if (s.t === "mouse") return MOUSE_GESTURES.includes(s.g as MouseShortcut["g"]);
  return false;
}

/** Human-readable label for a shortcut, e.g. "Shift + F", "⌘ K", "Double-click". */
export function formatShortcut(sc: Shortcut | null): string {
  if (!sc) return "—";
  if (sc.t === "mouse") {
    return {
      click: "Click",
      dblclick: "Double-click",
      middle: "Middle-click",
      back: "Back button",
      forward: "Forward button",
    }[sc.g];
  }
  const parts: string[] = [];
  if (sc.ctrl) parts.push("Ctrl");
  if (sc.alt) parts.push("Alt");
  if (sc.meta) parts.push("Meta");
  if (sc.shift) parts.push("Shift");
  parts.push(formatKeyCode(sc.code));
  return parts.join(" + ");
}

function formatKeyCode(code: string): string {
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  const named: Record<string, string> = {
    ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓",
    Minus: "-", Equal: "=", BracketLeft: "[", BracketRight: "]",
    Backslash: "\\", Escape: "Esc", Space: "Space", Enter: "Enter",
    Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'",
    Backquote: "`",
  };
  return named[code] ?? code;
}
