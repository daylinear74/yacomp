import { describe, test, expect } from "bun:test";
import { join } from "node:path";

// The config bootstrap runs at module import, so these tests spawn a fresh
// bun process with GM_getValue/GM_setValue stubbed BEFORE the import — the
// in-process suite already has src/config.ts cached with GM_* undefined.
function runBootstrap(gmSetup: string, probe: string): string {
  const script = `
    ${gmSetup}
    const cfg = await import(${JSON.stringify(join(import.meta.dir, "../../src/config.ts"))});
    console.log(JSON.stringify(${probe}));
  `;
  const result = Bun.spawnSync(["bun", "-e", script]);
  if (!result.success) {
    throw new Error(`bootstrap probe failed: ${result.stderr.toString()}`);
  }
  return JSON.parse(result.stdout.toString().trim());
}

describe("config bootstrap", () => {
  test("keeps the stored config when the version-bump persist throws", () => {
    // An old-version payload forces the re-persist; a failing GM_setValue
    // must not discard the already-loaded user settings.
    const out = runBootstrap(
      `
      globalThis.GM_getValue = () => ({ v: 2, bcStep: 0.2 });
      globalThis.GM_setValue = () => { throw new Error("denied"); };
      `,
      "cfg.bcStep()",
    );
    expect(out).toBe(0.2);
  });

  test("falls back to defaults when GM_getValue itself is unavailable", () => {
    const out = runBootstrap("", "cfg.bcStep()");
    expect(out).toBe(0.05);
  });
});
