import { describe, test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  EXTERNAL_SCREENSHOT_HOST_RE,
  HDBITS_THUMB_RE,
  HDBITS_IMAGE_PAGE_RE,
  DIRECT_IMAGE_URL_RE,
  NON_SCREENSHOT_IMG_RE,
  isHDBitsThumbUrl,
  isHDBitsImagePageUrl,
  urlHost,
} from "../../src/grid/screenshot-urls";

// The screenshot-host set is shared between parser.ts (grid building) and
// names.ts (color-span column grouping). These tests lock the host set AND
// assert the two callers import it rather than re-declaring their own copy —
// the desync that would otherwise let a new host be detected for grids but not
// for column grouping (or vice-versa).

describe("EXTERNAL_SCREENSHOT_HOST_RE — the shared external screenshot host set", () => {
  const HOSTS = [
    "imgbox.com",
    "imagebam.com",
    "imgur.com",
    "gifyu.com",
    "pixhost.to",
    "postimg.cc",
    "ibb.co",
    "freeimage.host",
    "lensdump.com",
  ];

  for (const host of HOSTS) {
    test(`matches ${host}`, () => expect(EXTERNAL_SCREENSHOT_HOST_RE.test(host)).toBe(true));
    test(`matches a subdomain of ${host}`, () =>
      expect(EXTERNAL_SCREENSHOT_HOST_RE.test(`thumbs2.${host}`)).toBe(true));
  }

  // Anchoring must reject look-alikes: a different TLD, a host that merely
  // contains a known host, and a known host used as a deceptive subdomain.
  for (const negative of [
    "notimgbox.com",
    "imgbox.com.evil.com",
    "ibb.co.uk",
    "apixhost.to",
    "example.com",
    "hdbits.org",
    "",
  ]) {
    test(`rejects ${negative || "(empty)"}`, () =>
      expect(EXTERNAL_SCREENSHOT_HOST_RE.test(negative)).toBe(false));
  }
});

describe("hdbits + direct-image + flagcounter URL predicates", () => {
  test("hdbits thumb host", () => {
    expect(isHDBitsThumbUrl("https://t.hdbits.org/abc.jpg")).toBe(true);
    expect(HDBITS_THUMB_RE.test("https://i.hdbits.org/abc.png")).toBe(false);
  });
  test("hdbits image page host", () => {
    expect(isHDBitsImagePageUrl("https://img.hdbits.org/abc")).toBe(true);
    expect(HDBITS_IMAGE_PAGE_RE.test("https://t.hdbits.org/abc.jpg")).toBe(false);
  });
  test("direct image url accepts extensions and trailing query/hash", () => {
    expect(DIRECT_IMAGE_URL_RE.test("https://x.example/a.png")).toBe(true);
    expect(DIRECT_IMAGE_URL_RE.test("https://x.example/a.jpeg?cache=1")).toBe(true);
    expect(DIRECT_IMAGE_URL_RE.test("https://x.example/a.webp#frag")).toBe(true);
    expect(DIRECT_IMAGE_URL_RE.test("https://x.example/show/a")).toBe(false);
    expect(DIRECT_IMAGE_URL_RE.test("https://x.example/a.pngx")).toBe(false);
  });
  test("flagcounter banners are non-screenshots", () => {
    expect(NON_SCREENSHOT_IMG_RE.test("https://s11.flagcounter.com/count2/x.png")).toBe(true);
    expect(NON_SCREENSHOT_IMG_RE.test("https://t.hdbits.org/shot.jpg")).toBe(false);
  });
});

describe("urlHost resolves hostnames off-DOM (unit runtime has no location)", () => {
  test("absolute url keeps its true host", () =>
    expect(urlHost("https://images2.imgbox.com/aa/bb/x_o.png")).toBe("images2.imgbox.com"));
  test("a relative url resolves against the neutral fallback base, not the page", () =>
    // Off-DOM there is no location, so a relative smiley path resolves to the
    // fallback host — which simply fails the external-host test downstream.
    expect(urlHost("/pic/smilies/innocent.gif")).toBe("example.invalid"));
  test("garbage input never throws and yields a string", () => {
    expect(() => urlHost("http://[::::")).not.toThrow();
    expect(typeof urlHost("http://[::::")).toBe("string");
  });
});

describe("single source of truth: parser.ts and names.ts import the host set", () => {
  const read = (rel: string) => readFileSync(join(import.meta.dir, "../../src/grid", rel), "utf-8");

  for (const file of ["parser.ts", "names.ts"]) {
    test(`${file} imports EXTERNAL_SCREENSHOT_HOST_RE from ./screenshot-urls`, () => {
      const src = read(file);
      expect(src).toContain('from "./screenshot-urls"');
      expect(src).toContain("EXTERNAL_SCREENSHOT_HOST_RE");
    });
    test(`${file} does not re-declare the shared host/flagcounter regexes`, () => {
      const src = read(file);
      expect(src).not.toMatch(/^\s*const\s+EXTERNAL_SCREENSHOT_HOST_RE\s*=/m);
      expect(src).not.toMatch(/^\s*const\s+NON_SCREENSHOT_IMG_RE\s*=/m);
    });
  }
});
