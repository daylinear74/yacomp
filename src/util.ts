// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Shared pure helpers                                                       ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// Small dependency-free utilities used across modules. Kept here (imported by
// both, importing neither) so duplicate copies can't silently drift apart.

/** Clamp `n` into the inclusive range [min, max]. */
export function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** Collapse every whitespace run to a single space and trim the ends. */
export function cleanText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Numbered fallback source labels: ["Source 1", "Source 2", … ]. */
export function genericSourceNames(count: number): string[] {
  return Array.from({ length: count }, (_, i) => `Source ${i + 1}`);
}
