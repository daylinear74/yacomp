import { test, expect, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";

// Stub the slow.pics CDN so the suite is hermetic (no external network).
// Specific fixture files use production-risk dimensions; the fallback keeps
// unrelated rows cheap and deterministic.
const IMAGE_SIZES: Record<string, { width: number; height: number }> = {
  "wide-source-a.webp": { width: 1920, height: 804 },
  "wide-source-b.webp": { width: 1920, height: 1080 },
  "wide-source-c.webp": { width: 1920, height: 1080 },
  "pillar-source-a.webp": { width: 1480, height: 1080 },
  "pillar-source-b.webp": { width: 1920, height: 1080 },
  "pillar-source-c.webp": { width: 1920, height: 1080 },
};

const DEFAULT_IMAGE_SIZE = { width: 160, height: 90 };

function fixtureSvg({ width, height }: { width: number; height: number }): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
    `<rect width="${width}" height="${height}" fill="#3a3a3a"/></svg>`
  );
}

async function expectRowCanvasAspectRatio(
  page: Page,
  rowIndex: number,
  expectedAspectRatio: string,
  expectedRatio: number,
): Promise<void> {
  const row = page.locator("._scf_comp_row").nth(rowIndex);

  await expect.poll(async () => row.evaluate((el) => (el as HTMLElement).style.aspectRatio))
    .toBe(expectedAspectRatio);

  const box = await row.boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width / box!.height).toBeCloseTo(expectedRatio, 2);
}

async function openViewer(
  page: Page,
  opts?: { config?: Record<string, unknown> },
): Promise<void> {
  await page.goto("/");
  if (opts?.config) {
    // The fixture boots synchronously before #open-viewer is clickable, so by
    // the time page.click runs the __yacomp hooks are wired up. Apply config
    // BEFORE opening because viewer-open paths (defaultZoomMode, etc.) read
    // the config at open time, not on every render.
    await page.evaluate((c) => {
      (window as unknown as { __yacomp: { saveConfig: (p: Record<string, unknown>) => void } })
        .__yacomp.saveConfig(c);
    }, opts.config);
  }
  await page.click("#open-viewer");
  await expect(page.locator("._scf_comp")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await page.route(/i\.slow\.pics/, (route) => {
    const filename = new URL(route.request().url()).pathname.split("/").pop() ?? "";
    const size = IMAGE_SIZES[filename] ?? DEFAULT_IMAGE_SIZE;

    return route.fulfill({ contentType: "image/svg+xml", body: fixtureSvg(size) });
  });
});

test("fixture page loads and shows comparisons", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#fixture-status")).toContainText("6 comparisons x 3 sources");
  await expect(page.locator(".fixture-row")).toHaveCount(6);
});

test("viewer opens on button click", async ({ page }) => {
  await openViewer(page);
});

test("viewer opens with V shortcut", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("KeyV");
  await expect(page.locator("._scf_comp")).toBeVisible();
});

test("viewer closes on Escape", async ({ page }) => {
  await openViewer(page);
  await page.keyboard.press("Escape");
  await expect(page.locator("._scf_comp")).not.toBeVisible();
});

test("column switching with number keys", async ({ page }) => {
  await openViewer(page);

  const label = page.locator("._scf_comp_label");

  // The active source's label entry is opaque, the others dimmed (opacity .4).
  // Assert the active entry moves: a "contains text" check would pass even if
  // switching were broken, since every source is always listed in the label.
  await page.keyboard.press("3");
  await expect(label.locator("span", { hasText: "3." })).toHaveCSS("opacity", "1");
  await expect(label.locator("span", { hasText: "1." })).toHaveCSS("opacity", "0.4");

  await page.keyboard.press("1");
  await expect(label.locator("span", { hasText: "1." })).toHaveCSS("opacity", "1");
  await expect(label.locator("span", { hasText: "3." })).toHaveCSS("opacity", "0.4");
});

test("source navigation wraps with arrow keys", async ({ page }) => {
  await openViewer(page);

  const label = page.locator("._scf_comp_label");

  await page.keyboard.press("ArrowRight");
  await expect(label.locator("span", { hasText: "2." })).toHaveCSS("opacity", "1");
  await expect(label.locator("span", { hasText: "1." })).toHaveCSS("opacity", "0.4");

  await page.keyboard.press("ArrowLeft");
  await expect(label.locator("span", { hasText: "1." })).toHaveCSS("opacity", "1");
  await expect(label.locator("span", { hasText: "2." })).toHaveCSS("opacity", "0.4");

  await page.keyboard.press("ArrowLeft");
  await expect(label.locator("span", { hasText: "3." })).toHaveCSS("opacity", "1");
  await expect(label.locator("span", { hasText: "1." })).toHaveCSS("opacity", "0.4");
});

test("row navigation with arrow keys", async ({ page }) => {
  await openViewer(page);

  await page.keyboard.press("ArrowDown");
  const nav = page.locator("._scf_row_nav_item._scf_active");
  await expect(nav).toContainText("2");
});

test("source menu hides sources and protects the last visible source", async ({ page }) => {
  // Pin chrome on so the toolbar stays clickable regardless of auto-hide timing.
  await openViewer(page, { config: { uiChromeMode: "always" } });

  const sourceMenu = page.locator("._scf_source_menu");
  const sourceButton = sourceMenu.getByRole("button", { name: "Choose visible sources" });
  const count = sourceButton.locator("._scf_source_menu_count");
  const options = sourceMenu.locator("._scf_source_option");

  await expect(count).toHaveText("3 / 3");
  await sourceButton.click();
  await expect(sourceButton).toHaveAttribute("aria-expanded", "true");
  await expect(options).toHaveCount(3);

  await options.nth(1).locator("input").uncheck();
  await expect(count).toHaveText("2 / 3");

  await sourceButton.click();
  await expect(sourceButton).toHaveAttribute("aria-expanded", "false");
  await page.keyboard.press("2");

  const label = page.locator("._scf_comp_label");
  await expect(label.locator("span")).toHaveCount(2);
  await expect(label.locator("span", { hasText: "2." })).toHaveCSS("opacity", "1");

  await sourceButton.click();
  await options.nth(0).locator("input").uncheck();
  await expect(count).toHaveText("1 / 3");
  await expect(options.nth(2).locator("input")).toBeChecked();
  await expect(options.nth(2).locator("input")).toBeDisabled();
});

test("zoom shortcuts zoom in and reset to fit", async ({ page }) => {
  // Pin to fit mode: this test validates the +/0 keyboard pathway against a
  // fit baseline, not the chosen default. Default is "1:1" so the viewer
  // would open already zoomed and the not-zoomed precondition would fail.
  await openViewer(page, { config: { defaultZoomMode: "fit" } });

  const comp = page.locator("._scf_comp");
  const row = page.locator("._scf_comp_row").first();
  const viewportWidth = page.viewportSize()?.width ?? 1280;

  await expect(comp).not.toHaveClass(/_scf_zoomed/);

  await page.keyboard.press("Equal");
  await expect(comp).toHaveClass(/_scf_zoomed/);
  await expect.poll(async () => row.evaluate((el) => (el as HTMLElement).style.width))
    .toBe(`${Math.round(viewportWidth * 1.25)}px`);

  await page.keyboard.press("Digit0");
  await expect(comp).not.toHaveClass(/_scf_zoomed/);
  await expect.poll(async () => row.evaluate((el) => (el as HTMLElement).style.width))
    .toBe("100vw");
});

test("mixed-resolution rows keep max canvas aspect ratio", async ({ page }) => {
  await openViewer(page);

  // The row canvas aspect ratio is the max of every loaded source's
  // natural dimensions. Under default lazy-load only the active column
  // is fetched per row, so the row reads col 0's AR until other columns
  // are explored. Toggle bg-load (B shortcut) to bring every source in
  // and make the max-AR contract observable without driving every
  // column-switch keystroke. The asymptote is the contract; bg-load is
  // the deterministic path to it.
  await page.keyboard.press("KeyB");

  await expectRowCanvasAspectRatio(page, 0, "1920 / 1080", 1920 / 1080);

  await page.keyboard.press("ArrowDown");
  await expect(page.locator("._scf_row_nav_item._scf_active")).toContainText("2");
  await expectRowCanvasAspectRatio(page, 1, "1920 / 1080", 1920 / 1080);
});

// ─── lazy load: defer src until a row enters or a user switches col ────────
//
// The viewer's lazy-load contract: a row's `<img>` cells start with
// `dataset.src` and only get `src` set when (a) the row enters the IO
// buffer (loadRow promotes the active column), (b) the user switches
// to a new column on a row that's already been loaded (switchColumn
// promotes that one cell), or (c) the user toggles bg-load (fillRow
// promotes everything). Without this contract, opening a 3×6 grid
// fired ~15 simultaneous image requests at viewer-open and defeated
// the IO-based lazy load.
//
// Counting `src` vs `dataset.src` on the actual <img> elements is more
// reliable than counting `page.on("request")` events, because the
// fixture page renders a contact sheet outside the viewer that uses
// the same URLs — the browser serves the viewer's <img> elements from
// the memory cache and the request event may or may not fire.

async function countPromotedCells(page: Page): Promise<{
  promoted: number;
  deferred: number;
  total: number;
}> {
  return await page.evaluate(() => {
    const root = (document.getElementById("_scf_root_") as HTMLElement | null)?.shadowRoot;
    if (!root) throw new Error("yacomp shadow root missing");
    const imgs = Array.from(root.querySelectorAll("._scf_comp_img")) as HTMLImageElement[];
    return {
      promoted: imgs.filter((img) => !!img.src && !img.dataset.src).length,
      deferred: imgs.filter((img) => !!img.dataset.src).length,
      total: imgs.length,
    };
  });
}

test("lazy load: opening the viewer promotes only a handful of cells", async ({ page }) => {
  await openViewer(page);
  // Let the IO's initial intersection check + post-paint loads settle.
  await page.waitForTimeout(300);

  const stats = await countPromotedCells(page);
  // 6 rows × 3 cols = 18 — the fixture sanity check.
  expect(stats.total).toBe(18);
  // Under the lazy contract:
  // - row 0 col 0: eager via buildRow
  // - one or two follow-on rows are pulled into the IO buffer by the
  //   200px rootMargin and have their active column (col 0) promoted
  // - everything else stays deferred
  // ≤4 absorbs viewport-size variance. Pre-fix the count was 6+ at
  // open, then exploded past 15 after the first mousemove (which fired
  // switchColumn, which cross-loaded across every row).
  expect(stats.promoted).toBeLessThanOrEqual(4);
  expect(stats.promoted).toBeGreaterThanOrEqual(1);
});

test("lazy load: scrolling the viewport promotes one cell per revealed row", async ({ page }) => {
  await openViewer(page);
  await page.waitForTimeout(300);

  // Step the scroll position one half-viewport at a time so the IO
  // fires for each row as it passes through the visible area.
  // `scrollTo({behavior: "auto"})` would jump straight to the bottom
  // and the IO would only see the destination's rows — not the rows
  // passed through. No mouse movement is involved, so the mouseSwitch
  // mousemove handler can't fire and inflate the promoted count.
  await page.evaluate(() => {
    return new Promise<void>((resolve) => {
      const root = (document.getElementById("_scf_root_") as HTMLElement | null)?.shadowRoot;
      const comp = root?.querySelector("._scf_comp") as HTMLElement | null;
      if (!comp) { resolve(); return; }
      const scrollHeight = comp.scrollHeight;
      const step = Math.max(100, comp.clientHeight / 2);
      let pos = 0;
      const tick = () => {
        comp.scrollTop = pos;
        if (pos >= scrollHeight) { resolve(); return; }
        pos += step;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  });
  await page.waitForTimeout(500);

  const stats = await countPromotedCells(page);
  // Every row should now have its active column (col 0) promoted:
  // 6 rows × 1 promoted col = 6 cells. Cols 1 and 2 stay deferred —
  // they only load on column switch or bg-load.
  expect(stats.promoted).toBeGreaterThanOrEqual(6);
  expect(stats.deferred).toBeGreaterThanOrEqual(12); // 18 - 6 = 12 remaining
});

test("lazy load: switching columns doesn't cross-load across unloaded rows", async ({ page }) => {
  await openViewer(page);
  await page.waitForTimeout(300);

  const before = (await countPromotedCells(page)).promoted;

  // Switch the active source to col 2 (number keys are 1-indexed).
  await page.keyboard.press("3");
  await page.waitForTimeout(300);

  const after = (await countPromotedCells(page)).promoted;

  // switchColumn now gates src promotion by `rd.loaded`. The 1-2 rows
  // the IO has loaded each promote col 2; the remaining rows stay
  // deferred. Net new promotions: bounded by (loaded rows). A bound of
  // <6 proves we no longer cross-load every row in the grid (the
  // pre-fix behavior would have been exactly +6).
  expect(after - before).toBeLessThan(6);
  // Sanity: at least row 0's col 2 promoted, since row 0 is always
  // loaded.
  expect(after).toBeGreaterThan(before);
});

// ─── filter ordering: the chroma/luma anchor-first contract ─────────────────

interface FilterLogEntry {
  rowIdx: number;
  colIdx: number;
  t: number;
}

// Installs a MutationObserver that records every `style.filter` change on
// the comp's source images (those carrying a `_scf_comp_img` class — the
// `_scf_comp_sizer` and any page-level images are ignored). Each entry is
// indexed by (rowIdx, colIdx) so the test can assert which cell the browser
// filtered first. Must be called BEFORE pressing the filter shortcut so no
// mutations are missed.
async function installFilterMutationLogger(
  page: Page,
  filterSubstring: string,
): Promise<void> {
  await page.evaluate((substring) => {
    type LogEntry = { rowIdx: number; colIdx: number; t: number };
    const log: LogEntry[] = [];
    // The viewer renders inside a shadow root (see src/ui/shadow.ts), so
    // document.querySelectorAll can't see the comp rows. Resolve the open
    // shadow root first; fall back to document so future refactors that
    // move the viewer back to the light DOM don't silently break the test.
    const shadow =
      (document.getElementById("_scf_root_") as HTMLElement | null)?.shadowRoot;
    const scope: ParentNode = shadow ?? document;
    const rows = Array.from(scope.querySelectorAll("._scf_comp_row"));
    const observer = new MutationObserver((records) => {
      for (const r of records) {
        if (r.attributeName !== "style") continue;
        const img = r.target as HTMLImageElement;
        if (!img.style.filter.includes(substring)) continue;
        const cell = img.closest("._scf_comp_cell");
        const row = cell?.parentElement;
        if (!cell || !row) continue;
        const rowIdx = rows.indexOf(row);
        const colIdx = Array.from(row.querySelectorAll("._scf_comp_cell")).indexOf(cell);
        log.push({ rowIdx, colIdx, t: performance.now() });
      }
    });
    for (const row of rows) {
      for (const img of row.querySelectorAll("._scf_comp_img")) {
        observer.observe(img, { attributes: true, attributeFilter: ["style"] });
      }
    }
    (window as unknown as { __filterLog: LogEntry[] }).__filterLog = log;
    (window as unknown as { __filterObserver: MutationObserver }).__filterObserver =
      observer;
  }, filterSubstring);
}

async function readFilterLog(page: Page): Promise<FilterLogEntry[]> {
  return await page.evaluate(
    () => (window as unknown as { __filterLog: FilterLogEntry[] }).__filterLog,
  );
}

async function resetFilterLog(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __filterLog: FilterLogEntry[] }).__filterLog.length = 0;
  });
}

async function expectLogToHaveEntries(page: Page, atLeast: number): Promise<void> {
  await expect
    .poll(async () => (await readFilterLog(page)).length, { timeout: 5000 })
    .toBeGreaterThanOrEqual(atLeast);
}

test("chroma applies the anchor source's filter before any background source", async ({
  page,
}) => {
  await openViewer(page);
  await installFilterMutationLogger(page, "chroma");

  // Shift+F walks the mode cycle backward; from Off that lands on Chroma in
  // a single press, which keeps the test focused on the ordering, not on
  // counting key presses through the intermediate modes.
  await page.keyboard.press("Shift+KeyF");

  // The first style.filter mutation must belong to the currently visible
  // image (default row 0, col 0). If the anchor-first scheduler regresses
  // and the bounded queue starts racing the anchor, a background cell can
  // win and this assertion catches it.
  await expectLogToHaveEntries(page, 1);
  const log = await readFilterLog(page);
  expect(log[0]).toMatchObject({ rowIdx: 0, colIdx: 0 });
});

test("chroma's background queue runs past the anchor cell to other eligible rows", async ({
  page,
}) => {
  await openViewer(page);
  await installFilterMutationLogger(page, "chroma");
  await page.keyboard.press("Shift+KeyF");

  // Liveness: the queue must run past the anchor cell. At viewer open
  // only col 0 of any row carries `src` — buildRow eagerly loads col 0
  // for non-deferred rows and loadRow loads only the active column for
  // rows the IO promotes. The filter pipeline skips cells with no
  // `src`, so a healthy chroma sync touches (0, 0) plus at least one
  // additional cell — typically another row's col 0 once the IO has
  // brought it into the buffer. If the bounded queue stalls at the
  // anchor, this assertion catches it.
  await expect
    .poll(
      async () => {
        const log = await readFilterLog(page);
        const cells = new Set(log.map((e) => `${e.rowIdx},${e.colIdx}`));
        return cells.has("0,0") && cells.size >= 2;
      },
      { timeout: 5000 },
    )
    .toBe(true);
});

test("switching the active source re-anchors the next chroma sync to the new column", async ({
  page,
}) => {
  await openViewer(page);
  await installFilterMutationLogger(page, "chroma");

  // First sync: anchor at col 0.
  await page.keyboard.press("Shift+KeyF");
  await expectLogToHaveEntries(page, 1);
  const firstSync = await readFilterLog(page);
  expect(firstSync[0]).toMatchObject({ rowIdx: 0, colIdx: 0 });

  // Switch the visible source to col 2 (number keys are 1-indexed).
  await page.keyboard.press("3");

  // switchColumn now only promotes col 2 in rows the IO has already
  // loaded (see src/viewer/comparison.ts). Each promotion fires
  // applyFilterToImg WITHOUT a generation guard, so the writes are
  // async (detectCS awaits a Range fetch). Wait for row 0 col 2 to
  // land in the chroma log — that's the deterministic case — then
  // yield a tick so any other loaded row's lingering write flushes
  // before we reset the log.
  await expect
    .poll(
      async () => {
        const log = await readFilterLog(page);
        return log.some((e) => e.rowIdx === 0 && e.colIdx === 2);
      },
      { timeout: 5000 },
    )
    .toBe(true);
  await page.waitForTimeout(150);

  // Toggle the filter off then back on so a fresh sync fires with the new
  // active column as the anchor. (Switching sources alone doesn't re-run
  // the filter pipeline — what we want to verify is that the next sync
  // *does* honor the updated anchor.)
  await resetFilterLog(page);
  await page.keyboard.press("KeyF"); // Chroma → Off
  await page.keyboard.press("Shift+KeyF"); // Off → Chroma again

  await expectLogToHaveEntries(page, 1);
  const secondSync = await readFilterLog(page);
  expect(secondSync[0]).toMatchObject({ rowIdx: 0, colIdx: 2 });
});

// ─── SVG filter scope: defs and images must share a tree ───────────────────
//
// CSS `filter: url(#fragment)` is resolved within the element's containing
// tree scope. When the viewer was moved into a shadow root but the SVG
// `<defs>` were left on document.body, every SVG filter (Solar / Residual /
// Luma / Chroma / Gamma mismatch) silently rendered with no visual effect —
// `style.filter` was set, but the URL pointed at an id the shadow tree
// couldn't see. This test pins the invariant: for every filter URL the app
// sets, the referenced <filter> element must be findable from the image's
// own root node.

async function readActiveFilterUrl(
  page: Page,
): Promise<{ filter: string; fragmentId: string } | null> {
  return await page.evaluate(() => {
    const shadow = (document.getElementById("_scf_root_") as HTMLElement | null)
      ?.shadowRoot;
    if (!shadow) return null;
    const img = shadow.querySelector("._scf_comp_img") as HTMLImageElement | null;
    if (!img) return null;
    const filter = img.style.filter;
    // The browser may serialize `url(#id)` as `url("#id")` (with quotes) —
    // accept both forms so the assertion isn't tied to the engine's choice.
    const match = filter.match(/url\(['"]?#([^'")]+)['"]?\)/);
    return match ? { filter, fragmentId: match[1] } : null;
  });
}

async function pollActiveFilterUrl(
  page: Page,
): Promise<{ filter: string; fragmentId: string }> {
  // syncAll() schedules filter writes through awaited promises (detectCS for
  // chroma/luma can defer a tick), so each F press takes at least a microtask
  // to land. Poll instead of reading once and racing the queue.
  await expect.poll(async () => (await readActiveFilterUrl(page)) !== null, {
    timeout: 5000,
  }).toBe(true);
  const result = await readActiveFilterUrl(page);
  if (!result) throw new Error("filter URL never appeared");
  return result;
}

async function expectFilterIdResolvesFromImageRoot(
  page: Page,
  fragmentId: string,
): Promise<void> {
  const found = await page.evaluate((id) => {
    const shadow = (document.getElementById("_scf_root_") as HTMLElement | null)
      ?.shadowRoot;
    if (!shadow) return false;
    const img = shadow.querySelector("._scf_comp_img") as HTMLImageElement | null;
    if (!img) return false;
    // Mirror what the browser does to resolve `filter: url(#id)`: look up
    // the fragment in the image's own containing tree.
    const root = img.getRootNode() as Document | ShadowRoot;
    return !!root.getElementById(id);
  }, fragmentId);
  expect(found).toBe(true);
}

test("SVG filter defs live in the same tree as page images before viewer opens", async ({
  page,
}) => {
  await page.goto("/");
  await page.keyboard.press("KeyF");

  async function readPageFilterState(): Promise<{
    fragmentId: string;
    rootIsDocument: boolean;
    resolvesFromImageRoot: boolean;
  } | null> {
    return await page.evaluate(() => {
      const img = document.querySelector(".fixture-row img") as HTMLImageElement | null;
      if (!img) return null;
      const match = img.style.filter.match(/url\(['"]?#([^'")]+)['"]?\)/);
      if (!match) return null;
      const root = img.getRootNode() as Document | ShadowRoot;
      return {
        fragmentId: match[1],
        rootIsDocument: root === document,
        resolvesFromImageRoot: !!root.getElementById(match[1]),
      };
    });
  }

  await expect.poll(async () => await readPageFilterState(), { timeout: 5000 }).not.toBeNull();
  const state = await readPageFilterState();
  expect(state).not.toBeNull();
  expect(state!.rootIsDocument).toBe(true);
  expect(state!.resolvesFromImageRoot).toBe(true);

  // Every key press calls injectFilters(); one defs container per tree is enough.
  for (let i = 0; i < 4; i++) {
    await page.keyboard.press("KeyF");
  }
  const defsCounts = await page.evaluate(() => ({
    document: document.querySelectorAll("svg#_scf_defs_").length,
    shadow: document.getElementById("_scf_root_")?.shadowRoot
      ?.querySelectorAll("svg#_scf_defs_").length ?? 0,
  }));
  expect(defsCounts).toEqual({ document: 1, shadow: 1 });
});

test("SVG filter defs live in the same tree as the comp images", async ({
  page,
}) => {
  await openViewer(page);

  // Cycle forward through every mode that uses an SVG `url(#…)` reference
  // (the off mode sets `filter: ""` and has no URL to verify). Pressing F
  // 5 times walks Off → Solar1 → Solar2 → Residual → Luma → Chroma.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("KeyF");
    const { filter, fragmentId } = await pollActiveFilterUrl(page);
    await expectFilterIdResolvesFromImageRoot(page, fragmentId);
    // Defensive: the filter string we matched against must be the one the
    // app actually set, not some stale value from a previous iteration.
    expect(filter).toContain(fragmentId);
  }
});

test("gamma mismatch filter defs live in the same tree as the comp images", async ({
  page,
}) => {
  await openViewer(page);

  // G cycles forward through the gamma presets (Off → first preset → …).
  // One press from the default Off state should land on a preset whose
  // filter URL ends up on the active column's image. syncAll() runs an
  // awaited chain inside the key handler, so poll for the URL to surface
  // instead of reading once and racing the microtask queue.
  await page.keyboard.press("KeyG");

  async function readGammaFragmentId(): Promise<string | null> {
    return await page.evaluate(() => {
      const shadow = (document.getElementById("_scf_root_") as HTMLElement | null)
        ?.shadowRoot;
      if (!shadow) return null;
      const img = shadow.querySelector("._scf_comp_img") as HTMLImageElement | null;
      if (!img) return null;
      const match = img.style.filter.match(/url\(['"]?#(scf-gamma-mismatch-[^'")]+)['"]?\)/);
      return match ? match[1] : null;
    });
  }

  await expect.poll(readGammaFragmentId, { timeout: 5000 }).not.toBeNull();
  const fragmentId = await readGammaFragmentId();
  expect(fragmentId).not.toBeNull();
  await expectFilterIdResolvesFromImageRoot(page, fragmentId!);
});

// ─── Settings-driven runtime behavior ──────────────────────────────────────
//
// These tests verify that user-configurable settings actually change runtime
// behavior. The fixture exposes saveConfig/openSettings on window.__yacomp
// so Playwright can mutate config without rendering the GM menu or driving
// the slider widget by hand (the slider's CSS-styled <input type="range">
// is awkward to grab via keyboard from a headless browser).

interface YacompTestHooks {
  saveConfig: (partial: Record<string, unknown>) => void;
  resetConfig: () => void;
  getConfig: () => { closeBtnPosition: "auto" | "left" | "right" | "hide" };
  openSettings: () => void;
}

async function setConfig(
  page: Page,
  partial: Record<string, unknown>,
): Promise<void> {
  await page.evaluate((p) => {
    (window as unknown as { __yacomp: YacompTestHooks }).__yacomp.saveConfig(p);
  }, partial);
}

async function readActiveBrightnessFilter(page: Page): Promise<string> {
  return await page.evaluate(() => {
    const shadow = (document.getElementById("_scf_root_") as HTMLElement | null)
      ?.shadowRoot;
    if (!shadow) return "";
    const img = shadow.querySelector("._scf_comp_img") as HTMLImageElement | null;
    return img?.style.filter ?? "";
  });
}

async function readFirstPageImageFilter(page: Page): Promise<string> {
  return await page.locator(".fixture-row img").first().evaluate(
    (img: HTMLImageElement) => img.style.filter,
  );
}

test("settings: disabled slow.pics prevents V shortcut and re-enabling restores it", async ({
  page,
}) => {
  await page.goto("/");
  await setConfig(page, { enabledSites: { slowpics: false } });

  await page.keyboard.press("KeyV");
  await expect(page.locator("._scf_comp")).toHaveCount(0);

  await setConfig(page, { enabledSites: { slowpics: true } });
  await page.keyboard.press("KeyV");
  await expect(page.locator("._scf_comp")).toBeVisible();
});

test("settings: disabled slow.pics prevents page-level F filters and re-enabling restores them", async ({
  page,
}) => {
  await page.goto("/");
  await setConfig(page, { enabledSites: { slowpics: false } });

  await page.keyboard.press("KeyF");
  await page.waitForTimeout(100);
  expect(await readFirstPageImageFilter(page)).toBe("");

  await setConfig(page, { enabledSites: { slowpics: true } });
  await page.keyboard.press("KeyF");
  await expect.poll(() => readFirstPageImageFilter(page), { timeout: 5000 })
    .toContain("url(");
});

test("settings: bcStep change propagates to bracket-key brightness adjustment", async ({
  page,
}) => {
  await openViewer(page);
  // Default bcStep is 0.05 → one `]` press moves brightness from 1.00 → 1.05.
  // Bump it to 0.20 first; one `]` should now jump to 1.20 instead.
  await setConfig(page, { bcStep: 0.20 });
  await page.keyboard.press("BracketRight");
  // The browser normalizes the CSS function value when re-reading
  // style.filter, so "brightness(1.20)" comes back as "brightness(1.2)".
  await expect.poll(() => readActiveBrightnessFilter(page), { timeout: 5000 })
    .toMatch(/brightness\(1\.2\b/);
});

test("settings: openSettings renders the modal in the shadow root with config controls", async ({
  page,
}) => {
  await openViewer(page);
  await page.evaluate(() => {
    (window as unknown as { __yacomp: YacompTestHooks }).__yacomp.openSettings();
  });

  // The overlay lives in the shadow root, so locator queries must pierce.
  // Playwright locators pierce open shadow roots automatically.
  await expect(page.locator("._scf_settings_overlay")).toBeVisible();
  await expect(page.locator("._scf_settings_title")).toHaveText("yacomp Settings");

  // Verify a representative slider (Brightness step) actually rendered.
  // We don't drive the slider here — the assertion above (`bcStep change
  // propagates`) covers the runtime effect through the saveConfig path,
  // which is what the slider invokes on input.
  const sliders = page.locator("._scf_settings_range");
  await expect.poll(() => sliders.count(), { timeout: 5000 }).toBeGreaterThanOrEqual(3);
});

test("settings: Reset Defaults immediately restores an open viewer close button position", async ({
  page,
}) => {
  await openViewer(page, { config: { closeBtnPosition: "auto" } });

  const closeButton = page.locator("._scf_close_btn");
  const autoSide = await closeButton.evaluate((button) => {
    if (button.classList.contains("_scf_left")) return "left";
    if (button.classList.contains("_scf_right")) return "right";
    throw new Error("close button has no resolved position");
  });
  const changedSide = autoSide === "left" ? "right" : "left";

  await page.evaluate(() => {
    (window as unknown as { __yacomp: YacompTestHooks }).__yacomp.openSettings();
  });
  const row = page.locator("._scf_settings_row", { hasText: "Close button" });

  await row.getByRole("button", {
    name: changedSide === "left" ? "Left" : "Right",
    exact: true,
  }).click();
  await expect(closeButton).toHaveClass(new RegExp(`\\b_scf_${changedSide}\\b`));

  await page.getByRole("button", { name: "Reset Defaults", exact: true }).click();
  const resetPosition = await page.evaluate(() =>
    (window as unknown as { __yacomp: YacompTestHooks }).__yacomp.getConfig().closeBtnPosition
  );
  expect(resetPosition).toBe("auto");
  await expect(row.getByRole("button", { name: "Auto", exact: true })).toHaveClass(/_scf_selected/);
  await expect(closeButton).toHaveClass(new RegExp(`\\b_scf_${autoSide}\\b`));
});

test("settings: hovering a help icon reveals its tooltip", async ({ page }) => {
  await openViewer(page);
  await page.evaluate(() => {
    (window as unknown as { __yacomp: YacompTestHooks }).__yacomp.openSettings();
  });
  await expect(page.locator("._scf_settings_overlay")).toBeVisible();

  // The Lazy load margin slider's row is the most informative tooltip in the
  // panel; find its (?) icon by walking from the label text. The label span
  // contains the row's help button as its only child element.
  const lazyRow = page.locator("._scf_settings_row").filter({
    has: page.locator("._scf_settings_label", { hasText: "Lazy load margin" }),
  });
  const helpIcon = lazyRow.locator("._scf_settings_help");
  await expect(helpIcon).toHaveCount(1);

  const tooltip = page.locator("._scf_settings_tooltip");
  // Tooltip element exists but is hidden until hover.
  await expect(tooltip).toBeHidden();

  await helpIcon.hover();
  await expect(tooltip).toBeVisible();
  await expect(tooltip).toContainText("CSS pixels");
});

test("settings: mouseSwitch=false suppresses pointer-driven column switching", async ({
  page,
}) => {
  // Fit mode keeps the row geometry as a clean horizontal split of three
  // columns; in 1:1 the row is wider than the viewport and the rightX
  // calculation no longer maps to col 2 reliably.
  await openViewer(page, { config: { defaultZoomMode: "fit" } });

  const label = page.locator("._scf_comp_label");
  const row = page.locator("._scf_comp_row").first();

  // Sanity baseline: with mouseSwitch enabled (the default), moving the
  // pointer over the right portion of the row should switch the active
  // source from col 0 → col 2 (3 visible columns, split into thirds).
  const rowBox = await row.boundingBox();
  if (!rowBox) throw new Error("row not laid out");
  const rightX = rowBox.x + (rowBox.width * 5) / 6;
  const midY = rowBox.y + rowBox.height / 2;
  await page.mouse.move(rightX, midY);
  await expect(label.locator("span", { hasText: "3." })).toHaveCSS("opacity", "1");

  // Move back to col 1, then disable mouseSwitch and try the same motion.
  await page.keyboard.press("1");
  await expect(label.locator("span", { hasText: "1." })).toHaveCSS("opacity", "1");

  await setConfig(page, { mouseSwitch: false });
  // Wiggle the pointer (browsers ignore mousemove with identical coords).
  await page.mouse.move(rowBox.x + rowBox.width / 6, midY);
  await page.mouse.move(rightX, midY);

  // Give any spurious switch a chance to fire; col 1 must still be active.
  await page.waitForTimeout(150);
  await expect(label.locator("span", { hasText: "1." })).toHaveCSS("opacity", "1");

  // Cleanup: restore default for any subsequent test that might share this page.
  await setConfig(page, { mouseSwitch: true });
});

// ── ① Auto-hide UI: the three chrome modes ────────────────────────────────────

const CHROME = {
  label: "._scf_comp_label",
  rowNav: "._scf_row_nav",
  close: "._scf_close_btn",
  toolbar: "._scf_toolbar",
  fill: "._scf_fill_canvas_toggle",
};

function chromeHasClass(page: Page, selector: string, cls: string): Promise<boolean> {
  return page.locator(selector).first().evaluate((el, c) => el.classList.contains(c), cls);
}

test("chrome 'always': titles, row nav and buttons all stay fully visible", async ({ page }) => {
  await openViewer(page, { config: { uiChromeMode: "always", uiHideDelay: 200 } });
  await page.waitForTimeout(300); // past any settle window
  for (const sel of [CHROME.label, CHROME.rowNav, CHROME.close, CHROME.toolbar]) {
    expect(await chromeHasClass(page, sel, "_scf_ui_autohidden")).toBe(false);
    expect(await chromeHasClass(page, sel, "_scf_ui_dimmed")).toBe(false);
  }
});

test("chrome 'default': titles/row nav sit dimmed, buttons auto-hide and reveal on movement", async ({ page }) => {
  await openViewer(page, { config: { uiChromeMode: "default", uiHideDelay: 200 } });
  // Resting state: nav dimmed (still visible), buttons auto-hidden.
  await expect.poll(() => chromeHasClass(page, CHROME.label, "_scf_ui_dimmed")).toBe(true);
  await expect.poll(() => chromeHasClass(page, CHROME.rowNav, "_scf_ui_dimmed")).toBe(true);
  await expect.poll(() => chromeHasClass(page, CHROME.close, "_scf_ui_autohidden")).toBe(true);
  // A mouse move brightens the label to full and brings the buttons back.
  const box = (await page.locator("._scf_comp").boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => chromeHasClass(page, CHROME.label, "_scf_ui_dimmed")).toBe(false);
  await expect.poll(() => chromeHasClass(page, CHROME.close, "_scf_ui_autohidden")).toBe(false);
});

test("chrome 'autohide': titles/row nav fully hidden, buttons gated by cursor proximity", async ({ page }) => {
  await openViewer(page, { config: { uiChromeMode: "autohide", uiHideDelay: 200 } });
  // Resting state: nav fully hidden, buttons hidden.
  await expect.poll(() => chromeHasClass(page, CHROME.label, "_scf_ui_autohidden")).toBe(true);
  await expect.poll(() => chromeHasClass(page, CHROME.rowNav, "_scf_ui_autohidden")).toBe(true);
  await expect.poll(() => chromeHasClass(page, CHROME.close, "_scf_ui_autohidden")).toBe(true);
  // A move far from the corners surfaces the label (titles) but NOT the buttons.
  const comp = (await page.locator("._scf_comp").boundingBox())!;
  await page.mouse.move(comp.x + comp.width / 2, comp.y + comp.height / 2);
  await expect.poll(() => chromeHasClass(page, CHROME.label, "_scf_ui_autohidden")).toBe(false);
  expect(await chromeHasClass(page, CHROME.close, "_scf_ui_autohidden")).toBe(true);
  // Moving NEAR the close button reveals it (proximity).
  const cb = (await page.locator(CHROME.close).boundingBox())!;
  await page.mouse.move(cb.x + cb.width / 2, cb.y + cb.height / 2);
  await expect.poll(() => chromeHasClass(page, CHROME.close, "_scf_ui_autohidden")).toBe(false);
});

test("the fit/fill button is hidden entirely at 1:1 and returns when fit", async ({ page }) => {
  await openViewer(page, { config: { uiChromeMode: "always" } });
  const forceHidden = () => chromeHasClass(page, CHROME.fill, "_scf_ui_force_hidden");
  await page.keyboard.press("Digit0"); // fit → the toggle is meaningful, shown
  await expect.poll(forceHidden).toBe(false);
  await page.keyboard.press("KeyO"); // 1:1 → hidden entirely
  await expect.poll(forceHidden).toBe(true);
  await page.keyboard.press("Digit0"); // fit → back
  await expect.poll(forceHidden).toBe(false);
});

test("R persistently force-hides the row nav on top of the chrome mode", async ({ page }) => {
  await openViewer(page, { config: { uiChromeMode: "always" } });
  await expect(page.locator(CHROME.rowNav)).toHaveCount(1);
  const forceHidden = () => chromeHasClass(page, CHROME.rowNav, "_scf_ui_force_hidden");
  expect(await forceHidden()).toBe(false);
  await page.keyboard.press("KeyR");
  await expect.poll(forceHidden).toBe(true);
  await page.keyboard.press("KeyR");
  await expect.poll(forceHidden).toBe(false);
});

test("shortcuts: double-click-to-close closes the viewer and hides the close button", async ({ page }) => {
  await openViewer(page, {
    config: {
      shortcuts: { "viewer.close": { main: { t: "key", code: "Escape" }, extra: { t: "mouse", g: "dblclick" } } },
    },
  });
  // Close is reachable by a canvas double-click → the button is redundant.
  await expect(page.locator("._scf_close_btn")).toBeHidden();
  const box = (await page.locator("._scf_comp").boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("._scf_comp")).not.toBeVisible();
});

test("shortcuts: single-click-to-close works and removes the close button", async ({ page }) => {
  await openViewer(page, {
    config: { shortcuts: { "viewer.close": { main: { t: "mouse", g: "click" }, extra: null } } },
  });
  await expect(page.locator("._scf_close_btn")).toBeHidden();
  const box = (await page.locator("._scf_comp").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("._scf_comp")).not.toBeVisible();
});

test("shortcuts: by default a canvas click does NOT close and the close button stays", async ({ page }) => {
  await openViewer(page);
  await expect(page.locator("._scf_close_btn")).toBeVisible();
  const box = (await page.locator("._scf_comp").boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForTimeout(120);
  await expect(page.locator("._scf_comp")).toBeVisible();
});

async function openSettingsModal(page: Page): Promise<void> {
  await page.evaluate(() => {
    (window as unknown as { __yacomp: YacompTestHooks }).__yacomp.openSettings();
  });
  await expect(page.locator("._scf_settings_overlay")).toBeVisible();
}

test("settings: rebinding 1:1 to a new key works end-to-end", async ({ page }) => {
  await openViewer(page, { config: { defaultZoomMode: "fit" } });
  const comp = page.locator("._scf_comp");
  await expect(comp).not.toHaveClass(/_scf_zoomed/);

  await openSettingsModal(page);
  const mainBtn = page
    .locator("._scf_shortcut_row", { hasText: "Actual size" })
    .locator("._scf_shortcut_btn").first();
  await expect(mainBtn).toHaveText("O");
  await mainBtn.click();
  await expect(mainBtn).toHaveText("Press a key…");
  await page.keyboard.press("KeyP");
  await expect(mainBtn).toHaveText("P");

  await page.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("._scf_settings_overlay")).toHaveCount(0);
  // P now triggers 1:1.
  await page.keyboard.press("KeyP");
  await expect(comp).toHaveClass(/_scf_zoomed/);
});

test("settings: a duplicate binding is rejected (hard-locked)", async ({ page }) => {
  await openViewer(page);
  await openSettingsModal(page);
  const zoomIn = page
    .locator("._scf_shortcut_row", { hasText: "Zoom in" })
    .locator("._scf_shortcut_btn").first();
  await expect(zoomIn).toHaveText("=");
  await zoomIn.click();
  await page.keyboard.press("KeyO"); // already bound to Actual size (1:1)
  await expect(zoomIn).toHaveText("="); // unchanged
});

test("settings: clearing an extra binding removes it", async ({ page }) => {
  await openViewer(page);
  await openSettingsModal(page);
  const row = page.locator("._scf_shortcut_row", { hasText: "Previous source" });
  const extra = row.locator("._scf_shortcut_btn").nth(1);
  await expect(extra).toHaveText("H");
  await row.locator("._scf_shortcut_clear").click();
  await expect(extra).toHaveText("—");
});

test("settings: binding close to a mouse gesture hides the close button live", async ({ page }) => {
  await openViewer(page);
  await expect(page.locator("._scf_close_btn")).toBeVisible();
  await openSettingsModal(page);
  const closeExtra = page
    .locator("._scf_shortcut_row", { hasText: "Close viewer" })
    .locator("._scf_shortcut_btn").nth(1);
  await closeExtra.click();
  await page.locator("._scf_shortcut_chip", { hasText: "2×" }).click();
  await expect(closeExtra).toHaveText("Double-click");
  await expect(page.locator("._scf_close_btn")).toBeHidden();
});

test("settings: Reset shortcuts restores defaults", async ({ page }) => {
  await openViewer(page);
  await openSettingsModal(page);
  const mainBtn = page
    .locator("._scf_shortcut_row", { hasText: "Actual size" })
    .locator("._scf_shortcut_btn").first();
  await mainBtn.click();
  await page.keyboard.press("KeyP");
  await expect(mainBtn).toHaveText("P");
  await page.getByRole("button", { name: "Reset shortcuts", exact: true }).click();
  await expect(mainBtn).toHaveText("O");
});

test.describe("1:1 on a HiDPI (2x) display", () => {
  test.use({ deviceScaleFactor: 2 });

  test("device mode (default) maps source pixels to physical pixels — halves the CSS width", async ({ page }) => {
    await openViewer(page); // default oneToOnePixels = "device"
    await expect(page.locator("._scf_comp")).toHaveClass(/_scf_zoomed/);
    // Active column is the 1920px-wide source → at 1:1 device on DPR 2, 960 CSS px
    // (= 1920 physical px), so it isn't drawn 2x oversized.
    const row = page.locator("._scf_comp_row").first();
    await expect.poll(() => row.evaluate((el) => (el as HTMLElement).style.width)).toBe("960px");
  });

  test("logical mode keeps the full source width (the old 2x-magnified behavior)", async ({ page }) => {
    await openViewer(page, { config: { oneToOnePixels: "logical" } });
    const row = page.locator("._scf_comp_row").first();
    await expect.poll(() => row.evaluate((el) => (el as HTMLElement).style.width)).toBe("1920px");
  });

  test("device mode 1:1 toast distinguishes native vs on-screen width", async ({ page }) => {
    await openViewer(page); // 1:1, device, DPR 2
    const row = page.locator("._scf_comp_row").first();
    await expect.poll(() => row.evaluate((el) => (el as HTMLElement).style.width)).toBe("960px");
    await page.keyboard.press("KeyO"); // re-trigger 1:1 so the toast shows (open is silent)
    const toast = page.locator("#_scf_toast_");
    await expect(toast).toContainText("Original 1920px");
    await expect(toast).toContainText("On screen 960px@2x");
  });

  test("+ from 1:1 never collapses to 0px (zoomWidth was unset)", async ({ page }) => {
    await openViewer(page); // opens at 1:1, device mode
    const row = page.locator("._scf_comp_row").first();
    await page.keyboard.press("Equal"); // first action is a zoom-in
    await expect
      .poll(() => row.evaluate((el) => parseFloat((el as HTMLElement).style.width) || 0))
      .toBeGreaterThan(100);
  });

  test("device native/on-screen info also shows when zooming with +/- (custom mode)", async ({ page }) => {
    await openViewer(page);
    const row = page.locator("._scf_comp_row").first();
    await expect.poll(() => row.evaluate((el) => (el as HTMLElement).style.width)).toBe("960px");
    await page.keyboard.press("Equal"); // + → custom 960 × 1.25 = 1200 CSS px
    const toast = page.locator("#_scf_toast_");
    await expect(toast).toContainText("Original 1920px");
    await expect(toast).toContainText("On screen 1200px@2x");
  });
});

test("zoom: + scales mixed-resolution rows proportionally, not to one width", async ({ page }) => {
  // Row 0 is a 1920px-wide source, row 1 a 1480px pillar source. Background-load
  // so both measure; default DPR is 1 so device == logical width.
  await openViewer(page, { config: { bgLoadDefault: true } });
  const row0 = page.locator("._scf_comp_row").nth(0);
  const row1 = page.locator("._scf_comp_row").nth(1);
  await expect.poll(() => row0.evaluate((el) => (el as HTMLElement).style.width)).toBe("1920px");
  await expect.poll(() => row1.evaluate((el) => (el as HTMLElement).style.width)).toBe("1480px");

  await page.keyboard.press("Equal"); // +25% — each row scales from its OWN native
  await expect.poll(() => row0.evaluate((el) => (el as HTMLElement).style.width)).toBe("2400px");
  await expect.poll(() => row1.evaluate((el) => (el as HTMLElement).style.width)).toBe("1850px");
});

test("viewer opens horizontally centered on a 1:1 image wider than the viewport", async ({ page }) => {
  // Default zoom is 1:1; the fixture's first row is 1920px wide in Playwright's
  // 1280px viewport, so it must open centered (scrollLeft ≈ half the overflow),
  // not pinned to the left edge.
  await openViewer(page);
  const comp = page.locator("._scf_comp");
  await expect(comp).toHaveClass(/_scf_zoomed/);
  await expect
    .poll(() =>
      comp.evaluate((el) => {
        const centered = (el.scrollWidth - el.clientWidth) / 2;
        return el.scrollWidth > el.clientWidth + 8 && Math.abs(el.scrollLeft - centered) < 8;
      }),
    )
    .toBe(true);
});

test("settings: Export downloads the config as JSON", async ({ page }) => {
  await openViewer(page, { config: { toastDuration: 3200 } });
  await openSettingsModal(page);
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Export", exact: true }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("yacomp-config.json");
  const content = readFileSync(await download.path(), "utf8");
  expect(JSON.parse(content).toastDuration).toBe(3200);
});

test("settings: Import restores settings from a file", async ({ page }) => {
  await openViewer(page);
  await openSettingsModal(page);
  const cfg = JSON.stringify({ v: 2, toastDuration: 4800, closeBtnPosition: "left" });
  await page.locator("._scf_settings_backup input[type=file]").setInputFiles({
    name: "yacomp-config.json",
    mimeType: "application/json",
    buffer: Buffer.from(cfg),
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as unknown as { __yacomp: { getConfig: () => { toastDuration: number } } })
            .__yacomp.getConfig().toastDuration,
      ),
    )
    .toBe(4800);
});

test("settings: PTP custom-label inputs appear only under the Custom button style", async ({ page }) => {
  await openViewer(page);
  await page.evaluate(() => {
    (window as unknown as { __yacomp: YacompTestHooks }).__yacomp.openSettings();
  });
  await expect(page.locator("._scf_settings_overlay")).toBeVisible();

  const customRow = page.locator("._scf_settings_row", { hasText: "Custom (closed)" });
  const styleRow = page.locator("._scf_settings_row", { hasText: "PTP grid button" });

  // Hidden under the default (grid glyph) style.
  await expect(customRow).toBeHidden();
  // Choosing Custom reveals the free-text inputs...
  await styleRow.getByRole("button", { name: "Custom", exact: true }).click();
  await expect(customRow).toBeVisible();
  // ...and switching back to a preset hides them again.
  await styleRow.getByRole("button", { name: "Text", exact: true }).click();
  await expect(customRow).toBeHidden();
});
