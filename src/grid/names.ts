// ╔═══════════════════════════════════════════════════════════════════════════╗
// ║  Name-finding strategies                                                  ║
// ╚═══════════════════════════════════════════════════════════════════════════╝

// Reject pipe/vs splits that look like metadata (years, runtimes, dates)
const META_RE = /^(\d{4}|\d+\s*min|[a-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})$/i;
// A bare mediainfo/BDInfo metric value ("69.36 kbps", "48 kHz", "23.976 fps").
// A real source keeps its name ("Amazon (7755 kbps)"). "bit"/"nits" are
// deliberately excluded — "8-bit"/"10-bit"/"130 nits" are legitimate columns.
// Resolutions like "1080p"/"2160p" are also not matched.
const PURE_MEDIAINFO_VALUE_RE = /^\(?\s*[\d.,]+\s*-?\s*(?:kbps|mbps|kb\/s|mb\/s|k?hz|fps)\s*\)?$/i;
export function looksLikeNames(parts: string[]): boolean {
  if (parts.length < 2) return false;
  if (parts.some((p) => META_RE.test(p.trim()))) return false;
  // A MIX of a bare-metric column ("69.36 kbps") and a non-metric column
  // ("Subtitle: English") is a mediainfo/BDInfo table, not a comparison. An
  // all-source set (no metric columns) or an all-metric set (a genuine bitrate
  // comparison) is left alone.
  const metric = parts.map((p) => PURE_MEDIAINFO_VALUE_RE.test(p.trim()));
  if (metric.some(Boolean) && metric.some((m) => !m)) return false;
  return true;
}

const GENERIC_HEADING_PREFIX_RE = /^\s*(?:screenshot\s+comparison|comparison|screenshots?)\s*/i;
// A mediainfo FIELD prefix on a comparison line ("Video: GER … | USA …",
// "Audio: …") merely states what kind of comparison it is — strip it so the
// real source names remain (owner ruling, 2221/2425).
const FIELD_PREFIX_RE = /^\s*(?:video|audio|subtitles?|subs)\s*:\s*/i;
// Comparison separators: "vs", "vs.", "v." — but NOT bare "v" (would match a
// version token). Spaces are required around it in VS_RE so a name's internal
// "v." is left alone.
const VS_RE = /\s+v(?:s\.?|\.)\s+/i;
const VS_TEST = /\bv(?:s\.?|\.)\s/i;
const DASH_RE = /\s+-\s+/;
const SLASH_RE = /\s+\/\s+/;
const TIMES_RE = /\s+×\s+/;
const STRUCTURED_LABEL_SELECTOR = 'span[style*="color"], strong, b';

export interface NameLabelInfo {
  names: string[];
  anchorEl: Element;
}

function cleanNameCandidate(text: string): string {
  return text.replace(GENERIC_HEADING_PREFIX_RE, "").replace(FIELD_PREFIX_RE, "")
    // A dangling leading/trailing "|" left after a comparison URL was dropped
    // ("USA, TWN | https://slow.pics/…" → the link removed → "USA, TWN |").
    .replace(/\s*\|\s*$/, "").replace(/^\s*\|\s*/, "").trim();
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
const FOOTER_LABEL_RE = /^(?:see\s+also|slow\s?\.?\s?pics?|comparisons?|screenshots?|notes?|edit|update|p\.?\s?s\.?|quote|hidden\s+text|spoilers?|click\s+to\s+\w+)\s*:?\s*$/i;
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

// A "Movie Title YEAR …" prefix: ≥1 word, then a standalone 1900-2099 year (NOT
// a parenthesised "(2009)" region year).
const TITLE_YEAR_RE = /^.+?\s(?:19|20)\d{2}(?:\s|$)/;
// A bare source code (region "GBR"/"USA", or a short format like "1080p BD") —
// ≤2 words, ≤14 chars, no parens/sentence clutter.
function isSimpleCode(s: string): boolean {
  const t = s.trim();
  return t.length > 0 && t.length <= 14 && !/[()]/.test(t) &&
    /[A-Za-z0-9]/.test(t) && t.split(/\s+/).length <= 2;
}
// Two codes share a shape when both are pure-alpha (region codes) or both carry
// a digit (resolution/format) — so a trimmed trailing token is only accepted as
// the parallel source code when it actually looks like the reference.
function sameCodeShape(a: string, b: string): boolean {
  const alpha = (s: string) => /^[A-Za-z]+$/.test(s.trim());
  const digit = (s: string) => /\d/.test(s);
  return (alpha(a) && alpha(b)) || (digit(a) && digit(b));
}
/** Strip a shared "Title YEAR …" prefix from columns that carry it ONLY when the
 *  set is ASYMMETRIC — at least one column has the prefix and at least one does
 *  not (owner ruling). Each titled column is trimmed to the trailing tokens that
 *  parallel the short untitled reference column, and the result is accepted only
 *  when every trimmed token is a simple code of the same shape as the reference
 *  ("Betty 1992 1080p Remux GBR" / "USA" → "GBR" / "USA"). Symmetric full
 *  release-name pairs (1313) and long names whose trailing tokens are clutter
 *  ("…(latest madVR test build (113)") are left untouched. */
export function stripAsymmetricTitle(parts: string[]): string[] {
  if (parts.length < 2) return parts;
  const titled = parts.map((p) => TITLE_YEAR_RE.test(p.trim()));
  if (!titled.some(Boolean) || titled.every(Boolean)) return parts;
  const ref = parts[titled.findIndex((t) => !t)].trim();
  if (!isSimpleCode(ref)) return parts;
  const refWords = ref.split(/\s+/).length;
  const out = parts.map((p, i) => {
    if (!titled[i]) return p;
    const words = p.trim().split(/\s+/);
    return words.length > refWords ? words.slice(-refWords).join(" ") : p;
  });
  for (let i = 0; i < parts.length; i++) {
    if (!titled[i]) continue;
    if (out[i] === parts[i] || !isSimpleCode(out[i]) || !sameCodeShape(out[i], ref)) return parts;
  }
  return out;
}

/** Replace every character inside (...) / [...] with a neutral 'x', preserving
 *  length and the brackets themselves — so a separator that lives inside a
 *  parenthesised aside (e.g. the "|" in "Source (Carlotta | FRA)") is invisible
 *  to top-level separator detection. */
function maskParens(s: string): string {
  let depth = 0, out = "";
  for (const ch of s) {
    if (ch === "(" || ch === "[") { depth++; out += ch; }
    else if (ch === ")" || ch === "]") { depth = Math.max(0, depth - 1); out += ch; }
    else out += depth > 0 ? "x" : ch;
  }
  return out;
}

/** Split `s` at TOP-LEVEL occurrences of `sep` (those outside any parens),
 *  located via the parens-masked copy but sliced from the original. Returns null
 *  when there is no top-level occurrence. */
function topLevelSplit(s: string, sep: string | RegExp): string[] | null {
  const mask = maskParens(s);
  const re = typeof sep === "string"
    ? new RegExp(sep.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g")
    : new RegExp(sep.source, sep.flags.includes("g") ? sep.flags : sep.flags + "g");
  const cuts: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(mask)) !== null) {
    cuts.push([m.index, m.index + m[0].length]);
    if (m[0].length === 0) re.lastIndex++;
  }
  if (!cuts.length) return null;
  const parts: string[] = [];
  let last = 0;
  for (const [a, b] of cuts) { parts.push(s.slice(last, a)); last = b; }
  parts.push(s.slice(last));
  return parts;
}

/** True when every ( / [ has a matching close. Top-level separator detection
 *  relies on paren depth, so a malformed/unbalanced label (e.g. a missing close
 *  paren) must fall back to the plain split instead. */
function parensBalanced(s: string): boolean {
  let depth = 0;
  for (const ch of s) {
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") { if (--depth < 0) return false; }
  }
  return depth === 0;
}

function plainSplit(c: string): string[] {
  if (c.includes("|")) return c.split("|");
  if (VS_TEST.test(c)) return c.split(VS_RE);
  if (c.includes(",")) return c.split(",");
  if (DASH_RE.test(c)) return c.split(DASH_RE);
  if (SLASH_RE.test(c)) return c.split(SLASH_RE);
  if (TIMES_RE.test(c)) return c.split(TIMES_RE);
  return [c];
}

export function splitNames(text: string): string[] {
  // Repair a separator "vs" with a missing space on either/both sides
  // ("GERvsUSA", "A vsB", "…Sharp)vsPhantom Thread…") so it is detected. Only a
  // LOWERCASE "vs" bounded by token chars / "(" / ")" is touched, so a name's
  // own "VS" / "AVS" (AviSynth) stays intact.
  const candidate = cleanNameCandidate(text)
    .replace(/([A-Za-z0-9)\]])vs(?=[A-Z(]|\s)/g, "$1 vs ")
    .replace(/(\s)vs(?=[A-Z(])/g, "$1vs ");
  // Prefer a TOP-LEVEL separator (one outside parentheses), but only when the
  // label's parens are balanced (else masking is unreliable). When no top-level
  // separator exists, fall back to a plain split — which lets a paren-enclosed
  // source list like "E01 (DE, ES, FR, UK, US)" split on its inner commas.
  const topLevel = parensBalanced(candidate)
    ? topLevelSplit(candidate, "|") ??
      topLevelSplit(candidate, VS_RE) ??
      topLevelSplit(candidate, ",") ??
      topLevelSplit(candidate, DASH_RE) ??
      topLevelSplit(candidate, SLASH_RE) ??
      topLevelSplit(candidate, TIMES_RE)
    : null;
  let parts = (topLevel ?? plainSplit(candidate)).map(cleanNamePart).filter(Boolean);
  // Strip a "Movie Title (YYYY) - " prefix that clings to the first source when
  // the whole comparison line led with the film name.
  if (parts.length >= 2) parts[0] = stripLeadingMovieTitle(parts[0]);
  // A bare-URL part is an external link, not a source column — drop it.
  parts = parts.filter((p) => !isUrlLabel(p));
  parts = stripAsymmetricTitle(parts);
  return foldFileSizeParts(parts);
}

/** True when the label is itself a list of 2+ sources joined by a TOP-LEVEL
 *  comma or an explicit vs/|/ ÷ separator (e.g. "Source (Carlotta | FRA), Geek,
 *  TayTO (TWN)"). A single source that merely contains a dash ("release - AC3
 *  5.1 - size", the 0835 shape) is NOT multi-source. Used to stop the
 *  per-group-label transpose from treating two SECTION labels as columns. */
export function isMultiSourceLabel(label: string): boolean {
  const c = cleanNameCandidate(label);
  const masked = parensBalanced(c) ? maskParens(c) : c;
  const hasMultiSep =
    masked.includes("|") || VS_TEST.test(masked) || SLASH_RE.test(masked) ||
    TIMES_RE.test(masked) || masked.includes(",");
  if (!hasMultiSep) return false;
  const parts = splitNames(label);
  return parts.length >= 2 && looksLikeNames(parts);
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
      let parts = text.split(VS_RE).map((n) => n.trim());
      parts[0] = stripTitlePrefix(parts[0]);
      parts = stripAsymmetricTitle(parts);
      if (parts.every((p) => p) && looksLikeNames(parts)) return parts;
    }
  }
  return null;
}

/** The thread/topic H1 title describes the ORIGINAL post's comparison, not a
 *  reply's. A reply that re-uses the same screenshots-with-no-local-label shape
 *  must NOT inherit "Movie (2008) GER vs FRA" from the H1 (owner ruling, 1293).
 *  True for the first post, and for non-forum pages (torrent description/comment,
 *  single-post renders) which have no reply structure. */
export function isOriginalPost(container: Element): boolean {
  const posts = [...document.querySelectorAll("td.comment")];
  if (posts.length <= 1) return true;
  const first = posts[0];
  return first === container || first.contains(container) || container.contains(first);
}

export function findComparisonNames(container: Element): string[] | null {
  return (
    namesFromSiblings(container) ||
    namesFromLeadingText(container) ||
    namesFromColorSpans(container) ||
    namesFromLeadingBoldTags(container) ||
    namesFromAncestors(container) ||
    (isOriginalPost(container) ? namesFromHeadings() : null)
  );
}
