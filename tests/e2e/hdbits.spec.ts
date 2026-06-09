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

function caseBody(file: string): string {
  return readFileSync(join(CASES_DIR, file), "utf-8").replace(/^<!--[\s\S]*?-->/, "").trim();
}

function renderTorrentWithComment(description: string, comment: string): string {
  const template = readFileSync("tests/fixtures/hdbits/templates/torrent.html", "utf-8");
  const commentRow = `
    <tr><td>
      <p class="sub"><a href="#" name="comm1">#1</a> by <i>Anonymous</i></p>
      <table class="main" width="100%" border="1" cellspacing="0" cellpadding="5">
        <tbody><tr valign="top">
          <td align="center" width="150"><div class="default_avatar"></div></td>
          <td class="text">${comment}</td>
        </tr></tbody>
      </table>
    </td></tr>
  `;

  return template
    .replace(/\{\{TORRENT_TITLE\}\}/g, "Mixed Torrent 2026 720p BluRay x264-Demo")
    .replace(/\{\{DESCRIPTION\}\}/g, description)
    .replace(/\{\{COMMENTS\}\}/g, commentRow)
    .replace("</body>", '<script type="module" src="/hdbits-test-entry.js"></script></body>');
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

function comparisonLinks(page: Page) {
  return page.locator("._scf_comp_link").filter({ hasText: /^Show comparison$/ });
}

function viewerLinks(page: Page) {
  return page.locator("._scf_comp_link").filter({ hasText: /^Show Viewer/ });
}

async function readGridNames(page: Page, linkIndex: number): Promise<string[]> {
  // Click the Nth comparison link, read source names off the viewer's
  // label, then close the viewer so the next assertion starts clean.
  const link = comparisonLinks(page).nth(linkIndex);
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
  await expect(link).toHaveText("Show comparison");
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

test("hdbits: ambiguous torrent gallery gets Show Viewer and opens as 1-wide from image click (Holubice 838405)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/114-iconic-holubice-gallery");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  // The 10 sample shots used to be invented into a 5-column comparison. Now
  // they get a viewer control, and clicking any shot opens a 1-wide gallery.
  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g01"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(10); // 1 column → 10 rows
});

test("hdbits: plain torrent Screens blocks get Show Viewer and open as a 1-wide viewer from image click", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/152-torrent-desc-release-screens-not-comparison");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await expect(page.locator("._scf_column_control")).toHaveText("Show Viewer");
  await expect(page.locator('input[placeholder="cols"]')).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const control = document.querySelector("._scf_column_control");
        const firstImage = document.querySelector('img[src*="g152a"]');
        if (!control || !firstImage) return null;
        const range = document.createRange();
        range.setStartAfter(control);
        range.setEndBefore(firstImage.closest("a") ?? firstImage);
        return range.toString().trim();
      }),
    )
    .toBe("");
  await page.locator('img[src*="g152a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
});

test("hdbits: JPG-only HDBits originals fall back after the PNG full URL fails", async ({ page }) => {
  const fullRequests: string[] = [];
  const jpgOnlySvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="350" height="446">' +
    '<rect width="350" height="446" fill="#444"/></svg>';

  await page.route(/\/\/t\.hdbits\.org\//, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
  await page.route(/\/\/i\.hdbits\.org\//, (route) => {
    const url = route.request().url();
    fullRequests.push(url);
    if (/\/jpgonly\.png(?:[?#]|$)/.test(url)) {
      return route.fulfill({ status: 404, contentType: "text/plain", body: "missing png" });
    }
    return route.fulfill({
      contentType: "image/svg+xml",
      body: /\/jpgonly\.jpg(?:[?#]|$)/.test(url) ? jpgOnlySvg : STUB_SVG,
    });
  });

  await page.goto("/hdbits/case/179-torrent-desc-hdbits-jpg-original-fallback");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="jpgonly"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
  await expect
    .poll(() =>
      page
        .locator("._scf_comp_img")
        .first()
        .evaluate((el) => (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src),
    )
    .toContain("/jpgonly.jpg");
  expect(fullRequests.some((url) => /\/jpgonly\.png(?:[?#]|$)/.test(url))).toBe(true);
  expect(fullRequests.some((url) => /\/jpgonly\.jpg(?:[?#]|$)/.test(url))).toBe(true);
});

test("hdbits: WebP-only HDBits originals fall back after PNG and JPG both fail", async ({ page }) => {
  const fullRequests: string[] = [];
  const webpOnlySvg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180">' +
    '<rect width="320" height="180" fill="#555"/></svg>';

  await page.route(/\/\/t\.hdbits\.org\//, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
  await page.route(/\/\/i\.hdbits\.org\//, (route) => {
    const url = route.request().url();
    fullRequests.push(url);
    if (/\/webponly\.(?:png|jpg)(?:[?#]|$)/.test(url)) {
      return route.fulfill({ status: 404, contentType: "text/plain", body: "missing png/jpg" });
    }
    return route.fulfill({
      contentType: "image/svg+xml",
      body: /\/webponly\.webp(?:[?#]|$)/.test(url) ? webpOnlySvg : STUB_SVG,
    });
  });

  await page.goto("/hdbits/case/181-torrent-desc-hdbits-webp-original-fallback");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="webponly"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
  await expect
    .poll(() =>
      page.locator("._scf_comp_img").evaluateAll((els) =>
        els.map((el) => (el as HTMLImageElement).currentSrc || (el as HTMLImageElement).src)
          .find((src) => src.includes("/webponly.")) ?? ""),
    )
    .toContain("/webponly.webp");
  expect(fullRequests.some((url) => /\/webponly\.png(?:[?#]|$)/.test(url))).toBe(true);
  expect(fullRequests.some((url) => /\/webponly\.jpg(?:[?#]|$)/.test(url))).toBe(true);
  expect(fullRequests.some((url) => /\/webponly\.webp(?:[?#]|$)/.test(url))).toBe(true);
});

test("hdbits: BDInfo quote between prose and screenshots breaks false comparison names (Haram 2014)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/157-torrent-desc-haram-bdinfo-before-screens-gallery");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="haram01"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
});

test("hdbits: stale comparison link after a BDInfo quote is removed and images open viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/168-torrent-desc-stale-link-after-bdinfo-quote-gallery");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g168a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
});

test("hdbits: showhide log between source list and screenshots breaks false comparison names", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/177-torrent-desc-showhide-log-before-screens-gallery");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g177a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
});

test("hdbits: technical doc labels before a torrent gallery are not source columns", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/180-torrent-desc-killshot-bdinfo-eac3to-gallery");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="k180a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
});

test("hdbits: non-comparison external torrent screenshots get Show Viewer and open from image click", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.route(/thumbs\d*\.imgbox\.com/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
  await page.route(/images\d*\.imgbox\.com/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
  await page.goto("/hdbits/case/169-torrent-desc-xiyan-slowpics-untitled-and-imgbox-gallery");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(2);
  await expect(viewerLinks(page)).toHaveCount(2);
  await page.locator('img[src*="siFYuCj2"]').dispatchEvent("click");
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(3);
  await expect(page.locator("._scf_comp_img").first()).toHaveAttribute(
    "src",
    "https://images2.imgbox.com/ac/67/siFYuCj2_o.png",
  );
});

test("hdbits: Dariush trailing screenshots get Show Viewer and open from image click", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/162-torrent-desc-dariush-trailing-screenshots");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g162x"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
});

test("hdbits: Dariush remainder without a large gap stays a plain viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/173-torrent-desc-dariush-no-large-gap-remainder");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g173x"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(8);
});

test("hdbits: large-gap trailing screenshots split for any uploader", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/174-torrent-desc-generic-large-gap-remainder");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g174x"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
});

test("hdbits: TheFarm torrent screenshots get Show Viewer without becoming comparisons", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/175-torrent-desc-thefarm-gallery-not-comparison");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g175a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
});

test("hdbits: manual slow.pics columns=1 opens the rescued block as a viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/176-torrent-desc-slowpics-mismatch-manual-viewer");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveText("Show Viewer");
  await expect(page.locator('input[placeholder="cols"]')).toHaveCount(0);
  await viewerLinks(page).first().click();
  const input = page.locator('input[placeholder="cols"]');
  await expect(input).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(1);
  await expect(page.locator('span:has(input[placeholder="cols"])')).toContainText("Show Viewer columns:");
  await expect(page.locator('span:has(input[placeholder="cols"])')).toContainText("(blank or 1 = viewer)");
  await input.press("Enter");

  await expect(page.locator("._scf_orphan_select")).toHaveCount(0);
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(8);
});

test("hdbits: manual slow.pics columns=2 still builds a comparison", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/176-torrent-desc-slowpics-mismatch-manual-viewer");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await viewerLinks(page).first().click();
  const input = page.locator('input[placeholder="cols"]');
  await expect(input).toHaveCount(1);
  await input.fill("2");
  await input.press("Enter");

  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
  await page.keyboard.press("Digit1");
  const names = (await page.locator("._scf_comp_label span").allTextContents())
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["Source 1", "Source 2"]);
});

test("hdbits: manual viewer columns must divide the screenshot count", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/176-torrent-desc-slowpics-mismatch-manual-viewer");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await viewerLinks(page).first().click();
  const input = page.locator('input[placeholder="cols"]');
  await expect(input).toHaveCount(1);
  await input.fill("3");
  await viewerLinks(page).first().click();

  await expect(page.locator("._scf_comp")).toHaveCount(0);
  await expect(page.locator("._scf_column_control")).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveText("Show Viewer (columns must divide 8)");
});

test("hdbits: stale saved Tonari manual control starts as tight Show Viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/178-torrent-desc-tonari-stale-manual-control");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveText("Show Viewer");
  await expect(page.locator("._scf_column_control")).toHaveCount(1);
  await expect(page.locator('input[placeholder="cols"]')).toHaveCount(0);
  await expect(page.locator("span").filter({ hasText: /^columns:/ })).toHaveCount(0);

  const gap = await page.evaluate(() => {
    const control = document.querySelector("._scf_column_control");
    const firstImage = document.querySelector('img[src*="g178a"]');
    if (!control || !firstImage) return null;
    const firstImageNode = firstImage.closest("a") ?? firstImage;
    let brs = 0;
    const text: string[] = [];
    for (let node = control.nextSibling; node && node !== firstImageNode; node = node.nextSibling) {
      if (node.nodeName === "BR") brs += 1;
      else if (node.nodeType === Node.TEXT_NODE) text.push(node.textContent ?? "");
      else text.push((node.textContent ?? "").trim());
    }
    return {
      brs,
      text: text.join("").trim(),
      marginTop: (control as HTMLElement).style.marginTop,
    };
  });
  expect(gap).toEqual({ brs: 1, text: "", marginTop: "" });
});

test("hdbits: Show comparison link sits immediately before the image run", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/158-torrent-desc-comparison-note-before-images");
  await waitForHdbitsReady(page);

  const link = page.locator("._scf_comp_link");
  await expect(link).toHaveCount(1);
  await expect(link).toHaveText("Show comparison");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const trigger = document.querySelector("._scf_comp_link");
        const firstImage = document.querySelector('img[src*="note01"]');
        if (!trigger || !firstImage) return null;
        const range = document.createRange();
        range.setStartAfter(trigger);
        range.setEndBefore(firstImage.closest("a") ?? firstImage);
        return range.toString().trim();
      }),
    )
    .toBe("");
});

test("hdbits: torrent description viewer is isolated from comment images", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.route("**/hdbits/case/_mixed-desc-comment-images", (route) =>
    route.fulfill({
      contentType: "text/html",
      body: renderTorrentWithComment(
        caseBody("152-torrent-desc-release-screens-not-comparison.html"),
        `
          Somebody posted unrelated frames in a comment:<br>
          <a href="https://img.hdbits.org/cmt-plain-a"><img src="https://t.hdbits.org/cmt-plain-a.jpg"></a>
          <a href="https://img.hdbits.org/cmt-plain-b"><img src="https://t.hdbits.org/cmt-plain-b.jpg"></a><br>
        `,
      ),
    }),
  );
  await page.goto("/hdbits/case/_mixed-desc-comment-images");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  const descriptionCell = page.locator("#details td", { has: page.locator('img[src*="g152a"]') });
  await expect(descriptionCell.locator("._scf_comp_link").filter({ hasText: /^Show Viewer/ })).toHaveCount(1);

  await descriptionCell.locator('img[src*="g152a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
});

test("hdbits: sibling heading sections place triggers before matching image runs", async ({ page }) => {
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
      let next: Node | null = link.nextSibling;
      while (next && (next.nodeName === "BR" || (next.nodeType === 3 && !(next.textContent || "").trim()))) {
        next = next.nextSibling;
      }
      const img = next instanceof HTMLAnchorElement
        ? next.querySelector("img")
        : next instanceof HTMLImageElement
          ? next
          : null;
      const range = document.createRange();
      if (img) {
        range.setStartAfter(link);
        range.setEndBefore(img.closest("a") ?? img);
      }
      return {
        firstImage: img?.getAttribute("src") ?? null,
        textBeforeFirstImage: img ? range.toString().trim() : null,
        linksInImageBlock: link.parentElement?.querySelectorAll("._scf_comp_link").length ?? 0,
      };
    }),
  );

  expect(placement).toEqual([
    {
      firstImage: "https://t.hdbits.org/sibling-a-1.jpg",
      textBeforeFirstImage: "",
      linksInImageBlock: 1,
    },
    {
      firstImage: "https://t.hdbits.org/sibling-b-1.jpg",
      textBeforeFirstImage: "",
      linksInImageBlock: 1,
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

test("hdbits: the opened row reserves its aspect from the loaded thumbnail (no 16/9 reflow)", async ({ page }) => {
  // Thumbnails are 2:1 (200×100), NOT 16/9; the full images are delayed. The
  // opened row must reserve the thumbnail's true aspect immediately instead of a
  // 16/9 placeholder that would reflow on load — which shifts the centered cell
  // and recomputes the top/bottom spacers (the "jump on open" bug).
  const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#333"/></svg>';
  await page.route(/\/\/t\.hdbits\.org/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: svg }),
  );
  await page.route(/\/\/i\.hdbits\.org/, async (route) => {
    await new Promise((r) => setTimeout(r, 2000)); // full image lands late
    await route.fulfill({ contentType: "image/svg+xml", body: svg });
  });
  await page.goto("/hdbits/case/116-zoom-mixed-dims");
  await waitForHdbitsReady(page);
  const thumb = page.locator('img[src*="cB0"]').first();
  await expect.poll(() => thumb.evaluate((el) => (el as HTMLImageElement).naturalWidth)).toBe(200);

  await thumb.click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  // Aspect is reserved from the thumbnail within the first second — well before
  // the 2s-delayed full image could supply it.
  const row = page.locator("._scf_comp_row").first();
  await expect
    .poll(() => row.evaluate((el) => (el as HTMLElement).style.aspectRatio), { timeout: 1200 })
    .toBe("200 / 100");
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

    const links = comparisonLinks(page);
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
