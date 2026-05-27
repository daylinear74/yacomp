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
  slot: "torrent.description" | "torrent.comment" | "forum.post";
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
