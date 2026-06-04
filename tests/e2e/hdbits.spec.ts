import { test, expect, type Page } from "@playwright/test";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─── HDBits parser regression suite ──────────────────────────────────────────
//
// One Playwright test per `tests/fixtures/hdbits/cases/*.html` file. The
// runner reads each case's metadata header, asks the fixture server to
// render it inside the right page template, lets the userscript run,
// and asserts the resulting "Show comparison" link count (and source
// names, when expected_names is set).
//
// Adding a case is HTML-only — drop a file in cases/ with a header and
// the test for it appears automatically. See tests/fixtures/hdbits/README.md
// for the case file format and extraction instructions.

const CASES_DIR = "tests/fixtures/hdbits/cases";
const SAVED_HDBITS_FORUM_HTML = process.env.YACOMP_SAVED_HDBITS_FORUM_HTML;

interface CaseMetadata {
  slot: "torrent.description" | "torrent.comment" | "forum.post" | "forum.reply";
  expectedGrids: number;
  expectedNames?: (string[] | null)[] | null;
  threadTitle?: string;
  torrentTitle?: string;
  notes?: string;
}

function parseCaseMetadata(content: string, file: string): CaseMetadata {
  const match = content.match(/^<!--([\s\S]*?)-->/);
  if (!match) throw new Error(`${file}: missing metadata header comment`);
  const meta: Record<string, unknown> = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key === "slot") meta.slot = value;
    else if (key === "expected_grids") meta.expectedGrids = parseInt(value, 10);
    else if (key === "expected_names") meta.expectedNames = JSON.parse(value);
    else if (key === "torrent_title") meta.torrentTitle = value.replace(/^"|"$/g, "");
    else if (key === "thread_title") meta.threadTitle = value.replace(/^"|"$/g, "");
    else if (key === "notes") meta.notes = value;
  }
  if (typeof meta.slot !== "string") throw new Error(`${file}: metadata missing 'slot'`);
  if (typeof meta.expectedGrids !== "number") {
    throw new Error(`${file}: metadata missing 'expected_grids'`);
  }
  return meta as unknown as CaseMetadata;
}

function readCases(): { file: string; meta: CaseMetadata }[] {
  if (!existsSync(CASES_DIR)) return [];
  const files = readdirSync(CASES_DIR)
    .filter((f) => f.endsWith(".html") && !f.startsWith("_"))
    .sort();
  return files.map((file) => {
    const content = readFileSync(join(CASES_DIR, file), "utf-8");
    return { file, meta: parseCaseMetadata(content, file) };
  });
}

const STUB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">' +
  '<rect width="160" height="90" fill="#3a3a3a"/></svg>';

async function stubHdbitsImages(page: Page): Promise<void> {
  // No real network. Every t.hdbits.org / i.hdbits.org URL returns a
  // 160x90 grey SVG so the viewer can render without external traffic.
  await page.route(/[ti]\.hdbits\.org/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
}

async function waitForHdbitsReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
}

async function readGridNames(page: Page, linkIndex: number): Promise<string[]> {
  // Click the Nth comparison link, read source names off the viewer's
  // label, then close the viewer so the next assertion starts clean.
  const link = page.locator("._scf_comp_link").nth(linkIndex);
  await link.scrollIntoViewIfNeeded();
  await link.click();

  const comp = page.locator("._scf_comp");
  await expect(comp).toBeVisible();

  // The label is created empty and stays empty until switchColumn fires
  // (comparison.ts line 346 only calls switchColumn when initialPosition.col
  // != 0, and the default is 0). Press "1" to switch to the first source,
  // which always fires switchColumn and populates the label spans.
  await page.keyboard.press("Digit1");
  const spans = page.locator("._scf_comp_label span");
  await expect(spans.first()).toBeVisible();
  const raw = await spans.allTextContents();
  const names = raw
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);

  await page.keyboard.press("Escape");
  await expect(comp).not.toBeVisible();
  return names;
}

async function dragAcrossScreenshots(page: Page, selector: string, count: number): Promise<void> {
  const boxes = [];
  for (let i = 0; i < count; i++) {
    const box = await page.locator(selector).nth(i).boundingBox();
    if (!box) throw new Error(`screenshot ${i} has no bounding box`);
    boxes.push(box);
  }
  await page.mouse.move(boxes[0].x + boxes[0].width / 2, boxes[0].y + boxes[0].height / 2);
  await page.mouse.down();
  for (const box of boxes.slice(1)) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 4 });
  }
  await page.mouse.up();
}

const cases = readCases();

if (cases.length === 0) {
  test("hdbits case suite is non-empty", () => {
    throw new Error(
      `No case files found in ${CASES_DIR}. See tests/fixtures/hdbits/README.md for how to add one.`,
    );
  });
}

test("hdbits: host trigger link inherits page color and opens the viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/001-torrent-desc-simple-grid");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );

  const link = page.locator("._scf_comp_link").first();
  await expect(link).toHaveCount(1);
  expect(await link.evaluate((element) => element.getRootNode() === document)).toBe(true);
  expect(
    await page.evaluate(() => {
      const shadow = document.getElementById("_scf_root_")?.shadowRoot;
      return {
        hostTriggerCss: Boolean(document.getElementById("_scf_comp_link_css_")),
        hostViewerCss: Boolean(document.getElementById("_scf_css_")),
        shadowViewerCss: Boolean(shadow?.getElementById("_scf_css_")),
      };
    }),
  ).toEqual({
    hostTriggerCss: true,
    hostViewerCss: false,
    shadowViewerCss: true,
  });
  await link.evaluate((element) => {
    const parent = element.parentElement;
    if (!parent) throw new Error("HDBits trigger link has no host parent");
    parent.style.color = "rgb(19, 37, 73)";
  });
  await expect(link).toHaveCSS("color", "rgb(19, 37, 73)");

  await link.click();
  await expect(page.locator("._scf_comp")).toBeVisible();
});

test("hdbits: indivisible comparison-thread OP opens the drop-the-odd-shot picker, then builds a clean comparison (80402)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/113-iconic-80402");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  // 37 shots, 2-wide AUS/GBR (from the H1) — indivisible, so the link opens the
  // thumbnail picker (not the comparison) with all 37 shots and a disabled Build.
  await expect(page.locator("._scf_comp_link")).toHaveCount(1);
  await page.locator("._scf_comp_link").first().click();
  const overlay = page.locator("._scf_orphan_select");
  await expect(overlay).toBeVisible();
  await expect(overlay.locator("._scf_os_thumb")).toHaveCount(37);
  await expect(overlay.locator("._scf_os_build")).toBeDisabled();
  // Drop one odd shot → 36 divides by 2 → Build enables; Enter builds the grid.
  await overlay.locator("._scf_os_thumb").last().click();
  await expect(overlay.locator("._scf_os_thumb._scf_os_excluded")).toHaveCount(1);
  await expect(overlay.locator("._scf_os_build")).toBeEnabled();
  await page.keyboard.press("Enter");
  await expect(page.locator("._scf_orphan_select")).toHaveCount(0);
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(18); // 36 shots / 2 cols
});

test("hdbits: ambiguous torrent gallery falls back to a 1-wide 'Show viewer', not bogus columns (Holubice 838405)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/114-iconic-holubice-gallery");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  // The 10 sample shots used to be invented into a 5-column comparison. Now:
  // one "Show viewer" link (not "Show comparison"), opening a 1-wide gallery.
  const link = page.locator("._scf_comp_link");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText("Show viewer");
  await link.first().click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(10); // 1 column → 10 rows
});

test("hdbits: sibling heading sections place triggers under matching titles", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/115-torrent-desc-sibling-heading-sections");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );

  await expect(page.locator("._scf_comp_link")).toHaveCount(2);
  const placement = await page.evaluate(() =>
    [...document.querySelectorAll<HTMLAnchorElement>("._scf_comp_link")].map((link) => {
      const parent = link.parentElement;
      const title = parent
        ?.querySelector("strong")
        ?.textContent
        ?.replace(/\s+/g, " ")
        .trim() ?? null;
      return {
        title,
        linksInTitleBlock: parent?.querySelectorAll("._scf_comp_link").length ?? 0,
      };
    }),
  );

  expect(placement).toEqual([
    {
      title: "Source vs Filtered(Deband and Deblock) vs Encode",
      linksInTitleBlock: 1,
    },
    {
      title: "Source vs Encode vs CtrlHD(USA) vs SKALiWAGZ(USA)",
      linksInTitleBlock: 1,
    },
  ]);
});

test("hdbits: 1:1 renders each column at its own native width and re-fits on a deliberate (keyboard) switch", async ({ page }) => {
  // Size-varying stub: column-A images are 200px wide, column-B 400px.
  await page.route(/[ti]\.hdbits\.org/, (route) => {
    const w = /cB/.test(route.request().url()) ? 400 : 200;
    void route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="100"><rect width="${w}" height="100" fill="#333"/></svg>`,
    });
  });
  await page.goto("/hdbits/case/116-zoom-mixed-dims");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  await page.locator("._scf_comp_link").first().click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  const rowWidth = () =>
    page.locator("._scf_comp_row").first().evaluate((el) => (el as HTMLElement).style.width);
  // Enter 1:1 — column 0 (A) active → its 200px native width, not a global lock.
  await page.keyboard.press("KeyO");
  await expect.poll(rowWidth).toBe("200px");
  // Switch to column 1 (B) → re-fits to 400px (each column its own resolution).
  await page.keyboard.press("ArrowRight");
  await expect.poll(rowWidth).toBe("400px");
  // Back to A → 200px again.
  await page.keyboard.press("ArrowLeft");
  await expect.poll(rowWidth).toBe("200px");
});

test("hdbits: a mouse-sweep across columns does NOT resize 1:1 (re-fit is deliberate-only)", async ({ page }) => {
  await page.route(/[ti]\.hdbits\.org/, (route) => {
    const w = /cB/.test(route.request().url()) ? 400 : 200;
    void route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="100"><rect width="${w}" height="100" fill="#333"/></svg>`,
    });
  });
  await page.goto("/hdbits/case/116-zoom-mixed-dims");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  await page.locator("._scf_comp_link").first().click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  const row = page.locator("._scf_comp_row").first();
  const width = () => row.evaluate((el) => (el as HTMLElement).style.width);
  await page.keyboard.press("KeyO");
  await expect.poll(width).toBe("200px"); // column A native
  // Sweep the pointer into column 1's region (right half of the centered row) —
  // mouseSwitch toggles the visible column but must NOT re-fit (stable scale).
  const box = await row.boundingBox();
  await page.mouse.move(box!.x + box!.width - 8, box!.y + box!.height / 2);
  await expect.poll(() => row.evaluate((el) => (el as HTMLElement).dataset.col)).toBe("1");
  expect(await width()).toBe("200px"); // still column A's width — no resize on sweep
});

test("hdbits: 1:1 sizes each ROW to its own native width (mixed-resolution rows are not squashed)", async ({ page }) => {
  // The real 057 bug: a comparison mixes a narrow bitrate-chart row with wide
  // screenshot rows. Stub sizes by ROW — r0* (row 0) 200px, r1* (row 1) 400px —
  // uniform within each row's columns. A single global 1:1 width squashed the
  // wide row to the narrow row's width; per-row sizing must keep each native.
  await page.route(/[ti]\.hdbits\.org/, (route) => {
    const w = /r1/.test(route.request().url()) ? 400 : 200;
    void route.fulfill({
      contentType: "image/svg+xml",
      body: `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="100"><rect width="${w}" height="100" fill="#333"/></svg>`,
    });
  });
  await page.goto("/hdbits/case/117-zoom-mixed-row-dims");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  await page.locator("._scf_comp_link").first().click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  const rows = page.locator("._scf_comp_row");
  const rowWidth = (i: number) => rows.nth(i).evaluate((el) => (el as HTMLElement).style.width);
  await page.keyboard.press("KeyO");
  // Each row at its OWN native width — the wide row keeps 400px instead of being
  // squashed to the narrow row's 200px (or vice-versa).
  await expect.poll(() => rowWidth(0)).toBe("200px");
  await expect.poll(() => rowWidth(1)).toBe("400px");
});

// ── Click a comparison image → viewer (hdbitsImageClick) ───────────────────────

test("hdbits: clicking a comparison image opens the viewer at that shot", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/116-zoom-mixed-dims");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  // cB0 = row 0, column 1 ("Encode") — default config opens the viewer there.
  await page.locator('img[src*="cB0"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  const label = page.locator("._scf_comp_label");
  await expect(label.locator("span", { hasText: "Encode" })).toHaveCSS("opacity", "1");
});

test("hdbits: with Native set, an image click stays HDBits' own (no viewer)", async ({ page }) => {
  await page.route(/[ti]\.hdbits\.org|img\.hdbits\.org/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
  await page.goto("/hdbits/case/116-zoom-mixed-dims");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  await page.evaluate(() => {
    (window as unknown as { __yacomp: { saveConfig: (c: Record<string, unknown>) => void } })
      .__yacomp.saveConfig({ hdbitsImageClick: "native" });
  });
  // Native behavior: the anchor navigates to the full image; no viewer opens.
  await Promise.all([
    page.waitForURL(/img\.hdbits\.org/),
    page.locator('img[src*="cB0"]').click(),
  ]);
  await expect(page.locator("._scf_comp")).toHaveCount(0);
});

test("hdbits: clicking an image in a slow.pics-rescued comparison opens the viewer at that shot", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/087-forum-post-slowpics-rescue-dirty-line-fix");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  // First rescued comparison is 3 cols (S/F/E heading "…, Geek, …"); g02 is the
  // 2nd image → row 0, column 1 ("Geek"). Rescue grids aren't in getGrids, so
  // this exercises the slow.pics-fetch image-click path.
  await page.locator('img[src*="/g02.jpg"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  const label = page.locator("._scf_comp_label");
  await expect(label.locator("span", { hasText: "Geek" }).first()).toHaveCSS("opacity", "1");
});

test("hdbits: closing the viewer restores the page scroll position", async ({ page }) => {
  // Tall images so the post is scrollable and hiding it collapses the page —
  // which is what clamps the scroll on open and stranded it before the fix.
  await page.route(/[ti]\.hdbits\.org/, (route) =>
    route.fulfill({
      contentType: "image/svg+xml",
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="900"><rect width="160" height="900" fill="#333"/></svg>',
    }),
  );
  await page.goto("/hdbits/case/087-forum-post-slowpics-rescue-dirty-line-fix");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  // A lower "Show comparison" link, scrolled into view so the click doesn't move
  // the page itself.
  const link = page.locator("._scf_comp_link").last();
  await link.scrollIntoViewIfNeeded();
  const before = await page.evaluate(() => window.scrollY);
  expect(before).toBeGreaterThan(0);

  await link.click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("._scf_comp")).not.toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(before);
});

test("hdbits: forum manual custom comparison builds a Source N grid from selected screenshots", async ({ page }) => {
  await stubHdbitsImages(page);
  const requested = new Set<string>();
  page.on("request", (request) => {
    const url = request.url();
    if (/manual0[1-4]|img\.hdbits\.org|i\.hdbits\.org/.test(url)) requested.add(url);
  });
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("h1 + ._scf_manual_panel");
  await expect(panel).toHaveCount(1);
  await panel.locator("._scf_manual_button").click();

  // One click selects the whole contiguous gallery (4 images), and the column
  // count auto-fills from the gallery's row width (2-wide) — no manual entry.
  const screenshots = page.locator('img[src*="t.hdbits.org/manual"]');
  await screenshots.nth(0).click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(4);
  await expect(panel.locator("._scf_manual_status")).toHaveText("4 selected");
  await expect(panel.locator("._scf_manual_cols")).toHaveValue("2");

  await panel.locator("._scf_manual_build").click();

  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
  await expect.poll(() => [...requested].some((url) => url.includes("https://i.hdbits.org/manual01.png"))).toBe(true);
  expect([...requested].some((url) => url.includes("https://img.hdbits.org/manual01"))).toBe(false);
  await page.keyboard.press("Digit1");
  const names = (await page.locator("._scf_comp_label span").allTextContents())
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["Source 1", "Source 2"]);
});

test("hdbits: forum manual custom comparison clear resets selected screenshots", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  const screenshots = page.locator('img[src*="t.hdbits.org/manual"]');
  // One click grabs the whole 4-image gallery.
  await screenshots.nth(0).click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(4);

  await panel.locator("._scf_manual_clear").click();

  await expect(page.locator("._scf_manual_selected")).toHaveCount(0);
  await expect(panel.locator("._scf_manual_status")).toHaveText("0 selected");
});

test("hdbits: forum manual custom comparison supports drag selection across screenshots", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  await dragAcrossScreenshots(page, 'td.comment img[src*="t.hdbits.org/manual"]', 4);

  await expect(page.locator("._scf_manual_selected")).toHaveCount(4);
  await expect(panel.locator("._scf_manual_status")).toHaveText("4 selected");
});

test("hdbits: forum manual — one click selects a whole gallery, leaving other groups untouched", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/155-forum-post-grouped-manual-selection");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();

  // Group A is a 2-image gallery; one click grabs both and nothing from group B.
  await page.locator('img[src*="grpA1"]').click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(2);
  await expect(page.locator('img[src*="grpB1"]')).not.toHaveClass(/_scf_manual_selected/);
  // Column count auto-detected from the gallery's row width (2-wide).
  await expect(panel.locator("._scf_manual_cols")).toHaveValue("2");
});

test("hdbits: forum manual — Shift-click extends the selection as a range across groups", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/155-forum-post-grouped-manual-selection");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();

  await page.locator('img[src*="grpA1"]').click(); // anchor + group A (2)
  await page.locator('img[src*="grpB2"]').click({ modifiers: ["Shift"] });
  // Range from the first image to the last spans both galleries: all 4 selected.
  await expect(page.locator("._scf_manual_selected")).toHaveCount(4);
});

test("hdbits: forum manual — Ctrl/Cmd-click toggles a single image (add or deselect)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/155-forum-post-grouped-manual-selection");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();

  await page.locator('img[src*="grpA1"]').click(); // group A (2)
  await expect(page.locator("._scf_manual_selected")).toHaveCount(2);
  // Toggle off one already-selected image.
  await page.locator('img[src*="grpA2"]').click({ modifiers: ["Meta"] });
  await expect(page.locator("._scf_manual_selected")).toHaveCount(1);
  // Toggle on a single image from another group.
  await page.locator('img[src*="grpB1"]').click({ modifiers: ["Meta"] });
  await expect(page.locator("._scf_manual_selected")).toHaveCount(2);
});

test("hdbits: forum manual — clicking a label fills the column names and count", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/155-forum-post-grouped-manual-selection");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();

  // Clicking the "Source vs Encode" label extracts the names and sets the count.
  await page.locator(".cmp-label").click();
  await expect(panel.locator("._scf_manual_names")).toHaveValue("Source | Encode");
  await expect(panel.locator("._scf_manual_cols")).toHaveValue("2");

  // Apply those names to a manual 2-wide selection (group A).
  await page.locator('img[src*="grpA1"]').click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(2);
  await panel.locator("._scf_manual_build").click();

  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Digit1");
  const names = (await page.locator("._scf_comp_label span").allTextContents())
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["Source", "Encode"]);
});

test("hdbits: forum manual — the toolbar floats while selecting", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/155-forum-post-grouped-manual-selection");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await expect(panel).not.toHaveClass(/_scf_manual_floating/);
  await panel.locator("._scf_manual_button").click();
  await expect(panel).toHaveClass(/_scf_manual_floating/);
  expect(await panel.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
  // Leaving selecting mode returns the panel inline.
  await panel.locator("._scf_manual_clear").click();
  await expect(panel).not.toHaveClass(/_scf_manual_floating/);
});

test("hdbits: forum manual — selecting label text sets the title and marks it", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/155-forum-post-grouped-manual-selection");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();

  // Highlight the label text, then release the mouse → the selection is the title.
  await page.locator(".cmp-label").selectText();
  await page.evaluate(() => document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true })));

  await expect(panel.locator("._scf_manual_names")).toHaveValue("Source | Encode");
  await expect(panel.locator("._scf_manual_cols")).toHaveValue("2");
  // The chosen text stays marked via the Custom Highlight API.
  expect(
    await page.evaluate(() => {
      const reg = (window as unknown as { CSS?: { highlights?: { has(k: string): boolean } } }).CSS?.highlights;
      return reg ? reg.has("_scf_manual_title") : null;
    }),
  ).toBe(true);
});

test("hdbits: saved Over the Garden Wall forum page uses the current manual fallback", async ({ page }) => {
  test.skip(!SAVED_HDBITS_FORUM_HTML, "Set YACOMP_SAVED_HDBITS_FORUM_HTML to a saved HDBits forum HTML file");

  await page.goto("/hdbits/saved/forum");
  await waitForHdbitsReady(page);

  await expect(page).toHaveTitle(/\[Comparisons\] Over the Garden Wall :: HDBits/);
  const panel = page.locator("h1 + ._scf_manual_panel");
  await expect(panel).toHaveCount(1);
  await expect(page.locator("td.comment a[href*='img.hdbits.org'] img")).toHaveCount(56);

  await panel.locator("._scf_manual_button").click();
  await dragAcrossScreenshots(page, "td.comment a[href*='img.hdbits.org'] img", 6);
  await expect(page.locator("._scf_manual_selected")).toHaveCount(6);

  await panel.locator("._scf_manual_cols").fill("6");
  await panel.locator("._scf_manual_build").click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Digit1");
  const names = (await page.locator("._scf_comp_label span").allTextContents())
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["Source 1", "Source 2", "Source 3", "Source 4", "Source 5", "Source 6"]);
});

for (const { file, meta } of cases) {
  test(`hdbits: ${file}`, async ({ page }) => {
    await stubHdbitsImages(page);

    const slug = file.replace(/\.html$/, "");
    await page.goto(`/hdbits/case/${slug}`);

    // Wait until the test-entry has finished running setupHDBitsCore.
    // After this signal, the comp links (if any) are in the DOM, so
    // assertions against the count don't race the script.
    await page.waitForFunction(
      () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
      undefined,
      { timeout: 5000 },
    );

    const links = page.locator("._scf_comp_link");
    await expect(links).toHaveCount(meta.expectedGrids);

    if (meta.expectedNames && meta.expectedGrids > 0) {
      for (let i = 0; i < meta.expectedNames.length; i++) {
        const expected = meta.expectedNames[i];
        if (expected === null) continue;
        const actual = await readGridNames(page, i);
        expect(actual, `grid ${i} names in ${file}`).toEqual(expected);
      }
    }
  });
}
