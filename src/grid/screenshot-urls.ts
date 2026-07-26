// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Screenshot URL detection (shared source of truth)                        ║
// ╚═══════════════════════════════════════════════════════════════════════════╝
//
// The single home for "is this image URL a screenshot?" classification. Both the
// grid parser (parser.ts — grid building) and the name strategies (names.ts —
// color-span column grouping) decide which <img>s are real screenshots, and they
// MUST agree on the host set: a host added to only one copy would silently desync
// grid detection from title grouping. Keeping the regexes here keeps the HOST
// SET in one place; note the gates still differ by design — parser.ts accepts
// external hosts only on torrent pages (isExternalScreenshotImagePageUrl),
// while names.ts' color-span grouping applies them unconditionally.
//
// Dependency-free on purpose — parser.ts already imports names.ts, so a shared
// helper either of them imports must pull in neither to stay acyclic.

/** A thumbnail served from HDBits' own thumb CDN (t.hdbits.org). */
export const HDBITS_THUMB_RE = /\/\/t\.hdbits\.org\//i;

/** An HDBits image-detail page (img.hdbits.org/<id>) — the usual screenshot anchor. */
export const HDBITS_IMAGE_PAGE_RE = /\/\/img\.hdbits\.org\//i;

/** Hostnames of the external image hosts HDBits posters use for screenshots.
 *  Tested against a URL hostname; the `(?:^|\.)…$` anchors also accept subdomains. */
export const EXTERNAL_SCREENSHOT_HOST_RE =
  /(?:^|\.)((imgbox|imagebam|imgur|gifyu)\.com|pixhost\.to|postimg\.cc|ibb\.co|freeimage\.host|lensdump\.com)$/i;

/** A direct image URL — a path or full URL ending in a raster image extension. */
export const DIRECT_IMAGE_URL_RE = /\.(?:jpe?g|png|webp|gif|avif|bmp)(?:[?#]|$)/i;

/** A decorative non-screenshot image (a FlagCounter sig banner) — never a shot. */
export const NON_SCREENSHOT_IMG_RE = /(?:\/\/|\.)flagcounter\.com\//i;

export function isHDBitsThumbUrl(src: string): boolean {
  return HDBITS_THUMB_RE.test(src);
}

export function isHDBitsImagePageUrl(href: string): boolean {
  return HDBITS_IMAGE_PAGE_RE.test(href);
}

/** The hostname of `url`, resolved against the page (or a neutral base when run
 *  off-DOM, e.g. in unit tests). Empty string when unparseable. */
export function urlHost(url: string): string {
  try {
    const base = typeof location !== "undefined" ? location.href : "https://example.invalid/";
    return new URL(url, base).hostname;
  } catch {
    return "";
  }
}
