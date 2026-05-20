import { test, expect } from "@playwright/test";

// Stub the slow.pics CDN so the suite is hermetic (no external network).
// A 16:9 SVG keeps viewer row aspect ratios realistic.
const PLACEHOLDER_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">' +
  '<rect width="160" height="90" fill="#3a3a3a"/></svg>';

test.beforeEach(async ({ page }) => {
  await page.route(/i\.slow\.pics/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: PLACEHOLDER_SVG }),
  );
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
