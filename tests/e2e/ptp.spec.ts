import { test, expect, type Page } from "@playwright/test";

// ─── PTP inline image grid ────────────────────────────────────────────────────
//
// The fixture (/ptp) renders one PTP-style "Show comparison" link whose onclick
// carries 3 sources x 2 rows = 6 passthepopcorn.me /i/ images. ptp-entry.ts
// mounts injectPTPGrids directly (the real setupPTP hostname guard won't pass on
// 127.0.0.1) and exposes __yacomp.saveConfig so each mode can be injected.

const STUB_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90">' +
  '<rect width="160" height="90" fill="#333"/></svg>';

async function openPtp(page: Page, config?: Record<string, unknown>): Promise<void> {
  await page.route(/passthepopcorn\.me/, (route) =>
    route.fulfill({ contentType: "image/svg+xml", body: STUB_SVG }),
  );
  await page.goto("/ptp");
  await page.waitForFunction(
    () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
    undefined,
    { timeout: 5000 },
  );
  if (config) {
    await page.evaluate((c) => {
      (window as unknown as { __yacomp: { saveConfig: (p: Record<string, unknown>) => void } })
        .__yacomp.saveConfig(c);
    }, config);
  }
}

test("ptp: a grid toggle sits beside Show comparison and folds the grid open/closed", async ({ page }) => {
  await openPtp(page);
  const toggle = page.locator("._scf_ptp_grid_toggle");
  const grid = page.locator("._scf_ptp_grid");
  await expect(toggle).toHaveCount(1);
  await expect(grid).toHaveCount(1);

  // Order is: Show comparison | ▦ — a separator sits between the native link
  // and the toggle.
  const sep = page.locator("._scf_ptp_grid_sep");
  await expect(sep).toHaveText("|");
  const beforeSep = await sep.evaluate(
    (el) => (el.previousElementSibling as HTMLElement | null)?.textContent?.trim(),
  );
  expect(beforeSep).toBe("Show comparison");
  const afterSep = await sep.evaluate(
    (el) => (el.nextElementSibling as HTMLElement | null)?.className,
  );
  expect(afterSep).toContain("_scf_ptp_grid_toggle");

  // Collapsed and unpopulated until first opened (a comparison can be 50+ shots).
  await expect(grid).not.toHaveClass(/_scf_open/);
  expect(await grid.locator("img").count()).toBe(0);

  // Expand → images populate (3 sources x 2 rows).
  await toggle.click();
  await expect(grid).toHaveClass(/_scf_open/);
  await expect(grid.locator("img")).toHaveCount(6);

  // Collapse again (images stay built; just hidden).
  await toggle.click();
  await expect(grid).not.toHaveClass(/_scf_open/);
  await expect(grid.locator("img")).toHaveCount(6);
});

test("ptp: thumbnail mode (default) loads /t/ previews; tiles link to the full /i/ image", async ({ page }) => {
  await openPtp(page);
  await page.locator("._scf_ptp_grid_toggle").click();
  const grid = page.locator("._scf_ptp_grid");
  await expect(grid.locator("img")).toHaveCount(6);

  // Every tile renders the /t/ thumbnail but links out to the /i/ original.
  for (const img of await grid.locator("img").all()) {
    await expect(img).toHaveAttribute("src", /passthepopcorn\.me\/t\//);
  }
  const firstLink = grid.locator("a").first();
  await expect(firstLink).toHaveAttribute("href", /passthepopcorn\.me\/i\/AAA\.png/);
  await expect(firstLink).toHaveAttribute("target", "_blank");
});

test("ptp: full mode loads the /i/ originals inline", async ({ page }) => {
  await openPtp(page, { ptpGridImageSize: "full" });
  await page.locator("._scf_ptp_grid_toggle").click();
  const imgs = page.locator("._scf_ptp_grid img");
  await expect(imgs).toHaveCount(6);
  for (const img of await imgs.all()) {
    await expect(img).toHaveAttribute("src", /passthepopcorn\.me\/i\//);
  }
});

test("ptp: the grid lays out one column per source", async ({ page }) => {
  await openPtp(page);
  await page.locator("._scf_ptp_grid_toggle").click();
  const cols = await page
    .locator("._scf_ptp_grid")
    .evaluate((el) => (el as HTMLElement).style.gridTemplateColumns);
  expect(cols).toBe("repeat(3, 1fr)");
});

test("ptp: the toggle is a single ▦ glyph by default", async ({ page }) => {
  await openPtp(page);
  await expect(page.locator("._scf_ptp_grid_toggle")).toHaveText("▦");
});

test("ptp: the ▶/▼ preset swaps the toggle glyph on fold", async ({ page }) => {
  await openPtp(page, { ptpGridToggleStyle: "triangles" });
  // The settings UI refreshes already-rendered toggles on save; drive it directly.
  await page.evaluate(() => {
    (window as unknown as { __yacomp: { refreshGridToggles: () => void } })
      .__yacomp.refreshGridToggles();
  });
  const toggle = page.locator("._scf_ptp_grid_toggle");
  await expect(toggle).toHaveText("▶"); // collapsed
  await toggle.click();
  await expect(toggle).toHaveText("▼"); // expanded
  await toggle.click();
  await expect(toggle).toHaveText("▶"); // collapsed again
});

test("ptp: the Custom style uses the free-text labels", async ({ page }) => {
  await openPtp(page, {
    ptpGridToggleStyle: "custom",
    ptpGridToggleCollapsed: "[+]",
    ptpGridToggleExpanded: "[-]",
  });
  await page.evaluate(() => {
    (window as unknown as { __yacomp: { refreshGridToggles: () => void } })
      .__yacomp.refreshGridToggles();
  });
  const toggle = page.locator("._scf_ptp_grid_toggle");
  await expect(toggle).toHaveText("[+]");
  await toggle.click();
  await expect(toggle).toHaveText("[-]");
});

test("ptp: grid images have square (un-rounded) corners", async ({ page }) => {
  await openPtp(page);
  await page.locator("._scf_ptp_grid_toggle").click();
  const radius = await page
    .locator("._scf_ptp_grid img")
    .first()
    .evaluate((el) => getComputedStyle(el).borderTopLeftRadius);
  expect(radius).toBe("0px");
});

test("ptp: clicking a grid image opens the viewer at that shot (default)", async ({ page }) => {
  await openPtp(page); // default ptpGridClick = "viewer"
  await page.locator("._scf_ptp_grid_toggle").click();
  const imgs = page.locator("._scf_ptp_grid img");
  await expect(imgs).toHaveCount(6);

  // Image index 1 = row 0, col 1 → the viewer opens with Source B active.
  await imgs.nth(1).click();
  await expect(page.locator("._scf_comp")).toBeVisible();
  const label = page.locator("._scf_comp_label");
  await expect(label.locator("span", { hasText: "Source B" })).toHaveCSS("opacity", "1");
  await expect(label.locator("span", { hasText: "Source A" })).toHaveCSS("opacity", "0.4");
});

test("ptp: with 'New tab', clicking a grid image opens the full image in a tab (no viewer)", async ({ page }) => {
  await openPtp(page, { ptpGridClick: "tab" });
  await page.locator("._scf_ptp_grid_toggle").click();
  const imgs = page.locator("._scf_ptp_grid img");
  await expect(imgs).toHaveCount(6);

  const [popup] = await Promise.all([
    page.waitForEvent("popup"),
    imgs.nth(0).click(),
  ]);
  expect(popup.url()).toMatch(/passthepopcorn\.me\/i\/AAA\.png/);
  await expect(page.locator("._scf_comp")).toHaveCount(0);
});
