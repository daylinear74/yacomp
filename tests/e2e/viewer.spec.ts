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
