// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Name-finding strategies                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Reject pipe/vs splits that look like metadata (years, runtimes, dates)
const META_RE = /^(\d{4}|\d+\s*min|[a-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})$/i;
export function looksLikeNames(parts: string[]): boolean {
  return parts.length >= 2 && !parts.some((p) => META_RE.test(p.trim()));
}

const GENERIC_HEADING_PREFIX_RE = /^\s*(?:screenshot\s+comparison|comparison|screenshots?)\s*/i;
const VS_RE = /\s+vs\.?\s+/i;
const VS_TEST = /\bvs\.?\s/i;
const DASH_RE = /\s+-\s+/;
const SLASH_RE = /\s+\/\s+/;
const TIMES_RE = /\s+×\s+/;
const STRUCTURED_LABEL_SELECTOR = 'span[style*="color"], strong, b';

export interface NameLabelInfo {
  names: string[];
  anchorEl: Element;
}

function cleanNameCandidate(text: string): string {
  return text.replace(GENERIC_HEADING_PREFIX_RE, "").trim();
}

// Strip a leading bbcode/bracket thread-tag such as "[Comparisons] " that
// leaks into the first source label when names are derived from a thread
// title or leading post text. Per project decision we strip ONLY the bracket
// tag — the rest of the label (movie name, year, etc.) is kept verbatim.
const LEADING_TAG_RE = /^\s*\[[^\]]*\]\s*/;

// A forum quote attribution ("Username wrote:") — not a source label.
export function isQuoteAttribution(text: string): boolean {
  return /\bwrote\s*:?\s*$/i.test(text.trim());
}
// A field-label heading ("Short description:", "Long description:") — not a
// source label; the real comparison line usually follows it.
export function isFieldLabel(text: string): boolean {
  return /\bdescription\s*:?\s*$/i.test(text.trim());
}
// A section/footer/structural heading ("See also:", "Slowpics:", "Note:",
// "Quote", "Hidden text", "Spoiler") — never a source label.
const FOOTER_LABEL_RE = /^(?:see\s+also|slow\s?pics?|comparisons?|screenshots?|notes?|edit|update|p\.?\s?s\.?|quote|hidden\s+text|spoilers?|click\s+to\s+\w+)\s*:?\s*$/i;
export function isFooterLabel(text: string): boolean {
  return FOOTER_LABEL_RE.test(text.trim());
}
// A leftover BBCode tag ("[/size]", "[color=red]", "[b]") — never part of a
// source name. Matched by a known tag whitelist so a real fully-bracketed
// label like "[NOR 35036 kbps]" is left untouched.
const BBCODE_TAG_RE = /\s*\[\/?(?:size|colou?r|b|i|u|s|url|quote|spoiler|cent(?:er|re)|left|right|img|font|list|code|hr)(?:=[^\]]*)?\]\s*/gi;
// A bare URL — an external comparison/film link, not a source label.
const PURE_URL_RE = /^https?:\/\/\S+$/i;
export function isUrlLabel(text: string): boolean {
  return PURE_URL_RE.test(text.trim());
}
/** Text that should never be used as a source label. */
export function isNonSourceLabel(text: string): boolean {
  return (
    isQuoteAttribution(text) ||
    isFieldLabel(text) ||
    isFooterLabel(text) ||
    isUrlLabel(text)
  );
}

function cleanNamePart(text: string): string {
  // A source label is a single line; anything after a hard line break is
  // spillover from the next element (most commonly the first screenshot's
  // frame-row index, e.g. "…madVRhdrMeasure165 \n \n \n1").
  let s = text.replace(/[\r\n][\s\S]*$/, "");
  // Strip a leading bracket thread-tag ("[Comparisons] Movie" → "Movie"), but
  // only when text survives — a fully-bracketed label such as "[NOR 35036 kbps]"
  // is itself the source name and must be kept verbatim, brackets included.
  const detagged = s.replace(LEADING_TAG_RE, "");
  if (detagged.trim()) s = detagged;
  // Strip leftover BBCode tags ("PCOK [/size]" → "PCOK").
  s = s.replace(BBCODE_TAG_RE, " ").trim();
  // Drop a trailing link appended to a real label ("Blu-ray https://…" → "Blu-ray")
  // and a stray trailing colon ("Amazon 1080p (8.4Mbps):" → "Amazon 1080p (8.4Mbps)").
  s = s.replace(/\s+https?:\/\/\S+\s*$/i, "");
  s = s.replace(/\s*:\s*$/, "");
  return s.replace(/^-+|-+$/g, "").trim();
}

// A label part that is purely a file size, e.g. "2.46 GB", "5.25 GiB",
// "(1.83 GB)". The size belongs to the source it sits next to — it is not a
// separate comparison column — so it gets folded into the preceding label.
const PURE_SIZE_RE = /^\(?\s*(\d+(?:\.\d+)?\s*[KMGT]i?B)\s*\)?$/i;

function sizeOf(part: string): string | null {
  const m = part.trim().match(PURE_SIZE_RE);
  return m ? m[1].replace(/\s+/g, " ").trim() : null;
}

/** Final tidy applied to EVERY source name, including those from paths that
 *  bypass cleanNamePart (color spans, bold tags, group labels): strip leftover
 *  BBCode, a trailing comparison URL, and a stray trailing colon, and collapse
 *  whitespace runs. Never returns empty (falls back to the trimmed original). */
export function tidyName(s: string): string {
  const t = s
    .replace(BBCODE_TAG_RE, " ")
    .replace(/\s+https?:\/\/\S+\s*$/i, "")
    .replace(/\s*:\s*$/, "")
    // Decorative arrow runs (2+ angle brackets) around a label: "BD <<<<<",
    // ">>>>> AMZN" → "BD" / "AMZN".
    .replace(/^\s*[<>]{2,}\s*/, "")
    .replace(/\s*[<>]{2,}\s*$/, "")
    .replace(/\s+/g, " ")
    .trim();
  return t || s.trim();
}

/** Fold any pure-file-size part into the preceding source label as a
 *  parenthesized suffix:
 *    ["WEBRip NTb … x264", "2.46 GB"] → ["WEBRip NTb … x264 (2.46 GB)"] */
function foldFileSizeParts(parts: string[]): string[] {
  const out: string[] = [];
  for (const p of parts) {
    const size = sizeOf(p);
    if (size && out.length) {
      out[out.length - 1] = `${out[out.length - 1]} (${size})`;
    } else {
      out.push(p);
    }
  }
  return out;
}

/** Fold a trailing file size that is part of a single source label —
 *  "WEBRip … x264 - 2.46 GB" / "WEBRip … x264 2.46 GB" → "WEBRip … x264 (2.46 GB)".
 *  A size already in parentheses is left untouched. */
export function foldTrailingSize(label: string): string {
  const m = label.match(/^(.*\S)[\s-]+(\d+(?:\.\d+)?\s*[KMGT]i?B)\s*$/i);
  if (!m) return label;
  const base = m[1].replace(/\s*[-–]\s*$/, "").trim();
  return base ? `${base} (${m[2].replace(/\s+/g, " ").trim()})` : label;
}

/** Strip a leading "Movie Title (YYYY) - " from the FIRST source of a split
 *  label, e.g. "Blue City (1986) - USA (Vinegar Syndrome)" → "USA (Vinegar
 *  Syndrome)". Only the high-confidence "(4-digit year) - " shape is removed, so
 *  a genuine source like "GER (2009)" (no trailing " - ") is left untouched. */
function stripLeadingMovieTitle(s: string): string {
  const m = s.match(/^.*\(\d{4}\)\s*[-–]\s+(\S.*)$/);
  return m ? m[1].trim() : s;
}

export function splitNames(text: string): string[] {
  const candidate = cleanNameCandidate(text);
  let parts: string[];
  if (candidate.includes("|")) {
    parts = candidate.split("|").map(cleanNamePart).filter(Boolean);
  } else if (VS_TEST.test(candidate)) {
    parts = candidate.split(VS_RE).map(cleanNamePart).filter(Boolean);
  } else if (candidate.includes(",")) {
    parts = candidate.split(",").map(cleanNamePart).filter(Boolean);
  } else if (DASH_RE.test(candidate)) {
    parts = candidate.split(DASH_RE).map(cleanNamePart).filter(Boolean);
  } else if (SLASH_RE.test(candidate)) {
    parts = candidate.split(SLASH_RE).map(cleanNamePart).filter(Boolean);
  } else if (TIMES_RE.test(candidate)) {
    parts = candidate.split(TIMES_RE).map(cleanNamePart).filter(Boolean);
  } else {
    parts = [cleanNamePart(candidate)].filter(Boolean);
  }
  // Strip a "Movie Title (YYYY) - " prefix that clings to the first source when
  // the whole comparison line led with the film name.
  if (parts.length >= 2) parts[0] = stripLeadingMovieTitle(parts[0]);
  // A bare-URL part is an external link, not a source column — drop it.
  parts = parts.filter((p) => !isUrlLabel(p));
  return foldFileSizeParts(parts);
}
export function hasVsOrPipe(text: string): boolean {
  const candidate = cleanNameCandidate(text);
  return candidate.includes("|") || VS_TEST.test(candidate) || candidate.includes(",") || DASH_RE.test(candidate) || SLASH_RE.test(candidate) || TIMES_RE.test(candidate);
}

/** An UNAMBIGUOUS multi-source separator ("X vs Y", "X | Y", "X / Y", "X × Y").
 *  Unlike {@link hasVsOrPipe} this excludes DASH and COMMA, which routinely
 *  appear inside a single source name (e.g. "release - AC3 5.1 - 1.06 GiB",
 *  "Disc Title: X, The" / "45,862 bytes"). Used to decide when a per-group
 *  label introduces a *separate* comparison vs. is itself one source column of
 *  a single transposed grid. */
export function hasExplicitComparison(text: string): boolean {
  const candidate = cleanNameCandidate(text);
  return candidate.includes("|") || VS_TEST.test(candidate) || SLASH_RE.test(candidate) || TIMES_RE.test(candidate);
}

// ── Name-finding sub-strategies ──

/** Scan bold tags (reverse order) for vs/pipe labels, skipping links */
export function namesFromBoldTags(tags: Element[]): string[] | null {
  for (let i = tags.length - 1; i >= 0; i--) {
    if (tags[i].closest("a")) continue;
    const text = tags[i].textContent!.trim();
    if (isNonSourceLabel(text)) continue;
    if (hasVsOrPipe(text)) {
      const p = splitNames(text);
      if (looksLikeNames(p)) return p;
    }
  }
  return null;
}

/** Strategy 1: preceding siblings' bold tags */
export function namesFromSiblings(container: Element): string[] | null {
  let sib = container.previousElementSibling;
  for (let steps = 0; steps < 8 && sib; steps++, sib = sib.previousElementSibling) {
    if (sib.nodeName === "BR") continue;
    const tags: Element[] = sib.matches?.("strong, b") ? [sib] : [];
    tags.push(...(sib.querySelectorAll?.("strong, b") || []));
    const found = namesFromBoldTags(tags);
    if (found) return found;
  }
  return null;
}

/** Strategy 2: container's leading text (text nodes + non-image links) */
export function namesFromLeadingText(container: Element): string[] | null {
  let leadingText = "";
  for (const node of container.childNodes) {
    if (node.nodeName === "A") {
      if ((node as Element).querySelector("img")) break;
      leadingText += node.textContent;
    } else if (node.nodeType === 3) {
      leadingText += node.textContent;
    } else if (node.nodeName === "BR") {
      leadingText += " ";
    } else {
      break;
    }
  }
  leadingText = leadingText.trim();
  if (leadingText && hasVsOrPipe(leadingText)) {
    const parts = splitNames(leadingText);
    if (looksLikeNames(parts)) return parts;
  }
  return null;
}

/** Strategy 2b: color-coded span labels */
export function namesFromColorSpans(container: Element): string[] | null {
  const colorSpans = [...container.querySelectorAll('span[style*="color"]')];
  if (colorSpans.length >= 2) {
    const csNames = colorSpans
      .map((s) => s.textContent!.trim())
      .filter(Boolean);
    if (csNames.length >= 2) return csNames;
  }
  return null;
}

function leadingStructuredLabelNodes(container: Element): Element[] {
  const labels: Element[] = [];
  for (const node of container.childNodes) {
    if (node.nodeType !== 1) continue;
    const el = node as Element;
    if (el.matches("a") && el.querySelector("img")) break;
    if (el.querySelector("a img, img")) break;

    if (el.matches(STRUCTURED_LABEL_SELECTOR)) {
      if (!isNonSourceLabel(el.textContent!.trim())) labels.push(el);
      continue;
    }

    const nested = [...el.querySelectorAll(STRUCTURED_LABEL_SELECTOR)]
      .filter((candidate) => !candidate.parentElement?.closest(STRUCTURED_LABEL_SELECTOR))
      .filter((candidate) => !isNonSourceLabel(candidate.textContent!.trim()));
    labels.push(...nested);
  }
  return labels;
}

export function namesFromLeadingStructuredLabels(container: Element, expectedCount: number): NameLabelInfo | null {
  const labels = leadingStructuredLabelNodes(container);
  if (labels.length !== expectedCount) return null;

  const names = labels
    .map((label) => label.textContent!.trim())
    .filter(Boolean);
  if (names.length !== expectedCount || !looksLikeNames(names)) return null;

  return { names, anchorEl: labels[labels.length - 1] };
}

/** Strategy 2c: bold/strong tags that are direct children of the container
 *  appearing before the first image link — these are inline source labels */
export function namesFromLeadingBoldTags(container: Element): string[] | null {
  const bolds: string[] = [];
  for (const node of container.childNodes) {
    if (node.nodeName === "A" && (node as Element).querySelector("img")) break;
    if (node.nodeName === "STRONG" || node.nodeName === "B") {
      const t = node.textContent!.trim();
      if (t && !isNonSourceLabel(t)) bolds.push(t);
    }
  }
  return bolds.length >= 2 ? bolds : null;
}

/** Strategy 3: bold tags in ancestor elements */
export function namesFromAncestors(container: Element): string[] | null {
  let el: Element | null = container;
  for (let up = 0; up < 8 && el; up++, el = el.parentElement) {
    const tags = [...el.querySelectorAll("strong, b")];
    if (tags.length) {
      const found = namesFromBoldTags(tags);
      if (found) return found;
    }
  }
  return null;
}

/** Strip movie title prefix from an H1 heading text. A leading bbcode/bracket
 *  thread-tag ("[Comparisons] ") is always removed first; the remaining
 *  movie-name/year prefix is left intact per project decision. */
function stripTitlePrefix(text: string): string {
  const tagless = text.replace(LEADING_TAG_RE, "");
  const dash = tagless.lastIndexOf(" - ");
  if (dash >= 0) return tagless.substring(dash + 3).trim();
  const ym = tagless.match(/\(\d{4}\)\s*/);
  if (ym) {
    const after = tagless.substring(ym.index! + ym[0].length).trim();
    if (after) return after;
  }
  return tagless.trim();
}

/** Strategy 4: H1 headings (forum comparison threads) */
export function namesFromHeadings(): string[] | null {
  for (const h1 of document.querySelectorAll("h1")) {
    let text = h1.textContent!.trim();
    const gt = text.lastIndexOf(">");
    if (gt >= 0) text = text.substring(gt + 1).trim();

    if (text.includes("|")) {
      const label = stripTitlePrefix(text);
      if (label.includes("|")) {
        const parts = splitNames(label);
        if (parts.every((p) => p) && looksLikeNames(parts)) return parts;
      }
    }

    if (VS_TEST.test(text)) {
      const parts = text.split(VS_RE).map((n) => n.trim());
      parts[0] = stripTitlePrefix(parts[0]);
      if (parts.every((p) => p) && looksLikeNames(parts)) return parts;
    }
  }
  return null;
}

export function findComparisonNames(container: Element): string[] | null {
  return (
    namesFromSiblings(container) ||
    namesFromLeadingText(container) ||
    namesFromColorSpans(container) ||
    namesFromLeadingBoldTags(container) ||
    namesFromAncestors(container) ||
    namesFromHeadings()
  );
}
