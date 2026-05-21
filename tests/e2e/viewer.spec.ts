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
  await page.goto("/");
  await page.click("#open-viewer");
  await expect(page.locator("._scf_comp")).toBeVisible();
});

test("viewer opens with V shortcut", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("KeyV");
  await expect(page.locator("._scf_comp")).toBeVisible();
});

test("viewer closes on Escape", async ({ page }) => {
  await page.goto("/");
  await page.click("#open-viewer");
  await expect(page.locator("._scf_comp")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("._scf_comp")).not.toBeVisible();
});

test("column switching with number keys", async ({ page }) => {
  await page.goto("/");
  await page.click("#open-viewer");
  await expect(page.locator("._scf_comp")).toBeVisible();

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

test("row navigation with arrow keys", async ({ page }) => {
  await page.goto("/");
  await page.click("#open-viewer");
  await expect(page.locator("._scf_comp")).toBeVisible();

  await page.keyboard.press("ArrowDown");
  const nav = page.locator("._scf_row_nav_item._scf_active");
  await expect(nav).toContainText("2");
});

test("mixed-resolution rows keep max canvas aspect ratio", async ({ page }) => {
  await page.goto("/");
  await page.click("#open-viewer");
  await expect(page.locator("._scf_comp")).toBeVisible();

  await expectRowCanvasAspectRatio(page, 0, "1920 / 1080", 1920 / 1080);

  await page.keyboard.press("ArrowDown");
  await expect(page.locator("._scf_row_nav_item._scf_active")).toContainText("2");
  await expectRowCanvasAspectRatio(page, 1, "1920 / 1080", 1920 / 1080);
});
