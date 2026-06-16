// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Grid parsing                                                             ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

import type { GridCell, Grid } from "./types";
import {
  hasVsOrPipe, hasExplicitComparison, splitNames, looksLikeNames,
  findComparisonNames, namesFromLeadingStructuredLabels, namesFromColorSpans, namesFromHeadings, isOriginalPost,
  namesFromSiblingInfo, looksLikeProse, asColumnTitles,
  foldTrailingSize, isNonSourceLabel, isUrlLabel, isFooterLabel, tidyName, isMultiSourceLabel,
  stripAsymmetricTitle, isHDBitsRequestsMetadataElement,
} from "./names";
import {
  EXTERNAL_SCREENSHOT_HOST_RE, DIRECT_IMAGE_URL_RE, NON_SCREENSHOT_IMG_RE,
  isHDBitsThumbUrl, isHDBitsImagePageUrl,
} from "./screenshot-urls";
import { genericSourceNames } from "../util";

// Re-exported from names.ts (moved there so name strategies can guard with it).
export { looksLikeProse };

const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
] as const;

const MD5_K = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 2 ** 32) >>> 0);

function utf8Bytes(input: string): number[] {
  const bytes: number[] = [];
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code <= 0x7f) {
      bytes.push(code);
    } else if (code <= 0x7ff) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code <= 0xffff) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function rotateLeft32(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function md5WordHex(word: number): string {
  let out = "";
  for (let shift = 0; shift < 32; shift += 8) {
    out += ((word >>> shift) & 0xff).toString(16).padStart(2, "0");
  }
  return out;
}

function md5Hex(input: string): string {
  const bytes = utf8Bytes(input);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  for (let i = 0; i < 8; i++) bytes.push(Math.floor(bitLen / 2 ** (8 * i)) & 0xff);

  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;

  for (let offset = 0; offset < bytes.length; offset += 64) {
    const m: number[] = [];
    for (let i = 0; i < 16; i++) {
      const j = offset + i * 4;
      m[i] = (bytes[j] | (bytes[j + 1] << 8) | (bytes[j + 2] << 16) | (bytes[j + 3] << 24)) >>> 0;
    }

    let a = a0;
    let b = b0;
    let c = c0;
    let d = d0;
    for (let i = 0; i < 64; i++) {
      let f: number;
      let g: number;
      if (i < 16) {
        f = (b & c) | (~b & d);
        g = i;
      } else if (i < 32) {
        f = (d & b) | (~d & c);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        f = b ^ c ^ d;
        g = (3 * i + 5) % 16;
      } else {
        f = c ^ (b | ~d);
        g = (7 * i) % 16;
      }
      const nextD = c;
      const nextC = b;
      const nextB = (b + rotateLeft32((a + f + MD5_K[i] + m[g]) >>> 0, MD5_S[i])) >>> 0;
      a = d;
      b = nextB;
      c = nextC;
      d = nextD;
    }

    a0 = (a0 + a) >>> 0;
    b0 = (b0 + b) >>> 0;
    c0 = (c0 + c) >>> 0;
    d0 = (d0 + d) >>> 0;
  }

  return md5WordHex(a0) + md5WordHex(b0) + md5WordHex(c0) + md5WordHex(d0);
}

export function hdbFull(src: string): string {
  const imagePage = src.match(/^(https?:)?\/\/img\.hdbits\.org\/([^/?#]+)(?:[?#].*)?$/i);
  if (imagePage) return `${imagePage[1] ?? ""}//i.hdbits.org/${imagePage[2]}.png`;
  return src.replace(
    /\/\/t(\.hdbits\.org\/[^.?]+)\.jpg(\?.*)?$/i,
    "//i$1.png",
  );
}

export function externalImageFullUrl(src: string, href?: string | null): string {
  try {
    const base = typeof location === "undefined" ? "https://hdbits.org/" : location.href;
    const url = new URL(src, base);
    const imgboxHost = url.hostname.match(/^thumbs(\d*)\.imgbox\.com$/i);
    const imgboxPath = url.pathname.match(/^\/([0-9a-f]{2})\/([0-9a-f]{2})\/([^/]+)_t\.(jpe?g|png|gif)$/i);
    if (imgboxHost && imgboxPath) {
      const [, a, b, id, ext] = imgboxPath;
      return `${url.protocol}//images${imgboxHost[1]}.imgbox.com/${a}/${b}/${id}_o.${ext}`;
    }
    const pixhostHost = url.hostname.match(/^t(\d+)\.pixhost\.to$/i);
    const pixhostPath = url.pathname.match(/^\/thumbs\/(\d+)\/([^?#]+)$/i);
    if (pixhostHost && pixhostPath) {
      const [, shard] = pixhostHost;
      const [, folder, file] = pixhostPath;
      return `${url.protocol}//img${shard}.pixhost.to/images/${folder}/${file}`;
    }
    const imagebamHost = url.hostname.match(/^thumbs(\d*)\.imagebam\.com$/i);
    if (imagebamHost) {
      const imagebamPath = url.pathname.match(/^\/[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{2}\/([^/]+)_t\.(jpe?g|png|gif)$/i);
      if (imagebamPath) {
        const [, id, ext] = imagebamPath;
        const file = `${id}_o.${ext}`;
        const hash = md5Hex(file);
        return `${url.protocol}//images${imagebamHost[1]}.imagebam.com/${hash.slice(0, 2)}/${hash.slice(2, 4)}/${hash.slice(4, 6)}/${file}`;
      }
      return `${url.protocol}//images${imagebamHost[1]}.imagebam.com${url.pathname}`;
    }
  } catch {
    // Fall through to direct-image anchor handling below.
  }
  if (href && /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(href)) {
    try {
      const base = typeof location === "undefined" ? "https://hdbits.org/" : location.href;
      const url = new URL(href, base);
      if (!(url.hostname === "pixhost.to" && /^\/show\//i.test(url.pathname))) return href;
    } catch {
      return href;
    }
  }
  return src;
}

function isExternalScreenshotImagePageUrl(href: string): boolean {
  if (!isTorrentPage()) return false;
  try {
    const url = new URL(href, location.href);
    if (!/^https?:$/i.test(url.protocol)) return false;
    if (isHDBitsImagePageUrl(url.href)) return false;
    return EXTERNAL_SCREENSHOT_HOST_RE.test(url.hostname) ||
      DIRECT_IMAGE_URL_RE.test(url.pathname);
  } catch {
    return false;
  }
}

function hdbitsImageAnchor(img: HTMLImageElement): HTMLAnchorElement | null {
  const anchor = img.closest("a[href]") as HTMLAnchorElement | null;
  return anchor && isHDBitsImagePageUrl(anchor.href) ? anchor : null;
}

function externalScreenshotImageAnchor(img: HTMLImageElement): HTMLAnchorElement | null {
  const anchor = img.closest("a[href]") as HTMLAnchorElement | null;
  return anchor && isExternalScreenshotImagePageUrl(anchor.href) ? anchor : null;
}

function isHDBitsScreenshotImage(img: HTMLImageElement): boolean {
  if (isHDBitsRequestsMetadataElement(img)) return false;
  return isHDBitsThumbUrl(img.currentSrc || img.src) || !!hdbitsImageAnchor(img) || !!externalScreenshotImageAnchor(img);
}

function hasHDBitsScreenshotImage(container: Element): boolean {
  return [...container.querySelectorAll<HTMLImageElement>("img")].some(isHDBitsScreenshotImage);
}

function hdbitsFullForImage(img: HTMLImageElement, anchor: HTMLAnchorElement | null): string {
  const src = img.currentSrc || img.src;
  if (isHDBitsThumbUrl(src)) return hdbFull(src);
  if (anchor && isHDBitsImagePageUrl(anchor.href)) return hdbFull(anchor.href);
  return externalImageFullUrl(src, anchor?.href);
}

interface GroupsResult {
  groups: GridCell[][];
  groupLabels: (string | null)[];
  groupLabelEls: (ChildNode | null)[];
  groupLeadingBreaks: number[];
}

function collectTextLines(node: ChildNode, lines: string[]): void {
  if (node.nodeName === "BR") {
    lines.push("");
    return;
  }
  if (node.nodeType === 3) {
    const parts = (node.textContent || "").split(/\r?\n/);
    lines[lines.length - 1] += parts[0] ?? "";
    for (const part of parts.slice(1)) lines.push(part);
    return;
  }
  for (const child of node.childNodes) {
    collectTextLines(child, lines);
  }
}

function textAfterLastBreak(el: Element): string | null {
  const lines = [""];
  collectTextLines(el, lines);
  const nonEmpty = lines.map((line) => line.trim()).filter(Boolean);
  return nonEmpty[nonEmpty.length - 1] || null;
}

function labelTextFromNode(node: ChildNode): string | null {
  let t = node.nodeType === 1
    ? textAfterLastBreak(node as Element)
    : (node.textContent || "").trim();
  if (t && node.nodeType === 1 && (node as Element).matches("label.label_showhide")) {
    t = t.replace(/\s*\[(?:show|hide)\]\s*$/i, "");
  }
  // A forum quote attribution ("Username wrote:") is not a source label.
  if (t && isNonSourceLabel(t)) return null;
  return t ? t.replace(/:$/, "").trim() : null;
}

function isInlineLabelNode(node: ChildNode): boolean {
  if (node.nodeType === 3) return !/[\r\n]/.test(node.textContent || "");
  return /^(?:A|B|STRONG|SPAN|FONT|I|U|EM|SMALL)$/.test(node.nodeName);
}

function isExternalTextLink(anchor: HTMLAnchorElement): boolean {
  return !anchor.querySelector("img") && anchor.origin !== location.origin;
}

// Signature/tracker images embedded in a post (most commonly a FlagCounter
// banner in the user's sig or a hidden block) are NOT comparison screenshots.
// Counting them as grid cells throws off the column-count divisibility — e.g. a
// clean 60-image 5-wide grid + 1 FlagCounter image = 61, which divides by
// nothing — so they are excluded from group collection.
function isNonScreenshotImg(img: HTMLImageElement): boolean {
  return NON_SCREENSHOT_IMG_RE.test(img.src);
}

function screenshotImagesIn(container: Element): HTMLImageElement[] {
  return [...container.querySelectorAll("img")].filter((img) => !isNonScreenshotImg(img));
}

function hasUnclaimedScreenshotImage(container: Element, excludeImgs: Set<HTMLImageElement>): boolean {
  return screenshotImagesIn(container).some((img) => !excludeImgs.has(img));
}

function isShowhideTitleBarrier(el: Element): boolean {
  const label = el.matches("label.label_showhide")
    ? el
    : el.querySelector("label.label_showhide");
  const hidden = el.matches("div.div_showhide")
    ? el
    : el.querySelector("div.div_showhide");
  if (!label || !hidden || hasHDBitsScreenshotImage(hidden)) return false;

  const labelText = (label.textContent || "").replace(/\s*\[(?:show|hide)\]\s*/gi, " ").trim();
  const hiddenText = hidden.textContent || "";
  if (hidden.querySelector("pre, table, blockquote")) return true;
  if (/\b(?:logs?|eac3to|mediainfo|bdinfo|script)\b/i.test(labelText)) return true;
  return hiddenText.replace(/\s+/g, " ").trim().length > 500;
}

function isPreImageTitleBarrier(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const el = node as Element;
  if (hasHDBitsScreenshotImage(el)) return false;
  if (isShowhideTitleBarrier(el)) return true;
  if (/^(?:TABLE|BLOCKQUOTE|PRE|UL|OL|HR)$/.test(el.nodeName)) return true;
  if (el.matches("p.sub") && /\b(?:quote|wrote)\b/i.test(el.textContent || "")) return true;
  if ([...el.querySelectorAll("p.sub")].some((sub) => /\b(?:quote|wrote)\b/i.test(sub.textContent || ""))) {
    return true;
  }
  if (el.querySelector("table.main, blockquote, pre") && /\b(?:bdinfo|disc title|playlist|total bitrate)\b/i.test(el.textContent || "")) {
    return true;
  }
  return false;
}

function isPreImageBdInfoTitleBarrier(node: Node): boolean {
  if (node.nodeType !== 1) return false;
  const el = node as Element;
  if (hasHDBitsScreenshotImage(el)) return false;
  const text = el.textContent || "";
  if (!/\b(?:bdinfo|disc title|disc label|playlist|total bitrate|MPLS|AACS)\b/i.test(text)) {
    return false;
  }
  return (
    /^(?:TABLE|BLOCKQUOTE)$/.test(el.nodeName) ||
    !!el.querySelector("table.main, blockquote") ||
    [...el.querySelectorAll("p.sub")].some((sub) => /\b(?:quote|wrote)\b/i.test(sub.textContent || ""))
  );
}

function enforcesTorrentTitleDistance(container: Element): boolean {
  return isTorrentPage() && isTorrentDescriptionContainer(container);
}

function hasBlockedComparisonSignalBeforeImages(container: Element): boolean {
  if (!enforcesTorrentTitleDistance(container)) return false;
  for (const node of container.childNodes) {
    if (node.nodeType === 8) continue;
    if (node.nodeName === "IMG") {
      const img = node as HTMLImageElement;
      if (isHDBitsScreenshotImage(img)) break;
      continue;
    }
    if (node.nodeName === "A" && hasHDBitsScreenshotImage(node as Element)) break;
    if (node.nodeType === 1 && hasHDBitsScreenshotImage(node as Element)) break;
    if (!isPreImageTitleBarrier(node)) continue;
    const text = node.textContent || "";
    if (/\bvs?\.?\b|\||slow\.pics/i.test(text)) return true;
  }
  return false;
}

function hasPreImageTitleBarrierBeforeFirstScreenshot(container: Element): boolean {
  if (!enforcesTorrentTitleDistance(container)) return false;
  for (const node of container.childNodes) {
    if (node.nodeType === 8) continue;
    if (node.nodeName === "IMG") {
      const img = node as HTMLImageElement;
      if (isHDBitsScreenshotImage(img)) break;
      continue;
    }
    if (node.nodeName === "A" && hasHDBitsScreenshotImage(node as Element)) break;
    if (node.nodeType === 1 && hasHDBitsScreenshotImage(node as Element)) break;
    if (isPreImageTitleBarrier(node)) return true;
  }
  return false;
}

function previousMeaningfulSibling(node: Node): Node | null {
  for (let previous = node.previousSibling; previous; previous = previous.previousSibling) {
    if (previous.nodeType === 8) continue;
    if (previous.nodeType === 3 && !(previous.textContent || "").trim()) continue;
    if (previous.nodeName === "BR") continue;
    return previous;
  }
  return null;
}

function hasImmediatePriorTitleBarrier(container: Element, groups: GridCell[][]): boolean {
  if (!enforcesTorrentTitleDistance(container)) return false;
  if (hasUsableColumnTitleBeforeFirstScreenshot(container, groups)) return false;
  const previous = previousMeaningfulSibling(container);
  return !!previous && isPreImageBdInfoTitleBarrier(previous);
}

function clearPendingLabel(): {
  pendingLabel: null;
  pendingLabelEl: null;
  pendingLabelInline: false;
  pendingWideInlineGap: false;
} {
  return {
    pendingLabel: null,
    pendingLabelEl: null,
    pendingLabelInline: false,
    pendingWideInlineGap: false,
  };
}

function showhideLabelElement(container: Element): Element | null {
  for (const child of container.children) {
    if (child.matches("label.label_showhide")) return child;
  }
  const hidden = container.closest("div.div_showhide");
  const label = hidden?.previousElementSibling;
  return label?.matches("label.label_showhide") ? label : null;
}

function showhideLabelText(container: Element): string | null {
  const label = showhideLabelElement(container);
  const text = label?.textContent?.replace(/\s*\[(?:show|hide)\]\s*/gi, " ").replace(/\s+/g, " ").trim();
  return text || null;
}

function directShowhideColumnTitle(container: Element): { label: string; el: Element } | null {
  const labelEl = showhideLabelElement(container);
  const label = labelEl?.textContent?.replace(/\s*\[(?:show|hide)\]\s*/gi, " ").trim();
  if (labelEl && label && asColumnTitles(label)) return { label, el: labelEl };
  return null;
}

/** Walk container's childNodes, collecting BR-separated image groups with labels.
 *  Images in `excludeImgs` (already claimed by an inner container's grid) are
 *  skipped, so an enclosing container's parse doesn't re-emit them. */
function collectGroups(container: Element, excludeImgs: Set<HTMLImageElement>): GroupsResult | null {
  const groups: GridCell[][] = [];
  const groupLabels: (string | null)[] = [];
  const groupLabelEls: (ChildNode | null)[] = [];
  const groupLeadingBreaks: number[] = [];
  let group: GridCell[] = [];
  let pendingLabel: string | null = null;
  let pendingLabelEl: ChildNode | null = null;
  // A source label can be split across sibling nodes on one line — most often a
  // release name in <strong> followed by " - AC3 5.1 - 1.06 GiB" as plain text.
  // Accumulate consecutive label nodes on the same line; a <br> ends the line so
  // the next line REPLACES the label (last line before the images wins).
  let lineBroken = true;
  let pendingLabelInline = false;
  let pendingWideInlineGap = false;
  let breaksSinceLastGroup = 0;
  let currentGroupLeadingBreaks = 0;
  const splitTextNodeBreaks = enforcesTorrentTitleDistance(container) && !!container.closest("pre");

  const finishLineBreak = (): void => {
    if (group.length) {
      groups.push(group);
      groupLabels.push(pendingLabel);
      groupLabelEls.push(pendingLabelEl);
      groupLeadingBreaks.push(currentGroupLeadingBreaks);
      group = [];
      pendingLabel = null;
      pendingLabelEl = null;
      pendingLabelInline = false;
      currentGroupLeadingBreaks = 0;
      breaksSinceLastGroup = 1;
    } else {
      breaksSinceLastGroup++;
    }
    lineBroken = true;
    pendingWideInlineGap = false;
  };

  const absorbLabelText = (node: ChildNode, rawText: string, textNodeHasBreak = false): void => {
    const t = node.nodeType === 3
      ? rawText.trim()
      : labelTextFromNode(node);
    if (t) breaksSinceLastGroup = 0;
    const label = t && !isNonSourceLabel(t) ? t.replace(/:$/, "").trim() : null;
    if (label) {
      // Accumulate one inline label line that is split across sibling nodes,
      // including nested bold snippets inside a parenthetical release note.
      const accumulate =
        !!pendingLabel && !lineBroken && pendingLabelInline && isInlineLabelNode(node);
      if (accumulate) {
        const gap = pendingWideInlineGap ? "   " : " ";
        pendingLabel = `${pendingLabel}${gap}${label}`.replace(/\s+([),.:;!?])/g, "$1");
      } else {
        pendingLabel = label;
        pendingLabelEl = node;
        pendingLabelInline = isInlineLabelNode(node);
      }
      pendingWideInlineGap = false;
      lineBroken = false;
    } else if (
      pendingLabel &&
      !lineBroken &&
      pendingLabelInline &&
      node.nodeType === 3 &&
      !textNodeHasBreak &&
      /^[\s\u00a0]+$/.test(rawText) &&
      /(?:\u00a0| {3,}|\t)/.test(rawText)
    ) {
      pendingWideInlineGap = true;
    }
  };

  const visit = (node: ChildNode): void => {
    if (node.nodeName === "BR") {
      finishLineBreak();
    } else if (splitTextNodeBreaks && node.nodeType === 3 && /[\r\n]/.test(node.textContent || "")) {
      const parts = (node.textContent || "").split(/\r?\n/);
      for (let i = 0; i < parts.length; i++) {
        if (i > 0) finishLineBreak();
        if (!group.length && parts[i]) absorbLabelText(node, parts[i], true);
      }
    } else if (node.nodeName === "A") {
      const anchor = node as HTMLAnchorElement;
      const img = anchor.querySelector("img") as HTMLImageElement | null;
      if (img && !excludeImgs.has(img) && !isNonScreenshotImg(img)) {
        if (!group.length) {
          currentGroupLeadingBreaks = breaksSinceLastGroup;
          breaksSinceLastGroup = 0;
        }
        const full = isHDBitsScreenshotImage(img)
          ? hdbitsFullForImage(img, anchor)
          : /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(anchor.href)
            ? anchor.href
            : img.src;
        group.push({ thumb: img.src, full, a: anchor, img });
      } else if (!group.length && isExternalTextLink(anchor)) {
        // A heading followed by an external comparison URL describes that
        // linked comparison, not arbitrary inline screenshots that follow it.
        pendingLabel = null;
        pendingLabelEl = null;
        pendingLabelInline = false;
        pendingWideInlineGap = false;
      }
    } else if (node.nodeType === 1 && (node as Element).querySelector("img")) {
      const el = node as Element;
      if (hasUnclaimedScreenshotImage(el, excludeImgs)) {
        for (const child of el.childNodes) visit(child);
      } else if (!group.length) {
        const title = directShowhideColumnTitle(el);
        if (title) {
          pendingLabel = title.label;
          pendingLabelEl = title.el;
          pendingLabelInline = true;
          pendingWideInlineGap = false;
          lineBroken = false;
        }
      }
    } else if (
      !group.length &&
      pendingLabel &&
      enforcesTorrentTitleDistance(container) &&
      isPreImageTitleBarrier(node)
    ) {
      ({ pendingLabel, pendingLabelEl, pendingLabelInline, pendingWideInlineGap } = clearPendingLabel());
      lineBroken = true;
    } else if (!group.length && node.nodeName !== "TABLE") {
      // Technical-information tables such as BDInfo contain slash-delimited
      // codec metadata; their last line is not a label for later screenshots.
      const rawText = node.nodeType === 3 ? node.textContent || "" : "";
      absorbLabelText(node, rawText);
    }
  };

  for (const node of container.childNodes) {
    visit(node);
  }
  if (group.length) {
    groups.push(group);
    groupLabels.push(pendingLabel);
    groupLabelEls.push(pendingLabelEl);
    groupLeadingBreaks.push(currentGroupLeadingBreaks);
  }
  if (!groups.length) return null;
  const allImages = groups.flat();
  if (allImages.length < 2) return null;
  return { groups, groupLabels, groupLabelEls, groupLeadingBreaks };
}

/** When groups carry their own "X vs Y" / "X | Y" labels, each becomes its own
 *  grid. Only an explicit vs/pipe separator counts — a dash/comma in a label is
 *  treated as part of one source name (e.g. "release - AC3 5.1 - 1.06 GiB"),
 *  so such per-group labels stay as single columns of one transposed grid. */
function buildMultiCompGrids(
  container: Element,
  groups: GridCell[][],
  groupLabels: (string | null)[],
  groupLabelEls: (ChildNode | null)[],
  allowSingleLateFallback = true,
): Grid[] | null {
  const labeledGroups = groupLabels
    .map((label, index) => ({ label, index }))
    .map((g) => g.label ? { ...g, names: asColumnTitles(g.label) } : { ...g, names: null })
    .filter((g): g is { label: string; index: number; names: string[] | null } =>
      !!g.label &&
      hasVsOrPipe(g.label) &&
      !isStructuralReleaseTitleLabel(g.label));
  if (!labeledGroups.length) return null;
  if (groups.length > 1 && labeledGroups.length === 1 && labeledGroups[0].index === 0) return null;
  // Single-comparison-as-per-source-groups shape: EVERY group has its own
  // label and NONE uses an explicit vs/|/ ÷ separator (the labels are single
  // source names, often "release - AC3 5.1 - size"). That is one comparison
  // with a group per source, not several comparisons — defer to the transpose
  // path so the per-group labels become the columns of a single grid.
  if (
    groups.length >= 2 &&
    labeledGroups.length === groups.length &&
    !labeledGroups.some((g) => hasExplicitComparison(g.label))
  ) {
    return null;
  }

  const results: Grid[] = [];
  for (let i = 0; i < labeledGroups.length; i++) {
    const { index, names } = labeledGroups[i];
    const nextIndex = labeledGroups[i + 1]?.index ?? groups.length;
    const sectionGroups = groups.slice(index, nextIndex);
    const imgs = sectionGroups.flat();
    if (imgs.length < 2) continue;
    if (!names) continue;
    if (hasPlainInterludeAfterTechnicalSizeNames(container, names)) continue;

    const shaped = reshapeGrid(sectionGroups, imgs, names);
    if (!shaped) continue;
    results.push({
      rows: shaped.gridRows,
      numCols: shaped.numCols,
      names: finalizeNames(names),
      anchorEl: groupLabelEls[index],
    });
  }
  if (results.length) return results;

  const singleValid = labeledGroups.filter((g) => g.names);
  if (allowSingleLateFallback && singleValid.length === 1 && singleValid[0].index > 0) {
    const { index, names } = singleValid[0];
    const sectionGroups = groups.slice(index);
    const imgs = sectionGroups.flat();
    if (names && imgs.length >= 2 && !hasPlainInterludeAfterTechnicalSizeNames(container, names)) {
      const shaped = reshapeGrid(sectionGroups, imgs, names);
      if (shaped) {
        return [{
          rows: shaped.gridRows,
          numCols: shaped.numCols,
          names,
          anchorEl: groupLabelEls[index],
        }];
      }
    }
  }

  return null;
}

function buildLeadingComparisonBeforeFooterGrid(
  container: Element,
  groups: GridCell[][],
  groupLabels: (string | null)[],
  groupLabelEls: (ChildNode | null)[],
  leadCmp?: { names: string[]; anchorEl: ChildNode | null; reliable: boolean } | null,
): Grid[] | null {
  if (!enforcesTorrentTitleDistance(container)) return null;
  let startIndex = groupLabels.findIndex((label) => !!label && !!asColumnTitles(label));
  let names = startIndex >= 0 ? asColumnTitles(groupLabels[startIndex] || "") : null;
  let anchorEl = startIndex >= 0 ? groupLabelEls[startIndex] : null;

  if (names && !hasExplicitComparison(groupLabels[startIndex] || "")) return null;
  if (!names && leadCmp?.reliable) {
    startIndex = 0;
    names = leadCmp.names;
    anchorEl = leadCmp.anchorEl;
  }
  if (!names) {
    const bold = leadingBoldLabelInfo(container);
    if (bold) {
      startIndex = 0;
      names = bold.names;
      anchorEl = bold.anchorEl;
    }
  }
  if (!names) return null;
  const footerIndex = groupLabels.findIndex((label, index) =>
    index > startIndex && !!label && isFooterLabel(label));
  let endIndex = footerIndex;
  if (endIndex <= startIndex) {
    endIndex = startIndex;
    while (endIndex < groups.length && groups[endIndex].length === names.length) endIndex++;
    if (endIndex - startIndex < 2 || endIndex >= groups.length) return null;
    if (!hasFooterLabelBetweenGroups(groups, endIndex)) return null;
  }

  const sectionGroups = groups.slice(startIndex, endIndex);
  const imgs = sectionGroups.flat();
  if (imgs.length < names.length || imgs.length % names.length !== 0) return null;
  const shaped = reshapeGrid(sectionGroups, imgs, names);
  if (!shaped) return null;
  return [{
    rows: shaped.gridRows,
    numCols: shaped.numCols,
    names: finalizeNames(names),
    anchorEl,
  }];
}

function hasFooterLabelBetweenGroups(groups: GridCell[][], endIndex: number): boolean {
  const prev = groups[endIndex - 1]?.at(-1);
  const next = groups[endIndex]?.[0];
  const from = prev?.a ?? prev?.img;
  const to = next?.a ?? next?.img;
  if (!from || !to) return false;
  try {
    const range = document.createRange();
    range.setStartAfter(from);
    range.setEndBefore(to);
    const text = range.toString().replace(/\s+/g, " ").trim();
    return !!text && isFooterLabel(text);
  } catch {
    return false;
  }
}

function singleGroupLabelInfo(groupLabels: (string | null)[], groupLabelEls: (ChildNode | null)[]): { names: string[]; anchorEl: ChildNode | null } | null {
  const labels = groupLabels
    .map((label, index) => ({ label, index }))
    .map((g) => g.label ? { ...g, names: asColumnTitles(g.label) } : { ...g, names: null })
    .filter((g): g is { label: string; index: number; names: string[] } =>
      !!g.label && !!g.names && !isStructuralReleaseTitleLabel(g.label));
  if (labels.length !== 1) return null;
  return { names: labels[0].names, anchorEl: groupLabelEls[labels[0].index] };
}

/** Final pass on a grid's names: drop a name set that is entirely bare numbers
 *  (frame/set indices like ["2","3","6"…] mis-read as sources — show the grid
 *  with no labels instead), otherwise tidy each name. */
function finalizeNames(names: string[] | null): string[] | null {
  if (!names || !names.length) return names;
  if (names.every((n) => /^\d+$/.test(n.trim()))) return null;
  return names.map((name, index) =>
    tidyName(index > 0 ? name.replace(/^\s*v(?:s\.?|\.)\s+/i, "") : name));
}

function cleanPerSourceGroupLabel(label: string, stripIncidentalNotes = false): string {
  let cleaned = foldTrailingSize(label).replace(/^\s*\|\s*/, "");
  if (stripIncidentalNotes) {
    cleaned = cleaned
      .replace(/\s*@User\b/gi, "")
      .replace(/\s*-\s*video size\s*:.*$/i, "")
      .replace(/\s*-\s*nuked\b.*$/i, "");
  }
  cleaned = cleaned.trim();
  const terminalSource = cleaned.match(/\(\d{4}\)\s+(?:[A-Z]{2,4}\s+)?(?:blu-?ray|bd|uhd|dvd|hd-?dvd|web-?dl|webrip|hdtv|remux)\b.*$/i);
  if (terminalSource && looksLikeProse([cleaned])) return tidyName(terminalSource[0]);
  return cleaned;
}

function cleanPerSourceGroupLabels(labels: string[]): string[] {
  const stripIncidentalNotes = labels.some((label) => /\s-\s*nuked\b/i.test(label));
  return labels.map((label) => cleanPerSourceGroupLabel(label, stripIncidentalNotes));
}

function leadingBoldLabelInfo(container: Element): { names: string[]; anchorEl: Element } | null {
  const bolds: Element[] = [];
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (isPreImageTitleBarrier(node)) return null;
    if (node.nodeName === "STRONG" || node.nodeName === "B") {
      const t = node.textContent!.trim();
      if (t && !isNonSourceLabel(t)) bolds.push(node as Element);
    }
  }
  if (bolds.length < 2) return null;
  const names = bolds.map((b) => b.textContent!.trim()).filter(Boolean);
  if (!looksLikeNames(names)) return null;
  return { names, anchorEl: bolds[bolds.length - 1] };
}

/** A single leading element whose text itself carries a vs/pipe split,
 *  e.g. "US (…) vs FRE (…) vs JPN (…)". This is a genuine local comparison
 *  label even when it sits among non-source labels (e.g. "Short description:"
 *  or a trailing comparison URL) that suppressed the structured-label path.
 *  The label is matched on any wrapping element (strong, font, span, div…),
 *  not just a bare <strong>, so font/span-wrapped headings are still caught. */
const VS_LABEL_WRAPPER = new Set(["STRONG", "B", "FONT", "SPAN", "U", "I", "EM"]);
function leadingVsLabelInfo(container: Element): { names: string[]; anchorEl: Element } | null {
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.querySelector("img")) break;
    if (isPreImageTitleBarrier(el)) return null;
    // Only a bold-ish inline heading qualifies — never a TABLE/P/DIV block
    // (e.g. a comma-laden BDInfo table would otherwise split into junk).
    if (!VS_LABEL_WRAPPER.has(el.nodeName)) continue;
    const isBold = el.nodeName === "STRONG" || el.nodeName === "B" || !!el.querySelector("strong, b");
    if (!isBold) continue;
    // A heading is a SINGLE line. A br-laden bold block is a special-features /
    // notes list, and treating it as a title lets columnTitleCandidateText pluck
    // an arbitrary comma line out of it ("In Memoriam - …, including …").
    // Multi-line vs-titles are leadingComparisonNames' job, with its distance
    // and barrier rules.
    if (el.querySelector("br")) continue;
    const text = el.textContent!.trim();
    if (isStructuralReleaseTitleLabel(text)) continue;
    const names = asColumnTitles(text);
    if (names) return { names, anchorEl: el };
  }
  return null;
}

function leadingDetailsLinkLabelInfo(
  container: Element,
  groups: GridCell[][],
): { names: string[] | null; anchorEl: Element | null } | null {
  const expectedCount = stableGridColumnCount(groups) ?? groups[0]?.length ?? null;
  if (!expectedCount || expectedCount < 2) return null;

  type Line = { text: string; anchors: HTMLAnchorElement[]; anchorEl: Element | null };
  const lines: Line[] = [{ text: "", anchors: [], anchorEl: null }];
  const current = (): Line => lines[lines.length - 1];
  const pushLine = (): void => {
    if (current().text.trim() || current().anchors.length) {
      lines.push({ text: "", anchors: [], anchorEl: null });
    }
  };
  const addDetailsAnchors = (node: Element): void => {
    const anchors = node.matches("a[href*='details.php']")
      ? [node as HTMLAnchorElement]
      : [...node.querySelectorAll<HTMLAnchorElement>("a[href*='details.php']")];
    for (const anchor of anchors) {
      if (anchor.querySelector("img")) continue;
      current().anchors.push(anchor);
      current().anchorEl = anchor;
    }
  };

  for (const node of container.childNodes) {
    if (node.nodeType === 8) continue;
    if (node.nodeName === "BR") {
      pushLine();
      continue;
    }
    if (node.nodeType === 1) {
      const el = node as Element;
      if (el.matches("a") && hasHDBitsScreenshotImage(el)) break;
      if (hasHDBitsScreenshotImage(el)) break;
      addDetailsAnchors(el);
      current().text += el.textContent || "";
      if (/^(?:DIV|P|PRE|TABLE|BLOCKQUOTE|UL|OL)$/.test(el.nodeName)) pushLine();
      continue;
    }
    current().text += node.textContent || "";
  }

  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    if (line.anchors.length !== expectedCount) continue;
    const hasExplicitDetailsComparison = /\bvs?\.?\b|\|/i.test(line.text);
    const fullLineNames = asColumnTitles(line.text);
    if (hasExplicitDetailsComparison && fullLineNames?.length === expectedCount) {
      return { names: fullLineNames, anchorEl: line.anchorEl };
    }
    const names = line.anchors
      .map((anchor) => tidyName(anchor.textContent || ""))
      .filter((name) => name && !isUrlLabel(name));
    const hasOnlyBareLinkLabels = !/[,:;]|\bvs?\.?\b|\|/i.test(line.text);
    if (hasOnlyBareLinkLabels && names.length === expectedCount && looksLikeNames(names)) {
      return { names, anchorEl: line.anchorEl };
    }
    if (hasExplicitDetailsComparison) {
      return { names: null, anchorEl: line.anchorEl };
    }
  }
  return null;
}

// Per project ruling, ONLY an explicit "vs" / "vs." / "v." / "|" separator gives
// a leading line title-precedence. A slash, comma, dash or "×" does NOT — those
// routinely appear inside BDInfo codec lines, byte counts, release titles and
// prose. Dash-only headings are handled by the narrower previous-sibling title
// path when they sit directly above the screenshot block.
const VS_BAR_RE = /\bvs?\.\s|\bvs\s|\||[<>]{2,}|\s~\s/i;
// A continuation line of a multi-line vs-list, e.g. "DE (…) vs. KR (…)<br>vs. US (…)".
const VS_CONTINUATION_RE = /^\s*(?:vs?\.|\|)\s/i;

/** True when a split "name" is really prose — a paragraph that merely MENTIONS a
 *  comparison ("UK vs. DE: There are lots of parts of the film… on DE. For
 *  reference…"), not a title. A real source name is short and tokenised; a
 *  sentence boundary (".", "!", "?" then a capitalised word) or an absurd length
 *  marks prose. Long release names ("…7.1 (33454 kbps) (with NGU Sharp)") have
 *  no sentence boundary, so they pass. */
/** Highest-precedence label source: a leading line (before the first screenshot)
 *  that carries an explicit "vs"/"v."/"|" separator. Per project ruling, such a
 *  line always wins over per-group comma labels and NOTE:/nb: preamble prose. It
 *  captures hyperlinked source names (1202: "<a>JP (Pony Canyon)…</a> vs. <a>UK
 *  (Anime Ltd)…</a>"), inline-wrapped headings (0478: "<strong>Source vs
 *  encode</strong>"), and vs-lists split across <br> lines (2022: "DE … vs.
 *  KR …<br>vs. US …"). */
function leadingComparisonNames(container: Element): { names: string[]; anchorEl: ChildNode | null; reliable: boolean } | null {
  type Line = { text: string; el: ChildNode | null; external: boolean; barrier: boolean };
  const mk = (): Line => ({ text: "", el: null, external: false, barrier: false });
  const raw: Line[] = [mk()];
  const enforceDistance = enforcesTorrentTitleDistance(container);
  for (const node of container.childNodes) {
    if (node.nodeType === 8) continue;
    if (node.nodeName === "BR") { raw.push(mk()); continue; }
    if (node.nodeName === "IMG") {
      const img = node as HTMLImageElement;
      if (isHDBitsScreenshotImage(img)) break;
      continue;
    }
    if (node.nodeName === "A" && hasHDBitsScreenshotImage(node as Element)) break;
    if (node.nodeType === 1 && hasHDBitsScreenshotImage(node as Element)) break;
    const cur = raw[raw.length - 1];
    if (node.nodeName === "A") {
      const at = (node.textContent || "").trim();
      // A "see it here" pointer whose text is a footer label ("Slow.pics")
      // means the heading's screenshots live at that EXTERNAL comparison (007) —
      // mark the line so it can't supply inline titles. A BARE URL ("( Outside
      // link: https://slow.pics/c/… )") is just a mirror aside, NOT an external
      // boundary — skip its text but still let the local vs-line win (2503). A
      // hyperlinked source NAME ("<a>JP (Pony Canyon) AVC…</a>") contributes.
      if (isFooterLabel(at)) { cur.external = true; continue; }
      if (isUrlLabel(at)) continue;
    }
    if (
      node.nodeType === 1 &&
      VS_LABEL_WRAPPER.has(node.nodeName) &&
      (node as Element).querySelector("br")
    ) {
      const splitLines = [""];
      collectTextLines(node, splitLines);
      for (let j = 0; j < splitLines.length; j++) {
        if (j > 0) raw.push(mk());
        raw[raw.length - 1].text += splitLines[j];
        raw[raw.length - 1].el = node;
      }
      continue;
    }
    if (enforceDistance && isPreImageTitleBarrier(node)) raw[raw.length - 1].barrier = true;
    cur.text += node.textContent || "";
    // Anchor the "Show comparison" link to the LAST element of the heading line
    // (e.g. the trailing "US" source), so it is inserted AFTER the whole title
    // rather than splitting it ("GER [link] vs US" — 74778).
    if (node.nodeType === 1) cur.el = node;
    // A block element ends the line (its siblings start a new one).
    if (node.nodeType === 1 && /^(?:DIV|P|PRE|TABLE|BLOCKQUOTE|UL|OL)$/.test(node.nodeName)) {
      raw.push(mk());
    }
  }
  // Merge a continuation line ("vs. US …") into the line it continues.
  const lines: Line[] = [];
  for (const ln of raw) {
    const text = ln.text.trim();
    const prevText = lines[lines.length - 1]?.text.trim() ?? "";
    if (lines.length && text && (VS_CONTINUATION_RE.test(ln.text) || /\bv(?:s\.?|\.)\s*$/i.test(prevText))) {
      lines[lines.length - 1].text += ` ${ln.text.trim()}`;
      lines[lines.length - 1].external ||= ln.external;
      lines[lines.length - 1].barrier ||= ln.barrier;
      // Anchor on the LAST element of the merged heading (the trailing source),
      // so the "Show comparison" link follows the whole title (74778).
      if (ln.el) lines[lines.length - 1].el = ln.el;
    } else {
      lines.push({ ...ln });
    }
  }
  // Nearest-to-images line wins among explicit vs/v./| lines. A vs-heading is
  // disqualified when an external comparison link ("Slow.pics") sits BETWEEN it
  // and the screenshots — those screenshots belong to that external comparison
  // (007), not to this heading.
  let sawExternalAfter = false;
  let sawBarrierAfter = false;
  let interludeLinesAfter = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].external) { sawExternalAfter = true; continue; }
    if (lines[i].barrier) { sawBarrierAfter = true; continue; }
    if (sawExternalAfter || sawBarrierAfter) continue;
    // Drop a showhide affordance marker ("Source vs Encode [show]" → "… Encode").
    const t = lines[i].text.replace(/\s*\[(?:show|hide)\]\s*/gi, " ").trim();
    if (!t) continue;
    const nearestText = (from: number, step: 1 | -1): { text: string; el: ChildNode | null } | null => {
      for (let j = from; j >= 0 && j < lines.length; j += step) {
        const text = lines[j].text.replace(/\s*\[(?:show|hide)\]\s*/gi, " ").trim();
        if (text) return { text, el: lines[j].el };
      }
      return null;
    };
    if (/^v(?:s\.?|\.)$/i.test(t)) {
      const prev = nearestText(i - 1, -1);
      const next = nearestText(i + 1, 1);
      if (prev && next) {
        const verticalNames = asColumnTitles(`${prev.text} vs ${next.text}`);
        if (verticalNames) return { names: verticalNames, anchorEl: next.el, reliable: true };
      }
      continue;
    }
    const trailingVs = t.match(/^(.*?)\s+v(?:s\.?|\.)$/i);
    if (trailingVs) {
      const next = nearestText(i + 1, 1);
      if (next) {
        const verticalNames = asColumnTitles(`${trailingVs[1]} vs ${next.text}`);
        if (verticalNames) return { names: verticalNames, anchorEl: next.el, reliable: true };
      }
      continue;
    }
    if (!VS_BAR_RE.test(t) || isStructuralReleaseTitleLabel(t)) {
      interludeLinesAfter++;
      if (enforceDistance && interludeLinesAfter > 2) sawBarrierAfter = true;
      continue;
    }
    if (enforceDistance && interludeLinesAfter > 2) continue;
    const names = asColumnTitles(t);
    if (!names) {
      const rejectedNames = splitNames(t);
      if (rejectedNames.length >= 2 && (lines[i].external || /https?:\/\/|slow\.pics/i.test(t))) {
        return { names: rejectedNames, anchorEl: lines[i].el, reliable: false };
      }
      continue;
    }
    // A real column title is a short clean label — it never carries a URL.
    // A "title" line that does is a slow.pics caption / external-link
    // description folded in from a quote block (Holubice 838405): mark it
    // UNRELIABLE so a torrent-page gallery falls back to the 1-wide viewer
    // instead of these invented columns. (A title that merely sits AFTER a
    // BDInfo <table> stays reliable — it carries no URL — so legit
    // quote-adjacent comparisons like 1009/1766 are untouched.)
    const reliable = !/https?:\/\/|\bslow\.pics/i.test(t);
    return { names, anchorEl: lines[i].el, reliable };
  }
  for (let i = lines.length - 2; i >= 0; i--) {
    if (!lines[i + 1]?.external) continue;
    const t = lines[i].text.replace(/\s*\[(?:show|hide)\]\s*/gi, " ").trim();
    if (!/\b(?:MacP|WATCHABLE|ABM)\b/i.test(t)) continue;
    const names = asColumnTitles(t);
    if (names) return { names, anchorEl: lines[i].el, reliable: true };
  }
  return null;
}

/** The comparison title may sit in the PARENT, on the single line directly
 *  before this container — e.g. a multi-section post where the column title is a
 *  `<strong>` and the screenshots are inside a following `<pre>` grouped by
 *  sub-section dividers (057: `<strong>FRA | USA | GBR</strong><br><pre>Video
 *  Bitrate … General … Luma … Chroma …</pre>`). Read the immediately-preceding
 *  sibling line (back to the first blank line / previous block / previous image
 *  block) and take its vs/| comparison names. Scoped to that one introductory
 *  line so a sibling grid's title can never leak across. */
function leadingComparisonNamesBeforeContainer(container: Element): { names: string[]; anchorEl: ChildNode | null } | null {
  let text = "";
  let el: ChildNode | null = null;
  for (let node: ChildNode | null = container.previousSibling; node; node = node.previousSibling) {
    if (node.nodeName === "BR") {
      if (text.trim()) break; // a blank line above the title ends it
      continue;
    }
    if (node.nodeType === 1) {
      const e = node as Element;
      // Stop at the previous image block or any block-level sibling: the title
      // we want is the inline run (text / <strong> / <font>) right above us.
      if (e.nodeName === "IMG" || e.querySelector?.("img")) break;
      if (/^(?:DIV|P|PRE|TABLE|BLOCKQUOTE|UL|OL|HR)$/.test(e.nodeName)) break;
      text = (e.textContent || "") + text;
      el = e;
    } else if (node.nodeType === 3) {
      text = (node.textContent || "") + text;
    }
  }
  const t = text.trim();
  if (!t || !VS_BAR_RE.test(t)) return null;
  const names = asColumnTitles(t);
  if (names) {
    return { names, anchorEl: el };
  }
  return null;
}

// A real per-source label is short and clean ("JPN BD", "USA", "Sony Pictures |
// Germany") — never a quote/paragraph/URL (2715).
function isCleanSourceLabel(t: string): boolean {
  return t.length > 0 && t.length <= 40 && !/https?:\/\//i.test(t) &&
    !/\bquote\b/i.test(t) && !looksLikeProse([t]) && !isNonSourceLabel(t);
}

/** Collect per-source labels that each precede an image-LESS documentation block
 *  (a "Hidden text" showhide, or a BDInfo `<table>` / Quote header), within
 *  `scope` and up to `stopAt`. The screenshots are a separate flat block; the
 *  labels are the columns (the BDInfo is ignored). */
function sourceLabelsBeforeDocBlocks(scope: Element, stopAt: Node | null): { names: string[]; anchorEl: Element | null } | null {
  const labels: string[] = [];
  let lastEl: Element | null = null;
  let pending = "";
  let lastLine = ""; // last non-empty line — the label may sit a <br> above the block
  for (const node of scope.childNodes) {
    if (node === stopAt) break;
    if (node.nodeName === "BR") { const t = pending.trim(); if (t) lastLine = t; pending = ""; continue; }
    if (node.nodeType === 3) { pending += node.textContent || ""; continue; }
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.nodeName === "IMG" || (el.nodeName === "A" && el.querySelector("img"))) break; // screenshots
    const docBlock = !el.querySelector("img") &&
      (!!el.querySelector?.("label.label_showhide") || el.matches?.("table, p.sub"));
    if (docBlock) {
      const t = (pending.trim() || lastLine)
        .replace(/[:\s]+$/, "")
        .replace(/^\s*v(?:s\.?|\.)\s+/i, "")
        .trim();
      if (t && isCleanSourceLabel(t) && labels[labels.length - 1] !== t) { labels.push(t); lastEl = el; }
      pending = ""; lastLine = "";
    } else if (el.querySelector?.("img")) {
      break; // an inline image block before this — not the pattern
    } else {
      pending += el.textContent || "";
    }
  }
  return labels.length >= 2 && looksLikeNames(labels) ? { names: labels, anchorEl: lastEl } : null;
}

/** Sources documented as per-source labels before image-less blocks, with the
 *  screenshots in a separate flat block: "JPN BD: [Hidden text]…" (77086, labels
 *  in the parent of the image wrapper) or "USA<Quote BDInfo> CAN<Quote BDInfo>"
 *  (80662, labels alongside the screenshots in the same container). */
function leadingShowhideSourceLabels(container: Element): { names: string[]; anchorEl: Element | null } | null {
  return sourceLabelsBeforeDocBlocks(container, null) ??
    (container.parentElement ? sourceLabelsBeforeDocBlocks(container.parentElement, container) : null);
}

/** True when the page is a Comparisons-forum thread (forumid 40) — its H1 links
 *  to that forum. Such an OP is, by definition, a comparison. */
function isComparisonThread(): boolean {
  return !!document.querySelector('h1 a[href*="forumid=40"]');
}

/** True on a torrent-detail page (vs a forum thread). */
function isTorrentPage(): boolean {
  return !!document.querySelector("div.torrent-title, table#details");
}

/** The no-title 1-wide gallery fallback is only for the torrent description
 *  body. Torrent comments can still produce real comparisons, but plain comment
 *  screenshots must not get folded into the description viewer path. */
function isTorrentDescriptionContainer(container: Element): boolean {
  const details = document.querySelector("table#details");
  return !!details?.contains(container);
}

function isTheFarmTorrentDescription(container: Element): boolean {
  return isTorrentDescriptionContainer(container) && hasTorrentReleaseGroup(/-TheFarm\b/i);
}

/** Comparison-thread OP fallback: a comparison is a CONTIGUOUS image block, so
 *  when the whole-container reshape fails (stray example screenshots scattered
 *  through a "Hidden text" spoiler, then the real grid — 80070), retry on the
 *  LARGEST image group alone, titled by the curated H1. Only when it divides
 *  cleanly, so a reply/discussion post's 1-per-line samples (3 imgs / 2 cols)
 *  stay suppressed. Off comparison threads / non-OP posts → null. */
function cmpThreadLargestBlock(container: Element, groups: GridCell[][]): Grid[] | null {
  if (!isComparisonThread() || !isOriginalPost(container)) return null;
  // Only for the scattered-spoiler shape: example frames live in a generic
  // "Hidden text" showhide, with the real grid outside it (80070). This keeps
  // the fallback from resurrecting an unrelated leftover block (057).
  const h1 = namesFromHeadings();
  if (!h1 || !looksLikeNames(h1)) return null;
  let total = groups.flat().length;
  const block = groups.reduce((a, b) => (b.length > a.length ? b : a), groups[0]);
  if (block.length < h1.length) return null;

  const hasSpoiler = [...container.querySelectorAll("label.label_showhide")].some(
    (l) => /^hidden\s+text$/i.test((l.textContent || "").replace(/\s*\[(?:show|hide)\]\s*$/i, "").trim()),
  );
  let partial = false;
  if (hasSpoiler) {
    // 80070: example frames scattered through a generic "Hidden text" spoiler,
    // with the real grid outside it → take the largest block, but it must
    // divide the H1 column count cleanly.
    if (block.length % h1.length !== 0) return null;
  } else if (hasSlowPicsLink(container) && block.length === total && block.length > h1.length) {
    // 80402: a comparison-thread OP whose slow.pics-linked shots are ONE
    // contiguous block titled by the H1, but the count is indivisible (the
    // poster dropped a screenshot — 37 shots for a 2-wide AUS/GBR set). Show it
    // anyway; the trailing short row is the "orphan" the viewer lets you click
    // to ignore. Gated to the slow.pics + single-block shape so a multi-section
    // OP with no slow.pics link (057's leftover blocks) stays suppressed.
    partial = block.length % h1.length !== 0;
  } else {
    return null;
  }

  const rows: GridCell[][] = [];
  for (let i = 0; i < block.length; i += h1.length) rows.push(block.slice(i, i + h1.length));
  return [{ rows, numCols: h1.length, names: finalizeNames(h1), anchorEl: null, partial }];
}

/** True when the container carries a slow.pics comparison link (direct or via an
 *  HDBits /redir.php wrapper whose visible text is the slow.pics URL). */
function hasSlowPicsLink(container: Element): boolean {
  for (const a of container.querySelectorAll("a[href]")) {
    if (/slow\.pics/i.test(a.getAttribute("href") || "") || /slow\.pics/i.test(a.textContent || "")) {
      return true;
    }
  }
  return false;
}

function hasAdjacentSlowPicsLinkBeforeImage(container: Element, img: HTMLImageElement | undefined): boolean {
  if (!img) return false;
  const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((a) =>
    (/slow\.pics/i.test(a.href) || /slow\.pics/i.test(a.textContent || "")) &&
    !!(a.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  const link = links[links.length - 1];
  if (!link) return false;
  try {
    const range = document.createRange();
    range.setStartAfter(link);
    range.setEndBefore(img);
    return !/[A-Za-z0-9]/.test(range.toString());
  } catch {
    return false;
  }
}

function hasAdjacentFooterSlowPicsLinkBeforeImage(container: Element, img: HTMLImageElement | undefined): boolean {
  if (!img) return false;
  const links = [...container.querySelectorAll<HTMLAnchorElement>("a[href]")].filter((a) =>
    isFooterLabel((a.textContent || "").trim()) &&
    (/slow\.pics/i.test(a.href) || /slow\.pics/i.test(a.textContent || "")) &&
    !!(a.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING),
  );
  const link = links[links.length - 1];
  if (!link) return false;
  try {
    const range = document.createRange();
    range.setStartAfter(link);
    range.setEndBefore(img);
    return !/[A-Za-z0-9]/.test(range.toString());
  } catch {
    return false;
  }
}

function stableGridColumnCount(groups: GridCell[][]): number | null {
  const firstLen = groups[0]?.length ?? 0;
  if (
    groups.length >= 2 &&
    firstLen >= 2 &&
    groups.every((g) => g.length === firstLen)
  ) {
    return firstLen;
  }
  return null;
}

function isGenericSourceNames(names: string[] | null): boolean {
  return !!names?.length && names.every((name, index) => name === `Source ${index + 1}`);
}

function isUploaderTechnicalSizeNames(names: string[]): boolean {
  if (!hasUntitledGenericFallbackUploader()) return false;
  return names.length >= 2 && names.every((name) =>
    /^(?:encode|remux|source|filtered)?\s*size\s*:\s*\d+(?:\.\d+)?\s*[KMGT]i?B\b.*\b(?:kb\/s|mb\/s|kbps|mbps)\b/i
      .test(name.trim()));
}

function logicalTextLinesBeforeFirstScreenshot(container: Element): string[] {
  const lines = [""];
  for (const node of container.childNodes) {
    if (node.nodeType === 8) continue;
    if (node.nodeName === "BR") {
      lines.push("");
      continue;
    }
    if (node.nodeName === "IMG" && isHDBitsScreenshotImage(node as HTMLImageElement)) break;
    if (node.nodeName === "A" && hasHDBitsScreenshotImage(node as Element)) break;
    if (node.nodeType === 1 && hasHDBitsScreenshotImage(node as Element)) break;
    lines[lines.length - 1] += node.textContent || "";
    if (node.nodeType === 1 && /^(?:DIV|P|PRE|TABLE|BLOCKQUOTE|UL|OL)$/.test(node.nodeName)) {
      lines.push("");
    }
  }
  return lines.map((line) => line.replace(/\s+/g, " ").trim()).filter(Boolean);
}

function hasPlainInterludeAfterTechnicalSizeNames(container: Element, names: string[]): boolean {
  if (!isUploaderTechnicalSizeNames(names)) return false;
  const lines = logicalTextLinesBeforeFirstScreenshot(container);
  const titleIndex = lines.findIndex((line) => {
    const parsed = asColumnTitles(line);
    return parsed?.length === names.length && parsed.every((name, index) => tidyName(name) === tidyName(names[index]));
  });
  if (titleIndex < 0) return false;
  return lines.slice(titleIndex + 1).some((line) =>
    !isAllowedComparisonHeadingInterlude(line));
}

function textBeforeFirstScreenshot(container: Element, groups: GridCell[][]): string {
  const img = groups[0]?.[0]?.img;
  if (!img) return "";
  try {
    const range = document.createRange();
    range.setStart(container, 0);
    range.setEndBefore(img);
    return range.toString();
  } catch {
    return "";
  }
}

function flatImplicitComparisonSourceNames(container: Element, groups: GridCell[][], total: number): string[] | null {
  const stableCols = stableGridColumnCount(groups);
  if (!isTorrentPage() || total < 4 || total % 2 !== 0 || (groups.length !== 1 && stableCols !== 2)) return null;
  const text = textBeforeFirstScreenshot(container, groups);
  if (!/\b(?:encode\s+notes?|fix(?:ed|es)?|dirty\s+lines?)\b/i.test(text)) return null;
  return genericSourceNames(2);
}

function macpCommaCaptionNames(container: Element, groups: GridCell[][], total: number): string[] | null {
  if (!isTorrentPage() || total !== 2 || !/\bMacP\b/i.test(document.title)) return null;
  const text = textBeforeFirstScreenshot(container, groups)
    .replace(/\s+/g, " ")
    .replace(/\s*:\s*$/, "")
    .trim();
  const match = text.match(/\b(Turbine source has a chroma misalignment that Kino didn't have),\s*(that's easily fixed)$/i);
  return match ? [match[1], match[2]] : null;
}

function torrentTitleText(): string {
  const title = document.querySelector("div.torrent-title h1")?.textContent || document.title || "";
  return title.replace(/\s+/g, " ").trim();
}

function hasTorrentReleaseGroup(group: RegExp): boolean {
  if (!isTorrentPage()) return false;
  return group.test(torrentTitleText());
}

function asd87ArrowNamesFromLabel(label: string): string[] | null {
  if (!hasTorrentReleaseGroup(/-ASD87\b/i)) return null;
  const normalized = label.replace(/\s+/g, " ").trim();
  const match = normalized.match(/\bSource\b\s*[》>]{3,}\s*\bEncode\b(?:\s*-{3,}\s*(.+))?$/i);
  if (!match) return null;
  const third = match[1]?.replace(/^-+/, "").trim();
  if (third) return ["Source", "Encode", tidyName(third)];
  return ["Source", "Encode"];
}

function asd87ArrowLabelInfo(
  groupLabels: (string | null)[],
  groupLabelEls: (ChildNode | null)[],
): { names: string[]; anchorEl: ChildNode | null } | null {
  for (let i = 0; i < Math.min(groupLabels.length, 2); i++) {
    const label = groupLabels[i];
    if (!label) continue;
    const names = asd87ArrowNamesFromLabel(label);
    if (names) return { names, anchorEl: groupLabelEls[i] };
  }
  return null;
}

function buildAsd87ArrowComparisonGrid(collected: GroupsResult): Grid[] | null {
  if (!hasTorrentReleaseGroup(/-ASD87\b/i)) return null;
  for (let i = 0; i < collected.groupLabels.length; i++) {
    const label = collected.groupLabels[i];
    const firstLen = collected.groups[i]?.length ?? 0;
    if (!label || firstLen < 2) continue;

    let end = i + 1;
    while (end < collected.groups.length && collected.groups[end].length === firstLen) end++;
    const sectionGroups = collected.groups.slice(i, end);
    const sectionImages = sectionGroups.flat();
    const names = asd87ArrowNamesFromLabel(label);
    if (!names) continue;

    const shaped = reshapeGrid(sectionGroups, sectionImages, names);
    if (!shaped) continue;
    return [{
      rows: shaped.gridRows,
      numCols: shaped.numCols,
      names: finalizeNames(names),
      anchorEl: collected.groupLabelEls[i],
    }];
  }
  return null;
}

function hasUntitledGenericFallbackUploader(): boolean {
  return hasTorrentReleaseGroup(/-(?:ENDSkY|Rose3Thorn)\b/i);
}

function endskyGenericNamesForUntitledGrid(groups: GridCell[][], total: number): string[] | null {
  if (!hasUntitledGenericFallbackUploader() || total < 4) return null;
  const stableCols = stableGridColumnCount(groups);
  if (stableCols && stableCols >= 2 && total % stableCols === 0) return genericSourceNames(stableCols);
  if (total % 3 === 0) return genericSourceNames(3);
  if (total % 2 === 0) return genericSourceNames(2);
  return null;
}

function leadingStructuredLabelInfo(container: Element, groups: GridCell[][]): { names: string[]; anchorEl: Element } | null {
  const numCols = stableGridColumnCount(groups);
  if (!numCols) return null;
  if (hasPreImageTitleBarrierBeforeFirstScreenshot(container)) return null;
  return namesFromLeadingStructuredLabels(container, numCols);
}

function isNearbyComparisonSectionHeading(text: string): boolean {
  return /^(?:comparisons?|zoned scenes?|screens?)\s*:?\s*$/i.test(text.replace(/\s+/g, " ").trim());
}

function isAllowedComparisonHeadingInterlude(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  return /^(?:or|note:.*)$/i.test(t) || isFooterLabel(t);
}

function hasPreviousSiblingComparisonSectionHeading(node: ChildNode): boolean {
  let interludes = 0;
  for (let prev: ChildNode | null = node.previousSibling; prev; prev = prev.previousSibling) {
    if (prev.nodeType === 8) continue;
    if (prev.nodeName === "BR") continue;
    const text = (prev.textContent || "").trim();
    if (!text) continue;
    if (prev.nodeType === 1 && (prev as Element).querySelector?.("img")) return false;
    if (isNearbyComparisonSectionHeading(text)) return true;
    if (isAllowedComparisonHeadingInterlude(text) && ++interludes <= 4) continue;
    return false;
  }
  return false;
}

function previousSiblingColumnTitleInfo(container: Element): { names: string[]; anchorEl: ChildNode | null } | null {
  if (!isTorrentPage()) return null;
  for (let node: ChildNode | null = container.previousSibling; node; node = node.previousSibling) {
    if (node.nodeType === 8) continue;
    if (node.nodeName === "BR") continue;
    const text = (node.textContent || "").trim();
    if (!text) continue;
    const names = asColumnTitles(text);
    if (!names) return null;
    if (!hasExplicitComparison(text) && !names.some((name) => /\b(?:source|encode|filtered|MacP|WATCHABLE|B0MBARDiERS)\b/i.test(name))) {
      return null;
    }
    if (!hasPreviousSiblingComparisonSectionHeading(node) && !hasVsOrPipe(text)) return null;
    if (node.nodeType === 1) {
      const el = node as Element;
      if (el.querySelector?.("img")) return null;
      const titleEl = el.matches("strong, b")
        ? el
        : [...el.children].find((child) =>
          child.matches("strong, b") &&
          child.textContent?.replace(/\s+/g, " ").trim() === text);
      return { names, anchorEl: titleEl ?? el };
    }
    return { names, anchorEl: node };
  }
  return null;
}

function hasTorrentLogPollutedNames(names: string[]): boolean {
  if (!isTorrentPage()) return false;
  return names.some((name) => {
    const t = name.trim();
    return /^quote\b/i.test(t) ||
      /\bquote\s*x264\b/i.test(t) ||
      /^x264\s*\[info\]/i.test(t) ||
      /\bx264\s*\[info\]\s*:/i.test(t);
  });
}

function torrentAmbiguousGalleryFallback(
  container: Element,
  groups: GridCell[][],
  groupLabelEls: (ChildNode | null)[],
  total: number,
  ambiguousTitle: boolean,
  excludeImgs: Set<HTMLImageElement>,
): Grid[] | null {
  if (!ambiguousTitle || !isTorrentPage() || total < 2) return null;
  const hasClaimedImageInContainer = screenshotImagesIn(container).some((img) => excludeImgs.has(img));
  const adjacentSlowPics = hasAdjacentSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img);
  if (hasClaimedImageInContainer || adjacentSlowPics) return null;
  return torrentViewerGalleryFallback(container, groups, groupLabelEls);
}

function galleryAnchorBeforeImages(groups: GridCell[][], groupLabelEls: (ChildNode | null)[]): Node | null {
  for (let i = 0; i < groupLabelEls.length; i++) {
    if (groups[i]?.length && groupLabelEls[i]) return groupLabelEls[i];
  }

  const firstNode = groups[0]?.[0]?.a ?? groups[0]?.[0]?.img ?? null;
  if (!firstNode) return null;

  let previous = firstNode.previousSibling;
  while (previous && previous.nodeType === 3 && !(previous.textContent || "").trim()) {
    const beforeWhitespace = previous.previousSibling;
    if (!beforeWhitespace) return previous;
    previous = beforeWhitespace;
  }
  return previous;
}

function torrentViewerGalleryFallback(
  container: Element,
  groups: GridCell[][],
  groupLabelEls: (ChildNode | null)[],
): Grid[] | null {
  if (!isTorrentPage() || !isTorrentDescriptionContainer(container)) return null;
  const total = groups.flat().length;
  if (total < 2) return null;
  const firstImg = groups[0]?.[0]?.img;
  if (
    hasAdjacentSlowPicsLinkBeforeImage(container, firstImg) ||
    hasAdjacentFooterSlowPicsLinkBeforeImage(container, firstImg)
  ) {
    return null;
  }
  return [{
    rows: groups.flat().map((c) => [c]),
    numCols: 1,
    names: null,
    anchorEl: galleryAnchorBeforeImages(groups, groupLabelEls),
    gallery: true,
  }];
}

function isStructuralReleaseTitleLabel(label: string): boolean {
  if (!isTorrentPage()) return false;
  const t = label.replace(/\s+/g, " ").trim();
  if (/^(?:source|encode|filtered)\b/i.test(t)) return false;
  return /\b(?:19|20)\d{2}\b/.test(t) &&
    /\b(?:480p|576p|720p|1080p|2160p|Blu-?ray|WEB-?DL|WEBRip|HDTV|x264|x265|HEVC|AVC)\b/i.test(t) &&
    /\s+-\s+[A-Za-z0-9][A-Za-z0-9._-]{1,20}$/.test(t);
}

function allowGenericNamesForUntitledTorrentGrid(
  container: Element,
  groups: GridCell[][],
  groupLabels: (string | null)[],
  detailsLinkComparisonOnly: boolean,
  ambiguousTitle: boolean,
): boolean {
  if (!isTorrentPage() || detailsLinkComparisonOnly || ambiguousTitle) return true;
  const label = showhideLabelText(container);
  if (label && /comparisons?/i.test(label)) return true;
  if (hasSlowPicsLink(container)) return true;
  const before = textBeforeFirstScreenshot(container, groups);
  if (/\b(?:comparison|compare|encode\s+notes?|fix(?:ed|es)?|dirty\s+lines?)\b/i.test(before)) return true;
  if (groupLabels.some((l) => !!l && /^(?:screens?|screenshots?|release info|description)\s*:?\s*$/i.test(l))) {
    return false;
  }
  return stableGridColumnCount(groups) === null;
}

function hasUsableColumnTitleBeforeFirstScreenshot(container: Element, groups: GridCell[][]): boolean {
  return textBeforeFirstScreenshot(container, groups)
    .split(/\n+/)
    .some((line) => {
      const text = line.replace(/\s+/g, " ").trim();
      if (/^(?:genre|imdb rating|link)\b/i.test(text)) return false;
      return !!text && !isStructuralReleaseTitleLabel(text) && !!asColumnTitles(text);
    });
}

function hasReleaseInfoScreensGalleryShape(container: Element, groups: GridCell[][]): boolean {
  const before = textBeforeFirstScreenshot(container, groups);
  if (!/\bRelease Info\b/i.test(before) || !/\bRELEASE NAME\.{2,}\s*:/i.test(before)) return false;
  const afterScreens = before.split(/\bScreens?\b/i).pop()?.replace(/\s+/g, " ").trim() ?? "";
  return !afterScreens || !asColumnTitles(afterScreens);
}

function isTorrentScreensGalleryOnly(
  container: Element,
  groups: GridCell[][],
  groupLabels: (string | null)[],
): boolean {
  if (!isTorrentPage()) return false;
  if (!groupLabels.some((label) => !!label && /^(?:screens?|screenshots?)\s*:?\s*$/i.test(label))) return false;
  if (hasReleaseInfoScreensGalleryShape(container, groups)) return true;
  return !hasUsableColumnTitleBeforeFirstScreenshot(container, groups);
}

function hasLocalNonNameHeading(groupLabels: (string | null)[]): boolean {
  const firstImageLabel = groupLabels.find((label) => !!label);
  if (!firstImageLabel) return false;
  if (/^\d+$/.test(firstImageLabel)) return false;
  if (/^(?:screenshots?|screenshot\s+comparison|comparison)$/i.test(firstImageLabel)) return false;
  return !looksLikeNames(splitNames(firstImageLabel));
}

function hasPreviousSiblingPreviewHeading(container: Element): boolean {
  let sib = container.previousElementSibling;
  for (let steps = 0; steps < 8 && sib; steps++, sib = sib.previousElementSibling) {
    if (sib.nodeName === "BR") continue;
    if (sib.querySelector?.("img")) return false;
    return /^preview\s*:?\s*$/i.test((sib.textContent || "").trim());
  }
  return false;
}

function trimTrailingLabeledSectionAfterSingleGridLabel(collected: GroupsResult): GroupsResult {
  const gridLabelIndexes = collected.groupLabels
    .map((label, index) => ({ label, index }))
    .filter((g): g is { label: string; index: number } => !!g.label && !!asColumnTitles(g.label))
    .map((g) => g.index);
  if (gridLabelIndexes.length !== 1) return collected;

  let sawUnlabeledGridRow = false;
  let sectionIndex = -1;
  for (let i = gridLabelIndexes[0] + 1; i < collected.groupLabels.length; i++) {
    if (!collected.groupLabels[i]) {
      sawUnlabeledGridRow = true;
    } else if (sawUnlabeledGridRow) {
      sectionIndex = i;
      break;
    }
  }

  if (sectionIndex < 0) return collected;
  return {
    groups: collected.groups.slice(0, sectionIndex),
    groupLabels: collected.groupLabels.slice(0, sectionIndex),
    groupLabelEls: collected.groupLabelEls.slice(0, sectionIndex),
    groupLeadingBreaks: collected.groupLeadingBreaks.slice(0, sectionIndex),
  };
}

function trimTrailingFooterSection(collected: GroupsResult): GroupsResult {
  const sectionIndex = collected.groupLabels.findIndex((label, index) =>
    index > 0 && !!label && isFooterLabel(label));
  if (sectionIndex < 0) return collected;
  return {
    groups: collected.groups.slice(0, sectionIndex),
    groupLabels: collected.groupLabels.slice(0, sectionIndex),
    groupLabelEls: collected.groupLabelEls.slice(0, sectionIndex),
    groupLeadingBreaks: collected.groupLeadingBreaks.slice(0, sectionIndex),
  };
}

function trimToLeadingColumnRun(collected: GroupsResult, numCols: number): GroupsResult {
  let end = 0;
  while (end < collected.groups.length && collected.groups[end].length === numCols) end++;
  if (end <= 0 || end >= collected.groups.length) return collected;
  return {
    groups: collected.groups.slice(0, end),
    groupLabels: collected.groupLabels.slice(0, end),
    groupLabelEls: collected.groupLabelEls.slice(0, end),
    groupLeadingBreaks: collected.groupLeadingBreaks.slice(0, end),
  };
}

function hasSameLinePreviousSibling(el: Element): boolean {
  for (let node = el.previousSibling; node; node = node.previousSibling) {
    if (node.nodeName === "BR") return false;
    if ((node.textContent || "").trim()) return true;
  }
  return false;
}

function hasInlineImageFormattingWrapper(container: Element): boolean {
  return [...container.children].some((child) =>
    /^(?:STRONG|B|I|EM|U|SPAN|FONT)$/i.test(child.tagName) &&
    screenshotImagesIn(child).length >= 2);
}

function trimTrailingGroupsUntilDivisible(collected: GroupsResult, numCols: number): GroupsResult {
  return trimTrailingGroupsUntilDivisibleWithRemainder(collected, numCols).collected;
}

function trimTrailingGroupsUntilDivisibleWithRemainder(
  collected: GroupsResult,
  numCols: number,
): { collected: GroupsResult; remainder: GroupsResult | null } {
  let { groups, groupLabels, groupLabelEls } = collected;
  let { groupLeadingBreaks } = collected;
  const remainderGroups: GridCell[][] = [];
  const remainderLabels: (string | null)[] = [];
  const remainderLabelEls: (ChildNode | null)[] = [];
  const remainderLeadingBreaks: number[] = [];
  while (groups.length > 1 && groups.flat().length % numCols !== 0) {
    remainderGroups.unshift(groups[groups.length - 1]);
    remainderLabels.unshift(groupLabels[groupLabels.length - 1]);
    remainderLabelEls.unshift(groupLabelEls[groupLabelEls.length - 1]);
    remainderLeadingBreaks.unshift(groupLeadingBreaks[groupLeadingBreaks.length - 1] ?? 0);
    groups = groups.slice(0, -1);
    groupLabels = groupLabels.slice(0, -1);
    groupLabelEls = groupLabelEls.slice(0, -1);
    groupLeadingBreaks = groupLeadingBreaks.slice(0, -1);
  }
  return {
    collected: { groups, groupLabels, groupLabelEls, groupLeadingBreaks },
    remainder: remainderGroups.length
      ? {
        groups: remainderGroups,
        groupLabels: remainderLabels,
        groupLabelEls: remainderLabelEls,
        groupLeadingBreaks: remainderLeadingBreaks,
      }
      : null,
  };
}

function galleryGridFromGroups(collected: GroupsResult | null): Grid | null {
  if (!collected) return null;
  const cells = collected.groups.flat();
  if (cells.length < 2) return null;
  return {
    rows: cells.map((cell) => [cell]),
    numCols: 1,
    names: null,
    anchorEl: galleryAnchorBeforeImages(collected.groups, collected.groupLabelEls),
    gallery: true,
  };
}

function hasLargeGapBeforeRemainder(remainder: GroupsResult | null): boolean {
  return (remainder?.groupLeadingBreaks[0] ?? 0) >= 3;
}

/** Surface torrent-description groups that precede EVERY grid a section
 *  strategy emitted (release sample shots posted above the vs-labeled
 *  comparison sections of an RPU-fix post) as a 1-wide viewer gallery. The
 *  parse claims the whole container, so without a grid of their own those
 *  screenshots would be dead — no control and no click-to-view. Forum posts
 *  are left alone: stray leading images there stay suppressed. */
function withUncoveredLeadingGallery(container: Element, collected: GroupsResult, grids: Grid[]): Grid[] {
  if (!enforcesTorrentTitleDistance(container)) return grids;
  const used = new Set<HTMLImageElement>();
  for (const grid of grids) {
    for (const cell of grid.rows.flat()) if (cell.img) used.add(cell.img);
  }
  const leading: GroupsResult = { groups: [], groupLabels: [], groupLabelEls: [], groupLeadingBreaks: [] };
  for (let i = 0; i < collected.groups.length; i++) {
    if (collected.groups[i].some((cell) => !!cell.img && used.has(cell.img))) break;
    leading.groups.push(collected.groups[i]);
    leading.groupLabels.push(collected.groupLabels[i]);
    leading.groupLabelEls.push(collected.groupLabelEls[i]);
    leading.groupLeadingBreaks.push(collected.groupLeadingBreaks[i]);
  }
  const gallery = leading.groups.length ? galleryGridFromGroups(leading) : null;
  return gallery ? [gallery, ...grids] : grids;
}

function hasRejectedLeadingColumnTitle(container: Element): boolean {
  let leadingText = "";
  for (const node of container.childNodes) {
    if (node.nodeType === 8) continue;
    if (node.nodeName === "A") {
      if ((node as Element).querySelector("img")) break;
      leadingText += node.textContent || "";
    } else if (node.nodeType === 3) {
      leadingText += node.textContent || "";
    } else if (node.nodeName === "BR") {
      leadingText += " ";
    } else {
      break;
    }
  }
  const t = leadingText.trim();
  return !!t && hasVsOrPipe(t) && !asColumnTitles(t);
}

function hasClaimedScreenshotBetween(
  anchorEl: Node | null,
  firstImg: HTMLImageElement | undefined,
  scope: Element,
  excludeImgs: Set<HTMLImageElement>,
): boolean {
  if (!anchorEl || !firstImg || !scope.contains(anchorEl)) return false;
  for (const img of scope.querySelectorAll<HTMLImageElement>("img")) {
    if (!excludeImgs.has(img)) continue;
    if (
      (anchorEl.compareDocumentPosition(img) & Node.DOCUMENT_POSITION_FOLLOWING) &&
      (img.compareDocumentPosition(firstImg) & Node.DOCUMENT_POSITION_FOLLOWING)
    ) {
      return true;
    }
  }
  return false;
}

function hasClaimedScreenshotBefore(
  firstImg: HTMLImageElement | undefined,
  scope: Element,
  excludeImgs: Set<HTMLImageElement>,
): boolean {
  if (!firstImg) return false;
  for (const img of scope.querySelectorAll<HTMLImageElement>("img")) {
    if (!excludeImgs.has(img)) continue;
    if (img.compareDocumentPosition(firstImg) & Node.DOCUMENT_POSITION_FOLLOWING) return true;
  }
  return false;
}

function hasPriorScreenshotOutsideGroups(groups: GridCell[][], scope: Element): boolean {
  const firstImg = groups[0]?.[0]?.img;
  if (!firstImg) return false;
  const current = new Set(groups.flat().map((cell) => cell.img).filter((img): img is HTMLImageElement => !!img));
  for (const img of scope.querySelectorAll<HTMLImageElement>("img")) {
    if (current.has(img)) continue;
    if (!isHDBitsScreenshotImage(img)) continue;
    if (img.compareDocumentPosition(firstImg) & Node.DOCUMENT_POSITION_FOLLOWING) return true;
  }
  return false;
}

/** Reshape groups into a grid based on name count */
export function reshapeGrid(groups: GridCell[][], allImages: GridCell[], names: string[] | null): { numCols: number; gridRows: GridCell[][] } | null {
  const firstLen = groups[0].length;
  const isProperGrid =
    groups.length >= 2 &&
    firstLen >= 2 &&
    groups.every((g) => g.length === firstLen);

  let numCols: number, gridRows: GridCell[][];

  if (isProperGrid) {
    if (
      names &&
      names.length >= 2 &&
      names.length !== firstLen &&
      allImages.length % names.length === 0
    ) {
      numCols = names.length;
      if (names.length === groups.length) {
        gridRows = [];
        for (let r = 0; r < firstLen; r++) {
          gridRows.push(groups.map((g) => g[r]));
        }
      } else {
        gridRows = [];
        for (let i = 0; i < allImages.length; i += numCols) {
          gridRows.push(allImages.slice(i, i + numCols));
        }
      }
    } else {
      numCols = firstLen;
      gridRows = groups;
    }
  } else {
    if (
      names &&
      names.length >= 2 &&
      allImages.length >= names.length &&
      allImages.length % names.length === 0
    ) {
      numCols = names.length;
    } else {
      return null;
    }
    gridRows = [];
    for (let i = 0; i < allImages.length; i += numCols) {
      gridRows.push(allImages.slice(i, i + numCols));
    }
  }

  if (!gridRows.length || numCols < 2) return null;
  return { numCols, gridRows };
}

export function parseGrid(container: Element, excludeImgs: Set<HTMLImageElement> = new Set()): Grid[] | null {
  let collected = collectGroups(container, excludeImgs);
  if (!collected) return null;
  let { groups, groupLabels, groupLabelEls, groupLeadingBreaks } = collected;
  if (isTheFarmTorrentDescription(container)) return torrentViewerGalleryFallback(container, groups, groupLabelEls);
  const trailingGalleries: Grid[] = [];

  const earlyTotal = groups.flat().length;
  const earlyLeadCmp = leadingComparisonNames(container);
  const hasWholeContainerLeadCmp =
    !!earlyLeadCmp && earlyLeadCmp.reliable && earlyTotal % earlyLeadCmp.names.length === 0;
  const leadingDetails = hasWholeContainerLeadCmp ? null : leadingDetailsLinkLabelInfo(container, groups);
  if (leadingDetails?.names) {
    const leadingRun = trimToLeadingColumnRun(collected, leadingDetails.names.length);
    const leadingImages = leadingRun.groups.flat();
    const shaped = reshapeGrid(leadingRun.groups, leadingImages, leadingDetails.names);
    if (shaped) {
      const restStart = leadingRun.groups.length;
      const restGrids = restStart < groups.length
        ? buildMultiCompGrids(
          container,
          groups.slice(restStart),
          groupLabels.slice(restStart),
          groupLabelEls.slice(restStart),
        )
        : null;
      return [{
        rows: shaped.gridRows,
        numCols: shaped.numCols,
        names: finalizeNames(leadingDetails.names),
        anchorEl: leadingDetails.anchorEl,
      }, ...(restGrids ?? [])];
    }
  }
  if (
    earlyLeadCmp?.reliable &&
    /\b(?:MacP|WATCHABLE|ABM)\b/i.test(earlyLeadCmp.names.join(" ")) &&
    earlyTotal % earlyLeadCmp.names.length !== 0
  ) {
    const leadingRun = trimToLeadingColumnRun(collected, earlyLeadCmp.names.length);
    const leadingImages = leadingRun.groups.flat();
    const shaped = reshapeGrid(leadingRun.groups, leadingImages, earlyLeadCmp.names);
    if (shaped && leadingRun.groups.length < groups.length) {
      return [{
        rows: shaped.gridRows,
        numCols: shaped.numCols,
        names: finalizeNames(earlyLeadCmp.names),
        anchorEl: earlyLeadCmp.anchorEl,
      }];
    }
  }
  const multiComp = buildMultiCompGrids(container, groups, groupLabels, groupLabelEls, !hasWholeContainerLeadCmp);
  if (multiComp && (!hasWholeContainerLeadCmp || multiComp.length > 1)) {
    return withUncoveredLeadingGallery(container, collected, multiComp);
  }

  const leadingBeforeFooter = buildLeadingComparisonBeforeFooterGrid(container, groups, groupLabels, groupLabelEls, earlyLeadCmp);
  if (leadingBeforeFooter) return leadingBeforeFooter;

  const asd87ArrowGrid = buildAsd87ArrowComparisonGrid(collected);
  if (asd87ArrowGrid) return asd87ArrowGrid;

  collected = trimTrailingFooterSection(trimTrailingLabeledSectionAfterSingleGridLabel(collected));
  ({ groups, groupLabels, groupLabelEls, groupLeadingBreaks } = collected);
  if (hasAdjacentFooterSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img)) {
    return null;
  }
  if (isTorrentScreensGalleryOnly(container, groups, groupLabels)) {
    return torrentViewerGalleryFallback(container, groups, groupLabelEls);
  }
  if (hasImmediatePriorTitleBarrier(container, groups)) {
    return torrentViewerGalleryFallback(container, groups, groupLabelEls);
  }

  // Prefer per-group text labels over page-level headings.
  // Numeric-only labels (1, 2, 37…) are frame/row indices, not source names —
  // each group is already a row, so skip them and let findComparisonNames run.
  let names: string[] | null = null;
  let anchorEl: Node | null = null;
  let forceGenericNames = false;
  const siblingPreviewHeading = hasPreviousSiblingPreviewHeading(container);
  let total = groups.flat().length;
  // Highest precedence: a leading line with an explicit "vs"/"v."/"|" comparison.
  // Only when its column count divides the screenshots — otherwise it is a
  // sub-section line ("2160p UHD vs 1080p BD") in a wider grid (e.g. a 3-wide
  // "UHD/new BD/old BD"), and the real per-group/heading label must still win.
  // A comparison-like title scraped from a quote block / URL blob is unreliable
  // (Holubice 838405). Don't title columns with it — instead remember that this
  // block looked like a comparison but couldn't be titled cleanly, so a
  // torrent-page gallery fallback can offer a 1-wide viewer.
  let ambiguousTitle = false;
  let detailsLinkComparisonOnly = false;
  const leadCmp = earlyLeadCmp;
  const uploaderArrow = asd87ArrowLabelInfo(groupLabels, groupLabelEls);
  if (uploaderArrow) {
    names = uploaderArrow.names;
    anchorEl = uploaderArrow.anchorEl;
    forceGenericNames = isGenericSourceNames(names);
  }
  if (!names && leadCmp && leadCmp.reliable && total % leadCmp.names.length === 0) {
    const technicalInterludeGeneric = hasPlainInterludeAfterTechnicalSizeNames(container, leadCmp.names)
      ? endskyGenericNamesForUntitledGrid(groups, total)
      : null;
    if (technicalInterludeGeneric) {
      names = technicalInterludeGeneric;
      anchorEl = null;
      forceGenericNames = true;
    } else {
      names = leadCmp.names;
      anchorEl = leadCmp.anchorEl;
    }
  } else if (!names && leadCmp && !leadCmp.reliable) {
    ambiguousTitle = true;
  } else if (!names && leadCmp && isTorrentPage() && hasSlowPicsLink(container)) {
    ambiguousTitle = true;
  } else if (!names && !leadCmp && hasBlockedComparisonSignalBeforeImages(container)) {
    ambiguousTitle = true;
  }
  if (!names && groupLabels.length >= 2 && groupLabels.every((l) => l)) {
    const usableLabels = (groupLabels as string[]).filter((label) => !isNonSourceLabel(label));
    if (usableLabels.length === 1) {
      const single = asColumnTitles(usableLabels[0]);
      if (single) names = single;
    }
  }
  if (!names && groupLabels.length >= 2 && groupLabels.every((l) => l)) {
    const labels = groupLabels as string[];
    const allNumeric = labels.every((l) => /^\d+$/.test(l));
    // Each label must be a SINGLE source for the transpose (one group per
    // source). If a label is itself a multi-source list (e.g. a section heading
    // "Source (Carlotta | FRA), Geek, TayTO (TWN)"), these groups are separate
    // comparisons, not columns — don't transpose them.
    const anyMultiSource = labels.some(isMultiSourceLabel);
    const anyNonSource = labels.some(isNonSourceLabel);
    if (!allNumeric && !anyMultiSource && !anyNonSource) {
      names = stripAsymmetricTitle(cleanPerSourceGroupLabels(labels));
    }
  }
  if (!names) {
    const details = leadingDetailsLinkLabelInfo(container, groups);
    if (details?.names) {
      names = details.names;
      anchorEl = details.anchorEl;
      collected = trimToLeadingColumnRun({ groups, groupLabels, groupLabelEls, groupLeadingBreaks }, names.length);
      ({ groups, groupLabels, groupLabelEls, groupLeadingBreaks } = collected);
      total = groups.flat().length;
    } else if (details) {
      detailsLinkComparisonOnly = true;
      anchorEl = details.anchorEl;
    }
  }
  if (!names) {
    const color = namesFromColorSpans(container);
    if (color) {
      if (total % color.length !== 0) {
        const footerIndex = groupLabels.findIndex((label, index) =>
          index > 0 && !!label && isFooterLabel(label));
        if (footerIndex > 0) {
          groups = groups.slice(0, footerIndex);
          groupLabels = groupLabels.slice(0, footerIndex);
          groupLabelEls = groupLabelEls.slice(0, footerIndex);
          groupLeadingBreaks = groupLeadingBreaks.slice(0, footerIndex);
          total = groups.flat().length;
        }
      }
      if (total % color.length === 0) names = color;
    }
  }
  if (!names) {
    const singleLabel = singleGroupLabelInfo(groupLabels, groupLabelEls);
    if (singleLabel) {
      names = singleLabel.names;
      anchorEl = singleLabel.anchorEl;
    }
  }
  if (!names) {
    const leadingBold = leadingBoldLabelInfo(container);
    if (leadingBold) {
      names = leadingBold.names;
      anchorEl = leadingBold.anchorEl;
    }
  }
  if (!names) {
    const structured = leadingStructuredLabelInfo(container, groups);
    if (structured) {
      names = structured.names;
      anchorEl = structured.anchorEl;
    }
  }
  if (!names) {
    const leadingVs = leadingVsLabelInfo(container);
    if (leadingVs) {
      names = leadingVs.names;
      anchorEl = leadingVs.anchorEl;
    }
  }
  if (!names) {
    const showhideLabels = leadingShowhideSourceLabels(container);
    if (showhideLabels && total % showhideLabels.names.length === 0) {
      names = showhideLabels.names;
      anchorEl = showhideLabels.anchorEl;
    }
  }
  if (!names) {
    const implicit = flatImplicitComparisonSourceNames(container, groups, total);
    if (implicit) {
      names = implicit;
      forceGenericNames = true;
    }
  } else {
    const implicit = flatImplicitComparisonSourceNames(container, groups, total);
    if (implicit && hasTorrentLogPollutedNames(names)) {
      names = implicit;
      anchorEl = null;
      forceGenericNames = true;
    }
  }
  if (!names) {
    names = macpCommaCaptionNames(container, groups, total);
  }
  if (!names) {
    const endskyGeneric = endskyGenericNamesForUntitledGrid(groups, total);
    if (endskyGeneric) {
      names = endskyGeneric;
      anchorEl = null;
      forceGenericNames = true;
    }
  }
  if (!names) {
    const previous = previousSiblingColumnTitleInfo(container);
    if (previous && total % previous.names.length === 0) {
      names = previous.names;
      anchorEl = previous.anchorEl;
    }
  }
  if (!names) {
    // The comparison title can be an inline "A vs B" line in the PARENT, directly
    // above this container, with its source names split across sibling elements
    // (color spans + a bold "vs") — which previousSiblingColumnTitleInfo, reading
    // one sibling node at a time, can only see the last fragment of. (UHD vs UHD
    // Hybrid: <span>UHD</span> <strong>vs</strong> <span>UHD Hybrid</span> over a
    // 2-wide grid nested in an inner centered div.) leadingComparisonNamesBeforeContainer
    // assembles the whole introductory line; gated on a clean divide so it can't
    // title an unrelated gallery.
    const parentInlineCmp = leadingComparisonNamesBeforeContainer(container);
    if (parentInlineCmp && total % parentInlineCmp.names.length === 0) {
      names = parentInlineCmp.names;
      anchorEl = parentInlineCmp.anchorEl;
    }
  }
  if (!names && !detailsLinkComparisonOnly && hasLocalNonNameHeading(groupLabels)) {
    // The group label is a non-name heading — a section divider ("Video
    // Bitrate", "General") or a gallery caption. The real column title may sit
    // in the PARENT, on the line directly before this container: a multi-section
    // post whose <pre> groups its shots under sub-section dividers but is titled
    // by a "<strong>FRA | USA | GBR</strong>" just above it (057). Prefer that
    // when it divides the screenshots — it's a tightly-scoped single line, so it
    // can't override an in-container label (which would have set `names` above).
    const parentCmp = leadingComparisonNamesBeforeContainer(container);
    if (parentCmp && total % parentCmp.names.length === 0) {
      names = parentCmp.names;
      anchorEl = parentCmp.anchorEl;
    } else {
      // Otherwise a non-name heading suppresses the grid — except when the only
      // alternative is a slow.pics link, where the ORIGINAL POSTER's H1 title is
      // preferred (owner ruling): use it when its column count divides, else
      // leave it for the slow.pics rescue. A block with NO slow.pics link stays
      // suppressed (e.g. a non-comparison gallery).
      const h1 = isOriginalPost(container) && hasSlowPicsLink(container) ? namesFromHeadings() : null;
      if (h1 && total % h1.length === 0 && looksLikeNames(h1)) {
        names = h1;
      } else {
        if (
          isTorrentPage() &&
          hasSlowPicsLink(container) &&
          !hasAdjacentSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img) &&
          groups.length === 1 &&
          total >= 2
        ) {
          return torrentViewerGalleryFallback(container, groups, groupLabelEls);
        }
        return torrentViewerGalleryFallback(container, groups, groupLabelEls) ?? cmpThreadLargestBlock(container, groups);
      }
    }
  }
  if (!names && siblingPreviewHeading) {
    return null;
  }
  if (!names) {
    const sibling = namesFromSiblingInfo(container);
    if (sibling) {
      names = sibling.names;
      anchorEl = sibling.anchorEl;
    }
  }
  if (!names && !hasPreImageTitleBarrierBeforeFirstScreenshot(container)) {
    names = findComparisonNames(container);
  }
  if (!names && !detailsLinkComparisonOnly && !ambiguousTitle && hasRejectedLeadingColumnTitle(container)) {
    const h1 = isOriginalPost(container) ? namesFromHeadings() : null;
    if (h1 && total % h1.length === 0 && looksLikeNames(h1)) {
      names = h1;
      anchorEl = null;
    } else {
      if (
        isTorrentPage() &&
        hasSlowPicsLink(container) &&
        !hasAdjacentSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img) &&
        groups.length === 1 &&
        total >= 2
      ) {
        return torrentViewerGalleryFallback(container, groups, groupLabelEls);
      }
      return torrentViewerGalleryFallback(container, groups, groupLabelEls);
    }
  }
  if (names && hasTorrentLogPollutedNames(names)) {
    names = null;
    anchorEl = null;
    forceGenericNames = true;
  }
  if (
    names &&
    isTorrentPage() &&
    (
      hasClaimedScreenshotBetween(anchorEl, groups[0]?.[0]?.img, container, excludeImgs) ||
      (!anchorEl && (
        hasClaimedScreenshotBefore(groups[0]?.[0]?.img, container, excludeImgs) ||
        hasPriorScreenshotOutsideGroups(groups, container)
      ))
    )
  ) {
    names = null;
    anchorEl = null;
    forceGenericNames = false;
  }
  // Fall-through to the topic H1: if the chosen local label does NOT divide the
  // screenshots but the original poster's H1 title DOES, the H1 is the real
  // comparison (owner ruling, 2625: a 3-wide "GBR Blu-ray vs GER Blu-ray vs GBR
  // Blu-ray" gamma sub-note over a 4-wide "GBR vs USA vs GER vs AUS" grid).
  if (names && total % names.length !== 0 && isOriginalPost(container)) {
    const h1 = namesFromHeadings();
    if (h1 && total % h1.length === 0 && looksLikeNames(h1)) {
      names = h1;
      anchorEl = null;
    }
  }
  if (names && total % names.length !== 0) {
    const trimmed = trimTrailingGroupsUntilDivisibleWithRemainder(
      { groups, groupLabels, groupLabelEls, groupLeadingBreaks },
      names.length,
    );
    if (hasLargeGapBeforeRemainder(trimmed.remainder)) {
      collected = trimmed.collected;
      const gallery = galleryGridFromGroups(trimmed.remainder);
      if (gallery) trailingGalleries.push(gallery);
      ({ groups, groupLabels, groupLabelEls, groupLeadingBreaks } = collected);
      total = groups.flat().length;
    }
  }
  if (names && total % names.length !== 0 && hasInlineImageFormattingWrapper(container)) {
    collected = trimTrailingGroupsUntilDivisible({ groups, groupLabels, groupLabelEls, groupLeadingBreaks }, names.length);
    ({ groups, groupLabels, groupLabelEls, groupLeadingBreaks } = collected);
    total = groups.flat().length;
  }
  // Every return below must carry the trailing galleries split off above —
  // those screenshots were deliberately separated from the leading section, so
  // even when the leading section itself dies (unshapeable leftovers, an
  // adjacent slow.pics owner), the trailing gallery must still surface instead
  // of leaving its images claimed-but-dead with no control and no click.
  const withTrailing = (grids: Grid[] | null): Grid[] | null => {
    if (grids?.length) return [...grids, ...trailingGalleries];
    return trailingGalleries.length ? [...trailingGalleries] : grids;
  };
  if (
    names?.some((name) => /^comparison$/i.test(name)) &&
    isTorrentPage() &&
    hasSlowPicsLink(container) &&
    !hasAdjacentSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img) &&
    groups.length === 1 &&
    total >= 2
  ) {
    return withTrailing(torrentViewerGalleryFallback(container, groups, groupLabelEls));
  }
  if (
    !names &&
    isTorrentPage() &&
    hasSlowPicsLink(container) &&
    !hasAdjacentSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img) &&
    groups.length === 1 &&
    total >= 2
  ) {
    return withTrailing(torrentViewerGalleryFallback(container, groups, groupLabelEls));
  }
  if (!names && isTorrentPage() && hasAdjacentSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img)) {
    return withTrailing(null);
  }

  const ambiguousGallery = torrentAmbiguousGalleryFallback(
    container,
    groups,
    groupLabelEls,
    total,
    ambiguousTitle,
    excludeImgs,
  );
  if ((!names || isGenericSourceNames(names)) && ambiguousGallery) return withTrailing(ambiguousGallery);

  const shaped = reshapeGrid(groups, groups.flat(), names);
  if (!shaped) {
    // Torrent-page gallery fallback (owner ruling, Holubice 838405): the block
    // looked like a comparison (a vs/| title) but the only title was an
    // unreliable quote/URL blob, so the shots are a single-source SAMPLE
    // gallery, not an A/B comparison. Rather than invent columns or go silent,
    // show them as a 1-wide viewer. Scoped to a single flat image group on a
    // torrent page so it never competes with a real multi-group comparison.
    const adjacentSlowPics = hasAdjacentSlowPicsLinkBeforeImage(container, groups[0]?.[0]?.img);
    if (ambiguousGallery) return withTrailing(ambiguousGallery);
    if (isTorrentPage() && hasSlowPicsLink(container) && !adjacentSlowPics && groups.length === 1 && total >= 2) {
      return withTrailing(torrentViewerGalleryFallback(container, groups, groupLabelEls));
    }
    return withTrailing(torrentViewerGalleryFallback(container, groups, groupLabelEls) ?? cmpThreadLargestBlock(container, groups));
  }

  // Fallback: match strong count to numCols
  if (!names) {
    let el: Element | null = container;
    for (let up = 0; up < 5 && el; up++, el = el.parentElement) {
      const strongs = el.querySelectorAll("strong");
      if (!strongs.length) continue;
      const candidates = [...strongs]
        .map((s) => s.textContent!.trim())
        .filter((t) =>
          t &&
          !/^(comparison|preview|screenshots?)$/i.test(t) &&
          !isNonSourceLabel(t) &&
          !isStructuralReleaseTitleLabel(t));
      if (candidates.length === shaped.numCols) {
        names = candidates;
        break;
      }
    }
  }
  if (names && shaped.numCols === names.length + 1) {
    const hasSourceColor = [...document.querySelectorAll('span[style*="color"]')]
      .some((span) => /^source$/i.test(span.textContent?.trim() || ""));
    if (hasSourceColor) names = ["Source", ...names];
  }

  // No usable source label: fall back to numbered defaults so review sweeps and
  // the viewer never surface a blank source list for a recognized comparison.
  let finalNames = finalizeNames(names);
  if (forceGenericNames && isTorrentPage()) {
    return withTrailing(torrentViewerGalleryFallback(container, groups, groupLabelEls));
  }
  if (!finalNames) {
    if (isTorrentPage()) {
      return withTrailing(torrentViewerGalleryFallback(container, groups, groupLabelEls));
    }
    if (
      !forceGenericNames &&
      !allowGenericNamesForUntitledTorrentGrid(container, groups, groupLabels, detailsLinkComparisonOnly, ambiguousTitle)
    ) {
      return withTrailing(torrentViewerGalleryFallback(container, groups, groupLabelEls));
    }
    finalNames = Array.from({ length: shaped.numCols }, (_, i) => `Source ${i + 1}`);
  }

  return [{ rows: shaped.gridRows, numCols: shaped.numCols, names: finalNames, anchorEl }, ...trailingGalleries];
}

let _grids: { grid: Grid; container: Element }[] | null = null;

/** A block holding ONLY images/links (a bare comparison row) — no label text,
 *  caption, or other markup. External images are allowed: a row is bare as long
 *  as it contains nothing but <a><img> / <img> / <br> / whitespace. */
function isBareImageRow(el: Element): boolean {
  if (!/^(?:DIV|CENTER|P)$/i.test(el.tagName)) return false;
  if (!el.querySelector("img")) return false;
  for (const child of el.children) {
    if (child.tagName === "BR" || child.tagName === "IMG") continue;
    if (child.tagName === "A" && child.querySelector("img")) continue;
    return false; // a label, table, captioned span, or text link → not bare
  }
  for (let node = el.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === Node.TEXT_NODE && (node.textContent || "").trim()) return false;
  }
  return true;
}

/** The adjacent bare-image-row sibling in `dir`, skipping only <br> and
 *  whitespace. Returns null at real text or any non-bare element — the section
 *  boundary that separates one comparison from the next. */
function adjacentBareImageRow(el: Element, dir: "next" | "previous"): Element | null {
  const step = (n: Node): Node | null => (dir === "next" ? n.nextSibling : n.previousSibling);
  for (let node = step(el); node; node = step(node)) {
    if (node.nodeType === Node.TEXT_NODE) {
      if ((node.textContent || "").trim()) return null;
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const e = node as Element;
    if (e.tagName === "BR") continue;
    return isBareImageRow(e) ? e : null;
  }
  return null;
}

/** The full run of adjacent bare image rows `c` belongs to (≥2), in document
 *  order. Bounded by anything that isn't a bare image row — a text line, a
 *  label, a table — so the rows of ONE comparison split across their own
 *  <div align="center"> are gathered, while a label between two galleries keeps
 *  them apart. Returns null when `c` is a standalone row. */
function splitGalleryRun(c: Element): Element[] | null {
  if (!isBareImageRow(c)) return null;
  let first = c;
  for (let p = adjacentBareImageRow(first, "previous"); p; p = adjacentBareImageRow(first, "previous")) {
    first = p;
  }
  const run: Element[] = [];
  for (let d: Element | null = first; d; d = adjacentBareImageRow(d, "next")) run.push(d);
  return run.length >= 2 ? run : null;
}

/** The nearest inline label line above the run's first row (text / <strong> /
 *  <font>), stopping at a block element, image block, or blank line — the "most
 *  adjacent" comparison title. Parsed permissively so "/"-separated and fully
 *  paren-wrapped "(A / B)" titles resolve. */
function splitGalleryLabelNames(firstRow: Element): { names: string[]; anchorEl: ChildNode | null } | null {
  let text = "";
  let el: ChildNode | null = null;
  for (let node: ChildNode | null = firstRow.previousSibling; node; node = node.previousSibling) {
    if (node.nodeName === "BR") {
      if (text.trim()) break;
      continue;
    }
    if (node.nodeType === 1) {
      const e = node as Element;
      if (e.nodeName === "IMG" || e.querySelector?.("img")) break; // a previous gallery
      const frag = e.textContent || "";
      const isBlock = /^(?:DIV|P|PRE|TABLE|BLOCKQUOTE|UL|OL|HR|CENTER)$/.test(e.nodeName);
      if (isBlock) {
        // A block label sits on its own line ("<div>SOURCE vs ENCODE</div>"):
        // take it only when no inline label has accumulated yet, then stop.
        if (text.trim() || !frag.trim()) break;
        text = frag;
        el = e;
        break;
      }
      if (!frag.trim()) continue;
      text = frag + text; // an inline <strong>/<font> fragment of the title line
      el = e;
    } else if (node.nodeType === 3) {
      text = (node.textContent || "") + text;
    }
  }
  const names = asColumnTitles(text);
  return names && names.length >= 2 ? { names, anchorEl: el } : null;
}

/** Build ONE grid from a split-gallery run: each bare row is a grid row, titled
 *  by the nearest preceding label (or generic Source 1..N when none fits). */
function buildSplitGalleryGrid(run: Element[], excludeImgs: Set<HTMLImageElement>): Grid | null {
  const rows: GridCell[][] = [];
  for (const div of run) {
    const row: GridCell[] = [];
    for (const img of div.querySelectorAll<HTMLImageElement>("img")) {
      if (excludeImgs.has(img) || isNonScreenshotImg(img)) continue;
      const anchor = hdbitsImageAnchor(img) ?? img.closest<HTMLAnchorElement>("a[href]");
      const full = isHDBitsScreenshotImage(img)
        ? hdbitsFullForImage(img, anchor)
        : anchor && /\.(jpe?g|png|webp|gif|avif|bmp)(\?|$)/i.test(anchor.href)
          ? anchor.href
          : img.src;
      row.push({ thumb: img.src, full, a: anchor ?? undefined, img });
    }
    if (row.length) rows.push(row);
  }
  if (rows.length < 2) return null;
  const allCells = rows.flat();
  if (allCells.length < 2) return null;
  const label = splitGalleryLabelNames(run[0]);
  const names = label && allCells.length % label.names.length === 0 ? label.names : null;
  const shaped = reshapeGrid(rows, allCells, names);
  if (!shaped) return null;
  const finalNames = finalizeNames(names);
  if (!finalNames && isTorrentPage() && isTorrentDescriptionContainer(run[0])) {
    return galleryGridFromGroups({
      groups: rows,
      groupLabels: rows.map(() => null),
      groupLabelEls: rows.map(() => null),
      groupLeadingBreaks: rows.map(() => 0),
    });
  }
  return {
    rows: shaped.gridRows,
    numCols: shaped.numCols,
    names: finalNames ?? genericSourceNames(shaped.numCols),
    anchorEl: label?.anchorEl ?? null,
  };
}

function hdbGridParseContainer(container: Element): Element {
  while (
    /^(?:STRONG|B|I|EM|U|SPAN|FONT)$/i.test(container.tagName) &&
    container.parentElement &&
    screenshotImagesIn(container).length >= 2 &&
    hasSameLinePreviousSibling(container)
  ) {
    container = container.parentElement;
  }

  const hiddenContent = container.closest("div.div_showhide");
  const label = hiddenContent?.previousElementSibling;
  if (
    !hiddenContent ||
    !label?.matches("label.label_showhide") ||
    !/(?:\||\bvs\.?\s)/i.test(label.textContent || "")
  ) {
    return container;
  }

  return hiddenContent.parentElement || container;
}

export function getGrids(preClaimed?: Set<HTMLImageElement>): { grid: Grid; container: Element }[] {
  if (_grids) return _grids;
  _grids = [];
  const seen = new Set<Element>();
  // Images already emitted in a grid. Containers are visited in image-document
  // order, so an inner wrapper (a <strong>/showhide block of screenshots) is
  // parsed before the enclosing block; the enclosing parse then EXCLUDES those
  // images, so it only emits grids for the still-unclaimed screenshots instead
  // of re-emitting the inner comparison. `preClaimed` seeds this with images the
  // caller handles elsewhere (e.g. slow.pics-linked comparisons), so getGrids
  // skips them entirely.
  const claimed = new Set<HTMLImageElement>(preClaimed);
  for (const img of document.querySelectorAll<HTMLImageElement>("img")) {
    if (!isHDBitsScreenshotImage(img)) continue;
    if (claimed.has(img)) continue;
    const a = hdbitsImageAnchor(img) ?? img.closest<HTMLAnchorElement>("a[href]");
    if (!a) continue;
    const c = a.parentElement;
    if (!c) continue;
    // A single comparison whose rows are each wrapped in their own bare <div>
    // (separated only by <br>) is ONE grid, not one grid per row. Gather the
    // adjacent bare-row run and title it from the nearest preceding label.
    const run = splitGalleryRun(c);
    if (run && !run.some((d) => seen.has(d))) {
      const grid = buildSplitGalleryGrid(run, claimed);
      if (grid) {
        for (const d of run) seen.add(d);
        for (const cell of grid.rows.flat()) if (cell.img) claimed.add(cell.img);
        _grids.push({ grid, container: c });
        continue;
      }
    }
    const parseContainer = hdbGridParseContainer(c);
    if (seen.has(parseContainer)) continue;
    seen.add(parseContainer);
    const parsed = parseGrid(parseContainer, claimed);
    if (parsed) {
      // A successfully-parsed inner container owns its local screenshots, even
      // if one auxiliary group was suppressed. Otherwise those leftovers can
      // leak into an enclosing post parse and hide a later real grid.
      for (const img of screenshotImagesIn(parseContainer)) {
        claimed.add(img);
      }
      for (const grid of parsed) {
        for (const cell of grid.rows.flat()) {
          if (cell.img) claimed.add(cell.img);
        }
        _grids.push({ grid, container: c });
      }
    }
  }
  return _grids;
}
