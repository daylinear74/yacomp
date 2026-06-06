import { describe, expect, test } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";

const root = join(import.meta.dir, "../..");

describe("userscript banner", () => {
  test("release name stays stable without local build suffixes", () => {
    const banner = readFileSync(join(root, "meta/banner.txt"), "utf-8");

    expect(banner).toContain("// @name         Yet Another Comparison Viewer\n");
    expect(banner).not.toContain("dev3");
  });
});
