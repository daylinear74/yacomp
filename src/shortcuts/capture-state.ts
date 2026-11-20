// The early keyboard listener forwards recording keys to settings so host
// window-capture listeners cannot run before a newly registered recorder.
// This leaf module keeps the dispatcher and settings from importing each other.

export let shortcutCaptureHandler: ((event: KeyboardEvent) => void) | null = null;

export function setShortcutCaptureHandler(handler: typeof shortcutCaptureHandler): void {
  shortcutCaptureHandler = handler;
}
