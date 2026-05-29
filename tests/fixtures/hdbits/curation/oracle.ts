// Ground-truth oracle: renders a candidate case body in the real fixture
// chrome, runs the actual userscript parser in headless chromium, and
// reports the resulting grid count + per-grid source names. This is the
// same path the e2e suite uses, so its output is authoritative.
import { chromium, type Page } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";

const HDBITS_DIR = "tests/fixtures/hdbits";

async function bundleEntry(path: string): Promise<string> {
  const built = await Bun.build({ entrypoints: [path], format: "esm", target: "browser" });
  const [a] = built.outputs;
  if (!built.success || !a) {
    for (const l of built.logs) console.error(l);
    process.exit(1);
  }
  return await a.text();
}

const hdbitsJs = await bundleEntry(`${HDBITS_DIR}/test-entry.ts`);
const torrentTemplate = await Bun.file(`${HDBITS_DIR}/templates/torrent.html`).text();
const forumTemplate = await Bun.file(`${HDBITS_DIR}/templates/forum.html`).text();

const DEFAULT_TORRENT_TITLE = "Demo Movie 2025 1080p BluRay x264-DemoEncoder";
const DEFAULT_THREAD_TITLE = "Demo comparison thread";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function wrapInCommentRow(body: string): string {
  return `<tr><td><p class="sub"><a href="#" name="comm1">#1</a> by <i>Anonymous</i></p><table class="main" width="100%" border="1"><tbody><tr valign="top"><td align="center" width="150"><div class="default_avatar"></div></td><td class="text">${body}</td></tr></tbody></table></td></tr>`;
}
function wrapInPostRow(body: string): string {
  return `<a name="1"></a><table border="0"><tbody><tr><td class="embedded" width="99%"><a href="#1">#1</a> by DemoUser</td></tr></tbody></table><table class="main" width="100%" border="1"><tbody><tr valign="top"><td width="150" align="center"><div class="default_avatar"></div></td><td class="comment">${body}</td></tr></tbody></table>`;
}
function fillTemplate(t: string, vars: Record<string, string>): string {
  return t.replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? "");
}

interface Cand {
  id: string;
  slot: string;
  body: string;
  torrentTitle?: string;
  threadTitle?: string;
}

function render(c: Cand): string {
  const tt = escapeHtml(c.torrentTitle ?? DEFAULT_TORRENT_TITLE);
  const th = escapeHtml(c.threadTitle ?? DEFAULT_THREAD_TITLE);
  let html: string;
  if (c.slot === "torrent.description") {
    html = fillTemplate(torrentTemplate, { TORRENT_TITLE: tt, DESCRIPTION: c.body, COMMENTS: "" });
  } else if (c.slot === "torrent.comment") {
    html = fillTemplate(torrentTemplate, { TORRENT_TITLE: tt, DESCRIPTION: "<p>none</p>", COMMENTS: wrapInCommentRow(c.body) });
  } else {
    html = fillTemplate(forumTemplate, { THREAD_TITLE: th, POSTS: wrapInPostRow(c.body) });
  }
  return html.replace("</body>", `<script type="module">${hdbitsJs}</script></body>`);
}

const candidates: Cand[] = JSON.parse(readFileSync(process.argv[2], "utf-8"));
const rendered = candidates.map(render);

const server = Bun.serve({
  port: 0,
  fetch(req) {
    const i = Number(new URL(req.url).searchParams.get("i"));
    return new Response(rendered[i] ?? "bad", { headers: { "content-type": "text/html" } });
  },
});
const base = `http://127.0.0.1:${server.port}`;

const STUB = '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="90"><rect width="160" height="90" fill="#3a3a3a"/></svg>';

async function readNames(page: Page, idx: number): Promise<string[]> {
  const link = page.locator("._scf_comp_link").nth(idx);
  await link.scrollIntoViewIfNeeded();
  await link.click();
  const comp = page.locator("._scf_comp");
  await comp.waitFor({ state: "visible", timeout: 5000 });
  await page.keyboard.press("Digit1");
  const spans = page.locator("._scf_comp_label span");
  try {
    await spans.first().waitFor({ state: "visible", timeout: 2000 });
  } catch {
    /* no label */
  }
  const raw = await spans.allTextContents();
  const names = raw.map((t) => t.replace(/^\d+\.\s*/, "").trim()).filter(Boolean);
  await page.keyboard.press("Escape");
  await comp.waitFor({ state: "hidden", timeout: 5000 }).catch(() => {});
  return names;
}

const browser = await chromium.launch();
const ctx = await browser.newContext();
await ctx.route(/[ti]\.hdbits\.org/, (r) => r.fulfill({ contentType: "image/svg+xml", body: STUB }));
const page = await ctx.newPage();

const results: { id: string; grids: number; names: (string[] | null)[]; error?: string }[] = [];
for (let i = 0; i < candidates.length; i++) {
  const c = candidates[i];
  try {
    await page.goto(`${base}/?i=${i}`, { timeout: 15000 });
    await page.waitForFunction(
      () => (window as unknown as { __yacomp_test_ready?: boolean }).__yacomp_test_ready === true,
      undefined,
      { timeout: 8000 },
    );
    const grids = await page.locator("._scf_comp_link").count();
    const names: (string[] | null)[] = [];
    for (let g = 0; g < grids; g++) {
      try {
        names.push(await readNames(page, g));
      } catch {
        names.push(null);
      }
    }
    results.push({ id: c.id, grids, names });
  } catch (e) {
    results.push({ id: c.id, grids: -1, names: [], error: String(e).slice(0, 120) });
  }
  if ((i + 1) % 50 === 0) console.error(`...${i + 1}/${candidates.length}`);
}

await browser.close();
server.stop();
writeFileSync(process.argv[3], JSON.stringify(results, null, 2));
console.error(`done: ${results.length} results -> ${process.argv[3]}`);
