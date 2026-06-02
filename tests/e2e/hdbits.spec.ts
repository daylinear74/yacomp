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

test("hdbits: forum manual custom comparison builds a Source N grid from selected screenshots", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("h1 + ._scf_manual_panel");
  await expect(panel).toHaveCount(1);
  await panel.locator("._scf_manual_button").click();

  const screenshots = page.locator('img[src*="t.hdbits.org/manual"]');
  await screenshots.nth(0).click();
  await screenshots.nth(1).click();
  await screenshots.nth(2).click();
  await screenshots.nth(3).click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(4);
  await expect(panel.locator("._scf_manual_status")).toHaveText("4 selected");

  await panel.locator("._scf_manual_cols").fill("2");
  await panel.locator("._scf_manual_build").click();

  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
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
  await screenshots.nth(0).click();
  await screenshots.nth(1).click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(2);

  await panel.locator("._scf_manual_clear").click();

  await expect(page.locator("._scf_manual_selected")).toHaveCount(0);
  await expect(panel.locator("._scf_manual_status")).toHaveText("0 selected");
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
