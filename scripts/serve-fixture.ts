// Dev/test server for the yacomp fixtures.
//
// Serves two fixture suites under one port:
//
//   /              — viewer dev fixture (tests/fixtures/viewer/basic.html)
//   /hdbits/case/* — HDBits parser regression cases
//                    (tests/fixtures/hdbits/cases/*.html)
//
// Both pages mount real src/ modules: the viewer fixture loads
// fixture-entry.ts (which exercises the comparison viewer end-to-end),
// the HDBits pages load test-entry.ts (which calls setupHDBitsCore so
// the parser runs without a real hdbits.org host).

const PORT = 4173;
const VIEWER_DIR = "tests/fixtures/viewer";
const HDBITS_DIR = "tests/fixtures/hdbits";

const DEFAULT_TORRENT_TITLE = "Demo Movie 2025 1080p BluRay x264-DemoEncoder";
const DEFAULT_THREAD_TITLE = "Demo comparison thread";

function gitInfo(): string {
  try {
    const r = Bun.spawnSync(["git", "describe", "--always", "--tags", "--dirty"]);
    return r.success ? r.stdout.toString().trim() : "";
  } catch {
    return "";
  }
}

async function bundleEntry(path: string): Promise<string> {
  const built = await Bun.build({
    entrypoints: [path],
    format: "esm",
    target: "browser",
  });
  const [artifact] = built.outputs;
  if (!built.success || !artifact) {
    console.error(`Failed to bundle ${path}:`);
    for (const log of built.logs) console.error(log);
    process.exit(1);
  }
  return await artifact.text();
}

// ─── viewer fixture (existing) ──────────────────────────────────────────────

const viewerHtml = (await Bun.file(`${VIEWER_DIR}/basic.html`).text())
  .replace("{{GIT_INFO}}", gitInfo());
const viewerJs = await bundleEntry(`${VIEWER_DIR}/fixture-entry.ts`);

// ─── hdbits fixtures ────────────────────────────────────────────────────────

const hdbitsJs = await bundleEntry(`${HDBITS_DIR}/test-entry.ts`);
const torrentTemplate = await Bun.file(`${HDBITS_DIR}/templates/torrent.html`).text();
const forumTemplate = await Bun.file(`${HDBITS_DIR}/templates/forum.html`).text();

interface CaseMetadata {
  slot: "torrent.description" | "torrent.comment" | "forum.post";
  expectedGrids: number;
  expectedNames?: (string[] | null)[] | null;
  threadTitle?: string;
  torrentTitle?: string;
  notes?: string;
}

function parseCaseMetadata(content: string): CaseMetadata {
  const match = content.match(/^<!--([\s\S]*?)-->/);
  if (!match) throw new Error("missing metadata header comment");
  const meta: Record<string, unknown> = {};
  for (const rawLine of match[1].split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const colon = line.indexOf(":");
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim();
    const value = line.slice(colon + 1).trim();
    if (key === "slot") {
      meta.slot = value;
    } else if (key === "expected_grids") {
      const n = parseInt(value, 10);
      if (!Number.isFinite(n)) throw new Error(`expected_grids: not a number (${value})`);
      meta.expectedGrids = n;
    } else if (key === "expected_names") {
      try {
        meta.expectedNames = JSON.parse(value);
      } catch (e) {
        throw new Error(`expected_names: not valid JSON (${value})`);
      }
    } else if (key === "torrent_title") {
      meta.torrentTitle = value.replace(/^"|"$/g, "");
    } else if (key === "thread_title") {
      meta.threadTitle = value.replace(/^"|"$/g, "");
    } else if (key === "notes") {
      meta.notes = value;
    }
  }
  if (typeof meta.slot !== "string") throw new Error("metadata: missing 'slot'");
  if (typeof meta.expectedGrids !== "number") throw new Error("metadata: missing 'expected_grids'");
  return meta as unknown as CaseMetadata;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function wrapInCommentRow(body: string): string {
  return `
    <tr><td>
      <p class="sub"><a href="#" name="comm1">#1</a> by <i>Anonymous</i> (none) at 2025-01-01 12:00:00 [<a href="#">Quote</a>]</p>
      <table class="main" width="100%" border="1" cellspacing="0" cellpadding="5">
        <tbody><tr valign="top">
          <td align="center" width="150" style="padding: 0px"><div class="default_avatar"></div></td>
          <td class="text">${body}</td>
        </tr></tbody>
      </table>
    </td></tr>
  `;
}

function wrapInPostRow(body: string): string {
  return `
    <a name="1"></a>
    <table border="0" cellspacing="0" cellpadding="0" style="margin-top:8px;margin-bottom:10px;">
      <tbody><tr>
        <td class="embedded" width="99%"><a href="#1">#1</a> by DemoUser at 2025-01-01 12:00:00 [<a href="#">Quote</a>]</td>
      </tr></tbody>
    </table>
    <table class="main" width="100%" border="1" cellspacing="0" cellpadding="5">
      <tbody><tr valign="top">
        <td width="150" align="center" style="padding: 0px"><div class="default_avatar"></div></td>
        <td class="comment">${body}</td>
      </tr></tbody>
    </table>
  `;
}

function fillTemplate(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function injectTestEntry(html: string): string {
  return html.replace(
    "</body>",
    '<script type="module" src="/hdbits-test-entry.js"></script></body>',
  );
}

async function serveHdbitsCase(slug: string): Promise<Response> {
  const file = Bun.file(`${HDBITS_DIR}/cases/${slug}.html`);
  if (!(await file.exists())) {
    return new Response(`Case not found: ${slug}`, { status: 404 });
  }
  const raw = await file.text();
  let meta: CaseMetadata;
  try {
    meta = parseCaseMetadata(raw);
  } catch (e) {
    return new Response(`Bad metadata in ${slug}: ${(e as Error).message}`, { status: 500 });
  }
  const body = raw.replace(/^<!--[\s\S]*?-->/, "").trim();
  const torrentTitle = escapeHtml(meta.torrentTitle ?? DEFAULT_TORRENT_TITLE);
  const threadTitle = escapeHtml(meta.threadTitle ?? DEFAULT_THREAD_TITLE);

  let html: string;
  switch (meta.slot) {
    case "torrent.description":
      html = fillTemplate(torrentTemplate, {
        TORRENT_TITLE: torrentTitle,
        DESCRIPTION: body,
        COMMENTS: "",
      });
      break;
    case "torrent.comment":
      html = fillTemplate(torrentTemplate, {
        TORRENT_TITLE: torrentTitle,
        DESCRIPTION: "<p>Placeholder description with no comparisons.</p>",
        COMMENTS: wrapInCommentRow(body),
      });
      break;
    case "forum.post":
      html = fillTemplate(forumTemplate, {
        THREAD_TITLE: threadTitle,
        POSTS: wrapInPostRow(body),
      });
      break;
    default:
      return new Response(`Unknown slot: ${meta.slot}`, { status: 400 });
  }

  return new Response(injectTestEntry(html), {
    headers: { "content-type": "text/html" },
  });
}

// ─── server ─────────────────────────────────────────────────────────────────

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);

    if (url.pathname === "/" || url.pathname.endsWith("basic.html")) {
      return new Response(viewerHtml, { headers: { "content-type": "text/html" } });
    }
    if (url.pathname === "/fixture-entry.js") {
      return new Response(viewerJs, {
        headers: { "content-type": "application/javascript" },
      });
    }
    if (url.pathname === "/hdbits-test-entry.js") {
      return new Response(hdbitsJs, {
        headers: { "content-type": "application/javascript" },
      });
    }
    if (url.pathname.startsWith("/hdbits/case/")) {
      const slug = url.pathname.slice("/hdbits/case/".length);
      return await serveHdbitsCase(slug);
    }

    return new Response("Not found", { status: 404 });
  },
});

console.log(`Fixture server running at http://127.0.0.1:${server.port}`);

export {};
