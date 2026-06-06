// Shared flag: while the settings editor is recording a new binding, the
// keyboard dispatcher stays silent so the pressed key is captured rather than
// triggering an action. A standalone leaf module so both the dispatcher and the
// settings editor can touch it without importing each other.

let capturing = false;

export function setShortcutCapturing(v: boolean): void {
  capturing = v;
}

export function isShortcutCapturing(): boolean {
  return capturing;
}
