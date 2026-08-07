import { readFileSync, writeFileSync } from "fs";
import { basename, dirname, join, relative } from "path";

const root = join(import.meta.dir, "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf-8"));
const outputArg = process.argv.find((arg) => arg.startsWith("--outfile="));
const outPath = join(root, outputArg?.slice("--outfile=".length) || "dist/yacomp.user.js");
const testTimestamp = /^yacomp-test-(\d{8}-\d{6})\.user\.js$/.exec(basename(outPath))?.[1];
const banner = readFileSync(join(root, "meta", "banner.txt"), "utf-8")
  .trimEnd()
  .replace("__VERSION__", pkg.version)
  .replace(
    /^\/\/ @name\s+(.+)$/m,
    (_match, name) => `// @name         ${name}${testTimestamp ? ` [${testTimestamp}]` : ""}`,
  );
const watch = process.argv.includes("--watch");

async function build() {
  const result = await Bun.build({
    entrypoints: [join(root, "src", "index.ts")],
    outdir: dirname(outPath),
    naming: basename(outPath),
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
  const bundled = readFileSync(outPath, "utf-8");
  writeFileSync(outPath, banner + "\n\n" + bundled);

  console.log(`✓ ${relative(root, outPath)} (${(bundled.length / 1024).toFixed(1)} KB)`);
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
