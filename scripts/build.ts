import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const banner = readFileSync(join(root, "meta", "banner.txt"), "utf-8")
  .trimEnd()
  .replace("__VERSION__", pkg.version);
const watch = process.argv.includes("--watch");

async function build() {
  const result = await Bun.build({
    entrypoints: [join(root, "src", "index.ts")],
    outdir: join(root, "dist"),
    naming: "yacomp.user.js",
    target: "browser",
    format: "iife",
    minify: false,
    sourcemap: "none",
  });

  if (!result.success) {
    console.error("Build failed:");
    for (const msg of result.logs) {
      console.error(msg);
    }
    process.exit(1);
  }

  // Prepend the userscript banner
  const outPath = join(root, "dist", "yacomp.user.js");
  const bundled = readFileSync(outPath, "utf-8");
  writeFileSync(outPath, banner + "\n\n" + bundled);

  console.log(`✓ dist/yacomp.user.js (${(bundled.length / 1024).toFixed(1)} KB)`);
}

if (watch) {
  const { watch: fsWatch } = await import("fs");
  console.log("Watching src/ for changes...");
  await build();
  fsWatch(join(root, "src"), { recursive: true }, async () => {
    try { await build(); } catch (e) { console.error(e); }
  });
} else {
  await build();
}
