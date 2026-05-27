import { test, expect, type Page } from "@playwright/test";

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

async function openViewer(page: Page): Promise<void> {
  await page.goto("/");
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
  await openViewer(page);

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
  await openViewer(page);

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

  await expectRowCanvasAspectRatio(page, 0, "1920 / 1080", 1920 / 1080);

  await page.keyboard.press("ArrowDown");
  await expect(page.locator("._scf_row_nav_item._scf_active")).toContainText("2");
  await expectRowCanvasAspectRatio(page, 1, "1920 / 1080", 1920 / 1080);
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

test("chroma's background queue fills the anchor row's eagerly-loaded sources", async ({
  page,
}) => {
  await openViewer(page);
  await installFilterMutationLogger(page, "chroma");
  await page.keyboard.press("Shift+KeyF");

  // Liveness: the queue must run past the anchor and reach the other
  // eligible cell of the anchor row. Only cols 0 and 1 are eligible at
  // open — row.ts eagerly loads `img.src` for ci<=1 and defers col 2 to
  // `img.dataset.src` until the user activates it. The filter pipeline
  // skips cells with no `src`, so col 2 is intentionally absent from the
  // chroma log until B8 (column switch) brings it in.
  await expect
    .poll(
      async () => {
        const log = await readFilterLog(page);
        const cols = new Set(log.filter((e) => e.rowIdx === 0).map((e) => e.colIdx));
        return Array.from(cols).sort();
      },
      { timeout: 5000 },
    )
    .toEqual([0, 1]);
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
