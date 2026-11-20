import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures";

const url = "https://slow.pics/c/shortcuts";
let bundle: string;
test.beforeAll(() => {
  expect(readFileSync("meta/banner.txt", "utf8")).toMatch(/@run-at\s+document-start\b/);
  bundle = execFileSync("bun", ["build", "src/index.ts", "--format=iife"], { encoding: "utf8" });
});

async function visit(page: Page, config: Record<string, unknown> = {}) {
  // Use the production entry at its declared injection time, before the
  // comparison's inline scripts have registered their window listeners.
  await page.addInitScript({ content: `(() => {
    const GM_getValue = () => (${JSON.stringify(config)});
    const GM_setValue = () => {};
    const GM_registerMenuCommand = (_, open) => document.getElementById("menu").addEventListener("click", open);
    ${bundle}
  })();` });
  await page.route(url, (route) => route.fulfill({
    path: "tests/fixtures/viewer/slowpics-shortcuts.html", contentType: "text/html",
  }));
  await page.goto(url);
}

test("slow.pics gets neither half of a yacomp shortcut, including release actions", async ({ page }) => {
  await visit(page, { defaultZoomMode: "fit" });
  const keys = page.locator("#host-keys");
  const toast = page.locator("#_scf_toast_");
  await page.keyboard.down("Shift");
  await page.keyboard.down("KeyF");
  await expect(keys).toBeEmpty();
  await expect(toast).toHaveCount(0);
  // A second keydown while held and releasing Shift first must still produce
  // exactly one reverse filter step on F's release.
  await page.keyboard.down("KeyF");
  await page.keyboard.up("Shift");
  await page.keyboard.up("KeyF");
  await expect(toast).toContainText("Chroma");
  await page.keyboard.press("Escape");

  await page.keyboard.press("v");
  const viewer = page.locator("._scf_comp");
  await expect(viewer).toBeVisible();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("._scf_comp_label_item").nth(1)).toHaveCSS("opacity", "1");
  await page.keyboard.press("1");
  await expect(page.locator("._scf_comp_label_item").first()).toHaveCSS("opacity", "1");
  await expect(viewer).not.toHaveClass(/_scf_zoomed/);
  await viewer.dispatchEvent("wheel", { ctrlKey: true, deltaY: -100, composed: true });
  await expect(viewer).toHaveClass(/_scf_zoomed/);
  await expect(page.locator("#host-wheel")).toBeEmpty();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(keys).toBeEmpty();

  await page.keyboard.press("ArrowRight");
  await expect(keys).toHaveText("keydown:ArrowRight keyup:ArrowRight");
  await page.locator("body").dispatchEvent("wheel", { ctrlKey: true, deltaY: -100 });
  await expect(page.locator("#host-wheel")).toHaveText("zoom");
});

test("slow.pics shortcut priority follows rebindings and leaves typing alone", async ({ page }) => {
  await visit(page, { shortcuts: {
    "filter.prev": { main: { t: "key", code: "KeyZ" }, extra: { t: "key", code: "Digit0", ctrl: true } },
  } });
  const keys = page.locator("#host-keys");
  await page.keyboard.press("z");
  await expect(page.locator("#_scf_toast_")).toContainText("Chroma");
  await page.keyboard.press("Control+0");
  await expect(page.locator("#_scf_toast_")).toContainText("Luma");
  await expect(keys).toBeEmpty();
  await page.keyboard.press("Shift+KeyF");
  await expect(keys).toHaveText("keydown:KeyF keyup:KeyF");

  const input = page.getByLabel("Comment");
  await input.press("z");
  await expect(input).toHaveValue("z");
  await expect(keys).toContainText("keydown:KeyZ keyup:KeyZ");

  const select = page.getByLabel("Format");
  await select.press("f");
  await expect(select).toHaveValue("Film");
  await expect(page.locator("#_scf_toast_")).toContainText("Luma");
});

test("disabled slow.pics integration gives the site its keys", async ({ page }) => {
  await visit(page, { enabledSites: { slowpics: false } });
  await page.keyboard.press("Shift+KeyF");
  await page.keyboard.press("v");
  await expect(page.locator("#host-keys")).toHaveText("keydown:KeyF keyup:KeyF keydown:KeyV keyup:KeyV");
  await expect(page.locator("._scf_comp")).toHaveCount(0);
});

test("a held shortcut cannot act on a newly opened viewer", async ({ page }) => {
  await visit(page);
  const viewer = page.locator("._scf_comp");
  await page.keyboard.press("v");
  await page.keyboard.down("c"); // canvas fill toggles on release
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await page.keyboard.press("v");
  await expect(viewer).toBeVisible();
  await page.keyboard.up("c");
  await expect(viewer).not.toHaveClass(/_scf_fill_canvas/);

  // First Escape resets the adjustment. Holding it is still the same press.
  await page.keyboard.press("BracketRight");
  await page.keyboard.down("Escape");
  await page.keyboard.down("Escape");
  await page.keyboard.up("Escape");
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(viewer).toHaveCount(0);
  await expect(page.locator("#host-keys")).toBeEmpty();
});

test("a key started in a page field does not become a filter on repeat", async ({ page }) => {
  await visit(page);
  const input = page.getByLabel("Comment");
  await input.focus();
  await page.keyboard.down("f");
  await input.blur();
  await page.keyboard.down("f");
  await page.keyboard.up("f");
  await expect(page.locator("#host-keys")).toHaveText("keydown:KeyF keydown:KeyF keyup:KeyF");
  await expect(page.locator("#_scf_toast_")).toHaveCount(0);
});

test("settings text and shortcut recording stay within yacomp", async ({ page }) => {
  await visit(page, { ptpGridToggleStyle: "custom" });
  await page.getByRole("button", { name: "Userscript settings" }).click();
  const input = page.locator("._scf_settings_text").first();
  await input.fill("");
  await input.pressSequentially("fv");
  await expect(input).toHaveValue("fv");
  const binding = page.locator("._scf_shortcut_row", { hasText: "Actual size" }).locator("._scf_shortcut_btn").first();
  await binding.click();
  await page.keyboard.press("Shift+KeyF");
  await expect(page.locator("#_scf_toast_")).toContainText("Already bound");
  await expect(page.locator("#host-keys")).toBeEmpty();
});

test("Space activates viewer controls and Escape exits native fullscreen first", async ({ page }) => {
  await visit(page);
  await page.getByRole("button", { name: "Native fullscreen" }).click();
  const fullscreen = () => page.evaluate(() => !!document.fullscreenElement);
  await expect.poll(fullscreen).toBe(true);
  await page.keyboard.press("v");
  const viewer = page.locator("._scf_comp");
  await expect(viewer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect.poll(fullscreen).toBe(false);
  await expect(viewer).toBeVisible();
  await page.getByRole("button", { name: "Keyboard shortcuts" }).press("Space");
  await expect(page.locator("._scf_help_panel")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("._scf_help_panel")).toHaveCount(0);
  await expect(viewer).toBeVisible();
  await expect(page.locator("#host-keys")).toBeEmpty();
});
