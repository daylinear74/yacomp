// Dev/test server for the yacomp viewer fixture.
// Bundles fixture-entry.ts (which imports real src/ modules) and serves it to basic.html.

const PORT = 4173;
const FIXTURE_DIR = "tests/fixtures/viewer";

function gitInfo(): string {
  try {
    const r = Bun.spawnSync(["git", "describe", "--always", "--tags", "--dirty"]);
    return r.success ? r.stdout.toString().trim() : "";
  } catch {
    return "";
  }
}

const html = (await Bun.file(`${FIXTURE_DIR}/basic.html`).text())
  .replace("{{GIT_INFO}}", gitInfo());

const bundle = await Bun.build({
  entrypoints: [`${FIXTURE_DIR}/fixture-entry.ts`],
  format: "esm",
  target: "browser",
});
const [artifact] = bundle.outputs;
if (!bundle.success || !artifact) {
  console.error("Failed to bundle fixture-entry.ts:");
  for (const log of bundle.logs) console.error(log);
  process.exit(1);
}
const fixtureJs = await artifact.text();

const server = Bun.serve({
  port: PORT,
  fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === "/" || url.pathname.endsWith("basic.html")) {
      return new Response(html, { headers: { "content-type": "text/html" } });
    }
    if (url.pathname === "/fixture-entry.js") {
      return new Response(fixtureJs, {
        headers: { "content-type": "application/javascript" },
      });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Fixture server running at http://127.0.0.1:${server.port}`);

export {};
