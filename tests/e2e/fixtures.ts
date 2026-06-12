import { test as base, expect } from "@playwright/test";

// ─── Hermetic network for the e2e suite ──────────────────────────────────────
//
// Fixture pages reference external hosts (example.invalid, i.slow.pics,
// imgbox, flagcounter, …). Left unrouted, those requests leave the machine:
// the page's `load` event — which `page.goto` waits for — is then held
// hostage by real DNS/TCP to hosts that don't exist or don't answer. In
// isolation they fail fast, but under full-suite parallelism the stalled
// connections pile up and `goto` can eat the whole 30s test timeout (the
// 062/079 forum-post flake: the parser had long finished and the page was
// correct, the test just never got past goto + the ready wait in time).
//
// This context-level catch-all keeps every request local and instant:
//   - 127.0.0.1 / localhost          → continue to the fixture server
//   - external document navigations  → fulfill a stub page (popup tests
//                                       still see their target URL commit)
//   - everything else external       → abort (same end state as today's
//                                       failed fetch, without the latency)
//
// Per-test `page.route` stubs are unaffected: Playwright consults page
// routes before context routes, so tests that fulfill t.hdbits.org,
// imgbox, i.slow.pics, etc. keep working exactly as written.
export const test = base.extend({
  context: async ({ context }, use) => {
    await context.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" || url.hostname === "localhost") {
        return route.continue();
      }
      if (route.request().resourceType() === "document") {
        return route.fulfill({
          contentType: "text/html",
          body: "<!doctype html><title>external navigation blocked by tests/e2e/fixtures.ts</title>",
        });
      }
      return route.abort("blockedbyclient");
    });
    await use(context);
  },
});

export { expect };
