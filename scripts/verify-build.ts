import { readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "..");
const outPath = join(root, "dist", "yacomp.user.js");

let content: string;
try {
  content = readFileSync(outPath, "utf-8");
} catch {
  console.error("✗ dist/yacomp.user.js not found — run `bun run build` first");
  process.exit(1);
}

const errors: string[] = [];

// 1. Must have userscript header
if (!content.includes("==UserScript==")) {
  errors.push("Missing ==UserScript== header");
}

// 2. Must be a reasonable size (> 10KB)
if (content.length < 10_000) {
  errors.push(`File too small (${content.length} bytes) — expected > 10KB`);
}

// 3. Must contain all key functions
const required = [
  "setupKeyboard", "setupHDBits", "setupPTP", "setupSlowPics",
  "buildComparison", "syncAll", "applyToImg", "resolveFilter",
  "buildFilter", "parseGrid", "getGrids", "injectCSS",
  "injectFilters", "showToast", "updateHUD", "detectCS",
  "findComparisonNames", "openWithDummyWrapper",
];
for (const fn of required) {
  if (!content.includes(fn)) {
    errors.push(`Missing expected function: ${fn}`);
  }
}

// 4. Must contain key CSS selectors
const selectors = ["._scf_comp", "._scf_comp_row", "._scf_nav_map", "._scf_row_nav"];
for (const sel of selectors) {
  if (!content.includes(sel)) {
    errors.push(`Missing expected CSS selector: ${sel}`);
  }
}

// 5. Version must be present (not the placeholder)
if (content.includes("__VERSION__")) {
  errors.push("Version placeholder __VERSION__ was not replaced");
}

if (errors.length) {
  console.error("✗ Build verification failed:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
} else {
  console.log(`✓ Build verified (${(content.length / 1024).toFixed(1)} KB, ${required.length} functions, ${selectors.length} selectors)`);
}
