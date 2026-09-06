import type { Page } from "@playwright/test";
import { test, expect } from "./fixtures";
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
  slot: "torrent.description" | "torrent.comment" | "forum.post" | "forum.reply" | "offer.description" | "offer.comment";
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
    else if (key === "expected_names") {
      // A malformed value would otherwise abort the whole suite at collection
      // time with a bare SyntaxError and no offending filename.
      try {
        meta.expectedNames = JSON.parse(value);
      } catch {
        throw new Error(`${file}: expected_names is not valid one-line JSON (${value})`);
      }
    }
    else if (key === "torrent_title") meta.torrentTitle = value.replace(/^"|"$/g, "");
    else if (key === "thread_title") meta.threadTitle = value.replace(/^"|"$/g, "");
    else if (key === "notes") meta.notes = value;
  }
  if (typeof meta.slot !== "string") throw new Error(`${file}: metadata missing 'slot'`);
  if (typeof meta.expectedGrids !== "number" || !Number.isFinite(meta.expectedGrids)) {
    throw new Error(`${file}: metadata missing or invalid 'expected_grids'`);
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

function viewerSwitches(page: Page) {
  return page.locator("._scf_torrent_viewer_switch");
}

async function readGridNames(page: Page, linkIndex: number): Promise<string[]> {
  // Click the Nth comparison link, read source names off the viewer's
  // label, then close the viewer so the next assertion starts clean.
  const link = comparisonLinks(page).nth(linkIndex);
  await link.scrollIntoViewIfNeeded();
  await link.click();

  const comp = page.locator("._scf_comp");
  await expect(comp).toBeVisible();

  // The label is populated at open; pressing "1" additionally pins the first
  // source active so the assertions below read a deterministic state.
  await page.keyboard.press("Digit1");
  const spans = page.locator("._scf_comp_label > ._scf_comp_label_item");
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

test("hdbits: torrent ⇄ switches both ways and image clicks honor the active mode", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/001-torrent-desc-simple-grid");
  await waitForHdbitsReady(page);

  const link = comparisonLinks(page);
  const toggle = viewerSwitches(page);
  await expect(link).toHaveCount(1);
  await expect(toggle).toHaveText("⇄");
  await expect(toggle).toHaveAttribute("title", "Switch to Viewer");
  await expect(toggle).toHaveAttribute("aria-label", "Switch comparison to Viewer");
  await expect(page.locator("._scf_torrent_viewer_sep")).toHaveText("|");
  expect(
    await link.evaluate((el) => [
      el.textContent?.trim(),
      el.nextElementSibling?.textContent?.trim(),
      el.nextElementSibling?.nextElementSibling?.textContent?.trim(),
    ]),
  ).toEqual(["Show comparison", "|", "⇄"]);

  await toggle.click();
  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerSwitches(page)).toHaveCount(1);
  await expect(toggle).toHaveAttribute("title", "Switch to comparison");
  await expect(toggle).toHaveAttribute("aria-label", "Switch Viewer to comparison");
  await expect(viewerLinks(page)).toHaveCount(1);

  const select = page.locator("select._scf_column_select");
  await expect(select).toHaveValue("1");
  await expect(select.locator("option")).toHaveCount(6);
  await select.selectOption("3");
  await expect(page.locator("._scf_column_control")).toContainText("columns");

  // The switch replaces the comparison image openers as well as its link.
  // ccc1 is flat index 4 → row 1, column 1 in the selected 3-wide Viewer.
  await page.locator('img[src*="ccc1"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  const rows = page.locator("._scf_comp_row");
  await expect(rows).toHaveCount(2);
  await expect.poll(() => rows.evaluateAll((els) => els.map((el) => el.querySelectorAll("._scf_comp_img").length)))
    .toEqual([3, 3]);
  await expect(page.locator("._scf_comp_label_item", { hasText: "Source 2" })).toHaveCSS("opacity", "1");

  await page.keyboard.press("Escape");
  await toggle.click();
  await expect(viewerLinks(page)).toHaveCount(0);
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(toggle).toHaveAttribute("title", "Switch to Viewer");
  await expect(toggle).toHaveAttribute("aria-label", "Switch comparison to Viewer");

  // Switching back restores the inferred 2-wide Source/Encode comparison,
  // including its original per-image opener.
  await page.locator('img[src*="ccc1"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(3);
  await expect(page.locator("._scf_comp_label_item", { hasText: "Source" })).toHaveCSS("opacity", "1");

  // The selected Viewer width survives a round trip through comparison mode.
  await page.keyboard.press("Escape");
  await toggle.click();
  await expect(page.locator("select._scf_column_select")).toHaveValue("3");
  await expect(page.locator("._scf_column_control")).toContainText("columns");
});

test("hdbits: slow.pics comparison switch stays inline through mode changes", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/208-torrent-desc-slowpics-switch-inline");
  await waitForHdbitsReady(page);
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerSwitches(page)).toHaveCount(1);

  const expectInlineControls = async () => {
    const layout = await page.evaluate(() => {
      const control = document.querySelector("._scf_column_control") ?? document.querySelector("._scf_comp_link")!;
      const rects = [control, document.querySelector("._scf_torrent_viewer_sep")!, document.querySelector("._scf_torrent_viewer_switch")!]
        .map((el) => el.getBoundingClientRect());
      const image = document.querySelector('img[src*="g208a"]')!.getBoundingClientRect();
      return {
        verticalOverlap: Math.min(...rects.map((r) => r.bottom)) - Math.max(...rects.map((r) => r.top)),
        horizontalGaps: rects.slice(1).map((r, i) => r.left - rects[i].right),
        gapBeforeImages: image.top - Math.max(...rects.map((r) => r.bottom)),
      };
    });
    expect(layout.verticalOverlap, "link, separator, and switch share a line").toBeGreaterThan(0);
    expect(layout.horizontalGaps.every((gap) => gap >= 0), "controls remain in left-to-right order").toBe(true);
    expect(layout.gapBeforeImages, "screenshots start below the complete control row").toBeGreaterThanOrEqual(-1);
  };

  // Cover both compact site typography and larger text, including the
  // restored comparison link after Viewer mode has moved the controls.
  for (const fontSize of [11, 22]) {
    await page.addStyleTag({ content: `#details { font-size: ${fontSize}px; }` });
    await expectInlineControls();
    await viewerSwitches(page).click();
    await expect(viewerLinks(page)).toHaveCount(1);
    await page.locator("select._scf_column_select").selectOption("3");
    await expectInlineControls();
    await viewerSwitches(page).click();
    await expect(comparisonLinks(page)).toHaveCount(1);
    await expectInlineControls();
  }
});

test("hdbits: rerunning setup from Viewer mode restores fresh comparison image openers", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/001-torrent-desc-simple-grid");
  await waitForHdbitsReady(page);

  await viewerSwitches(page).click();
  await page.locator("select._scf_column_select").selectOption("3");
  await page.evaluate(() => {
    (window as unknown as { __yacomp: { rerunHDBits: () => void } }).__yacomp.rerunHDBits();
  });

  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(0);
  await expect(viewerSwitches(page)).toHaveCount(1);

  // The rerun must replace the detached 3-wide Viewer callback with the fresh
  // 2-wide Source/Encode comparison callback for this same image element.
  await page.locator('img[src*="ccc1"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(3);
  await expect(page.locator("._scf_comp_label_item", { hasText: "Source" })).toHaveCSS("opacity", "1");
});

test("hdbits: rerun leaves native clicks intact for images no longer recognized", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/087-forum-post-slowpics-rescue-dirty-line-fix");
  await waitForHdbitsReady(page);

  const clickState = await page.evaluate(() => {
    const img = document.querySelector<HTMLImageElement>('img[src*="g01"]')!;
    const anchor = img.closest<HTMLAnchorElement>("a")!;
    anchor.remove();
    (window as unknown as { __yacomp: { rerunHDBits: () => void } }).__yacomp.rerunHDBits();
    let state: { seen: boolean; defaultPrevented: boolean } | undefined;
    anchor.addEventListener("click", (e) => {
      state = {
        seen: true,
        defaultPrevented: e.defaultPrevented,
      };
    }, { capture: true, once: true });
    anchor.click();
    return state;
  });

  expect(clickState).toEqual({ seen: true, defaultPrevented: false });
  await expect(page.locator("._scf_comp")).toHaveCount(0);
});

test("hdbits: indivisible comparison-thread OP partitions its trailing shot (80402)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/113-iconic-80402");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  // 37 shots, 2-wide AUS/GBR (from the H1) → 36 named comparison shots and a
  // separate one-shot viewer, following the same title-derived partition rule.
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(1);
  await comparisonLinks(page).click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(18);
  const names = (await page.locator("._scf_comp_label_item").allTextContents())
    .map((text) => text.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["AUS", "GBR"]);

  await page.keyboard.press("Escape");
  await page.locator('img[src*="g37"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(1);
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
  const control = page.locator("._scf_column_control");
  await expect(control.locator("._scf_comp_link")).toHaveText("Show Viewer");
  const columnSelect = control.locator("select._scf_column_select");
  await expect(columnSelect).toHaveValue("1");
  await expect(columnSelect.locator("option")).toHaveCount(4); // 1..image count
  // Natural-English wording around the dropdown: "Show Viewer with [1] column".
  expect(
    await control.evaluate((el) =>
      [...el.childNodes]
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent),
    ),
  ).toEqual([" with ", " column"]);
  await expect
    .poll(() =>
      columnSelect.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          paddingLeft: style.paddingLeft,
          paddingRight: style.paddingRight,
          selectIsBlack: style.color === "rgb(0, 0, 0)",
        };
      }),
    )
    .toEqual({
      paddingLeft: "1px",
      paddingRight: "1px",
      selectIsBlack: false,
    });
  const defaultSelectColor = await columnSelect.evaluate((el) => getComputedStyle(el).color);
  await page.addStyleTag({ content: "._scf_column_control { color: rgb(139, 67, 128) !important; }" });
  await expect
    .poll(() => columnSelect.evaluate((el) => getComputedStyle(el).color))
    .not.toBe(defaultSelectColor);
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

test("hdbits: a manual column choice also governs image-click launch and clicked source", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/176-torrent-desc-slowpics-mismatch-manual-viewer");
  await waitForHdbitsReady(page);

  const select = page.locator("select._scf_column_select");
  await select.selectOption("4");
  // g176c is row 0, column 2 in the selected 4-wide layout.
  await page.locator('img[src*="g176c"]').click();

  await expect(page.locator("._scf_comp")).toBeVisible();
  const rows = page.locator("._scf_comp_row");
  await expect(rows).toHaveCount(2);
  await expect.poll(() => rows.evaluateAll((els) => els.map((el) => el.querySelectorAll("._scf_comp_img").length)))
    .toEqual([4, 4]);
  await expect(
    page.locator("._scf_comp_label_item", { hasText: "Source 3" }),
  ).toHaveCSS("opacity", "1");
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

test("hdbits: offer description gets torrent-description semantics (gallery fallback, no #details table)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/196-offer-desc-showhide-log-before-screens-gallery");
  await waitForHdbitsReady(page);

  // Same shape as 177 but in offer-page chrome, whose details table has no
  // id="details": the description td must still count as the description body
  // (via its div.label), so the stale source-list labels are severed by the
  // eac3to showhide and the untitled shots get the 1-wide Show Viewer gallery.
  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="g196a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
});

test("hdbits: offer comparisons switch both ways and image clicks honor Viewer columns", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/195-offer-desc-three-column-comparison");
  await waitForHdbitsReady(page);

  await expect(page.locator("table#details")).toHaveCount(0);
  await expect(comparisonLinks(page)).toHaveCount(1);
  const toggle = viewerSwitches(page);
  await expect(toggle).toHaveCount(1);
  await expect(toggle).toHaveAttribute("title", "Switch to Viewer");
  await toggle.click();
  await expect(viewerLinks(page)).toHaveCount(1);
  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(toggle).toHaveAttribute("title", "Switch to comparison");
  await page.locator("select._scf_column_select").selectOption("2");

  await viewerLinks(page).click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
  await expect(page.locator("._scf_comp_row").first().locator("._scf_comp_img")).toHaveCount(2);
  await page.keyboard.press("Escape");

  // Flat index 5 is Source 2 in the two-column Viewer, but WEB AMZ in
  // the original three-column comparison. Both image openers must survive.
  await page.locator('img[src$="/o06.jpg"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
  await expect(page.locator("._scf_comp_label_item", { hasText: "Source 2" })).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");

  await toggle.click();
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(0);
  await expect(toggle).toHaveAttribute("title", "Switch to Viewer");
  await page.locator('img[src$="/o06.jpg"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
  await expect(page.locator("._scf_comp_row").first().locator("._scf_comp_img")).toHaveCount(3);
  await expect(page.locator("._scf_comp_label_item", { hasText: "WEB AMZ" })).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");

  await toggle.click();
  await expect(page.locator("select._scf_column_select")).toHaveValue("2");
});

for (const caseName of ["003-torrent-comment-vs-label", "005-forum-post-three-source"]) {
  test(`hdbits: description Viewer switch stays absent in ${caseName}`, async ({ page }) => {
    await stubHdbitsImages(page);
    await page.goto(`/hdbits/case/${caseName}`);
    await waitForHdbitsReady(page);
    await expect(comparisonLinks(page)).toHaveCount(1);
    await expect(viewerSwitches(page)).toHaveCount(0);
  });
}

test("hdbits: uncovered offer groups and a standalone spectrum get separate viewers", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/209-offer-desc-unclaimed-image-groups");
  await waitForHdbitsReady(page);
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(2);
  const group = page.locator("._scf_column_control").filter({ has: page.locator("select") });
  await expect(group.locator("select option")).toHaveCount(12);
  await group.locator("select").selectOption("2");
  await page.locator('img[src$="/g209b06.jpg"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
  await expect(page.locator("._scf_comp_label_item", { hasText: "Source 2" })).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await page.locator('img[src$="/g209spectrum.jpg"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(1);
  await expect(page.locator("._scf_comp_img")).toHaveAttribute("src", /g209spectrum\.png$/);
  await page.keyboard.press("Escape");
  await page.locator('img[src$="/g209a06.jpg"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
  await expect(page.locator("._scf_comp_label_item", { hasText: "WEB (cropped)" })).toHaveCSS("opacity", "1");
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as unknown as { __yacomp: { rerunHDBits: () => void } }).__yacomp.rerunHDBits());
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(2);
});

test("hdbits: all description images open, including unlinked, inline, and lazy images", async ({ page }) => {
  await page.route("https://media.example.invalid/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }));
  await page.goto("/hdbits/case/210-torrent-desc-standalone-images");
  await waitForHdbitsReady(page);
  await expect(comparisonLinks(page)).toHaveCount(0);
  for (const [id, file] of [["poster", "poster"], ["unlinked", "illustration"], ["inline", "smile"], ["lazy", "lazy"]]) {
    await page.locator(`#coverage-${id}`).click();
    await expect(page.locator("._scf_comp")).toHaveCount(1);
    await expect(page.locator("._scf_comp_row")).toHaveCount(1);
    await expect(page.locator("._scf_comp_img")).toHaveAttribute("src", `https://media.example.invalid/${file}`);
    await page.keyboard.press("Escape");
  }
});

test("hdbits: late description images use current sources without capturing page chrome or native clicks", async ({ page }) => {
  await page.route("https://media.example.invalid/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }));
  await page.goto("/hdbits/case/210-torrent-desc-standalone-images");
  await waitForHdbitsReady(page);
  await page.evaluate(() => {
    const root = document.getElementById("coverage-poster")!.closest("td")!;
    const late = document.createElement("img"); late.id = "coverage-late"; late.src = "https://media.example.invalid/late";
    root.append(document.createElement("hr"), late);
    const chrome = late.cloneNode() as HTMLImageElement; chrome.id = "coverage-chrome";
    document.getElementById("header")!.append(chrome);
    const metadata = late.cloneNode() as HTMLImageElement; metadata.id = "coverage-metadata";
    document.querySelector("#details tr td")!.append(metadata);
  });
  await page.locator("#coverage-chrome").click();
  await expect(page.locator("._scf_comp")).toHaveCount(0);
  await page.locator("#coverage-metadata").click();
  await expect(page.locator("._scf_comp")).toHaveCount(0);
  await page.locator("#coverage-late").click();
  await expect(page.locator("._scf_comp")).toHaveCount(1);
  await expect(page.locator("._scf_comp_img")).toHaveAttribute("src", "https://media.example.invalid/late");
  await page.keyboard.press("Escape");
  await page.locator("#coverage-late").evaluate((img) => (img as HTMLImageElement).src = "https://media.example.invalid/replaced");
  await page.locator("#coverage-late").click();
  await expect(page.locator("._scf_comp_img")).toHaveAttribute("src", "https://media.example.invalid/replaced");
  await page.keyboard.press("Escape");
  await page.evaluate(() => (window as unknown as { __yacomp: { saveConfig: (value: unknown) => void } }).__yacomp.saveConfig({ hdbitsImageClick: "native" }));
  await page.locator("#coverage-late").click();
  await expect(page.locator("._scf_comp")).toHaveCount(0);
});

test("hdbits: shared image links open only the clicked image and fallback stops outside descriptions", async ({ page }) => {
  await page.route("https://media.example.invalid/**", (route) => route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }));
  await page.goto("/hdbits/case/210-torrent-desc-standalone-images");
  await waitForHdbitsReady(page);
  await page.evaluate(() => {
    const root = document.getElementById("coverage-poster")!.closest("td")!;
    const link = document.createElement("a"); link.href = "https://media.example.invalid/wrong-target.png";
    for (const id of ["one", "two"]) {
      const img = document.createElement("img"); img.id = `shared-${id}`; img.src = `https://media.example.invalid/${id}`;
      link.append(img);
    }
    root.append(document.createElement("hr"), link);
  });
  // First click installs the late group's control; repeat clicks must not
  // dispatch all listeners attached to the same wrapping anchor.
  for (const id of ["two", "one", "two"]) {
    await page.locator(`#shared-${id}`).click();
    await expect(page.locator("._scf_comp")).toHaveCount(1);
    const rowIndex = id === "one" ? 0 : 1;
    const source = page.locator("._scf_comp_row").nth(rowIndex).locator("._scf_comp_img");
    await expect(source).toHaveAttribute("src", `https://media.example.invalid/${id}`);
    await expect(page.locator("._scf_row_nav_item._scf_active")).toHaveText(String(rowIndex + 1));
    await page.keyboard.press("Escape");
  }
  await page.locator("#shared-two").evaluate((img) => {
    const wrapper = document.createElement("a"); wrapper.href = "https://example.invalid/reparented";
    img.parentElement!.after(wrapper);
    wrapper.append(img);
  });
  await page.locator("#shared-two").click();
  await expect(page.locator("._scf_comp")).toHaveCount(1);
  await expect(page.locator("._scf_row_nav_item._scf_active")).toHaveText("2");
  await page.keyboard.press("Escape");
  await page.locator("#coverage-unlinked").evaluate((img) => document.getElementById("header")!.append(img));
  await page.locator("#coverage-unlinked").click();
  await expect(page.locator("._scf_comp")).toHaveCount(0);
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
  await page.locator('img[src*="imgbox6901"]').dispatchEvent("click");
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(3);
  await expect(page.locator("._scf_comp_img").first()).toHaveAttribute(
    "src",
    "https://images2.imgbox.com/aa/01/imgbox6901_o.png",
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

test("hdbits: title-derived remainder partitions even without a large visual gap", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/173-torrent-desc-dariush-no-large-gap-remainder");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(1);
  await comparisonLinks(page).click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
  await expect.poll(() => page.locator("._scf_comp_row").evaluateAll(
    (els) => els.map((el) => el.querySelectorAll("._scf_comp_img").length),
  )).toEqual([3, 3]);

  await page.keyboard.press("Escape");
  await page.locator('img[src*="g173x"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
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
  const select = page.locator("select._scf_column_select");
  await expect(select).toHaveCount(1);
  await expect(select).toHaveValue("1");
  await expect(select.locator("option")).toHaveCount(8); // 1..image count
  await expect(viewerLinks(page)).toHaveCount(1);
  await select.press("Enter");

  await expect(page.locator("._scf_orphan_select")).toHaveCount(0);
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(8);
});

test("hdbits: manual slow.pics columns=2 still builds a comparison", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/176-torrent-desc-slowpics-mismatch-manual-viewer");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  const select = page.locator("select._scf_column_select");
  await expect(select).toHaveCount(1);
  await select.selectOption("2");
  // The trailing word pluralizes with the choice: "with [2] columns".
  await expect(page.locator("._scf_column_control")).toContainText("columns");
  await viewerLinks(page).first().click();

  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
  await page.keyboard.press("Digit1");
  const names = (await page.locator("._scf_comp_label > ._scf_comp_label_item").allTextContents())
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["Source 1", "Source 2"]);
});

test("hdbits: manual viewer columns can leave a short final row", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/176-torrent-desc-slowpics-mismatch-manual-viewer");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  const select = page.locator("select._scf_column_select");
  await expect(select).toHaveCount(1);
  await select.selectOption("3");
  await select.press("Enter");

  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(3);
  await expect
    .poll(() =>
      page.locator("._scf_comp_row").evaluateAll((rows) =>
        rows.map((row) => row.querySelectorAll("._scf_comp_img").length),
      ),
    )
    .toEqual([3, 3, 2]);
});

test("hdbits: stale saved Tonari manual control starts as tight Show Viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/178-torrent-desc-tonari-stale-manual-control");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveText("Show Viewer");
  await expect(page.locator("._scf_column_control")).toHaveCount(1);
  await expect(page.locator("select._scf_column_select")).toHaveCount(1);
  await expect(page.locator('input[type="number"]')).toHaveCount(0);
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

test("hdbits: leading sample shots above labeled comparison sections get Show Viewer (RPU-fix shape)", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/182-torrent-desc-rpu-leading-screens-before-comparisons");
  await waitForHdbitsReady(page);

  // The three vs-labeled sections inside the COMPARISONS showhide are real
  // comparisons; the four sample shots above them must still get a viewer
  // gallery instead of being claimed and dead.
  await expect(comparisonLinks(page)).toHaveCount(3);
  await expect(viewerLinks(page)).toHaveCount(1);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const control = document.querySelector("._scf_column_control");
        const firstImage = document.querySelector('img[src*="r182lead1"]');
        if (!control || !firstImage) return null;
        const range = document.createRange();
        range.setStartAfter(control);
        range.setEndBefore(firstImage.closest("a") ?? firstImage);
        return range.toString().trim();
      }),
    )
    .toBe("");
  await page.locator('img[src*="r182lead2"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
});

test("hdbits: color section headings over text-only sections stay a gallery, not columns", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/183-torrent-desc-color-section-headings-not-columns");
  await waitForHdbitsReady(page);

  // "Video"/"Audio"/"Subtitles + Chapters" color spans head TEXT sections (the
  // comparisons live at slow.pics links) — they must not become column titles
  // for the trailing release shots.
  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="c183a"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(9);
});

test("hdbits: a bold feature list never supplies column titles for trailing shots", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/184-torrent-desc-bold-feature-list-not-title");
  await waitForHdbitsReady(page);

  // The br-laden special-features strong is a list, not a heading; the comma
  // line plucked from it ("In Memoriam - …, including …") must not title a
  // 2-column comparison. The four shots are a viewer gallery.
  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await page.locator('img[src*="f184b"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
});

test("hdbits: every separated image group gets its own Show Viewer control", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.route(/thumbs\d*\.imgbox\.com|images\d*\.imgbox\.com|catbox\.moe/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
  await page.goto("/hdbits/case/185-torrent-desc-per-group-viewer-galleries");
  await waitForHdbitsReady(page);

  // The lone REPACK shot, showhide imgbox pair, and six trailing shots each
  // get a control. The single shot must not join either screenshot gallery.
  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(3);
  const optionCounts = await page
    .locator("._scf_column_control select")
    .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).options.length));
  expect(optionCounts.sort((a, b) => a - b)).toEqual([2, 6]);
  // The trailing control sits immediately before its image run.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const controls = [...document.querySelectorAll("._scf_column_control")];
        const control = controls.find((c) => c.querySelector("select")?.options.length === 6);
        const firstImage = document.querySelector('img[src*="g185a"]');
        if (!control || !firstImage) return null;
        const range = document.createRange();
        range.setStartAfter(control);
        range.setEndBefore(firstImage.closest("a") ?? firstImage);
        return range.toString().trim();
      }),
    )
    .toBe("");
  await page.locator('img[src*="g185c"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
});

test("hdbits: a lone leading poster has its own viewer outside the trailing gallery", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/197-torrent-desc-leading-poster-then-gallery");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(2);
  // Only the 4 real screenshots are in the gallery — the poster is excluded.
  await expect(page.locator("._scf_column_control select option")).toHaveCount(4);
  // The control sits immediately before the first real screenshot, past the
  // poster and the prose line.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const control = document.querySelector("select._scf_column_select")?.closest("._scf_column_control");
        const firstImage = document.querySelector('img[src*="g197a"]');
        if (!control || !firstImage) return null;
        const range = document.createRange();
        range.setStartAfter(control);
        range.setEndBefore(firstImage.closest("a") ?? firstImage);
        return range.toString().trim();
      }),
    )
    .toBe("");
  await page.locator('img[src*="g197c"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
  await page.keyboard.press("Escape");
  await page.locator('img[src$="/p197.jpg"]').click();
  await expect(page.locator("._scf_comp_row")).toHaveCount(1);
  await expect(page.locator("._scf_comp_img")).toHaveAttribute("src", /p197\.png$/);
});

test("hdbits: text-separated screenshot runs get their own Show Viewer controls", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/198-torrent-desc-two-text-separated-galleries");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(2);
  const optionCounts = await page
    .locator("._scf_column_control select")
    .evaluateAll((els) => els.map((el) => (el as HTMLSelectElement).options.length));
  expect(optionCounts).toEqual([3, 3]);
  await page.locator('img[src*="g198e"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(3);
});

test("hdbits: per-shot prose captions keep one merged Show Viewer gallery", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/199-torrent-desc-interleaved-prose-single-gallery");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(0);
  await expect(viewerLinks(page)).toHaveCount(1);
  await expect(page.locator("._scf_column_control select option")).toHaveCount(3);
});

test("hdbits: a Comparisons heading after a sample block still forms a titled comparison", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/200-torrent-desc-trailing-comparisons-heading-after-samples");
  await waitForHdbitsReady(page);

  // The 6 leading sample shots get a viewer; the 12 shots under the
  // "Comparisons (Encode vs Scene vs Source)" heading are a real 3-column
  // comparison even though the sample gallery comes first.
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(1);
  await expect(page.locator("._scf_column_control select option")).toHaveCount(6);
  // Fixed spacing contract: ONE blank line between the section title and the
  // link (2 <br>s), NO blank line between the link and the first image (1 <br>).
  const spacing = await page.evaluate(() => {
    const link = [...document.querySelectorAll("._scf_comp_link")]
      .find((l) => l.textContent === "Show comparison")!;
    const heading = [...document.querySelectorAll("span")]
      .find((s) => /^Comparisons \(/.test(s.textContent || ""))!;
    const firstImg = document.querySelector('img[src*="c200a"]')!.closest("a")!;
    const countBreaks = (from: Element, stopAt: Node): number => {
      let brs = 0;
      for (let n: Node | null = from.nextSibling; n; n = n.nextSibling) {
        if (n === stopAt) return brs;
        if (n.nodeName === "BR") brs++;
        else if (!(n.nodeType === 3 && !(n.textContent || "").trim())) return -1;
      }
      return -2;
    };
    const switchButton = link.nextElementSibling?.nextElementSibling;
    const comparisonControlEnd = switchButton?.classList.contains("_scf_torrent_viewer_switch")
      ? switchButton
      : link;
    return {
      titleToLink: countBreaks(heading, link),
      linkToImages: countBreaks(comparisonControlEnd, firstImg),
    };
  });
  expect(spacing).toEqual({ titleToLink: 2, linkToImages: 1 });
  expect(await readGridNames(page, 0)).toEqual(["Encode", "Scene", "Source"]);
});

test("hdbits: a Preview block after comparisons gets a Show Viewer, not silence", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/076-torrent-desc-color-source-filtered-encode");
  await waitForHdbitsReady(page);

  // The two real comparisons keep their controls; the trailing Preview shots
  // are a sample gallery with their own viewer instead of dead images.
  await expect(comparisonLinks(page)).toHaveCount(2);
  await expect(viewerLinks(page)).toHaveCount(1);
  await expect(page.locator("._scf_column_control select option")).toHaveCount(6);
  await page.locator('img[src*="g59"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(6);
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
        const switchButton = trigger.nextElementSibling?.nextElementSibling;
        range.setStartAfter(switchButton?.classList.contains("_scf_torrent_viewer_switch") ? switchButton : trigger);
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
      while (next && (
        next.nodeName === "BR" ||
        (next.nodeType === 3 && !(next.textContent || "").trim()) ||
        (next instanceof Element && next.matches("._scf_torrent_viewer_sep, ._scf_torrent_viewer_switch"))
      )) {
        next = next.nextSibling;
      }
      const img = next instanceof HTMLAnchorElement
        ? next.querySelector("img")
        : next instanceof HTMLImageElement
          ? next
          : null;
      const range = document.createRange();
      if (img) {
        const switchButton = link.nextElementSibling?.nextElementSibling;
        range.setStartAfter(switchButton?.classList.contains("_scf_torrent_viewer_switch") ? switchButton : link);
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
  await expect(label.locator("._scf_comp_label_item", { hasText: "Encode" })).toHaveCSS("opacity", "1");
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
  await expect(label.locator("._scf_comp_label_item", { hasText: "Geek" }).first()).toHaveCSS("opacity", "1");
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
  const names = (await page.locator("._scf_comp_label > ._scf_comp_label_item").allTextContents())
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["Source 1", "Source 2"]);
});

test("hdbits: source-grouped comparison drops the odd group but keeps it as a clickable gallery", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/190-forum-post-source-grouped-odd-audio-group");
  await waitForHdbitsReady(page);

  // USA(10)/CZE(10) transpose into the 2-column comparison; the odd Audio(4)
  // group is a separate comparison surfaced as a 1-wide viewer gallery.
  await expect(comparisonLinks(page)).toHaveCount(1);
  await expect(viewerLinks(page)).toHaveCount(1);

  // Clicking an Audio shot opens the viewer (4 single-column rows).
  await page.locator('img[src*="w190a1"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(4);
});

test("hdbits: forum manual custom comparison grouped-by-source mode pairs columns column-major", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("h1 + ._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  // One click grabs the 4-image gallery (document order manual01..04).
  await page.locator('img[src*="t.hdbits.org/manual"]').nth(0).click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(4);

  // Grouped by source: the selection is read as two contiguous per-source
  // blocks [m1,m2] and [m3,m4], so row r pairs the r-th shot of each block.
  await panel.locator("._scf_manual_grouped").check();
  await panel.locator("._scf_manual_cols").selectOption("2");
  await panel.locator("._scf_manual_build").click();

  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
  const pairs = await page.locator("._scf_comp_row").evaluateAll((rows) =>
    rows.map((row) =>
      [...row.querySelectorAll("._scf_comp_img")].map((img) => {
        const el = img as HTMLImageElement;
        const src = el.src || el.dataset.src || "";
        return (src.match(/manual\d+/) ?? [""])[0];
      }),
    ),
  );
  // Column-major: row 0 = [m1, m3], row 1 = [m2, m4] — NOT the side-by-side
  // [m1, m2] / [m3, m4].
  expect(pairs).toEqual([
    ["manual01", "manual03"],
    ["manual02", "manual04"],
  ]);
});

test("hdbits: grouped-by-source mode rejects an indivisible selection instead of pairing one source with itself", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/155-forum-post-grouped-manual-selection");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  await page.locator(".cmp-label").click();
  await page.locator('img[src*="grpA1"]').click(); // [A1, A2]
  await page.locator('img[src*="grpB1"]').click({ modifiers: ["ControlOrMeta"] }); // + B1
  await expect(page.locator("._scf_manual_selected")).toHaveCount(3);

  await panel.locator("._scf_manual_grouped").check();
  await panel.locator("._scf_manual_cols").selectOption("2");
  await panel.locator("._scf_manual_build").click();

  await expect(panel.locator("._scf_manual_status"))
    .toHaveText("3 selected; grouped sources need equal image counts");
  await expect(page.locator("._scf_comp")).toHaveCount(0);
  await expect(page.locator("._scf_column_control")).toHaveCount(0);
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
  const names = (await page.locator("._scf_comp_label > ._scf_comp_label_item").allTextContents())
    .map((t) => t.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["Source", "Encode"]);
});

test("hdbits: forum manual — single labels accumulate into a title with Ctrl/Cmd-click", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/191-forum-post-title-chooser-accumulation");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  const names = panel.locator("._scf_manual_names");

  // A plain click on a single label names the first column.
  await page.locator(".lbl-usa").click();
  await expect(names).toHaveValue("USA");

  // Ctrl/⌘-click appends the next column.
  await page.locator(".lbl-cze").click({ modifiers: ["ControlOrMeta"] });
  await expect(names).toHaveValue("USA | CZE");

  // A later plain click rotates the FIRST column, keeping the rest.
  await page.locator(".lbl-audio").click();
  await expect(names).toHaveValue("Audio | CZE");
});

test("hdbits: forum manual — locking the column count rotates titles instead of adding columns", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/191-forum-post-title-chooser-accumulation");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  const names = panel.locator("._scf_manual_names");
  const cols = panel.locator("._scf_manual_cols");

  // Select the 4-image gallery (so the dropdown offers 2/4), set 2, then LOCK.
  await page.locator('img[src*="t191a"]').click();
  await cols.selectOption("2");
  await panel.locator("._scf_manual_cols_lock").click();
  await expect(cols).toBeDisabled();

  await page.locator(".lbl-usa").click();
  await page.locator(".lbl-cze").click({ modifiers: ["ControlOrMeta"] });
  await expect(names).toHaveValue("USA | CZE");

  // A 3rd Ctrl/⌘-click rotates within the 2 pinned columns — does NOT grow to 3.
  await page.locator(".lbl-audio").click({ modifiers: ["ControlOrMeta"] });
  await expect(names).toHaveValue("Audio | CZE");
  await expect(cols).toHaveValue("2");

  // Ctrl/⌘-clicking a name already in the title is a no-op.
  await page.locator(".lbl-cze").click({ modifiers: ["ControlOrMeta"] });
  await expect(names).toHaveValue("Audio | CZE");

  // Picked titles are highlighted on the page (distinct from image selection).
  expect(
    await page.evaluate(() => {
      const reg = (window as unknown as { CSS?: { highlights?: { has(k: string): boolean } } }).CSS?.highlights;
      return reg ? reg.has("_scf_manual_title") : null;
    }),
  ).toBe(true);
});

test("hdbits: forum manual — the toolbar stays floating after Build closes the viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  await expect(panel).toHaveClass(/_scf_manual_floating/);
  await page.locator('img[src*="t.hdbits.org/manual"]').nth(0).click();
  await panel.locator("._scf_manual_build").click();

  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("._scf_comp")).not.toBeVisible();
  // Back to the builder — still floating, ready for another pass.
  await expect(panel).toHaveClass(/_scf_manual_floating/);
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

test("hdbits: 82306 partitions the four-column comparison from three trailing plots", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/206-forum-post-title-remainder-82306");
  await waitForHdbitsReady(page);

  await expect(comparisonLinks(page)).toHaveCount(1);
  await comparisonLinks(page).click();

  const comp = page.locator("._scf_comp");
  await expect(comp).toBeVisible();
  const rows = page.locator("._scf_comp_row");
  await expect(rows).toHaveCount(10);
  await expect.poll(() => rows.evaluateAll((els) => els.map((el) => el.querySelectorAll("._scf_comp_img").length)))
    .toEqual(Array(10).fill(4));
  const names = (await page.locator("._scf_comp_label_item").allTextContents())
    .map((text) => text.replace(/^\d+\.\s*/, "").trim())
    .filter(Boolean);
  expect(names).toEqual(["BD remux", "MA HDR", "iTunes DV", "UHD Remux"]);

  await page.keyboard.press("Escape");
  await expect(comp).not.toBeVisible();
  const remainderControl = page.locator("._scf_column_control");
  await expect(remainderControl).toHaveCount(1);
  await expect(remainderControl.locator("option")).toHaveCount(3);
  await expect(remainderControl.locator("select")).toHaveValue("1");

  await page.locator('img[src*="plot02"]').click();
  await expect(comp).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(3);
  await expect.poll(() => page.locator("._scf_comp_row").evaluateAll(
    (els) => els.map((el) => el.querySelectorAll("._scf_comp_img").length),
  )).toEqual([1, 1, 1]);
});

test("hdbits: 82306 comparison image click maps into the partitioned four-column grid", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/206-forum-post-title-remainder-82306");
  await waitForHdbitsReady(page);

  // lo006 is row 1, column 1 after the 40 + 3 partition.
  await page.locator('img[src*="lo006"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(10);
  await expect(
    page.locator("._scf_comp_label_item", { hasText: "MA HDR" }),
  ).toHaveCSS("opacity", "1");
});

test("hdbits: custom builder reads the thread title and partitions an all-image selection", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/206-forum-post-title-remainder-82306");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  const title = page.locator("h1");

  // A direct title click reads all four source names and pins four columns.
  await title.click();
  await expect(panel.locator("._scf_manual_names"))
    .toHaveValue("BD remux | MA HDR | iTunes DV | UHD Remux");
  await expect(panel.locator("._scf_manual_cols")).toHaveValue("4");

  // Selecting only part of the H1 is also a title pick.
  await page.evaluate(() => {
    const h1 = document.querySelector("h1")!;
    const walker = document.createTreeWalker(h1, NodeFilter.SHOW_TEXT);
    const needle = "MA HDR vs. iTunes DV";
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const start = (node.textContent ?? "").indexOf(needle);
      if (start < 0) continue;
      const range = document.createRange();
      range.setStart(node, start);
      range.setEnd(node, start + needle.length);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
      break;
    }
  });
  await expect(panel.locator("._scf_manual_names")).toHaveValue("MA HDR | iTunes DV");
  await expect(panel.locator("._scf_manual_cols")).toHaveValue("2");

  // Restore the full title, then select the whole 43-image gallery with one click.
  await title.click();
  await page.locator('img[src*="lo001"]').click();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(43);
  await expect(panel.locator("._scf_manual_cols")).toHaveValue("4");
  await expect(panel.locator("._scf_manual_status"))
    .toHaveText("43 selected; 40 comparison + 3 separate");

  await panel.locator("._scf_manual_build").click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(10);
  await page.keyboard.press("Escape");
  await expect(page.locator("._scf_column_control")).toHaveCount(1);
  await expect(page.locator("._scf_column_control option")).toHaveCount(3);
});

test("hdbits: custom builder disposes stale remainder controls and image openers on rebuild and Clear", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  const selectThreeAndBuild = async () => {
    await panel.locator("._scf_manual_button").click();
    await page.locator('img[src$="/manual01.jpg"]').click();
    await panel.locator("._scf_manual_cols").selectOption("2");
    await panel.locator("._scf_manual_cols_lock").click();
    await page.locator('img[src$="/manual04.jpg"]').click({ modifiers: ["ControlOrMeta"] });
    await expect(page.locator("._scf_manual_selected")).toHaveCount(3);
    await panel.locator("._scf_manual_names").fill("A | B");
    await panel.locator("._scf_manual_build").click();
    await expect(page.locator("._scf_comp")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("._scf_comp")).not.toBeVisible();
  };
  const clickWithoutFollowingNativeLink = async (selector: string) => {
    await page.locator(selector).evaluate((img) => {
      document.addEventListener("click", (event) => event.preventDefault(), { capture: true, once: true });
      (img as HTMLImageElement).click();
    });
  };

  // Clear must remove both the generated control and its image opener.
  await selectThreeAndBuild();
  await expect(page.locator("._scf_column_control")).toHaveCount(1);
  await panel.locator("._scf_manual_clear").click();
  await expect(page.locator("._scf_column_control")).toHaveCount(0);
  await clickWithoutFollowingNativeLink('img[src$="/manual03.jpg"]');
  await expect(page.locator("._scf_comp")).toHaveCount(0);

  // A later divisible build supersedes the old remainder Viewer instead of
  // accumulating another control/opener; Clear leaves native clicks native.
  await selectThreeAndBuild();
  await expect(page.locator("._scf_column_control")).toHaveCount(1);
  await page.locator('img[src$="/manual03.jpg"]').click({ modifiers: ["ControlOrMeta"] });
  await expect(page.locator("._scf_manual_selected")).toHaveCount(2);
  await panel.locator("._scf_manual_build").click();
  await expect(page.locator("._scf_column_control")).toHaveCount(0);
  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Escape");
  await panel.locator("._scf_manual_clear").click();
  await clickWithoutFollowingNativeLink('img[src$="/manual03.jpg"]');
  await expect(page.locator("._scf_comp")).toHaveCount(0);
});

test("hdbits: custom builder Clear restores a displaced Viewer control and its image opener", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/190-forum-post-source-grouped-odd-audio-group");
  await waitForHdbitsReady(page);

  const originalControl = page.locator("._scf_column_control");
  await expect(originalControl).toHaveCount(1);
  await originalControl.evaluate((control) => {
    control.setAttribute("data-test-original-control", "true");
  });
  await originalControl.locator("select").selectOption("2");
  const audioGapSignature = () => page.evaluate(() => {
    const control = document.querySelector('[data-test-original-control="true"]');
    const first = document.querySelector('img[src$="/w190a1.jpg"]')?.closest("a");
    if (!control || !first) return null;
    const signature: string[] = [];
    for (let node = control.nextSibling; node && node !== first; node = node.nextSibling) {
      signature.push(node.nodeType === Node.TEXT_NODE ? `#text:${node.textContent}` : node.nodeName);
    }
    return signature;
  });
  const originalGap = await audioGapSignature();

  const panel = page.locator("._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();
  await page.locator('img[src$="/w190u1.jpg"]').click();
  await page.locator('img[src$="/w190c10.jpg"]').click({ modifiers: ["Shift"] });
  await expect(page.locator("._scf_manual_selected")).toHaveCount(20);
  await panel.locator("._scf_manual_cols").selectOption("5");
  await panel.locator("._scf_manual_cols_lock").click();
  await expect(panel.locator("._scf_manual_cols")).toBeDisabled();
  await page.locator('img[src$="/w190a4.jpg"]').click({ modifiers: ["Shift"] });
  await expect(page.locator("._scf_manual_selected")).toHaveCount(24);

  // Five named columns leave the four-image Audio gallery as the separate
  // remainder, temporarily replacing its existing automatic Viewer control.
  await panel.locator("._scf_manual_names").fill("A | B | C | D | E");
  await panel.locator("._scf_manual_build").click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator('[data-test-original-control="true"]')).toHaveCount(0);
  await expect(page.locator("._scf_column_control")).toHaveCount(1);

  await panel.locator("._scf_manual_clear").click();
  const restoredControl = page.locator('[data-test-original-control="true"]');
  await expect(restoredControl).toHaveCount(1);
  await expect(restoredControl.locator("select")).toHaveValue("2");
  expect(await audioGapSignature()).toEqual(originalGap);

  // The restored control's original two-column image opener wins again; the
  // temporary remainder opener would instead produce four one-column rows.
  await page.locator('img[src$="/w190a3.jpg"]').click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(2);
});

test("hdbits: custom builder respects images explicitly left out of the selection", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/206-forum-post-title-remainder-82306");
  await waitForHdbitsReady(page);

  const panel = page.locator("._scf_manual_panel");
  const automaticRemainderControls = await page.locator("._scf_column_control").count();
  expect(automaticRemainderControls).toBe(0);
  await panel.locator("._scf_manual_button").click();
  await page.locator("h1").click();
  await page.locator('img[src*="lo001"]').click();
  for (const id of ["plot01", "plot02", "plot03"]) {
    await page.locator(`img[src*="${id}"]`).click({ modifiers: ["ControlOrMeta"] });
  }
  await expect(page.locator("._scf_manual_selected")).toHaveCount(40);
  await expect(panel.locator("._scf_manual_status")).toHaveText("40 selected");

  await panel.locator("._scf_manual_build").click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await expect(page.locator("._scf_comp_row")).toHaveCount(10);
  // The three deliberately omitted plots do not create a custom remainder
  // control: only selected images participate in the custom partition.
  await expect(page.locator("._scf_column_control")).toHaveCount(automaticRemainderControls);
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

  await panel.locator("._scf_manual_cols").selectOption("6");
  await panel.locator("._scf_manual_build").click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Digit1");
  const names = (await page.locator("._scf_comp_label > ._scf_comp_label_item").allTextContents())
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

test("hdbits: a manual-builder drag released off-image does not swallow the next click", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/154-forum-post-manual-custom-comparison");
  await waitForHdbitsReady(page);

  const panel = page.locator("h1 + ._scf_manual_panel");
  await panel.locator("._scf_manual_button").click();

  // Sweep across the first two shots, releasing over whitespace to the right
  // of the gallery — a natural end to a drag selection.
  const shots = page.locator('img[src*="t.hdbits.org/manual"]');
  const first = (await shots.nth(0).boundingBox())!;
  const second = (await shots.nth(1).boundingBox())!;
  await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2);
  await page.mouse.down();
  await page.mouse.move(second.x + second.width / 2, second.y + second.height / 2, { steps: 4 });
  await page.mouse.move(second.x + second.width + 300, second.y + second.height / 2, { steps: 4 });
  await page.mouse.up();
  await expect(page.locator("._scf_manual_selected")).toHaveCount(2);

  // The next Ctrl+click must toggle its shot on — a stale drag-suppress flag
  // used to eat this click entirely.
  await shots.nth(2).click({ modifiers: ["Control"] });
  await expect(page.locator("._scf_manual_selected")).toHaveCount(3);
});

test("hdbits: double-clicking Show comparison during the slow.pics fetch opens one viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/202-torrent-desc-slowpics-delayed-fetch-double-click");
  await waitForHdbitsReady(page);

  // Both clicks land while the 300ms-delayed collection fetch is in flight.
  const link = comparisonLinks(page).first();
  await link.click();
  await link.click();

  await expect(page.locator("._scf_comp").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator("._scf_comp")).toHaveCount(1);
});

test("hdbits: link and image clicks during one delayed fetch open one viewer", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/202-torrent-desc-slowpics-delayed-fetch-double-click");
  await waitForHdbitsReady(page);

  // Fire both entry points in one task so the image click necessarily lands
  // while the comparison link's delayed fetch is still pending.
  await page.evaluate(() => {
    document.querySelector<HTMLAnchorElement>("._scf_comp_link")!.click();
    document.querySelector<HTMLImageElement>('img[src*="g202a"]')!
      .closest<HTMLAnchorElement>("a")!.click();
  });

  await expect(page.locator("._scf_comp").first()).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.locator("._scf_comp")).toHaveCount(1);
});

test("hdbits: switching away and back cancels a delayed comparison open", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/202-torrent-desc-slowpics-delayed-fetch-double-click");
  await waitForHdbitsReady(page);

  await comparisonLinks(page).click();
  await viewerSwitches(page).click();
  await expect(viewerLinks(page)).toHaveCount(1);
  await viewerSwitches(page).click();
  await expect(comparisonLinks(page)).toHaveCount(1);

  await page.waitForTimeout(500);
  await expect(page.locator("._scf_comp")).toHaveCount(0);

  // Invalidating the stale request must not disable a fresh comparison open.
  await comparisonLinks(page).click();
  await expect(page.locator("._scf_comp")).toBeVisible();
});

test("hdbits: a single-column gallery viewer shows no source-title banner", async ({ page }) => {
  await stubHdbitsImages(page);
  await page.goto("/hdbits/case/176-torrent-desc-slowpics-mismatch-manual-viewer");
  await waitForHdbitsReady(page);

  const select = page.locator("select._scf_column_select");
  await expect(select).toHaveValue("1");
  await select.press("Enter");
  await expect(page.locator("._scf_comp")).toBeVisible();

  // Column titles are a comparison affordance — a gallery is plain images.
  // Neither opening nor a digit press may populate the banner.
  await expect(page.locator("._scf_comp_label > ._scf_comp_label_item")).toHaveCount(0);
  await page.keyboard.press("Digit1");
  await expect(page.locator("._scf_comp_label > ._scf_comp_label_item")).toHaveCount(0);
});
